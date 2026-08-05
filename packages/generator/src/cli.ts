import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROTOTYPE_CATALOG } from "@grand/shared";
import { render } from "./compose.ts";
import type { BundleMeta } from "./compose.ts";
import { gateUniqueness, runGates } from "./gates.ts";
import { encodePng } from "./png.ts";
import { STARTER_RECIPES } from "./starter.ts";
import { GENERATOR_VERSION, STYLE_VERSION } from "./style.ts";

// Renders the starter catalog to frozen bundles: one sprite sheet per def plus catalog.json.
// Output goes to the client's public dir so Vite serves it in dev and copies it into dist.

const outDir = resolve(
  process.argv[2] ?? new URL("../../client/public/furni", import.meta.url).pathname,
);
mkdirSync(outDir, { recursive: true });

const seen = new Set<string>();
const defs: Record<string, BundleMeta> = {};

for (const def of PROTOTYPE_CATALOG) {
  const recipe = STARTER_RECIPES.get(def.id);
  if (!recipe) {
    console.error(`no starter recipe for ${def.id} — add it to starter.ts`);
    process.exit(1);
  }
  const bundle = render(def, recipe);
  for (const result of [gateUniqueness(seen, bundle.meta.recipeHash), runGates(bundle, def)]) {
    if (!result.ok) {
      console.error(`${def.id}: ${result.gate} gate: ${result.detail}`);
      process.exit(1);
    }
  }
  writeFileSync(
    join(outDir, bundle.meta.sheet),
    encodePng(bundle.sheet.w, bundle.sheet.h, bundle.sheet.px),
  );
  defs[def.id] = bundle.meta;
  console.log(`${def.id}: ${bundle.sheet.w}×${bundle.sheet.h} sheet, pixels ${bundle.meta.pixelHash.slice(0, 12)}…`);
}

writeFileSync(
  join(outDir, "catalog.json"),
  JSON.stringify({ styleVersion: STYLE_VERSION, generatorVersion: GENERATOR_VERSION, defs }, null, 2),
);
console.log(`wrote ${Object.keys(defs).length} bundles to ${outDir}`);
