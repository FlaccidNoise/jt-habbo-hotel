export const STYLE_VERSION = 1;
export const GENERATOR_VERSION = 1;

/** Above-front light: top face lightest, right face base, left face darker, outline darkest —
 *  the same shading rule the placeholder slabs used, so sprites sit naturally in the room. */
const FACTORS = { outline: 0.35, left: 0.65, right: 1.0, top: 1.3 } as const;

export interface Ramp {
  name: string;
  outline: number;
  left: number;
  right: number;
  top: number;
}

function shade(color: number, factor: number): number {
  const channel = (shift: number): number =>
    Math.min(255, Math.round(((color >> shift) & 0xff) * factor));
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

function ramp(name: string, base: number): Ramp {
  return {
    name,
    outline: shade(base, FACTORS.outline),
    left: shade(base, FACTORS.left),
    right: shade(base, FACTORS.right),
    top: shade(base, FACTORS.top),
  };
}

/** Curated global palette: ramp-indexed color, recoloring is ramp swapping (PIPELINES §2). */
const RAMPS: readonly Ramp[] = [
  ramp("walnut", 0xb5651d),
  ramp("oak", 0x8b4513),
  ramp("plum", 0x7a3e9d),
  ramp("fern", 0x2e8b57),
  ramp("crimson", 0xaa3333),
  ramp("slate", 0x5b6672),
  ramp("sand", 0xc2a36b),
  ramp("teal", 0x2f8f8f),
];

export function rampByName(name: string): Ramp {
  const found = RAMPS.find((r) => r.name === name);
  if (!found) throw new Error(`unknown ramp: ${name}`);
  return found;
}

/** Global silhouette outline — guarantees contrast against any floor tone. */
export const OUTLINE = 0x23241f;

/** Every color the generator is allowed to emit. The palette gate rejects anything else. */
export const PALETTE: ReadonlySet<number> = new Set([
  OUTLINE,
  ...RAMPS.flatMap((r) => [r.outline, r.left, r.right, r.top]),
]);

/** The two extreme floor tones (client scene/room.ts FLOOR_A/FLOOR_B) for the contrast gate. */
export const FLOOR_TONES: readonly number[] = [0x6f9e4c, 0x5d8a3f];

/** Rec. 601 luma, 0-255. */
export function luminance(color: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
