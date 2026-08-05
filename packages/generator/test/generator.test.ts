import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { PROTOTYPE_CATALOG } from "@grand/shared";
import { FROZEN_DIR, bundleFor } from "../src/catalog.ts";
import { render } from "../src/compose.ts";
import type { BundleMeta } from "../src/compose.ts";
import { decodePng, encodePng } from "../src/png.ts";
import {
  gateBounds,
  gateContrast,
  gateFootprint,
  gatePalette,
  gateUniqueness,
  runGates,
} from "../src/gates.ts";
import { makeCanvas, putPixel } from "../src/raster.ts";
import { recipeHash } from "../src/recipe.ts";
import type { Recipe } from "../src/recipe.ts";
import { STARTER_RECIPES } from "../src/starter.ts";
import { FLOOR_TONES, PALETTE, RAMP_NAMES, RAMP_SHADES } from "../src/style.ts";

const CHAIR_DEF = PROTOTYPE_CATALOG.find((d) => d.id === "chair_basic");
const CHAIR_RECIPE = STARTER_RECIPES.get("chair_basic");
if (!CHAIR_DEF || !CHAIR_RECIPE) throw new Error("starter chair is missing");

function chairBundle() {
  return render(CHAIR_DEF!, CHAIR_RECIPE!);
}

describe("determinism", () => {
  test("the same recipe renders byte-identical pixels", () => {
    expect(chairBundle().meta.pixelHash).toBe(chairBundle().meta.pixelHash);
  });

  test("every catalog bundle matches the committed frozen catalog", () => {
    // The bundle is the item's identity. An intentional style change must regenerate the
    // committed assets (pnpm --filter @grand/generator generate) — a silent drift is an error.
    const committed = JSON.parse(
      readFileSync(new URL("../../client/public/furni/catalog.json", import.meta.url), "utf8"),
    ) as { defs: Record<string, BundleMeta> };
    for (const def of PROTOTYPE_CATALOG) {
      const { bundle } = bundleFor(def);
      expect(bundle.meta.recipeHash, def.id).toBe(committed.defs[def.id]?.recipeHash);
      expect(bundle.meta.pixelHash, def.id).toBe(committed.defs[def.id]?.pixelHash);
    }
  });
});

describe("rendering", () => {
  test("all catalog bundles pass every gate", () => {
    const seen = new Set<string>();
    for (const def of PROTOTYPE_CATALOG) {
      const { bundle } = bundleFor(def);
      expect(gateUniqueness(seen, bundle.meta.recipeHash)).toEqual({ ok: true });
      expect(runGates(bundle, def), def.id).toEqual({ ok: true });
    }
  });

  test("a frozen bundle whose pixels drifted from its metadata refuses to load", () => {
    // The frozen png is the item's identity — a repaint that keeps the old metadata is the
    // failure this catches. Stage it by corrupting the pixels of a real frozen bundle.
    const artgen = PROTOTYPE_CATALOG.find((d) => !STARTER_RECIPES.has(d.id));
    expect(artgen, "at least one 3D-assisted def").toBeDefined();
    const png = join(FROZEN_DIR, `${artgen!.id}.png`);
    const original = readFileSync(png);
    const { width, height, rgba } = decodePng(original);
    rgba[0] = rgba[0] === 0 ? 255 : 0;
    writeFileSync(png, encodePng(width, height, rgba));
    try {
      expect(() => bundleFor(artgen!)).toThrow(/do not match meta.pixelHash/);
    } finally {
      writeFileSync(png, original);
    }
    expect(() => bundleFor(artgen!)).not.toThrow();
  });

  test("rotation swaps the per-dir anchor between the two footprint spans", () => {
    const table = PROTOTYPE_CATALOG.find((d) => d.id === "table_basic")!;
    const { meta } = render(table, STARTER_RECIPES.get("table_basic")!);
    // 2×1 footprint at scale 64: anchorX = spanY·32 for each dir's frame.
    expect(meta.anchorsX).toEqual([32, 64, 32, 64]);
    expect(meta.frameW).toBe((table.w + table.l) * 32);
  });

  test("an unknown part variant refuses to render", () => {
    const recipe: Recipe = { ...CHAIR_RECIPE!, parts: { ...CHAIR_RECIPE!.parts, seat: "beanbag" } };
    expect(() => render(CHAIR_DEF!, recipe)).toThrow(/no variant "beanbag"/);
  });
});

