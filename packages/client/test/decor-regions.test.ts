import { Container, Texture, TextureSource } from "pixi.js";
import { expect, test } from "vitest";
import { parseHeightmap } from "@grand/shared";
import type { RoomDecor, RoomModel } from "@grand/shared";
import { floorRegions, regionAt } from "../src/scene/decor.ts";
import type { DecorAsset, FloorDecor, FloorRegion } from "../src/scene/decor.ts";
import { RoomScene } from "../src/scene/room.ts";
import { DepthIndex } from "../src/scene/sort.ts";

/** Per-region floor decor (#407). The room doc carries rectangles, the scene resolves one per tile,
 *  and the room-wide floor is what a tile no rectangle covers gets. */

/** A stand-in for a loaded decor tile. Only identity matters here — the texture is compared, never
 *  sampled — so each one gets its own source rather than sharing Texture.WHITE. */
function asset(id: string, left: number, right: number): DecorAsset<FloorDecor> {
  const def: FloorDecor = {
    kind: "floor", id, name: id, tile: { w: 64, h: 32 }, sides: { left, right },
  };
  return { def, texture: new Texture({ source: new TextureSource({ width: 64, height: 32 }) }) };
}

const DECK = asset("floor_deck", 0x111111, 0x222222);
const POOL = asset("floor_pool", 0x333333, 0x444444);
const LOUNGE = asset("floor_lounge", 0x555555, 0x666666);

const ASSETS = new Map<string, DecorAsset>([
  ["floor_deck", DECK], ["floor_pool", POOL], ["floor_lounge", LOUNGE],
  // A wallpaper, to prove floorRegions resolves by kind and not by id alone.
  ["wall_spa", {
    def: { kind: "wall", id: "wall_spa", name: "spa", tile: { w: 16, h: 32 }, cap: 0 },
    texture: Texture.WHITE,
  }],
]);

/** 6x6, flat but for a raised block at the south-east, whose overhang faces are drawn. */
const HEIGHTMAP = ["000000", "000000", "000000", "000000", "000011", "000011"].join("\n");

function model(): RoomModel {
  return parseHeightmap(HEIGHTMAP, { x: 0, y: 0, dir: 2 });
}

/** No camera: the whole floor is built in one pass, which is what every client unit test wants. */
function build(decor: DecorAsset<FloorDecor> | null, regions: FloorRegion[]) {
  const m = model();
  const depth = new DepthIndex();
  const scene = new RoomScene(new Container(), m, { click: () => {}, hover: () => {} }, depth,
    decor, null, regions);
  return { scene, depth };
}

interface FillStyle { texture: Texture; textureSpace: string; matrix: unknown; color: number }

function fills(g: { context: unknown }): FillStyle[] {
  const ins = (g.context as { instructions: Array<{ action: string; data: { style: FillStyle } }> })
    .instructions;
  return ins.filter((i) => i.action === "fill").map((i) => i.data.style);
}

/** The one fill on a floor tile. */
function fillAt(scene: RoomScene, x: number, y: number): FillStyle {
  const tile = scene.tileAt(x, y);
  if (!tile) throw new Error(`no tile at ${x},${y}`);
  const [style] = fills(tile);
  if (!style) throw new Error(`tile ${x},${y} was never filled`);
  return style;
}

/** The overhang faces under a raised tile, which are kept beside it rather than on it. Only the
 *  block's south-east corner has any: a face is drawn where the tile stands above its south or east
 *  neighbour, and the block's other tiles are flush with the rest of the block. */
function skirtColours(scene: RoomScene, x: number, y: number): number[] {
  const skirts = (scene as unknown as { skirts: Map<string, { context: unknown }> }).skirts;
  const g = skirts.get(`${x},${y}`);
  if (!g) throw new Error(`no risers under ${x},${y}`);
  return fills(g).map((s) => s.color);
}

const rect = (
  x0: number, y0: number, x1: number, y1: number, a: DecorAsset<FloorDecor>,
): FloorRegion => ({ x0, y0, x1, y1, asset: a });

test("a tile no rectangle covers takes the room-wide floor", () => {
  const { scene } = build(DECK, [rect(2, 2, 3, 3, POOL)]);
  expect(fillAt(scene, 1, 1).texture).toBe(DECK.texture);
  expect(fillAt(scene, 1, 2).texture).toBe(DECK.texture);
  expect(fillAt(scene, 4, 1).texture).toBe(DECK.texture);
});

