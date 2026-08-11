// AI-motif authoring step for flat decor (#435, executing the #270 decision). Turns one generated
// motif into a source PNG that decorpass.ts then treats like any other authored raster.
//
//   magick motif.png -depth 8 RGBA:$MOTIF_DIR/motif.rgba
//   node --experimental-strip-types tools/decor/motif.ts [id ...]
//
// The image model supplies the MOTIF; this supplies the REPETITION. Nothing here trusts the model
// to tile: the motif is sampled through a map that is periodic on the tile by construction, so the
// wrap is exact whatever the model drew. The seam numbers printed below measure how visible that
// wrap is, which is a matter of taste and so is reported rather than gated.
//
// The reducer is constrained to a chosen ramp set, which is the half of #270 the shipped quantizer
// does not do: `quantize` in packages/generator/src/decor.ts takes the nearest of all 91, and the
// spike measured that reaching 24-31 near-duplicate colours with no ramp structure left to swap.
// Reducing here instead of there keeps the pipeline untouched — decorpass re-quantizes the source
// it writes, and a colour that is already a palette entry is its own nearest, so that pass is a
// no-op on these tiles and still the only thing that decides what freezes.
//
// Motif dumps are intermediates and are not committed, the same bargain make art strikes with its
// Blender renders: the source PNG is the authored artifact, and the frozen tile is the identity.

import { readFileSync, writeFileSync } from "node:fs";
import { DECOR_CATALOG } from "../../packages/shared/src/decor.ts";
import type { DecorDef } from "../../packages/shared/src/decor.ts";
import { encodePng } from "../../packages/generator/src/png.ts";
import { getPixel, makeCanvas, putPixel } from "../../packages/generator/src/raster.ts";
import type { Canvas } from "../../packages/generator/src/raster.ts";
import { BACKDROP_LUMA_MIN, luminance, rampByName } from "../../packages/generator/src/style.ts";

interface Recipe {
  /** DECOR_CATALOG id this writes source/<id>.png for. */
  id: string;
  /** Motif dump in MOTIF_DIR, without the .rgba suffix. */
  motif: string;
  motifW: number;
  motifH: number;
  /** Ramps the reduction may use. Their shades under BACKDROP_LUMA_MIN are dropped: a decor tile
   *  that dark fails gateDecorContrast, so offering them only invites a colour that cannot ship. */
  ramps: string[];
  /** Floors lie in the ground plane, so their motif is carried onto the diamond lattice. Walls face
   *  the camera and take the motif straight. */
  iso?: boolean;
  /** Source rectangle, when the motif is a full-frame field rather than one object. Otherwise the
   *  object's bounding box is found and padded by `pad`. */
  window?: [number, number, number, number];
  /** Bounding box padding, as a fraction of the box. The margin it leaves is what makes the wrap
   *  land in flat ground rather than through the motif. */
  pad?: number;
  /** Replaces the motif's own background, for a tile that wants a ground the model did not draw. */
  ground?: number;
}

// A motif must be authored inside the class's own luma band. gateDecorContrast rejects anything
// under BACKDROP_LUMA_MIN, so the darkest blue a decor tile can hold is navy.right at luma 92 —
// ask an image model for "deep navy" and the reducer has no faithful choice and reaches for a grey
// of the right darkness instead. Both blue motifs here were regenerated as a medium royal blue for
// that reason, and the fix belongs in the prompt rather than in the distance metric.
const RECIPES: Recipe[] = [
  { id: "wall_sunburst", motif: "sunburst4", motifW: 1024, motifH: 1024, pad: 1.18,
    ramps: ["gold", "navy", "ivory"] },
  { id: "wall_fanshell", motif: "fanshell", motifW: 1024, motifH: 1024, pad: 1.22,
    ramps: ["crimson", "sand", "ivory"], ground: 0xaa3333 },
  // A field, not an object, so the window is given rather than found — and it is small, because it
  // is one diamond's worth of floor: a wider crop shrinks the chips into noise.
  { id: "floor_terrazzo", motif: "chips", motifW: 1024, motifH: 1024, iso: true,
    window: [360, 472, 340, 340], ramps: ["ivory", "sand", "slate"] },
  { id: "floor_mosaic", motif: "mosaic2", motifW: 1024, motifH: 1024, iso: true, pad: 1.02,
    ramps: ["gold", "navy", "ivory"] },
];

const SHADES = ["outline", "left", "right", "top", "hi"] as const;
const SUPERSAMPLE = 8;
const motifDir = process.env.MOTIF_DIR ?? "/tmp/decor-motif";
const sourceDir = new URL("./source/", import.meta.url).pathname;

