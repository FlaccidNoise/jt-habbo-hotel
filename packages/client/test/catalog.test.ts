import { describe, expect, test } from "vitest";
import {
  CATALOG_PRICES, PROTOTYPE_CATALOG, WALL_CATALOG, WEARABLE_SHELF,
} from "@grand/shared";
import { catalogGroups, themeLabel, thumbCrop } from "../src/ui/catalog.ts";
import type { CatalogItem } from "../src/ui/catalog.ts";
import type { FurniMeta } from "../src/scene/frames.ts";

// The shop's DOM-free halves: which shelf a thing lands on, whether you can afford it, and where
// its one cell of the shipped sheet sits inside a thumbnail box.

const ITEMS: CatalogItem[] = [
  { id: "chair", name: "Chair", theme: "starter" },
  { id: "stool", name: "Stool", theme: "casino" },
  { id: "prize", name: "Prize", theme: "casino" },
  { id: "poster", name: "Poster", theme: "wall_art" },
];
const PRICES: ReadonlyMap<string, number> = new Map([["chair", 25], ["stool", 100], ["poster", 50]]);
const BOX = { w: 72, h: 64 };

/** The shipped chair sheet: four facings, each cut to the sprite. */
const CHAIR: FurniMeta = {
  sheet: "chair_basic.png", frameW: 64, frameH: 64,
  dirs: [0, 2, 4, 6], anchorsX: [32, 32, 32, 32], anchorY: 48,
};
/** The shipped poster sheet: two facings, and each 64x127 cell is mostly the air below the item,
 *  because a wall sheet runs down to the floor anchor. */
const POSTER: FurniMeta = {
  sheet: "poster.png", frameW: 64, frameH: 127,
  dirs: [0, 6], anchorsX: [32, 32], anchorY: 111,
};
const POSTER_PLANE = { w: 24, h: 29 };

