import { DIR_STEPS, climbOk, tileHeight } from "@grand/shared";
import type { RoomModel, Tile } from "@grand/shared";

const UNSEEN = 0, OPEN = 1, CLOSED = 2;

/** Nodes expanded before a search gives up and reports no route.
 *
 *  A target with no route — a tile ringed by furni, or a walled-off nook — cannot be answered more
 *  cheaply than by draining the open set, so it costs the whole reachable region. That is ordinary
 *  play, not abuse: a third of the clicks in a crowded room find no route. The cap sits well above
 *  a full sweep of the largest room the heightmap admits (MAX_DIM caps a room at 64x64 = 4096
 *  tiles), so it cannot change an answer any room can produce today. It is here so that raising
 *  MAX_DIM for the big public rooms cannot turn one such click into a whole-server stall. #363
 *  replaces it with static reachability regions, which answer the common case without searching. */
const EXPANSION_CAP = 20_000;

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

  // The open set as an indexed binary heap: `heap` holds node ids ordered by `better`, `heapAt`
  // maps a node back to its slot so a node whose g improves while it is still open can be sifted
  // back into place. `better` reads the live scores, so the node this pops is the same one a scan
  // of the whole set would have picked — the order stays total, and so every path stays
  // reproducible. Scanning cost the frontier on every pop, which is what made a search that has
  // to drain the set quadratic in the room's area.
  const heap = new Int32Array(size);
  const heapAt = new Int32Array(size).fill(-1);
  let heapLen = 0;

  const swap = (i: number, j: number): void => {
    const a = heap[i] ?? 0, b = heap[j] ?? 0;
    heap[i] = b; heapAt[b] = i;
    heap[j] = a; heapAt[a] = j;
  };
  const siftUp = (from0: number): void => {
    let i = from0;
    while (i > 0) {
      const parentAt = (i - 1) >> 1;
      if (!better(heap[i] ?? 0, heap[parentAt] ?? 0)) break;
      swap(i, parentAt);
      i = parentAt;
    }
  };
  const siftDown = (from0: number): void => {
    let i = from0;
    for (;;) {
      const left = i * 2 + 1, right = left + 1;
      let best = i;
      if (left < heapLen && better(heap[left] ?? 0, heap[best] ?? 0)) best = left;
      if (right < heapLen && better(heap[right] ?? 0, heap[best] ?? 0)) best = right;
      if (best === i) break;
      swap(i, best);
      i = best;
    }
  };
  const push = (node: number): void => {
    heap[heapLen] = node;
    heapAt[node] = heapLen;
    heapLen++;
    siftUp(heapLen - 1);
  };
  const pop = (): number => {
    const top = heap[0] ?? 0;
    heapAt[top] = -1;
    heapLen--;
    if (heapLen > 0) {
      const last = heap[heapLen] ?? 0;
      heap[0] = last;
      heapAt[last] = 0;
      siftDown(0);
    }
    return top;
  };

  let inserted = 0;
  gScore[start] = 0;
  hScore[start] = octile(from.x, from.y);
  order[start] = inserted++;
  state[start] = OPEN;
  push(start);

  let expanded = 0;
  while (heapLen > 0) {
    if (expanded++ >= EXPANSION_CAP) return null;
    const cur = pop();

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
        push(next);
      } else {
        // Still open, and now cheaper to reach: its key fell, so it has to climb.
        siftUp(heapAt[next] ?? 0);
      }
    }
  }
  return null;
}
