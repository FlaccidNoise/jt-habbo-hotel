import { Container, Texture, TextureSource } from "pixi.js";
import { beforeEach, expect, test } from "vitest";
import type { FurniDef, FurniItem, RoomModel } from "@grand/shared";
import type { FurniAsset, FurniAssets } from "../src/scene/assets.ts";
import type { FurniMeta } from "../src/scene/frames.ts";
import { FurniLayer } from "../src/scene/furni.ts";
import { RoomScene, ZOOM, setZoom } from "../src/scene/room.ts";
import { DepthIndex } from "../src/scene/sort.ts";

/** #404: a placed item used to be a permanent child of the world container and a permanent node in
 *  the painter sort, whatever the camera was looking at. #359 had already culled the floor and the
 *  walls, so at a furni cap worth a 200x200 room the sort's cost would have followed the room's
 *  furniture instead of the camera — and the tile culling would have bought nothing.
 *
 *  What is pinned here: an item off the window contributes neither, an item straddling the edge is
 *  kept, and the way back in restores what it left with. */

const DEFAULT_ZOOM = ZOOM;
const VIEW = { width: 1440, height: 900 };
const SIDE = 300;

beforeEach(() => setZoom(DEFAULT_ZOOM));

function flat(side: number): RoomModel {
  return { width: side, height: side, tiles: new Int16Array(side * side), door: { x: 0, y: 0, dir: 0 } };
}

function def(id: string, extra: Partial<FurniDef> = {}): FurniDef {
  return {
    id, name: id, theme: "test", w: 1, l: 1, stackHeights: [1], canWalk: false,
    canStackOn: true, seatHeight: null, color: 0x8899aa, ...extra,
  };
}

const DEFS: ReadonlyMap<string, FurniDef> = new Map([
  ["stool", def("stool")],
  ["bed", def("bed", { w: 2, l: 3 })],
  ["lamp", def("lamp", { interaction: "toggle", stackHeights: [1, 1] })],
  ["hearth", def("fireplace", { id: "fireplace", interaction: "toggle", stackHeights: [1, 1] })],
  ["chair", def("chair", { seatHeight: 0.5 })],
].map(([id, d]) => [id as string, d as FurniDef]));

function item(id: number, defId: string, x: number, y: number, extra: Partial<FurniItem> = {}): FurniItem {
  return { id, defId, x, y, z: 0, dir: 0, state: 0, ...extra };
}

/** A bundle that splits into two halves, so the seat's `:front` occluder exists to be culled.
 *  Nothing is ever rendered here — the texture is a descriptor, never uploaded. */
function seatAssets(): FurniAssets {
  const meta: FurniMeta = {
    sheet: "chair.png",
    frameW: 64, frameH: 64,
    dirs: [0, 2, 4, 6],
    anchorsX: [32, 32, 32, 32],
    anchorY: 48,
    occlusion: [0, 1, 2, 3].map(() => ({ x0: 0, y0: 0, z0: 0, x1: 1, y1: 1, z1: 1 })),
  };
  const base = new Texture({ source: new TextureSource({ width: 256, height: 128 }) });
  const asset: FurniAsset = { base, meta, frames: new Map(), near: null, nearFrames: new Map() };
  return new Map([["chair", asset]]);
}

function build(model: RoomModel, camera: boolean, assets: FurniAssets | null = null) {
  const depth = new DepthIndex();
  const scene = new RoomScene(new Container(), model, { click: () => {}, hover: () => {} }, depth,
    null, camera ? VIEW : null);
  const furni = new FurniLayer(scene.world, DEFS, assets, depth, camera ? scene.visible : null);
  scene.onWindow = (w) => furni.cull(w);
  const nodes = (depth as unknown as { nodes: Map<string, unknown> }).nodes;
  const furniNodes = (): string[] => [...nodes.keys()].filter((k) => k.startsWith("furni:"));
  return { scene, furni, depth, nodes, furniNodes };
}

