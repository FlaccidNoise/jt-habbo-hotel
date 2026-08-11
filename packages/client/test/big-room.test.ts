import { Container } from "pixi.js";
import { beforeEach, expect, test } from "vitest";
import { parseHeightmap, tileHeight, worldToScreen } from "@grand/shared";
import type { RoomModel } from "@grand/shared";
import { RoomScene, SCALE, ZOOM, loadZoom, setZoom } from "../src/scene/room.ts";
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

/** Let frames pass without moving the camera. The floor builds and drops at most a screenful per
 *  frame (#408), so a camera that jumped comes to rest over the next few — which in the client is
 *  the ticker calling `follow` again, target or no target. Every claim about the whole window
 *  rather than about one frame's worth of it has to stand here. */
function settle(scene: RoomScene): void {
  for (let i = 0; i < 30; i++) scene.follow(null, VIEW.width, VIEW.height);
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
  settle(small.scene);
  settle(big.scene);
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
    settle(scene);
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
    settle(scene);
    expect(shot(scene, model)).toBe(before);
  });

test("a rebuilt tile is interactive again", () => {
  const model = terraced(300);
  const { scene } = build(model, true);
  scene.follow({ sx: 400, sy: 300 }, VIEW.width, VIEW.height);
  settle(scene);
  const window = scene.visible;
  const x = window.x0 + 2, y = window.y0 + 2;
  expect(scene.tileAt(x, y)?.eventMode).toBe("static");

  scene.follow({ sx: 4000, sy: 3000 }, VIEW.width, VIEW.height);
  settle(scene);
  expect(scene.tileAt(x, y)).toBeNull();

  scene.follow({ sx: 400, sy: 300 }, VIEW.width, VIEW.height);
  settle(scene);
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
  settle(wide.scene);
  const wideTiles = shot(wide.scene, model).split(" ").length;

  setZoom(2);
  const close = build(model, true);
  close.scene.follow(camera, VIEW.width, VIEW.height);
  settle(close.scene);
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
  settle(scene);
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
  settle(scene);
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
  settle(scene);
  expect(wallNodes()).toBeGreaterThan(middle);
  expect(wallNodes()).toBeLessThan(600);
});

// ---------------------------------------------------------------------------------------------
// #408: a camera jump used to rebuild the whole window inside the frame that noticed it — 18 ms on
// a 200x200 floor, where a steady pan crossing one row of tiles costs nothing. The work is spread
// over the frames after instead, nearest the middle of the screen first. What has to hold: the
// player never sees the deferral, and the steady case never enters it.

/** The Resort Grounds' side (#409), which is the size the budget has to hold up at. */
const FLAGSHIP = 200;

/** Off-screen tiles one frame may build or drop, from room.ts. Pinned rather than imported: the
 *  number IS the fix, and a change to it should have to be written down here. What the player can
 *  see is not rationed by it at all — that is what `missing` below is for. */
const OFF_SCREEN_TILES = 600;

/** Every tile currently built. */
function builtSet(scene: RoomScene, model: RoomModel): Set<string> {
  const out = new Set<string>();
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) if (scene.tileAt(x, y)) out.add(`${x},${y}`);
  }
  return out;
}

/** Walkable tiles whose floor diamond reaches into the viewport — what the player can actually see,
 *  as against what the window reaches. The window is the bounding box of a rotated screen, so its
 *  corners are well off it: this is the set a deferred build is not allowed to touch. */
function onScreen(scene: RoomScene, model: RoomModel): string[] {
  const out: string[] = [];
  const world = scene.world;
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) {
      const h = tileHeight(model, x, y);
      if (h < 0) continue;
      const p = worldToScreen(x, y, h, SCALE);
      const sx = world.x + ZOOM * p.sx, sy = world.y + ZOOM * p.sy;
      const halfW = ZOOM * SCALE / 2, halfH = ZOOM * SCALE / 4;
      if (sx + halfW < 0 || sx - halfW > VIEW.width) continue;
      if (sy + halfH < 0 || sy - halfH > VIEW.height) continue;
      out.push(`${x},${y}`);
    }
  }
  return out;
}

function missing(scene: RoomScene, model: RoomModel): string[] {
  const built = builtSet(scene, model);
  return onScreen(scene, model).filter((k) => !built.has(k));
}

