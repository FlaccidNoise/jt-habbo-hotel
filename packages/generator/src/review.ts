import type { Bundle } from "./compose.ts";
import { getPixel } from "./raster.ts";
import type { Canvas } from "./raster.ts";

// Visual review (#258). Not gates. A gate says the artifact is provably wrong and stops the
// build; a review says it probably looks wrong and prints next to the @3x preview so a human
// checks. Promote one into gates.ts only once its false-positive rate on the real catalog is
// measured — a part seen side-on can legitimately split into two islands.
//
// Measured 2026-08-05 over the 33-bundle catalog: reviewIslands flags 0. It catches #252 (dirs
// 2 and 4, the café chair's 331px back clear of the 620px stool) but NOT #256 — that rear leg
// stayed 8-connected to the body through the row below it, and the pre-fix and post-fix sheets
// differ by 0 alpha pixels in those frames.
//
// #258 also proposed a dead-band check: a column whose opaque pixels break into two runs, which
// is what #256 actually left behind. Built and measured, it flags 13 of the same 33 bundles —
// every table, lamp, plant and stool, because a leg gap or a stem legitimately splits a column —
// and it fires on the FIXED chair_basic and cafe_chair with the same 6px and 14px bands as on
// the broken ones. No threshold separates signal from silhouette, so it is not in this file.
// Catching #256 needs interior structure, not the alpha channel: the vision pass, not geometry.

/** Where the warning was seen — "dir 2" for furni, "sit d3" for a figure cell. */
export interface Warning { where: string; detail: string }

interface Island { size: number; minX: number; minY: number; maxX: number; maxY: number }

/** 8-connected islands of opaque pixels, largest first. Diagonal contact counts as joined: at
 *  this scale a corner touch still reads as one object. `opaque` is a predicate rather than a
 *  canvas so a stack of layers can be measured as the client composites them, without building
 *  the composite. */
function islands(w: number, h: number, opaque: (x: number, y: number) => boolean): Island[] {
  const label = new Uint8Array(w * h);
  const out: Island[] = [];
  const stack: number[] = [];
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      if (label[y0 * w + x0] === 1) continue;
      if (!opaque(x0, y0)) continue;
      const isle: Island = { size: 0, minX: x0, minY: y0, maxX: x0, maxY: y0 };
      label[y0 * w + x0] = 1;
      stack.push(x0, y0);
      while (stack.length) {
        const y = stack.pop()!;
        const x = stack.pop()!;
        isle.size++;
        if (x < isle.minX) isle.minX = x;
        if (x > isle.maxX) isle.maxX = x;
        if (y < isle.minY) isle.minY = y;
        if (y > isle.maxY) isle.maxY = y;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (label[ny * w + nx] === 1) continue;
            if (!opaque(nx, ny)) continue;
            label[ny * w + nx] = 1;
            stack.push(nx, ny);
          }
        }
      }
      out.push(isle);
    }
  }
  return out.sort((a, b) => b.size - a.size);
}

function looseDetail(found: readonly Island[], hint: string): string {
  const loose = found.slice(1)
    .map((i) => `${i.size}px at ${i.minX},${i.minY}–${i.maxX},${i.maxY}`)
    .join("; ");
  return `${found.length} islands — ${found[0]!.size}px body plus ${loose}. ${hint}`;
}

/** Detached geometry: a frame whose opaque pixels form more than one island. #252 shipped this
 *  way — the café chair's back rested past the seat's rear edge — and passed every gate, because
 *  nothing looked. See the header for why #256 is NOT of this shape. */
export function reviewIslands(bundle: Bundle): Warning[] {
  const warnings: Warning[] = [];
  const { frameW, frameH } = bundle.meta;
  for (let f = 0; f < bundle.meta.dirs.length; f++) {
    const found = islands(frameW, frameH,
      (x, y) => getPixel(bundle.sheet, f * frameW + x, y).alpha !== 0);
    if (found.length < 2) continue;
    warnings.push({
      where: `dir ${bundle.meta.dirs[f] ?? f}`,
      detail: looseDetail(found,
        `Usually a part whose z or y stops short of the part it should rest on; close that seam. ` +
        `Ignore if the silhouette legitimately splits at this angle.`),
    });
  }
  return warnings;
}

// --- figure layers (#268) ----------------------------------------------------------------------
//
// The same check, over the layer COMPOSED WITH THE CANONICAL BODY — never the layer alone. The
// bug asked for the measurement first, and it settles the design outright.
//
// Measured 2026-08-05 over the 16 frozen layers, 8 frames x 8 dirs = 1024 cells:
//
//   raw, layer alone   198 cells flagged (19%), in 10 of 16 layers, up to 5 islands
//   composed with body   0 cells flagged (0%)
//
// The raw flags are all legitimate and none is a defect: `sh9 walk0 d1` is 68px + 68px, which is
// two loafers; `lg8 walk0 d1` is 291px + 13px, a skirt panel the near leg cuts in two; `cc11
// stand d0` is 779px + 1px, one antialiasing pixel at a boundary. A garment is rendered as a
// holdout against the body, so wherever the body is nearer it won the depth test and the garment
// arrives in pieces BY CONSTRUCTION. Flagging 19% of cells forever would be worth nothing — the
// same reason the dead-band check above is not in this file.
//
// Composing puts the pieces back. Every layer is one connected object once the body is present,
// which is the same 0-false-positive profile that made reviewIslands worth shipping for furni.
// What survives is exactly the #252-class defect: a sleeve, brim or shoe authored clear of the
// body floats free of the composite and shows up as a second island.
//
// One garment at a time, matching gateHoldout: a garment's render contains the holdout body plus
// that garment and nothing else, so that is the only composite it can be checked against.

/** Detached geometry on a figure layer. `stack` is the layers to composite, each holding the same
 *  cells in the same order — the body first, the garment last. `label` names a cell for the
 *  warning ("sit d3"). */
export function reviewFigureIslands(
  stack: ReadonlyArray<readonly Canvas[]>,
  label: (cell: number) => string,
): Warning[] {
  const warnings: Warning[] = [];
  const top = stack[0];
  if (!top) return warnings;
  for (let cell = 0; cell < top.length; cell++) {
    const canvases = stack.map((layer) => layer[cell]).filter((c): c is Canvas => c !== undefined);
    const first = canvases[0];
    if (!first) continue;
    const found = islands(first.w, first.h,
      (x, y) => canvases.some((c) => getPixel(c, x, y).alpha !== 0));
    if (found.length < 2) continue;
    warnings.push({
      where: label(cell),
      detail: looseDetail(found,
        `The layer does not touch the body it is worn on at this pose. Usually a garment authored ` +
        `clear of the limb it should sit against; close that gap.`),
    });
  }
  return warnings;
}
