import { WALL_HEIGHT, WALL_MAX_DEPTH, WALL_SEG_PX, WALL_TOP_PX } from "@grand/shared";
import type { FurniDef, WallDef } from "@grand/shared";
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

interface BBox { minX: number; minY: number; maxX: number; maxY: number }

/** Opaque extent of one frame, in frame-local pixels. Null when the frame is empty. */
function frameBox(bundle: Bundle, f: number): BBox | null {
  const { frameW, frameH } = bundle.meta;
  let box: BBox | null = null;
  for (let y = 0; y < frameH; y++) {
    for (let x = 0; x < frameW; x++) {
      if (getPixel(bundle.sheet, f * frameW + x, y).alpha === 0) continue;
      if (!box) box = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        if (x < box.minX) box.minX = x;
        if (x > box.maxX) box.maxX = x;
        if (y < box.minY) box.minY = y;
        if (y > box.maxY) box.maxY = y;
      }
    }
  }
  return box;
}

/** Grid alignment: every frame has pixels, and its geometry reaches the ground line. Floor only —
 *  a hanging item never touches the ground, so wall bundles run gateWallBounds instead. */
export function gateBounds(bundle: Bundle): GateResult {
  const { frameH, dirs } = bundle.meta;
  for (let f = 0; f < dirs.length; f++) {
    const box = frameBox(bundle, f);
    if (!box) return fail("bounds", `dir ${dirs[f]}: frame is empty`);
    if (box.maxY < frameH - 1 - GROUND_TOLERANCE) {
      return fail("bounds", `dir ${dirs[f]}: lowest pixel ${box.maxY} floats above ground ${frameH - 1}`);
    }
  }
  return { ok: true };
}

// --- wall gates (#203) ----------------------------------------------------------------------
// The floor gates above are untouched: gateFootprint, gateSeat and gateBounds all key off fields
// a wall def does not have. These two replace them for wall bundles and are no weaker — a poster
// floating off the wall, overhanging its span, or standing off it like a table still bounces.

/** Slack allowed between the declared wall plane box and the pixels it must cover. The box is
 *  snapped out to the wall's 2 px lattice, so it can exceed the render by just under 2 px. */
const PLANE_SLACK = 2;

/** The declared wall plane box must agree with the def, sit on the wall's lattice, and describe a
 *  mesh that is actually hung on the wall rather than standing in front of it. */
export function gateWallFit(bundle: Bundle, def: WallDef): GateResult {
  const w = bundle.meta.wall;
  if (!w) return fail("wall_fit", "wall bundle has no wall metadata — re-freeze it through tools/artgen/postpass.ts");
  if (bundle.meta.seatZ !== null) return fail("wall_fit", "a wall item cannot carry a seat surface");
  if (w.span !== def.span) return fail("wall_fit", `metadata span ${w.span}, def span ${def.span}`);
  if (w.planeW !== def.plane.w || w.planeH !== def.plane.h) {
    return fail("wall_fit", `metadata plane ${w.planeW}×${w.planeH}, def plane ${def.plane.w}×${def.plane.h}`);
  }
  if (w.mountU !== def.mount.u || w.mountV !== def.mount.v) {
    return fail("wall_fit", `metadata mount ${w.mountU},${w.mountV}, def mount ${def.mount.u},${def.mount.v}`);
  }
  if (w.mountU % 2 !== 0 || w.planeW % 2 !== 0) {
    return fail("wall_fit",
      `mount u ${w.mountU} and plane width ${w.planeW} must both be even — the wall's 2:1 axis moves ` +
      `a sprite (±1, +0.5) px, so an odd offset lands it half a pixel off the wall`);
  }
  if (w.mountU + w.planeW > def.span * WALL_SEG_PX) {
    return fail("wall_fit",
      `authored at u ${w.mountU} + width ${w.planeW} overhangs its ${def.span}-segment span ` +
      `(${def.span * WALL_SEG_PX} px) — widen span or narrow the mesh`);
  }
  if (w.mountV + w.planeH > WALL_TOP_PX) {
    return fail("wall_fit",
      `authored at v ${w.mountV} + height ${w.planeH} runs past the ${WALL_TOP_PX} px wall — ` +
      `lower the mesh or shorten it`);
  }
  if (w.gap > 1 / 32) {
    return fail("wall_fit",
      `mesh starts ${w.gap} tiles off the wall — a wall part is authored flush at fy 0, not floating`);
  }
  if (w.depth > WALL_MAX_DEPTH) {
    return fail("wall_fit",
      `mesh stands ${w.depth} tiles off the wall, over the ${WALL_MAX_DEPTH} limit — that is floor furni`);
  }
  return { ok: true };
}