test.each(ZOOMS)("at zoom %i a jump builds a frame's worth at a time, not the whole window", (zoom) => {
  setZoom(zoom);
  const model = terraced(FLAGSHIP);
  const { scene } = build(model, true);
  scene.follow({ sx: 0, sy: 30 * 32 }, VIEW.width, VIEW.height);
  settle(scene);

  // Far enough that the two windows do not overlap: every tile on screen afterwards is a new one.
  let before = builtSet(scene, model);
  const frames: Array<{ made: number; gone: number }> = [];
  scene.follow({ sx: 0, sy: 170 * 32 }, VIEW.width, VIEW.height);
  const shown = onScreen(scene, model).length;
  const w = scene.visible;
  let cells = 0;
  for (let y = w.y0; y < w.y1; y++) {
    for (let x = w.x0; x < w.x1; x++) if (tileHeight(model, x, y) >= 0) cells++;
  }
  for (let i = 0; i < 40; i++) {
    const after = builtSet(scene, model);
    frames.push({
      made: [...after].filter((k) => !before.has(k)).length,
      gone: [...before].filter((k) => !after.has(k)).length,
    });
    before = after;
    scene.follow(null, VIEW.width, VIEW.height);
  }

  // The frame that noticed the jump owes the screen whatever is on it, and takes one ration of the
  // rest. Every frame after is pure off-screen work, so the ration is the whole of it.
  expect(frames[0]?.made).toBe(shown + OFF_SCREEN_TILES);
  expect(frames[0]?.gone).toBe(0);
  for (const f of frames.slice(1)) expect(f.made + f.gone).toBeLessThanOrEqual(OFF_SCREEN_TILES);
  expect((frames[1]?.made ?? 0) + (frames[1]?.gone ?? 0)).toBeGreaterThan(0);
  // The window is not built in one frame — that is the whole point — but it does come to rest.
  expect(shown + OFF_SCREEN_TILES).toBeLessThan(cells);
  expect(frames.at(-1)).toEqual({ made: 0, gone: 0 });
}, 30_000);

test.each(ZOOMS)("at zoom %i nothing the player is looking at is ever deferred", (zoom) => {
  setZoom(zoom);
  const model = terraced(FLAGSHIP);
  const { scene } = build(model, true);
  // The room the player walks into: one frame, no settling, and the screen is already whole.
  expect(missing(scene, model)).toEqual([]);

  // A jump, on the frame that noticed it.
  scene.follow({ sx: 0, sy: 40 * 32 }, VIEW.width, VIEW.height);
  expect(missing(scene, model)).toEqual([]);
  scene.follow({ sx: 0, sy: 160 * 32 }, VIEW.width, VIEW.height);
  expect(missing(scene, model)).toEqual([]);

  // And on every frame of the walk out of it, while the backlog is still draining.
  for (let step = 0; step < 60; step++) {
    scene.follow({ sx: step * 6, sy: 160 * 32 + step * 3 }, VIEW.width, VIEW.height);
    expect(missing(scene, model)).toEqual([]);
  }
}, 30_000);

test("a steady pan still finishes inside the frame that noticed it", () => {
  const model = terraced(FLAGSHIP);
  const { scene } = build(model, true);
  scene.follow({ sx: 0, sy: 40 * 32 }, VIEW.width, VIEW.height);
  settle(scene);

  // The window is a rectangle and the built floor is every walkable tile in it. Steady panning
  // moves that rectangle a row at a time, which fits a frame's budget many times over — so the
  // amortisation must never engage, or a 4-tile CULL_MARGIN would start eating into itself.
  for (let step = 0; step < 200; step++) {
    scene.follow({ sx: step * 4, sy: 40 * 32 + step * 3 }, VIEW.width, VIEW.height);
    const w = scene.visible;
    for (let y = w.y0; y < w.y1; y++) {
      for (let x = w.x0; x < w.x1; x++) {
        if (tileHeight(model, x, y) >= 0 && !scene.tileAt(x, y)) {
          throw new Error(`step ${step} deferred ${x},${y}, which is inside the window`);
        }
      }
    }
  }
  // Nothing built outside it either, so no drop was deferred over the whole pan.
  const w = scene.visible;
  let wanted = 0;
  for (let y = w.y0; y < w.y1; y++) {
    for (let x = w.x0; x < w.x1; x++) if (tileHeight(model, x, y) >= 0) wanted++;
  }
  expect(builtSet(scene, model).size).toBe(wanted);
}, 30_000);
