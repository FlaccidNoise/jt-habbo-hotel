import { expect, test } from "vitest";
import {
  WHEEL_LAYOUT,
  WHEEL_MAX_MULTIPLIER,
  WHEEL_MAX_STAKE,
  WHEEL_MIN_STAKE,
  WHEEL_SEGMENTS,
  wheelDraw,
  wheelOdds,
} from "../src/wheel.ts";

const counts = (): Map<string, number> => {
  const n = new Map<string, number>();
  for (const id of WHEEL_LAYOUT) n.set(id, (n.get(id) ?? 0) + 1);
  return n;
};

test("the wheel face is 24 slots and every one is a real segment", () => {
  expect(WHEEL_LAYOUT).toHaveLength(24);
  for (const id of WHEEL_LAYOUT) expect(WHEEL_SEGMENTS[id], id).toBeDefined();
  expect([...counts().keys()].sort()).toEqual(Object.keys(WHEEL_SEGMENTS).sort());
});

// The odds shown to the player and the wheel drawn from are one object, so "published odds" cannot
// drift from real ones (GAME.md §Sinks). This asserts they are literally the same numbers.
test("the published odds are the slot counts", () => {
  const published = wheelOdds();
  expect(published).toHaveLength(Object.keys(WHEEL_SEGMENTS).length);
  for (const row of published) {
    const segment = WHEEL_SEGMENTS[row.id]!;
    expect(row.label).toBe(segment.label);
    expect(row.multiplier).toBe(segment.multiplier);
    expect(row.percent).toBe(`${((counts().get(row.id)! / 24) * 100).toFixed(1)}%`);
  }
  expect(published.reduce((n, r) => n + Number.parseFloat(r.percent), 0)).toBeCloseTo(100, 0);
});

// The house edge is the whole reason the wheel is safe to run: it is house-banked, so a segment
// that pays fair or better is a faucet nobody budgeted. A table edit that makes one so fails here.
test("every segment returns 75–90% of the stake, and none of them is fair", () => {
  for (const [id, segment] of Object.entries(WHEEL_SEGMENTS)) {
    const rtp = (segment.multiplier * counts().get(id)!) / 24;
    expect(rtp, id).toBeLessThan(1);
    expect(rtp, id).toBeGreaterThanOrEqual(0.75);
    expect(rtp, id).toBeLessThanOrEqual(0.9);
  }
});

// The spectacle side of the same table: a wheel whose common colour rarely lands is a wheel nobody
// watches, and one whose rare slots cluster reads as rigged wherever the pointer stops.
test("the common colour lands often and no two rare slots sit together", () => {
  expect(counts().get("crimson")! / 24).toBeGreaterThan(0.4);
  const rare = (slot: number): boolean => WHEEL_SEGMENTS[WHEEL_LAYOUT[slot]!]!.multiplier >= 5;
  for (let slot = 0; slot < 24; slot++) {
    expect(rare(slot) && rare((slot + 1) % 24), `slots ${slot} and ${(slot + 1) % 24}`).toBe(false);
  }
});

test("the draw indexes the wheel face and clamps outside it", () => {
  expect(wheelDraw(0)).toEqual({ slot: 0, segment: WHEEL_LAYOUT[0] });
  expect(wheelDraw(0.999999999)).toEqual({ slot: 23, segment: WHEEL_LAYOUT[23] });
  expect(wheelDraw(0.5)).toEqual({ slot: 12, segment: WHEEL_LAYOUT[12] });
  expect(wheelDraw(7.5 / 24)).toEqual({ slot: 7, segment: "gold" });
  expect(wheelDraw(-1)).toEqual({ slot: 0, segment: WHEEL_LAYOUT[0] });
  expect(wheelDraw(1)).toEqual({ slot: 23, segment: WHEEL_LAYOUT[23] });
  // Every slot is reachable — no gap the wheel can never stop on.
  const slots = new Set<number>();
  for (let i = 0; i < 24; i++) slots.add(wheelDraw((i + 0.5) / 24).slot);
  expect(slots.size).toBe(24);
});

// The payout bound the settlement trusts: stake × this, and nothing on the wheel pays more.
test("the max multiplier bounds the whole table", () => {
  expect(WHEEL_MAX_MULTIPLIER).toBe(20);
  for (const segment of Object.values(WHEEL_SEGMENTS)) {
    expect(segment.multiplier).toBeLessThanOrEqual(WHEEL_MAX_MULTIPLIER);
  }
  expect(WHEEL_MAX_STAKE * WHEEL_MAX_MULTIPLIER).toBe(2000);
  expect(WHEEL_MIN_STAKE).toBeLessThan(WHEEL_MAX_STAKE);
});
