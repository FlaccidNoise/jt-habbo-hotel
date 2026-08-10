import { Container, Graphics, Sprite, Text } from "pixi.js";
import { parseFigure, resolveLayers, worldToScreen } from "@grand/shared";
import type { AvatarState, Figure, Posture, ServerMsg } from "@grand/shared";
import { wisps } from "./effects.ts";
import type { Wisp } from "./effects.ts";
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

// #326. Washing borrows the wave's two frames at twice the rate — scrubbing, not greeting.
const WASH_MS = 2500;
const WASH_FRAME_MS = 150;
const BUBBLES = 6;
const SIP_MS = 600;
const SIP_RISE = 14;     // px the drink lifts towards the mouth at the top of the swing
const SIP_INSET = 0.45;  // and how far of the way in towards the body it comes with it

// #347. A book is read at waist height, and it never swings up — the sip is a drink gesture.
const BOOK_DROP = 6;

/** Off a fresh coffee (#331). It rises further and swells as it goes, where #347 shipped three
 *  same-size dots at half alpha — at an 8px cup that read as specks rather than as steam. */
const STEAM: Wisp = {
  count: 3, ms: 1400, from: -9, rise: 15, drift: 2.5, size: 1, color: 0xe8e8e8, alpha: 0.75,
};

/** Facings that show the avatar's back, so the body is between the camera and what it holds. Read
 *  off the baked parts, not off the compass: the camera sits to the south-east, so dir 3 is the
 *  full-face view and dir 7 the full-back one. These are exactly the three facings where the
 *  chest-front pendant part draws no pixels at all. */
const BACK_DIRS: ReadonlySet<number> = new Set([0, 6, 7]);

/** Where the held item sits, per facing. Read off the baked figure by eye: chest height, on the
 *  screen side the body is turned towards, so it never lands in the middle of the torso. The three
 *  back facings sit further out than the rest — the item is behind the body there, so it has to
 *  clear the silhouette edge (11px at dirs 0 and 6, 14px at dir 7) or it is not seen at all. */
const HAND: ReadonlyArray<{ x: number; y: number }> = [
  { x: 13, y: -40 }, { x: 9, y: -38 }, { x: 9, y: -36 }, { x: 7, y: -35 },
  { x: -7, y: -35 }, { x: -9, y: -36 }, { x: -13, y: -38 }, { x: -16, y: -40 },
];

/** A cola can at the 80px figure scale: body, lid, and a highlight down the near edge. */
function drinkCan(): Graphics {
  return new Graphics()
    .rect(-3, -10, 6, 10)
    .fill(0xaa3333)
    .rect(-3, -10, 6, 2)
    .fill(0xd9d9d9)
    .rect(-3, -8, 1, 7)
    .fill(0xd06868);
}

/** An ivory cup with a handle nub and the coffee showing at the rim. The steam is drawn
 *  separately, in `drawSteam`, because it moves. */
function coffeeCup(): Graphics {
  return new Graphics()
    .rect(-3, -8, 6, 8)
    .fill(0xf2ede1)
    .rect(-3, -8, 6, 1)
    .fill(0x5a3a22)
    .rect(3, -6, 2, 3)
    .fill(0xf2ede1)
    .rect(-3, -7, 1, 6)
    .fill(0xd8d2c4);
}

/** A martini: at 8px across, the inverted-triangle bowl over a stem is the whole read, and the
 *  olive is what makes it a casino drink rather than a funnel. */
function cocktailGlass(): Graphics {
  return new Graphics()
    .poly([-4, -11, 4, -11, 0, -5])
    .fill(0xbfe4ef)
    .rect(-1, -5, 2, 4)
    .fill(0xdfe9ee)
    .rect(-3, -1, 6, 1)
    .fill(0xdfe9ee)
    .circle(1.5, -9.5, 1)
    .fill(0x8fbf4a);
}

/** An open book: two pages either side of a dark spine, with a ruled line on each so the pages
 *  do not read as one blank slab. */
function openBook(): Graphics {
  return new Graphics()
    .rect(-6, -6, 5, 6)
    .fill(0xf2ede1)
    .rect(1, -6, 5, 6)
    .fill(0xf2ede1)
    .rect(-1, -7, 2, 7)
    .fill(0x5c3a2e)
    .rect(-5, -4, 3, 1)
    .fill(0xd8d2c4)
    .rect(2, -4, 3, 1)
    .fill(0xd8d2c4);
}

/** What a hand item looks like (#347). An id with no drawing of its own gets the can: every one
 *  the server vends is a drink but one, and a can in the hand beats an empty fist. */
