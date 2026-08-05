import { Assets, Rectangle, Texture } from "pixi.js";
import type { FurniMeta } from "./frames.ts";
import { frameFor } from "./frames.ts";

export interface FurniAsset {
  base: Texture;
  meta: FurniMeta;
  frames: Map<number, Texture>;   // per-dir sub-textures, cut lazily
  /** #227: only seating items have one. Same geometry as `base`, holding just the parts that
   *  draw in front of an occupant. */
  near: Texture | null;
  nearFrames: Map<number, Texture>;
}

export type FurniAssets = ReadonlyMap<string, FurniAsset>;

function cut(
  source: Texture, cache: Map<number, Texture>, meta: FurniMeta, dir: number,
): Texture | null {
  const cached = cache.get(dir);
  if (cached) return cached;
  const spec = frameFor(meta, dir);
  if (!spec) return null;
  const texture = new Texture({
    source: source.source,
    frame: new Rectangle(spec.x, spec.y, spec.w, spec.h),
  });
  cache.set(dir, texture);
  return texture;
}

export function frameTexture(asset: FurniAsset, dir: number): Texture | null {
  return cut(asset.base, asset.frames, asset.meta, dir);
}

export function nearFrameTexture(asset: FurniAsset, dir: number): Texture | null {
  return asset.near ? cut(asset.near, asset.nearFrames, asset.meta, dir) : null;
}

/** Null when the bundles are missing or broken — the room falls back to placeholder slabs. */
export async function loadFurniAssets(): Promise<FurniAssets | null> {
  try {
    const res = await fetch("/furni/catalog.json");
    if (!res.ok) throw new Error(`catalog.json: HTTP ${res.status}`);
    const catalog = (await res.json()) as { defs: Record<string, FurniMeta> };
    const map = new Map<string, FurniAsset>();
    for (const [defId, meta] of Object.entries(catalog.defs)) {
      const base = await Assets.load<Texture>(`/furni/${meta.sheet}`);
      base.source.scaleMode = "nearest";   // pixel art: never smooth
      let near: Texture | null = null;
      if (meta.nearSheet) {
        near = await Assets.load<Texture>(`/furni/${meta.nearSheet}`);
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
