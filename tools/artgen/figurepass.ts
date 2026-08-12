// Figure post-pass (#127). Sibling of postpass.ts: reads the same lit + mask raw pairs rig.py
// emits, quantizes on the same fixed linear-luma thresholds so figures and furni read as one
// style, and freezes one bundle per wearable layer.
//
//   node --experimental-strip-types tools/artgen/figurepass.ts <renderDir> [--freeze] [--only <id>]
//
// --only <id> scopes the freeze to one layer (#422). It still builds the canonical body, because
// every gate below measures a layer against it, but it writes only <id> and stops if a layer it
// rebuilt to gate against disagrees with the frozen tree: <renderDir> is shared and accumulating,
// so republishing the rest would push whatever it holds over a freeze made from newer geometry.
// An id that is not a figure layer is a no-op, so `make art PART=<furni-id>` can call this
// unconditionally.
//
// Three things differ from the furni pass.
//
// 1. The sheet is INDEXED, not RGB. Colour is per player — a shirt is worn in any of 12 ramps and
//    a two-slot shirt in any pair — so baking colour here would put the combinatorics back into
//    colour space. Each pixel stores (slot, shade) and the client resolves them through the worn
//    ramps when it bakes the outfit, which it is already doing to composite the layers.
//      R = colour slot: 0-based into the worn colours, then `fixedColors` past the set's own count
//      G = shade index: 0 outline, 1 left, 2 right, 3 top, 4 hi
//      B = 0, reserved
//
// 2. Every layer but the body renders WITH the canonical body present, and everything below
//    `ownFrom` in mask-index order is discarded. Where the body is nearer it won the depth test,
//    so those pixels were never the garment's — which is what lets the client composite with
//    plain alpha-over and no runtime depth.
//
// 3. Some layers are never rendered at all. The face sets (#342) are hd2's own cells with a
//    hand-authored pixel map laid on them, placed by the projection rig.py emits — see facedata.ts
//    for the art and the "face sets" section below for the machinery.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BEARD_AXES, BEARD_SETS, FACE_AXES, FACE_SETS, FIXED_RAMPS, GEOMETRY, INKS, REFERENCE_DIR,
  REFERENCE_FRAME, facePixels,
} from "./facedata.ts";
import type { AxisName, FacePicks, FaceView, FixedRamp, InkCode, InkSlot } from "./facedata.ts";
import { FIGUREDATA_VERSION, FIGURE_SETS, setById } from "../../packages/shared/src/figuredata.ts";
import type { FigureSet, LayerType } from "../../packages/shared/src/figuredata.ts";
import {
  GARMENT_TYPES, gateNearDup, nearDupPairs, silhouetteOf,
} from "../../packages/generator/src/gates.ts";
import type { FigureSilhouette } from "../../packages/generator/src/gates.ts";
import { decodePng, encodePng } from "../../packages/generator/src/png.ts";
import { blit, getPixel, makeCanvas, putPixel } from "../../packages/generator/src/raster.ts";
import type { Canvas } from "../../packages/generator/src/raster.ts";
import { reviewFigureIslands } from "../../packages/generator/src/review.ts";
import {
  FLOOR_TONES, GENERATOR_VERSION, RAMP_SHADES, STYLE_VERSION,
} from "../../packages/generator/src/style.ts";

const RES = 256;
const ALPHA_MIN = 128;
const THRESH_LEFT = 0.30, THRESH_RIGHT = 0.62, THRESH_TOP = 0.80;
const SHADE_OUTLINE = 0, SHADE_LEFT = 1, SHADE_RIGHT = 2, SHADE_TOP = 3, SHADE_HI = 4;

const renderDir = process.argv[2] ?? "/tmp/artgen";
const freeze = process.argv.includes("--freeze");
const frozenDir = new URL("./frozen/figure/", import.meta.url).pathname;
const onlyAt = process.argv.indexOf("--only");
const only = onlyAt < 0 ? null : process.argv[onlyAt + 1] ?? null;
if (onlyAt >= 0 && !only) {
  console.error("--only needs a layer id, as in `--only ha10`");
  process.exit(1);
}

function toLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Mask channels render at exactly {0, 187, 255} (linear {0, .5, 1} through sRGB). */
function maskDigit(v: number): number {
  return v < 94 ? 0 : v < 221 ? 1 : 2;
}

interface FigurePrim { slot: number; bone: string; part: string }
/** Where the face goes in this frame, or null with the face turned away. rig.py projects it: a
 *  feature this small cannot be mesh — an eye is one pixel, and a one-pixel prim quantizes to
 *  whatever its own shading lands on — so the head carries the brow and nose and the face is
 *  drawn here (#311). #342 keeps the projection and throws away the four-pixel stamp it used to
 *  drive: the anchor now places a hand-authored pixel map (facedata.ts) instead. `in` is unused
 *  since the map is drawn per view, and is left because rig.py emits it. */
interface FaceAnchor {
  eyes: Array<{ x: number; y: number; in: number }>;
  mouth: { x: number; y: number } | null;
}
interface FigureFrame {
  frame: string; dir: number; anchorY: number; face: FaceAnchor | null;
  rgba: string; mask: string;
}
interface FigurePart {
  frames: FigureFrame[];
  prims: FigurePrim[];
  ownFrom: number;
  skullPrim: number;   // mask index of the skull, the only prim a face pixel is painted on
  src: unknown;
}

const meta = JSON.parse(readFileSync(join(renderDir, "meta.json"), "utf8")) as {
  figures: Record<string, FigurePart>;
  figureCanvas: { w: number; h: number; height: number; frames: string[]; sitFootDrop: number };
};

const CANVAS = meta.figureCanvas;
const FRAMES = CANVAS.frames;
const ANCHOR_X = CANVAS.w >> 1;

/** The canonical body every garment is cut against, in draw order. Mirrors rig.py HOLDOUT_PARTS. */
const HOLDOUT_IDS = ["bd1", "hd2"];
const HEAD_ID = "hd2";

const pack = (slot: number, shade: number): number => (slot << 16) | (shade << 8);
const unpackSlot = (color: number): number => (color >> 16) & 0xff;
const unpackShade = (color: number): number => (color >> 8) & 0xff;

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
const NEIGHBOURS8 = [...ORTHO, [1, 1], [-1, -1], [1, -1], [-1, 1]] as const;

/** The design's stand-frame sheet rows for the head cleanup: interior lines come off above the
 *  chin, lone catchlights come off across the cheek band, and the neck row at 44 stays. */
const CLEAN_LINE_TO = 43, CLEAN_HI_FROM = 34, CLEAN_HI_TO = 43;

