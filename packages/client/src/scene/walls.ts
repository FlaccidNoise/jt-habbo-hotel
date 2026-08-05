import { Container, Graphics, Sprite } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import {
  WALL_SEG_PX,
  WALL_TOP_PX,
  wallOffset,
  wallOrigin,
  wallSegments,
  wallSign,
  worldToScreen,
} from "@grand/shared";
import type { RoomModel, WallDef, WallItem, WallPos } from "@grand/shared";
import type { FurniAssets } from "./assets.ts";
import { frameTexture } from "./assets.ts";
import { frameFor } from "./frames.ts";
import { SCALE } from "./room.ts";
import { depthKey } from "./sort.ts";

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
  private faces: Graphics[] = [];
  private items = new Map<number, { item: WallItem; view: Sprite | Graphics }>();
  private ghostView: Sprite | Graphics | null = null;

  constructor(
    world: Container,
    model: RoomModel,
    defs: ReadonlyMap<string, WallDef>,
    assets: FurniAssets | null,
    handlers: WallHandlers,
  ) {
    this.world = world;
    this.defs = defs;
    this.assets = assets;
    this.handlers = handlers;
    for (const seg of wallSegments(model)) this.addFace(seg.side, seg.x, seg.y);
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
    view.zIndex = depthKey({ kind: "wall_furni", x: item.x, y: item.y, z: 0 });
    this.items.set(item.id, { item, view });
    this.world.addChild(view);
  }

  remove(id: number): void {
    const held = this.items.get(id);
    if (!held) return;
    held.view.destroy({ children: true });
    this.items.delete(id);
  }

  ghost(def: WallDef, pos: WallPos, ok: boolean): void {
    this.clearGhost();
    const view = this.viewFor(def, { ...pos, id: -1, defId: def.id, state: 0 });
    view.eventMode = "none";
    view.alpha = ok ? 0.6 : 0.35;
    if (!ok) view.tint = 0xff6b6b;
    view.zIndex = depthKey({ kind: "wall_furni", x: pos.x, y: pos.y, z: 0 });
    this.ghostView = view;
    this.world.addChild(view);
  }

  clearGhost(): void {
    this.ghostView?.destroy({ children: true });
    this.ghostView = null;
  }

  destroy(): void {
    this.clearGhost();
    for (const id of [...this.items.keys()]) this.remove(id);
    for (const face of this.faces) face.destroy();
    this.faces = [];
  }

  private viewFor(def: WallDef, item: WallItem): Sprite | Graphics {
    const asset = this.assets?.get(def.id);
    const spec = asset ? frameFor(asset.meta, wallDir(item.side)) : null;
    const texture = asset ? frameTexture(asset, wallDir(item.side)) : null;
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
    ]).fill(side === "left" ? FACE_LEFT : FACE_RIGHT).stroke({ width: 1, color: 0x000000, alpha: 0.13 });
    // The cap: the wall's own thickness, receding away from the room so it reads as a solid slab.
    g.poly([
      o.sx, o.sy,
      far.x, far.y,
      far.x - sign * THICKNESS, far.y - THICKNESS / 2,
      o.sx - sign * THICKNESS, o.sy - THICKNESS / 2,
    ]).fill(CAP);
    g.eventMode = "static";
    g.zIndex = depthKey({ kind: "wall", x, y, z: 0 });
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
    this.faces.push(g);
    this.world.addChild(g);
  }
}
