import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { PROTOTYPE_CATALOG } from "@grand/shared";
import { render } from "../src/compose.ts";
import type { BundleMeta } from "../src/compose.ts";
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
import { FLOOR_TONES, PALETTE } from "../src/style.ts";

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

  test("every starter bundle matches the committed frozen catalog", () => {
    // The bundle is the item's identity. An intentional style change must regenerate the
    // committed assets (pnpm --filter @grand/generator generate) — a silent drift is an error.
    const committed = JSON.parse(
      readFileSync(new URL("../../client/public/furni/catalog.json", import.meta.url), "utf8"),
    ) as { defs: Record<string, BundleMeta> };
    for (const def of PROTOTYPE_CATALOG) {
      const recipe = STARTER_RECIPES.get(def.id);
      expect(recipe, `starter recipe for ${def.id}`).toBeDefined();
      const bundle = render(def, recipe!);
      expect(bundle.meta.recipeHash, def.id).toBe(committed.defs[def.id]?.recipeHash);
      expect(bundle.meta.pixelHash, def.id).toBe(committed.defs[def.id]?.pixelHash);
    }
  });
});

describe("rendering", () => {
  test("all starter bundles pass every gate", () => {
    const seen = new Set<string>();
    for (const def of PROTOTYPE_CATALOG) {
      const bundle = render(def, STARTER_RECIPES.get(def.id)!);
      expect(gateUniqueness(seen, bundle.meta.recipeHash)).toEqual({ ok: true });
      expect(runGates(bundle, def), def.id).toEqual({ ok: true });
    }
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
