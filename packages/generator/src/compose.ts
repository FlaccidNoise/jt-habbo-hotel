import { createHash } from "node:crypto";
import { painterOrder } from "@grand/shared";
import type { DepthBox, FurniDef } from "@grand/shared";
import { ARCHETYPES } from "./archetypes.ts";
import type { Box } from "./iso.ts";
import { H, V, ZU, drawBox, rotateBox } from "./iso.ts";
import { mulberry32 } from "./prng.ts";
import type { Canvas } from "./raster.ts";
import { blit, getPixel, makeCanvas, putPixel } from "./raster.ts";
import type { Recipe } from "./recipe.ts";
import { recipeHash } from "./recipe.ts";
import { OUTLINE, rampByName } from "./style.ts";

export const DIRS = [0, 2, 4, 6] as const;

/** How tall a seated avatar is, in world units — client scene/avatar.ts SIT_H over ZU. */
const SITTER_HEIGHT = 1;

/** The half of a sprite that draws in front of a seated occupant, as the box the client sorts it
 *  by. In the dir-0 frame's footprint units, like the rest of the geometry. */
export type Occluder = { x0: number; y0: number; z0: number; x1: number; y1: number; z1: number };

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
  /** Per dir, the half of the sprite that draws in front of a seated occupant, or null for a dir
   *  with nothing in front. Null outright when the sheet is one row: no seat, or no direction puts
   *  anything in front of one. The sheet has a second row exactly when this is not null. */
  occlusion: Array<Occluder | null> | null;
  styleVersion: number;
  generatorVersion: number;
  partLibraryHash: string;
  recipeHash: string;
  pixelHash: string;
}

/** One dir's part boxes, in the order they are drawn and split where a seated occupant goes.
 *  `front` is empty for everything you cannot sit on, so `back` is then the whole sprite. */
export interface Halves {
  back: Box[];
  front: Box[];
}

export interface Bundle {
  sheet: Canvas;
  meta: BundleMeta;
  /** Part boxes per dir frame, in that frame's footprint units — what the draw-order and
   *  seat-occlusion gates re-render. Null for 3D-assisted defs (#202): they ship frozen pixels,
   *  not geometry. */
  geometry: Halves[] | null;
}

/** Where a seated occupant sits: over the seat slot's own footprint, from its surface up.
 *
 *  Deriving it from the tagged slot is what makes the split come out at all. A sitter modelled as
 *  the whole tile would *contain* the backrest rather than being ordered against it, and every
 *  part would fall on the same side. */
function sitterBox(seat: readonly Box[]): DepthBox {
  const top = Math.max(...seat.map((b) => b.z1));
  return {
    x0: Math.min(...seat.map((b) => b.x0)),
    y0: Math.min(...seat.map((b) => b.y0)),
    z0: top,
    x1: Math.max(...seat.map((b) => b.x1)),
    y1: Math.max(...seat.map((b) => b.y1)),
    z1: top + SITTER_HEIGHT,
    layer: 1,   // client LAYER.seated sits above LAYER.furni, so ties put the sitter second
  };
}

/** Split one dir's part boxes around a seated occupant.
 *
 *  The sitter joins the painter sort as one more box, and the order is cut where it lands. So the
 *  two halves concatenated are exactly the order the whole sprite would draw in with the sitter
 *  removed — every constraint between parts still holds, by construction rather than by check. */
function splitAroundSitter(boxes: readonly Box[], seat: readonly Box[]): Halves {
  const nodes = boxes.map((b) => ({ ...b, layer: 0 }));
  if (seat.length === 0) {
    return { back: painterOrder(nodes).flatMap((i) => boxes[i] ?? []), front: [] };
  }
  const order = painterOrder([...nodes, sitterBox(seat)]);
  const cut = order.indexOf(boxes.length);
  const pick = (from: number, to: number): Box[] =>
    order.slice(from, to).flatMap((i) => boxes[i] ?? []);
  return { back: pick(0, cut), front: pick(cut + 1, order.length) };
}

/** The box the client sorts a front half by: everything it draws. */
function extentOf(boxes: readonly Box[]): Occluder | null {
  if (boxes.length === 0) return null;
  return {
    x0: Math.min(...boxes.map((b) => b.x0)), y0: Math.min(...boxes.map((b) => b.y0)),
    z0: Math.min(...boxes.map((b) => b.z0)), x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)), z1: Math.max(...boxes.map((b) => b.z1)),
  };
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
  // Which slot each box came from, kept parallel through rotation so the seat stays findable.
  const slotOf: string[] = built.flatMap((b) => b.boxes.map(() => b.slot));
  // The seat surface is geometry, never a declaration: the top of the "seat" slot's boxes.
  const seatBoxes = built.find((b) => b.slot === "seat")?.boxes ?? [];
  const seatZ = seatBoxes.length > 0 ? Math.max(...seatBoxes.map((b) => b.z1)) : null;

  const maxZ = Math.max(...boxes.map((b) => b.z1));
  const heightPx = Math.ceil(maxZ * ZU);
  const frameW = (def.w + def.l) * H;
  const frameH = (def.w + def.l) * V + heightPx;
  const anchorY = V + heightPx;

  // Row 0 is the whole sprite, or its half behind a seated occupant. Row 1, when a seat splits
  // the geometry in any direction, is the half in front (PIPELINES §1 Seating occlusion).
  const anchorsX: number[] = [];
  const geometry: Halves[] = [];
  let current = boxes;
  let spanY = def.l;
  for (let q = 0; q < DIRS.length; q++) {
    if (q > 0) {
      current = current.map((b) => rotateBox(b, spanY));
      spanY = spanY === def.l ? def.w : def.l;
    }
    anchorsX.push(spanY * H);
    const seat = current.filter((_, i) => slotOf[i] === "seat");
    geometry.push(splitAroundSitter(current, seat));
  }

  const occlusion = geometry.map((h) => extentOf(h.front));
  const rows = occlusion.some((o) => o !== null) ? 2 : 1;
  const sheet = makeCanvas(frameW * DIRS.length, frameH * rows);
  for (const [q, half] of geometry.entries()) {
    for (const [row, group] of [half.back, half.front].entries()) {
      if (group.length === 0) continue;
      const frame = makeCanvas(frameW, frameH);
      for (const b of group) drawBox(frame, { x: anchorsX[q] ?? 0, y: anchorY }, b);
      outlineSilhouette(frame);
      blit(sheet, frame, q * frameW, row * frameH);
    }
  }

  return {
    sheet,
    geometry,
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
      occlusion: rows === 2 ? occlusion : null,
      styleVersion: recipe.styleVersion,
      generatorVersion: recipe.generatorVersion,
      partLibraryHash: recipe.partLibraryHash,
      recipeHash: recipeHash(recipe),
      pixelHash: createHash("sha256").update(sheet.px).digest("hex"),
    },
  };
}
