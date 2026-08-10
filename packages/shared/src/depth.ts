/** An axis-aligned box in world units, half-open on every axis. Used both for whole items in a
 *  room and for the part boxes inside one generated sprite. */
export interface DepthBox {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
  /** Separates boxes that occupy the same space — a rug under an avatar under a table. */
  layer: number;
}

/** Whether two boxes can share a screen pixel at all.
 *
 *  The projection sends a world point to column (x − y)·h and row (x + y − 2z)·v — z counts double
 *  because zu is always 2v. Each box therefore covers one span of columns and one span of rows,
 *  and boxes whose spans miss on either axis are nowhere near each other on screen.
 *
 *  Conservative on purpose: these are bounding spans, so `meet` says yes to some pairs that never
 *  touch. It only has to say no to pairs that certainly never touch. */
function meet(a: DepthBox, b: DepthBox): boolean {
  return (
    a.x0 - a.y1 < b.x1 - b.y0 && b.x0 - b.y1 < a.x1 - a.y0 &&
    a.x0 + a.y0 - 2 * a.z1 < b.x1 + b.y1 - 2 * b.z0 &&
    b.x0 + b.y0 - 2 * b.z1 < a.x1 + a.y1 - 2 * a.z0
  );
}

/** True when `a` can only ever be occluded by `b`, never the reverse: `a` is west, north, or
 *  underneath, and the two share the axes that would let their sprites meet on screen.
 *
 *  The overlap requirement is what keeps the relation acyclic. Diagonal neighbours — (0,1) and
 *  (1,0) — satisfy both "a is west of b" and "b is north of a"; their sprite columns never touch,
 *  so neither constrains the other and they fall through to the tie-break key.
 *
 *  `meet` carries that argument to the third axis. "West of" is sound at any pair of heights, but
 *  between a low box and a high one it is also *vacuous* — the two are nowhere near each other on
 *  screen. A vacuous constraint still closes a cycle, and a cycle makes `painterOrder` fall back
 *  and drop some constraint that was not vacuous. A chair found this one: a back slat is west of a
 *  back leg it never touches, which closed leg → seat → slat → leg and let the leg stamp its lid
 *  over the seat. Keeping only the constraints that can matter is what stops it. */
export function behind(a: DepthBox, b: DepthBox): boolean {
  const xOverlap = a.x0 < b.x1 && b.x0 < a.x1;
  const yOverlap = a.y0 < b.y1 && b.y0 < a.y1;
  const ordered =
    (yOverlap && a.x1 <= b.x0) ||
    (xOverlap && a.y1 <= b.y0) ||
    // `a.z0 < b.z1` only ever bites when both boxes are flat at the same height — a placement
    // marker on the tile it highlights. Neither is underneath the other there, so both directions
    // must say no and let the layer key decide, or the answer depends on array order.
    (xOverlap && yOverlap && a.z1 <= b.z0 && a.z0 < b.z1);
  return ordered && meet(a, b);
}

/** Back-to-front draw order, as indices into `boxes`.
 *
 *  No single scalar key can order footprints wider than one tile: a 4×1 table has chairs that
 *  must draw behind it at one end and in front of it at the other, and on a scalar key those two
 *  chairs sit on the same side. So this is a topological sort over `behind`, Kahn's algorithm
 *  taking the lowest tie-break key among the ready boxes — which reduces to the plain depth key
 *  when nothing constrains the order. */
