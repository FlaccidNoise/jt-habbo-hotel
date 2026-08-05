import type { FurniDef } from "@grand/shared";
import type { Bundle } from "./compose.ts";
import { getPixel } from "./raster.ts";
import type { Canvas } from "./raster.ts";
import { FLOOR_TONES, PALETTE, luminance } from "./style.ts";

// Validation gates (PIPELINES §2 stage 4). Every gate has a staged known-bad test — a gate
// exists only if a known-bad input actually bounces.

export type GateResult = { ok: true } | { ok: false; gate: string; detail: string };

const fail = (gate: string, detail: string): GateResult => ({ ok: false, gate, detail });

const MIN_CONTRAST = 24;
const GROUND_TOLERANCE = 16;   // half a tile of vertical slack for inset parts

/** Duplicate recipe hashes reject — a re-mint of an existing design is a counterfeit. */
export function gateUniqueness(seen: Set<string>, hash: string): GateResult {
  if (seen.has(hash)) return fail("uniqueness", `recipe hash ${hash.slice(0, 12)}… already published`);
  seen.add(hash);
  return { ok: true };
}

/** Every opaque pixel must come from the curated palette (plus the global outline). */
export function gatePalette(sheet: Canvas): GateResult {
  for (let y = 0; y < sheet.h; y++) {
    for (let x = 0; x < sheet.w; x++) {
      const p = getPixel(sheet, x, y);
      if (p.alpha !== 0 && !PALETTE.has(p.color)) {
        return fail("palette", `off-palette pixel #${p.color.toString(16)} at ${x},${y}`);
      }
    }
  }
  return { ok: true };
}

/** The emitted collision metadata must agree with the catalog def the server places by. */
export function gateFootprint(bundle: Bundle, def: FurniDef): GateResult {
  const m = bundle.meta;
  if (m.footprint.w !== def.w || m.footprint.l !== def.l) {
    return fail("footprint", `metadata ${m.footprint.w}×${m.footprint.l}, def ${def.w}×${def.l}`);
  }
  if (m.stackHeights.join() !== def.stackHeights.join()) {
    return fail("footprint", `stackHeights ${m.stackHeights.join()} ≠ def ${def.stackHeights.join()}`);
  }
  // One z-pixel (1/32 height unit) of slack: drawn height rounds up to whole pixels.
  if (m.drawnHeight > (def.stackHeights[0] ?? 0) + 1 / 32) {
    return fail("footprint", `drawn height ${m.drawnHeight} exceeds collision height ${def.stackHeights[0]}`);
  }
  return { ok: true };
}

/** Grid alignment: every frame has pixels, and its geometry reaches the ground line. */
export function gateBounds(bundle: Bundle): GateResult {
  const { frameW, frameH, dirs } = bundle.meta;
  for (let f = 0; f < dirs.length; f++) {
    let lowest = -1;
    let count = 0;
    for (let y = 0; y < frameH; y++) {
      for (let x = f * frameW; x < (f + 1) * frameW; x++) {
        if (getPixel(bundle.sheet, x, y).alpha === 0) continue;
        count++;
        if (y > lowest) lowest = y;
      }
    }
    if (count === 0) return fail("bounds", `dir ${dirs[f]}: frame is empty`);
    if (lowest < frameH - 1 - GROUND_TOLERANCE) {
      return fail("bounds", `dir ${dirs[f]}: lowest pixel ${lowest} floats above ground ${frameH - 1}`);
    }
  }
  return { ok: true };
}

/** Silhouette pixels must read against both extreme floor tones. */
export function gateContrast(sheet: Canvas): GateResult {
  let sum = 0;
  let n = 0;
  for (let y = 0; y < sheet.h; y++) {
    for (let x = 0; x < sheet.w; x++) {
      if (getPixel(sheet, x, y).alpha === 0) continue;
      const open =
        x === 0 || y === 0 || x === sheet.w - 1 || y === sheet.h - 1 ||
        getPixel(sheet, x - 1, y).alpha === 0 || getPixel(sheet, x + 1, y).alpha === 0 ||
        getPixel(sheet, x, y - 1).alpha === 0 || getPixel(sheet, x, y + 1).alpha === 0;
      if (!open) continue;
      sum += luminance(getPixel(sheet, x, y).color);
      n++;
    }
  }
  if (n === 0) return fail("contrast", "no silhouette pixels");
  const mean = sum / n;
  for (const tone of FLOOR_TONES) {
    if (Math.abs(mean - luminance(tone)) < MIN_CONTRAST) {
      return fail("contrast", `silhouette luma ${mean.toFixed(1)} too close to floor #${tone.toString(16)}`);
    }
  }
  return { ok: true };
}

/** All artifact gates for one bundle, first failure wins. Uniqueness runs at registry level. */
export function runGates(bundle: Bundle, def: FurniDef): GateResult {
  for (const result of [
    gatePalette(bundle.sheet),
    gateFootprint(bundle, def),
    gateBounds(bundle),
    gateContrast(bundle.sheet),
  ]) {
    if (!result.ok) return result;
  }
  return { ok: true };
}
