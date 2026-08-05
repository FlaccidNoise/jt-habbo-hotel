import type { FurniDef } from "@grand/shared";
import type { Bundle } from "./compose.ts";
import { getPixel } from "./raster.ts";
import type { Canvas } from "./raster.ts";
import { drawOrderMismatch, referenceScenes } from "./scene.ts";
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

/** The emitted collision metadata must agree with the catalog def the server places by.
 *
 *  The height check runs both ways on the artgen path and one way on the box path, because
 *  stackHeights means something different in each. Box-path recipes take it as a design input —
 *  compose.ts feeds it to the archetype builders as ctx.h, so plant_basic legitimately declares
 *  2.0 of headroom it only fills to 1.625. Artgen defs transcribe it from the rendered mesh, so
 *  there any gap is a typo, and a too-high one would leave an invisible collision column. */
export function gateFootprint(bundle: Bundle, def: FurniDef): GateResult {
  const m = bundle.meta;
  if (m.footprint.w !== def.w || m.footprint.l !== def.l) {
    return fail("footprint", `metadata ${m.footprint.w}×${m.footprint.l}, def ${def.w}×${def.l}`);
  }
  // One z-pixel (1/32 height unit) of slack: drawn height rounds up to whole pixels.
  const declared = def.stackHeights[0] ?? 0;
  if (m.drawnHeight > declared + 1 / 32) {
    return fail("footprint", `drawn height ${m.drawnHeight} exceeds collision height ${declared}`);
  }
  if (m.archetype === "artgen" && declared > m.drawnHeight + 1 / 32) {
    return fail("footprint",
      `collision height ${declared} exceeds drawn height ${m.drawnHeight} — an artgen def takes its stackHeights from the mesh`);
  }
  return { ok: true };
}

/** A seated avatar rests at item.z + def.seatHeight (shared/placement.ts). That number is
 *  transcribed by hand, so check it against the seat the artist actually authored: the "seat"
 *  slot on the box path, the prim tagged "seat" on the artgen path. Drift floats the avatar
 *  above the cushion or sinks it into one. */
export function gateSeat(bundle: Bundle, def: FurniDef): GateResult {
  const { seatZ } = bundle.meta;
  if (def.seatHeight === null) {
    return seatZ === null ? { ok: true }
      : fail("seat", `authored seat surface at ${seatZ} but the def says you cannot sit on it`);
  }
  if (seatZ === null) {
    return fail("seat", `def declares seatHeight ${def.seatHeight} but no seat geometry is tagged`);
  }
  if (Math.abs(seatZ - def.seatHeight) > 1 / 32) {
    return fail("seat", `def seatHeight ${def.seatHeight} ≠ authored seat surface ${seatZ}`);
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

/** Draw-order correctness: render the item in a reference scene of adjacent and stacked
 *  neighbours, and diff the painter render against a per-pixel depth test (scene.ts).
 *
 *  It bounces two kinds of failure at once. Inside the sprite, part boxes that no order can
 *  resolve — a leg whose lid stamps over the tabletop, a cushion driven through a backrest.
 *  Between sprites, a whole-object box that disagrees with the geometry it stands for, which is
 *  what sorted a multi-tile item off its origin tile.
 *
 *  Coverage limit: box-path defs only (STARTER_RECIPES). A 3D-assisted def ships frozen pixels
 *  with no boxes to re-render, so nothing here can reach it — those want a stored-reference pixel
 *  diff instead (#233). */
export function gateDrawOrder(bundle: Bundle, def: FurniDef): GateResult {
  if (!bundle.geometry) return { ok: true };
  for (const [q, boxes] of bundle.geometry.entries()) {
    const rotated = q % 2 === 1;
    const scenes = referenceScenes(
      boxes,
      rotated ? def.l : def.w,
      rotated ? def.w : def.l,
      bundle.meta.drawnHeight,
    );
    for (const scene of scenes) {
      const detail = drawOrderMismatch(scene);
      if (detail) return fail("draw-order", `dir ${bundle.meta.dirs[q]}: ${detail}`);
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
    gateSeat(bundle, def),
    gateBounds(bundle),
    gateContrast(bundle.sheet),
    gateDrawOrder(bundle, def),
  ]) {
    if (!result.ok) return result;
  }
  return { ok: true };
}
