import { expect, test } from "vitest";
import { parseHeightmap } from "../src/heightmap.ts";
import { WALL_CATALOG } from "../src/furni.ts";
import { ROOM_FURNI_CAP } from "../src/placement.ts";
import {
  WALL_SEG_PX,
  WALL_TOP_PX,
  checkWallPlacement,
  hasWallSegment,
  wallOffset,
  wallOffsetLimits,
  wallOrigin,
  wallSegments,
  wallSpanSegments,
} from "../src/walls.ts";
import type { WallPlacementCtx } from "../src/walls.ts";
import type { WallDef, WallItem, WallSide } from "../src/protocol.ts";
import { worldToScreen } from "../src/projection.ts";

const DOOR = { x: 0, y: 2, dir: 2 };
const MODEL = parseHeightmap("0000\n0000\n0000\n0000", DOOR);
// An inside corner: the notch at (0,0) and (1,0) exposes walls inside the room, not just around it.
const NOTCHED = parseHeightmap("xx00\n0000\n0000\n0000", { x: 0, y: 1, dir: 2 });

const DEFS = new Map(WALL_CATALOG.map((d) => [d.id, d]));
const def = (id: string): WallDef => {
  const d = DEFS.get(id);
  if (!d) throw new Error(`no such wall def: ${id}`);
  return d;
};

let nextId = 1;
const hung = (defId: string, side: WallSide, x: number, y: number, u: number, v: number): WallItem =>
  ({ id: nextId++, defId, side, x, y, u, v, state: 0 });

const ctxWith = (wallFurni: WallItem[], model = MODEL, furniCount = 0): WallPlacementCtx =>
  ({ model, wallFurni, defs: DEFS, furniCount: furniCount + wallFurni.length, roomFurniCap: ROOM_FURNI_CAP });

const key = (s: { side: string; x: number; y: number }): string => `${s.side}${s.x},${s.y}`;

test("a rectangular room walls only its two exposed edges", () => {
  const segs = wallSegments(MODEL).map(key).sort();
  // Left where x is 0, right where y is 0 — and never the far edges, whose backs would face us.
  expect(segs).toEqual(
    ["left0,0", "left0,1", "left0,3", "right0,0", "right1,0", "right2,0", "right3,0"].sort(),
  );
});

test("the door is a hole in the wall, not a place to hang things", () => {
  expect(hasWallSegment(MODEL, "left", DOOR.x, DOOR.y)).toBe(false);
  expect(wallSegments(MODEL).some((s) => s.x === DOOR.x && s.y === DOOR.y)).toBe(false);
});

test("an inside corner walls itself", () => {
  const segs = wallSegments(NOTCHED).map(key);
  expect(segs).toContain("left2,0");    // the notch's own west face
  expect(segs).toContain("right1,1");   // and the north face the notch exposes
  expect(segs).not.toContain("left0,0");
});

test("void tiles carry no wall", () => {
  expect(hasWallSegment(NOTCHED, "left", 0, 0)).toBe(false);
  expect(hasWallSegment(NOTCHED, "right", 1, 0)).toBe(false);
});

// The two runs measure from the same corner and travel opposite ways across the screen.
test("both walls of a tile share an origin", () => {
  const o = wallOrigin(2, 3, 64);
  expect(o).toEqual(worldToScreen(1.5, 2.5, 4, 64));
});

test("along-wall offsets are exact on the 2:1 axis", () => {
  expect(wallOffset("right", 8, 5)).toEqual({ dx: 8, dy: 9 });
  expect(wallOffset("left", 8, 5)).toEqual({ dx: -8, dy: 9 });
  // A whole segment of u lands exactly on the next segment's origin.
  const a = wallOrigin(0, 0, 64);
  const b = wallOrigin(1, 0, 64);
  const step = wallOffset("right", WALL_SEG_PX, 0);
  expect({ sx: a.sx + step.dx, sy: a.sy + step.dy }).toEqual(b);
});

test("a span covers consecutive segments along its own wall", () => {
  const wide: WallDef = { ...def("poster"), span: 3 };
  expect(wallSpanSegments(wide, "left", 0, 1).map(key)).toEqual(["left0,1", "left0,2", "left0,3"]);
  expect(wallSpanSegments(wide, "right", 1, 0).map(key)).toEqual(["right1,0", "right2,0", "right3,0"]);
});

test("hanging on a real wall segment is allowed", () => {
  expect(checkWallPlacement(ctxWith([]), def("poster"), "right", 1, 0, 0, 10)).toEqual({ ok: true });
});

test("hanging where there is no wall is refused", () => {
  // (2,2) is interior floor: no void behind it on either side.
  expect(checkWallPlacement(ctxWith([]), def("poster"), "left", 2, 2, 0, 10))
    .toEqual({ ok: false, code: "bad_position" });
  expect(checkWallPlacement(ctxWith([]), def("poster"), "left", DOOR.x, DOOR.y, 0, 10))
    .toEqual({ ok: false, code: "bad_position" });
});