/** hd2 ships faceless (#342), so the pixels that were drawing a face by accident come off and the
 *  hand-authored art lands on a clean skull. Two rules, ported from the handoff's baker.js
 *  patchHead: an interior shade-0 pixel above the chin line is a prim boundary the head should not
 *  show, and a lone `hi` in the cheek band is a specular the skull ball threw onto one pixel.
 *  Both are repainted with the modal shade of their neighbours. The silhouette ring is kept —
 *  that edge is the head's outline, not a line across its face.
 *
 *  Membership is the HEAD's own prims, not the frame's alpha, so a garment render that also
 *  contains the body cleans exactly the same pixels the head layer does and gateHoldout still
 *  compares like with like. `shift` carries the design's rows onto this frame: the head sits 9 px
 *  lower sitting and 2 lower on a walk down-step.
 *
 *  Measured over the whole sheet: the interior-line rule fires 0 times and the catchlight rule 12.
 *  The line rule finds nothing because the boundary pass above already exempts head-to-head prim
 *  pairs — it is the guard that keeps that exemption honest, not the rule doing the work here. */
function patchHead(cell: Canvas, primAt: Int32Array, part: FigurePart, shift: number): void {
  const isHead = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= CANVAS.w || y >= CANVAS.h) return false;
    const p = primAt[y * CANVAS.w + x]!;
    return p >= 0 && part.prims[p]!.part === HEAD_ID;
  };
  const shadeAt = (x: number, y: number): number => unpackShade(getPixel(cell, x, y).color);
  const fixes: Array<[number, number, number]> = [];
  for (let y = 0; y < CANVAS.h - 1; y++) {
    for (let x = 0; x < CANVAS.w; x++) {
      if (!isHead(x, y)) continue;
      let edge = false;
      for (let dy = -1; dy <= 1 && !edge; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!isHead(x + dx, y + dy)) { edge = true; break; }
        }
      }
      if (edge) continue;
      const s = shadeAt(x, y);
      const line = s === SHADE_OUTLINE && y < CLEAN_LINE_TO + shift;
      let hiNeighbours = 0;
      if (s === SHADE_HI) {
        for (const [dx, dy] of ORTHO) {
          if (isHead(x + dx, y + dy) && shadeAt(x + dx, y + dy) === SHADE_HI) hiNeighbours++;
        }
      }
      const stray = s === SHADE_HI && hiNeighbours < 2
        && y >= CLEAN_HI_FROM + shift && y < CLEAN_HI_TO + shift;
      if (!line && !stray) continue;
      const counts = [0, 0, 0, 0, 0];
      for (const [dx, dy] of NEIGHBOURS8) {
        if (!isHead(x + dx, y + dy)) continue;
        const ns = shadeAt(x + dx, y + dy);
        if (ns !== SHADE_OUTLINE && !(ns === SHADE_HI && stray)) counts[ns]!++;
      }
      let best = SHADE_RIGHT, most = -1;
      for (let i = 1; i < 5; i++) if (counts[i]! > most) { most = counts[i]!; best = i; }
      fixes.push([x, y, best]);
    }
  }
  for (const [x, y, s] of fixes) {
    putPixel(cell, x, y, pack(unpackSlot(getPixel(cell, x, y).color), s));
  }
  headCleaned += fixes.length;
}

/** Pixels the cleanup repainted, reported with the layers: hd2 moving is intentional exactly once
 *  and this is the number that says by how much. */
let headCleaned = 0;

/** One 64x112 frame of one layer, in (slot, shade) indices. `keepFrom` drops the holdout body.
 *  `primAt` comes back with the pixels: the face pass has to know which prim won where. */
function renderFrame(
  part: FigurePart, f: FigureFrame, keepFrom: number, shift: number,
): { cell: Canvas; primAt: Int32Array } {
  const raw = readFileSync(join(renderDir, f.rgba));
  const mask = readFileSync(join(renderDir, f.mask));
  const frame = makeCanvas(CANVAS.w, CANVAS.h);
  const primAt = new Int32Array(CANVAS.w * CANVAS.h).fill(-1);

  for (let cy = 0; cy < CANVAS.h; cy++) {
    // The figure root projects to the render centre, and the pose declares where that point sits
    // in the frame. Both feet-on-ground and hip-on-seat therefore land on the same anchor rule.
    const ry = cy + RES / 2 - f.anchorY;
    if (ry < 0 || ry >= RES) continue;
    for (let cx = 0; cx < CANVAS.w; cx++) {
      const rx = cx + RES / 2 - ANCHOR_X;
      if (rx < 0 || rx >= RES) continue;
      const i = (ry * RES + rx) * 4;
      if ((raw[i + 3] ?? 0) < ALPHA_MIN) continue;
      const n = maskDigit(mask[i] ?? 0) + 3 * maskDigit(mask[i + 1] ?? 0)
        + 9 * maskDigit(mask[i + 2] ?? 0);
      if (n <= keepFrom || n > part.prims.length) continue;
      const prim = n - 1;
      const t = 0.299 * toLinear(raw[i] ?? 0) + 0.587 * toLinear(raw[i + 1] ?? 0)
        + 0.114 * toLinear(raw[i + 2] ?? 0);
      const shade = t < THRESH_LEFT ? SHADE_LEFT : t < THRESH_RIGHT ? SHADE_RIGHT
        : t < THRESH_TOP ? SHADE_TOP : SHADE_HI;
      putPixel(frame, cx, cy, pack(part.prims[prim]!.slot, shade));
      primAt[cy * CANVAS.w + cx] = prim;
    }
  }

  // Interior detail lines along prim boundaries, then the silhouette outline — the same two rules
  // postpass applies, so a sleeve seam reads like a chair seam. Except within the head: outlining
  // the nose and brow boxes framed the whole face in near-black and drowned the one-pixel eyes
  // (#311), so the face carries shading and stamps only, and the nose keeps its silhouette edge
  // in profile from the outline pass below.
  const facial = (a: number, b: number): boolean =>
    part.prims[a]!.part === HEAD_ID && part.prims[b]!.part === HEAD_ID;
  for (let y = 0; y < CANVAS.h; y++) {
    for (let x = 0; x < CANVAS.w; x++) {
      const p = primAt[y * CANVAS.w + x]!;
      if (p < 0) continue;
      const right = x + 1 < CANVAS.w ? primAt[y * CANVAS.w + x + 1]! : -1;
      const down = y + 1 < CANVAS.h ? primAt[(y + 1) * CANVAS.w + x]! : -1;
      if ((right >= 0 && right !== p && !facial(p, right))
        || (down >= 0 && down !== p && !facial(p, down))) {
        putPixel(frame, x, y, pack(part.prims[p]!.slot, SHADE_OUTLINE));
      }
    }
  }
  for (let y = 0; y < CANVAS.h; y++) {
    for (let x = 0; x < CANVAS.w; x++) {
      const here = getPixel(frame, x, y);
      if (here.alpha === 0) continue;
      const open =
        x === 0 || y === 0 || x === CANVAS.w - 1 || y === CANVAS.h - 1 ||
        getPixel(frame, x - 1, y).alpha === 0 || getPixel(frame, x + 1, y).alpha === 0 ||
        getPixel(frame, x, y - 1).alpha === 0 || getPixel(frame, x, y + 1).alpha === 0;
      if (open) putPixel(frame, x, y, pack(unpackSlot(here.color), SHADE_OUTLINE));
    }
  }

  // No face here any more. hd2 is one bare skull and the faces are their own sets (#342), which
  // is also what keeps this pass and gateHoldout's combined re-render identical: neither draws one.
  patchHead(frame, primAt, part, shift);
  return { cell: frame, primAt };
}

