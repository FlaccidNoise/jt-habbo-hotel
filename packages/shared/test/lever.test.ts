import { expect, test } from "vitest";
import { CATALOG_PRICES } from "../src/furni.ts";
import {
  LEVER_COST,
  LEVER_PRIZES,
  LEVER_TOTAL_WEIGHT,
  leverDraw,
  leverOdds,
} from "../src/lever.ts";

test("the draw covers the whole table and nothing else", () => {
  const seen = new Set<string>();
  for (let i = 0; i < LEVER_TOTAL_WEIGHT; i++) {
    seen.add(leverDraw(i / LEVER_TOTAL_WEIGHT).label);
  }
  expect(seen.size).toBe(LEVER_PRIZES.length);
});

test("each prize wins in proportion to its published weight", () => {
  const counts = new Map<string, number>();
  const n = 100_000;
  for (let i = 0; i < n; i++) {
    const label = leverDraw(i / n).label;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  for (const prize of LEVER_PRIZES) {
    const share = (counts.get(prize.label) ?? 0) / n;
    expect(Math.abs(share - prize.weight / LEVER_TOTAL_WEIGHT), prize.label).toBeLessThan(0.001);
  }
});

// The odds shown to the player and the odds drawn from are one table, so "published odds" cannot
// drift from real ones (GAME.md §Sinks). This asserts they are literally the same numbers.
test("the published odds are the draw weights", () => {
  const published = leverOdds();
  expect(published).toHaveLength(LEVER_PRIZES.length);
  for (const [i, row] of published.entries()) {
    const prize = LEVER_PRIZES[i]!;
    expect(row.label).toBe(prize.label);
    expect(row.percent).toBe(`${((prize.weight / LEVER_TOTAL_WEIGHT) * 100).toFixed(1)}%`);
  }
  expect(published.reduce((n, r) => n + Number.parseFloat(r.percent), 0)).toBeCloseTo(100, 0);
});

test("out-of-range rolls stay inside the table", () => {
  expect(leverDraw(-1).label).toBe(LEVER_PRIZES[0]?.label);
  expect(leverDraw(1).label).toBe(LEVER_PRIZES.at(-1)?.label);
  expect(leverDraw(0.999999999).label).toBe(LEVER_PRIZES.at(-1)?.label);
});

// The point of the lever: it has to absorb Stars, not hand them back. Prizes are valued at their
// catalog price; the two lever-only items have none, so they are valued at their base item's.
test("the lever is a net sink at the published odds", () => {
  const value = (defId: string | null): number => {
    if (defId === null) return 0;
    const priced = CATALOG_PRICES.get(defId);
    if (priced !== undefined) return priced;
    // Lever-only colorways share their base's mesh, so the base's price is the fair comparison.
    const base = defId.replace(/_(plum|gilded)$/, "");
    return CATALOG_PRICES.get(base) ?? 0;
  };
  const expected =
    LEVER_PRIZES.reduce((n, p) => n + p.weight * value(p.defId), 0) / LEVER_TOTAL_WEIGHT;
  expect(expected).toBeLessThan(LEVER_COST);
  // Stingy enough to drain, generous enough that pulling is not obviously pointless.
  expect(expected / LEVER_COST).toBeGreaterThan(0.15);
  expect(expected / LEVER_COST).toBeLessThan(0.5);
});

test("most pulls lose, but not almost all of them", () => {
  const blank = LEVER_PRIZES.find((p) => p.defId === null)?.weight ?? 0;
  const winRate = 1 - blank / LEVER_TOTAL_WEIGHT;
  expect(winRate).toBeGreaterThan(0.2);
  expect(winRate).toBeLessThan(0.5);
});
