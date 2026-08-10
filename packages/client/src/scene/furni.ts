import { Container, Graphics, Sprite } from "pixi.js";
import { worldToScreen } from "@grand/shared";
import type { DepthBox, FurniDef, FurniItem } from "@grand/shared";
import type { FurniAssets } from "./assets.ts";
import { frameTexture, nearFrameTexture } from "./assets.ts";
import { wisps } from "./effects.ts";
import type { Wisp } from "./effects.ts";
import { frameFor, occluderFor } from "./frames.ts";
import type { FrameSpec, Occluder } from "./frames.ts";
import { SCALE } from "./room.ts";
import { LAYER } from "./sort.ts";
import type { DepthIndex } from "./sort.ts";

const TOP = 1.3;
const RIGHT = 1.0;
const LEFT = 0.65;
const GLOW_RINGS = 8;

/** What a switched-on item gives off: the colour and reach of its light pool, the warmth its own
 *  sprite takes on, and how far up the item the light comes from. */
interface Glow {
  color: number;
  radius: number;
  tint: number;
  at: number;      // of the item's height
  smoke: boolean;
}

/** A bulb at the top of a stand — the lamp and the candelabra, and the default for any toggle
 *  added later. */
const GLOW: Glow = { color: 0xffd9a0, radius: 46, tint: 0xffe6c2, at: 0.8, smoke: false };

/** The items whose "on" is not a bulb (#331). A hearth burns low, hot and wide, at the grate
 *  rather than at the chimney, and it is the one that smokes; a stereo lights its own display
 *  panel and nothing else in the room, so its pool is small and cool and leaves the cabinet
 *  its own colour. */
const GLOWS: ReadonlyMap<string, Glow> = new Map([
  ["fireplace", { color: 0xffa347, radius: 58, tint: 0xffd9b0, at: 0.3, smoke: true }],
  ["fireplace_stone", { color: 0xffa347, radius: 58, tint: 0xffe0be, at: 0.3, smoke: true }],
  ["stereo_basic", { color: 0x8fd4ff, radius: 16, tint: 0xdfeaff, at: 0.55, smoke: false }],
]);

/** Off a lit hearth (#331): slower, wider and heavier than the coffee's steam, and grey-brown
 *  rather than white, because it is smoke coming off a fire and not water off a drink. */
const SMOKE: Wisp = {
  count: 5, ms: 2600, from: 0, rise: 18, drift: 3, size: 1.6, color: 0xcfc6bb, alpha: 0.45,
};

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

/** The occluding half's own box, in the same units as `furniBox`. The generator emits it in the
 *  dir's footprint units, so placing it is the item's origin plus the extent. */
