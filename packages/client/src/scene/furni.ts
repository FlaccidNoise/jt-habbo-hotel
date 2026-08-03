import { Container, Graphics } from "pixi.js";
import { worldToScreen } from "@grand/shared";
import type { FurniDef, FurniItem } from "@grand/shared";
import { SCALE } from "./room.ts";
import { depthKey } from "./sort.ts";

const TOP = 1.3;
const RIGHT = 1.0;
const LEFT = 0.65;

function shade(color: number, factor: number): number {
  const channel = (shift: number): number =>
    Math.min(255, Math.round(((color >> shift) & 0xff) * factor));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** Placeholder furni: an extruded box whose top face covers the footprint and whose two visible
 *  sides are `stackHeights[state]` height units tall, in three shades of the def's colour. */
function draw(g: Graphics, def: FurniDef, item: FurniItem): void {
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

  g.clear();
  g.poly([e.sx, e.sy, s.sx, s.sy, sb.sx, sb.sy, eb.sx, eb.sy]).fill(shade(def.color, RIGHT));
  g.poly([s.sx, s.sy, w.sx, w.sy, wb.sx, wb.sy, sb.sx, sb.sy]).fill(shade(def.color, LEFT));
  g.poly([n.sx, n.sy, e.sx, e.sy, s.sx, s.sy, w.sx, w.sy])
    .fill(shade(def.color, TOP))
    .stroke({ width: 1, color: 0x000000, alpha: 0.3 });
}

/** Every placed item in the room. `apply` covers both `furni_placed` (new id creates, known id
 *  updates) and `furni_moved` — the same redraw either way. */
export class FurniLayer {
  private world: Container;
  private defs: ReadonlyMap<string, FurniDef>;
  private sprites = new Map<number, Graphics>();

  constructor(world: Container, defs: ReadonlyMap<string, FurniDef>) {
    this.world = world;
    this.defs = defs;
  }

  apply(item: FurniItem): void {
    const def = this.defs.get(item.defId);
    if (!def) {
      console.warn(`furni ${item.id}: unknown def ${item.defId}`);
      return;
    }
    let sprite = this.sprites.get(item.id);
    if (!sprite) {
      sprite = new Graphics();
      sprite.eventMode = "none";
      this.sprites.set(item.id, sprite);
      this.world.addChild(sprite);
    }
    draw(sprite, def, item);
    sprite.zIndex = depthKey({
      kind: def.canWalk ? "floor_furni" : "furni",
      x: item.x,
      y: item.y,
      z: item.z,
    });
  }

  remove(id: number): void {
    const sprite = this.sprites.get(id);
    if (!sprite) return;
    sprite.destroy();
    this.sprites.delete(id);
  }
}
