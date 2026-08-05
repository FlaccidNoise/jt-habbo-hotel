// Figure post-pass (#127). Sibling of postpass.ts: reads the same lit + mask raw pairs rig.py
// emits, quantizes on the same fixed linear-luma thresholds so figures and furni read as one
// style, and freezes one bundle per wearable layer.
//
//   node --experimental-strip-types tools/artgen/figurepass.ts <renderDir> [--freeze]
//
// Two things differ from the furni pass.
//
// 1. The sheet is INDEXED, not RGB. Colour is per player — a shirt is worn in any of 12 ramps and
//    a two-slot shirt in any pair — so baking colour here would put the combinatorics back into
//    colour space. Each pixel stores (slot, shade) and the client resolves them through the worn
//    ramps when it bakes the outfit, which it is already doing to composite the layers.
//      R = colour slot (0-based, < the set's slot count)
//      G = shade index: 0 outline, 1 left, 2 right, 3 top, 4 hi
//      B = 0, reserved
//
// 2. Every layer but the body renders WITH the canonical body present, and everything below
//    `ownFrom` in mask-index order is discarded. Where the body is nearer it won the depth test,
//    so those pixels were never the garment's — which is what lets the client composite with
//    plain alpha-over and no runtime depth.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FIGUREDATA_VERSION, LAYER_ORDER, setById } from "../../packages/shared/src/figuredata.ts";
import type { LayerType } from "../../packages/shared/src/figuredata.ts";
import { encodePng } from "../../packages/generator/src/png.ts";
import { blit, getPixel, makeCanvas, putPixel } from "../../packages/generator/src/raster.ts";
import type { Canvas } from "../../packages/generator/src/raster.ts";
import { GENERATOR_VERSION, STYLE_VERSION } from "../../packages/generator/src/style.ts";

const RES = 256;
const ALPHA_MIN = 128;
const THRESH_LEFT = 0.30, THRESH_RIGHT = 0.62, THRESH_TOP = 0.80;
const SHADE_OUTLINE = 0, SHADE_LEFT = 1, SHADE_RIGHT = 2, SHADE_TOP = 3, SHADE_HI = 4;

const renderDir = process.argv[2] ?? "/tmp/artgen";
const freeze = process.argv.includes("--freeze");
const frozenDir = new URL("./frozen/figure/", import.meta.url).pathname;

function toLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Mask channels render at exactly {0, 187, 255} (linear {0, .5, 1} through sRGB). */
function maskDigit(v: number): number {
  return v < 94 ? 0 : v < 221 ? 1 : 2;
}

interface FigurePrim { slot: number; bone: string; part: string }
interface FigureFrame { frame: string; dir: number; anchorY: number; rgba: string; mask: string }
interface FigurePart {
  frames: FigureFrame[];
  prims: FigurePrim[];
  ownFrom: number;
  src: unknown;
}

const meta = JSON.parse(readFileSync(join(renderDir, "meta.json"), "utf8")) as {
  figures: Record<string, FigurePart>;
  figureCanvas: { w: number; h: number; height: number; frames: string[]; sitFootDrop: number };
};

const CANVAS = meta.figureCanvas;
const FRAMES = CANVAS.frames;
const ANCHOR_X = CANVAS.w >> 1;

const pack = (slot: number, shade: number): number => (slot << 16) | (shade << 8);
const unpackSlot = (color: number): number => (color >> 16) & 0xff;
const unpackShade = (color: number): number => (color >> 8) & 0xff;

