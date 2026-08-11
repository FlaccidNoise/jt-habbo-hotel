import { Container, Graphics } from "pixi.js";
import { WHEEL_LAYOUT } from "@grand/shared";

/** Above every sorted sprite. An effect is a flourish over the room rather than an object in it,
 *  so it stays out of the painter sort — there is nothing for it to hide behind. */
const EFFECT_Z = 1_000_000;

const SPLASH_MS = 900;
const SPLASH_RINGS = 3;
const SPLASH_STAGGER = 0.22;   // of the life, between one ring leaving the centre and the next
const SPLASH_RADIUS = 24;
const SPLASH_FLATTEN = 0.5;    // the rings lie on the water, so they take the floor's foreshortening
const SPLASH_COLOR = 0xcfe8f5;

const COIN_MS = 400;
const COIN_ARC = 34;           // px the Star rises above the straight line to the water
const COIN_RADIUS = 2;
const COIN_COLOR = 0xf5d76e;

const CLINK_MS = 600;
const CLINK_DOTS = 5;
const CLINK_SPREAD = 15;
const CLINK_ARM = 3;           // half-length of each sparkle's arms
const CLINK_COLOR = 0xfff3c4;

/** How long the wheel turns before it settles (#429), and how long the landing beat holds after
 *  that. The bettor's panel and the room's announcement both wait out the spin, so this is the
 *  number the whole reveal is timed against. */
export const WHEEL_SPIN_MS = 3400;
const WHEEL_LAND_MS = 1300;
const WHEEL_TURNS = 4;         // whole turns before the marker reaches the drawn slot
const WHEEL_TRAIL = 3;         // slots of dimming marker left behind the leading one
/** Whole cycles of the wheel face's own pattern over one spin (#430). Its four state frames cover
 *  one turn of the eight-pin ring, so the sprite repeats every four states and this is how many
 *  times it does that before it settles — the pins blur at the start and step visibly at the end,
 *  which is the read the marker's ease-out gives the light. */
const WHEEL_FACE_TURNS = 9;
/** The face of grand_wheel.png, in sprite pixels off the item's own origin: the disc is a tilted
 *  ellipse, and the two facing pairs mirror it. Measured off the shipped sheet, which is what the
 *  marker has to sit on — the sheet's state frames turn the pins and leave the rim where it is,
 *  so these hold for all four. */
const FACE = { dx: 10, dy: -63, major: 28, minor: 19, tilt: (64 * Math.PI) / 180 };
const WHEEL_POOL = 30;         // radius of the light the lit slot throws over the sprite
const WHEEL_POOL_RINGS = 6;
const WHEEL_BURST = 46;        // how far a winning burst's rings travel off the face
const WIN_COLOR = 0xf5d76e;
const LOSS_COLOR = 0x6c7385;

/** The five colours a slot can be, keyed by the segment ids in shared/wheel.ts. Taken from the
 *  catalog defs that already wear them (crimson chairs, baize stools, plum beds) so the wheel, the
 *  furniture and the bet buttons are one palette. */
export const SEGMENT_COLOR: ReadonlyMap<string, number> = new Map([
  ["crimson", 0xaa3333],
  ["fern", 0x2e8b57],
  ["plum", 0x7a3e9d],
  ["gold", 0xc9b27a],
  ["grand", 0xf5d76e],
]);

/** The spin's curve: a cubic ease-out, arriving at rest. The marker and the wheel face both walk
 *  on it, which is what makes them slow together rather than merely at the same time. */
const ease = (t: number): number => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

/** Which slot the marker is on `t` of the way through the spin. A whole number of slots, so t = 1
 *  lands on `target` exactly — the animation cannot disagree with the slot the server drew,
 *  however the curve is retuned. */
export function spinSlot(t: number, target: number): number {
  const steps = WHEEL_TURNS * WHEEL_LAYOUT.length + target;
  return Math.floor(steps * ease(t)) % WHEEL_LAYOUT.length;
}

/** Which of the wheel's own state frames the face shows `t` of the way through the spin (#430).
 *  A whole number of cycles of `states`, so t = 1 comes back to state 0 — the face is at rest in
 *  the frame the item sits in when nothing is spinning, and the settle costs no extra step. */
export function spinFrame(t: number, states: number): number {
  return Math.floor(WHEEL_FACE_TURNS * states * ease(t)) % states;
}

