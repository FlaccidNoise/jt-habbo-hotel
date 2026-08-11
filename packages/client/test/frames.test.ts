import { describe, expect, test } from "vitest";
import { frameFor, occluderFor } from "../src/scene/frames.ts";
import type { FurniMeta } from "../src/scene/frames.ts";

// A 2×1 table sheet at scale 64: anchorX alternates with the footprint span per dir.
const META: FurniMeta = {
  sheet: "table_basic.png",
  frameW: 96,
  frameH: 80,
  dirs: [0, 2, 4, 6],
  anchorsX: [32, 64, 32, 64],
  anchorY: 48,
};

const SEAT: FurniMeta = {
  ...META,
  occlusion: [{ x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 }, null, null, null],
};

describe("frameFor", () => {
  test("selects the frame rect and anchor offset for each dir", () => {
    expect(frameFor(META, 0)).toEqual({ x: 0, y: 0, w: 96, h: 80, offsetX: -32, offsetY: -48 });
    expect(frameFor(META, 4)).toEqual({ x: 192, y: 0, w: 96, h: 80, offsetX: -32, offsetY: -48 });
    expect(frameFor(META, 6)).toEqual({ x: 288, y: 0, w: 96, h: 80, offsetX: -64, offsetY: -48 });
  });

  test("a dir the sheet does not carry renders nothing rather than the wrong frame", () => {
    expect(frameFor(META, 3)).toBeNull();
  });

  test("a state picks its own row, and the anchor does not move with it (#430)", () => {
    const states: FurniMeta = { ...META, states: 4 };
    expect(frameFor(states, 2, 3)).toEqual({ x: 96, y: 240, w: 96, h: 80, offsetX: -64, offsetY: -48 });
  });

  test("a sheet with no authored states draws row 0 whatever state the item is in", () => {
    // A lamp's "on" is a glow the client paints over the same frame, not a second frame.
    expect(frameFor(META, 0, 1)).toEqual(frameFor(META, 0, 0));
    expect(frameFor({ ...META, states: 4 }, 0, 9)).toEqual(frameFor(META, 0, 0));
  });
});

describe("occluderFor", () => {
  test("the seat-occluder row follows the last state row rather than sitting at row 1 (#430)", () => {
    expect(occluderFor(SEAT, 0)?.frame.y).toBe(80);
    expect(occluderFor({ ...SEAT, states: 4 }, 0)?.frame.y).toBe(320);
  });

  test("a dir with nothing in front of a sitter has no front half", () => {
    expect(occluderFor(SEAT, 2)).toBeNull();
  });
});
