import { Container, Graphics, Text } from "pixi.js";
import { DIR_STEPS, worldToScreen } from "@grand/shared";
import type { AvatarState, ServerMsg } from "@grand/shared";
import { SCALE } from "./room.ts";
import { LAYER } from "./sort.ts";
import type { DepthIndex } from "./sort.ts";
import { dirFromStep, lerpScreen, stepAt } from "./walk.ts";

type WalkMsg = Extract<ServerMsg, { t: "walk" }>;
interface Step { x: number; y: number; z: number }

const BODY_W = 24;
const BODY_H = 48;
const BODY_Z = BODY_H / (SCALE / 2);   // body height in world units, for occlusion
const PALETTE = [0xe05c5c, 0xe0a55c, 0xd7e05c, 0x6ee05c, 0x5ce0c8, 0x5c9be0, 0xa15ce0, 0xe05cb4];

function colorOf(username: string): number {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  return PALETTE[hash % PALETTE.length] ?? PALETTE[0] ?? 0xffffff;
}

/** Placeholder avatar: a coloured slab with a name label and a facing pip. All walk timing is
 *  the pure math in walk.ts — this only draws where that math says. */
export class AvatarSprite {
  readonly id: number;
  readonly username: string;
  readonly view: Container;
  private depth: DepthIndex;
  private pip: Graphics;
  private at: Step;
  private dir: number;
  private walking: { from: Step; path: Step[]; msPerTile: number; startedAt: number } | null = null;

  constructor(state: AvatarState, depth: DepthIndex) {
    this.id = state.id;
    this.username = state.username;
    this.depth = depth;
    this.at = { x: state.x, y: state.y, z: state.z };
    this.dir = state.dir;

    this.view = new Container();
    this.view.eventMode = "none";

    // Staff NPCs are visibly staff: navy uniform, gold trim, badged name tag. Never player colors.
    const staff = state.staff === true;
    const body = new Graphics();
    body
      .roundRect(-BODY_W / 2, -BODY_H, BODY_W, BODY_H, 6)
      .fill(staff ? 0x35406b : colorOf(state.username))
      .stroke(staff ? { width: 2, color: 0xd4af37, alpha: 0.9 } : { width: 2, color: 0x000000, alpha: 0.45 });
    this.view.addChild(body);

    this.pip = new Graphics();
    this.pip.circle(0, 0, 3).fill(0xffffff).stroke({ width: 1, color: 0x000000, alpha: 0.5 });
    this.view.addChild(this.pip);

    const label = new Text({
      text: staff ? `★ ${state.username} — STAFF` : state.username,
      style: {
        fill: staff ? 0xf5d76e : 0xffffff,
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    label.anchor.set(0.5, 1);
    label.y = -BODY_H - 4;
    this.view.addChild(label);

    this.place();
  }

  tile(): Step {
    return { ...this.at };
  }

  /** Local screen point of the avatar's head, for anchoring chat bubbles. */
  head(): { sx: number; sy: number } {
    return { sx: this.view.x, sy: this.view.y - BODY_H - 18 };
  }

  walk(msg: WalkMsg, startedAtLocal: number): void {
    if (msg.path.length === 0) {
      this.walking = null;
      this.at = { ...msg.from };
      this.place();
      return;
    }
    this.walking = {
      from: { ...msg.from },
      path: msg.path.map((s) => ({ ...s })),
      msPerTile: msg.msPerTile,
      startedAt: startedAtLocal,
    };
  }

  update(now: number): void {
    const walk = this.walking;
    if (!walk) return;

    const { index, t } = stepAt(walk.startedAt, walk.msPerTile, now);
    const last = walk.path[walk.path.length - 1];
    if (index >= walk.path.length) {
      this.walking = null;
      if (last) this.at = { ...last };
      this.place();
      return;
    }
    const to = walk.path[index];
    const from = index === 0 ? walk.from : walk.path[index - 1];
    if (!to || !from) return;

    this.face(to.x - from.x, to.y - from.y);
    // Depth follows whole tiles, so it is restacked on the step, not on every frame of the slide.
    const stepped = to.x !== this.at.x || to.y !== this.at.y || to.z !== this.at.z;
    this.at = { ...to };
    const point = lerpScreen(
      worldToScreen(from.x, from.y, from.z, SCALE),
      worldToScreen(to.x, to.y, to.z, SCALE),
      t,
    );
    this.view.x = point.sx;
    this.view.y = point.sy;
    if (stepped) this.placeDepth();
  }

  destroy(): void {
    this.depth.delete(`avatar:${this.id}`);
    this.view.destroy({ children: true });
  }

  private face(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.dir = dirFromStep(dx, dy);
    this.placePip();
  }

  private place(): void {
    const point = worldToScreen(this.at.x, this.at.y, this.at.z, SCALE);
    this.view.x = point.sx;
    this.view.y = point.sy;
    this.placeDepth();
    this.placePip();
  }

  private placeDepth(): void {
    this.depth.set(
      `avatar:${this.id}`,
      {
        x0: this.at.x, y0: this.at.y, z0: this.at.z,
        x1: this.at.x + 1, y1: this.at.y + 1, z1: this.at.z + BODY_Z,
        layer: LAYER.avatar,
      },
      this.view,
    );
  }

  private placePip(): void {
    const step = DIR_STEPS[this.dir] ?? DIR_STEPS[0];
    if (!step) return;
    const offset = worldToScreen(step.dx * 0.4, step.dy * 0.4, 0, SCALE);
    this.pip.x = offset.sx;
    this.pip.y = -BODY_H + 10 + offset.sy;
  }
}
