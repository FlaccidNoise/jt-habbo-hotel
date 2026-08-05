import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROTOTYPE_CATALOG, WALL_CATALOG } from "@grand/shared";
import { bundleFor, frozenBundle } from "./catalog.ts";
import type { BundleMeta } from "./compose.ts";
import { gateUniqueness, runGates, runWallGates } from "./gates.ts";
import { GENERATOR_VERSION, STYLE_VERSION } from "./style.ts";

// Publishes the catalog: one sprite sheet per def plus catalog.json. Box-path defs render from
// STARTER_RECIPES; 3D-assisted defs (#202) come pre-frozen from tools/artgen/frozen. Both run
// the full gates here, so a bad frozen bundle cannot reach the client. Output goes to the
// client's public dir so Vite serves it in dev and copies it into dist.

const outDir = resolve(
  process.argv[2] ?? new URL("../../client/public/furni", import.meta.url).pathname,
);
mkdirSync(outDir, { recursive: true });

const seen = new Set<string>();
const defs: Record<string, BundleMeta> = {};

for (const def of PROTOTYPE_CATALOG) {
  let bundle, png;
  try {
    ({ bundle, png } = bundleFor(def));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  for (const result of [gateUniqueness(seen, bundle.meta.recipeHash), runGates(bundle, def)]) {
    if (!result.ok) {
      console.error(`${def.id}: ${result.gate} gate: ${result.detail}`);
      process.exit(1);
    }
  }
  writeFileSync(join(outDir, bundle.meta.sheet), png);
  defs[def.id] = bundle.meta;
  console.log(`${def.id}: ${bundle.sheet.w}×${bundle.sheet.h} sheet, pixels ${bundle.meta.pixelHash.slice(0, 12)}…`);
}

// Wall bundles publish into the same catalog.json: one asset loader, one sheet format, one place
// the client looks. Only the gates differ (#203).
for (const def of WALL_CATALOG) {
  let bundle, png;
  try {
    ({ bundle, png } = frozenBundle(def.id));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
  for (const result of [gateUniqueness(seen, bundle.meta.recipeHash), runWallGates(bundle, def)]) {
    if (!result.ok) {
      console.error(`${def.id}: ${result.gate} gate: ${result.detail}`);
      process.exit(1);
    }
  }
  writeFileSync(join(outDir, bundle.meta.sheet), png);
  defs[def.id] = bundle.meta;
  console.log(`${def.id}: ${bundle.sheet.w}×${bundle.sheet.h} wall sheet, pixels ${bundle.meta.pixelHash.slice(0, 12)}…`);
}

writeFileSync(
  join(outDir, "catalog.json"),
  JSON.stringify({ styleVersion: STYLE_VERSION, generatorVersion: GENERATOR_VERSION, defs }, null, 2),
);
console.log(`wrote ${Object.keys(defs).length} bundles to ${outDir}`);
