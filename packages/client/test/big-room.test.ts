import { Container } from "pixi.js";
import { beforeEach, expect, test } from "vitest";
import { parseHeightmap } from "@grand/shared";
import type { RoomModel } from "@grand/shared";
import { RoomScene, ZOOM, loadZoom, setZoom } from "../src/scene/room.ts";
import { WallLayer } from "../src/scene/walls.ts";
import { DepthIndex } from "../src/scene/sort.ts";

/** Read before any test can move it: a player who has never touched the control gets 1. */
const DEFAULT_ZOOM = ZOOM;

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

/** What "bounded" is allowed to mean, per zoom. The window is derived from the scale, so zooming
 *  out to 1 hands the same screen four times the floor and the built set grows with it. Both
 *  numbers are the viewport's cost, not the room's — 90,000 tiles is more than an order of
 *  magnitude past either. Measured builds sit near 3.9k and 1.5k. */
const BUDGET: Readonly<Record<1 | 2, number>> = { 1: 5000, 2: 3000 };

const ZOOMS = [1, 2] as const;

// Module-level zoom is shared state; no test may inherit the one before it.
beforeEach(() => setZoom(DEFAULT_ZOOM));

function build(model: RoomModel, camera: boolean) {
  const depth = new DepthIndex();
  const scene = new RoomScene(new Container(), model, { click: () => {}, hover: () => {} }, depth,
    null, camera ? VIEW : null);
  const walls = new WallLayer(scene.world, model, new Map(), null,
    { click: () => {}, hover: () => {} }, depth, null, camera ? scene.visible : null);
  scene.onWindow = (w) => walls.cull(w);
  const nodes = (depth as unknown as { nodes: Map<string, unknown> }).nodes;
  return { scene, walls, depth, nodes };
}

/** Every tile currently built, as a comparable string. */
function shot(scene: RoomScene, model: RoomModel): string {
  const seen: string[] = [];
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) if (scene.tileAt(x, y)) seen.push(`${x},${y}`);
  }
  return seen.join(" ");
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

test.each(ZOOMS)("at zoom %i a 300x300 room costs what a 64x64 one costs, not 22x more", (zoom) => {
  setZoom(zoom);
  const small = build(terraced(64), true);
  const big = build(terraced(300), true);
  const uncounted = terraced(300).width * terraced(300).height;   // 90,000 tiles

  // The whole point: the big room is not proportionally bigger on screen.
  expect(big.scene.world.children.length).toBeLessThan(BUDGET[zoom]);
  expect(big.nodes.size).toBeLessThan(BUDGET[zoom]);
  expect(big.scene.world.children.length).toBeLessThan(uncounted / 20);
  // And it is within a small factor of the room that fits under MAX_DIM.
  expect(big.scene.world.children.length).toBeLessThan(small.scene.world.children.length * 3);
});

test.each(ZOOMS)("at zoom %i panning keeps the built set bounded and puts back what it took away",
  (zoom) => {
    setZoom(zoom);
    const model = terraced(300);
    const { scene, nodes } = build(model, true);

    scene.follow({ sx: 400, sy: 300 }, VIEW.width, VIEW.height);
    const before = shot(scene, model);
    expect(before.length).toBeGreaterThan(0);

    let peakChildren = 0;
    let peakNodes = 0;
    for (let step = 0; step < 400; step++) {
      scene.follow({ sx: 400 + step * 4, sy: 300 + step * 3 }, VIEW.width, VIEW.height);
      peakChildren = Math.max(peakChildren, scene.world.children.length);
      peakNodes = Math.max(peakNodes, nodes.size);
    }
    expect(peakChildren).toBeLessThan(BUDGET[zoom]);
    expect(peakNodes).toBeLessThan(BUDGET[zoom]);

    // Culling is not destruction: the same camera position rebuilds exactly the same floor.
    scene.follow({ sx: 400, sy: 300 }, VIEW.width, VIEW.height);
    expect(shot(scene, model)).toBe(before);
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

/** #406. Magnification is the player's, and it is the same number the culling window is derived
 *  from — so every claim about the window has a zoom in it. */
test("zoom starts at 1, the wider view", () => {
  expect(DEFAULT_ZOOM).toBe(1);
});

test("the same camera shows more of the room at zoom 1 than at zoom 2", () => {
  const model = terraced(300);
  const camera = { sx: 400, sy: 300 };

  setZoom(1);
  const wide = build(model, true);
  wide.scene.follow(camera, VIEW.width, VIEW.height);
  const wideTiles = shot(wide.scene, model).split(" ").length;

  setZoom(2);
  const close = build(model, true);
  close.scene.follow(camera, VIEW.width, VIEW.height);
  const closeTiles = shot(close.scene, model).split(" ").length;

  expect(wideTiles).toBeGreaterThan(closeTiles);
  expect(wide.scene.world.children.length).toBeLessThan(BUDGET[1]);
  expect(close.scene.world.children.length).toBeLessThan(BUDGET[2]);
});

test("changing zoom re-derives the window, and changing back rebuilds the same floor", () => {
  const model = terraced(300);
  const camera = { sx: 400, sy: 300 };
  const { scene, walls } = build(model, true);
  let fired = 0;
  scene.onWindow = (w) => {
    fired++;
    walls.cull(w);
  };

  scene.follow(camera, VIEW.width, VIEW.height);
  const wide = { ...scene.visible };
  const wideFloor = shot(scene, model);

  fired = 0;
  setZoom(2);
  scene.applyZoom();
  scene.follow(camera, VIEW.width, VIEW.height);
  expect(scene.world.scale.x).toBe(2);
  expect(fired).toBeGreaterThan(0);
  expect(scene.visible).not.toEqual(wide);

  setZoom(1);
  scene.applyZoom();
  scene.follow(camera, VIEW.width, VIEW.height);
  expect(scene.visible).toEqual(wide);
  expect(shot(scene, model)).toBe(wideFloor);
});

test("the stored zoom is read back, and anything unreadable is 1", () => {
  const store = new Map<string, string>();
  const holder = globalThis as { localStorage?: unknown };
  holder.localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };
  try {
    setZoom(2);
    expect(store.get("grand-zoom")).toBe("2");   // the key is a contract with the player's browser
    setZoom(1);
    store.set("grand-zoom", "2");
    loadZoom();
    expect(ZOOM).toBe(2);

    store.set("grand-zoom", "banana");
    loadZoom();
    expect(ZOOM).toBe(1);

    setZoom(2);
    store.clear();
    loadZoom();
    expect(ZOOM).toBe(1);
  } finally {
    delete holder.localStorage;
  }
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
