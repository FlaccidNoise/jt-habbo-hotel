import { painterOrder } from "@grand/shared";
import type { DepthBox } from "@grand/shared";
import type { Box } from "./iso.ts";
import { FACE_KEYS, H, V, boxFaces, painterSort } from "./iso.ts";
import { fillPoly, getPixel, makeCanvas } from "./raster.ts";
import type { Canvas, Pt } from "./raster.ts";
import { rampByName } from "./style.ts";

// Reference-scene rendering correctness (PIPELINES §1 Draw order, §2 stage 4). Painter's algorithm
// is an approximation: it commits to one order per object and one order per part box, and a scene
// exists for which no such order reproduces what a camera sees. This module renders a staged scene
// twice — once the way the game draws it, once with a per-pixel depth test — and reports where
// they disagree. Fills only: the silhouette outline is a post-pass over the finished frame, not
// part of the ordering question.

const ORIGIN: Pt = { x: 0, y: 0 };
const EPS = 1e-9;

/** One placed object in a reference scene: the part boxes it paints, in scene footprint units,
 *  and the whole-object box the room's painter sort orders it by. Splitting the two is the point —
 *  a sprite is composited as a unit, so a wrong `depth` misorders correctly-ordered parts. */
export interface SceneItem {
  boxes: readonly Box[];
  depth: DepthBox;
}

/** Pixel-aligned screen bounds of every face of a box. */
function extent(b: Box): { x0: number; y0: number; x1: number; y1: number } {
  const pts = boxFaces(ORIGIN, b).flat();
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  return {
    x0: Math.floor(Math.min(...xs)) - 1,
    y0: Math.floor(Math.min(...ys)) - 1,
    x1: Math.ceil(Math.max(...xs)) + 1,
    y1: Math.ceil(Math.max(...ys)) + 1,
  };
}

/** Rasterise one box's three faces on its own, so the depth oracle reads coverage from the same
 *  scanline fill the painter uses. Only the ordering is under test; a boundary pixel the two
 *  rasterisers disagreed about would be noise. Face index + 1 is the stamped value. */
function coverage(b: Box): { x0: number; y0: number; mask: Canvas } {
  const e = extent(b);
  const mask = makeCanvas(e.x1 - e.x0, e.y1 - e.y0);
  const faces = boxFaces({ x: -e.x0, y: -e.y0 }, b);
  for (const [i, face] of faces.entries()) fillPoly(mask, face, i + 1);
  return { x0: e.x0, y0: e.y0, mask };
}

/** How far along the view ray the box's visible surface sits, at the screen point (sx, sy)
 *  measured from the origin-tile centre at z = 0.
 *
 *  A pixel is one ray (fx0 + t, fy0 + t, t): the projection collapses that whole line to a point,
 *  and the camera sits at t = +∞. So the surface a camera sees is where the ray *leaves* the box,
 *  and the larger of two exits is the nearer surface. */
function exitT(b: Box, sx: number, sy: number): number {
  const fx0 = (sx / H + sy / V + 1) / 2;
  const fy0 = (sy / V + 1 - sx / H) / 2;
  return Math.min(b.x1 - fx0, b.y1 - fy0, b.z1);
}

/** Where the game's draw order differs from a per-pixel depth test, or null when they agree.
 *
 *  A pixel passes when the colour the painter left there is one that *some* nearest-surface box
 *  would have painted. Two boxes tied at the same depth both count (coincident faces are a real
 *  ambiguity, not an error), and so do two boxes of the same ramp painting the same face — those
 *  are indistinguishable on screen, which is the only thing this gate is entitled to judge. */