describe("shelves", () => {
  test("themes come out in the order the catalog lists them", () => {
    expect(catalogGroups(ITEMS, PRICES, 1000).map((g) => g.theme))
      .toEqual(["starter", "casino", "wall_art"]);
  });

  test("an unpriced id is not for sale and does not pad its shelf", () => {
    const casino = catalogGroups(ITEMS, PRICES, 1000).find((g) => g.theme === "casino");
    expect(casino?.entries.map((e) => e.id)).toEqual(["stool"]);
  });

  test("a theme with nothing priced never becomes a shelf", () => {
    const themes = catalogGroups(
      [...ITEMS, { id: "trophy", name: "Trophy", theme: "prestige" }], PRICES, 1000,
    ).map((g) => g.theme);
    expect(themes).not.toContain("prestige");
  });

  // The three content packs behind this land as new theme strings and nothing else. If a shelf
  // needed a client edit to appear, they would each ship one.
  test("a theme the client has never heard of gets its own shelf and a readable name", () => {
    const groups = catalogGroups(
      [...ITEMS, { id: "sauna", name: "Sauna Bench", theme: "spa_deck" }],
      new Map([...PRICES, ["sauna", 300]]), 1000,
    );
    expect(groups.at(-1)).toMatchObject({ theme: "spa_deck", label: "Spa Deck" });
  });

  test("exactly the price you hold buys the item", () => {
    const affordable = (stars: number): boolean =>
      catalogGroups(ITEMS, PRICES, stars)[0]!.entries[0]!.affordable;
    expect([affordable(24), affordable(25)]).toEqual([false, true]);
  });

  test("every priced item in the shipped catalog lands on exactly one shelf", () => {
    const items = [...PROTOTYPE_CATALOG, ...WALL_CATALOG];
    const ids = catalogGroups(items, CATALOG_PRICES, 0).flatMap((g) => g.entries.map((e) => e.id));
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(items.map((i) => i.id).filter((id) => CATALOG_PRICES.has(id)).sort());
  });

  // ~110 items is 53 today plus the packs. The panel shows one shelf at a time, so what has to
  // hold is that no shelf grows without bound and every item is still reachable.
  test("110 items across a dozen themes stay on their own shelves", () => {
    const many: CatalogItem[] = Array.from({ length: 110 }, (_, i) => ({
      id: `item_${i}`, name: `Item ${i}`, theme: `theme_${i % 12}`,
    }));
    const prices = new Map(many.map((item, i) => [item.id, 25 * (i % 4 + 1)]));
    const groups = catalogGroups(many, prices, 50);
    expect(groups.length).toBe(12);
    expect(groups.flatMap((g) => g.entries).length).toBe(110);
    expect(Math.max(...groups.map((g) => g.entries.length))).toBeLessThan(12);
    // 50 Stars buys the 25s and the 50s; the 75s and the 100s show, greyed.
    expect(groups.flatMap((g) => g.entries).filter((e) => !e.affordable).length).toBe(54);
  });

  test("the label is the theme, not a lookup table", () => {
    expect([themeLabel("cafe"), themeLabel("wall_art")]).toEqual(["Cafe", "Wall Art"]);
  });

  // Wearables ride the same shelves as furni (#352): a set carries `setId`, which is the only
  // thing that tells a card to bake a figure instead of cropping a sheet.
  test("a wearable lands on its own shelf, carrying the set id the buy needs", () => {
    const groups = catalogGroups(
      [...ITEMS, { id: "set:30", name: "Curls", theme: "hair", setId: 30 }],
      new Map([...PRICES, ["set:30", 350]]), 1000,
    );
    expect(groups.at(-1)).toMatchObject({ theme: "hair", label: "Hair" });
    expect(groups.at(-1)?.entries).toEqual([
      { id: "set:30", name: "Curls", theme: "hair", setId: 30, price: 350, affordable: true },
    ]);
  });

  test("a wearable priced past the balance shows greyed, like any other item", () => {
    const groups = catalogGroups(
      [{ id: "set:30", name: "Curls", theme: "hair", setId: 30 }],
      new Map([["set:30", 350]]), 349,
    );
    expect(groups[0]?.entries[0]?.affordable).toBe(false);
  });

  // A garment pack ships new themes in WEARABLE_SHELF, so what has to hold is that every priced
  // set reaches the shelf its own row names — not that they all land on one (#438).
  test("every priced wearable reaches its own theme's shelf, and furni entries carry no set id", () => {
    const wearables = WEARABLE_SHELF.map(({ set, price, theme }) => ({
      item: { id: `set:${set}`, name: `Set ${set}`, theme, setId: set },
      price,
    }));
    const groups = catalogGroups(
      [...PROTOTYPE_CATALOG, ...WALL_CATALOG, ...wearables.map((w) => w.item)],
      new Map<string, number>([...CATALOG_PRICES, ...wearables.map((w) => [w.item.id, w.price] as const)]),
      10000,
    );
    const themes = new Set(WEARABLE_SHELF.map((w) => w.theme));
    const shelved = groups.filter((g) => themes.has(g.theme)).flatMap((g) => g.entries);
    expect(shelved.map((e) => e.id).sort()).toEqual(wearables.map((w) => w.item.id).sort());
    const furni = groups.filter((g) => !themes.has(g.theme)).flatMap((g) => g.entries);
    expect(furni.filter((e) => e.setId !== undefined)).toEqual([]);
  });
});

/** Where the art ends up inside the box, in box coordinates: the crop places the whole sheet, so
 *  the art's corner is the sheet's corner plus its offset on the sheet. */
function drawn(meta: FurniMeta, art: { x: number; w: number; h: number },
  plane?: { w: number; h: number }): { x: number; y: number; w: number; h: number } {
  const crop = thumbCrop(meta, BOX, plane)!;
  const scale = crop.sheetWidth / (meta.frameW * meta.dirs.length);
  return { x: crop.left + art.x * scale, y: crop.top, w: art.w * scale, h: art.h * scale };
}

