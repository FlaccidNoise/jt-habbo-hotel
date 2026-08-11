import { expect, test } from "vitest";
import { z } from "zod";
import { FurniDefSchema, WallDefSchema } from "../src/protocol.ts";
import {
  CATALOG_PRICES, HOUSE_FIXTURE_DEFS, PRESTIGE_DEFS, PROTOTYPE_CATALOG, UNPRICED, WALL_CATALOG,
} from "../src/furni.ts";
import { LEVER_EXCLUSIVE_DEFS, LEVER_PRIZES } from "../src/lever.ts";
import { COLLECTION_SETS, SET_REWARD_DEFS } from "../src/sets.ts";
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

// The use verb reads its parameters off the def (#347), so a def whose interaction and parameters
// disagree fails silently in the room: a "vend" with no `vend` block hands over nothing, a "toggle"
// missing its second height throws the moment anyone flips it, and a `vend` block on furni nobody
// can vend from is a price that never applies.
test("every interaction def carries exactly what its rail reads", () => {
  for (const def of PROTOTYPE_CATALOG) {
    const vends = def.interaction === "vend" || def.interaction === "read";
    expect(def.vend !== undefined, def.id).toBe(vends);
    if (def.interaction === "toggle") expect(def.stackHeights.length, def.id).toBeGreaterThan(1);
  }
});

// A wall item that overhangs its own span could never be hung anywhere — wallOffsetLimits would
// hand back a negative range and every position would fail bad_position.
test("every wall def fits the wall it hangs on", () =>
  expect(WALL_CATALOG.filter((d) =>
    d.plane.w > d.span * WALL_SEG_PX || d.plane.h > WALL_TOP_PX).map((d) => d.id)).toEqual([]));

// Both price lookups fail closed: the HUD hides the button, the server refuses the buy. A def
// with neither a price nor a way to win it is therefore an item nobody can ever own, with no
// error anywhere — so every def must be reachable by exactly one of the routes.
//
// A house fixture is the one route that ends without the player owning anything (R-26, #429). It
// is listed rather than inferred for the same reason the other three are: an unreachable def has
// to be a decision somebody wrote down, not an id that fell through every lookup.
test("every def is obtainable — priced, won, minted by a set, or placed by the house", () =>
  expect(ALL_IDS.filter((id) =>
    !CATALOG_PRICES.has(id) && !LEVER_EXCLUSIVE_DEFS.has(id) && !SET_REWARD_DEFS.has(id)
    && !HOUSE_FIXTURE_DEFS.has(id)))
    .toEqual([]));

// R-26: the house's edge is not merchandise. A wheel a player owns is a wheel a player sets the
// odds on, so neither route that ends in a player inventory may name one.
test("a house fixture is never for sale and never a prize", () => {
  expect([...HOUSE_FIXTURE_DEFS].filter((id) => CATALOG_PRICES.has(id))).toEqual([]);
  expect(LEVER_PRIZES.filter((p) => p.defId !== null && HOUSE_FIXTURE_DEFS.has(p.defId))).toEqual([]);
  expect([...HOUSE_FIXTURE_DEFS].filter((id) => !ALL_IDS.includes(id))).toEqual([]);
});

// A set whose members cannot all be bought could never be completed, and its reward would be
// unreachable — the reward itself is the one member that must not be for sale.
test("every collection set is completable and its reward is not", () => {
  for (const set of COLLECTION_SETS) {
    expect(set.members.filter((m) => !CATALOG_PRICES.has(m)), set.id).toEqual([]);
    expect(CATALOG_PRICES.has(set.reward), set.id).toBe(false);
    expect(ALL_IDS, set.id).toContain(set.reward);
    expect(set.members.includes(set.reward), set.id).toBe(false);
  }
});
test("collection sets do not share rewards or badges", () => {
  expect(new Set(COLLECTION_SETS.map((s) => s.reward)).size).toBe(COLLECTION_SETS.length);
  expect(new Set(COLLECTION_SETS.map((s) => s.badge)).size).toBe(COLLECTION_SETS.length);
});
test("a lever exclusive is never also for sale", () =>
  expect([...LEVER_EXCLUSIVE_DEFS].filter((id) => CATALOG_PRICES.has(id))).toEqual([]));
test("no price names a def that left the catalog", () =>
  expect([...CATALOG_PRICES.keys()].filter((id) => !ALL_IDS.includes(id))).toEqual([]));

// A price-blitz of new packs must not let a def go silently unpriced: renderCatalog just skips
// it (invisible in the shop) and itemValue falls back to 0 (a hole in the trade-limits wall).
test("every catalog id is priced or explicitly unpriced with a reason", () =>
  expect(
    ALL_IDS.filter((id) => !CATALOG_PRICES.has(id) && !UNPRICED.has(id)),
    "add a price to CATALOG_PRICES or add the id to UNPRICED with a reason comment",
  ).toEqual([]));

// A prize that names a def nobody can render is a silent dead drop: the server would mint an
// item the client cannot draw and the player would see an empty inventory slot.
test("every lever prize names a real def", () =>
  expect(LEVER_PRIZES.filter((p) => p.defId !== null && !ALL_IDS.includes(p.defId)).map((p) => p.label))
    .toEqual([]));
test("prestige fixtures are priced and never won", () => {
  expect([...PRESTIGE_DEFS].filter((id) => !CATALOG_PRICES.has(id))).toEqual([]);
  expect(LEVER_PRIZES.filter((p) => p.defId !== null && PRESTIGE_DEFS.has(p.defId))).toEqual([]);
});
