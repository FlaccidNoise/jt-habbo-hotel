import { Container } from "pixi.js";
import { expect, test } from "vitest";
import { parseHeightmap } from "@grand/shared";
import type { RoomModel } from "@grand/shared";
import { RoomScene } from "../src/scene/room.ts";
import { DepthIndex, LAYER, tileDepth } from "../src/scene/sort.ts";

/** #230: floor tiles used to keep a flat band below every sprite, which is only correct while
 *  every tile in the room is the same height. No room ships a raised heightmap yet, so stage one.
 *
 *  Rows 0-1 are the floor, row 2 is the step up, rows 3-4 are the platform. Neighbouring rows can
 *  only differ by one — parseHeightmap rejects a rise the pathfinder could not climb — so a
 *  two-high platform needs the step row in front of it. */
const RAISED = parseHeightmap(["00000", "00000", "11111", "22222", "22222"].join("\n"), {
  x: 0, y: 0, dir: 0,
});
const FLAT = parseHeightmap("000\n000\n000", { x: 0, y: 0, dir: 0 });

function room(model: RoomModel): { depth: DepthIndex; scene: RoomScene } {
  const depth = new DepthIndex();
  const scene = new RoomScene(new Container(), model, { click: () => {}, hover: () => {} }, depth);
  return { depth, scene };
}

/** The tile diamond at (x, y); every heightmap here is void-free. */
function tileAt(scene: RoomScene, x: number, y: number): Container {
  const tile = scene.tileAt(x, y);
  if (!tile) throw new Error(`no tile at ${x},${y}`);
  return tile;
}

/** A one-tile, one-unit-tall view standing at (x, y) on a floor of height z. */
function stand(depth: DepthIndex, id: string, x: number, y: number, z: number): Container {
  const view = new Container();
  depth.set(id, { x0: x, y0: y, z0: z, x1: x + 1, y1: y + 1, z1: z + 1, layer: LAYER.furni }, view);
  return view;
}

test("a flat room puts no tile in the sort, so the restack cost is unchanged", () => {
  const { depth, scene } = room(FLAT);
  const furni = stand(depth, "furni", 1, 1, 0);
  depth.flush();
  expect(furni.zIndex).toBe(0);   // the only node in the sort
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      expect(tileAt(scene, x, y).zIndex).toBe(tileDepth(x, y));
    }
  }
});

test("a raised tile draws over the furniture standing behind it", () => {
  // The bug, exactly: the step at (2,2) rises a unit above the floor, and its top face covers the
  // lower half of anything standing at (2,1). In the flat band it drew first and lost.
  const { depth, scene } = room(RAISED);
  const behind = stand(depth, "behind", 2, 1, 0);
  depth.flush();
  expect(tileAt(scene, 2, 2).zIndex).toBeGreaterThan(behind.zIndex);
});

test("furniture in front of a raised tile still draws over it", () => {
  const { depth, scene } = room(RAISED);
  const inFront = stand(depth, "inFront", 2, 4, 2);
  depth.flush();
  expect(inFront.zIndex).toBeGreaterThan(tileAt(scene, 2, 3).zIndex);
});

test("furniture resting on a platform draws over the tile it rests on", () => {
  const { depth, scene } = room(RAISED);
  const onTop = stand(depth, "onTop", 2, 3, 2);
  depth.flush();
  expect(onTop.zIndex).toBeGreaterThan(tileAt(scene, 2, 3).zIndex);
});

test("only tiles above the room's floor join the sort", () => {
  const { depth, scene } = room(RAISED);
  depth.flush();
  // Rows 0-1 are the floor: band slots, all below zero.
  for (let x = 0; x < 5; x++) {
    expect(tileAt(scene, x, 1).zIndex).toBe(tileDepth(x, 1));
  }
  // Rows 2-4 are raised: real slots in the sort.
  for (const y of [2, 3, 4]) {
    expect(tileAt(scene, 2, y).zIndex).toBeGreaterThanOrEqual(0);
  }
});

test("the placement highlight sorts above the raised tile it lies on", () => {
  const { depth, scene } = room(RAISED);
  scene.highlight([{ x: 2, y: 3 }], true, 2);
  depth.flush();
  const marker = scene.world.children[0] as Container;
  expect(marker.zIndex).toBeGreaterThan(tileAt(scene, 2, 3).zIndex);

  scene.clearHighlight();
  depth.flush();
  expect(marker.zIndex).toBe(-1);
});