test("a span that runs off the end of its wall is refused", () => {
  const wide: WallDef = { ...def("poster"), span: 2 };
  // right3,0 is the last segment of that run — a 2-span starting there needs right4,0.
  expect(checkWallPlacement(ctxWith([]), wide, "right", 3, 0, 0, 10))
    .toEqual({ ok: false, code: "bad_position" });
});

test("offsets outside the item's own range are refused", () => {
  const d = def("poster");
  const { maxU, maxV } = wallOffsetLimits(d);
  expect(checkWallPlacement(ctxWith([]), d, "right", 1, 0, maxU, maxV)).toEqual({ ok: true });
  expect(checkWallPlacement(ctxWith([]), d, "right", 1, 0, maxU + 2, 0))
    .toEqual({ ok: false, code: "bad_position" });
  expect(checkWallPlacement(ctxWith([]), d, "right", 1, 0, 0, maxV + 1))
    .toEqual({ ok: false, code: "bad_position" });
  expect(checkWallPlacement(ctxWith([]), d, "right", 1, 0, -2, 0))
    .toEqual({ ok: false, code: "bad_position" });
});

// The wall's horizontal axis moves half a pixel of screen y per pixel of u, so an odd offset
// would land the sprite off the plane. The schema forbids it and so does the checker.
test("an odd along-wall offset is refused", () => {
  expect(checkWallPlacement(ctxWith([]), def("poster"), "right", 1, 0, 3, 0))
    .toEqual({ ok: false, code: "bad_position" });
});

test("two items may not overlap on the same wall run", () => {
  const d = def("poster");
  const there = [hung("poster", "right", 1, 0, 0, 20)];
  expect(checkWallPlacement(ctxWith(there), d, "right", 1, 0, 0, 20))
    .toEqual({ ok: false, code: "occupied" });
  // Clear of it vertically is fine...
  expect(checkWallPlacement(ctxWith(there), d, "right", 1, 0, 0, 20 + d.plane.h))
    .toEqual({ ok: true });
  // ...and so is the next segment along, because the item is narrower than a segment.
  expect(checkWallPlacement(ctxWith(there), d, "right", 2, 0, 0, 20)).toEqual({ ok: true });
});

// Overlap is measured across a whole run, not per segment, so an item straddling a boundary
// still collides with its neighbour.
// Overlap is measured once across a whole run rather than per segment, which is what makes a
// wide item block the segments it merely reaches into — a per-segment test would miss this.
test("a multi-segment item blocks the segments it spans", () => {
  const plaque: WallDef = { ...def("poster"), id: "plaque", plane: { w: 12, h: 10 }, mount: { u: 0, v: 0 } };
  const mural: WallDef = { ...plaque, id: "mural", span: 2, plane: { w: 50, h: 10 } };
  const ctx = (wallFurni: WallItem[]): WallPlacementCtx => ({
    ...ctxWith(wallFurni),
    defs: new Map([[plaque.id, plaque], [mural.id, mural]]),
  });
  // The mural hangs from segment 1 and reaches run px 32..82, over into segment 2 (64..96).
  const there = [hung(mural.id, "right", 1, 0, 0, 0)];
  expect(checkWallPlacement(ctx(there), plaque, "right", 2, 0, 0, 0))
    .toEqual({ ok: false, code: "occupied" });
  expect(checkWallPlacement(ctx(there), plaque, "right", 3, 0, 0, 0)).toEqual({ ok: true });
  // Clear of it vertically, the same spot is free again.
  expect(checkWallPlacement(ctx(there), plaque, "right", 2, 0, 0, 10)).toEqual({ ok: true });
});

test("separate runs never collide", () => {
  const there = [hung("poster", "left", 0, 0, 0, 20)];
  // Same u and v, same tile — but the other wall of it.
  expect(checkWallPlacement(ctxWith(there), def("poster"), "right", 0, 0, 0, 20))
    .toEqual({ ok: true });
});

test("the furni cap counts both surfaces", () => {
  const ctx = ctxWith([], MODEL, ROOM_FURNI_CAP);
  expect(checkWallPlacement(ctx, def("poster"), "right", 1, 0, 0, 10))
    .toEqual({ ok: false, code: "room_full" });
});

test("every wall def can actually be hung somewhere", () => {
  for (const d of WALL_CATALOG) {
    const { maxU, maxV } = wallOffsetLimits(d);
    expect(maxU, d.id).toBeGreaterThanOrEqual(0);
    expect(maxV, d.id).toBeGreaterThanOrEqual(0);
    expect(d.mount.u + d.plane.w, d.id).toBeLessThanOrEqual(d.span * WALL_SEG_PX);
    expect(d.mount.v + d.plane.h, d.id).toBeLessThanOrEqual(WALL_TOP_PX);
  }
});