test("a tile inside a rectangle takes the region's floor, bounds included", () => {
  const { scene } = build(DECK, [rect(2, 2, 3, 3, POOL)]);
  for (const [x, y] of [[2, 2], [3, 2], [2, 3], [3, 3]] as const) {
    expect(fillAt(scene, x, y).texture, `${x},${y}`).toBe(POOL.texture);
  }
});

// Later rectangles paint over earlier ones — the server builds its floor with rect fills that
// overwrite, so decor laid on top of them has to read the same way round.
test("where two rectangles overlap, the later one wins", () => {
  const { scene } = build(DECK, [rect(1, 1, 4, 4, POOL), rect(3, 3, 4, 4, LOUNGE)]);
  expect(fillAt(scene, 2, 2).texture).toBe(POOL.texture);
  expect(fillAt(scene, 3, 3).texture).toBe(LOUNGE.texture);
  expect(fillAt(scene, 4, 4).texture).toBe(LOUNGE.texture);
});

// The pattern is anchored in the world rather than in each diamond (textureSpace "global"), which
// is what lets a 64x32 tile span two diamonds at all. Both sides of a region seam are anchored the
// same way and carry no local matrix, so the lattice runs on through the boundary instead of
// restarting at it — the reason regions can be rectangles rather than whole rooms.
test("the pattern lattice is unbroken across a region edge", () => {
  const { scene } = build(DECK, [rect(3, 0, 5, 5, POOL)]);
  const outside = fillAt(scene, 2, 3);
  const inside = fillAt(scene, 3, 3);
  expect(outside.texture).toBe(DECK.texture);
  expect(inside.texture).toBe(POOL.texture);
  for (const style of [outside, inside]) {
    expect(style.textureSpace).toBe("global");
    expect(style.matrix).toBeNull();
  }
});

// A raised tile inside a region wears that region's material on its sides too, or the jazz stage
// would carry a lounge carpet on top of deck-coloured risers.
test("a raised tile's risers follow the region it stands in", () => {
  const { scene } = build(DECK, [rect(4, 4, 5, 5, LOUNGE)]);
  expect(skirtColours(scene, 5, 5)).toEqual([LOUNGE.def.sides.left, LOUNGE.def.sides.right]);

  const plain = build(DECK, []);
  expect(skirtColours(plain.scene, 5, 5)).toEqual([DECK.def.sides.left, DECK.def.sides.right]);
});

test("a room with no regions draws exactly what it drew before", () => {
  const { scene } = build(DECK, []);
  expect(fillAt(scene, 3, 3).texture).toBe(DECK.texture);
  expect(fillAt(scene, 0, 0).texture).not.toBe(DECK.texture);   // the door keeps its own colour
});

// The door is painted before any decor is considered, so a region cannot hide it.
test("a region does not repaint the door", () => {
  const { scene } = build(DECK, [rect(0, 0, 5, 5, POOL)]);
  expect(fillAt(scene, 0, 0).texture).not.toBe(POOL.texture);
  expect(fillAt(scene, 1, 0).texture).toBe(POOL.texture);
});

test("regionAt reports the last covering rectangle, or null", () => {
  const regions = [rect(0, 0, 4, 4, POOL), rect(2, 2, 6, 6, LOUNGE)];
  expect(regionAt(regions, 1, 1)?.asset).toBe(POOL);
  expect(regionAt(regions, 3, 3)?.asset).toBe(LOUNGE);
  expect(regionAt(regions, 5, 5)?.asset).toBe(LOUNGE);
  expect(regionAt(regions, 9, 9)).toBeNull();
  expect(regionAt([], 1, 1)).toBeNull();
});

test("floorRegions resolves the room doc's ids, dropping what is not a loaded floor tile", () => {
  const decor: RoomDecor = {
    floor: "floor_deck",
    regions: [
      { x0: 0, y0: 0, x1: 1, y1: 1, floor: "floor_pool" },
      { x0: 2, y0: 2, x1: 3, y1: 3, floor: "wall_spa" },      // wrong kind
      { x0: 4, y0: 4, x1: 5, y1: 5, floor: "floor_missing" },  // never loaded
    ],
  };
  expect(floorRegions(ASSETS, decor)).toEqual([{ x0: 0, y0: 0, x1: 1, y1: 1, asset: POOL }]);
  expect(floorRegions(ASSETS, { floor: "floor_deck" })).toEqual([]);
  expect(floorRegions(null, decor)).toEqual([]);
});
