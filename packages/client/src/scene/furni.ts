import { Container, Graphics, Sprite } from "pixi.js";
import { worldToScreen } from "@grand/shared";
import type { DepthBox, FurniDef, FurniItem } from "@grand/shared";
import type { FurniAssets } from "./assets.ts";
import { frameTexture } from "./assets.ts";
import { frameFor } from "./frames.ts";
import { SCALE } from "./room.ts";
import { LAYER } from "./sort.ts";
import type { DepthIndex } from "./sort.ts";

const TOP = 1.3;
const RIGHT = 1.0;
const LEFT = 0.65;

function shade(color: number, factor: number): number {
  const channel = (shift: number): number =>
    Math.min(255, Math.round(((color >> shift) & 0xff) * factor));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Placeholder slab for defs with no generated bundle: an extruded box whose top face covers the
 *  footprint, in three shades of the def's colour. */
function drawSlab(g: Graphics, def: FurniDef, item: FurniItem): void {
  const rotated = item.dir === 2 || item.dir === 6;
  const spanX = rotated ? def.l : def.w;
  const spanY = rotated ? def.w : def.l;
  const top = item.z + (def.stackHeights[item.state] ?? 0);
  const x0 = item.x - 0.5;
  const y0 = item.y - 0.5;
  const x1 = item.x + spanX - 0.5;
  const y1 = item.y + spanY - 0.5;
  const at = (x: number, y: number, z: number): { sx: number; sy: number } =>
    worldToScreen(x, y, z, SCALE);

  const n = at(x0, y0, top);
  const e = at(x1, y0, top);
  const s = at(x1, y1, top);
  const w = at(x0, y1, top);
  const eb = at(x1, y0, item.z);
  const sb = at(x1, y1, item.z);
  const wb = at(x0, y1, item.z);

  g.poly([e.sx, e.sy, s.sx, s.sy, sb.sx, sb.sy, eb.sx, eb.sy]).fill(shade(def.color, RIGHT));
  g.poly([s.sx, s.sy, w.sx, w.sy, wb.sx, wb.sy, sb.sx, sb.sy]).fill(shade(def.color, LEFT));
  g.poly([n.sx, n.sy, e.sx, e.sy, s.sx, s.sy, w.sx, w.sy])
    .fill(shade(def.color, TOP))
    .stroke({ width: 1, color: 0x000000, alpha: 0.3 });
}

/** The tiles an item covers and the height it stands to, in the tile-index units the painter
 *  sort works in. `item.z` is already the absolute floor the item rests on. */
function furniBox(def: FurniDef, item: FurniItem): DepthBox {
  const rotated = item.dir === 2 || item.dir === 6;
  return {
    x0: item.x,
    y0: item.y,
    z0: item.z,
    x1: item.x + (rotated ? def.l : def.w),
    y1: item.y + (rotated ? def.w : def.l),
    z1: item.z + (def.stackHeights[item.state] ?? 0),
    layer: def.canWalk ? LAYER.floor_furni : LAYER.furni,
  };
}

/** Every placed item in the room, drawn from generated sprite sheets when the def has a bundle.
 *  `apply` covers `furni_placed` (new id creates, known id updates) and `furni_moved` — the same
 *  rebuild either way. */
export class FurniLayer {
  private world: Container;
  private defs: ReadonlyMap<string, FurniDef>;
  private assets: FurniAssets | null;
  private depth: DepthIndex;
  private views = new Map<number, Container>();
  private ghostView: Container | null = null;

  constructor(
    world: Container,
    defs: ReadonlyMap<string, FurniDef>,
    assets: FurniAssets | null,
    depth: DepthIndex,
  ) {
    this.world = world;
    this.defs = defs;
    this.assets = assets;
    this.depth = depth;
  }

  /** A translucent copy of the item being placed, drawn where it would land and facing the way it
   *  would face — the player previews the actual furniture, not just the tiles it covers. */
  ghost(def: FurniDef, x: number, y: number, z: number, dir: 0 | 2 | 4 | 6, ok: boolean): void {
    this.clearGhost();
    const item: FurniItem = { id: -1, defId: def.id, x, y, z, dir, state: 0 };
    const view = this.spriteFor(item) ?? this.slabFor(def, item);
    view.eventMode = "none";
    view.alpha = ok ? 0.6 : 0.35;
    if (!ok) view.tint = 0xff6b6b;
    this.ghostView = view;
    this.depth.set("ghost", furniBox(def, item), view);   // occludes like the real item would
    this.world.addChild(view);
  }

  clearGhost(): void {
    this.ghostView?.destroy({ children: true });
    this.ghostView = null;
    this.depth.delete("ghost");
  }

  apply(item: FurniItem): void {
    const def = this.defs.get(item.defId);
    if (!def) {
      console.warn(`furni ${item.id}: unknown def ${item.defId}`);
      return;
    }
    this.remove(item.id);

    const view = this.spriteFor(item) ?? this.slabFor(def, item);
    view.eventMode = "none";
    this.views.set(item.id, view);
    this.depth.set(`furni:${item.id}`, furniBox(def, item), view);
    this.world.addChild(view);
  }

  remove(id: number): void {
    const view = this.views.get(id);
    if (!view) return;
    view.destroy({ children: true });   // frame textures are cached on the asset, not destroyed
    this.views.delete(id);
    this.depth.delete(`furni:${id}`);
  }

  private spriteFor(item: FurniItem): Sprite | null {
    const asset = this.assets?.get(item.defId);
    if (!asset) return null;
    const texture = frameTexture(asset, item.dir);
    const spec = frameFor(asset.meta, item.dir);
    if (!texture || !spec) return null;
    const sprite = new Sprite(texture);
    const p = worldToScreen(item.x, item.y, item.z, SCALE);
    sprite.x = p.sx + spec.offsetX;
    sprite.y = p.sy + spec.offsetY;
    return sprite;
  }

  private slabFor(def: FurniDef, item: FurniItem): Graphics {
    const g = new Graphics();
    drawSlab(g, def, item);
    return g;
  }
}
