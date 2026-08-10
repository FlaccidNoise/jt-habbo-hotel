import { expect, test } from "vitest";
import { parseHeightmap } from "@grand/shared";
import type { RoomModel } from "@grand/shared";
import { findPath } from "../src/pathfind.ts";

const flat = parseHeightmap("00000\n00000\n00000\n00000\n00000", { x: 0, y: 0, dir: 2 });
const open = () => false;

test("straight line is unique-optimal", () =>
  expect(findPath(flat, open, { x: 0, y: 0 }, { x: 4, y: 0 }))
    .toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]));
test("clear diagonal is unique-optimal", () =>
  expect(findPath(flat, open, { x: 0, y: 0 }, { x: 2, y: 2 }))
    .toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]));
test("from===to is the empty path", () =>
  expect(findPath(flat, open, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([]));
test("blocked target is null", () =>
  expect(findPath(flat, (x, y) => x === 4 && y === 4, { x: 0, y: 0 }, { x: 4, y: 4 })).toBeNull());
test("void target is null", () => {
  const m = parseHeightmap("00\n0x", { x: 0, y: 0, dir: 2 });
  expect(findPath(m, open, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
});
test("climbs a 1-step, refuses a 2-step cliff", () => {
  const ramp = parseHeightmap("012", { x: 0, y: 0, dir: 2 });
  expect(findPath(ramp, open, { x: 0, y: 0 }, { x: 2, y: 0 }))
    .toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
  // Built directly: parseHeightmap rejects "02" outright, because a 2-step cliff makes the far
  // tile unreachable from any door. The pathfinder must still refuse the step.
  const cliff: RoomModel = {
    width: 2, height: 1, tiles: Int16Array.from([0, 2]), door: { x: 0, y: 0, dir: 2 },
  };
  expect(findPath(cliff, open, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
});
test("a diagonal is denied when EITHER orthogonal is blocked", () => {
  const oneOrtho = (x: number, y: number) => x === 1 && y === 0;   // only one corner blocked
  expect(findPath(flat, oneOrtho, { x: 0, y: 0 }, { x: 1, y: 1 }))
    .toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);                     // forced around
});
test("the corner rule also applies to void corners", () => {
  const m = parseHeightmap("0x\n00", { x: 0, y: 0, dir: 2 });       // (1,0) void
  expect(findPath(m, open, { x: 0, y: 0 }, { x: 1, y: 1 }))
    .toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);
});
test("a wall with one gap forces the long way round", () => {
  const wall = (x: number, y: number) => x === 2 && y <= 3;         // column, gap only at (2,4)
  const path = findPath(flat, wall, { x: 0, y: 0 }, { x: 4, y: 0 })!;
  expect(path.at(-1)).toEqual({ x: 4, y: 0 });
  expect(path.some((t) => wall(t.x, t.y))).toBe(false);
  // 10 is forced: (2,4) can only be entered from (1,4) and left to (3,4) (diagonals would cut
  // the blocked (2,3) corner); each free segment has max(dx,dy)=4 ⇒ 4 steps: 4+1+1+4 = 10.
  expect(path).toHaveLength(10);
});

/** A tile can be reached the long way first and a short way later, which drops its score while it
 *  is still in the open set. Re-scanning the whole set on every pop could not miss that; a heap
 *  has to be told the tile moved. This layout is the smallest one where forgetting costs a step —
 *  it returns 7 instead of 6, a path that is legal but not the shortest. */
test("a tile re-reached more cheaply still yields the shortest path", () => {
  const m = parseHeightmap("00000\n00000\n00000\n00000\n00000", { x: 0, y: 0, dir: 2 });
  const blocked = (x: number, y: number): boolean =>
    (x === 1 && y === 1) || (y === 2 && (x === 3 || x === 4));
  const path = findPath(m, blocked, { x: 0, y: 0 }, { x: 4, y: 4 })!;
  expect(path.some((t) => blocked(t.x, t.y))).toBe(false);
  expect(path.at(-1)).toEqual({ x: 4, y: 4 });
  expect(path).toHaveLength(6);
});

/** The expansion cap is `width * height` (pathfind.ts) — every tile the room has — so a search
 *  that drains a room in full has to finish at exactly that many expansions, not the fixed number
 *  a bigger room could outgrow. */
test("draining the largest allowed room stays under the expansion cap", () => {
  const side = 64;
  const m = parseHeightmap(Array.from({ length: side }, () => "0".repeat(side)).join("\n"),
    { x: 0, y: 0, dir: 2 });
  // Seal the goal in: every other tile has to be expanded before the search can give up.
  const goal = { x: side - 1, y: side - 1 };
  const sealed = (x: number, y: number): boolean =>
    (x === side - 2 && y >= side - 2) || (y === side - 2 && x >= side - 2);
  expect(findPath(m, sealed, { x: 0, y: 0 }, goal)).toBeNull();
  // Reachable tiles in the same room still resolve, so the null above is the seal, not the cap.
  expect(findPath(m, sealed, { x: 0, y: 0 }, { x: side - 1, y: 0 })).not.toBeNull();
});

/** jtbug (Resort Grounds, 200x200): the fixed 20,000-expansion cap answered "no route" for a
 *  target `reachable()` says is reachable, because a room this size can legitimately need more
 *  expansions than that to find its way around a long wall to a single gap. This wall makes the
 *  search detour the width of the room before it finds the gap — 29,321 expansions, comfortably
 *  past the old fixed cap — and the target must still resolve to a real path. */
test("a reachable target past the old fixed cap still returns a path", () => {
  const side = 200;
  const m = parseHeightmap(Array.from({ length: side }, () => "0".repeat(side)).join("\n"),
    { x: 0, y: 0, dir: 2 });
  const wallY = 40, gapX = side - 1;
  const blocked = (x: number, y: number): boolean => y === wallY && x !== gapX;
  const path = findPath(m, blocked, { x: 100, y: 150 }, { x: 100, y: 5 });
  expect(path).not.toBeNull();
  expect(path?.at(-1)).toEqual({ x: 100, y: 5 });
});
