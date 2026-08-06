import { describe, expect, test } from "vitest";
import { parseFigure, resolvedKey } from "@grand/shared";
import { cellOrigin, frameRow } from "../src/scene/figure.ts";

const FRAMES = ["stand", "walk0", "walk1", "walk2", "walk3", "sit", "wave0", "wave1"];
const META = { frameW: 64, frameH: 112 };

describe("figure sheet layout", () => {
  test("dirs run across, frames run down", () => {
    expect(cellOrigin(META, FRAMES, "stand", 0)).toEqual({ x: 0, y: 0 });
    expect(cellOrigin(META, FRAMES, "stand", 7)).toEqual({ x: 448, y: 0 });
    expect(cellOrigin(META, FRAMES, "sit", 3)).toEqual({ x: 192, y: 560 });
    expect(cellOrigin(META, FRAMES, "wave1", 7)).toEqual({ x: 448, y: 784 });
  });

  test("an unknown frame falls back to standing rather than off the sheet", () => {
    // Reading past the sheet gives transparent garbage; standing still is merely wrong.
    expect(frameRow(FRAMES, "dance")).toBe(0);
    expect(cellOrigin(META, FRAMES, "dance", 2)).toEqual({ x: 128, y: 0 });
  });

  test("every authored frame has its own row", () => {
    const rows = FRAMES.map((f) => frameRow(FRAMES, f));
    expect(new Set(rows).size).toBe(FRAMES.length);
  });
});

describe("the bake cache key", () => {
  // The texture cache keys on the RESOLVED stack, so hidden layers cannot split the cache. Two
  // players in the same hat with different hair under it must share one GPU texture.
  const base = "v1|hd-2-skin_3.ch-5-crimson.lg-7-navy";

  test("hidden hair does not split the cache", () => {
    const a = resolvedKey(parseFigure(`${base}.hr-3-walnut.ha-10-gold`));
    const b = resolvedKey(parseFigure(`${base}.hr-4-teal.ha-10-gold`));
    expect(a).toBe(b);
  });

  test("visible differences still split it", () => {
    const bare = resolvedKey(parseFigure(`${base}.hr-3-walnut`));
    const other = resolvedKey(parseFigure(`${base}.hr-4-walnut`));
    expect(bare).not.toBe(other);
    const hatted = resolvedKey(parseFigure(`${base}.hr-3-walnut.ha-10-gold`));
    expect(hatted).not.toBe(bare);
  });
});