/** Let frames pass without moving the camera. The floor builds and drops at most a screenful per
 *  frame (#408), so a jump comes to rest over the next few — and the item counts here are taken
 *  against a floor at rest, not against one frame of it. */
function settle(scene: RoomScene): void {
  for (let i = 0; i < 30; i++) scene.follow(null, VIEW.width, VIEW.height);
}

/** Where the camera has to stand for a given tile to be on screen. worldToScreen at z 0. */
function cameraOn(x: number, y: number): { sx: number; sy: number } {
  return { sx: (x - y) * 32, sy: (x + y) * 16 };
}

test("a layer with no window draws every item, however far apart", () => {
  const { furni, furniNodes } = build(flat(SIDE), false);
  furni.apply(item(1, "stool", 2, 2));
  furni.apply(item(2, "stool", 280, 280));
  expect(furniNodes().sort()).toEqual(["furni:1", "furni:2"]);
});

test("an item outside the window is neither a sort node nor a world child", () => {
  const { scene, furni, furniNodes } = build(flat(SIDE), true);
  scene.follow(cameraOn(10, 10), VIEW.width, VIEW.height);
  const children = scene.world.children.length;

  furni.apply(item(1, "stool", 10, 10));     // under the camera
  furni.apply(item(2, "stool", 280, 280));   // the far corner

  expect(furniNodes()).toEqual(["furni:1"]);
  expect(scene.world.children.length).toBe(children + 1);
});

test("the test is footprint overlap, not the origin tile — a bed across the edge is kept", () => {
  const { scene, furni, furniNodes } = build(flat(SIDE), true);
  scene.follow(cameraOn(150, 150), VIEW.width, VIEW.height);
  const window = scene.visible;

  // A 2x3 bed whose origin is two tiles outside the window's east edge, so three of its tiles are
  // outside and one column is inside. A point test on the origin would drop it.
  const straddling = item(1, "bed", window.x1 - 1, window.y0 + 4);
  const outside = item(2, "bed", window.x1 + 1, window.y0 + 4);
  furni.apply(straddling);
  furni.apply(outside);

  expect(furniNodes()).toEqual(["furni:1"]);
});

test("an item on the window's last tile is in, one past it is out", () => {
  const { scene, furni, furniNodes } = build(flat(SIDE), true);
  scene.follow(cameraOn(150, 150), VIEW.width, VIEW.height);
  const w = scene.visible;
  furni.apply(item(1, "stool", w.x1 - 1, w.y0));
  furni.apply(item(2, "stool", w.x1, w.y0));
  furni.apply(item(3, "stool", w.x0, w.y1 - 1));
  furni.apply(item(4, "stool", w.x0, w.y1));
  expect(furniNodes().sort()).toEqual(["furni:1", "furni:3"]);
});

test("panning away and back restores exactly the same nodes", () => {
  const { scene, furni, furniNodes } = build(flat(SIDE), true);
  scene.follow(cameraOn(40, 40), VIEW.width, VIEW.height);
  settle(scene);
  for (let i = 0; i < 60; i++) furni.apply(item(i, "stool", 20 + (i % 10) * 4, 20 + Math.floor(i / 10) * 4));
  const before = furniNodes().sort().join(" ");
  const shown = scene.world.children.length;
  expect(before.length).toBeGreaterThan(0);

  scene.follow(cameraOn(280, 280), VIEW.width, VIEW.height);
  settle(scene);
  expect(furniNodes()).toEqual([]);
  expect(scene.world.children.length).toBeLessThan(shown);

  scene.follow(cameraOn(40, 40), VIEW.width, VIEW.height);
  settle(scene);
  expect(furniNodes().sort().join(" ")).toBe(before);
  expect(scene.world.children.length).toBe(shown);
});

