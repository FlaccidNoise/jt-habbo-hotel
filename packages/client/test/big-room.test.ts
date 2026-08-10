import { Container } from "pixi.js";
import { expect, test } from "vitest";
import { parseHeightmap } from "@grand/shared";
import type { RoomModel } from "@grand/shared";
import { RoomScene } from "../src/scene/room.ts";
import { WallLayer } from "../src/scene/walls.ts";
import { DepthIndex } from "../src/scene/sort.ts";

/** #359/#360: a public room is meant to reach 300x300, which is 90,000 tiles. A tile is a Graphics
 *  with four listeners, and a raised one is two more nodes in the painter sort, so building the
 *  whole floor is six figures of both and the sort that walks them is quadratic.
 *
 *  The heightmap refuses anything over MAX_DIM = 64, so these rooms are built straight from a
 *  RoomModel — raising that cap is the room-building task, not this one. What is pinned here is
 *  that the scene's cost follows the VIEWPORT and not the room: a 300x300 room must cost about
 *  what a 64x64 one does. */
function terraced(side: number): RoomModel {
  const tiles = new Int16Array(side * side);
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const edge = Math.min(x, y, side - 1 - x, side - 1 - y);
      tiles[y * side + x] = Math.min(3, Math.floor(edge / Math.max(1, Math.floor(side / 12))));
    }
  }
  return { width: side, height: side, tiles, door: { x: 0, y: 0, dir: 0 } };
}

const VIEW = { width: 1440, height: 900 };

function build(model: RoomModel, camera: boolean) {
  const depth = new DepthIndex();
  const scene = new RoomScene(new Container(), model, { click: () => {}, hover: () => {} }, depth,
    null, camera ? VIEW : null);
  const walls = new WallLayer(scene.world, model, new Map(), null,
    { click: () => {}, hover: () => {} }, depth, null, camera ? scene.visible : null);
  scene.onWindow = (w) => walls.cull(w);
  const nodes = (depth as unknown as { nodes: Map<string, unknown> }).nodes;
  return { scene, depth, nodes };
}

/** The scene a camera never touched draws the whole floor. Every other client test builds one
 *  that way and reaches for tiles anywhere in it, so this is a contract, not an accident. */
test("without a camera the whole floor is built", () => {
  const model = parseHeightmap("000\n000\n000", { x: 0, y: 0, dir: 0 });
  const { scene } = build(model, false);
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) expect(scene.tileAt(x, y)).not.toBeNull();
  }
});

test("a 300x300 room costs what a 64x64 one costs, not 22x more", () => {
  const small = build(terraced(64), true);
  const big = build(terraced(300), true);
  const uncounted = terraced(300).width * terraced(300).height;   // 90,000 tiles

  // The whole point: the big room is not proportionally bigger on screen.
  expect(big.scene.world.children.length).toBeLessThan(3000);
  expect(big.nodes.size).toBeLessThan(3000);
  expect(big.scene.world.children.length).toBeLessThan(uncounted / 20);
  // And it is within a small factor of the room that fits under MAX_DIM.
  expect(big.scene.world.children.length).toBeLessThan(small.scene.world.children.length * 3);
});

test("panning keeps the built set bounded and puts back what it took away", () => {
  const model = terraced(300);
  const { scene, nodes } = build(model, true);

  const shot = (): string => {
    const seen: string[] = [];
    for (let y = 0; y < model.height; y++) {
      for (let x = 0; x < model.width; x++) if (scene.tileAt(x, y)) seen.push(`${x},${y}`);
    }
    return seen.join(" ");
  };

  scene.follow({ sx: 400, sy: 300 }, VIEW.width, VIEW.height);
  const before = shot();
  expect(before.length).toBeGreaterThan(0);

  let peakChildren = 0;
  let peakNodes = 0;
  for (let step = 0; step < 400; step++) {
    scene.follow({ sx: 400 + step * 4, sy: 300 + step * 3 }, VIEW.width, VIEW.height);
    peakChildren = Math.max(peakChildren, scene.world.children.length);
    peakNodes = Math.max(peakNodes, nodes.size);
  }
  expect(peakChildren).toBeLessThan(3000);
  expect(peakNodes).toBeLessThan(3000);

  // Culling is not destruction: the same camera position rebuilds exactly the same floor.
  scene.follow({ sx: 400, sy: 300 }, VIEW.width, VIEW.height);
  expect(shot()).toBe(before);
});

test("a rebuilt tile is interactive again", () => {
  const model = terraced(300);
  const { scene } = build(model, true);
  scene.follow({ sx: 400, sy: 300 }, VIEW.width, VIEW.height);
  const window = scene.visible;
  const x = window.x0 + 2, y = window.y0 + 2;
  expect(scene.tileAt(x, y)?.eventMode).toBe("static");

  scene.follow({ sx: 4000, sy: 3000 }, VIEW.width, VIEW.height);
  expect(scene.tileAt(x, y)).toBeNull();

  scene.follow({ sx: 400, sy: 300 }, VIEW.width, VIEW.height);
  expect(scene.tileAt(x, y)?.eventMode).toBe("static");
});

/** Walls are per-tile objects too — a 300-tile side asks for hundreds of interactive faces, each
 *  a node in the same sort — so they follow the floor's window rather than their own. */
test("wall faces follow the floor's window", () => {
  const model = terraced(300);
  const depth = new DepthIndex();
  const scene = new RoomScene(new Container(), model, { click: () => {}, hover: () => {} }, depth,
    null, VIEW);
  const walls = new WallLayer(scene.world, model, new Map(), null,
    { click: () => {}, hover: () => {} }, depth, null, scene.visible);
  scene.onWindow = (w) => walls.cull(w);
  const wallNodes = (): number =>
    [...(depth as unknown as { nodes: Map<string, unknown> }).nodes.keys()]
      .filter((k) => k.startsWith("wall:")).length;

  // The camera starts at the room's centre, which no perimeter wall reaches.
  scene.follow({ sx: 0, sy: 300 * 16 }, VIEW.width, VIEW.height);
  const middle = wallNodes();
  // Cornering the camera brings the perimeter back into view.
  scene.follow({ sx: 0, sy: 0 }, VIEW.width, VIEW.height);
  expect(wallNodes()).toBeGreaterThan(middle);
  expect(wallNodes()).toBeLessThan(600);
});
