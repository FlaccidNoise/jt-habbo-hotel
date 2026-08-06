// Flat-decor authoring pass (#260). Sibling of tools/artgen/postpass.ts, and much shorter,
// because the class has no geometry: there is no rig, no mask pass and no 3D at all.
//
//   node --experimental-strip-types tools/decor/decorpass.ts [--freeze]
//
// Per def in DECOR_CATALOG: read the authored raster from source/, quantize it to the 91-colour
// palette, prove it actually repeats on its declared tile, run the class's gates, and freeze the
// one tile the client will repeat.
//
// The source PNG is the authored artifact — it is a plain raster, so any image editor is the
// authoring tool and nothing here cares how it was made. Everything downstream reads the FROZEN
// tile, never the source: pixels are the item's identity, exactly as for furni.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DECOR_CATALOG } from "../../packages/shared/src/decor.ts";
import { decorTile, quantize } from "../../packages/generator/src/decor.ts";
import { gateDecorTiles, runDecorGates } from "../../packages/generator/src/gates.ts";
import { decodePng, encodePng } from "../../packages/generator/src/png.ts";
import { STYLE_VERSION } from "../../packages/generator/src/style.ts";

const freeze = process.argv.includes("--freeze");
const sourceDir = new URL("./source/", import.meta.url).pathname;
const frozenDir = new URL("./frozen/", import.meta.url).pathname;

const bundles: Array<Record<string, unknown>> = [];
let failures = 0;

for (const def of DECOR_CATALOG) {
  const png = readFileSync(join(sourceDir, `${def.id}.png`));
  const { width, height, rgba } = decodePng(png);
  const source = quantize({ w: width, h: height, px: rgba });

  const tiles = gateDecorTiles(source, def);
  if (!tiles.ok) {
    console.error(`${def.id}: ${tiles.gate} gate: ${tiles.detail}`);
    failures++;
    continue;
  }
  const tile = decorTile(source, def);
  const gates = runDecorGates(tile, def);
  if (!gates.ok) {
    console.error(`${def.id}: ${gates.gate} gate: ${gates.detail}`);
    failures++;
    continue;
  }

  const out = encodePng(tile.w, tile.h, tile.px);
  const pixelHash = createHash("sha256").update(tile.px).digest("hex");
  bundles.push({
    id: def.id, kind: def.kind, sheet: `${def.id}.png`,
    tileW: tile.w, tileH: tile.h,
    source: { w: width, h: height },
    styleVersion: STYLE_VERSION, pixelHash,
  });
  if (freeze) {
    mkdirSync(frozenDir, { recursive: true });
    writeFileSync(join(frozenDir, `${def.id}.png`), out);
  }
  console.log(
    `${def.id}: ${width}x${height} source -> ${tile.w}x${tile.h} tile, pixels ${pixelHash.slice(0, 12)}…`,
  );
}

if (failures > 0) {
  console.error(`${failures} failure(s) — nothing frozen`);
  process.exit(1);
}

if (freeze) {
  mkdirSync(frozenDir, { recursive: true });
  writeFileSync(join(frozenDir, "decor.json"), JSON.stringify({ decor: bundles }, null, 2));
  console.log(`froze ${bundles.length} decor tile(s) to tools/decor/frozen/`);
}
