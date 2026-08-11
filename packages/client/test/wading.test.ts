import { Container, Texture, TextureSource } from "pixi.js";
import { expect, test } from "vitest";
import { parseHeightmap } from "@grand/shared";
import { clipRows } from "../src/scene/avatar.ts";
import { waterlineAt } from "../src/scene/decor.ts";
import type { DecorAsset, FloorDecor, FloorRegion } from "../src/scene/decor.ts";
import { RoomScene } from "../src/scene/room.ts";
import { DepthIndex } from "../src/scene/sort.ts";

/** Wading (#427). The pool's floor decor is what says how deep the water is, so the same rectangles
 *  that paint the surface (#407) are what cut the figures standing in it. */

function asset(id: string): DecorAsset<FloorDecor> {
  const def: FloorDecor = {
    kind: "floor", id, name: id, tile: { w: 64, h: 32 }, sides: { left: 0, right: 0 },
  };
  return { def, texture: new Texture({ source: new TextureSource({ width: 64, height: 32 }) }) };
}

const POOL = asset("floor_pool");
const LOUNGE = asset("floor_lounge");

const rect = (
  x0: number, y0: number, x1: number, y1: number, a: DecorAsset<FloorDecor>,
): FloorRegion => ({ x0, y0, x1, y1, asset: a });

/** The waist of the 80px figure, and the one entry the table has today. */
const WAIST = 34;

test("a tile inside the pool is water, bounds included, and everything else is dry", () => {
  const regions = [rect(2, 2, 4, 4, POOL)];
  for (const [x, y] of [[2, 2], [4, 4], [3, 3]] as const) {
    expect(waterlineAt(regions, x, y), `${x},${y}`).toBe(WAIST);
  }
  expect(waterlineAt(regions, 1, 2)).toBe(0);
  expect(waterlineAt(regions, 5, 5)).toBe(0);
  expect(waterlineAt([], 3, 3)).toBe(0);
});

test("a floor that is not water is dry however it is laid", () => {
  expect(waterlineAt([rect(0, 0, 5, 5, LOUNGE)], 3, 3)).toBe(0);
  // Last rectangle wins, the same way round as the surface it paints.
  expect(waterlineAt([rect(0, 0, 5, 5, POOL), rect(3, 3, 5, 5, LOUNGE)], 4, 4)).toBe(0);
});

test("the scene answers for the floor it was built with", () => {
  const model = parseHeightmap(["0000", "0000", "0000", "0000"].join("\n"), { x: 0, y: 0, dir: 2 });
  const scene = new RoomScene(new Container(), model, { click: () => {}, hover: () => {} },
    new DepthIndex(), null, null, [rect(1, 1, 2, 2, POOL)]);
  expect(scene.waterline(1, 1)).toBe(WAIST);
  expect(scene.waterline(3, 3)).toBe(0);
});

// The baked cell is 112 rows with the feet 102 down it, so a waist-deep figure keeps the top 68.
test("the cut keeps the cell from its top down to the waterline", () => {
  expect(clipRows(-102, WAIST)).toBe(68);
  expect(clipRows(-102, 0)).toBe(102);
  // Sunk past the top of its own cell: a sliver, never an empty texture.
  expect(clipRows(-102, 120)).toBe(1);
});
