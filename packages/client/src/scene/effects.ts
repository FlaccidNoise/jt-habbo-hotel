import { Container, Graphics } from "pixi.js";

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
