import { tileHeight } from "./heightmap.ts";
import type { RoomModel } from "./heightmap.ts";
import type { FurniDef, FurniItem, Tile } from "./protocol.ts";

export const ROOM_FURNI_CAP = 100;

export interface PlacementCtx {
  model: RoomModel;
  furni: FurniItem[];                 // items currently placed in the room
  defs: ReadonlyMap<string, FurniDef>;
  avatars: Tile[];
  doorTile: Tile;                     // placement here is always bad_position
  roomFurniCap: number;               // room_full above this
}
export type PlacementResult =
  | { ok: true; z: number }
  | { ok: false; code: "bad_position" | "occupied" | "no_stack" | "room_full" };

export function footprintTiles(def: FurniDef, x: number, y: number, dir: 0 | 2 | 4 | 6): Tile[] {
  const rotated = dir === 2 || dir === 6;
  const spanX = rotated ? def.l : def.w;
  const spanY = rotated ? def.w : def.l;
  const out: Tile[] = [];
  for (let dy = 0; dy < spanY; dy++) for (let dx = 0; dx < spanX; dx++) out.push({ x: x + dx, y: y + dy });
  return out;
}

function defOf(ctx: PlacementCtx, item: FurniItem): FurniDef {
  const def = ctx.defs.get(item.defId);
  if (!def) throw new Error(`unknown furni def: ${item.defId}`);
  return def;
}

/** Absolute world height of an item's top surface. `item.z` is already absolute. */
function itemTop(ctx: PlacementCtx, item: FurniItem): number {
  const def = defOf(ctx, item);
  const h = def.stackHeights[item.state];
  if (h === undefined) throw new Error(`furni ${item.id}: def ${def.id} has no state ${item.state}`);
  return item.z + h;
}

function itemsOn(ctx: PlacementCtx, t: Tile): FurniItem[] {
  return ctx.furni.filter((it) =>
    footprintTiles(defOf(ctx, it), it.x, it.y, it.dir).some((f) => f.x === t.x && f.y === t.y));
}

export function stackTop(ctx: PlacementCtx, t: Tile): number {
  let top = tileHeight(ctx.model, t.x, t.y);
  for (const it of itemsOn(ctx, t)) top = Math.max(top, itemTop(ctx, it));
  return top;
}

export function checkPlacement(
  ctx: PlacementCtx, def: FurniDef, x: number, y: number, dir: 0 | 2 | 4 | 6,
): PlacementResult {
  if (ctx.furni.length >= ctx.roomFurniCap) return { ok: false, code: "room_full" };

  const tiles = footprintTiles(def, x, y, dir);
  const floor = tileHeight(ctx.model, x, y);
  for (const t of tiles) {
    if (tileHeight(ctx.model, t.x, t.y) < 0) return { ok: false, code: "bad_position" };
    if (t.x === ctx.doorTile.x && t.y === ctx.doorTile.y) return { ok: false, code: "bad_position" };
    if (tileHeight(ctx.model, t.x, t.y) !== floor) return { ok: false, code: "bad_position" };
  }
  for (const t of tiles) {
    if (ctx.avatars.some((a) => a.x === t.x && a.y === t.y)) return { ok: false, code: "occupied" };
  }

  const tops: number[] = [];
  for (const t of tiles) {
    let highest: FurniItem | undefined;
    for (const it of itemsOn(ctx, t)) {
      if (!highest || itemTop(ctx, it) > itemTop(ctx, highest)) highest = it;
    }
    if (highest && !defOf(ctx, highest).canStackOn) return { ok: false, code: "no_stack" };
    tops.push(stackTop(ctx, t));
  }
  const z = Math.max(...tops);
  if (tops.some((t) => t !== z)) return { ok: false, code: "no_stack" };
  return { ok: true, z };
}
