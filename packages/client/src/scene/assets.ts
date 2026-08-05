import { Assets, Rectangle, Texture } from "pixi.js";
import type { FrameSpec, FurniMeta } from "./frames.ts";

export interface FurniAsset {
  base: Texture;
  meta: FurniMeta;
  frames: Map<string, Texture>;   // sub-textures per sheet rect, cut lazily
}

export type FurniAssets = ReadonlyMap<string, FurniAsset>;

export function frameTexture(asset: FurniAsset, spec: FrameSpec): Texture {
  const key = `${spec.x},${spec.y}`;
  const cached = asset.frames.get(key);
  if (cached) return cached;
  const texture = new Texture({
    source: asset.base.source,
    frame: new Rectangle(spec.x, spec.y, spec.w, spec.h),
  });
  asset.frames.set(key, texture);
  return texture;
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
      map.set(defId, { base, meta, frames: new Map() });
    }
    return map;
  } catch (e) {
    console.warn("furni sprites unavailable, using placeholder slabs:", e);
    return null;
  }
}
