import { expect, test } from "vitest";
import { parseHeightmap, charToHeight, climbOk, tileHeight, HeightmapError } from "../src/heightmap.ts";

const DOOR = { x: 0, y: 1, dir: 2 };
test("parses a simple room", () => {
  const m = parseHeightmap("xx00\n0000\n0012", DOOR);
  expect([m.width, m.height]).toEqual([4, 3]);
  expect(m.tiles[0]).toBe(-1);
  expect(m.tiles[2 * 4 + 3]).toBe(2);
});
test("charToHeight maps the full alphabet, case-insensitively", () => {
  expect(charToHeight("0")).toBe(0); expect(charToHeight("9")).toBe(9);
  expect(charToHeight("a")).toBe(10); expect(charToHeight("A")).toBe(10);
  expect(charToHeight("z")).toBe(35); expect(charToHeight("Z")).toBe(35);
  expect(charToHeight("x")).toBe(-1); expect(charToHeight("X")).toBe(-1);
  expect(() => charToHeight("!")).toThrow(HeightmapError);
});
test("tolerates one trailing newline", () =>
  expect(() => parseHeightmap("00\n00\n", { x: 0, y: 0, dir: 2 })).not.toThrow());
test("empty input throws", () => expect(() => parseHeightmap("", DOOR)).toThrow(HeightmapError));
test("rejects ragged rows instead of skipping", () =>
  expect(() => parseHeightmap("000\n00\n000", DOOR)).toThrow(HeightmapError));
test("rejects invalid characters", () =>
  expect(() => parseHeightmap("00\n0!", DOOR)).toThrow(HeightmapError));
test("rejects a door on a void tile", () =>
  expect(() => parseHeightmap("x0\n00", { x: 0, y: 0, dir: 2 })).toThrow(HeightmapError));
test("rejects over 64x64", () => {
  const row = "0".repeat(65);
  expect(() => parseHeightmap(Array(3).fill(row).join("\n"), DOOR)).toThrow(HeightmapError);
});
test("rejects tiles walled off by void", () =>
  expect(() => parseHeightmap("0x0\n0x0", DOOR)).toThrow(HeightmapError));
test("rejects tiles walled off by height — a 2-step cliff is unwalkable", () =>
  // right column is height 3; door side is height 0-1: no climbOk step reaches it
  expect(() => parseHeightmap("03\n13", DOOR)).toThrow(HeightmapError));
test("accepts a 1-step ramp", () =>
  expect(() => parseHeightmap("01\n01", DOOR)).not.toThrow());
test("diagonal-only connectivity counts as reachable (8-dir walk)", () =>
  // (1,0) touches (0,1) only diagonally; both orthogonal corners are void → corner-cut denied → unreachable
  expect(() => parseHeightmap("x0\n0x", { x: 0, y: 1, dir: 2 })).toThrow(HeightmapError));
test("tileHeight is -1 out of bounds", () => {
  const m = parseHeightmap("00\n00", { x: 0, y: 0, dir: 2 });
  expect(tileHeight(m, 5, 5)).toBe(-1);
  expect(tileHeight(m, -1, 0)).toBe(-1);
});
test("climbOk", () => {
  expect(climbOk(0, 1)).toBe(true); expect(climbOk(3, 2)).toBe(true);
  expect(climbOk(0, 2)).toBe(false); expect(climbOk(0, -1)).toBe(false);
});