describe("style bible v1", () => {
  test("the palette is 12 ramps × 5 shades", () => {
    expect(RAMP_NAMES).toHaveLength(12);
    expect(RAMP_SHADES).toHaveLength(60);
    expect(PALETTE.size).toBe(61);   // + the global outline
  });

  test("no shade clips to white or collides with another ramp's shade", () => {
    // A clipped shade collapses two levels of a ramp into one flat block, and a collision makes
    // two different ramps render as the same pixel — both are silent style failures.
    const byColor = new Map<number, string>();
    for (const { ramp, shade, color } of RAMP_SHADES) {
      expect(`${ramp}.${shade} = ${color.toString(16)}`).not.toBe(`${ramp}.${shade} = ffffff`);
      const prior = byColor.get(color);
      expect(prior, `${ramp}.${shade} collides with ${prior}`).toBeUndefined();
      byColor.set(color, `${ramp}.${shade}`);
    }
  });
});

describe("recipe hashing", () => {
  test("hash is independent of key order", () => {
    const a = CHAIR_RECIPE!;
    const b = Object.fromEntries(Object.entries(a).reverse()) as unknown as Recipe;
    b.parts = Object.fromEntries(Object.entries(a.parts).reverse());
    expect(recipeHash(b)).toBe(recipeHash(a));
  });

  test("a different seed is a different design", () => {
    expect(recipeHash({ ...CHAIR_RECIPE!, seed: 12 })).not.toBe(recipeHash(CHAIR_RECIPE!));
  });
});

describe("gates bounce staged known-bad input", () => {
  test("uniqueness: the same recipe hash twice", () => {
    const seen = new Set<string>();
    const hash = recipeHash(CHAIR_RECIPE!);
    expect(gateUniqueness(seen, hash)).toEqual({ ok: true });
    expect(gateUniqueness(seen, hash)).toMatchObject({ ok: false, gate: "uniqueness" });
  });

  test("palette: one off-palette pixel", () => {
    const bundle = chairBundle();
    expect(PALETTE.has(0x123456)).toBe(false);
    putPixel(bundle.sheet, 10, 10, 0x123456);
    expect(gatePalette(bundle.sheet)).toMatchObject({ ok: false, gate: "palette" });
  });

  test("footprint: metadata that disagrees with the catalog def", () => {
    const bundle = chairBundle();
    bundle.meta.footprint.w = 2;
    expect(gateFootprint(bundle, CHAIR_DEF!)).toMatchObject({ ok: false, gate: "footprint" });
  });

  test("footprint: a sprite drawn taller than its collision height", () => {
    const bundle = chairBundle();
    bundle.meta.drawnHeight = (CHAIR_DEF!.stackHeights[0] ?? 0) + 0.5;
    expect(gateFootprint(bundle, CHAIR_DEF!)).toMatchObject({ ok: false, gate: "footprint" });
  });

  test("bounds: an empty frame and a floating sprite", () => {
    const empty = chairBundle();
    empty.sheet = makeCanvas(empty.sheet.w, empty.sheet.h);
    expect(gateBounds(empty)).toMatchObject({ ok: false, gate: "bounds" });

    const floating = chairBundle();
    // Erase everything near the ground line: the sprite now floats.
    for (let y = floating.meta.frameH - 24; y < floating.meta.frameH; y++) {
      for (let x = 0; x < floating.sheet.w; x++) {
        floating.sheet.px[(y * floating.sheet.w + x) * 4 + 3] = 0;
      }
    }
    expect(gateBounds(floating)).toMatchObject({ ok: false, gate: "bounds" });
  });

  test("contrast: a sprite painted in the floor tone", () => {
    const c = makeCanvas(8, 8);
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) putPixel(c, x, y, FLOOR_TONES[0] ?? 0);
    }
    expect(gateContrast(c)).toMatchObject({ ok: false, gate: "contrast" });
  });
});
