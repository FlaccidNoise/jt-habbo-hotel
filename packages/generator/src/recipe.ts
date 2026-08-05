import { createHash } from "node:crypto";

/** A design. Publishing freezes the rendered bundle — the bundle is the item's identity, the
 *  recipe demotes to provenance (PIPELINES §2). Reproducible only within the pinned versions. */
export interface Recipe {
  archetype: string;
  parts: Record<string, string>;   // slot → variant
  ramp: string;
  seed: number;
  styleVersion: number;
  generatorVersion: number;
  partLibraryHash: string;
}

/** Canonical JSON: sorted keys at every level, so hashing is representation-independent. */
function canonicalRecipe(recipe: Recipe): string {
  const sorted = (value: unknown): unknown => {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return value;
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, sorted(v)]),
    );
  };
  return JSON.stringify(sorted(recipe));
}

export function recipeHash(recipe: Recipe): string {
  return createHash("sha256").update(canonicalRecipe(recipe)).digest("hex");
}
