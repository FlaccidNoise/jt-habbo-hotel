import { expect, test } from "vitest";
import { parseHeightmap } from "../src/heightmap.ts";
import { PROTOTYPE_CATALOG } from "../src/furni.ts";
import { checkPlacement, footprintTiles, stackTop, ROOM_FURNI_CAP } from "../src/placement.ts";
import type { PlacementCtx } from "../src/placement.ts";
import type { FurniDef, FurniItem, Tile } from "../src/protocol.ts";

const DOOR = { x: 0, y: 0, dir: 2 };
const MODEL = parseHeightmap("000000\n000000\n000000", DOOR);
const DEFS = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));

function def(id: string): FurniDef {
  const d = DEFS.get(id);
  if (!d) throw new Error(`no such def: ${id}`);
  return d;
}

let nextId = 1;
const placed = (defId: string, x: number, y: number, dir: 0 | 2 | 4 | 6, z = 0): FurniItem =>
  ({ id: nextId++, defId, x, y, z, dir, state: 0 });

const ctxWith = (furni: FurniItem[], avatars: Tile[] = []): PlacementCtx =>
  ({ model: MODEL, furni, defs: DEFS, avatars, doorTile: { x: DOOR.x, y: DOOR.y }, roomFurniCap: ROOM_FURNI_CAP });

const byXY = (a: Tile, b: Tile) => a.x - b.x || a.y - b.y;

test("plant on table stacks at z=1", () => {
  const ctx = ctxWith([placed("table_basic", 1, 1, 0)]);
  expect(checkPlacement(ctx, def("plant_basic"), 1, 1, 0)).toEqual({ ok: true, z: 1 });
});
test("chair on chair is no_stack", () => {
  const ctx = ctxWith([placed("chair_basic", 1, 1, 0)]);
  expect(checkPlacement(ctx, def("chair_basic"), 1, 1, 0)).toEqual({ ok: false, code: "no_stack" });
});
test("rug overhanging a table is rejected, not floated or clipped", () => {
  const ctx = ctxWith([placed("table_basic", 2, 0, 0)]);   // covers (2,0),(3,0)
  // rug at (1,0) dir 0 covers x 1-3, y 0-1: tiles over the table top at 1.0, others at 0
  expect(checkPlacement(ctx, def("rug_basic"), 1, 0, 0)).toEqual({ ok: false, code: "no_stack" });
});
test("dir 2 rotates the footprint (w↔l)", () => {
  expect(footprintTiles(def("table_basic"), 1, 1, 2).sort(byXY))
    .toEqual([{ x: 1, y: 1 }, { x: 1, y: 2 }]);
});
test("door tile is bad_position", () =>
  expect(checkPlacement(ctxWith([]), def("plant_basic"), DOOR.x, DOOR.y, 0))
    .toEqual({ ok: false, code: "bad_position" }));
test("avatar blocks placement", () =>
  expect(checkPlacement(ctxWith([], [{ x: 1, y: 1 }]), def("chair_basic"), 1, 1, 0))
    .toEqual({ ok: false, code: "occupied" }));
test("room cap yields room_full", () => {
  const ctx = ctxWith(Array.from({ length: 100 }, (_, i) => placed("plant_basic", i % 6, (i / 6) | 0, 0)));
  expect(checkPlacement(ctx, def("plant_basic"), 5, 5, 0)).toEqual({ ok: false, code: "room_full" });
});
test("out-of-bounds and void tiles are bad_position", () => {
  expect(checkPlacement(ctxWith([]), def("plant_basic"), 6, 0, 0)).toEqual({ ok: false, code: "bad_position" });
  const holed = parseHeightmap("0000\n00x0\n0000", { x: 0, y: 0, dir: 2 });
  expect(checkPlacement({ ...ctxWith([]), model: holed }, def("plant_basic"), 2, 1, 0))
    .toEqual({ ok: false, code: "bad_position" });
});
test("an uneven floor under the footprint is bad_position", () => {
  const stepped = parseHeightmap("0011", { x: 0, y: 0, dir: 2 });
  expect(checkPlacement({ ...ctxWith([]), model: stepped }, def("table_basic"), 1, 0, 0))
    .toEqual({ ok: false, code: "bad_position" });
});
test("stackTop is the floor when a tile is empty and the item top when it is not", () => {
  const ctx = ctxWith([placed("table_basic", 1, 1, 0)]);
  expect(stackTop(ctx, { x: 1, y: 1 })).toBe(1);
  expect(stackTop(ctx, { x: 2, y: 1 })).toBe(1);   // the table's second footprint tile
  expect(stackTop(ctx, { x: 3, y: 1 })).toBe(0);
});
test("a free flat tile accepts placement at the floor height", () =>
  expect(checkPlacement(ctxWith([]), def("chair_basic"), 4, 2, 0)).toEqual({ ok: true, z: 0 }));
