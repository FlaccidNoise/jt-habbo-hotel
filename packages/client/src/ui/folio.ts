// The Furnishings Folio's DOM-free half (docs/plans/2026-08-11-furniture-content-blitz-catalog.md,
// Task 2): entries, chapters, search, paging and card states as pure data. The panel owns every
// element; nothing here touches the browser.

import type { CollectionSet } from "@grand/shared";
import { themeLabel } from "./catalog.ts";
import type { CatalogItem } from "./catalog.ts";

export type FolioAcquisition =
  | { kind: "buy"; price: number }
  | { kind: "set_reward"; setId: string; setName: string };

/** A catalog item with the geometry the detail leaf shows. All optional: a wearable carries none
 *  of it, a wall item carries span/plane instead of w/l. */
export interface FolioItem extends CatalogItem {
  w?: number; l?: number;
  span?: number; plane?: { w: number; h: number };
  interaction?: string; vend?: { item: string; price: number };
}

export interface FolioEntry { item: FolioItem; acquisition: FolioAcquisition }

export interface FolioChapter { id: string; label: string; entries: FolioEntry[] }

/** What the folio shows: everything with a price, plus the reward each collection set names.
 *  Unpriced lever exclusives and house fixtures stay out — they are won or house-placed, never
 *  browsed. Catalog order in, catalog order out; a reward route wins over a price, which the
 *  economy gates make unreachable anyway. */
export function folioEntries(
  items: readonly FolioItem[],
  prices: ReadonlyMap<string, number>,
  sets: readonly CollectionSet[],
): FolioEntry[] {
  const rewardByDef = new Map<string, CollectionSet>();
  for (const set of sets) rewardByDef.set(set.reward, set);
  const out: FolioEntry[] = [];
  for (const item of items) {
    const set = rewardByDef.get(item.id);
    if (set) {
      out.push({ item, acquisition: { kind: "set_reward", setId: set.id, setName: set.name } });
      continue;
    }
    const price = prices.get(item.id);
    if (price !== undefined) out.push({ item, acquisition: { kind: "buy", price } });
  }
  return out;
}

/** One chapter per theme, first sighted in catalog order — a theme the client has never heard of
 *  reads its own label, same rule as the old strip. */
export function folioChapters(entries: readonly FolioEntry[]): FolioChapter[] {
  const chapters = new Map<string, FolioChapter>();
  for (const entry of entries) {
    let chapter = chapters.get(entry.item.theme);
    if (!chapter) {
      chapter = { id: entry.item.theme, label: themeLabel(entry.item.theme), entries: [] };
      chapters.set(entry.item.theme, chapter);
    }
    chapter.entries.push(entry);
  }
  return [...chapters.values()];
}

const normalize = (s: string): string => s.trim().toLowerCase();

/** Case-insensitive substring search over name and theme (id and label, so "wall art" finds
 *  `wall_art`). An empty or blank query hands everything back in order. */
export function folioSearch(entries: readonly FolioEntry[], query: string): FolioEntry[] {
  const q = normalize(query);
  if (q === "") return [...entries];
  return entries.filter((e) =>
    normalize(e.item.name).includes(q)
    || normalize(e.item.theme).includes(q)
    || normalize(themeLabel(e.item.theme)).includes(q));
}

export interface FolioPage { entries: FolioEntry[]; page: number; pageCount: number }

/** The 24-card page bound: mount one slice, never the whole shelf. Out-of-range pages clamp to
 *  the book's covers rather than flashing an empty page. */
export function folioPage(
  entries: readonly FolioEntry[],
  page: number,
  pageSize = 24,
): FolioPage {
  const pageCount = Math.ceil(entries.length / pageSize);
  const clamped = Math.max(0, Math.min(page, pageCount - 1));
  return {
    entries: entries.slice(clamped * pageSize, (clamped + 1) * pageSize),
    page: clamped,
    pageCount,
  };
}

export interface FolioCardContext {
  stars: number;
  ownedWearableSets: ReadonlySet<number>;
  completedCollectionSets: ReadonlySet<string>;
}

/** What a card may offer. Rewards never show a Buy action: they are locked until their set
 *  completes, then displayed as earned. A wearable already minted is owned outright. Everything
 *  else is a purchase the balance either covers or does not. */
export function folioCardState(
  entry: FolioEntry,
  context: FolioCardContext,
): "available" | "unaffordable" | "owned" | "reward_locked" | "reward_earned" {
  const acquisition = entry.acquisition;
  if (acquisition.kind === "set_reward") {
    return context.completedCollectionSets.has(acquisition.setId) ? "reward_earned" : "reward_locked";
  }
  if (entry.item.setId !== undefined && context.ownedWearableSets.has(entry.item.setId)) {
    return "owned";
  }
  return acquisition.price <= context.stars ? "available" : "unaffordable";
}
