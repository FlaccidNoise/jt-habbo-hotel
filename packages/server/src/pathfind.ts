import { DIR_STEPS, climbOk, tileHeight } from "@grand/shared";
import type { RoomModel, Tile } from "@grand/shared";

const UNSEEN = 0, OPEN = 1, CLOSED = 2;

/** A*: orthogonal cost 1, diagonal √2, octile heuristic with D=1, so a straight line is strictly
 *  cheaper than any zig-zag. Pop order is total — lowest f, then lowest h, then lowest insertion
 *  sequence — which makes every path reproducible. Excludes `from`, includes `to`. */
export function findPath(
  model: RoomModel,
  blocked: (x: number, y: number) => boolean,
  from: Tile,
  to: Tile,
): Tile[] | null {
  if (from.x === to.x && from.y === to.y) return [];
  if (tileHeight(model, from.x, from.y) < 0) return null;
  if (tileHeight(model, to.x, to.y) < 0 || blocked(to.x, to.y)) return null;

  const width = model.width;
  const size = width * model.height;
  const gScore = new Float64Array(size).fill(Infinity);
  const hScore = new Float64Array(size);
  const order = new Int32Array(size);
  const parent = new Int32Array(size).fill(-1);
  const state = new Uint8Array(size);

  const start = from.y * width + from.x;
  const goal = to.y * width + to.x;

  const octile = (x: number, y: number): number => {
    const dx = Math.abs(to.x - x), dy = Math.abs(to.y - y);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  // The mover stands on `from`, so its own occupancy never blocks it.
  const stepOk = (hFrom: number, x: number, y: number): boolean =>
    climbOk(hFrom, tileHeight(model, x, y)) &&
    ((x === from.x && y === from.y) || !blocked(x, y));
  const better = (a: number, b: number): boolean => {
    const fa = (gScore[a] ?? 0) + (hScore[a] ?? 0), fb = (gScore[b] ?? 0) + (hScore[b] ?? 0);
    if (fa !== fb) return fa < fb;
    const ha = hScore[a] ?? 0, hb = hScore[b] ?? 0;
    if (ha !== hb) return ha < hb;
    return (order[a] ?? 0) < (order[b] ?? 0);
  };

  let inserted = 0;
  gScore[start] = 0;
  hScore[start] = octile(from.x, from.y);
  order[start] = inserted++;
  state[start] = OPEN;
  const openSet = [start];

  while (openSet.length > 0) {
    let at = 0;
    for (let i = 1; i < openSet.length; i++) {
      if (better(openSet[i] ?? 0, openSet[at] ?? 0)) at = i;
    }
    const cur = openSet[at] ?? 0;
    openSet[at] = openSet[openSet.length - 1] ?? 0;
    openSet.pop();

    if (cur === goal) {
      const path: Tile[] = [];
      for (let i = goal; i !== start; i = parent[i] ?? start) {
        path.push({ x: i % width, y: (i / width) | 0 });
      }
      return path.reverse();
    }
    state[cur] = CLOSED;

    const cx = cur % width, cy = (cur / width) | 0;
    const hFrom = tileHeight(model, cx, cy);
    for (const s of DIR_STEPS) {
      const nx = cx + s.dx, ny = cy + s.dy;
      if (!stepOk(hFrom, nx, ny)) continue;
      // No corner cutting: a diagonal needs both orthogonal neighbors walkable from here.
      if (s.dx !== 0 && s.dy !== 0 && (!stepOk(hFrom, nx, cy) || !stepOk(hFrom, cx, ny))) continue;

      const next = ny * width + nx;
      if (state[next] === CLOSED) continue;
      const tentative = (gScore[cur] ?? 0) + (s.dx === 0 || s.dy === 0 ? 1 : Math.SQRT2);
      if (tentative >= (gScore[next] ?? Infinity)) continue;

      gScore[next] = tentative;
      parent[next] = cur;
      if (state[next] === UNSEEN) {
        state[next] = OPEN;
        hScore[next] = octile(nx, ny);
        order[next] = inserted++;
        openSet.push(next);
      }
    }
  }
  return null;
}
