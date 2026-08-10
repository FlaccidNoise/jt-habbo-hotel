import { Container, Graphics, Sprite, Text } from "pixi.js";
import { parseFigure, resolveLayers, worldToScreen } from "@grand/shared";
import type { AvatarState, Figure, Posture, ServerMsg } from "@grand/shared";
import type { FigureBaker } from "./figure.ts";
import { SCALE, ZOOM } from "./room.ts";
import { LAYER } from "./sort.ts";
import type { DepthIndex } from "./sort.ts";
import { dirFromStep, lerpScreen, stepAt } from "./walk.ts";

type WalkMsg = Extract<ServerMsg, { t: "walk" }>;
interface Step { x: number; y: number; z: number }

/** A full 4-frame cycle per tile — two footfalls at MS_PER_TILE, which reads as a brisk walk. */
const WALK_FRAMES = 4;
const WAVE_MS = 1400;
const WAVE_FRAME_MS = 350;
const ZU = SCALE / 2;   // pixels per world height unit, for the occlusion box

/** Sprites are nearest-sampled and the world is drawn at ZOOM, so a figure standing at a fraction
 *  of a world pixel lands between device pixels: the sampler then gives some rows of the sheet two
 *  screen pixels and their neighbours one, and the split moves as the figure slides. The figure
 *  boils rather than walks, at any frame rate. Snapping the lerp to the device grid — the camera
 *  is already rounded, room.ts `follow` — is what makes a walk read as smooth. */
function snap(n: number): number {
  return Math.round(n * ZOOM) / ZOOM;
}

/** The figure has no sprite: the bundles are missing. Draw something unmistakably broken rather
 *  than a plausible box — a silent fallback hides a bad deploy behind an avatar that looks fine. */
function missingMarker(): Graphics {
  return new Graphics()
    .rect(-12, -80, 24, 80)
    .fill({ color: 0xff00ff, alpha: 0.8 })
    .stroke({ width: 2, color: 0x000000 });
}

/** A layered figure (#127). Walk timing stays the pure math in walk.ts — this only chooses which
 *  baked cell to show and where to put it. */
export class AvatarSprite {
  readonly id: number;
  readonly username: string;
  readonly view: Container;
  private depth: DepthIndex;
  private sprite: Sprite;
  private marker: Graphics | null = null;
  private label: Text;
  private figure: Figure | null;
  private at: Step;
  private dir: number;
  private posture: Posture;
  private walking: { from: Step; path: Step[]; msPerTile: number; startedAt: number } | null = null;
  private walkFrame = 0;
  private wavingUntil = 0;
  private waveFrame = 0;
  /** The pose the sprite is already showing — see `redraw`. */
  private shown = "";

  constructor(state: AvatarState, depth: DepthIndex, private baker: FigureBaker | null) {
    this.id = state.id;
    this.username = state.username;
    this.depth = depth;
    this.at = { x: state.x, y: state.y, z: state.z };
    this.dir = state.dir;
    this.posture = state.posture;
    this.figure = this.read(state.figure);

    this.view = new Container();
    this.view.eventMode = "none";

    // Grounding shadow at the anchor — the tile-centre ground point standing, the seat surface
    // sitting. Drawn first so every figure pixel lands over it.
    this.view.addChild(new Graphics().ellipse(0, 0, 14, 7).fill({ color: 0x000000, alpha: 0.28 }));

    this.sprite = new Sprite();
    this.view.addChild(this.sprite);

    const staff = state.staff === true;
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
    // Names are UI, not room art: counter-scaled so the zoomed world leaves them at 12px.
    this.label.scale.set(1 / ZOOM);
    this.view.addChild(this.label);

    this.redraw();
    this.place();
  }

  /** Server-authoritative pose. Sitting also carries the seat's height and facing. */
  setPosture(posture: Posture, at: Step, dir: number): void {
    this.walking = null;
    this.posture = posture;
    this.at = { ...at };
    this.dir = dir;
    this.redraw();
    this.place();
  }

  setFigure(figure: string): void {
    this.figure = this.read(figure);
    this.shown = "";   // same pose, different outfit — a different baked cell
    this.redraw();
  }

  wave(now: number): void {
    this.wavingUntil = now + WAVE_MS;
    this.redraw();
  }

  tile(): Step {
    return { ...this.at };
  }

  pose(): Posture {
    return this.posture;
  }

