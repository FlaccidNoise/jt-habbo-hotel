import { DIR_STEPS, IndexedHeap, climbOk, tileHeight } from "@grand/shared";
import type { RoomModel, Tile } from "@grand/shared";

const UNSEEN = 0, OPEN = 1, CLOSED = 2;

/** Every tile reachable from `from`, as a flag per tile indexed `y * width + x`.
 *
 *  The movement rules are the pathfinder's — climbable step, no corner cutting, the same dynamic
 *  blockers — swept once instead of once per destination. Asking A* "is there a route to this
 *  tile?" for every tile in the room costs a full drain of the open set for each unreachable one,
 *  which at 300x300 is ~90,000 searches over 90,000 tiles and hangs boot (#406). This is one
 *  sweep, and unlike A* it has no expansion cap to run into. */
export function reachable(
  model: RoomModel,
  blocked: (x: number, y: number) => boolean,
  from: Tile,
): Uint8Array {
  const width = model.width;
  const seen = new Uint8Array(width * model.height);
  if (tileHeight(model, from.x, from.y) < 0) return seen;

  const start = from.y * width + from.x;
  seen[start] = 1;
  const queue: number[] = [start];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head] ?? 0;
    const cx = cur % width, cy = (cur / width) | 0;
    const hFrom = tileHeight(model, cx, cy);
    const stepOk = (x: number, y: number): boolean =>
      climbOk(hFrom, tileHeight(model, x, y)) && !blocked(x, y);
    for (const s of DIR_STEPS) {
      const nx = cx + s.dx, ny = cy + s.dy;
      if (!stepOk(nx, ny)) continue;
      if (s.dx !== 0 && s.dy !== 0 && (!stepOk(nx, cy) || !stepOk(cx, ny))) continue;
      const next = ny * width + nx;
      if (seen[next] === 1) continue;
      seen[next] = 1;
      queue.push(next);
    }
  }
  return seen;
}

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

  // The open set as an indexed binary heap (packages/shared/src/heap.ts): pops the same node a
  // scan of the whole set would have picked, since `better` reads the live scores and the order is
  // total — so every path stays reproducible. Scanning cost the frontier on every pop, which is
  // what made a search that has to drain the set quadratic in the room's area.
  const heap = new IndexedHeap(size, better);

  let inserted = 0;
  gScore[start] = 0;
  hScore[start] = octile(from.x, from.y);
  order[start] = inserted++;
  state[start] = OPEN;
  heap.push(start);

  // A closed tile is never expanded twice, so `size` — every tile the room has — is a tight upper
  // bound on total expansions: reaching it means the whole reachable region is already drained, not
  // that a real path got cut short. It exists only as a runaway guard against a corrupt model; the
  // no-route case that ordinary play hits (a tile ringed by furni, a walled-off nook) still costs
  // the full drain to prove, which is expected, not abuse. #363 replaces the search itself with
  // static reachability regions for the common case.
  let expanded = 0;
  while (heap.length > 0) {
    if (expanded++ >= size) return null;
    const cur = heap.pop();

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
        heap.push(next);
      } else {
        // Still open, and now cheaper to reach: its key fell, so it has to climb.
        heap.resift(next);
      }
    }
  }
  return null;
}
