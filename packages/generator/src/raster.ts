/** RGBA canvas and the polygon fill the whole pipeline draws with. Pure functions of their
 *  inputs — determinism is the contract, enforced by the golden pixel hashes in the tests. */

export interface Canvas {
  w: number;
  h: number;
  px: Uint8Array;   // RGBA
}

export function makeCanvas(w: number, h: number): Canvas {
  return { w, h, px: new Uint8Array(w * h * 4) };
}

export function putPixel(c: Canvas, x: number, y: number, color: number): void {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h) return;
  const i = (y * c.w + x) * 4;
  c.px[i] = (color >> 16) & 0xff;
  c.px[i + 1] = (color >> 8) & 0xff;
  c.px[i + 2] = color & 0xff;
  c.px[i + 3] = 255;
}

export function getPixel(c: Canvas, x: number, y: number): { color: number; alpha: number } {
  const i = (y * c.w + x) * 4;
  return {
    color: ((c.px[i] ?? 0) << 16) | ((c.px[i + 1] ?? 0) << 8) | (c.px[i + 2] ?? 0),
    alpha: c.px[i + 3] ?? 0,
  };
}

export interface Pt {
  x: number;
  y: number;
}

/** Scanline fill of a convex polygon. Pixel centers (x+0.5, y+0.5) inside the hull are set. */
export function fillPoly(c: Canvas, pts: Pt[], color: number): void {
  const ys = pts.map((p) => p.y);
  const y0 = Math.max(0, Math.floor(Math.min(...ys)));
  const y1 = Math.min(c.h - 1, Math.ceil(Math.max(...ys)));
  for (let y = y0; y <= y1; y++) {
    const cy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (!a || !b || a.y === b.y) continue;
      const [lo, hi] = a.y < b.y ? [a, b] : [b, a];
      if (cy < lo.y || cy >= hi.y) continue;
      xs.push(lo.x + ((cy - lo.y) * (hi.x - lo.x)) / (hi.y - lo.y));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.ceil((xs[i] ?? 0) - 0.5);
      const xb = Math.floor((xs[i + 1] ?? 0) - 0.5);
      for (let x = xa; x <= xb; x++) putPixel(c, x, y, color);
    }
  }
}

/** 1px line, Bresenham. */
export function drawLine(c: Canvas, a: Pt, b: Pt, color: number): void {
  let x0 = Math.round(a.x), y0 = Math.round(a.y);
  const x1 = Math.round(b.x), y1 = Math.round(b.y);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    putPixel(c, x0, y0, color);
    if (x0 === x1 && y0 === y1) return;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** Copy src fully onto dst at (dx, dy). */
export function blit(dst: Canvas, src: Canvas, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const i = (y * src.w + x) * 4;
      if ((src.px[i + 3] ?? 0) === 0) continue;
      const j = ((y + dy) * dst.w + (x + dx)) * 4;
      dst.px[j] = src.px[i] ?? 0;
      dst.px[j + 1] = src.px[i + 1] ?? 0;
      dst.px[j + 2] = src.px[i + 2] ?? 0;
      dst.px[j + 3] = 255;
    }
  }
}
