import { painterOrder } from "@grand/shared";
import type { Canvas, Pt } from "./raster.ts";
import { drawLine, fillPoly } from "./raster.ts";
import type { Ramp } from "./style.ts";

// Scale-64 projection constants (shared worldToScreen with h=32, v=16, zu=32). Geometry lives in
// footprint units: tile (i, j) covers [i..i+1]×[j..j+1], the origin tile's center is (0.5, 0.5).
export const H = 32;
export const V = 16;
export const ZU = 32;

export interface Box {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  ramp: Ramp;
}

/** Footprint point → pixel offset from the origin-tile center at z=0. */
function project(fx: number, fy: number, z: number): Pt {
  return { x: (fx - fy) * H, y: (fx + fy - 1) * V - z * ZU };
}

/** One quarter turn (dir += 2): footprint spanX×spanY becomes spanY×spanX. */
export function rotateBox(b: Box, spanY: number): Box {
  return { x0: spanY - b.y1, y0: b.x0, z0: b.z0, x1: spanY - b.y0, y1: b.x1, z1: b.z1, ramp: b.ramp };
}

/** The names of the three camera-facing faces, in the order `boxFaces` returns them. Indexing a
 *  ramp by one of these is the colour that face paints. */
export const FACE_KEYS = ["right", "left", "top"] as const;

/** The camera looks down (1, 1, 1), so a box shows its +x, +y and +z faces and nothing else.
 *  Corner polygons only — `drawBox` paints them, the draw-order gate re-rasterises them. */
export function boxFaces(anchor: Pt, b: Box): [Pt[], Pt[], Pt[]] {
  const at = (fx: number, fy: number, z: number): Pt => {
    const p = project(fx, fy, z);
    return { x: p.x + anchor.x, y: p.y + anchor.y };
  };
  const n = at(b.x0, b.y0, b.z1);
  const e = at(b.x1, b.y0, b.z1);
  const s = at(b.x1, b.y1, b.z1);
  const w = at(b.x0, b.y1, b.z1);
  return [
    [e, s, at(b.x1, b.y1, b.z0), at(b.x1, b.y0, b.z0)],
    [s, w, at(b.x0, b.y1, b.z0), at(b.x1, b.y1, b.z0)],
    [n, e, s, w],
  ];
}

/** Right face, left face, top face with an outlined top perimeter — above-front light. */
export function drawBox(c: Canvas, anchor: Pt, b: Box): void {
  const [right, left, top] = boxFaces(anchor, b);
  fillPoly(c, right, b.ramp.right);
  fillPoly(c, left, b.ramp.left);
  fillPoly(c, top, b.ramp.top);
  const [n, e, s, w] = top as [Pt, Pt, Pt, Pt];
  drawLine(c, n, e, b.ramp.outline);
  drawLine(c, e, s, b.ramp.outline);
  drawLine(c, s, w, b.ramp.outline);
  drawLine(c, w, n, b.ramp.outline);
}

/** Painter order: back-to-front over the box extents, so a leg under a tabletop draws before it
 *  instead of stamping its lid over the table's front edge. Ties keep authoring order, which is
 *  what same-space layering (rug patterns) relies on. */
export function painterSort(boxes: Box[]): Box[] {
  const order = painterOrder(boxes.map((b) => ({ ...b, layer: 0 })));
  return order.flatMap((i) => boxes[i] ?? []);
}