export function painterOrder(
  boxes: readonly DepthBox[],
  /** Extra "draw a before b" pairs, for orders geometry cannot state. A seat's in-front-of-the-
   *  sitter half is the case: it shares the sitter's tile and is neither west, north, nor under
   *  them, so nothing here would order the two. */
  forced: ReadonlyArray<readonly [number, number]> = [],
): number[] {
  const keys = boxes.map((b) => b.x0 + b.y0 + b.z0 * 1e-3 + b.layer * 1e-6);
  const successors = new Map<number, number[]>();
  const blockers = boxes.map(() => 0);
  const placed = boxes.map(() => false);
  const link = (from: number, to: number): void => {
    const row = successors.get(from);
    if (row) row.push(to);
    else successors.set(from, [to]);
    blockers[to] = (blockers[to] ?? 0) + 1;
  };

  // Only pairs whose screen COLUMNS overlap can constrain each other — that is the first half of
  // `meet`, and it holds whatever the boxes' heights are. So instead of testing every pair, sweep
  // the boxes in column order and keep an active set of the ones whose column span is still open:
  // a box entering the sweep can only meet what is active, because everything already evicted ends
  // to its left and everything still to come starts to its right. Comparing all pairs made the
  // sort quadratic in the sprite count, which is what put a big room out of frame budget (#360).
  const colStart = boxes.map((b) => b.x0 - b.y1);
  const colEnd = boxes.map((b) => b.x1 - b.y0);
  const bySweep = [...boxes.keys()].sort(
    (p, q) => (colStart[p] ?? 0) - (colStart[q] ?? 0) || p - q,
  );

  const active: number[] = [];
  for (const i of bySweep) {
    const from = colStart[i] ?? 0;
    let kept = 0;
    for (const j of active) {
      if ((colEnd[j] ?? 0) <= from) continue;   // its columns close before i's open: cannot meet
      active[kept++] = j;
      // Lower index first, so a pair is asked in the order the all-pairs loop asked it.
      const lo = i < j ? i : j, hi = i < j ? j : i;
      const a = boxes[lo], b = boxes[hi];
      if (!a || !b) continue;
      if (behind(a, b)) link(lo, hi);
      else if (behind(b, a)) link(hi, lo);
    }
    active.length = kept;
    active.push(i);
  }
  for (const [from, to] of forced) link(from, to);

  // The ready set as a binary min-heap on (key, index) — the same box the old scan of every
  // unplaced node picked, since that took the lowest key and left ties with the lower index.
  const ready: number[] = [];
  const before = (p: number, q: number): boolean => {
    const kp = keys[p] ?? 0, kq = keys[q] ?? 0;
    return kp !== kq ? kp < kq : p < q;
  };
  const siftUp = (start: number): void => {
    let i = start;
    while (i > 0) {
      const up = (i - 1) >> 1;
      if (!before(ready[i] ?? 0, ready[up] ?? 0)) break;
      const t = ready[i] ?? 0;
      ready[i] = ready[up] ?? 0;
      ready[up] = t;
      i = up;
    }
  };
  const siftDown = (start: number): void => {
    let i = start;
    for (;;) {
      const left = i * 2 + 1, right = left + 1;
      let best = i;
      if (left < ready.length && before(ready[left] ?? 0, ready[best] ?? 0)) best = left;
      if (right < ready.length && before(ready[right] ?? 0, ready[best] ?? 0)) best = right;
      if (best === i) break;
      const t = ready[i] ?? 0;
      ready[i] = ready[best] ?? 0;
      ready[best] = t;
      i = best;
    }
  };
  const offer = (i: number): void => {
    ready.push(i);
    siftUp(ready.length - 1);
  };
  const take = (): number => {
    // A box force-picked out of a cycle can be offered later, when the last of its blockers
    // clears; it is already drawn, so skip it.
    while (ready.length > 0) {
      const top = ready[0] ?? 0;
      const last = ready.pop() ?? 0;
      if (ready.length > 0) {
        ready[0] = last;
        siftDown(0);
      }
      if (placed[top] !== true) return top;
    }
    return -1;
  };

  for (const [i] of boxes.entries()) {
    if ((blockers[i] ?? 0) === 0) offer(i);
  }

  /** Lowest key among everything still undrawn, blocked or not — the cycle escape. */
  const lowestUnplaced = (): number => {
    let pick = -1;
    let best = Infinity;
    for (const [i, key] of keys.entries()) {
      if (placed[i] === true || key >= best) continue;
      best = key;
      pick = i;
    }
    return pick;
  };

  const order: number[] = [];
  while (order.length < boxes.length) {
    // A cycle would leave nothing ready. Rectangles in this projection should not produce one,
    // but degrade to the tie-break key rather than dropping sprites out of the scene.
    const next = take();
    const pick = next >= 0 ? next : lowestUnplaced();
    if (pick < 0) break;
    placed[pick] = true;
    order.push(pick);
    for (const s of successors.get(pick) ?? []) {
      const left = (blockers[s] ?? 0) - 1;
      blockers[s] = left;
      if (left === 0) offer(s);
    }
  }
  return order;
}
