import { Container } from "pixi.js";
import { expect, test } from "vitest";
import { wallBox, wallItemBox } from "@grand/shared";
import { DepthIndex, LAYER, tileDepth } from "../src/scene/sort.ts";

const box = (x: number, y: number, layer: number = LAYER.furni) =>
  ({ x0: x, y0: y, z0: 0, x1: x + 1, y1: y + 1, z1: 1, layer });

test("tiles are ordered by depth and stay under every sprite", () => {
  expect(tileDepth(0, 0)).toBeLessThan(tileDepth(11, 11));
  expect(tileDepth(11, 11)).toBeLessThan(0);
});

test("flush stacks nearer views over farther ones", () => {
  const depth = new DepthIndex();
  const near = new Container();
  const far = new Container();
  depth.set("near", box(4, 4), near);
  depth.set("far", box(1, 1), far);
  depth.flush();
  expect(far.zIndex).toBeLessThan(near.zIndex);
});

test("a removed view stops holding a slot", () => {
  const depth = new DepthIndex();
  const gone = new Container();
  const kept = new Container();
  depth.set("gone", box(0, 0), gone);
  depth.set("kept", box(4, 4), kept);
  depth.flush();
  expect(kept.zIndex).toBe(1);
  depth.delete("gone");
  depth.flush();
  expect(kept.zIndex).toBe(0);
});

test("a moved view restacks against what is already placed", () => {
  const depth = new DepthIndex();
  const table = new Container();
  const avatar = new Container();
  depth.set("table", box(2, 2), table);
  depth.set("avatar", box(0, 0, LAYER.avatar), avatar);
  depth.flush();
  expect(avatar.zIndex).toBeLessThan(table.zIndex);
  depth.set("avatar", box(4, 4, LAYER.avatar), avatar);
  depth.flush();
  expect(avatar.zIndex).toBeGreaterThan(table.zIndex);
});
test("a sitter draws between a seat's two halves, on every tile of a multi-tile seat", () => {
  // The generator splits a seat sheet into a half behind the occupant and a half in front, and
  // relies on this ordering holding. Geometry cannot state it — the near-side backrest sits inside
  // the tile the sitter occupies — so the sort forces it from the layers.
  const depth = new DepthIndex();
  const back = new Container();
  const front = new Container();
  const near = new Container();
  const far = new Container();
  // A 2×1 sofa at (3,3): back half over the whole footprint, front half over the near-side pieces.
  depth.set("sofa", { x0: 3, y0: 3, z0: 0, x1: 5, y1: 4, z1: 1, layer: LAYER.furni }, back);
  depth.set("sofa:front", { x0: 3.25, y0: 3, z0: 0.34, x1: 5, y1: 4, z1: 1, layer: LAYER.seat_front }, front);
  const sitter = (x: number) =>
    ({ x0: x, y0: 3, z0: 0.5625, x1: x + 1, y1: 4, z1: 1.5625, layer: LAYER.seated });
  depth.set("near", sitter(3), near);
  depth.set("far", sitter(4), far);
  depth.flush();

  for (const body of [near, far]) {
    expect(body.zIndex).toBeGreaterThan(back.zIndex);
    expect(body.zIndex).toBeLessThan(front.zIndex);
  }
});

test("a sitter draws over the seat it shares a tile with, and under furni one tile nearer", () => {
  const depth = new DepthIndex();
  const chair = new Container();
  const sitter = new Container();
  const nearer = new Container();
  depth.set("chair", box(3, 3), chair);
  depth.set("sitter", {
    x0: 3, y0: 3, z0: 0.65625, x1: 4, y1: 4, z1: 0.65625 + 1, layer: LAYER.seated,
  }, sitter);
  depth.set("nearer", box(4, 3), nearer);
  depth.flush();
  expect(sitter.zIndex).toBeGreaterThan(chair.zIndex);
  expect(sitter.zIndex).toBeLessThan(nearer.zIndex);
});
// A wall stands half a tile behind the tiles it closes (#203). That is box geometry now, not a
// band and not a key offset, so an interior wall — the notch of an L-shaped room — sorts against
// the furni around it instead of always winning or always losing.
test("a wall draws under everything standing on the tile it borders", () => {
  const depth = new DepthIndex();
  const views = { wall: new Container(), rug: new Container(), body: new Container(), tall: new Container() };
  depth.set("wall", wallBox("left", 3, 3, LAYER.wall), views.wall);
  depth.set("rug", box(3, 3, LAYER.floor_furni), views.rug);
  depth.set("body", box(3, 3, LAYER.avatar), views.body);
  depth.set("tall", { x0: 3, y0: 3, z0: 0, x1: 4, y1: 4, z1: 2, layer: LAYER.furni }, views.tall);
  depth.flush();
  for (const over of [views.rug, views.body, views.tall]) {
    expect(views.wall.zIndex).toBeLessThan(over.zIndex);
  }
});

test("a left wall and a right wall each sit behind their own tile, on their own axis", () => {
  expect(wallBox("left", 3, 3, LAYER.wall)).toMatchObject({ x0: 2.5, x1: 3, y0: 3, y1: 4 });
  expect(wallBox("right", 3, 3, LAYER.wall)).toMatchObject({ x0: 3, x1: 4, y0: 2.5, y1: 3 });
});

test("a hung item draws over its own wall but under furni on the tile in front", () => {
  const depth = new DepthIndex();
  const wall = new Container();
  const hung = new Container();
  const front = new Container();
  const poster = { id: "wall_art", span: 1 } as unknown as Parameters<typeof wallItemBox>[0];
  depth.set("wall", wallBox("left", 3, 3, LAYER.wall), wall);
  depth.set("hung", wallItemBox(poster, "left", 3, 3, LAYER.wall_furni), hung);
  depth.set("front", box(3, 3), front);
  depth.flush();
  expect(hung.zIndex).toBeGreaterThan(wall.zIndex);
  expect(hung.zIndex).toBeLessThan(front.zIndex);
});

test("a hung item spans every segment it covers", () =>
  expect(wallItemBox(
    { id: "wall_shelf", span: 3 } as unknown as Parameters<typeof wallItemBox>[0],
    "left", 3, 3, LAYER.wall_furni,
  )).toMatchObject({ y0: 3, y1: 6 }));

test("walls stay above the tile band", () =>
  expect(tileDepth(99, 99)).toBeLessThan(0));
