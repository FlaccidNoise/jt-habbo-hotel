import { createHash } from "node:crypto";
import type { Box } from "./iso.ts";
import type { Prng } from "./prng.ts";
import type { Ramp } from "./style.ts";
import { rampByName } from "./style.ts";

// 2: plant.foliage.bush regrown as a non-interpenetrating voxel cluster (gateDrawOrder).
// 3: chair.back sits on the leg tops and flush with the seat's rear edge (#256).
export const PART_LIBRARY_VERSION = 3;

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
      // Both stop at the back slot's near edge (y 0.78125). Running under it instead puts the
      // back through whichever seat variant tops out above its own z0, and two boxes that pass
      // through each other have no correct draw order — the same seam the sofa's cushions avoid.
      flat: (ctx) => [box(ctx.ramp, 0.0625, 0.0625, 0.45, 0.9375, 0.78125, 0.578125)],
      cushion: (ctx) => [box(ctx.ramp, 0.09375, 0.09375, 0.45, 0.90625, 0.78125, 0.65625)],
    },
    back: {
      // Down to 0.45, the leg tops, not to 0.578125. The rear legs run to y 0.90625 while the
      // seat stops at 0.78125, so their back quarter is uncovered — starting the back above them
      // left a 4px gap with nothing in it, and the leg read as a loose block behind the chair.
      // Sitting the back on the legs closes it and gives the chair one connected frame.
      solid: (ctx) => [box(ctx.ramp, 0.0625, 0.78125, 0.45, 0.9375, 0.9375, ctx.h)],
      slats: (ctx) => {
        const rail = box(ctx.ramp, 0.0625, 0.78125, ctx.h - 0.15625, 0.9375, 0.9375, ctx.h);
        // Flush with the rail in y, and with the seat's rear edge. At y 0.8125 they stood a pixel
        // proud of both, so only the rail ever touched the chair and the slats floated.
        const slat = (x0: number): Box =>
          box(ctx.ramp, x0, 0.78125, 0.45, x0 + 0.15625, 0.9375, ctx.h - 0.15625);
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
        // Seeded voxel cluster, grown outward from the cell the stem holds up. Blobs share faces
        // and never interpenetrate: two boxes that pass through each other have no correct draw
        // order at all — each is in front of the other somewhere — so gateDrawOrder rejects them.
        // The lattice keeps every vertex on the pixel grid for free.
        const cell = 0.1875;
        const x0 = 0.21875;
        const z0 = 0.75;
        const blob = (gx: number, gy: number, gz: number): Box =>
          box(ctx.ramp,
            x0 + gx * cell, x0 + gy * cell, z0 + gz * cell,
            x0 + (gx + 1) * cell, x0 + (gy + 1) * cell, z0 + (gz + 1) * cell);
        // Lateral steps outnumber vertical ones 4:2, or the walk climbs into a staircase instead
        // of filling out into a mass.
        const steps = [
          [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
          [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0],
          [0, 0, 1], [0, 0, -1],
        ];
        const cells: Array<[number, number, number]> = [[1, 1, 0]];
        const taken = new Set(["1,1,0"]);
        for (let tries = 0; cells.length < 14 && tries < 200; tries++) {
          const from = cells[ctx.prng.int(cells.length)] ?? [1, 1, 0];
          const step = steps[ctx.prng.int(steps.length)] ?? [0, 0, 1];
          const c: [number, number, number] = [
            (from[0] ?? 0) + (step[0] ?? 0),
            (from[1] ?? 0) + (step[1] ?? 0),
            (from[2] ?? 0) + (step[2] ?? 0),
          ];
          if (c[0] < 0 || c[0] > 2 || c[1] < 0 || c[1] > 2 || c[2] < 0 || c[2] > 2) continue;
          if (taken.has(c.join(","))) continue;
          taken.add(c.join(","));
          cells.push(c);
        }
        return [
          box(ctx.ramp, 0.4375, 0.4375, 0.40625, 0.5625, 0.5625, z0),
          ...cells.map((c) => blob(...c)),
        ];
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
      // Four rails around an inlay, tiling the footprint. Laying the inlay *over* a full-size
      // field instead would put two boxes in one volume, where no draw order is right: the
      // inlay's east and south faces stamp a rim that a depth test never draws.
      border: (ctx) => {
        const m = 0.375;
        return [
          box(ctx.ramp, 0, 0, 0, ctx.w, m, ctx.h),
          box(ctx.ramp, 0, m, 0, m, ctx.l - m, ctx.h),
          box(rampByName("sand"), m, m, 0, ctx.w - m, ctx.l - m, ctx.h),
          box(ctx.ramp, ctx.w - m, m, 0, ctx.w, ctx.l - m, ctx.h),
          box(ctx.ramp, 0, ctx.l - m, 0, ctx.w, ctx.l, ctx.h),
        ];
      },
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
