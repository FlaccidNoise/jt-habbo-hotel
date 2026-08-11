// The folio's DOM-free model (Task 2): entries, chapters, search, paging and card states, plus a
// synthetic 600-entry catalog standing in for the released shop.

import { describe, expect, test } from "vitest";
import type { CollectionSet } from "@grand/shared";
import {
  folioCardState, folioChapters, folioEntries, folioPage, folioSearch,
} from "../src/ui/folio.ts";
import type { FolioCardContext, FolioEntry, FolioItem } from "../src/ui/folio.ts";

const ITEMS: FolioItem[] = [
  { id: "chair", name: "Chair", theme: "starter", w: 1, l: 1 },
  { id: "chair_sky", name: "Sky Chair", theme: "starter", w: 1, l: 1 },
  { id: "poster", name: "Poster", theme: "wall_art", span: 1, plane: { w: 24, h: 29 } },
  { id: "reward_vase", name: "Marble Vase", theme: "cafe" },
  { id: "lever_prize", name: "Lever Prize", theme: "casino" },
  { id: "fixture", name: "House Fixture", theme: "casino" },
  { id: "sauna", name: "Sauna Bench", theme: "spa_deck" },
  { id: "set:30", name: "Curls", theme: "hair", setId: 30 },
  { id: "vend_cart", name: "Coffee Cart", theme: "cafe", w: 1, l: 1,
    interaction: "vend", vend: { item: "drink_coffee", price: 1 } },
];
const PRICES: ReadonlyMap<string, number> = new Map([
  ["chair", 25], ["chair_sky", 25], ["poster", 50], ["sauna", 300], ["set:30", 350], ["vend_cart", 150],
]);
const SETS: CollectionSet[] = [
  { id: "cafe", name: "The Café Set", members: ["chair"], reward: "reward_vase", badge: "set_cafe" },
];

const entries = folioEntries(ITEMS, PRICES, SETS);

const ctx = (over: Partial<FolioCardContext> = {}): FolioCardContext => ({
  stars: 100,
  ownedWearableSets: new Set<number>(),
  completedCollectionSets: new Set<string>(),
  ...over,
});

describe("entries", () => {
  test("only priced items and named set rewards enter the folio", () => {
    expect(entries.map((e) => e.item.id)).toEqual(
      ["chair", "chair_sky", "poster", "reward_vase", "sauna", "set:30", "vend_cart"]);
  });

  test("a reward carries its set's id and name, not a price", () => {
    const vase = entries.find((e) => e.item.id === "reward_vase")!;
    expect(vase.acquisition).toEqual({ kind: "set_reward", setId: "cafe", setName: "The Café Set" });
  });

  test("geometry and interaction payloads ride along for the detail leaf", () => {
    expect(entries.find((e) => e.item.id === "poster")!.item)
      .toMatchObject({ span: 1, plane: { w: 24, h: 29 } });
    expect(entries.find((e) => e.item.id === "vend_cart")!.item)
      .toMatchObject({ w: 1, l: 1, interaction: "vend", vend: { item: "drink_coffee", price: 1 } });
  });
});

describe("chapters", () => {
  test("themes bind in catalog order, and an unknown theme names its own chapter", () => {
    const chapters = folioChapters(entries);
    expect(chapters.map((c) => c.id)).toEqual(["starter", "wall_art", "cafe", "spa_deck", "hair"]);
    expect(chapters.map((c) => c.label))
      .toEqual(["Starter", "Wall Art", "Cafe", "Spa Deck", "Hair"]);
    expect(chapters[0]!.entries.map((e) => e.item.id)).toEqual(["chair", "chair_sky"]);
  });

  test("an empty folio has no chapters", () => expect(folioChapters([])).toEqual([]));
});

describe("search", () => {
  test("matching is case-insensitive over names", () =>
    expect(folioSearch(entries, "CHAIR").map((e) => e.item.id)).toEqual(["chair", "chair_sky"]));

  test("a theme matches by id and by label", () => {
    expect(folioSearch(entries, "wall_art").map((e) => e.item.id)).toEqual(["poster"]);
    expect(folioSearch(entries, "spa deck").map((e) => e.item.id)).toEqual(["sauna"]);
  });

  test("an empty or blank query hands everything back in order", () => {
    expect(folioSearch(entries, "")).toEqual(entries);
    expect(folioSearch(entries, "   ")).toEqual(entries);
  });

  test("no match is an empty result, not an error", () =>
    expect(folioSearch(entries, "billiards")).toEqual([]));
});

describe("paging", () => {
  const sixty: FolioEntry[] = entries.length > 0
    ? Array.from({ length: 60 }, (_, i) => ({ ...entries[0]!, item: { ...entries[0]!.item, id: `p_${i}` } }))
    : [];

  test("a page carries at most 24 cards", () => {
    const page = folioPage(sixty, 0);
    expect(page.entries.length).toBe(24);
    expect(page.pageCount).toBe(3);
    expect(folioPage(sixty, 2).entries.length).toBe(12);
  });

  test("out-of-range pages clamp to the covers instead of flashing empty", () => {
    expect(folioPage(sixty, 99).page).toBe(2);
    expect(folioPage(sixty, -3).page).toBe(0);
    expect(folioPage(sixty, -3).entries.length).toBe(24);
  });

  test("an empty folio is one empty cover", () =>
    expect(folioPage([], 0)).toEqual({ entries: [], page: 0, pageCount: 0 }));

  // The released shop: 618 furni/wall plus wearables. Only one page mounts at a time, and paging
  // through every cover must lose nothing.
  test("a 600-entry catalog loses no entry across its pages", () => {
    const many: FolioItem[] = Array.from({ length: 600 }, (_, i) => ({
      id: `item_${i}`, name: `Item ${i}`, theme: `theme_${i % 20}`,
    }));
    const prices = new Map(many.map((m) => [m.id, 25]));
    const all = folioEntries(many, prices, []);
    const first = folioPage(all, 0);
    expect(first.entries.length).toBe(24);
    expect(first.pageCount).toBe(25);
    const seen = new Set<string>();
    for (let p = 0; p < first.pageCount; p++) {
      for (const e of folioPage(all, p).entries) seen.add(e.item.id);
    }
    expect(seen.size).toBe(600);
  });
});

describe("card states", () => {
  const byId = new Map(entries.map((e) => [e.item.id, e]));
  const chair = byId.get("chair")!;
  const curls = byId.get("set:30")!;
  const vase = byId.get("reward_vase")!;

  test("exactly the price you hold buys the item; one Star short does not", () => {
    expect(folioCardState(chair, ctx({ stars: 25 }))).toBe("available");
    expect(folioCardState(chair, ctx({ stars: 24 }))).toBe("unaffordable");
  });

  test("an owned wearable is owned whatever the balance says", () => {
    expect(folioCardState(curls, ctx({ stars: 0, ownedWearableSets: new Set([30]) }))).toBe("owned");
    expect(folioCardState(curls, ctx({ stars: 350 }))).toBe("available");
    expect(folioCardState(curls, ctx({ stars: 349 }))).toBe("unaffordable");
  });

  test("a reward never offers Buy: locked until its set completes, then earned", () => {
    expect(folioCardState(vase, ctx())).toBe("reward_locked");
    expect(folioCardState(vase, ctx({ completedCollectionSets: new Set(["cafe"]) })))
      .toBe("reward_earned");
  });
});
