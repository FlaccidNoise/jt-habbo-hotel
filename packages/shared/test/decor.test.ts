import { expect, test } from "vitest";
import { z } from "zod";
import { DECOR_CATALOG, DecorDefSchema, RoomDecorSchema, decorTileFault } from "../src/decor.ts";
import { PROTOTYPE_CATALOG, WALL_CATALOG } from "../src/furni.ts";

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
