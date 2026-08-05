import { createHash } from "node:crypto";
import type { Box } from "./iso.ts";
import type { Prng } from "./prng.ts";
import type { Ramp } from "./style.ts";
import { rampByName } from "./style.ts";

export const PART_LIBRARY_VERSION = 1;

/** Slot variants build geometry in the dir-0 frame: footprint units [0..w]×[0..l], facing -y
 *  (the back of a chair sits on the +y edge). Rotation to the other three dirs is mechanical. */
export interface BuildCtx {
  prng: Prng;
  ramp: Ramp;
  w: number;
  l: number;
  h: number;   // stackHeights[0] — the collision height the silhouette must respect
}

type Variant = (ctx: BuildCtx) => Box[];

export interface ArchetypeSpec {
  archetype: string;
  slots: Record<string, Record<string, Variant>>;
}

const box = (
  ramp: Ramp,
  x0: number, y0: number, z0: number,
  x1: number, y1: number, z1: number,
): Box => ({ x0, y0, z0, x1, y1, z1, ramp });

/** Four corner posts, `t` thick, from the floor to `top`. */
function posts(ctx: BuildCtx, t: number, top: number): Box[] {
  const { ramp, w, l } = ctx;
  const inset = 0.09375;   // 3px
  const xs: Array<[number, number]> = [
    [inset, inset + t],
    [w - inset - t, w - inset],
  ];
  const ys: Array<[number, number]> = [
    [inset, inset + t],
    [l - inset - t, l - inset],
  ];
  return xs.flatMap(([x0, x1]) => ys.map(([y0, y1]) => box(ramp, x0, y0, 0, x1, y1, top)));
}

const CHAIR: ArchetypeSpec = {
  archetype: "chair",
  slots: {
    legs: {
      block: (ctx) => posts(ctx, 0.1875, 0.45),
      tapered: (ctx) => posts(ctx, 0.125, 0.45),
    },
    seat: {
      flat: (ctx) => [box(ctx.ramp, 0.0625, 0.0625, 0.45, 0.9375, 0.9375, 0.578125)],
      cushion: (ctx) => [box(ctx.ramp, 0.09375, 0.09375, 0.45, 0.90625, 0.90625, 0.65625)],
    },
    back: {
      solid: (ctx) => [box(ctx.ramp, 0.0625, 0.78125, 0.578125, 0.9375, 0.9375, ctx.h)],
      slats: (ctx) => {
        const rail = box(ctx.ramp, 0.0625, 0.78125, ctx.h - 0.15625, 0.9375, 0.9375, ctx.h);
        const slat = (x0: number): Box =>
          box(ctx.ramp, x0, 0.8125, 0.578125, x0 + 0.15625, 0.90625, ctx.h - 0.15625);
        return [slat(0.09375), slat(0.421875), slat(0.75), rail];
      },
    },
  },
};

const TABLE: ArchetypeSpec = {
  archetype: "table",
  slots: {
    legs: {
      block: (ctx) => posts(ctx, 0.1875, 0.84375),
      tapered: (ctx) => posts(ctx, 0.125, 0.84375),
    },
    top: {
      slab: (ctx) => [box(ctx.ramp, 0, 0, 0.84375, ctx.w, ctx.l, ctx.h)],
    },
  },
};

const SOFA: ArchetypeSpec = {
  archetype: "sofa",
  slots: {
    base: {
      slab: (ctx) => [box(ctx.ramp, 0, 0, 0, ctx.w, ctx.l, 0.34375)],
    },
    seat: {
      // Cushions stop at the backrest's near edge (y 0.75). Overlapping it leaves the two halves
      // of one seat on opposite sides of the back in any painter order — a visible seam.
      cushions: (ctx) => {
        const cushion = rampByName("sand");
        return [
          box(cushion, 0.25, 0.09375, 0.34375, 0.984375, 0.75, 0.5625),
          box(cushion, 1.015625, 0.09375, 0.34375, 1.75, 0.75, 0.5625),
        ];
      },
    },
    back: {
      solid: (ctx) => [box(ctx.ramp, 0.25, 0.75, 0.34375, 1.75, ctx.l, ctx.h)],
    },
    arms: {
      square: (ctx) => [
        box(ctx.ramp, 0, 0, 0.34375, 0.25, ctx.l, 0.8125),
        box(ctx.ramp, ctx.w - 0.25, 0, 0.34375, ctx.w, ctx.l, 0.8125),
      ],
    },
  },
};

