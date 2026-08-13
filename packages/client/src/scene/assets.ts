import { Assets, Rectangle, Texture } from "pixi.js";
import type { FrameSpec, FurniMeta } from "./frames.ts";

export interface FurniAsset {
  base: Texture;
  meta: FurniMeta;
  frames: Map<string, Texture>;   // sub-textures per sheet rect, cut lazily
  /** #227: only 3D-assisted seating has one. Same geometry as `base`, holding just the parts
   *  that draw in front of an occupant. */
  near: Texture | null;
  nearFrames: Map<string, Texture>;
}

export type FurniAssets = ReadonlyMap<string, FurniAsset>;

/** Keyed by sheet rect, not by dir: a procedural seat cuts two rows out of one sheet, so one
 *  texture per dir is not enough. */
function cut(source: Texture, cache: Map<string, Texture>, spec: FrameSpec): Texture {
  const key = `${spec.x},${spec.y}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const texture = new Texture({
    source: source.source,
    frame: new Rectangle(spec.x, spec.y, spec.w, spec.h),
  });
  cache.set(key, texture);
  return texture;
}

export function frameTexture(asset: FurniAsset, spec: FrameSpec): Texture {
  return cut(asset.base, asset.frames, spec);
}

/** Null unless the item is 3D-assisted seating. `spec` is the ordinary row-0 frame — the
 *  companion sheet shares the base sheet's geometry exactly. */
export function nearFrameTexture(asset: FurniAsset, spec: FrameSpec): Texture | null {
  return asset.near ? cut(asset.near, asset.nearFrames, spec) : null;
}

/** Null when the bundles are missing or broken — the room falls back to placeholder slabs. */
export async function loadFurniAssets(): Promise<FurniAssets | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}furni/catalog.json`);
    if (!res.ok) throw new Error(`catalog.json: HTTP ${res.status}`);
    const catalog = (await res.json()) as { defs: Record<string, FurniMeta> };
    const map = new Map<string, FurniAsset>();
    for (const [defId, meta] of Object.entries(catalog.defs)) {
      const base = await Assets.load<Texture>(`${import.meta.env.BASE_URL}furni/${meta.sheet}`);
      base.source.scaleMode = "nearest";   // pixel art: never smooth
      let near: Texture | null = null;
      if (meta.nearSheet) {
        near = await Assets.load<Texture>(`${import.meta.env.BASE_URL}furni/${meta.nearSheet}`);
        near.source.scaleMode = "nearest";
      }
      map.set(defId, { base, meta, frames: new Map(), near, nearFrames: new Map() });
    }
    return map;
  } catch (e) {
    console.warn("furni sprites unavailable, using placeholder slabs:", e);
    return null;
  }
}
