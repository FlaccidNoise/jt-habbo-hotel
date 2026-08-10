import { Container, Graphics, Matrix, Sprite } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import {
  WALL_SEG_PX,
  WALL_TOP_PX,
  wallBox,
  wallItemBox,
  wallOffset,
  wallOrigin,
  wallSegments,
  wallSign,
  worldToScreen,
} from "@grand/shared";
import type { RoomModel, WallDef, WallItem, WallPos, WallSegment } from "@grand/shared";
import type { FurniAssets } from "./assets.ts";
import { frameTexture } from "./assets.ts";
import type { DecorAsset, WallDecor } from "./decor.ts";
import { frameFor } from "./frames.ts";
import { SCALE } from "./room.ts";
import type { TileWindow } from "./room.ts";
import { LAYER } from "./sort.ts";
import type { DepthIndex } from "./sort.ts";

const FACE_LEFT = 0x8e8778;    // the screen-left run: the plane at constant x
const FACE_RIGHT = 0xa39b8a;   // the screen-right run: the plane at constant y
const CAP = 0xc2b9a6;
/** Wall thickness in px, drawn as a top cap so the wall reads solid rather than as a painted sheet. */
const THICKNESS = 6;

/** The frame that carries a side: dir 0 was authored against the right wall, dir 6 is the same
 *  mesh turned three quarters onto the left one (tools/artgen/rig.py). */
export function wallDir(side: WallPos["side"]): number {
  return side === "left" ? 6 : 0;
}

export interface WallHandlers {
  /** A click landed on the wall. `itemId` is the hung item under the pointer, if any; `local` is
   *  the point in world coordinates so a click meant for the floor can still get there. */
  click(pos: WallPos, itemId: number | null, button: number, local: { x: number; y: number }): void;
  hover(pos: WallPos | null): void;
}

/** The room's walls and everything hung on them. Segments are drawn from the heightmap — one
 *  wherever a floor tile's north-west or north-east neighbour is void — so an L-shaped room walls
 *  its own notches without anything being authored. */
export class WallLayer {
  private world: Container;
  private defs: ReadonlyMap<string, WallDef>;
  private assets: FurniAssets | null;
  private handlers: WallHandlers;
  private depth: DepthIndex;
  private decor: DecorAsset<WallDecor> | null;
  /** Every segment the heightmap calls for, and the ones currently drawn. A room's perimeter grows
   *  with its side, so a 300-tile room asks for hundreds of faces — each an interactive Graphics
   *  and a node in the painter sort. Only the ones on screen are built (#359). */
  private segments: WallSegment[];
  private faces = new Map<string, Graphics>();
  private items = new Map<number, { item: WallItem; view: Sprite | Graphics }>();
  private ghostView: Sprite | Graphics | null = null;

  constructor(
    world: Container,
    model: RoomModel,
    defs: ReadonlyMap<string, WallDef>,
    assets: FurniAssets | null,
    handlers: WallHandlers,
    depth: DepthIndex,
    decor: DecorAsset<WallDecor> | null = null,
    /** The floor's visible window. Omitting it draws every wall, which is what a scene with no
     *  camera wants. */
    window: TileWindow | null = null,
  ) {
    this.world = world;
    this.defs = defs;
    this.assets = assets;
    this.handlers = handlers;
    this.depth = depth;
    this.decor = decor;
    this.segments = wallSegments(model);
    this.cull(window ?? { x0: 0, y0: 0, x1: model.width, y1: model.height });
  }

  /** Build the faces inside `window` and drop the ones outside. A wall stands on the far side of
   *  the tile it borders, so a segment is kept while its own tile is in the window — the same
   *  rectangle the floor uses, one tile of slack already built into it. */
  cull(window: TileWindow): void {
    const inside = (x: number, y: number): boolean =>
      x >= window.x0 && x < window.x1 && y >= window.y0 && y < window.y1;
    for (const [key, view] of [...this.faces]) {
      const [, , sx, sy] = key.split(":");
      if (inside(Number(sx), Number(sy))) continue;
      view.destroy();
      this.faces.delete(key);
      this.depth.delete(key);
    }
    for (const seg of this.segments) {
      if (!inside(seg.x, seg.y)) continue;
      if (this.faces.has(`wall:${seg.side}:${seg.x}:${seg.y}`)) continue;
      this.addFace(seg.side, seg.x, seg.y);
    }
  }

  apply(item: WallItem): void {
    const def = this.defs.get(item.defId);
    if (!def) {
      console.warn(`wall item ${item.id}: unknown def ${item.defId}`);
      return;
    }
    this.remove(item.id);
    const view = this.viewFor(def, item);
    view.eventMode = "none";
    this.depth.set(
      `wall_furni:${item.id}`,
      wallItemBox(def, item.side, item.x, item.y, LAYER.wall_furni),
      view,
    );
    this.items.set(item.id, { item, view });
    this.world.addChild(view);
  }

  remove(id: number): void {
    const held = this.items.get(id);
    if (!held) return;
    held.view.destroy({ children: true });
    this.items.delete(id);
    this.depth.delete(`wall_furni:${id}`);
  }

  ghost(def: WallDef, pos: WallPos, ok: boolean): void {
    this.clearGhost();
    const view = this.viewFor(def, { ...pos, id: -1, defId: def.id, state: 0 });
    view.eventMode = "none";
    view.alpha = ok ? 0.6 : 0.35;
    if (!ok) view.tint = 0xff6b6b;
    this.depth.set(
      "wall_furni:ghost",
      wallItemBox(def, pos.side, pos.x, pos.y, LAYER.wall_furni),
      view,
    );
    this.ghostView = view;
    this.world.addChild(view);
  }

