import { expect, test } from "vitest";
import { z } from "zod";
import { FurniDefSchema, WallDefSchema } from "../src/protocol.ts";
import { CATALOG_PRICES, PRESTIGE_DEFS, PROTOTYPE_CATALOG, WALL_CATALOG } from "../src/furni.ts";
import { LEVER_EXCLUSIVE_DEFS, LEVER_PRIZES } from "../src/lever.ts";
import { WALL_SEG_PX, WALL_TOP_PX } from "../src/walls.ts";

const ALL_IDS = [...PROTOTYPE_CATALOG, ...WALL_CATALOG].map((d) => d.id);

test("the catalog validates against the wire schema", () =>
  expect(z.array(FurniDefSchema).safeParse(PROTOTYPE_CATALOG).success).toBe(true));
test("the wall catalog validates against the wire schema", () =>
  expect(z.array(WallDefSchema).safeParse(WALL_CATALOG).success).toBe(true));
// Across both catalogs, not within each: an id decides which surface an item is placed on, so a
// collision would make one of the two defs unreachable.
test("catalog ids are unique across both surfaces", () =>
  expect(new Set(ALL_IDS).size).toBe(ALL_IDS.length));

// A wall item that overhangs its own span could never be hung anywhere — wallOffsetLimits would
// hand back a negative range and every position would fail bad_position.
test("every wall def fits the wall it hangs on", () =>
  expect(WALL_CATALOG.filter((d) =>
    d.plane.w > d.span * WALL_SEG_PX || d.plane.h > WALL_TOP_PX).map((d) => d.id)).toEqual([]));

// Both price lookups fail closed: the HUD hides the button, the server refuses the buy. A def
// with neither a price nor a way to win it is therefore an item nobody can ever own, with no
// error anywhere — so every def must be reachable by exactly one of the two routes.
test("every def is obtainable — priced, or a Luck Lever exclusive", () =>
  expect(ALL_IDS.filter((id) => !CATALOG_PRICES.has(id) && !LEVER_EXCLUSIVE_DEFS.has(id)))
    .toEqual([]));
test("a lever exclusive is never also for sale", () =>
  expect([...LEVER_EXCLUSIVE_DEFS].filter((id) => CATALOG_PRICES.has(id))).toEqual([]));
test("no price names a def that left the catalog", () =>
  expect([...CATALOG_PRICES.keys()].filter((id) => !ALL_IDS.includes(id))).toEqual([]));

// A prize that names a def nobody can render is a silent dead drop: the server would mint an
// item the client cannot draw and the player would see an empty inventory slot.
test("every lever prize names a real def", () =>
  expect(LEVER_PRIZES.filter((p) => p.defId !== null && !ALL_IDS.includes(p.defId)).map((p) => p.label))
    .toEqual([]));
test("prestige fixtures are priced and never won", () => {
  expect([...PRESTIGE_DEFS].filter((id) => !CATALOG_PRICES.has(id))).toEqual([]);
  expect(LEVER_PRIZES.filter((p) => p.defId !== null && PRESTIGE_DEFS.has(p.defId))).toEqual([]);
});
