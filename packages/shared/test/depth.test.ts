import { expect, test } from "vitest";
import { behind, painterOrder } from "../src/depth.ts";
import type { DepthBox } from "../src/depth.ts";

/** A furni item's box: `w`×`l` tiles at (x, y), standing `h` high. */
function at(x: number, y: number, w = 1, l = 1, h = 1, layer = 2): DepthBox {
  return { x0: x, y0: y, z0: 0, x1: x + w, y1: y + l, z1: h, layer };
}

/** Order as a list of names, back to front. */
function order(items: Record<string, DepthBox>): string[] {
  const names = Object.keys(items);
  const boxes = Object.values(items);
  return painterOrder(boxes).flatMap((i) => names[i] ?? []);
}

test("nearer draws over farther", () => {
  expect(order({ far: at(1, 2), near: at(2, 2) })).toEqual(["far", "near"]);
  expect(order({ far: at(2, 2), near: at(2, 3) })).toEqual(["far", "near"]);
});

test("stacked item draws over its base", () => {
  const table = { x0: 3, y0: 3, z0: 0, x1: 4, y1: 4, z1: 1, layer: 2 };
  const lamp = { x0: 3, y0: 3, z0: 1, x1: 4, y1: 4, z1: 3, layer: 2 };
  expect(order({ lamp, table })).toEqual(["table", "lamp"]);
});

test("same tile: rug under avatar under table", () => {
  const rug = { x0: 3, y0: 3, z0: 0, x1: 4, y1: 4, z1: 0.05, layer: 0 };
  const avatar = { x0: 3, y0: 3, z0: 0, x1: 4, y1: 4, z1: 1.5, layer: 1 };
  const table = at(3, 3);
  expect(order({ table, avatar, rug })).toEqual(["rug", "avatar", "table"]);
});

// The defect this ordering exists for: a 4×1 table has one chair that must draw behind it and
// one that must draw in front, and no per-item scalar key can put them on opposite sides.
test("a long table sorts against both ends of its footprint", () => {
  const table = at(0, 1, 4, 1);
  const eastChair = at(3, 0);     // north of the table's far end: behind it
  const westChair = at(0, 2);     // south of the table's near end: in front of it
  expect(order({ table, eastChair, westChair })).toEqual(["eastChair", "table", "westChair"]);
});

test("diagonal neighbours never constrain each other", () => {
  expect(behind(at(0, 1), at(1, 0))).toBe(false);
  expect(behind(at(1, 0), at(0, 1))).toBe(false);
});

test("every box comes back exactly once", () => {
  const boxes = [at(0, 0, 2, 3), at(2, 0), at(0, 3), at(1, 1), at(4, 4, 3, 2)];
  expect([...painterOrder(boxes)].sort()).toEqual([0, 1, 2, 3, 4]);
});
