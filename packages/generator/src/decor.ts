import type { DecorDef } from "@grand/shared";
import { getPixel, makeCanvas, putPixel } from "./raster.ts";
import type { Canvas } from "./raster.ts";
import { PALETTE } from "./style.ts";

// The flat-decor build (#260). Two steps, both pure: quantize an authored raster to the 91, then
// cut the one tile the client repeats.
//
// The quantizer here is NOT the artgen one and must not be confused with it. postpass.ts can only
// quantize because its input is white geometry under one known sun, so shading arrives pre-sorted
// into four luma buckets and the mask names the ramp. A flat texture has no such structure and
// needs none: it is already the colour it will be drawn in, so nearest-in-RGB is the whole job.
// That is what makes this the one asset class an image model could feed.

const PALETTE_LIST: readonly number[] = [...PALETTE];

/** Nearest palette colour by squared RGB distance. Ties go to the earlier entry, which makes the
 *  mapping a pure function of the palette's declaration order — the same input always freezes to
 *  the same bytes. */
export function nearestPaletteColor(color: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  let best = PALETTE_LIST[0] ?? 0;
  let bestD = Infinity;
  for (const p of PALETTE_LIST) {
    const dr = ((p >> 16) & 0xff) - r, dg = ((p >> 8) & 0xff) - g, db = (p & 0xff) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** Every pixel snapped to the palette. Transparency is not snapped away — it is left as-is so
 *  the surface gate can report it, because a hole in a floor shows the page behind the room. */
export function quantize(source: Canvas): Canvas {
  const out = makeCanvas(source.w, source.h);
  for (let y = 0; y < source.h; y++) {
    for (let x = 0; x < source.w; x++) {
      const p = getPixel(source, x, y);
      if (p.alpha === 0) continue;
      putPixel(out, x, y, nearestPaletteColor(p.color));
    }
  }
  return out;
}

/** The tile the client repeats: the source's top-left `def.tile`. Only meaningful once
 *  `gateDecorTiles` has proved the rest of the source is that tile repeated. */
export function decorTile(source: Canvas, def: DecorDef): Canvas {
  const tile = makeCanvas(def.tile.w, def.tile.h);
  for (let y = 0; y < def.tile.h; y++) {
    for (let x = 0; x < def.tile.w; x++) {
      const p = getPixel(source, x, y);
      if (p.alpha !== 0) putPixel(tile, x, y, p.color);
    }
  }
  return tile;
}