export function drawOrderMismatch(items: readonly SceneItem[]): string | null {
  const boxes = items.flatMap((it) => [...it.boxes]);
  if (boxes.length === 0) return null;

  const bounds = boxes.map(extent);
  const anchor: Pt = {
    x: -Math.min(...bounds.map((e) => e.x0)),
    y: -Math.min(...bounds.map((e) => e.y0)),
  };
  const w = anchor.x + Math.max(...bounds.map((e) => e.x1));
  const h = anchor.y + Math.max(...bounds.map((e) => e.y1));

  // What the game draws: objects in room order, part boxes in sprite order, last write wins.
  const paint = makeCanvas(w, h);
  for (const i of painterOrder(items.map((it) => it.depth))) {
    for (const b of painterSort([...(items[i]?.boxes ?? [])])) {
      for (const [k, face] of boxFaces(anchor, b).entries()) {
        fillPoly(paint, face, b.ramp[FACE_KEYS[k] ?? "top"]);
      }
    }
  }

  // Pass 1: the depth of the nearest surface at every covered pixel. Pass 2: whether the painted
  // colour is one a box at that depth paints.
  const stamps = boxes.map(coverage);
  const nearest = new Float64Array(w * h).fill(-Infinity);
  const agrees = new Uint8Array(w * h);
  for (const pass of [0, 1]) {
    for (const [i, { x0, y0, mask }] of stamps.entries()) {
      const b = boxes[i];
      if (!b) continue;
      for (let my = 0; my < mask.h; my++) {
        for (let mx = 0; mx < mask.w; mx++) {
          const face = getPixel(mask, mx, my).color - 1;
          if (face < 0) continue;
          const px = x0 + mx + anchor.x;
          const py = y0 + my + anchor.y;
          const t = exitT(b, px + 0.5 - anchor.x, py + 0.5 - anchor.y);
          const at = py * w + px;
          if (pass === 0) {
            if (t > (nearest[at] ?? -Infinity)) nearest[at] = t;
          } else if (
            Math.abs(t - (nearest[at] ?? 0)) <= EPS &&
            b.ramp[FACE_KEYS[face] ?? "top"] === getPixel(paint, px, py).color
          ) {
            agrees[at] = 1;
          }
        }
      }
    }
  }

  let bad = 0;
  let first = "";
  for (let i = 0; i < nearest.length; i++) {
    if (nearest[i] === -Infinity || agrees[i] === 1) continue;
    if (bad === 0) {
      const x = (i % w) - anchor.x;
      const y = Math.floor(i / w) - anchor.y;
      first = `painted #${getPixel(paint, i % w, Math.floor(i / w)).color.toString(16)} at ${x},${y}`;
    }
    bad++;
  }
  return bad === 0 ? null : `${bad} pixel(s) hidden behind a farther surface — first: ${first}`;
}

const PROBE_RAMP = "charcoal";   // used by no box-path recipe, so a probe never masks a mismatch
const PROBE_HEIGHT = 1.5;
const STACK = 0.5;

/** The two scenes every generated item is checked in.
 *
 *  Alone, so nothing covers it: this is where the part boxes inside one sprite have to resolve —
 *  a leg whose lid stamps over the tabletop, a cushion driven through a backrest.
 *
 *  Then in a ring: a post on every tile around the item, and a column stacked on its top face.
 *  West and north must end up behind the item, east and south in front, the corners — whose
 *  sprite columns never touch the item's — anywhere at all. The ring is what catches a footprint
 *  sorted off its origin tile: a 2×1 item has a neighbour at the far end on each side, and a
 *  whole-object box covering only the origin tile stops constraining either of them, so the item
 *  slides to one side of both when it belongs between.
 *
 *  Both scenes are needed because every probe is also a blindfold. A neighbour as tall as the item
 *  buries most of it, and a defect under a probe is one nobody can see — so the ring alone would
 *  report far less than it appears to. */
export function referenceScenes(
  item: readonly Box[],
  spanX: number,
  spanY: number,
  top: number,
): SceneItem[][] {
  const ramp = rampByName(PROBE_RAMP);
  const at = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): SceneItem => ({
    boxes: [{ x0, y0, z0, x1, y1, z1, ramp }],
    depth: { x0, y0, z0, x1, y1, z1, layer: 0 },
  });
  const alone: SceneItem = {
    boxes: item,
    depth: { x0: 0, y0: 0, z0: 0, x1: spanX, y1: spanY, z1: top, layer: 0 },
  };
  const ring: SceneItem[] = [alone, at(0, 0, top, STACK, STACK, top + STACK)];
  for (let y = -1; y <= spanY; y++) {
    for (let x = -1; x <= spanX; x++) {
      if (x < 0 || y < 0 || x >= spanX || y >= spanY) {
        ring.push(at(x, y, 0, x + 1, y + 1, PROBE_HEIGHT));
      }
    }
  }
  return [[alone], ring];
}