/** Redmean: a cheap perceptual RGB distance. The spike picked it and measured the result. */
function dist(a: number, b: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const rm = (ar + br) / 2;
  const dr = ar - br, dg = ag - bg, db = ab - bb;
  return (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
}

function nearest(color: number, choices: readonly number[]): number {
  let best = choices[0] ?? 0, bestD = Infinity;
  for (const c of choices) {
    const d = dist(color, c);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function shadesOf(ramps: string[]): number[] {
  const all = ramps.flatMap((n) => SHADES.map((s) => rampByName(n)[s]));
  return all.filter((c) => luminance(c) >= BACKDROP_LUMA_MIN);
}

const frac = (x: number): number => ((x % 1) + 1) % 1;

/** The motif's bounding box, against the background the corner pixel names. */
function boundingBox(rgba: Buffer, w: number, h: number): [number, number, number, number] {
  const bg = [rgba[0] ?? 0, rgba[1] ?? 0, rgba[2] ?? 0];
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const off = Math.abs((rgba[i] ?? 0) - bg[0]!) + Math.abs((rgba[i + 1] ?? 0) - bg[1]!) +
        Math.abs((rgba[i + 2] ?? 0) - bg[2]!);
      if (off < 30) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error("motif is one flat colour — nothing to crop");
  return [x0, y0, x1 - x0 + 1, y1 - y0 + 1];
}

/** The bounding box padded and then widened to the aspect the map expects, so the motif reaches the
 *  tile undistorted with background on every side. Widening never crops: the deficient axis grows.
 *  A floor's diamond is a square in the ground plane, so the iso map wants a square window however
 *  wide the tile is. */
function windowFor(box: [number, number, number, number], recipe: Recipe, def: DecorDef):
[number, number, number, number] {
  const cx = box[0] + box[2] / 2, cy = box[1] + box[3] / 2;
  let w = box[2] * (recipe.pad ?? 1), h = box[3] * (recipe.pad ?? 1);
  const aspect = recipe.iso ? 1 : def.tile.w / def.tile.h;
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  return [cx - w / 2, cy - h / 2, w, h];
}

function build(recipe: Recipe, def: DecorDef): Canvas {
  const rgba = readFileSync(`${motifDir}/${recipe.motif}.rgba`);
  if (rgba.length !== recipe.motifW * recipe.motifH * 4) {
    throw new Error(`${recipe.motif}.rgba is ${rgba.length} bytes, not ` +
      `${recipe.motifW}x${recipe.motifH}x4 — re-dump it with magick -depth 8 RGBA:`);
  }
  const box = recipe.window ?? boundingBox(rgba, recipe.motifW, recipe.motifH);
  const [wx, wy, ww, wh] = recipe.window ?? windowFor(box, recipe, def);
  console.log(`  motif box ${box.map(Math.round).join(",")} -> window ` +
    `${[wx, wy, ww, wh].map(Math.round).join(",")}`);

  const bg = ((rgba[0]! << 16) | (rgba[1]! << 8) | rgba[2]!) >>> 0;
  const choices = shadesOf(recipe.ramps);
  const { w, h } = def.tile;
  const tile = makeCanvas(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy++) {
        for (let sx = 0; sx < SUPERSAMPLE; sx++) {
          const px = x + (sx + 0.5) / SUPERSAMPLE, py = y + (sy + 0.5) / SUPERSAMPLE;
          // Both maps are periodic on the tile, so the wrap is exact. The iso one carries the
          // motif onto the lattice the floor tessellates on: one motif per diamond, and a step of
          // (+64, 0) or (+32, +16) lands on the same point of it.
          let u: number, v: number;
          if (recipe.iso) {
            const dx = px / w - 0.5, dy = py / h - 0.5;
            u = frac(dx + dy + 0.5); v = frac(dy - dx + 0.5);
          } else {
            u = frac(px / w); v = frac(py / h);
          }
          const mx = Math.round(wx + u * ww), my = Math.round(wy + v * wh);
          let color = bg;
          if (mx >= 0 && my >= 0 && mx < recipe.motifW && my < recipe.motifH) {
            const i = (my * recipe.motifW + mx) * 4;
            color = ((rgba[i]! << 16) | (rgba[i + 1]! << 8) | rgba[i + 2]!) >>> 0;
          }
          if (recipe.ground !== undefined && dist(color, bg) < 900) color = recipe.ground;
          r += (color >> 16) & 0xff; g += (color >> 8) & 0xff; b += color & 0xff;
        }
      }
      const n = SUPERSAMPLE * SUPERSAMPLE;
      const avg = ((Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n)) >>> 0;
      putPixel(tile, x, y, nearest(avg, choices));
    }
  }
  return tile;
}

/** How visible the wrap is: the discontinuity across the tile edge against the mean discontinuity
 *  inside it. Around 1.0 means the seam is no worse than the pattern's own detail. */
function seam(c: Canvas): string {
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
  const fmt = (wrap: number, inter: number): string => `${(wrap / (inter || 1)).toFixed(2)}x`;
  return `x-wrap ${fmt(colDiff(c.w - 1, 0), interCol)}, y-wrap ${fmt(rowDiff(c.h - 1, 0), interRow)}`;
}

const wanted = process.argv.slice(2);
for (const recipe of RECIPES) {
  if (wanted.length > 0 && !wanted.includes(recipe.id)) continue;
  const def = DECOR_CATALOG.find((d) => d.id === recipe.id);
  if (!def) throw new Error(`${recipe.id} has a recipe but no DECOR_CATALOG def`);
  console.log(`${recipe.id}: ${recipe.ramps.join("+")}`);
  const tile = build(recipe, def);

  // decorpass proves the source repeats rather than assuming it, so hand it two periods to check.
  const source = makeCanvas(def.tile.w * 2, def.tile.h * 2);
  for (let y = 0; y < source.h; y++) {
    for (let x = 0; x < source.w; x++) {
      putPixel(source, x, y, getPixel(tile, x % def.tile.w, y % def.tile.h).color);
    }
  }
  writeFileSync(`${sourceDir}${recipe.id}.png`, encodePng(source.w, source.h, source.px));

  const used = new Set<number>();
  for (let i = 0; i < tile.w * tile.h; i++) used.add(getPixel(tile, i % tile.w, (i / tile.w) | 0).color);
  console.log(`  ${used.size} colours of ${shadesOf(recipe.ramps).length} offered, seam ${seam(tile)}`);
  console.log(`  wrote source/${recipe.id}.png (${source.w}x${source.h})`);
}
