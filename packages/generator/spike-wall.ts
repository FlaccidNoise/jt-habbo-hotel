// SPIKE (#270, #260) — mock a wallpapered wall from a reduced tile.
// Proves the claim in #270: a wallpaper stored as (ramp, shade) shades ITSELF on both wall faces.
// The right wall renders the authored shade; the left wall shifts one step darker, which is the
// same left/right relationship every ramp already encodes. One texture, two faces, no second asset.
//
//   node --experimental-strip-types spike-wall.ts <tile.rgba> <WxH> <out.png> [ramp,...]

import { readFileSync, writeFileSync } from "node:fs";
import { encodePng } from "./src/png.ts";
import { makeCanvas, putPixel, getPixel } from "./src/raster.ts";
import { rampByName, luminance } from "./src/style.ts";
import type { Ramp } from "./src/style.ts";
import { WALL_SEG_PX, WALL_TOP_PX } from "@grand/shared";

const SHADES = ["outline", "left", "right", "top", "hi"] as const;
const FACE_LEFT = 0x8e8778, FACE_RIGHT = 0xa39b8a;   // client/src/scene/walls.ts:22

const [tilePath, dimArg, outPath, rampArg] = process.argv.slice(2);
const [tw, th] = dimArg!.split("x").map(Number) as [number, number];
const tile = readFileSync(tilePath!);
const ramps: Ramp[] = (rampArg ?? "plum,gold,ivory").split(",").map((n) => rampByName(n.trim()));

/** Decode a palette colour back to (ramp, shade). This is the encoding a real wallpaper would
 *  store directly — figure sheets already ship indexed rather than RGB (ART-DIRECTION.md). */
const index = new Map<number, [number, number]>();
ramps.forEach((r, ri) => SHADES.forEach((s, si) => index.set(r[s], [ri, si])));

/** Shift every texel one step down the ramp. `outline` has nowhere to go and stays put. */
function shift(color: number, by: number): number {
  const hit = index.get(color);
  if (!hit) return color;
  const [ri, si] = hit;
  return ramps[ri]![SHADES[Math.max(0, si + by)]!]!;
}

const cols = 3;
const pad = 6;
const panelW = WALL_SEG_PX * cols;
const out = makeCanvas(pad + (panelW + pad) * 3, WALL_TOP_PX + pad * 2);

/** Paint one wall panel: flat fill, or the tile repeated with an optional shade shift. */
function panel(x0: number, flat: number | null, by: number): void {
  for (let y = 0; y < WALL_TOP_PX; y++) {
    for (let x = 0; x < panelW; x++) {
      let c: number;
      if (flat !== null) c = flat;
      else {
        const i = ((y % th) * tw + (x % tw)) * 4;
        c = shift(((tile[i]! << 16) | (tile[i + 1]! << 8) | tile[i + 2]!) >>> 0, by);
      }
      putPixel(out, x0 + x, pad + y, c);
    }
  }
}

panel(pad, FACE_RIGHT, 0);                        // today: flat right wall
panel(pad * 2 + panelW, null, 0);                 // wallpaper, right face — authored shade
panel(pad * 3 + panelW * 2, null, -1);            // wallpaper, left face — one step darker

const big = makeCanvas(out.w * 3, out.h * 3);
for (let y = 0; y < big.h; y++) {
  for (let x = 0; x < big.w; x++) {
    const p = getPixel(out, (x / 3) | 0, (y / 3) | 0);
    if (p.alpha !== 0) putPixel(big, x, y, p.color);
  }
}
writeFileSync(outPath!, encodePng(big.w, big.h, big.px));

// The contrast question raised in #270: today's two wall faces sit at 0.87, a ramp's at 0.65.
const meanLuma = (by: number): number => {
  let s = 0, n = 0;
  for (let y = 0; y < th; y++) {
    for (let x = 0; x < tw; x++) {
      const i = (y * tw + x) * 4;
      s += luminance(shift(((tile[i]! << 16) | (tile[i + 1]! << 8) | tile[i + 2]!) >>> 0, by));
      n++;
    }
  }
  return s / n;
};
console.log(`wall segment ${WALL_SEG_PX}x${WALL_TOP_PX}, tile ${tw}x${th}, ${cols} segments shown`);
console.log(`today   FACE_LEFT/FACE_RIGHT luma ratio ${(luminance(FACE_LEFT) / luminance(FACE_RIGHT)).toFixed(2)}`);
console.log(`papered left/right luma ratio          ${(meanLuma(-1) / meanLuma(0)).toFixed(2)}`);
console.log(`wrote ${outPath}`);
