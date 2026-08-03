import { dirFromStep } from "@grand/shared";

export { dirFromStep };

export interface ScreenPoint {
  sx: number;
  sy: number;
}

export function lerpScreen(a: ScreenPoint, b: ScreenPoint, t: number): ScreenPoint {
  const k = t < 0 ? 0 : t > 1 ? 1 : t;
  return { sx: a.sx + (b.sx - a.sx) * k, sy: a.sy + (b.sy - a.sy) * k };
}

/** Where a walk is at `now`: which step is in progress and how far through it. Clock estimates
 *  that run ahead of `startedAt` clamp to the start rather than rewinding the avatar. */
export function stepAt(
  startedAt: number,
  msPerTile: number,
  now: number,
): { index: number; t: number } {
  const elapsed = Math.max(0, now - startedAt);
  const index = Math.floor(elapsed / msPerTile);
  return { index, t: (elapsed - index * msPerTile) / msPerTile };
}
