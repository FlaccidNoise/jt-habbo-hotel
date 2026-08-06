import { Assets, Texture } from "pixi.js";
import { DECOR_CATALOG } from "@grand/shared";
import type { DecorDef } from "@grand/shared";

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

/** Empty when the tiles are missing — every room then draws the colours it always did. A decor
 *  that fails to load must not take the room with it. */
export async function loadDecorAssets(): Promise<DecorAssets> {
  const map = new Map<string, DecorAsset>();
  for (const def of DECOR_CATALOG) {
    try {
      const texture = await Assets.load<Texture>(`/decor/${def.id}.png`);
      texture.source.scaleMode = "nearest";   // pixel art: never smooth
      texture.source.addressMode = "repeat";  // the tile IS the pattern; the GPU repeats it
      map.set(def.id, { def, texture });
    } catch (e) {
      console.warn(`decor ${def.id} unavailable:`, e);
    }
  }
  return map;
}