function frameOf(part: FigurePart, frame: string, dir: number): FigureFrame {
  const f = part.frames.find((q) => q.frame === frame && q.dir === dir);
  if (!f) throw new Error(`no frame ${frame} dir ${dir}`);
  return f;
}

const partIds = Object.keys(meta.figures);
const layers = new Map<string, Canvas[]>();   // partId -> frames in (row, col) order
const bundles: Array<Record<string, unknown>> = [];
const sheets = new Map<string, Uint8Array>();  // partId -> encoded sheet, frozen after the gates
const faceIds: string[] = [];                  // the hd2-derived layers, filled by the face pass
let failures = 0;

const figuresPath = join(frozenDir, "figures.json");
interface FrozenDoc {
  canvas: Record<string, unknown>;
  palette: Record<string, number[]>;
  layers: Array<Record<string, unknown>>;
}
const frozenDoc: FrozenDoc | null = existsSync(figuresPath)
  ? JSON.parse(readFileSync(figuresPath, "utf8")) as FrozenDoc
  : null;

/** Which rendered layers this run builds. Under --only that is the named one plus the canonical
 *  body: registration, height and holdout all measure a layer against bd1+hd2, so a scoped run
 *  that skipped them would print PASS for gates that never looked at anything. */
let build = partIds;
if (only !== null) {
  const known = new Set([...partIds, ...(frozenDoc?.layers ?? []).map((l) => l.partId as string)]);
  if (!known.has(only)) {
    console.log(`${only}: not a figure layer — figure pass skipped`);
    process.exit(0);
  }
  const missing = HOLDOUT_IDS.filter((id) => !partIds.includes(id));
  if (missing.length > 0) {
    console.error(
      `--only ${only}: ${renderDir} holds no ${missing.join(" or ")} render, and every figure ` +
      `gate measures a layer against the canonical body. Run \`make art\` once with no PART= to ` +
      `fill ${renderDir}, then re-run this.`,
    );
    process.exit(1);
  }
  build = [...new Set([...HOLDOUT_IDS, ...(partIds.includes(only) ? [only] : [])])];
}

/** The head's vertical position in a frame, read off the projection rig.py already emits. It is
 *  the same for all eight directions — yaw turns the head, it does not raise it — so dir 3, the
 *  one direction that always has a face, speaks for the frame. */
function headRow(frame: string): number {
  const head = meta.figures[HEAD_ID];
  if (!head) return 0;
  const face = frameOf(head, frame, 3).face;
  return face ? Math.floor(faceOrigin(face).y) : 0;
}

/** The point the authored art is registered against: the mean of the eyes rig.py placed. One
 *  point, not one per eye — the drawing is rigid and the eyes are what it is drawn around. */
function faceOrigin(face: FaceAnchor): { x: number; y: number } {
  let x = 0, y = 0;
  for (const eye of face.eyes) { x += eye.x; y += eye.y; }
  return { x: x / face.eyes.length, y: y / face.eyes.length };
}

const headShift = new Map(FRAMES.map((f) => [f, headRow(f) - headRow(REFERENCE_FRAME)]));

/** Freeze one layer: sheet, bundle, png. `recipe` is hashed as provenance for the pixels, so it
 *  carries whatever decides them — the mesh for a rendered layer, the authored map for a face. */
function emit(
  id: string, set: FigureSet, cells: Canvas[], anchorY: number[],
  recipe: Record<string, unknown>, fixedColors?: readonly string[],
): void {
  const sheet = makeCanvas(CANVAS.w * 8, CANVAS.h * FRAMES.length);
  for (const [i, cell] of cells.entries()) {
    blit(sheet, cell, (i % 8) * CANVAS.w, ((i / 8) | 0) * CANVAS.h);
  }
  layers.set(id, cells);
  bundles.push({
    partId: id, setId: set.id, type: set.type, name: set.name, slots: set.slots, hides: set.hides,
    ...(fixedColors ? { fixedColors } : {}),
    sheet: `${id}.png`,
    frameW: CANVAS.w, frameH: CANVAS.h, frames: FRAMES, dirs: [0, 1, 2, 3, 4, 5, 6, 7],
    anchorX: ANCHOR_X, anchorY,
    figureHeight: CANVAS.height,
    styleVersion: STYLE_VERSION, generatorVersion: GENERATOR_VERSION,
    figuredataVersion: FIGUREDATA_VERSION,
    recipeHash: createHash("sha256").update(JSON.stringify(recipe)).digest("hex"),
    pixelHash: createHash("sha256").update(sheet.px).digest("hex"),
  });

  // The render dir gets the sheet either way; the frozen tree gets it only after the gates run,
  // and only for the layers this invocation is allowed to write.
  const png = encodePng(sheet.w, sheet.h, sheet.px);
  writeFileSync(join(renderDir, `${id}.png`), png);
  sheets.set(id, png);
}

/** hd2's own cells, kept whole. Every face set is this skull with a different map laid on it, so
 *  it is rendered once — and the prim map comes with it, because a face pixel is only allowed to
 *  land on the head. */
const headCells: Array<{ cell: Canvas; primAt: Int32Array }> = [];
let headRepaint = 0;

for (const id of build) {
  const part = meta.figures[id]!;
  const setId = Number(id.replace(/^[a-z]+/, ""));
  const set = setById(setId);
  if (!set) {
    console.error(`${id}: no figuredata set ${setId} in packages/shared/src/figuredata.ts`);
    failures++;
    continue;
  }
  const type = id.replace(/\d+$/, "") as LayerType;
  if (set.type !== type) {
    console.error(`${id}: figuredata set ${setId} is type "${set.type}", not "${type}"`);
    failures++;
    continue;
  }

  const cells: Canvas[] = [];
  const anchorY: number[] = [];
  for (const frame of FRAMES) {
    anchorY.push(frameOf(part, frame, 0).anchorY);
    for (let dir = 0; dir < 8; dir++) {
      const out = renderFrame(part, frameOf(part, frame, dir), part.ownFrom,
        headShift.get(frame) ?? 0);
      cells.push(out.cell);
      if (id === HEAD_ID) headCells.push(out);
    }
  }

  const slotsUsed = new Set(part.prims.slice(part.ownFrom).map((p) => p.slot));
  if (Math.max(...slotsUsed) >= set.slots) {
    console.error(
      `${id}: mesh uses slot ${Math.max(...slotsUsed)} but figuredata set ${setId} declares ` +
      `slots: ${set.slots}. Raise it, or drop the slot from the mesh.`,
    );
    failures++;
  }

  emit(id, set, cells, anchorY, {
    id, setId, prims: part.prims, src: part.src, canvas: CANVAS,
    styleVersion: STYLE_VERSION, generatorVersion: GENERATOR_VERSION,
    figuredataVersion: FIGUREDATA_VERSION,
  });
  if (id === HEAD_ID) headRepaint = headCleaned;
}

