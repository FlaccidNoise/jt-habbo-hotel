import { Container, Graphics, Text } from "pixi.js";
import { DIR_STEPS, worldToScreen } from "@grand/shared";
import type { AvatarState, Posture, ServerMsg } from "@grand/shared";
import { SCALE } from "./room.ts";
import { depthKey } from "./sort.ts";
import { dirFromStep, lerpScreen, stepAt } from "./walk.ts";

type WalkMsg = Extract<ServerMsg, { t: "walk" }>;
interface Step { x: number; y: number; z: number }

const BODY_W = 24;
const BODY_H = 48;
/** Sitting crops the slab to roughly thigh-to-head and drops it onto the seat surface, so a
 *  seated avatar reads as lower than a standing one even on a tall stool. */
const SIT_H = 32;
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
  private pip: Graphics;
  private body: Graphics;
  private label: Text;
  private fill: number;
  private stroke: { width: number; color: number; alpha: number };
  private at: Step;
  private dir: number;
  private posture: Posture;
  private walking: { from: Step; path: Step[]; msPerTile: number; startedAt: number } | null = null;

  constructor(state: AvatarState) {
    this.id = state.id;
    this.username = state.username;
    this.at = { x: state.x, y: state.y, z: state.z };
    this.dir = state.dir;
    this.posture = state.posture;

    this.view = new Container();
    this.view.eventMode = "none";

    // Staff NPCs are visibly staff: navy uniform, gold trim, badged name tag. Never player colors.
    const staff = state.staff === true;
    this.fill = staff ? 0x35406b : colorOf(state.username);
    this.stroke = staff
      ? { width: 2, color: 0xd4af37, alpha: 0.9 }
      : { width: 2, color: 0x000000, alpha: 0.45 };
    this.body = new Graphics();
    this.view.addChild(this.body);

    this.pip = new Graphics();
    this.pip.circle(0, 0, 3).fill(0xffffff).stroke({ width: 1, color: 0x000000, alpha: 0.5 });
    this.view.addChild(this.pip);

    this.label = new Text({
      text: staff ? `★ ${state.username} — STAFF` : state.username,
      style: {
        fill: staff ? 0xf5d76e : 0xffffff,
        fontFamily: "system-ui, sans-serif",
        fontSize: 12,
        stroke: { color: 0x000000, width: 3 },
      },
    });
    this.label.anchor.set(0.5, 1);
    this.view.addChild(this.label);

    this.drawBody();
    this.place();
  }

  /** Server-authoritative pose. Sitting also carries the seat's height and facing. */
  setPosture(posture: Posture, at: Step, dir: number): void {
    this.walking = null;
    this.posture = posture;
    this.at = { ...at };
    this.dir = dir;
    this.drawBody();
    this.place();
  }

  tile(): Step {
    return { ...this.at };
  }

  pose(): Posture {
    return this.posture;
  }

  /** Local screen point of the avatar's head, for anchoring chat bubbles. */
  head(): { sx: number; sy: number } {
    return { sx: this.view.x, sy: this.view.y - this.height() - 18 };
  }

  walk(msg: WalkMsg, startedAtLocal: number): void {
    // A walk always means standing: the server stands you up before it moves you.
    if (this.posture !== "stand") {
      this.posture = "stand";
      this.drawBody();
    }
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
    this.at = { ...to };
    const point = lerpScreen(
      worldToScreen(from.x, from.y, from.z, SCALE),
      worldToScreen(to.x, to.y, to.z, SCALE),
      t,
    );
    this.view.x = point.sx;
    this.view.y = point.sy;
    this.view.zIndex = this.depth();
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }

  private height(): number {
    return this.posture === "sit" ? SIT_H : BODY_H;
  }

  private depth(): number {
    const kind = this.posture === "sit" ? "seated" : "avatar";
    return depthKey({ kind, x: this.at.x, y: this.at.y, z: this.at.z });
  }

  private drawBody(): void {
    const h = this.height();
    this.body.clear();
    this.body
      .roundRect(-BODY_W / 2, -h, BODY_W, h, 6)
      .fill(this.fill)
      .stroke(this.stroke);
    this.label.y = -h - 4;
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
    this.view.zIndex = this.depth();
    this.placePip();
  }

  private placePip(): void {
    const step = DIR_STEPS[this.dir] ?? DIR_STEPS[0];
    if (!step) return;
    const offset = worldToScreen(step.dx * 0.4, step.dy * 0.4, 0, SCALE);
    this.pip.x = offset.sx;
    this.pip.y = -this.height() + 10 + offset.sy;
  }
}
