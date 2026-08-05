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

  for (const [i, a] of boxes.entries()) {
    for (const [j, b] of boxes.entries()) {
      if (j <= i) continue;
      if (behind(a, b)) link(i, j);
      else if (behind(b, a)) link(j, i);
    }
  }
  for (const [from, to] of forced) link(from, to);

  const lowest = (readyOnly: boolean): number => {
    let pick = -1;
    let best = Infinity;
    for (const [i, key] of keys.entries()) {
      if (placed[i] === true || key >= best) continue;
      if (readyOnly && (blockers[i] ?? 0) > 0) continue;
      best = key;
      pick = i;
    }
    return pick;
  };

  const order: number[] = [];
  while (order.length < boxes.length) {
    // A cycle would leave nothing ready. Rectangles in this projection should not produce one,
    // but degrade to the tie-break key rather than dropping sprites out of the scene.
    const ready = lowest(true);
    const pick = ready >= 0 ? ready : lowest(false);
    if (pick < 0) break;
    placed[pick] = true;
    order.push(pick);
    for (const s of successors.get(pick) ?? []) blockers[s] = (blockers[s] ?? 0) - 1;
  }
  return order;
}
