import type { FurniMeta } from "../scene/frames.ts";

/** The fields FurniDef and WallDef share — all the shop needs to know about a thing it sells. */
export interface CatalogItem {
  id: string;
  name: string;
  theme: string;
  /** Set id when the entry is a wearable (#352) rather than furni. A wearable has no sheet to crop
   *  and mints no item, so a card carrying this bakes its thumbnail and buys with `buy_set`. */
  setId?: number;
}

export interface CatalogEntry extends CatalogItem {
  price: number;
  affordable: boolean;
}

export interface CatalogGroup {
  theme: string;
  label: string;
  entries: CatalogEntry[];
}

/** Themes come out of the catalog in the order it lists them, so a content pack that invents one
 *  gets its own tab with no edit here. An id with no price is not for sale — lever prizes and set
 *  rewards — and a theme with nothing priced never becomes a group at all. */
export function catalogGroups(
  items: readonly CatalogItem[],
  prices: ReadonlyMap<string, number>,
  stars: number,
): CatalogGroup[] {
  const groups = new Map<string, CatalogGroup>();
  for (const item of items) {
    const price = prices.get(item.id);
    if (price === undefined) continue;
    let group = groups.get(item.theme);
    if (!group) {
      group = { theme: item.theme, label: themeLabel(item.theme), entries: [] };
      groups.set(item.theme, group);
    }
    group.entries.push({ ...item, price, affordable: price <= stars });
  }
  return [...groups.values()];
}

/** "wall_art" → "Wall Art". No table of pretty names: a theme nobody has heard of still reads. */
export function themeLabel(theme: string): string {
  return theme
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Facings in the order the shop wants them. 4 is the cell that faces the camera — the seat and
 *  the front panel both show. A wall item only hangs on two walls, so it falls through to 6. */
const THUMB_DIRS: readonly number[] = [4, 2, 6, 0];

/** Slack around a wall item's plane, in sheet px: the art overruns its own plane by a few pixels
 *  of frame and shadow. Measured over every shipped wall sheet — the tightest fit is the clock,
 *  at 46 px of art against a 40 px plane box. */
const WALL_SLACK = 8;

/** Where to put the sheet inside a thumbnail box of the size that was asked for. The sheet draws
 *  whole and the box clips it — one `<img>`, no canvas. */
export interface ThumbCrop {
  /** Width to draw the whole sheet at. Its height follows, so only this is set. */
  sheetWidth: number;
  /** Offset of the sheet's top-left corner from the box's. */
  left: number;
  top: number;
}

/** Null when the bundle is missing — the caller draws the no-art tile rather than an empty box.
 *  `plane` is the WallDef's drawn size, and passing it is what says "this hangs on a wall".
 *  `maxIntegerScale` bounds whole-ratio upscaling: cards keep 1 (a thumbnail never upscales), the
 *  detail leaf passes 2 so small art can double without leaving the pixel grid. */
export function thumbCrop(
  meta: FurniMeta | undefined,
  box: { w: number; h: number },
  plane?: { w: number; h: number },
  maxIntegerScale = 1,
): ThumbCrop | null {
  if (!meta || meta.dirs.length === 0 || meta.frameW <= 0 || meta.frameH <= 0) return null;
  const dir = THUMB_DIRS.find((d) => meta.dirs.includes(d)) ?? meta.dirs[0]!;
  const i = meta.dirs.indexOf(dir);
  const art = artBox(meta, i, dir, plane);
  const fit = Math.min(box.w / art.w, box.h / art.h);
  // Nearest-neighbour only lands on the pixel grid at whole ratios, so shrink by 1/2, 1/3, 1/4 —
  // a 0.45 fit that fills the box costs more in ragged edges than it buys in size. Growth is whole
  // too, and bounded by maxIntegerScale: a card caps it at 1 (no upscale), a detail leaf at 2.
  const scale = fit >= 1 ? Math.min(Math.floor(fit), maxIntegerScale) : 1 / Math.ceil(1 / fit);
  return {
    sheetWidth: meta.frameW * meta.dirs.length * scale,
    left: -art.x * scale + (box.w - art.w * scale) / 2,
    top: (box.h - art.h * scale) / 2,
  };
}

/** The part of the sheet the art actually covers. A floor sheet is cut to its sprite, so the
 *  frame is the art. A wall sheet is not: it runs all the way down to the floor anchor so the
 *  item hangs at its mounted height, which leaves the art in one top corner — the plane plus the
 *  half-width the isometric skew adds — and the rest of the cell empty. */
function artBox(
  meta: FurniMeta,
  i: number,
  dir: number,
  plane?: { w: number; h: number },
): { x: number; w: number; h: number } {
  const cell = i * meta.frameW;
  if (!plane) return { x: cell, w: meta.frameW, h: meta.frameH };
  const anchor = meta.anchorsX[i] ?? meta.frameW / 2;
  // Dir 6 draws to the left of the anchor, dir 0 to the right of it.
  const left = dir === 0 ? anchor : 0;
  return {
    x: cell + left,
    w: dir === 0 ? meta.frameW - anchor : anchor,
    h: Math.min(meta.frameH, plane.h + Math.ceil(plane.w / 2) + WALL_SLACK),
  };
}
