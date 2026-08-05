import { Container } from "pixi.js";
import { expect, test } from "vitest";
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