function occluderBox(item: FurniItem, occ: Occluder): DepthBox {
  return {
    x0: item.x + occ.x0, y0: item.y + occ.y0, z0: item.z + occ.z0,
    x1: item.x + occ.x1, y1: item.y + occ.y1, z1: item.z + occ.z1,
    layer: LAYER.seat_front,
  };
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
  /** #227: the half of a seating item that draws again above every avatar. */
  private fronts = new Map<number, Container>();
  /** The wisps off each lit hearth (#331), redrawn every frame. The Graphics is a child of the
   *  item's own view, so `remove` destroys it with the view and only has to forget the key. */
  private smoking = new Map<number, Graphics>();
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
    // Nobody sits in a preview, so the two halves go up as one unit.
    const view = this.wholeFor(item) ?? this.slabFor(def, item);
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

  /** A seat goes up as two views, so a sitter lands between them: the legs and the far side draw
   *  behind the body, the near-side back and arm draw over it. The front half carries the box the
   *  generator measured for it, which is what sorts it against the rest of the room; what puts it
   *  after the body is the forced `seat_front` edge in sort.ts, since no box can say that. */
  apply(item: FurniItem): void {
    const def = this.defs.get(item.defId);
    if (!def) {
      console.warn(`furni ${item.id}: unknown def ${item.defId}`);
      return;
    }
    this.remove(item.id);

    const base = this.backFor(item) ?? this.slabFor(def, item);
    const view = def.interaction === "toggle" && item.state === 1
      ? this.lit(def, item, base)
      : base;
    view.eventMode = "none";
    this.views.set(item.id, view);
    this.depth.set(`furni:${item.id}`, furniBox(def, item), view);
    this.world.addChild(view);

    const front = this.frontFor(item);
    if (!front) return;
    front.view.eventMode = "none";
    this.fronts.set(item.id, front.view);
    this.depth.set(`furni:${item.id}:front`, occluderBox(item, front.box), front.view);
    this.world.addChild(front.view);
  }

  /** Only the continuous animations. The one-shot flourishes live in `Effects`, which owns its own
   *  clock; a hearth burns for as long as it is switched on, so it has nothing to expire. */
  update(now: number): void {
    for (const smoke of this.smoking.values()) wisps(smoke.clear(), now, SMOKE);
  }

  remove(id: number): void {
    this.smoking.delete(id);
    for (const [views, key] of [[this.views, `furni:${id}`], [this.fronts, `furni:${id}:front`]] as const) {
      const view = views.get(id);
      if (!view) continue;
      view.destroy({ children: true });   // frame textures are cached on the asset, not destroyed
      views.delete(id);
      this.depth.delete(key);
    }
  }

  private backFor(item: FurniItem): Sprite | null {
    const asset = this.assets?.get(item.defId);
    return asset ? this.spriteFor(item, frameFor(asset.meta, item.dir)) : null;
  }

  private frontFor(item: FurniItem): { view: Sprite; box: Occluder } | null {
    const asset = this.assets?.get(item.defId);
    if (!asset) return null;
    const front = occluderFor(asset.meta, item.dir);
    if (front) {
      const view = this.spriteFor(item, front.frame);
      return view ? { view, box: front.box } : null;
    }
    // A 3D-assisted seat splits through a companion sheet rather than a second sheet row, and the
    // Blender path never measured a box to go with it (#235). The item's own extent is a sound
    // stand-in: every near pixel is a subset of the base frame, so the box cannot under-cover.
    // It ties with the base box, and `seat_front` is what orders it after the base; what orders
    // it after the sitter is the forced edge in sort.ts, same as for a procedural seat.
    const spec = frameFor(asset.meta, item.dir);
    const texture = spec && nearFrameTexture(asset, spec);
    const box = this.localExtent(item);
    if (!spec || !texture || !box) return null;
    const sprite = new Sprite(texture);
    const p = worldToScreen(item.x, item.y, item.z, SCALE);
    sprite.x = p.sx + spec.offsetX;
    sprite.y = p.sy + spec.offsetY;
    return { view: sprite, box };
  }

  /** The item's own extent, in the local footprint units the generator emits occluders in. */
  private localExtent(item: FurniItem): Occluder | null {
    const def = this.defs.get(item.defId);
    if (!def) return null;
    const rotated = item.dir === 2 || item.dir === 6;
    return {
      x0: 0, y0: 0, z0: 0,
      x1: rotated ? def.l : def.w,
      y1: rotated ? def.w : def.l,
      z1: def.stackHeights[item.state] ?? 0,
    };
  }

  /** Both halves in one container — for the ghost, where no sitter comes between them. */
  private wholeFor(item: FurniItem): Container | null {
    const back = this.backFor(item);
    if (!back) return null;
    const front = this.frontFor(item);
    if (!front) return back;
    const group = new Container();
    group.addChild(back, front.view);
    return group;
  }

  private spriteFor(item: FurniItem, spec: FrameSpec | null): Sprite | null {
    const asset = this.assets?.get(item.defId);
    if (!asset || !spec) return null;
    const sprite = new Sprite(frameTexture(asset, spec));
    const p = worldToScreen(item.x, item.y, item.z, SCALE);
    sprite.x = p.sx + spec.offsetX;
    sprite.y = p.sy + spec.offsetY;
    return sprite;
  }

  /** A switched-on item (#326): the sprite warmed a shade, over an additive pool of light built
   *  from stacked rings — Graphics has no radial fill, and the falloff is what sells the glow. A
   *  hearth also smokes (#331), from the same point its light comes from, since the fire is both.
   *  The wisps go on last so they draw over the sprite: they rise inside the open firebox, which
   *  the mesh leaves clear to the mantel, so nothing stands in front of them. */
  private lit(def: FurniDef, item: FurniItem, base: Container): Container {
    const tune = GLOWS.get(def.id) ?? GLOW;
    const rotated = item.dir === 2 || item.dir === 6;
    const height = def.stackHeights[item.state] ?? 0;
    const p = worldToScreen(
      item.x + ((rotated ? def.l : def.w) - 1) / 2,
      item.y + ((rotated ? def.w : def.l) - 1) / 2,
      item.z + height * tune.at,
      SCALE,
    );
    const glow = new Graphics();
    for (let ring = GLOW_RINGS; ring > 0; ring--) {
      const k = ring / GLOW_RINGS;
      glow.circle(p.sx, p.sy, tune.radius * k)
        .fill({ color: tune.color, alpha: 0.02 + 0.06 * (1 - k) });
    }
    glow.blendMode = "add";
    base.tint = tune.tint;
    const group = new Container();
    group.addChild(glow, base);
    if (tune.smoke) {
      const smoke = group.addChild(new Graphics());
      smoke.x = p.sx;
      smoke.y = p.sy;
      this.smoking.set(item.id, smoke);
    }
    return group;
  }

  private slabFor(def: FurniDef, item: FurniItem): Graphics {
    const g = new Graphics();
    drawSlab(g, def, item);
    return g;
  }
}