  clearGhost(): void {
    this.ghostView?.destroy({ children: true });
    this.ghostView = null;
    this.depth.delete("wall_furni:ghost");
  }

  destroy(): void {
    this.clearGhost();
    for (const id of [...this.items.keys()]) this.remove(id);
    for (const [key, face] of this.faces) {
      face.destroy();
      this.depth.delete(key);
    }
    this.faces.clear();
  }

  private viewFor(def: WallDef, item: WallItem): Sprite | Graphics {
    const asset = this.assets?.get(def.id);
    const spec = asset ? frameFor(asset.meta, wallDir(item.side)) : null;
    const texture = asset && spec ? frameTexture(asset, spec) : null;
    const base = worldToScreen(item.x, item.y, 0, SCALE);
    // The sprite was rendered hanging at the def's mount, so placing it anywhere else is a slide
    // along the wall and down — the wall's own two axes.
    const off = wallOffset(item.side, item.u - def.mount.u, item.v - def.mount.v);
    if (texture && spec) {
      const sprite = new Sprite(texture);
      sprite.x = base.sx + spec.offsetX + off.dx;
      sprite.y = base.sy + spec.offsetY + off.dy;
      return sprite;
    }
    // Placeholder for a def with no published bundle: the plane box it claims, in its own colour.
    const g = new Graphics();
    const o = wallOrigin(item.x, item.y, SCALE);
    const corner = wallOffset(item.side, item.u, item.v);
    const sign = wallSign(item.side);
    const x0 = o.sx + corner.dx;
    const y0 = o.sy + corner.dy;
    g.poly([
      x0, y0,
      x0 + sign * def.plane.w, y0 + def.plane.w / 2,
      x0 + sign * def.plane.w, y0 + def.plane.w / 2 + def.plane.h,
      x0, y0 + def.plane.h,
    ]).fill(def.color);
    return g;
  }

  /** The wall item under a point on the wall, topmost first. Hung items never overlap, so the
   *  first hit is the only hit. */
  private itemAt(pos: WallPos): number | null {
    for (const { item } of this.items.values()) {
      if (item.side !== pos.side) continue;
      const def = this.defs.get(item.defId);
      if (!def) continue;
      const along = item.side === "left" ? item.y === pos.y : item.x === pos.x;
      if (!along) continue;
      if (pos.u < item.u || pos.u >= item.u + def.plane.w) continue;
      if (pos.v < item.v || pos.v >= item.v + def.plane.h) continue;
      return item.id;
    }
    return null;
  }

  /** Invert the wall's two axes: along-wall pixels are screen x, and the plane's 2:1 tilt costs
   *  half of them in screen y. Exact — the wall is drawn on the same lattice it is measured in. */
  private posAt(side: WallPos["side"], x: number, y: number, p: { x: number; y: number }): WallPos {
    const o = wallOrigin(x, y, SCALE);
    const u = wallSign(side) * (p.x - o.sx);
    return { side, x, y, u: Math.round(u), v: Math.round(p.y - o.sy - u / 2) };
  }

  private addFace(side: WallPos["side"], x: number, y: number): void {
    const o = wallOrigin(x, y, SCALE);
    const sign = wallSign(side);
    const far = { x: o.sx + sign * WALL_SEG_PX, y: o.sy + WALL_SEG_PX / 2 };
    const g = new Graphics();
    g.poly([
      o.sx, o.sy,
      far.x, far.y,
      far.x, far.y + WALL_TOP_PX,
      o.sx, o.sy + WALL_TOP_PX,
    ]);
    if (this.decor) {
      // The paper is authored in the wall's own two axes (u along, v down), the same axes a
      // hanging item is measured in, and this matrix is exactly wallOffset: u moves the texture
      // (sign, +0.5) on screen and v moves it straight down. Anchored at the segment's own origin,
      // so the pattern starts at the wall top and restarts every segment — which is why the tile
      // width has to divide WALL_SEG_PX (shared/decor.ts).
      g.fill({
        texture: this.decor.texture,
        matrix: new Matrix(sign, 0.5, 0, 1, o.sx, o.sy),
        textureSpace: "global",
      });
      // The bare planes differ in luminance (FACE_LEFT/FACE_RIGHT) but a decor texture is the
      // same bytes on both, which flattens the corner. Same ~0.87 ratio, applied as a tint.
      if (side === "left") g.tint = 0xdedede;
    } else {
      g.fill(side === "left" ? FACE_LEFT : FACE_RIGHT)
        .stroke({ width: 1, color: 0x000000, alpha: 0.13 });
    }
    // The cap: the wall's own thickness, receding away from the room so it reads as a solid slab.
    g.poly([
      o.sx, o.sy,
      far.x, far.y,
      far.x - sign * THICKNESS, far.y - THICKNESS / 2,
      o.sx - sign * THICKNESS, o.sy - THICKNESS / 2,
    ]).fill(this.decor?.def.cap ?? CAP);
    g.eventMode = "static";
    this.depth.set(`wall:${side}:${x}:${y}`, wallBox(side, x, y, LAYER.wall), g);
    const at = (e: FederatedPointerEvent): { pos: WallPos; local: { x: number; y: number } } => {
      const local = this.world.toLocal(e.global);
      return { pos: this.posAt(side, x, y, local), local };
    };
    g.on("pointerdown", (e) => {
      const { pos, local } = at(e);
      this.handlers.click(pos, this.itemAt(pos), e.button, local);
    });
    g.on("pointermove", (e) => this.handlers.hover(at(e).pos));
    g.on("pointerout", () => this.handlers.hover(null));
    this.faces.set(`wall:${side}:${x}:${y}`, g);
    this.world.addChild(g);
  }
}
