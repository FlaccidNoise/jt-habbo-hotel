// SPIKE (#270, #260) — reduce an arbitrary RGB motif to the 91-colour palette and report whether
// the result is shippable: gatePalette clean, still legible as the intended pattern, still tiling.
// Scratch only. Not wired into any build.
//
//   node --experimental-strip-types spike-reduce.ts <in.png> <outPrefix> [ramp,ramp,...]

import { readFileSync, writeFileSync } from "node:fs";
import { encodePng } from "./src/png.ts";
import { gatePalette } from "./src/gates.ts";
import { makeCanvas, putPixel, getPixel } from "./src/raster.ts";
import { PALETTE, RAMP_NAMES, rampByName } from "./src/style.ts";
import type { Ramp } from "./src/style.ts";

const SHADES = ["outline", "left", "right", "top", "hi"] as const;

/** Redmean: a cheap perceptual RGB distance, good enough to pick a palette entry. */
function dist(a: number, b: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const rm = (ar + br) / 2;
  const dr = ar - br, dg = ag - bg, db = ab - bb;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

function nearest(color: number, choices: number[]): number {
  let best = choices[0]!, bestD = Infinity;
  for (const c of choices) {
    const d = dist(color, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

// Raw RGBA in, not PNG: our decodePng only handles filter type 0, and ImageMagick always writes
// adaptive filters. rig.py already dumps .rgba blobs, so this is the house convention anyway.
//   magick in.png -depth 8 RGBA:out.rgba
const [inPath, dimArg, outPrefix, rampArg] = process.argv.slice(2);
const [w, h] = dimArg!.split("x").map(Number) as [number, number];
const rgba = readFileSync(inPath!);
if (rgba.length !== w * h * 4) {
  throw new Error(`${inPath}: ${rgba.length} bytes is not ${w}x${h}x4 — check the dimensions`);
}

// Strategy A — unconstrained: nearest of all 91. Maximum fidelity to the motif, no coherence.
const ALL = [...PALETTE];

// Strategy B — constrained: nearest shade within a chosen ramp set, which is how a themed
// wallpaper would actually be authored. A pattern does not use 12 materials.
const chosen: Ramp[] = (rampArg ?? "plum,gold,ivory").split(",").map((n) => rampByName(n.trim()));
const CONSTRAINED = chosen.flatMap((r) => SHADES.map((s) => r[s]));

function reduce(choices: number[], label: string): void {
  const out = makeCanvas(w, h);
  const used = new Set<number>();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if ((rgba[i + 3] ?? 0) < 128) continue;
      const c = ((rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!) >>> 0;
      const picked = nearest(c, choices);
      used.add(picked);
      putPixel(out, x, y, picked);
    }
  }
  const png = encodePng(out.w, out.h, out.px);
  writeFileSync(`${outPrefix}.${label}.png`, png);

  // 3x for the eye, same as the artgen preview.
  const big = makeCanvas(w * 3, h * 3);
  for (let y = 0; y < big.h; y++) {
    for (let x = 0; x < big.w; x++) {
      const p = getPixel(out, (x / 3) | 0, (y / 3) | 0);
      if (p.alpha !== 0) putPixel(big, x, y, p.color);
    }
  }
  writeFileSync(`${outPrefix}.${label}@3x.png`, encodePng(big.w, big.h, big.px));

  const gate = gatePalette(out);
  console.log(`\n[${label}] ${w}x${h}, ${used.size} distinct colours of ${choices.length} offered`);
  console.log(`  gatePalette: ${gate.ok ? "PASS" : `FAIL ${gate.detail}`}`);
  console.log(`  seam: ${seam(out)}`);
}

/** Seamlessness: the wrap discontinuity against the mean internal one. ~1.0 means it tiles. */
function seam(c: ReturnType<typeof makeCanvas>): string {
  const colDiff = (x0: number, x1: number): number => {
    let s = 0;
    for (let y = 0; y < c.h; y++) s += Math.sqrt(dist(getPixel(c, x0, y).color, getPixel(c, x1, y).color));
    return s / c.h;
  };
  const rowDiff = (y0: number, y1: number): number => {
    let s = 0;
    for (let x = 0; x < c.w; x++) s += Math.sqrt(dist(getPixel(c, x, y0).color, getPixel(c, x, y1).color));
    return s / c.w;
  };
  let interCol = 0, interRow = 0;
  for (let x = 0; x + 1 < c.w; x++) interCol += colDiff(x, x + 1);
  for (let y = 0; y + 1 < c.h; y++) interRow += rowDiff(y, y + 1);
  interCol /= c.w - 1; interRow /= c.h - 1;
  const wrapCol = colDiff(c.w - 1, 0), wrapRow = rowDiff(c.h - 1, 0);
  const fmt = (wrap: number, inter: number): string =>
    `${(wrap / (inter || 1)).toFixed(2)}x internal`;
  return `x-wrap ${fmt(wrapCol, interCol)}, y-wrap ${fmt(wrapRow, interRow)}`;
}

console.log(`source: ${inPath} (${w}x${h})`);
console.log(`ramps offered to constrained: ${chosen.map((r) => r.name).join(", ")}`);
console.log(`(all ramps: ${RAMP_NAMES.join(", ")})`);
reduce(ALL, "all91");
reduce(CONSTRAINED, "constrained");