// ---- face sets (#342) -------------------------------------------------------------------------
// Faces are hd SETS, the model Habbo itself uses: hd stays one mesh forever, and a face set is
// that same skull plus a hand-authored feature map. So a face set is not rendered — Blender never
// sees one. It is hd2's own cells with a map laid on them, which is why eight faces cost no render
// time and why hats stay non-combinatorial. Facial hair is the same machinery on a bare sheet.

/** Where one authored pixel ended up. `head` painted; `clip` fell off the silhouette, which the
 *  art does on purpose at the profile jaw and the design's own painter did too; `other` landed on
 *  a part that is not the head, which is the shape a moved projection takes and never allowed. */
interface FaceStamp { x: number; y: number; code: InkCode; on: "head" | "clip" | "other" }
interface FaceCell {
  partId: string; frame: string; dir: number;
  placed: FaceStamp[];
  skull: { top: number; bottom: number } | null;
}
const faceCells: FaceCell[] = [];
const faceMissed: string[] = [];

/** The stand-frame anchor each view was drawn against. Subtracting it is what makes the authored
 *  absolute coordinates FaceAnchor-relative: what facedata stores as x=27 is stored as "3.9 px
 *  left of the eye line", and this frame's projection says where that is. */
const viewOrigin = new Map<FaceView, { x: number; y: number }>();
for (const [view, dir] of Object.entries(REFERENCE_DIR)) {
  const head = meta.figures[HEAD_ID];
  const face = head ? frameOf(head, REFERENCE_FRAME, dir).face : null;
  if (face) viewOrigin.set(view as FaceView, faceOrigin(face));
}

/** The skull's rows in this cell. The feature-bounds gate holds the whole face inside its lower
 *  half, which is what stops a future set creeping onto the cranium a hat has to sit on. */
