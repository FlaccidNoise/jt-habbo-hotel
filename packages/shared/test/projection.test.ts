import { describe, expect, test } from "vitest";
import { worldToScreen, screenToTile, dirFromStep, DIR_STEPS } from "../src/projection.ts";

describe("verified Habbo constants at scale 64", () => {
  test("+1 X is +32,+16", () => expect(worldToScreen(1, 0, 0, 64)).toEqual({ sx: 32, sy: 16 }));
  test("+1 Y is -32,+16", () => expect(worldToScreen(0, 1, 0, 64)).toEqual({ sx: -32, sy: 16 }));
  test("+1 Z is 0,-32", () => expect(worldToScreen(0, 0, 1, 64)).toEqual({ sx: 0, sy: -32 }));
  test("composite", () => expect(worldToScreen(3, 2, 1.5, 64)).toEqual({ sx: 32, sy: 32 }));
});
describe("scale 32 halves each step separately", () => {
  test("+1 X", () => expect(worldToScreen(1, 0, 0, 32)).toEqual({ sx: 16, sy: 8 }));
  test("+1 Y", () => expect(worldToScreen(0, 1, 0, 32)).toEqual({ sx: -16, sy: 8 }));
  test("+1 Z", () => expect(worldToScreen(0, 0, 1, 32)).toEqual({ sx: 0, sy: -16 }));
});
describe("screenToTile inverts the floor plane", () => {
  for (const [x, y] of [[0, 0], [5, 3], [9, 9], [-2, 4]] as const)
    test(`tile ${x},${y} round-trips through its center`, () => {
      const { sx, sy } = worldToScreen(x, y, 0, 64);
      expect(screenToTile(sx, sy, 64)).toEqual({ x, y });
    });

  // Every point inside a tile resolves to that tile, not to a neighbour: the diamond for (0,0)
  // spans sy -16..+16 at sx 0, so a point just inside any edge must still land on (0,0).
  for (const [sx, sy] of [[0, -15], [0, 15], [-31, 0], [31, 0], [15, 7]] as const)
    test(`screen ${sx},${sy} is inside tile 0,0`, () =>
      expect(screenToTile(sx, sy, 64)).toEqual({ x: 0, y: 0 }));
});
describe("direction table", () => {
  test("all eight", () => {
    const cases: Array<[number, number, number]> = [
      [0, -1, 0], [1, -1, 1], [1, 0, 2], [1, 1, 3], [0, 1, 4], [-1, 1, 5], [-1, 0, 6], [-1, -1, 7],
    ];
    for (const [dx, dy, dir] of cases) expect(dirFromStep(dx, dy)).toBe(dir);
  });
  test("table and function agree", () => {
    DIR_STEPS.forEach((s, dir) => expect(dirFromStep(s.dx, s.dy)).toBe(dir));
  });
});
