import { Assets, Texture } from "pixi.js";
import { DECOR_CATALOG } from "@grand/shared";
import type { DecorDef, RoomDecor } from "@grand/shared";
import { loadPool } from "./assets.ts";

/** Flat decor (#260). One tile per pattern, repeated by the GPU — nothing here is pre-projected.
 *  The floor tile is laid straight down in screen space; the wall tile is carried onto the wall
 *  plane by a shear matrix at draw time (scene/walls.ts), so the same bytes serve both walls. */

export type FloorDecor = Extract<DecorDef, { kind: "floor" }>;
export type WallDecor = Extract<DecorDef, { kind: "wall" }>;

export interface DecorAsset<D extends DecorDef = DecorDef> {
  def: D;
  texture: Texture;
}
export type DecorAssets = ReadonlyMap<string, DecorAsset>;

function of<K extends DecorDef["kind"]>(
  assets: DecorAssets | null, id: string | undefined, kind: K,
): DecorAsset<Extract<DecorDef, { kind: K }>> | null {
  const found = id === undefined ? undefined : assets?.get(id);
  if (!found || found.def.kind !== kind) return null;
  return found as DecorAsset<Extract<DecorDef, { kind: K }>>;
}

/** The floor pattern a room chose, or null for the default checker. */
export const floorDecor = (a: DecorAssets | null, id?: string): DecorAsset<FloorDecor> | null =>
  of(a, id, "floor");

/** The wallpaper a room chose, or null for the default plaster. */
export const wallDecor = (a: DecorAssets | null, id?: string): DecorAsset<WallDecor> | null =>
  of(a, id, "wall");

/** One of a room's floor overrides (#407) with its texture already resolved. Inclusive bounds, the
 *  same ones the server sent. */
export interface FloorRegion {
  x0: number; y0: number; x1: number; y1: number;
  asset: DecorAsset<FloorDecor>;
}

/** A room's floor overrides, in the order the server sent them. A region whose tile failed to load
 *  is dropped rather than drawn blank, so the room-wide floor shows through — the same fallback a
 *  missing room-wide tile gets. */
export function floorRegions(a: DecorAssets | null, decor: RoomDecor): FloorRegion[] {
  const out: FloorRegion[] = [];
  for (const r of decor.regions ?? []) {
    const asset = floorDecor(a, r.floor);
    if (asset) out.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y1, asset });
  }
  return out;
}

/** The region covering (x, y), or null where the room-wide floor stands. Later rectangles paint
 *  over earlier ones: the server builds its floor with rect fills that overwrite, and decor laid on
 *  top of them has to read the same way round. */
export function regionAt(
  regions: readonly FloorRegion[], x: number, y: number,
): FloorRegion | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const r = regions[i];
    if (r && x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1) return r;
  }
  return null;
}

/** How far a figure standing on a floor is sunk into it, in figure pixels (#427). A floor that is
 *  not in the table is dry land, which is every floor but the pool's water. Deep water is another
 *  tile with a bigger number here, not another mechanism.
 *
 *  Both numbers are landmarks on the baked cell, measured off the layer sheets rather than chosen:
 *  the feet sit at row 102 (`anchorY`, figures.json), the shirt hem at row 67 and the head at rows
 *  21-45. 34 is the hem, so wading cuts at the waist. The torso's silhouette then ramps out from
 *  1 px at row 44 and reaches its full 20 at row 50 — that ramp is the shoulder, so 102 - 50 = 52
 *  puts the deep surface at the foot of it and leaves the whole head plus the shoulder slope above
 *  water. Cutting at the top of the ramp instead would take two rows of jaw with it. */
const WATERLINE: Readonly<Record<string, number>> = { floor_pool: 34, floor_pool_deep: 52 };

/** How deep the water is on (x, y), 0 where the tile is not water. */
export function waterlineAt(regions: readonly FloorRegion[], x: number, y: number): number {
  const id = regionAt(regions, x, y)?.asset.def.id;
  return (id === undefined ? undefined : WATERLINE[id]) ?? 0;
}

/** Empty when the tiles are missing — every room then draws the colours it always did. A decor
 *  that fails to load must not take the room with it. */
export async function loadDecorAssets(onProgress?: (done: number, total: number) => void): Promise<DecorAssets> {
  const map = new Map<string, DecorAsset>();
  let done = 0;
  await loadPool(DECOR_CATALOG, async (def) => {
    try {
      const texture = await Assets.load<Texture>(`${import.meta.env.BASE_URL}decor/${def.id}.png`);
      texture.source.scaleMode = "nearest";   // pixel art: never smooth
      texture.source.addressMode = "repeat";  // the tile IS the pattern; the GPU repeats it
      map.set(def.id, { def, texture });
    } catch (e) {
      console.warn(`decor ${def.id} unavailable:`, e);
    }
  }, () => onProgress?.(++done, DECOR_CATALOG.length));
  return map;
}
