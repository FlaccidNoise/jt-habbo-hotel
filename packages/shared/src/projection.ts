export type Scale = 64 | 32;

export function worldToScreen(x: number, y: number, z: number, scale: Scale): { sx: number; sy: number } {
  const h = scale / 2, v = scale / 4, zu = scale / 2;
  return { sx: (x - y) * h, sy: (x + y) * v - z * zu };
}

/** Inverse of worldToScreen on the z=0 plane ONLY. A point over a surface at height H resolves
 *  (H, H) tiles up-left of the visual tile — call it only for empty-floor hit-testing.
 *  Rounds, not floors: worldToScreen treats (x, y) as the tile CENTRE, so the nearest integer
 *  is the tile whose `diamond()` polygon contains the point. */
export function screenToTile(sx: number, sy: number, scale: Scale): { x: number; y: number } {
  const h = scale / 2, v = scale / 4;
  // `+ 0` folds Math.round's -0 (any input in [-0.5, 0)) back to 0.
  return { x: Math.round(sx / h / 2 + sy / v / 2) + 0, y: Math.round(sy / v / 2 - sx / h / 2) + 0 };
}

/** dir 0=N .. 7=NW per the global convention table. */
export const DIR_STEPS: ReadonlyArray<{ dx: number; dy: number }> = [
  { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
  { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 },
] as const;

export function dirFromStep(dx: number, dy: number): number {
  const i = DIR_STEPS.findIndex((s) => s.dx === dx && s.dy === dy);
  if (i === -1) throw new Error(`not a unit step: ${dx},${dy}`);
  return i;
}