function handSprite(item: string): Graphics {
  switch (item) {
    case "drink_coffee": return coffeeCup();
    case "drink_cocktail": return cocktailGlass();
    case "book": return openBook();
    default: return drinkCan();
  }
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
  private waveFrameMs = WAVE_FRAME_MS;
  private washUntil = 0;
  private bubbles: Graphics | null = null;
  private held: Graphics | null = null;
  private heldItem: string | null = null;
  private steam: Graphics | null = null;
  /** Called when the avatar lands on a new tile (#347), so the room can see who it is beside. */
  onStep: (() => void) | null = null;

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
    this.applyZoom();
    this.view.addChild(this.label);

    this.redraw();
    this.place();
    this.setHand(state.hand ?? null);
  }

  /** Names are UI, not room art: counter-scaled so the magnified world still leaves them at 12px.
   *  The player can change the zoom under a standing avatar, so it is re-applied, not set once. */
  applyZoom(): void {
    this.label.scale.set(1 / ZOOM);
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
    this.waveFrameMs = WAVE_FRAME_MS;
    this.redraw();
  }

  /** Scrubbing at the fountain (#326): the two wave frames at twice the rate, with droplets. */
  washing(now: number): void {
    this.washUntil = now + WASH_MS;
    this.wavingUntil = this.washUntil;
    this.waveFrameMs = WASH_FRAME_MS;
    this.redraw();
  }

  /** Swapping one item for another rebuilds the sprite: the drawing is keyed on the id, so a
   *  coffee handed to someone already holding a can has to become a cup. */
  setHand(hand: { item: string; until: number } | null): void {
    const item = hand?.item ?? null;
    if (item === this.heldItem) return;
    this.steam?.destroy();
    this.steam = null;
    this.held?.destroy();
    this.held = null;
    this.heldItem = item;
    if (item === null) return;
    this.held = this.view.addChild(handSprite(item));
    // A child of the cup, so it rides the sip swing without being placed twice.
    if (item === "drink_coffee") this.steam = this.held.addChild(new Graphics());
  }

  holding(): boolean {
    return this.heldItem !== null;
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

  /** Local screen point of the held item, for the wish arc and the cheers clink (#347). */
  hand(): { sx: number; sy: number } {
    const anchor = HAND[this.dir] ?? HAND[3]!;
    return { sx: this.view.x + anchor.x, sy: this.view.y + anchor.y };
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
    // Math.floor, not |0: now is epoch ms, and epoch/150 overflows a 32-bit int — the wrapped
    // value can be negative, whose %2 is -1, which is the not-animating sentinel.
    const wave = this.wavingUntil > now ? Math.floor(now / this.waveFrameMs) % 2 : -1;
    if (wave !== this.waveFrame) {
      this.waveFrame = wave;
      this.redraw();
    }
    if (this.held) this.placeHeld(now);
    if (this.steam) this.drawSteam(now);
    this.drawBubbles(now);

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
    if (stepped) {
      this.placeDepth();
      this.onStep?.();
    }
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

  /** The item rides the hand, and every 8-12s a drink swings up to the mouth and back. The period
   *  is derived from the account id so a room full of drinkers does not sip in unison. A book
   *  never swings: it is held lower and still, because reading is not drinking. */
  private placeHeld(now: number): void {
    const hand = HAND[this.dir] ?? HAND[3]!;
    const book = this.heldItem === "book";
    const period = 8000 + (this.id % 5) * 1000;
    const phase = (now + this.id * 2137) % period;
    const lift = book || phase >= SIP_MS ? 0 : Math.sin((phase / SIP_MS) * Math.PI);
    this.held!.x = hand.x * (1 - lift * SIP_INSET);
    this.held!.y = hand.y + (book ? BOOK_DROP : 0) - lift * SIP_RISE;

    // Facing away, the item is on the far side of the body from the camera, so the body has to
    // occlude it (#331). Derived from the display list rather than remembered, because the facing
    // changes mid-walk and a cached flag would go stale against a rebuilt figure.
    const body = this.view.getChildIndex(this.sprite);
    const behind = this.view.getChildIndex(this.held!) < body;
    const wanted = BACK_DIRS.has(this.dir);
    if (behind !== wanted) this.view.setChildIndex(this.held!, wanted ? body : body + 1);
  }

  /** Curls off the coffee, in the cup's own coordinates — the cup is the parent, so the steam
   *  follows it through the sip rather than hanging over where the cup used to be. */
  private drawSteam(now: number): void {
    wisps(this.steam!.clear(), now, STEAM);
  }

  private drawBubbles(now: number): void {
    if (this.washUntil <= now) {
      this.bubbles?.destroy();
      this.bubbles = null;
      return;
    }
    if (!this.bubbles) this.bubbles = this.view.addChild(new Graphics());
    const g = this.bubbles.clear();
    for (let i = 0; i < BUBBLES; i++) {
      const t = (now / 900 + i / BUBBLES) % 1;
      const x = (i % 2 === 0 ? 1 : -1) * (5 + (i % 3) * 3);
      g.circle(x, -34 - t * 26, 1.5 + (i % 2)).fill({ color: 0xcfe8f5, alpha: 0.75 * (1 - t) });
    }
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
