import type { Canvas, Pt } from "./raster.ts";
import { drawLine, fillPoly } from "./raster.ts";
import type { Ramp } from "./style.ts";

// Scale-64 projection constants (shared worldToScreen with h=32, v=16, zu=32). Geometry lives in
// footprint units: tile (i, j) covers [i..i+1]×[j..j+1], the origin tile's center is (0.5, 0.5).
const H = 32;
const V = 16;
const ZU = 32;

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

/** Right face, left face, top face with an outlined top perimeter — above-front light. */
export function drawBox(c: Canvas, anchor: Pt, b: Box): void {
  const at = (fx: number, fy: number, z: number): Pt => {
    const p = project(fx, fy, z);
    return { x: p.x + anchor.x, y: p.y + anchor.y };
  };
  const n = at(b.x0, b.y0, b.z1);
  const e = at(b.x1, b.y0, b.z1);
  const s = at(b.x1, b.y1, b.z1);
  const w = at(b.x0, b.y1, b.z1);
  const eb = at(b.x1, b.y0, b.z0);
  const sb = at(b.x1, b.y1, b.z0);
  const wb = at(b.x0, b.y1, b.z0);

  fillPoly(c, [e, s, sb, eb], b.ramp.right);
  fillPoly(c, [s, w, wb, sb], b.ramp.left);
  fillPoly(c, [n, e, s, w], b.ramp.top);
  drawLine(c, n, e, b.ramp.outline);
  drawLine(c, e, s, b.ramp.outline);
  drawLine(c, s, w, b.ramp.outline);
  drawLine(c, w, n, b.ramp.outline);
}

/** Painter order: back-to-front by footprint depth, then bottom-up. Stable for ties, so
 *  same-tile layering (rug patterns) follows authoring order. */
export function painterSort(boxes: Box[]): Box[] {
  return [...boxes].sort((a, b) => a.x0 + a.y0 - (b.x0 + b.y0) || a.z0 - b.z0);
}