/** Every frame has pixels, and the declared plane box covers them snugly. Both frames are checked
 *  against one declaration, so the left and right walls must render the same item. */
export function gateWallBounds(bundle: Bundle): GateResult {
  const { dirs, anchorsX, anchorY, wall } = bundle.meta;
  if (!wall) return fail("wall_bounds", "wall bundle has no wall metadata");
  if (dirs.length !== 2) return fail("wall_bounds", `wall bundles render 2 frames, got ${dirs.length}`);

  const originY = anchorY - WALL_SEG_PX / 2 - WALL_HEIGHT * 32;
  for (let f = 0; f < dirs.length; f++) {
    const box = frameBox(bundle, f);
    if (!box) return fail("wall_bounds", `dir ${dirs[f]}: frame is empty`);
    const originX = anchorsX[f] ?? 0;
    // dir 0 hangs on the right wall and runs +x on screen; dir 6 hangs on the left and runs -x,
    // so its near edge is the far side of the box.
    const rawU = dirs[f] === 0 ? box.minX - originX : originX - (box.maxX + 1);
    const rawV = box.minY - originY - rawU / 2;
    const overU = wall.mountU + wall.planeW - (rawU + (box.maxX + 1 - box.minX));
    const overV = wall.mountV + wall.planeH - (rawV + (box.maxY + 1 - box.minY) - (box.maxX + 1 - box.minX) / 2);
    if (rawU < wall.mountU || overU < 0 || rawV < wall.mountV || overV < 0) {
      return fail("wall_bounds",
        `dir ${dirs[f]}: pixels at u ${rawU}, v ${rawV} escape the declared plane box ` +
        `${wall.mountU},${wall.mountV} ${wall.planeW}×${wall.planeH}`);
    }
    if (rawU - wall.mountU >= PLANE_SLACK || overU >= PLANE_SLACK ||
        rawV - wall.mountV >= PLANE_SLACK || overV >= PLANE_SLACK) {
      return fail("wall_bounds",
        `dir ${dirs[f]}: declared plane box ${wall.planeW}×${wall.planeH} at ${wall.mountU},${wall.mountV} ` +
        `is looser than the render by ${PLANE_SLACK} px or more — re-freeze so it matches the pixels`);
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

/** All artifact gates for one floor bundle, first failure wins. Uniqueness runs at registry level. */
export function runGates(bundle: Bundle, def: FurniDef): GateResult {
  for (const result of [
    gatePalette(bundle.sheet),
    gateFootprint(bundle, def),
    gateSeat(bundle, def),
    gateBounds(bundle),
    gateContrast(bundle.sheet),
  ]) {
    if (!result.ok) return result;
  }
  return { ok: true };
}

/** The same for a wall bundle: palette and contrast are surface-blind, footprint/seat/bounds are
 *  replaced rather than relaxed. */
export function runWallGates(bundle: Bundle, def: WallDef): GateResult {
  for (const result of [
    gatePalette(bundle.sheet),
    gateWallFit(bundle, def),
    gateWallBounds(bundle),
    gateContrast(bundle.sheet),
  ]) {
    if (!result.ok) return result;
  }
  return { ok: true };
}
