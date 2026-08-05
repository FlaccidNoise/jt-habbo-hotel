import { createHash } from "node:crypto";
import type { FurniDef } from "@grand/shared";
import { ARCHETYPES } from "./archetypes.ts";
import type { Box } from "./iso.ts";
import { drawBox, painterSort, rotateBox } from "./iso.ts";
import { mulberry32 } from "./prng.ts";
import type { Canvas } from "./raster.ts";
import { blit, getPixel, makeCanvas, putPixel } from "./raster.ts";
import type { Recipe } from "./recipe.ts";
import { recipeHash } from "./recipe.ts";
import { OUTLINE, rampByName } from "./style.ts";

const H = 32;
const V = 16;
const ZU = 32;

export const DIRS = [0, 2, 4, 6] as const;

export interface BundleMeta {
  defId: string;
  archetype: string;
  sheet: string;
  frameW: number;
  frameH: number;
  dirs: readonly number[];
  /** Origin-tile-center pixel per dir (x varies with rotation; y is shared). */
  anchorsX: number[];
  anchorY: number;
  footprint: { w: number; l: number };
  drawnHeight: number;
  /** Top of the authored seat geometry, or null when the part has none. The def's seatHeight is
   *  checked against this — it is what placement.ts rests a seated avatar on. */
  seatZ: number | null;
  occlusion: string[];
  styleVersion: number;
  generatorVersion: number;
  partLibraryHash: string;
  recipeHash: string;
  pixelHash: string;
}

export interface Bundle {
  sheet: Canvas;
  meta: BundleMeta;
}

/** Any opaque pixel touching transparency (or the frame edge) becomes the global outline. */
function outlineSilhouette(c: Canvas): void {
  const edge: Array<[number, number]> = [];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (getPixel(c, x, y).alpha === 0) continue;
      const open =
        x === 0 || y === 0 || x === c.w - 1 || y === c.h - 1 ||
        getPixel(c, x - 1, y).alpha === 0 || getPixel(c, x + 1, y).alpha === 0 ||
        getPixel(c, x, y - 1).alpha === 0 || getPixel(c, x, y + 1).alpha === 0;
      if (open) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) putPixel(c, x, y, OUTLINE);
}

export function render(def: FurniDef, recipe: Recipe): Bundle {
  const spec = ARCHETYPES.get(recipe.archetype);
  if (!spec) throw new Error(`unknown archetype: ${recipe.archetype}`);

  const slots = Object.keys(spec.slots);
  const ctx = {
    prng: mulberry32(recipe.seed),
    ramp: rampByName(recipe.ramp),
    w: def.w,
    l: def.l,
    h: def.stackHeights[0] ?? 1,
  };
  const built = slots.map((slot) => {
    const variants = spec.slots[slot] ?? {};
    const pick = recipe.parts[slot];
    const build = pick === undefined ? undefined : variants[pick];
    if (!build) throw new Error(`${recipe.archetype}.${slot}: no variant "${pick}"`);
    return { slot, boxes: build(ctx) };
  });
  const boxes: Box[] = built.flatMap((b) => b.boxes);
  // The seat surface is geometry, never a declaration: the top of the "seat" slot's boxes.
  const seatBoxes = built.find((b) => b.slot === "seat")?.boxes ?? [];
  const seatZ = seatBoxes.length > 0 ? Math.max(...seatBoxes.map((b) => b.z1)) : null;

  const maxZ = Math.max(...boxes.map((b) => b.z1));
  const heightPx = Math.ceil(maxZ * ZU);
  const frameW = (def.w + def.l) * H;
  const frameH = (def.w + def.l) * V + heightPx;
  const anchorY = V + heightPx;

  const sheet = makeCanvas(frameW * DIRS.length, frameH);
  const anchorsX: number[] = [];
  let current = boxes;
  let spanY = def.l;
  for (let q = 0; q < DIRS.length; q++) {
    if (q > 0) {
      current = current.map((b) => rotateBox(b, spanY));
      spanY = spanY === def.l ? def.w : def.l;
    }
    anchorsX.push(spanY * H);
    const frame = makeCanvas(frameW, frameH);
    for (const b of painterSort(current)) drawBox(frame, { x: spanY * H, y: anchorY }, b);
    outlineSilhouette(frame);
    blit(sheet, frame, q * frameW, 0);
  }

  return {
    sheet,
    meta: {
      defId: def.id,
      archetype: recipe.archetype,
      sheet: `${def.id}.png`,
      frameW,
      frameH,
      dirs: DIRS,
      anchorsX,
      anchorY,
      footprint: { w: def.w, l: def.l },
      drawnHeight: heightPx / ZU,
      seatZ,
      occlusion: slots,
      styleVersion: recipe.styleVersion,
      generatorVersion: recipe.generatorVersion,
      partLibraryHash: recipe.partLibraryHash,
      recipeHash: recipeHash(recipe),
      pixelHash: createHash("sha256").update(sheet.px).digest("hex"),
    },
  };
}