/** One 64x112 frame of one layer, in (slot, shade) indices. `keepFrom` drops the holdout body. */
function renderFrame(part: FigurePart, f: FigureFrame, keepFrom: number): Canvas {
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
  // postpass applies, so a sleeve seam reads like a chair seam.
  for (let y = 0; y < CANVAS.h; y++) {
    for (let x = 0; x < CANVAS.w; x++) {
      const p = primAt[y * CANVAS.w + x]!;
      if (p < 0) continue;
      const right = x + 1 < CANVAS.w ? primAt[y * CANVAS.w + x + 1]! : -1;
      const down = y + 1 < CANVAS.h ? primAt[(y + 1) * CANVAS.w + x]! : -1;
      if ((right >= 0 && right !== p) || (down >= 0 && down !== p)) {
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
  return frame;
}

function frameOf(part: FigurePart, frame: string, dir: number): FigureFrame {
  const f = part.frames.find((q) => q.frame === frame && q.dir === dir);
  if (!f) throw new Error(`no frame ${frame} dir ${dir}`);
  return f;
}

const partIds = Object.keys(meta.figures);
const layers = new Map<string, Canvas[]>();   // partId -> frames in (row, col) order
const bundles: Array<Record<string, unknown>> = [];
let failures = 0;

for (const id of partIds) {
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

  const sheet = makeCanvas(CANVAS.w * 8, CANVAS.h * FRAMES.length);
  const cells: Canvas[] = [];
  const anchorY: number[] = [];
  for (const [row, frame] of FRAMES.entries()) {
    anchorY.push(frameOf(part, frame, 0).anchorY);
    for (let dir = 0; dir < 8; dir++) {
      const cell = renderFrame(part, frameOf(part, frame, dir), part.ownFrom);
      cells.push(cell);
      blit(sheet, cell, dir * CANVAS.w, row * CANVAS.h);
    }
  }
  layers.set(id, cells);

  const slotsUsed = new Set(part.prims.slice(part.ownFrom).map((p) => p.slot));
  if (Math.max(...slotsUsed) >= set.slots) {
    console.error(
      `${id}: mesh uses slot ${Math.max(...slotsUsed)} but figuredata set ${setId} declares ` +
      `slots: ${set.slots}. Raise it, or drop the slot from the mesh.`,
    );
    failures++;
  }

  const recipeHash = createHash("sha256")
    .update(JSON.stringify({
      id, setId, prims: part.prims, src: part.src, canvas: CANVAS,
      styleVersion: STYLE_VERSION, generatorVersion: GENERATOR_VERSION,
      figuredataVersion: FIGUREDATA_VERSION,
    }))
    .digest("hex");

  bundles.push({
    partId: id, setId, type, name: set.name, slots: set.slots, hides: set.hides,
    sheet: `${id}.png`,
    frameW: CANVAS.w, frameH: CANVAS.h, frames: FRAMES, dirs: [0, 1, 2, 3, 4, 5, 6, 7],
    anchorX: ANCHOR_X, anchorY,
    figureHeight: CANVAS.height,
    styleVersion: STYLE_VERSION, generatorVersion: GENERATOR_VERSION,
    figuredataVersion: FIGUREDATA_VERSION,
    recipeHash, pixelHash: createHash("sha256").update(sheet.px).digest("hex"),
  });

  const png = encodePng(sheet.w, sheet.h, sheet.px);
  writeFileSync(join(renderDir, `${id}.png`), png);
  if (freeze) {
    mkdirSync(frozenDir, { recursive: true });
    writeFileSync(join(frozenDir, `${id}.png`), png);
  }
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
  for (const id of partIds) {
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
  const order = [...partIds].sort(
    (a, b) => LAYER_ORDER.indexOf(a.replace(/\d+$/, "") as LayerType)
      - LAYER_ORDER.indexOf(b.replace(/\d+$/, "") as LayerType),
  );
  const top = order[order.length - 1]!;
  if (order.length < 2) return pass;
  const topPart = meta.figures[top]!;

  let interiorBad = 0, worst = "";
  for (const frame of FRAMES) {
    for (let dir = 0; dir < 8; dir++) {
      const combined = renderFrame(topPart, frameOf(topPart, frame, dir), 0);
      const stack = makeCanvas(CANVAS.w, CANVAS.h);
      const owner = new Int32Array(CANVAS.w * CANVAS.h).fill(-1);
      for (const [n, id] of order.entries()) {
        const cell = layers.get(id)![cellIndex(frame, dir)]!;
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
      `${interiorBad} composited pixel(s) disagree with the combined render away from any layer ` +
      `boundary (first: ${worst}). A layer was rendered without its holdout body.`);
  }
  return pass;
}

for (const [name, gate] of [
  ["registration", gateRegistration], ["bounds", gateBounds],
  ["figureHeight", gateFigureHeight], ["holdout", gateHoldout],
] as const) {
  const result = gate();
  if (result.ok) {
    console.log(`gate ${name}: PASS`);
  } else {
    console.error(`gate ${name}: FAIL — ${result.detail}`);
    failures++;
  }
}

if (freeze && failures === 0) {
  mkdirSync(frozenDir, { recursive: true });
  writeFileSync(
    join(frozenDir, "figures.json"),
    JSON.stringify({ canvas: CANVAS, layers: bundles }, null, 2),
  );
  console.log(`froze ${bundles.length} figure layer(s) to tools/artgen/frozen/figure/`);
}

for (const b of bundles) {
  console.log(`${b.partId}: ${b.frameW}x${b.frameH} x ${FRAMES.length}x8  pixels ` +
    `${(b.pixelHash as string).slice(0, 12)}…`);
}

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