  /** Chat bubble colour, from the shirt if one is worn and the skin otherwise. Derived from the
   *  outfit per GAME.md, so it changes when the player changes clothes. */
  tint(): number | undefined {
    if (!this.figure || !this.baker) return undefined;
    const layers = resolveLayers(this.figure);
    const pick = layers.find((l) => l.type === "ch") ?? layers.find((l) => l.type === "hd");
    const ramp = pick?.colors[0];
    return ramp === undefined ? undefined : this.baker.rampColor(ramp);
  }

  /** Local screen point of the avatar's head, for anchoring chat bubbles. */
  head(): { sx: number; sy: number } {
    return { sx: this.view.x, sy: this.view.y - this.crown() - 8 };
  }

  walk(msg: WalkMsg, startedAtLocal: number): void {
    // A walk always means standing: the server stands you up before it moves you.
    if (this.posture !== "stand") {
      this.posture = "stand";
      this.redraw();
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
    const wave = this.wavingUntil > now ? ((now / WAVE_FRAME_MS) | 0) % 2 : -1;
    if (wave !== this.waveFrame) {
      this.waveFrame = wave;
      this.redraw();
    }

    const walk = this.walking;
    if (!walk) return;

    const { index, t } = stepAt(walk.startedAt, walk.msPerTile, now);
    const last = walk.path[walk.path.length - 1];
    if (index >= walk.path.length) {
      this.walking = null;
      if (last) this.at = { ...last };
      this.walkFrame = 0;
      this.redraw();
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
    this.walkFrame = Math.min(WALK_FRAMES - 1, (t * WALK_FRAMES) | 0);
    this.redraw();
    const point = lerpScreen(
      worldToScreen(from.x, from.y, from.z, SCALE),
      worldToScreen(to.x, to.y, to.z, SCALE),
      t,
    );
    this.view.x = snap(point.sx);
    this.view.y = snap(point.sy);
    if (stepped) this.placeDepth();
  }

  destroy(): void {
    this.depth.delete(`avatar:${this.id}`);
    this.view.destroy({ children: true });
  }

  private read(figure: string): Figure | null {
    try {
      return parseFigure(figure);
    } catch (e) {
      console.error(`avatar ${this.username}: bad figure string`, e);
      return null;
    }
  }

  /** Which sheet row this avatar is showing right now. */
  private frame(): string {
    if (this.wavingUntil > 0 && this.waveFrame >= 0) return `wave${this.waveFrame}`;
    if (this.posture === "sit") return "sit";
    if (this.walking) return `walk${this.walkFrame}`;
    return "stand";
  }

  private crown(): number {
    return this.baker?.crown(this.frame()) ?? 80;
  }

  /** `update` runs this every frame of a walk, but the sheet row only changes WALK_FRAMES times a
   *  tile — eight times a second. Reaching the baked cell costs a `resolveLayers` and a key build
   *  per call, so an ungated redraw spends most of its work proving the texture did not change.
   *  `shown` is the pose already on screen; `setFigure` clears it, because the same pose on a new
   *  outfit is a different cell. */
  private redraw(): void {
    const frame = this.frame();
    const key = `${frame}|${this.dir}`;
    if (key === this.shown) return;
    this.shown = key;

    const texture = this.figure && this.baker ? this.baker.texture(this.figure, frame, this.dir) : null;
    if (texture) {
      if (this.marker) {
        this.marker.destroy();
        this.marker = null;
      }
      this.sprite.texture = texture;
      const offset = this.baker!.anchor(frame);
      this.sprite.x = offset.x;
      this.sprite.y = offset.y;
      this.sprite.visible = true;
    } else {
      this.sprite.visible = false;
      if (!this.marker) {
        this.marker = missingMarker();
        this.view.addChildAt(this.marker, 0);
      }
    }
    this.label.y = -this.crown() - 4;
  }

  private face(dx: number, dy: number): void {
    if (dx === 0 && dy === 0) return;
    this.dir = dirFromStep(dx, dy);
  }

  private place(): void {
    const point = worldToScreen(this.at.x, this.at.y, this.at.z, SCALE);
    this.view.x = snap(point.sx);
    this.view.y = snap(point.sy);
    this.placeDepth();
  }

  /** A sitter shares its tile with the seat and neither is west, north, or under the other, so
   *  the seated layer is what puts the body in front of the chair it sits on — and what the
   *  forced `seat_front` edge keys off, to put the seat's near half back over the body. */
  private placeDepth(): void {
    const sitting = this.posture === "sit";
    this.depth.set(
      `avatar:${this.id}`,
      {
        x0: this.at.x, y0: this.at.y, z0: this.at.z,
        x1: this.at.x + 1, y1: this.at.y + 1, z1: this.at.z + this.crown() / ZU,
        layer: sitting ? LAYER.seated : LAYER.avatar,
      },
      this.view,
    );
  }
}