const PLANT: ArchetypeSpec = {
  archetype: "plant",
  slots: {
    pot: {
      square: () => [box(rampByName("sand"), 0.28125, 0.28125, 0, 0.71875, 0.71875, 0.40625)],
      tapered: () => [
        box(rampByName("sand"), 0.3125, 0.3125, 0, 0.6875, 0.6875, 0.25),
        box(rampByName("sand"), 0.25, 0.25, 0.25, 0.75, 0.75, 0.40625),
      ],
    },
    foliage: {
      bush: (ctx) => {
        // Seeded cluster: quantized jitter keeps every vertex on the pixel grid.
        const blobs: Box[] = [box(ctx.ramp, 0.4375, 0.4375, 0.40625, 0.5625, 0.5625, 0.75)];
        for (let i = 0; i < 6; i++) {
          const cx = 0.21875 + ctx.prng.int(10) * 0.0625;
          const cy = 0.21875 + ctx.prng.int(10) * 0.0625;
          const z0 = 0.625 + ctx.prng.int(6) * 0.125;
          const s = 0.1875 + ctx.prng.int(3) * 0.0625;
          blobs.push(box(ctx.ramp, cx - s / 2, cy - s / 2, z0, cx + s / 2, cy + s / 2, z0 + s * 2));
        }
        return blobs;
      },
      palm: (ctx) => {
        const trunk = box(ctx.ramp, 0.4375, 0.4375, 0.40625, 0.5625, 0.5625, 1.25);
        const frond = (x0: number, y0: number, x1: number, y1: number): Box =>
          box(ctx.ramp, x0, y0, 1.25, x1, y1, 1.4375);
        return [
          trunk,
          frond(0.0625, 0.375, 0.9375, 0.625),
          frond(0.375, 0.0625, 0.625, 0.9375),
          frond(0.1875, 0.1875, 0.8125, 0.8125),
        ];
      },
    },
  },
};

const RUG: ArchetypeSpec = {
  archetype: "rug",
  slots: {
    // The curated pattern set for procedural classes (PIPELINES §2 stage 2) — no free seed space.
    field: {
      solid: (ctx) => [box(ctx.ramp, 0, 0, 0, ctx.w, ctx.l, ctx.h)],
      border: (ctx) => [
        box(ctx.ramp, 0, 0, 0, ctx.w, ctx.l, ctx.h),
        box(rampByName("sand"), 0.375, 0.375, 0, ctx.w - 0.375, ctx.l - 0.375, ctx.h),
      ],
      checker: (ctx) => {
        const alt = rampByName("slate");
        const tiles: Box[] = [];
        for (let x = 0; x < ctx.w; x++) {
          for (let y = 0; y < ctx.l; y++) {
            tiles.push(box((x + y) % 2 === 0 ? ctx.ramp : alt, x, y, 0, x + 1, y + 1, ctx.h));
          }
        }
        return tiles;
      },
    },
  },
};

export const ARCHETYPES: ReadonlyMap<string, ArchetypeSpec> = new Map(
  [CHAIR, TABLE, SOFA, PLANT, RUG].map((a) => [a.archetype, a]),
);

/** Identity of the authored part set. Changing any archetype, slot, or variant name (or the
 *  version) changes every recipe hash — renders are reproducible only within a pinned pair. */
export const PART_LIBRARY_HASH: string = createHash("sha256")
  .update(
    JSON.stringify([
      PART_LIBRARY_VERSION,
      [...ARCHETYPES.values()].map((a) => [
        a.archetype,
        Object.entries(a.slots).map(([slot, variants]) => [slot, Object.keys(variants).sort()]),
      ]),
    ]),
  )
  .digest("hex")
  .slice(0, 16);
