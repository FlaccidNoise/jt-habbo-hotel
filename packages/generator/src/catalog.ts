import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import type { FurniDef } from "@grand/shared";
import type { Bundle } from "./compose.ts";
import { render } from "./compose.ts";
import { decodePng, encodePng } from "./png.ts";
import { STARTER_RECIPES } from "./starter.ts";

export const FROZEN_DIR: string = new URL("../../../tools/artgen/frozen", import.meta.url).pathname;

/** The one way a def becomes a bundle. Box-path defs render from their recipe; 3D-assisted defs
 *  (#202) load the committed frozen bytes — the pixels are the item's identity, so they are read,
 *  never re-rendered, and the stored pixel hash must match what the file actually contains. */
export function bundleFor(def: FurniDef): { bundle: Bundle; png: Buffer } {
  const recipe = STARTER_RECIPES.get(def.id);
  if (recipe) {
    const bundle = render(def, recipe);
    return { bundle, png: encodePng(bundle.sheet.w, bundle.sheet.h, bundle.sheet.px) };
  }
  const metaPath = join(FROZEN_DIR, `${def.id}.json`);
  if (!existsSync(metaPath)) {
    throw new Error(`${def.id}: no starter recipe and no frozen artgen bundle at ${metaPath}`);
  }
  const meta = JSON.parse(readFileSync(metaPath, "utf8")) as Bundle["meta"];
  if (!("seatZ" in meta)) {
    throw new Error(`${def.id}: frozen bundle has no seatZ — re-freeze it through tools/artgen/postpass.ts`);
  }
  const png = readFileSync(join(FROZEN_DIR, `${def.id}.png`));
  const { width, height, rgba } = decodePng(png);
  const pixelHash = createHash("sha256").update(rgba).digest("hex");
  if (pixelHash !== meta.pixelHash) {
    throw new Error(`${def.id}: frozen png pixels do not match meta.pixelHash — bundle is corrupt`);
  }
  return { bundle: { sheet: { w: width, h: height, px: rgba }, meta, geometry: null }, png };
}