/** Where slot `n` sits on the face, in the effect's own coordinates. Slot 0 is the top of the disc,
 *  under the stand's pointer — which end of the major axis that is depends on which way the face
 *  is tilted, hence the half-turn on one of them. */
function slotPoint(n: number, mirror: number): { x: number; y: number } {
  const a = (n / WHEEL_LAYOUT.length) * Math.PI * 2 + (mirror > 0 ? Math.PI : 0);
  const tilt = FACE.tilt * mirror;
  return {
    x: Math.cos(a) * FACE.major * Math.cos(tilt) - Math.sin(a) * FACE.minor * Math.sin(tilt),
    y: Math.cos(a) * FACE.major * Math.sin(tilt) + Math.sin(a) * FACE.minor * Math.cos(tilt),
  };
}

/** A rising column of vapour, tuned per emitter (#331). */
export interface Wisp {
  count: number;
  ms: number;
  from: number;    // y the wisps leave, in the caller's own coordinates
  rise: number;
  drift: number;
  size: number;
  color: number;
  alpha: number;   // at the source, thinning to nothing at the top of the rise
}

/** Steam off a cup or smoke off a hearth: `count` wisps sharing one loop, each swelling as it
 *  climbs and thinning as it swells. Densest where it leaves the source and gone by the top, which
 *  is the way round that keeps the column attached to what is making it — fading in as well would
 *  leave a dead gap between the coffee and its steam. Odd wisps sway the opposite way, so the
 *  column braids instead of retracing one path. Drawn in the caller's coordinates, so the cup can
 *  carry its steam through the sip swing while the hearth stands still. */
export function wisps(g: Graphics, now: number, w: Wisp): void {
  for (let i = 0; i < w.count; i++) {
    const t = (now / w.ms + i / w.count) % 1;
    const sway = Math.sin(t * Math.PI * 2) * w.drift * (i % 2 === 0 ? 1 : -1);
    g.circle(sway, w.from - t * w.rise, w.size * (1 + t))
      .fill({ color: w.color, alpha: w.alpha * (1 - t) });
  }
}

interface Point { sx: number; sy: number }
interface Live {
  view: Graphics;
  from: number;
  ms: number;
  draw: (g: Graphics, t: number) => void;
}

/** The one-shot flourishes (#347), in world space. Each runs on its own Graphics and is destroyed
 *  the frame it finishes, so nothing accumulates; the room's teardown takes the whole layer with
 *  it, the same way it takes the furni layer. */
export class Effects {
  private layer = new Container();
  private live: Live[] = [];

  constructor(world: Container) {
    this.layer.eventMode = "none";
    this.layer.zIndex = EFFECT_Z;
    world.addChild(this.layer);
  }

  /** The Star's arc into the water and the splash it makes landing. With no thrower — the client
   *  does not know which fountain took the wish — it is the splash on its own. */
  wish(from: Point | null, to: Point, now: number): void {
    if (from) this.coin(from, to, now);
    this.splash(to, from ? now + COIN_MS : now);
  }

  /** Two raised glasses. Additive, so it reads as a glint off the rims rather than as paint. */
  clink(sx: number, sy: number, now: number): void {
    const view = this.add({ sx, sy }, now, CLINK_MS, (g, t) => {
      const spread = CLINK_SPREAD * t;
      const paint = { color: CLINK_COLOR, alpha: 1 - t };
      for (let i = 0; i < CLINK_DOTS; i++) {
        const angle = (i / CLINK_DOTS) * Math.PI * 2;
        const x = Math.cos(angle) * spread;
        const y = Math.sin(angle) * spread;
        g.rect(x - CLINK_ARM, y - 0.5, CLINK_ARM * 2, 1).fill(paint);
        g.rect(x - 0.5, y - CLINK_ARM, 1, CLINK_ARM * 2).fill(paint);
      }
    });
    view.blendMode = "add";
  }