describe("thumbnails", () => {
  test("no bundle, no thumbnail — the caller draws the no-art tile instead", () => {
    expect(thumbCrop(undefined, BOX)).toBeNull();
    expect(thumbCrop({ ...CHAIR, dirs: [] }, BOX)).toBeNull();
  });

  test("a floor item shows the camera-facing cell, whole, unscaled", () => {
    const crop = thumbCrop(CHAIR, BOX)!;
    // dirs[2] is 4, so the sheet slides two frames left, then centres in the wider box.
    expect(crop).toEqual({ sheetWidth: 256, left: -64 * 2 + (72 - 64) / 2, top: 0 });
  });

  test("a sheet too big for the box shrinks by a whole ratio, never a fractional one", () => {
    const billiards: FurniMeta = { ...CHAIR, sheet: "billiards_table.png", frameW: 160, frameH: 115 };
    const crop = thumbCrop(billiards, BOX)!;
    // 72/160 fits at .45; nearest-neighbour takes the whole ratio under it, 1/3.
    expect(crop.sheetWidth).toBeCloseTo(160 * 4 / 3, 6);
    const art = drawn(billiards, { x: 320, w: 160, h: 115 });
    expect(art.x).toBeGreaterThanOrEqual(0);
    expect(art.x + art.w).toBeLessThanOrEqual(BOX.w);
    expect(art.y + art.h).toBeLessThanOrEqual(BOX.h);
  });

  // Cards never upscale (maxIntegerScale 1, the default); the folio detail leaf passes 2, and
  // growth stays on whole ratios either way, like the shrinking.
  test("a detail preview may double; a card keeps the no-upscale rule", () => {
    const small: FurniMeta = { sheet: "stool_lodge.png", frameW: 16, frameH: 16, dirs: [4], anchorsX: [8], anchorY: 12 };
    const box = { w: 96, h: 96 };
    expect(thumbCrop(small, box)!.sheetWidth).toBe(16);            // fits 6x, capped at 1x
    expect(thumbCrop(small, box, undefined, 2)!.sheetWidth).toBe(32);
    const mid: FurniMeta = { ...small, frameW: 40, frameH: 40 };
    expect(thumbCrop(mid, box, undefined, 2)!.sheetWidth).toBe(80);  // fit 2.4 -> whole 2x
    const big: FurniMeta = { ...small, frameW: 60, frameH: 60 };
    expect(thumbCrop(big, box, undefined, 2)!.sheetWidth).toBe(60);  // fit 1.6 -> stays 1x
  });

  // The measured art of every shipped wall sheet sits in the top corner of its cell: the plane
  // plus the half-width the isometric skew adds. Fitting the whole cell would draw a stamp.
  test("a wall item crops to the plane, not to the air under it", () => {
    const crop = thumbCrop(POSTER, BOX, POSTER_PLANE)!;
    const floorCrop = thumbCrop(POSTER, BOX)!;
    expect(crop.sheetWidth).toBe(128);           // 24 wide of plane fits the box at 1:1
    expect(crop).not.toEqual(floorCrop);
    const art = drawn(POSTER, { x: 64, w: 32, h: 29 + 12 + 8 }, POSTER_PLANE);
    expect(art).toEqual({ x: 20, y: (64 - 49) / 2, w: 32, h: 49 });
  });

  test("a wall item falls back to the facing it has", () => {
    // 4 and 2 are floor facings; a poster only hangs two ways, and 6 is the one drawn left of
    // the anchor. Its cell is the second on the sheet, so the sheet slides one frame left.
    expect(thumbCrop(POSTER, BOX, POSTER_PLANE)!.left).toBe(-64 + (72 - 32) / 2);
    expect(thumbCrop({ ...POSTER, dirs: [0] }, BOX, POSTER_PLANE)!.left).toBe(-32 + (72 - 32) / 2);
  });

  test("every shipped facing set resolves to a cell on the sheet", () => {
    for (const dirs of [[0, 2, 4, 6], [0, 6], [2], [0]]) {
      const crop = thumbCrop({ ...CHAIR, dirs }, BOX)!;
      expect(crop.left).toBeGreaterThan(-CHAIR.frameW * dirs.length);
    }
  });
});
