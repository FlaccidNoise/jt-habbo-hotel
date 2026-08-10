export const STYLE_VERSION = 3;
export const GENERATOR_VERSION = 2;

/** Above-front light: top face lightest, right face base, left face darker, outline darkest —
 *  the same shading rule the placeholder slabs used, so sprites sit naturally in the room.
 *  `hi` is the fifth style-bible shade: specular rims on curved surfaces (3D-assisted path). */
const FACTORS = { outline: 0.35, left: 0.65, right: 1.0, top: 1.3, hi: 1.55 } as const;

export interface Ramp {
  name: string;
  outline: number;
  left: number;
  right: number;
  top: number;
  hi: number;
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
    hi: shade(base, FACTORS.hi),
  };
}

/** Curated global palette: ramp-indexed color, recoloring is ramp swapping (PIPELINES §2).
 *  Style bible v1 pin: 12 ramps × 5 shades (ART-DIRECTION.md). */
const RAMPS: readonly Ramp[] = [
  ramp("walnut", 0xb5651d),
  ramp("oak", 0x8b4513),
  ramp("plum", 0x7a3e9d),
  ramp("fern", 0x2e8b57),
  ramp("crimson", 0xaa3333),
  ramp("slate", 0x5b6672),
  ramp("sand", 0xc2a36b),
  ramp("teal", 0x2f8f8f),
  ramp("gold", 0xdaa520),
  ramp("ivory", 0x9c9484),   // dark enough that top/hi stay distinct instead of clipping to white
  ramp("navy", 0x3f5e9e),
  ramp("charcoal", 0x4a4d55),
];

/** Skin is its own family (#127): the 12 material ramps hold no skin tone, and reducing every
 *  player to `sand` or `ivory` is not a palette we can ship. Kept separate from RAMPS so
 *  figuredata can offer these for the head and nothing else.
 *
 *  Every base here has its brightest channel ≤ 164, so `hi` at 1.55 lands ≤ 254 and no channel
 *  clamps. Clamping matters more for skin than for wood: it drags the light band toward white,
 *  which hue-shifts the tone and collapses the deep end of the family into the light end.
 *  (walnut, crimson, sand, and gold do clamp — their pixels are frozen and cannot move.) */
const SKIN_RAMPS: readonly Ramp[] = [
  ramp("skin_1", 0xa48470),
  ramp("skin_2", 0x977463),
  ramp("skin_3", 0x87614c),
  ramp("skin_4", 0x6f4c39),
  ramp("skin_5", 0x573a2b),
  ramp("skin_6", 0x3e2920),
];

/** `paper` (#340): a fixed reference ramp for hand-authored face art — eye whites (`hi`) and
 *  teeth (`top`). It joins neither RAMPS nor SKIN_RAMPS, so it never appears in a wearable-colour
 *  list: figuredata's `paletteFor` only ever mirrors those two. Face art indexes it directly by
 *  name via `rampByName("paper")`, not through a slot. Base brightest channel is 164, so `hi` at
 *  1.55 lands under 255 like the skin family — the no-clamp gate below covers it too. */
export const PAPER_RAMP: Ramp = ramp("paper", 0xa4a29a);

const ALL_RAMPS: readonly Ramp[] = [...RAMPS, ...SKIN_RAMPS, PAPER_RAMP];

export function rampByName(name: string): Ramp {
  const found = ALL_RAMPS.find((r) => r.name === name);
  if (!found) throw new Error(`unknown ramp: ${name}`);
  return found;
}

/** Material ramps — what furni and garments are coloured from. Skin is deliberately excluded. */
export const RAMP_NAMES: readonly string[] = RAMPS.map((r) => r.name);

/** Head-only ramps. */
export const SKIN_RAMP_NAMES: readonly string[] = SKIN_RAMPS.map((r) => r.name);

/** Ramps gated against channel clamping: a clamp drags the light band toward white, hue-shifting
 *  the tone and collapsing the deep end of the family into the light end. Skin and paper are both
 *  gated; the material ramps are not (walnut, crimson, sand, gold clamp and are frozen). */
export const CLAMP_GATED_RAMP_NAMES: readonly string[] = [...SKIN_RAMP_NAMES, PAPER_RAMP.name];

/** Every shade of every ramp, for the distinctness test. */
export const RAMP_SHADES: ReadonlyArray<{ ramp: string; shade: string; color: number }> =
  ALL_RAMPS.flatMap((r) =>
    (["outline", "left", "right", "top", "hi"] as const).map((shade) => ({
      ramp: r.name, shade, color: r[shade],
    })),
  );

/** Global silhouette outline — guarantees contrast against any floor tone. */
export const OUTLINE = 0x23241f;

/** Every color the generator is allowed to emit. The palette gate rejects anything else. */
export const PALETTE: ReadonlySet<number> = new Set([
  OUTLINE,
  ...ALL_RAMPS.flatMap((r) => [r.outline, r.left, r.right, r.top, r.hi]),
]);

/** The default floor tones (client scene/room.ts FLOOR_A/FLOOR_B), drawn by any room that has
 *  chosen no floor decor. Kept here so a test can hold them to the same backdrop rule the decor
 *  class is gated by — they are a floor like any other, they just are not an asset. */
export const FLOOR_TONES: readonly number[] = [0x6f9e4c, 0x5d8a3f];

/** Rec. 601 luma, 0-255. */
export function luminance(color: number): number {
  const r = (color >> 16) & 0xff, g = (color >> 8) & 0xff, b = color & 0xff;
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

/** Luma a silhouette must clear the surface behind it by. */
export const MIN_CONTRAST = 24;

/** The lightest outline any ramp can paint — sand and gold, at 58.0. Every silhouette in the game
 *  is an outline shade: furni takes the global OUTLINE, and a figure layer takes its worn ramp's
 *  own (figurepass.ts SHADE_OUTLINE), which is per player and so not knowable in advance. */
const OUTLINE_LUMA_MAX: number = Math.max(...ALL_RAMPS.map((r) => luminance(r.outline)));

/** Floors and walls are behind everything, so one rule covers the whole backdrop: a surface an
 *  avatar or a sprite is seen against must clear the lightest outline by MIN_CONTRAST. Before
 *  #260 the floor was two fixed greens and the furni gate could name them; a decor floor may be
 *  any palette colour, so the bound is what the gates compare against now. */
export const BACKDROP_LUMA_MIN: number = OUTLINE_LUMA_MAX + MIN_CONTRAST;