  /** The Grand Wheel turning (#429), for everyone in the room. `at` is the item's own origin in
   *  screen space and `rotated` says which way its face is tilted; the marker steps round the 24
   *  slots of WHEEL_LAYOUT, fast then slowing, over a pool of the colour it is passing, and stops
   *  on `slot`. Then the beat: a gold burst off the face for a win, one grey pulse for a loss —
   *  which is the whole of what a spectator sees of a losing spin. */
  wheelSpin(at: Point, rotated: boolean, slot: number, win: boolean, now: number): void {
    const total = WHEEL_SPIN_MS + WHEEL_LAND_MS;
    const mirror = rotated ? -1 : 1;
    const face = { sx: at.sx + FACE.dx * mirror, sy: at.sy + FACE.dy };
    const view = this.add(face, now, total, (g, t) => {
      const spin = Math.min(1, (t * total) / WHEEL_SPIN_MS);
      const land = Math.max(0, (t * total - WHEEL_SPIN_MS) / WHEEL_LAND_MS);
      const lit = spinSlot(spin, slot);
      const color = SEGMENT_COLOR.get(WHEEL_LAYOUT[lit] ?? "") ?? WIN_COLOR;
      // The pool holds while the reveal is read, then goes out with the effect.
      const hold = land < 0.5 ? 1 : 2 * (1 - land);
      for (let ring = WHEEL_POOL_RINGS; ring > 0; ring--) {
        const k = ring / WHEEL_POOL_RINGS;
        g.circle(0, 0, WHEEL_POOL * k).fill({ color, alpha: (0.03 + 0.05 * (1 - k)) * hold });
      }
      // The face lights up only while it turns: the 24 slots in their own colours, so the sweep is
      // visibly crossing Crimson after Crimson to reach the one Grand, and gone again at rest.
      for (let n = 0; n < WHEEL_LAYOUT.length; n++) {
        const p = slotPoint(n, mirror);
        const pip = SEGMENT_COLOR.get(WHEEL_LAYOUT[n] ?? "") ?? WIN_COLOR;
        g.circle(p.x, p.y, 1.5).fill({ color: pip, alpha: 0.5 * hold });
      }
      // The trail is what makes a 24-step walk read as a spin rather than as a blinking light.
      for (let back = WHEEL_TRAIL; back >= 0; back--) {
        const p = slotPoint(lit - back, mirror);
        const fade = (1 - back / (WHEEL_TRAIL + 1)) * hold;
        g.circle(p.x, p.y, back === 0 ? 3 : 2).fill({ color: WIN_COLOR, alpha: fade });
      }
      if (land <= 0) return;
      const p = slotPoint(slot, mirror);
      if (win) {
        for (let ring = 0; ring < 3; ring++) {
          const age = land - ring * 0.18;
          if (age <= 0) continue;
          g.circle(p.x, p.y, WHEEL_BURST * age)
            .stroke({ width: 1.5, color: WIN_COLOR, alpha: 0.8 * (1 - age) });
        }
        return;
      }
      g.circle(p.x, p.y, 6 + 10 * land).stroke({ width: 1, color: LOSS_COLOR, alpha: 0.5 * (1 - land) });
    });
    view.blendMode = "add";
  }

  update(now: number): void {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const effect = this.live[i]!;
      const t = (now - effect.from) / effect.ms;
      if (t < 0) continue;   // queued behind the coin that has to land first
      if (t >= 1) {
        effect.view.destroy();
        this.live.splice(i, 1);
        continue;
      }
      effect.draw(effect.view.clear(), t);
    }
  }

  /** Rings leaving the point of entry, each starting after the one before it. */
  private splash(at: Point, from: number): void {
    this.add(at, from, SPLASH_MS, (g, t) => {
      for (let ring = 0; ring < SPLASH_RINGS; ring++) {
        const age = t - ring * SPLASH_STAGGER;
        if (age <= 0) continue;
        const rx = SPLASH_RADIUS * age;
        g.ellipse(0, 0, rx, rx * SPLASH_FLATTEN)
          .stroke({ width: 1.5, color: SPLASH_COLOR, alpha: 0.7 * (1 - age) });
      }
    });
  }

  private coin(from: Point, to: Point, now: number): void {
    const dx = to.sx - from.sx;
    const dy = to.sy - from.sy;
    this.add(from, now, COIN_MS, (g, t) => {
      g.circle(dx * t, dy * t - COIN_ARC * Math.sin(Math.PI * t), COIN_RADIUS).fill(COIN_COLOR);
    });
  }

  private add(at: Point, from: number, ms: number, draw: Live["draw"]): Graphics {
    const view = new Graphics();
    view.x = at.sx;
    view.y = at.sy;
    this.layer.addChild(view);
    this.live.push({ view, from, ms, draw });
    return view;
  }
}
