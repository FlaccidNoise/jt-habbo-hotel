import type { Bundle } from "./compose.ts";
import { getPixel } from "./raster.ts";

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

export interface Warning { dir: number; detail: string }

interface Island { size: number; minX: number; minY: number; maxX: number; maxY: number }

/** 8-connected islands of opaque pixels in one frame, largest first. Diagonal contact counts as
 *  joined: at this scale a corner touch still reads as one object. */
function islands(bundle: Bundle, f: number): Island[] {
  const { frameW, frameH } = bundle.meta;
  const label = new Int8Array(frameW * frameH);
  const out: Island[] = [];
  const stack: number[] = [];
  for (let y0 = 0; y0 < frameH; y0++) {
    for (let x0 = 0; x0 < frameW; x0++) {
      if (label[y0 * frameW + x0] === 1) continue;
      if (getPixel(bundle.sheet, f * frameW + x0, y0).alpha === 0) continue;
      const isle: Island = { size: 0, minX: x0, minY: y0, maxX: x0, maxY: y0 };
      label[y0 * frameW + x0] = 1;
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
            if (nx < 0 || ny < 0 || nx >= frameW || ny >= frameH) continue;
            if (label[ny * frameW + nx] === 1) continue;
            if (getPixel(bundle.sheet, f * frameW + nx, ny).alpha === 0) continue;
            label[ny * frameW + nx] = 1;
            stack.push(nx, ny);
          }
        }
      }
      out.push(isle);
    }
  }
  return out.sort((a, b) => b.size - a.size);
}

/** Detached geometry: a frame whose opaque pixels form more than one island. Both #252 (café
 *  chair back resting past the seat's rear edge) and #256 (chair back starting above the leg
 *  tops) shipped as a loose second island and passed every gate — nothing looked. */
export function reviewIslands(bundle: Bundle): Warning[] {
  const warnings: Warning[] = [];
  for (let f = 0; f < bundle.meta.dirs.length; f++) {
    const found = islands(bundle, f);
    if (found.length < 2) continue;
    const loose = found.slice(1)
      .map((i) => `${i.size}px at ${i.minX},${i.minY}–${i.maxX},${i.maxY}`)
      .join("; ");
    warnings.push({
      dir: bundle.meta.dirs[f] ?? f,
      detail:
        `${found.length} islands — ${found[0]!.size}px body plus ${loose}. Usually a part whose ` +
        `z or y stops short of the part it should rest on; close that seam. Ignore if the ` +
        `silhouette legitimately splits at this angle.`,
    });
  }
  return warnings;
}