function skullBox(primAt: Int32Array, part: FigurePart): { top: number; bottom: number } | null {
  let top = CANVAS.h, bottom = -1;
  for (let y = 0; y < CANVAS.h; y++) {
    for (let x = 0; x < CANVAS.w; x++) {
      if (primAt[y * CANVAS.w + x]! + 1 !== part.skullPrim) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return bottom < 0 ? null : { top, bottom };
}

function inkSlot(slot: InkSlot, set: FigureSet, label: string): number {
  if (slot === "own") return 0;
  if (slot === "iris") {
    if (set.slots < 2) {
      console.error(`${label}: iris ink needs a second colour slot, set ${set.id} declares ` +
        `${set.slots}. Raise slots in figuredata, or drop the iris from the art.`);
      failures++;
      return -1;
    }
    return 1;
  }
  return set.slots + FIXED_RAMPS.indexOf(slot);
}

function buildFaceLayer(
  id: string, set: FigureSet, picks: FacePicks, axes: readonly AxisName[], base: "head" | "bare",
): void {
  const head = meta.figures[HEAD_ID]!;
  const cells: Canvas[] = [];
  const anchorY: number[] = [];
  const usedFixed = new Set<FixedRamp>();
  for (const [rowIndex, frame] of FRAMES.entries()) {
    anchorY.push(frameOf(head, frame, 0).anchorY);
    for (let dir = 0; dir < 8; dir++) {
      const source = headCells[rowIndex * 8 + dir]!;
      const cell = makeCanvas(CANVAS.w, CANVAS.h);
      if (base === "head") blit(cell, source.cell, 0, 0);
      cells.push(cell);

      const label = `${id} ${frame} d${dir}`;
      const record: FaceCell = {
        partId: id, frame, dir, placed: [], skull: skullBox(source.primAt, head),
      };
      faceCells.push(record);

      const drawn = facePixels(GEOMETRY, picks, dir, axes);
      if (!drawn || drawn.pixels.length === 0) continue;
      const face = frameOf(head, frame, dir).face;
      if (!face) {
        faceMissed.push(`${label}: art is authored for a direction rig.py turns the face away from`);
        continue;
      }

      const ref = viewOrigin.get(drawn.view);
      if (!ref) {
        faceMissed.push(`${label}: view ${drawn.view} has no ${REFERENCE_FRAME} anchor at dir ` +
          `${REFERENCE_DIR[drawn.view]} — rig.py stopped projecting the face there`);
        continue;
      }
      const origin = faceOrigin(face);
      // A mirrored direction is the drawn view reflected in the sheet, x' = 63 - x. Place it in
      // the view's own unmirrored space against the reflected anchor and then flip, so the result
      // is the reflection exactly: rig.py puts dir 4's anchor at CANVAS.w minus dir 2's, and the
      // reflection therefore lands on the pixel grid instead of half a pixel off it.
      const ox = (drawn.mirror ? CANVAS.w - origin.x : origin.x) - ref.x;
      const oy = origin.y - ref.y;
      for (const [ax, ay, code] of drawn.pixels) {
        const drawnX = Math.floor(ax + ox);
        const x = drawn.mirror ? CANVAS.w - 1 - drawnX : drawnX;
        const y = Math.floor(ay + oy);
        const prim = x < 0 || y < 0 || x >= CANVAS.w || y >= CANVAS.h
          ? -1 : source.primAt[y * CANVAS.w + x]!;
        const owner = prim < 0 ? null : head.prims[prim]!.part;
        if (owner !== HEAD_ID) {
          record.placed.push({ x, y, code, on: owner === null ? "clip" : "other" });
          if (owner !== null) faceMissed.push(`${label} ${code} at ${x},${y}: ${owner} there`);
          continue;
        }
        const ink = INKS[code];
        const slot = inkSlot(ink.slot, set, label);
        if (slot < 0) continue;
        if (ink.slot !== "own" && ink.slot !== "iris") usedFixed.add(ink.slot);
        putPixel(cell, x, y, pack(slot, ink.shade));
        record.placed.push({ x, y, code, on: "head" });
      }
    }
  }

  const lastFixed = Math.max(-1, ...[...usedFixed].map((n) => FIXED_RAMPS.indexOf(n)));
  // picks/axes are just variant names — editing GEOMETRY under an unchanged name would leave the
  // recipe looking unchanged (#424). resolved is the actual authored pixels those names point at,
  // one view per REFERENCE_DIR entry since dirs 4/5 draw the same content as 2/1, mirrored.
  const resolved = Object.fromEntries(
    (Object.entries(REFERENCE_DIR) as Array<[FaceView, number]>).map(
      ([view, dir]) => [view, facePixels(GEOMETRY, picks, dir, axes)?.pixels ?? []],
    ),
  );
  emit(id, set, cells, anchorY, {
    id, setId: set.id, base, prims: head.prims, src: head.src, picks, axes, geometry: "A", resolved,
    canvas: CANVAS, styleVersion: STYLE_VERSION, generatorVersion: GENERATOR_VERSION,
    figuredataVersion: FIGUREDATA_VERSION,
  }, lastFixed < 0 ? undefined : FIXED_RAMPS.slice(0, lastFixed + 1));
}

if (headCells.length === FRAMES.length * 8) {
  const authored: Array<[number, FacePicks, readonly AxisName[], "head" | "bare"]> = [
    ...Object.entries(FACE_SETS).map(([id, picks]) =>
      [Number(id), picks, FACE_AXES, "head"] as [number, FacePicks, readonly AxisName[], "head"]),
    ...Object.entries(BEARD_SETS).map(([id, picks]) =>
      [Number(id), picks, BEARD_AXES, "bare"] as [number, FacePicks, readonly AxisName[], "bare"]),
  ];
  for (const [setId, picks, axes, base] of authored) {
    const set = setById(setId);
    if (!set) {
      console.error(`face set ${setId}: no figuredata set — facedata.ts and figuredata.ts disagree`);
      failures++;
      continue;
    }
    faceIds.push(`${set.type}${setId}`);
    buildFaceLayer(`${set.type}${setId}`, set, picks, axes, base);
  }
} else if (layers.has(HEAD_ID)) {
  console.error(`${HEAD_ID}: ${headCells.length} cells rendered, want ${FRAMES.length * 8} — no ` +
    `face sets built`);
  failures++;
}

// ---- gates ----------------------------------------------------------------------------------

interface GateResult { ok: boolean; gate?: string; detail?: string }
const pass: GateResult = { ok: true };
const fail = (gate: string, detail: string): GateResult => ({ ok: false, gate, detail });

const cellIndex = (frame: string, dir: number): number => FRAMES.indexOf(frame) * 8 + dir;

/** Every layer must agree with the body about where the anchor is, frame by frame. A garment one
 *  pixel out registers wrong on every avatar wearing it, in every room, forever. */
function gateRegistration(): GateResult {
  const body = meta.figures["bd1"];
  if (!body) return fail("registration", "no bd1 to register against");
  for (const id of build) {
    for (const frame of FRAMES) {
      for (let dir = 0; dir < 8; dir++) {
        const a = frameOf(body, frame, dir).anchorY;
        const b = frameOf(meta.figures[id]!, frame, dir).anchorY;
        if (a !== b) {
          return fail("registration", `${id} ${frame} d${dir}: anchorY ${b}, bd1 says ${a}`);
        }
      }
    }
  }
  return pass;
}

/** No layer may leave the frame: a clipped hat is silently cropped on every wearer. */
function gateBounds(): GateResult {
  for (const [id, cells] of layers) {
    for (const [i, cell] of cells.entries()) {
      for (let y = 0; y < cell.h; y++) {
        for (let x = 0; x < cell.w; x++) {
          if (getPixel(cell, x, y).alpha === 0) continue;
          if (x === 0 || y === 0 || x === cell.w - 1 || y === cell.h - 1) {
            return fail("bounds",
              `${id} ${FRAMES[(i / 8) | 0]} d${i % 8}: ink touches the frame edge at ${x},${y}`);
          }
        }
      }
    }
  }
  return pass;
}

/** The standing figure is 80 px, pinned in ART-DIRECTION against the shipped seat heights. The
 *  crown is hd2's and the soles are bd1's, so this measures the pair. */
function gateFigureHeight(): GateResult {
  const cells = ["bd1", "hd2"].map((id) => layers.get(id));
  if (cells.some((c) => !c)) return pass;   // partial render, nothing to measure
  const i = cellIndex("stand", 2);
  let top = CANVAS.h, bottom = -1;
  for (const set of cells) {
    const cell = set![i]!;
    for (let y = 0; y < cell.h; y++) {
      for (let x = 0; x < cell.w; x++) {
        if (getPixel(cell, x, y).alpha === 0) continue;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  const anchor = frameOf(meta.figures["bd1"]!, "stand", 2).anchorY;
  const height = anchor - top;
  // Inclusive of the anchor row itself, so an 80 px figure spans 81 rows.
  if (Math.abs(height - (CANVAS.height + 1)) > 1) {
    return fail("figureHeight",
      `standing crown is ${height} px above the anchor, want ${CANVAS.height + 1} +/- 1`);
  }
  return pass;
}

/** The compositing model itself. Layering the separately-rendered layers must reproduce the
 *  render that contained them all — which is the same file, kept unfiltered. A garment rendered
 *  WITHOUT its holdout paints pixels the body owns, and that shows up here as a mismatch away
 *  from any layer boundary.
 *
 *  Boundary pixels are exempt and cannot be otherwise: two separately-antialiased silhouette
 *  edges never compose into one interior edge. Measured residue is ~0.1% of lit pixels, all
 *  boundary-adjacent (see the use_shadows note in rig.py). */
function gateHoldout(): GateResult {
  // ONE garment at a time. A garment's render contains the holdout body plus that garment and
  // nothing else, so that is the only composite it can be checked against. Garment-against-
  // garment has no reference render and needs none: the holdout set is the body by design, and
  // the per-set hides rules are what keep it that way.
  const body = HOLDOUT_IDS.filter((id) => layers.has(id));
  for (const id of build) {
    if (HOLDOUT_IDS.includes(id) || !layers.has(id)) continue;
    const part = meta.figures[id]!;
    const stackIds = [...body, id];
    let interiorBad = 0, worst = "";
    for (const frame of FRAMES) {
      for (let dir = 0; dir < 8; dir++) {
        const combined = renderFrame(part, frameOf(part, frame, dir), 0,
          headShift.get(frame) ?? 0).cell;
        const stack = makeCanvas(CANVAS.w, CANVAS.h);
        const owner = new Int32Array(CANVAS.w * CANVAS.h).fill(-1);
        for (const [n, layerId] of stackIds.entries()) {
          const cell = layers.get(layerId)![cellIndex(frame, dir)]!;
          for (let y = 0; y < CANVAS.h; y++) {
            for (let x = 0; x < CANVAS.w; x++) {
              const p = getPixel(cell, x, y);
              if (p.alpha === 0) continue;
              putPixel(stack, x, y, p.color);
              owner[y * CANVAS.w + x] = n;
            }
          }
        }
        for (let y = 1; y < CANVAS.h - 1; y++) {
          for (let x = 1; x < CANVAS.w - 1; x++) {
            const a = getPixel(stack, x, y), b = getPixel(combined, x, y);
            if (a.alpha === b.alpha && a.color === b.color) continue;
            const me = owner[y * CANVAS.w + x]!;
            const boundary = [-1, 1, -CANVAS.w, CANVAS.w].some(
              (d) => owner[y * CANVAS.w + x + d] !== me,
            );
            if (boundary) continue;
            interiorBad++;
            if (!worst) worst = `${frame} d${dir} at ${x},${y}`;
          }
        }
      }
    }
    if (interiorBad > 0) {
      return fail("holdout",
        `${id}: ${interiorBad} composited pixel(s) disagree with its own combined render away ` +
        `from any layer boundary (first: ${worst}). It was rendered without its holdout body.`);
    }
  }
  return pass;
}

// dir 3 looks straight at the camera and dir 7 straight away. Dirs 1 and 5 are the profiles: they
// keep one eye and lose the other, which the authored art now states outright.
const FACE_DIRS = [2, 3, 4], BLIND_DIRS = [0, 6, 7], PROFILE_DIRS = [1, 5];
const EYE_CODES: readonly InkCode[] = ["W", "U", "I"];

/** The brow is allowed this far above the skull's midline and no further. The line comes off the
 *  art: stand dir 3 measures the skull ball at rows 21-44, midline 32, and the heaviest authored
 *  brow at row 31. One row of slack over that, so a brow may sit on the ridge and nothing may
 *  climb the dome. */
const BROW_HEADROOM = 2;

/** The 8-connected pieces of a set of placed pixels. Two uses: a profile has exactly one eye, and
 *  a pixel the silhouette clipped has to still hang off a piece that landed. */
function blobs(of: readonly FaceStamp[]): FaceStamp[][] {
  const key = (s: FaceStamp): number => s.y * CANVAS.w + s.x;
  const at = new Map(of.map((s) => [key(s), s]));
  const seen = new Set<number>();
  const found: FaceStamp[][] = [];
  for (const start of of) {
    if (seen.has(key(start))) continue;
    seen.add(key(start));
    const group = [start], queue = [start];
    while (queue.length > 0) {
      const s = queue.pop()!;
      for (const [dx, dy] of NEIGHBOURS8) {
        const k = (s.y + dy) * CANVAS.w + s.x + dx;
        const next = at.get(k);
        if (!next || seen.has(k)) continue;
        seen.add(k);
        group.push(next);
        queue.push(next);
      }
    }
    found.push(group);
  }
  return found;
}

/** The face is the one feature no other gate can see: it is placed from a projection rather than
 *  rendered, so a projection that has moved paints eyes on a shoulder, or on nothing, and every
 *  avatar wearing the set wears the mistake.
 *
 *  Six claims. No authored pixel lands on a part that is not the head, and one the silhouette
 *  clips still hangs off a piece of the drawing that did land — the profile mouth overshoots the
 *  jaw by two pixels as drawn, and the design's own painter clipped it the same way. A face turned
 *  away has nothing on it. A profile has exactly one eye, which the rig used to decide and the art
 *  now asserts. A white and a pupil come as a pair, and the three-quarters, which every set draws
 *  through the same open eye, must have both. The block stays out of hat space. And every ramp the
 *  art names exists, so the tonal fallback the design rejected is never reachable. */
function gateFace(): GateResult {
  for (const ramp of new Set<string>(FIXED_RAMPS)) {
    if (!RAMP_SHADES.some((s) => s.ramp === ramp)) {
      return fail("face", `face art names ramp "${ramp}", which the palette does not have — a ` +
        `face may never fall back to a tonal approximation`);
    }
  }
  if (faceMissed.length > 0) {
    return fail("face", `${faceMissed.length} face pixel(s) landed off the head — rig.py's ` +
      `projected anchor has moved under the art (first: ${faceMissed[0]})`);
  }
  if (faceCells.length === 0) return pass;   // partial render, no head to build faces on
  for (const cell of faceCells) {
    const where = `${cell.partId} ${cell.frame} d${cell.dir}`;
    const face = cell.placed.filter((s) => s.on === "head");
    if (BLIND_DIRS.includes(cell.dir) && cell.placed.length > 0) {
      return fail("face", `${where} faces away but has ${cell.placed.length} face pixel(s)`);
    }
    if (cell.placed.length === 0) {
      if (cell.partId.startsWith("hd") && !BLIND_DIRS.includes(cell.dir)) {
        return fail("face", `${where} faces the camera with no face on it`);
      }
      continue;
    }
    for (const group of blobs(cell.placed)) {
      if (group.some((s) => s.on === "head")) continue;
      const [lost] = group;
      return fail("face", `${where}: ${group.length} face pixel(s) from ${lost!.code} at ` +
        `${lost!.x},${lost!.y} landed clear of the head — the drawing is no longer on it`);
    }
    const eyes = face.filter((s) => EYE_CODES.includes(s.code));
    if (face.some((s) => s.code === "W") !== face.some((s) => s.code === "U")) {
      return fail("face", `${where} draws an eye white without a pupil, or a pupil without one`);
    }
    if (cell.partId.startsWith("hd")) {
      if (PROFILE_DIRS.includes(cell.dir) && blobs(eyes).length !== 1) {
        return fail("face", `${where} is a profile with ${blobs(eyes).length} eyes, want 1`);
      }
      // Dir 3 is the one direction a set draws its own eye in, and a shut eye (set 21's ^_^) has
      // no white by design. Dirs 2 and 4 every set draws through the same open eye, so there the
      // design's rule holds outright.
      if (FACE_DIRS.includes(cell.dir) && cell.dir !== 3 && eyes.length === 0) {
        return fail("face", `${where} is a three-quarter with no open eye`);
      }
    }
    if (!cell.skull) return fail("face", `${where}: no skull under the face`);
    const line = cell.skull.top
      + Math.floor((cell.skull.bottom - cell.skull.top) / 2) - BROW_HEADROOM;
    const top = Math.min(...face.map((s) => s.y));
    if (top < line) {
      return fail("face", `${where}: a face pixel is at row ${top}, above ${line} — the skull ` +
        `runs ${cell.skull.top}-${cell.skull.bottom} and everything over its midline is hat space`);
    }
  }
  return pass;
}

/** Every garment in the wardrobe, whether or not this run built it (#442). A scoped run rebuilds
 *  one layer and still has to measure it against every sibling, so the silhouettes come off the
 *  sheets rather than out of `layers`. emit() writes this run's sheets into renderDir before the
 *  gates run, which makes the render dir both the accumulated tree and the freshest copy of
 *  anything rebuilt here; the frozen tree covers the layers this machine has never rendered. A set
 *  with no sheet either place is not drawn yet and has no silhouette to judge. */
function silhouettes(): FigureSilhouette[] {
  const found: FigureSilhouette[] = [];
  for (const set of FIGURE_SETS) {
    if (!GARMENT_TYPES.includes(set.type)) continue;
    const id = `${set.type}${set.id}`;
    const path = [join(renderDir, `${id}.png`), join(frozenDir, `${id}.png`)].find(existsSync);
    if (!path) continue;
    const png = decodePng(readFileSync(path));
    found.push({
      partId: id, setId: set.id, type: set.type,
      alpha: silhouetteOf({ w: png.width, h: png.height, px: png.rgba }),
    });
  }
  return found;
}
const nearDup = nearDupPairs(silhouettes());

for (const [name, gate] of [
  ["registration", gateRegistration], ["bounds", gateBounds],
  ["figureHeight", gateFigureHeight], ["holdout", gateHoldout], ["face", gateFace],
  ["near-dup", () => gateNearDup(nearDup)],
] as const) {
  const result = gate();
  if (result.ok) {
    console.log(`gate ${name}: PASS`);
  } else {
    console.error(`gate ${name}: FAIL — ${result.detail}`);
    failures++;
  }
}

// The pairs the gate tolerates, reported so a close sibling is a decision someone made rather than
// one nobody saw. Same tier as the visual review below: a warning never stops a build.
for (const p of nearDup) {
  if (p.verdict === "warn") {
    console.warn(`${p.a}: WARN near-dup ${p.b}: ${(p.iou * 100).toFixed(2)}% shared silhouette`);
  }
}

// ---- visual review (#268) ---------------------------------------------------------------------
// Warnings, never a failure — the same tier postpass.ts runs (PIPELINES §2 stage 4). It measures
// the layer composed with the body, because a garment alone is legitimately in pieces; see the
// figure section of review.ts for the 198-of-1024 measurement that settled that.
{
  const cellLabel = (cell: number): string => `${FRAMES[(cell / 8) | 0]} d${cell % 8}`;
  const body = HOLDOUT_IDS.map((id) => layers.get(id)).filter((c): c is Canvas[] => c !== undefined);
  const warn = (id: string, cells: ReadonlyArray<readonly Canvas[]>): void => {
    for (const w of reviewFigureIslands(cells, cellLabel)) {
      console.warn(`${id}: WARN ${w.where}: ${w.detail}`);
    }
  };
  // The canonical body once, as one object — a head floating off the neck is the same defect —
  // then each garment against it.
  if (body.length > 0) warn(HOLDOUT_IDS.join("+"), body);
  for (const [id, cells] of layers) {
    if (HOLDOUT_IDS.includes(id)) continue;
    warn(id, [...body, cells]);
  }
}

// ---- face preview (#311, #342) ------------------------------------------------------------------
// The render dir only, never frozen: an eye is one pixel and the only way to know it reads is to
// look at it, magnified, on the tone the room actually draws behind it. One skin ramp is enough —
// the sheet is indexed, so every other ramp is the same pixels through different colours.
//
//   figure_face.png    a worn head, whole turnaround, standing and sitting — where the face lands
//   figure_faces.png   every face and beard set at 6x, the five directions with art — how it reads
//
// The resolve below is the client's, `fixedColors` and all, so these two files are also the proof
// that a sheet indexing `paper` bakes without the client knowing what a face is.
{
  const order = ["outline", "left", "right", "top", "hi"];
  const palette = new Map<string, number[]>();
  for (const { ramp, shade, color } of RAMP_SHADES) {
    const shades = palette.get(ramp) ?? [];
    shades[order.indexOf(shade)] = color;
    palette.set(ramp, shades);
  }
  const metaOf = new Map(bundles.map((b) => [b.partId as string, b]));

  interface Worn { id: string; colors: string[] }
  interface Crop { x: number; y: number; w: number; h: number }
  const draw = (
    into: Canvas, ox: number, oy: number, scale: number, crop: Crop,
    stack: readonly Worn[], frame: string, dir: number,
  ): void => {
    for (const worn of stack) {
      const cell = layers.get(worn.id)?.[cellIndex(frame, dir)];
      const bundle = metaOf.get(worn.id);
      if (!cell || !bundle) continue;
      const slots = bundle.slots as number;
      const fixed = (bundle.fixedColors as string[] | undefined) ?? [];
      for (let y = crop.y; y < Math.min(cell.h, crop.y + crop.h); y++) {
        for (let x = crop.x; x < Math.min(cell.w, crop.x + crop.w); x++) {
          const p = getPixel(cell, x, y);
          if (p.alpha === 0) continue;
          const slot = unpackSlot(p.color);
          const ramp = worn.colors[slot] ?? fixed[slot - slots] ?? worn.colors[0] ?? "";
          const color = palette.get(ramp)?.[unpackShade(p.color)];
          if (color === undefined) continue;
          const px0 = ox + (x - crop.x) * scale, py0 = oy + (y - crop.y) * scale;
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) putPixel(into, px0 + sx, py0 + sy, color);
          }
        }
      }
    }
  };
  const fill = (c: Canvas): void => {
    for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) putPixel(c, x, y, FLOOR_TONES[0]!);
  };
  const SKIN = "skin_3", IRIS = "charcoal", HAIR = "charcoal";
  const faceIds = Object.keys(FACE_SETS).map(Number);
  const worn = (id: number): Worn[] =>
    [{ id: "bd1", colors: [SKIN] }, { id: `hd${id}`, colors: [SKIN, IRIS] }];

  if (layers.has("bd1") && faceIds.length > 0) {
    const SCALE = 3;
    const rows = ["stand", "sit"].filter((f) => FRAMES.includes(f));
    const preview = makeCanvas(CANVAS.w * 8 * SCALE, CANVAS.h * rows.length * SCALE);
    fill(preview);
    const whole = { x: 0, y: 0, w: CANVAS.w, h: CANVAS.h };
    for (const [row, frame] of rows.entries()) {
      for (let dir = 0; dir < 8; dir++) {
        draw(preview, dir * CANVAS.w * SCALE, row * CANVAS.h * SCALE, SCALE, whole,
          worn(faceIds[0]!), frame, dir);
      }
    }
    writeFileSync(join(renderDir, "figure_face.png"), encodePng(preview.w, preview.h, preview.px));
  }

  const skull = faceCells.find((c) => c.frame === REFERENCE_FRAME && c.dir === 3)?.skull;
  if (skull) {
    const SCALE = 6;
    const size = { w: 32, h: skull.bottom - skull.top + 8 };
    const crop = { x: 16, y: skull.top - 3, ...size };
    const dirs = [1, 2, 3, 4, 5];
    const beardIds = Object.keys(BEARD_SETS).map(Number);
    const rows: Worn[][] = [
      ...faceIds.map((id) => worn(id)),
      ...beardIds.map((id) => [...worn(faceIds[0]!), { id: `fa${id}`, colors: [HAIR] }]),
    ];
    const preview = makeCanvas(size.w * dirs.length * SCALE, size.h * rows.length * SCALE);
    fill(preview);
    for (const [row, stack] of rows.entries()) {
      for (const [col, dir] of dirs.entries()) {
        draw(preview, col * size.w * SCALE, row * size.h * SCALE, SCALE, crop,
          stack, REFERENCE_FRAME, dir);
      }
    }
    writeFileSync(join(renderDir, "figure_faces.png"), encodePng(preview.w, preview.h, preview.px));
    console.log(`figure_faces.png: rows ${[...faceIds, ...beardIds].join(", ")}, ` +
      `cols dirs ${dirs.join(" ")}`);
  }
}

/** Write only when the bytes move, so a run that reproduces a layer leaves its file — and its line
 *  in `git status` — alone. postpass.ts keeps the same rule for furni (#234). */
function freezeFile(path: string, next: Uint8Array, label: string): void {
  if (existsSync(path) && readFileSync(path).equals(next)) {
    console.log(`${label}: unchanged`);
    return;
  }
  writeFileSync(path, next);
  console.log(`${label}: frozen`);
}

if (freeze && failures === 0) {
  mkdirSync(frozenDir, { recursive: true });
  // The bundle carries its own palette, in shade order, so the client resolves (slot, shade)
  // without importing the generator — and so a frozen sheet can never be repainted by a later
  // style edit. Pixels are the identity; the colours they index are part of it.
  const palette: Record<string, number[]> = {};
  const order = ["outline", "left", "right", "top", "hi"];
  for (const { ramp, shade, color } of RAMP_SHADES) {
    (palette[ramp] ??= [])[order.indexOf(shade)] = color;
  }
  // How far the bare figure's crown sits above the anchor, per frame. The client hangs chat
  // bubbles and name labels off this instead of guessing a height that sitting would break.
  const crown = FRAMES.map((frame) => {
    let top = CANVAS.h;
    for (const id of ["bd1", "hd2"]) {
      const cells = layers.get(id);
      if (!cells) continue;
      for (let dir = 0; dir < 8; dir++) {
        const cell = cells[cellIndex(frame, dir)]!;
        for (let y = 0; y < top; y++) {
          for (let x = 0; x < cell.w; x++) {
            if (getPixel(cell, x, y).alpha !== 0) { top = Math.min(top, y); break; }
          }
        }
      }
    }
    return (meta.figures["bd1"] ? frameOf(meta.figures["bd1"], frame, 0).anchorY : 0) - top;
  });
  const canvas = { ...CANVAS, crown };

  // Under --only the body — and hd2's face sets with it — was rebuilt to gate the named layer
  // against, not to be republished. Anything rebuilt that the frozen tree already disagrees with
  // is a stop with one remedy, never a silent overwrite: the render dir is shared, and the layer
  // it disagrees about may have been frozen by another run from geometry this dir has never seen.
  const scope = only === null ? null
    : new Set(only === HEAD_ID ? [HEAD_ID, ...faceIds] : [only]);
  const REMEDY = "run `make art` with no PART=, so every layer re-renders, re-gates and re-freezes";
  const stale: string[] = [];
  if (scope) {
    if (!frozenDoc) {
      stale.push(`--only ${only}: there is no ${figuresPath} to merge one layer into — ${REMEDY}`);
    } else {
      if (JSON.stringify(frozenDoc.canvas) !== JSON.stringify(canvas)
        || JSON.stringify(frozenDoc.palette) !== JSON.stringify(palette)) {
        stale.push(`--only ${only}: the figure canvas or the palette has moved, and all ` +
          `${frozenDoc.layers.length} frozen layers share both — ${REMEDY}`);
      }
      const frozenBy = new Map(frozenDoc.layers.map((l) => [l.partId as string, l]));
      for (const b of bundles) {
        const id = b.partId as string;
        if (frozenBy.get(id)?.pixelHash === b.pixelHash) continue;
        if (HOLDOUT_IDS.includes(id)) {
          stale.push(`--only ${only}: ${id} is the canonical body and its pixels moved. Every ` +
            `garment is cut against it, so a scoped freeze would leave the other ` +
            `${frozenDoc.layers.length - 1} layers stale — ${REMEDY}`);
        } else if (!scope.has(id)) {
          stale.push(`--only ${only}: ${id} was rebuilt to gate ${only} against, and its pixels ` +
            `disagree with the frozen tree. Either ${renderDir} is stale or ${id} was frozen ` +
            `from a newer render — ${REMEDY}`);
        }
      }
    }
  }

  if (stale.length > 0) {
    for (const line of stale) console.error(line);
    failures += stale.length;
  } else {
    const write = scope ? bundles.filter((b) => scope.has(b.partId as string)) : bundles;
    for (const b of write) {
      const id = b.partId as string;
      freezeFile(join(frozenDir, b.sheet as string), sheets.get(id)!, id);
    }
    const written = new Map(write.map((b) => [b.partId as string, b]));
    const merged = scope && frozenDoc
      ? [...frozenDoc.layers.map((l) => written.get(l.partId as string) ?? l),
         ...write.filter((b) => !frozenDoc.layers.some((l) => l.partId === b.partId))]
      : [...bundles];
    // One order for both paths (#451). A scoped freeze merges into the frozen document and an
    // unscoped one rewrites it in this run's build order, so a layer's position used to record
    // which kind of freeze last touched it: two sessions freezing the same wardrobe different ways
    // produced files that disagreed on order alone, and the published copy then failed #423's
    // byte-compare on a tree that had tested green. setId is the layer's identity — globally
    // unique, and what the client keys its atlas on — so it is the order every freeze writes.
    merged.sort((a, b) => (a.setId as number) - (b.setId as number));
    freezeFile(figuresPath, Buffer.from(JSON.stringify({ canvas, palette, layers: merged }, null, 2)),
      "figures.json");
    console.log(`froze ${write.length} figure layer(s) to tools/artgen/frozen/figure/`);
  }
}

console.log(`${HEAD_ID}: cleanup repainted ${headRepaint} pixel(s)`);
for (const b of bundles) {
  console.log(`${b.partId}: ${b.frameW}x${b.frameH} x ${FRAMES.length}x8  pixels ` +
    `${(b.pixelHash as string).slice(0, 12)}…`);
}

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
