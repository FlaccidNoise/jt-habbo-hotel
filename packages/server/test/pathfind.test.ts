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
