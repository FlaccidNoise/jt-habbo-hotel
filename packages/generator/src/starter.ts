import { PART_LIBRARY_HASH } from "./archetypes.ts";
import type { Recipe } from "./recipe.ts";
import { GENERATOR_VERSION, STYLE_VERSION } from "./style.ts";

const versions = {
  styleVersion: STYLE_VERSION,
  generatorVersion: GENERATOR_VERSION,
  partLibraryHash: PART_LIBRARY_HASH,
};

/** The starter catalog authored as generator recipes from the start (PIPELINES §2, audit A7) —
 *  the generator reproducing art built for it proves nothing otherwise. */
export const STARTER_RECIPES: ReadonlyMap<string, Recipe> = new Map<string, Recipe>([
  ["chair_basic", {
    archetype: "chair",
    parts: { legs: "block", seat: "cushion", back: "slats" },
    ramp: "walnut", seed: 11, ...versions,
  }],
  ["table_basic", {
    archetype: "table",
    parts: { legs: "block", top: "slab" },
    ramp: "oak", seed: 22, ...versions,
  }],
  ["sofa_basic", {
    archetype: "sofa",
    parts: { base: "slab", seat: "cushions", back: "solid", arms: "square" },
    ramp: "plum", seed: 33, ...versions,
  }],
  ["plant_basic", {
    archetype: "plant",
    parts: { pot: "tapered", foliage: "bush" },
    ramp: "fern", seed: 44, ...versions,
  }],
  ["rug_basic", {
    archetype: "rug",
    parts: { field: "border" },
    ramp: "crimson", seed: 55, ...versions,
  }],
]);