test("a switched-on toggle comes back switched on, and a lit hearth is smoking again", () => {
  const { scene, furni } = build(flat(SIDE), true);
  scene.follow(cameraOn(40, 40), VIEW.width, VIEW.height);
  const lamp = item(1, "lamp", 40, 40, { state: 1 });
  const hearth = item(2, "hearth", 41, 40, { state: 1 });
  furni.apply(lamp);
  furni.apply(hearth);

  const views = (furni as unknown as { views: Map<number, Container> }).views;
  const smoking = (furni as unknown as { smoking: Map<number, unknown> }).smoking;
  // Lit is a group — the glow pool under the sprite — where off is the bare sprite or slab.
  const litChildren = views.get(1)?.children.length ?? 0;
  expect(litChildren).toBeGreaterThan(1);
  expect(smoking.has(2)).toBe(true);

  scene.follow(cameraOn(280, 280), VIEW.width, VIEW.height);
  expect(views.has(1)).toBe(false);
  expect(smoking.has(2)).toBe(false);

  scene.follow(cameraOn(40, 40), VIEW.width, VIEW.height);
  expect(views.get(1)?.children.length).toBe(litChildren);
  expect(smoking.has(2)).toBe(true);
});

test("a state change while the item is culled shows up when it comes back", () => {
  const { scene, furni } = build(flat(SIDE), true);
  scene.follow(cameraOn(280, 280), VIEW.width, VIEW.height);
  furni.apply(item(1, "lamp", 40, 40, { state: 1 }));   // switched on, off screen
  const views = (furni as unknown as { views: Map<number, Container> }).views;
  expect(views.has(1)).toBe(false);

  scene.follow(cameraOn(40, 40), VIEW.width, VIEW.height);
  expect((views.get(1)?.children.length ?? 0)).toBeGreaterThan(1);
});

test("a seat's near half and its base cull together", () => {
  const { scene, furni, furniNodes } = build(flat(SIDE), true, seatAssets());
  scene.follow(cameraOn(40, 40), VIEW.width, VIEW.height);
  furni.apply(item(1, "chair", 40, 40));
  expect(furniNodes().sort()).toEqual(["furni:1", "furni:1:front"]);

  scene.follow(cameraOn(280, 280), VIEW.width, VIEW.height);
  expect(furniNodes()).toEqual([]);

  scene.follow(cameraOn(40, 40), VIEW.width, VIEW.height);
  expect(furniNodes().sort()).toEqual(["furni:1", "furni:1:front"]);
});

test("removing a culled item forgets it — it does not come back on the next pan", () => {
  const { scene, furni, furniNodes } = build(flat(SIDE), true);
  scene.follow(cameraOn(40, 40), VIEW.width, VIEW.height);
  furni.apply(item(1, "stool", 40, 40));
  scene.follow(cameraOn(280, 280), VIEW.width, VIEW.height);
  furni.remove(1);
  scene.follow(cameraOn(40, 40), VIEW.width, VIEW.height);
  expect(furniNodes()).toEqual([]);
});

/** The whole point of the bug: the sort's node count must follow the camera, not the room's
 *  furniture. 5,000 items over a 300x300 floor is the density the cap raise is aiming at. */
test("5,000 items over a 300x300 floor leave the sort a viewport-sized problem", () => {
  const { scene, furni, furniNodes } = build(flat(SIDE), true);
  scene.follow(cameraOn(150, 150), VIEW.width, VIEW.height);
  for (let i = 0; i < 5000; i++) {
    furni.apply(item(i, "stool", (i * 7) % SIDE, (i * 13) % SIDE));
  }
  const seated = furniNodes().length;
  expect(seated).toBeGreaterThan(0);
  expect(seated).toBeLessThan(600);

  let peak = seated;
  for (let step = 0; step < 60; step++) {
    scene.follow(cameraOn(20 + step * 4, 20 + step * 4), VIEW.width, VIEW.height);
    peak = Math.max(peak, furniNodes().length);
  }
  expect(peak).toBeLessThan(600);
});
