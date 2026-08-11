import { describe, expect, test } from "vitest";
import { z } from "zod";
import {
  DECOR_CATALOG, DecorDefSchema, MAX_DECOR_REGIONS, RoomDecorSchema, decorRegionsFault,
  decorTileFault,
} from "../src/decor.ts";
import type { DecorRegion } from "../src/decor.ts";
import { LANDED_DECOR_IDS, PROTOTYPE_CATALOG, WALL_CATALOG } from "../src/furni.ts";

test("the decor catalog validates against the wire schema", () =>
  expect(z.array(DecorDefSchema).safeParse(DECOR_CATALOG).success).toBe(true));

// Decor ids share the id space with furni: a room names its floor and wallpaper by id, and the
// client resolves furni, wall items and decor from the same message.
test("decor ids do not collide with either furni catalog", () => {
  const ids = [...PROTOTYPE_CATALOG, ...WALL_CATALOG, ...DECOR_CATALOG].map((d) => d.id);
  expect(new Set(ids).size).toBe(ids.length);
});

test("every shipped tile is on its surface's lattice", () =>
  expect(DECOR_CATALOG.filter((d) => decorTileFault(d) !== null).map((d) => d.id)).toEqual([]));

// A room that has chosen neither is the default, not an error — every room seeded before #260
// carries no decor key at all.
test("an empty decor selection is legal", () =>
  expect(RoomDecorSchema.safeParse({}).success).toBe(true));

// Per-region floor decor (#407). The regions are house-authored constants, so the schema is the
// boot-time typo catcher for them — the server parses its own seed through it (db.ts).
describe("floor regions", () => {
  const region = (over: Partial<DecorRegion> = {}): unknown =>
    ({ x0: 1, y0: 2, x1: 3, y1: 4, floor: "floor_pool", ...over });
  const parse = (regions: unknown[]): boolean =>
    RoomDecorSchema.safeParse({ floor: "floor_deck", regions }).success;

  test("a room with no regions is still legal", () =>
    expect(RoomDecorSchema.safeParse({ floor: "floor_deck" }).success).toBe(true));

  test("a region naming a catalog floor is accepted", () => expect(parse([region()])).toBe(true));

  test("a region naming a decor that is not in the catalog is refused", () =>
    expect(parse([region({ floor: "floor_lava" })])).toBe(false));

  // Every wall id is a real decor id, so this is the check that the KIND is right and not just
  // that the string is spelled like something in the catalog.
  test("a region naming a wallpaper is refused", () =>
    expect(parse([region({ floor: "wall_spa" })])).toBe(false));

  test("a rectangle that ends before it starts is refused", () => {
    expect(parse([region({ x0: 9, x1: 3 })])).toBe(false);
    expect(parse([region({ y0: 9, y1: 3 })])).toBe(false);
  });

  test("a single-tile rectangle is legal", () =>
    expect(parse([region({ x0: 5, y0: 5, x1: 5, y1: 5 })])).toBe(true));

  test("negative and fractional coordinates are refused", () => {
    expect(parse([region({ x0: -1 })])).toBe(false);
    expect(parse([region({ y1: 4.5 })])).toBe(false);
  });

  test(`the count is capped at ${MAX_DECOR_REGIONS}`, () => {
    expect(parse(Array.from({ length: MAX_DECOR_REGIONS }, () => region()))).toBe(true);
    expect(parse(Array.from({ length: MAX_DECOR_REGIONS + 1 }, () => region()))).toBe(false);
  });
});

// The schema never sees the room, so this is the one rule left for the server to check at seed.
describe("decorRegionsFault", () => {
  const on = (x1: number, y1: number): string | null =>
    decorRegionsFault({ regions: [{ x0: 0, y0: 0, x1, y1, floor: "floor_pool" }] }, 16, 16);

  test("a rectangle reaching the last tile fits — the bounds are inclusive", () =>
    expect(on(15, 15)).toBeNull());

  test("a rectangle one tile past either edge does not", () => {
    expect(on(16, 15)).toContain("runs past the 16x16 floor");
    expect(on(15, 16)).toContain("runs past the 16x16 floor");
  });

  test("a room with no regions has no fault", () =>
    expect(decorRegionsFault({ floor: "floor_deck" }, 16, 16)).toBeNull());
});

// Content blitz (docs/plans/2026-08-11-furniture-content-blitz-catalog.md): 18 pre-blitz tiles
// plus whatever waves have landed. content-blitz.test.ts gates every landed decor id.
test("the decor total is the pre-blitz baseline plus landed waves", () =>
  expect(DECOR_CATALOG.length).toBe(18 + LANDED_DECOR_IDS.size));
