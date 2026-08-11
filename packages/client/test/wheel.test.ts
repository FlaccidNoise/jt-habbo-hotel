import { Container, Sprite, Texture, TextureSource } from "pixi.js";
import { describe, expect, test } from "vitest";
import { WHEEL_LAYOUT, WHEEL_MAX_STAKE, WHEEL_MIN_STAKE } from "@grand/shared";
import type { FurniDef, FurniItem, ServerMsg } from "@grand/shared";
import type { FurniAssets } from "../src/scene/assets.ts";
import { SEGMENT_COLOR, WHEEL_SPIN_MS, spinFrame, spinSlot } from "../src/scene/effects.ts";
import type { FurniMeta } from "../src/scene/frames.ts";
import { FurniLayer } from "../src/scene/furni.ts";
import { DepthIndex } from "../src/scene/sort.ts";
import {
  betMessage, clampStake, emptyWheel, outcomeText, revealText, segmentRows, wheelView,
} from "../src/ui/wheel.ts";
import type { WheelState } from "../src/ui/wheel.ts";

// The bet panel's contract with the player is what it offers and what it refuses to send; the
// spin's contract is that it stops where the server said. Both are DOM-free here, the way the
// creator's halves are — the client suite has no document.

type WheelResult = Extract<ServerMsg, { t: "wheel_result" }>;

const RESULT: WheelResult = {
  t: "wheel_result", itemId: 7, accountId: 3, name: "Ada",
  betSegment: "crimson", resultSegment: "crimson", slot: 1, stake: 50, payout: 100,
};

const open = (change: Partial<WheelState> = {}): WheelState =>
  ({ ...emptyWheel(), itemId: 7, ...change });

describe("the bet panel", () => {
  test("offers every segment on the wheel, with the odds counted off its face", () => {
    const rows = segmentRows();
    expect(rows.map((r) => r.id)).toEqual(["crimson", "fern", "plum", "gold", "grand"]);
    expect(rows.map((r) => r.odds)).toEqual([
      "×2 · 41.7%", "×3 · 29.2%", "×5 · 16.7%", "×10 · 8.3%", "×20 · 4.2%",
    ]);
    // 10 crimson slots of 24 is the 41.7% above — the published number and the wheel are one list.
    expect(WHEEL_LAYOUT.filter((s) => s === "crimson").length).toBe(10);
    expect(rows.every((r) => SEGMENT_COLOR.has(r.id))).toBe(true);
  });

  test("the empty panel names what it is waiting for rather than dangling a dead SPIN", () => {
    const view = wheelView(open(), 500);
    expect(view.note).toBe("Pick a colour to back.");
    expect(view.canSpin).toBe(false);
  });

  test("too few Stars says so, and says the smallest stake there is", () => {
    expect(wheelView(open(), 4).note)
      .toBe(`The smallest stake is ${WHEEL_MIN_STAKE} ★ — you have 4.`);
    expect(wheelView(open({ pick: "crimson", stake: 100 }), 40).note)
      .toBe("That stake needs 100 ★ — you have 40.");
    expect(wheelView(open({ pick: "crimson", stake: 100 }), 40).canSpin).toBe(false);
    expect(wheelView(open({ pick: "crimson", stake: 100 }), 100).canSpin).toBe(true);
  });

  test("a server refusal is what the panel shows, ahead of any hint of its own", () => {
    const refused = open({ pick: "crimson", note: "the wheel is still settling — 3s" });
    expect(wheelView(refused, 500).note).toBe("the wheel is still settling — 3s");
  });

  test("an unresolved spin holds SPIN and the stake buttons down", () => {
    const spinning = open({ pick: "gold", stake: 50, pending: true });
    const view = wheelView(spinning, 500);
    expect(view.note).toBe("Spinning…");
    expect([view.canSpin, view.canRaise, view.canLower]).toEqual([false, false, false]);
  });

  test("the stake control cannot leave the house's bounds", () => {
    expect(clampStake(0)).toBe(WHEEL_MIN_STAKE);
    expect(clampStake(WHEEL_MAX_STAKE + 500)).toBe(WHEEL_MAX_STAKE);
    expect(clampStake(37.6)).toBe(38);
    expect(wheelView(open({ stake: WHEEL_MIN_STAKE }), 500).canLower).toBe(false);
    expect(wheelView(open({ stake: WHEEL_MAX_STAKE }), 500).canRaise).toBe(false);
  });

  test("the bet it sends carries the clamped stake, whatever the state held", () => {
    expect(betMessage(7, "grand", 5000)).toEqual(
      { t: "wheel_bet", itemId: 7, segment: "grand", stake: WHEEL_MAX_STAKE });
    expect(betMessage(7, "crimson", 1)).toEqual(
      { t: "wheel_bet", itemId: 7, segment: "crimson", stake: WHEEL_MIN_STAKE });
  });
});

describe("the reveal", () => {
  test("a win is announced to the room by name, payout and colour", () => {
    expect(revealText(RESULT)).toBe("Ada wins 100 ★ on Crimson");
    expect(revealText({ ...RESULT, resultSegment: "grand", payout: 1000 }))
      .toBe("Ada wins 1000 ★ on The Grand");
  });

  test("a loss names the colour that came up and nothing else", () => {
    expect(revealText({ ...RESULT, resultSegment: "fern", payout: 0 })).toBe("Fern — no win");
  });

  test("the bettor's own panel is written to them, not about them", () => {
    expect(outcomeText(RESULT)).toBe("Crimson — you win 100 ★");
    expect(outcomeText({ ...RESULT, resultSegment: "plum", payout: 0 }))
      .toBe("Plum — no win. Spin again?");
  });
});

describe("the spin", () => {
  test("every slot the server can draw is the slot the animation stops on", () => {
    for (let slot = 0; slot < WHEEL_LAYOUT.length; slot++) {
      expect(spinSlot(1, slot)).toBe(slot);
      expect(spinSlot(1.4, slot)).toBe(slot);   // a late frame still holds the drawn slot
    }
  });

  test("it starts at the top of the wheel and turns whole times round", () => {
    expect(spinSlot(0, 17)).toBe(0);
    const seen = new Set<number>();
    for (let i = 0; i <= 400; i++) seen.add(spinSlot(i / 400, 17));
    expect(seen.size).toBe(WHEEL_LAYOUT.length);   // every slot is passed on the way
  });

  test("it decelerates: the last fifth of the time covers a handful of slots", () => {
    const steps = (from: number, to: number): number => {
      let count = 0;
      let last = spinSlot(from, 5);
      for (let i = 1; i <= 200; i++) {
        const slot = spinSlot(from + ((to - from) * i) / 200, 5);
        if (slot !== last) count++;
        last = slot;
      }
      return count;
    };
    expect(steps(0, 0.2)).toBeGreaterThan(40);
    expect(steps(0.8, 1)).toBeLessThan(6);
  });

  test("the reveal waits for the wheel, so the announcement cannot beat the slot it names", () => {
    expect(WHEEL_SPIN_MS).toBeGreaterThanOrEqual(3000);
    expect(WHEEL_SPIN_MS).toBeLessThanOrEqual(4000);
  });
});

// The sprite's own half of the spin (#430). The marker above is drawn over the wheel; these four
// frames are the wheel, and the server sends nothing about either — a spun wheel stays in state 0
// as far as the room is concerned.

const WHEEL_H = 164;

const WHEEL_DEFS: ReadonlyMap<string, FurniDef> = new Map([["grand_wheel", {
  id: "grand_wheel", name: "Grand Wheel", theme: "casino", w: 2, l: 1,
  stackHeights: [3.625, 3.625, 3.625, 3.625], canWalk: false, canStackOn: false,
  seatHeight: null, color: 0xaa3333, interaction: "wheel",
}]]);

const WHEEL_ITEM: FurniItem = { id: 7, defId: "grand_wheel", x: 2, y: 2, z: 0, dir: 0, state: 0 };

/** The shipped bundle's geometry: four dirs across, four states down. Nothing is rendered here —
 *  the texture is a descriptor and is never uploaded. */
function wheelAssets(states?: number): FurniAssets {
  const meta: FurniMeta = {
    sheet: "grand_wheel.png", frameW: 96, frameH: WHEEL_H,
    dirs: [0, 2, 4, 6], anchorsX: [32, 64, 32, 64], anchorY: 132, states,
  };
  const base = new Texture({ source: new TextureSource({ width: 384, height: WHEEL_H * 4 }) });
  return new Map([["grand_wheel", { base, meta, frames: new Map(), near: null, nearFrames: new Map() }]]);
}

function spinning(states?: number): { row: () => number; layer: FurniLayer } {
  const world = new Container();
  const layer = new FurniLayer(world, WHEEL_DEFS, wheelAssets(states), new DepthIndex());
  layer.apply(WHEEL_ITEM);
  return { layer, row: () => (world.children[0] as Sprite).texture.frame.y / WHEEL_H };
}

describe("the face", () => {
  test("it comes to rest on the state the item is in, at both ends of the curve", () => {
    expect(spinFrame(0, 4)).toBe(0);
    expect(spinFrame(1, 4)).toBe(0);
    expect(spinFrame(1.4, 4)).toBe(0);   // a late frame settles rather than wrapping on
  });

  test("it passes every state the sheet carries, and decelerates like the marker", () => {
    const seen = new Set<number>();
    for (let i = 0; i <= 400; i++) seen.add(spinFrame(i / 400, 4));
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);

    const steps = (from: number, to: number): number => {
      let count = 0;
      let last = spinFrame(from, 4);
      for (let i = 1; i <= 200; i++) {
        const state = spinFrame(from + ((to - from) * i) / 200, 4);
        if (state !== last) count++;
        last = state;
      }
      return count;
    };
    expect(steps(0, 0.2)).toBeGreaterThan(steps(0.8, 1) * 4);
  });

  test("a turning wheel walks the sheet's rows and settles back on row 0", () => {
    const { layer, row } = spinning(4);
    expect(row()).toBe(0);

    layer.spin(WHEEL_ITEM.id, 0);
    const seen = new Set<number>();
    for (let i = 0; i < 200; i++) {
      layer.update((WHEEL_SPIN_MS * i) / 200);
      seen.add(row());
    }
    expect([...seen].sort()).toEqual([0, 1, 2, 3]);

    layer.update(WHEEL_SPIN_MS);
    expect(row()).toBe(0);
  });

  test("a bundle with no state frames spins as the overlay alone, never off the end of its sheet", () => {
    const { layer, row } = spinning();
    layer.spin(WHEEL_ITEM.id, 0);
    for (let i = 0; i <= 200; i++) {
      layer.update((WHEEL_SPIN_MS * i) / 200);
      expect(row()).toBe(0);
    }
  });
});
