// Hand-authored face art (#342), ported from design_handoff_avatar_customization/faces.js.
// Coordinates and shade codes are verbatim: they are absolute sheet coords for the STAND frame,
// drawn for dirs 3 (front), 2 (three-quarter, face on screen right) and 1 (profile right). Dirs 4
// and 5 are the mirror, x' = 63 - x, which is shading-safe under the B4 rule.
//
// They stay absolute HERE so this file diffs against faces.js line for line. figurepass makes them
// FaceAnchor-relative at load: it subtracts the STAND anchor of each view's own dir, so a pixel is
// stored as an offset from the projected eye line and rig.py's projection places the block per
// (frame, dir). Walk and sit therefore cost nothing, and a rig change moves the art with the head.
//
// A code is not a colour. Sheets are indexed (slot, shade) like every other figure layer, so the
// worn ramps resolve them at bake time — see INKS.

export type FaceView = "d3" | "d2" | "d1";
export type InkCode = "K" | "S" | "H" | "W" | "T" | "U" | "I" | "B" | "b" | "R" | "F";
export type Pixel = readonly [number, number, InkCode];

/** Which drawn view each direction wears, and whether it is the mirror of it. Dirs 0, 6 and 7 face
 *  away and are absent: the back of a head has no face. */
export const VIEWS: Readonly<Record<number, { view: FaceView; mirror: boolean }>> = {
  3: { view: "d3", mirror: false },
  2: { view: "d2", mirror: false },
  4: { view: "d2", mirror: true },
  1: { view: "d1", mirror: false },
  5: { view: "d1", mirror: true },
};

/** The dir each view was drawn against, in the STAND frame. Its projected anchor is the origin the
 *  authored coordinates are measured from. */
export const REFERENCE_DIR: Readonly<Record<FaceView, number>> = { d3: 3, d2: 2, d1: 1 };
export const REFERENCE_FRAME = "stand";

const px = (code: InkCode, ...pts: Array<readonly [number, number]>): Pixel[] =>
  pts.map(([x, y]) => [x, y, code] as const);
const row = (code: InkCode, y: number, x0: number, x1: number): Pixel[] =>
  Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, code] as const);

type Axis = Record<string, Partial<Record<FaceView, readonly Pixel[]>>>;
export interface Geometry {
  eyes: Axis; brows: Axis; nose: Axis; mouth: Axis; beard: Axis; extra: Axis;
}

/** The axes, in paint order. A variant authored front-only falls back to its axis's FIRST entry in
 *  the other views, which is what keeps a turnaround complete — and what makes every face set look
 *  the same from three-quarter and profile. */
export const AXES = ["beard", "eyes", "brows", "nose", "mouth", "extra"] as const;
export type AxisName = (typeof AXES)[number];
export type FacePicks = Readonly<Record<AxisName, string>>;

/** Geometry A, "classic": lid y33, a 2-tall eye on y34-35, brows y31. */
export const GEOMETRY_A: Geometry = {
  eyes: {
    bright: {
      d3: [...row("K", 33, 26, 28), ...row("K", 33, 35, 37),
        [27, 34, "W"], [28, 34, "U"], [35, 34, "U"], [36, 34, "W"],
        [27, 35, "W"], [28, 35, "U"], [35, 35, "U"], [36, 35, "W"]],
      d2: [...row("K", 33, 31, 32), ...row("K", 33, 36, 37),
        [31, 34, "W"], [32, 34, "U"], [36, 34, "W"], [37, 34, "U"],
        [31, 35, "W"], [32, 35, "U"], [36, 35, "W"], [37, 35, "U"]],
      d1: [...row("K", 33, 38, 39),
        [38, 34, "W"], [39, 34, "U"], [38, 35, "W"], [39, 35, "U"]],
    },
    calm: {
      d3: [...row("K", 33, 26, 28), ...row("K", 33, 35, 37),
        [27, 34, "W"], [28, 34, "U"], [35, 34, "U"], [36, 34, "W"]],
    },
    lashes: {
      d3: [...row("K", 33, 25, 28), ...row("K", 33, 35, 38),
        [27, 34, "W"], [28, 34, "U"], [35, 34, "U"], [36, 34, "W"],
        [27, 35, "W"], [28, 35, "U"], [35, 35, "U"], [36, 35, "W"]],
    },
    wink: {
      d3: [...row("K", 34, 26, 28), ...row("K", 33, 35, 37),
        [35, 34, "U"], [36, 34, "W"], [35, 35, "U"], [36, 35, "W"]],
    },
    happy: { d3: px("K", [26, 34], [27, 33], [28, 34], [35, 34], [36, 33], [37, 34]) },
  },
  brows: {
    neutral: {
      d3: [...row("B", 31, 26, 28), ...row("B", 31, 35, 37)],
      d2: [...row("B", 31, 30, 32), ...row("B", 31, 35, 37)],
      d1: row("B", 31, 37, 39),
    },
    arched: { d3: px("B", [26, 32], [27, 31], [28, 31], [35, 31], [36, 31], [37, 32]) },
    heavy: {
      d3: [...row("B", 31, 26, 28), ...row("B", 32, 26, 28),
        ...row("B", 31, 35, 37), ...row("B", 32, 35, 37)],
    },
    worried: { d3: px("B", [26, 32], [27, 32], [28, 31], [35, 31], [36, 32], [37, 32]) },
  },
  nose: {
    std: { d3: px("S", [31, 36], [32, 36]), d2: [[39, 35, "S"], [39, 36, "K"]], d1: [] },
  },
  mouth: {
    neutral: { d3: row("K", 39, 30, 33), d2: row("K", 39, 35, 38), d1: row("K", 39, 39, 41) },
    smile: {
      d3: [[29, 38, "K"], [34, 38, "K"], ...row("K", 39, 30, 33)],
      d2: [[34, 38, "K"], ...row("K", 39, 35, 38)],
      d1: [[38, 38, "K"], ...row("K", 39, 39, 41)],
    },
    grin: {
      d3: [...row("K", 38, 29, 34), ...row("T", 39, 30, 33),
        [29, 39, "K"], [34, 39, "K"], ...row("K", 40, 30, 33)],
    },
    frown: { d3: [[29, 40, "K"], [34, 40, "K"], ...row("K", 39, 30, 33)] },
    smirk: { d3: [...row("K", 39, 31, 34), [35, 38, "K"]] },
  },
  beard: {
    none: {},
    stubble: { d3: px("F", [27, 40], [30, 41], [33, 40], [36, 40], [29, 42], [34, 42]) },
    moustache: { d3: px("B", [29, 38], [30, 38], [33, 38], [34, 38]) },
    full: {
      d3: [[26, 36, "b"], [26, 37, "b"], [37, 36, "b"], [37, 37, "b"],
        [27, 38, "b"], [28, 38, "b"], [35, 38, "b"], [36, 38, "b"],
        ...row("b", 40, 28, 35), ...row("b", 41, 29, 34), ...row("B", 42, 30, 33)],
    },
  },
  extra: {
    none: {},
    blush: { d3: px("R", [26, 37], [27, 37], [36, 37], [37, 37]) },
    freckles: { d3: px("F", [26, 36], [28, 37], [35, 37], [37, 36]) },
  },
};

/** Geometry C, "expressive": a 2x3 eye with its own iris row and brows one row up. Drawn, judged
 *  and NOT shipped — the design's own registration (brow y31, lid y33, eyes y34-35, nose y36,
 *  mouth y39, chin y42) is geometry A's rows, and C's taller block is the one that risks the
 *  cranium hats occupy. Kept because it is the authored alternative, not a variant to invent. */
export const GEOMETRY_C: Geometry = {
  ...GEOMETRY_A,
  eyes: {
    bright: {
      d3: [...row("K", 32, 26, 28), ...row("K", 32, 35, 37),
        [27, 33, "W"], [28, 33, "U"], [35, 33, "U"], [36, 33, "W"],
        [27, 34, "W"], [28, 34, "U"], [35, 34, "U"], [36, 34, "W"],
        [27, 35, "W"], [28, 35, "I"], [35, 35, "I"], [36, 35, "W"]],
      d2: [...row("K", 32, 31, 32), ...row("K", 32, 36, 37),
        [31, 33, "W"], [32, 33, "U"], [36, 33, "W"], [37, 33, "U"],
        [31, 34, "W"], [32, 34, "U"], [36, 34, "W"], [37, 34, "U"],
        [31, 35, "W"], [32, 35, "I"], [36, 35, "W"], [37, 35, "I"]],
      d1: [...row("K", 32, 38, 39),
        [38, 33, "W"], [39, 33, "U"], [38, 34, "W"], [39, 34, "U"],
        [38, 35, "W"], [39, 35, "I"]],
    },
    calm: {
      d3: [...row("K", 33, 26, 28), ...row("K", 33, 35, 37),
        [27, 34, "W"], [28, 34, "U"], [35, 34, "U"], [36, 34, "W"],
        [27, 35, "W"], [28, 35, "I"], [35, 35, "I"], [36, 35, "W"]],
    },
    lashes: {
      d3: [...row("K", 32, 25, 28), ...row("K", 32, 35, 38),
        [27, 33, "W"], [28, 33, "U"], [35, 33, "U"], [36, 33, "W"],
        [27, 34, "W"], [28, 34, "U"], [35, 34, "U"], [36, 34, "W"],
        [27, 35, "W"], [28, 35, "I"], [35, 35, "I"], [36, 35, "W"]],
    },
    wink: {
      d3: [...row("K", 34, 26, 28), ...row("K", 32, 35, 37),
        [35, 33, "U"], [36, 33, "W"], [35, 34, "U"], [36, 34, "W"],
        [35, 35, "I"], [36, 35, "W"]],
    },
    happy: { d3: px("K", [26, 34], [27, 33], [28, 34], [35, 34], [36, 33], [37, 34]) },
  },
  brows: {
    ...GEOMETRY_A.brows,
    neutral: {
      d3: [...row("B", 30, 26, 28), ...row("B", 30, 35, 37)],
      d2: [...row("B", 30, 30, 32), ...row("B", 30, 35, 37)],
      d1: row("B", 30, 37, 39),
    },
  },
};

/** What ships. The design offered A twice (paper whites, tonal whites) and C once; #340 landed the
 *  paper ramp, and A is the geometry the registration in the handoff README was measured off. */
export const GEOMETRY: Geometry = GEOMETRY_A;

const DEFAULTS: FacePicks = {
  eyes: "bright", brows: "neutral", nose: "std", mouth: "smile", beard: "none", extra: "none",
};

/** The curated launch faces (handoff README, "Curated launch face sets"). A shipped face is a
 *  fixed combo of the axes, never free mix-and-match, so the catalogue stays a catalogue. */
export const FACE_SETS: Readonly<Record<number, FacePicks>> = {
  17: { ...DEFAULTS, eyes: "bright", brows: "neutral", mouth: "smile" },                    // Bright
  18: { ...DEFAULTS, eyes: "calm", brows: "neutral", mouth: "neutral" },                    // Calm
  19: { ...DEFAULTS, eyes: "lashes", brows: "arched", mouth: "smile", extra: "blush" },     // Spark
  20: { ...DEFAULTS, eyes: "wink", brows: "arched", mouth: "smirk" },                       // Wink
  21: { ...DEFAULTS, eyes: "happy", brows: "neutral", mouth: "grin" },                      // Sunny
  22: { ...DEFAULTS, eyes: "calm", brows: "heavy", mouth: "neutral" },                      // Stern
  23: { ...DEFAULTS, eyes: "bright", brows: "worried", mouth: "frown" },                    // Worry
  24: { ...DEFAULTS, eyes: "bright", brows: "neutral", mouth: "smile", extra: "freckles" }, // Freckle
};

/** Facial hair `fa` sets: the beard axis alone, on a transparent sheet, worn in a hair colour. */
export const BEARD_SETS: Readonly<Record<number, FacePicks>> = {
  25: { ...DEFAULTS, beard: "stubble" },
  26: { ...DEFAULTS, beard: "moustache" },
  27: { ...DEFAULTS, beard: "full" },
};

/** A face set draws every axis but the beard, which is its own layer; an `fa` set draws only it. */
export const FACE_AXES: readonly AxisName[] = AXES.filter((a) => a !== "beard");
export const BEARD_AXES: readonly AxisName[] = ["beard"];

/** Where an ink code lands in the indexed sheet.
 *
 *  `own` is the layer's slot 0 — the skin ramp on a face set, the worn hair ramp on an `fa` set.
 *  `iris` is slot 1, which only a face set has. `paper` and `crimson` are FIXED: they are not
 *  player colours and never appear in a wearable list, so they sit past the set's own slots and
 *  the bundle names them in `fixedColors`.
 *
 *  B is the design's brow/beard line and b its fill. On an `fa` sheet they are the worn hair ramp,
 *  as drawn. On a face set they resolve to skin, because a face set carries skin and iris and no
 *  third slot — brows read as the same dark line the lid is drawn with. */
export type FixedRamp = "paper" | "crimson";
export type InkSlot = "own" | "iris" | FixedRamp;
export const INKS: Readonly<Record<InkCode, { slot: InkSlot; shade: number }>> = {
  K: { slot: "own", shade: 0 },      // line — the worn ramp's own outline shade
  S: { slot: "own", shade: 1 },      // shadow
  H: { slot: "own", shade: 4 },      // hi
  F: { slot: "own", shade: 0 },      // freckle / stubble dot
  B: { slot: "own", shade: 0 },      // brow, beard line
  b: { slot: "own", shade: 1 },      // beard fill
  U: { slot: "iris", shade: 0 },     // pupil
  I: { slot: "iris", shade: 1 },     // iris
  W: { slot: "paper", shade: 4 },    // eye white
  T: { slot: "paper", shade: 3 },    // teeth
  R: { slot: "crimson", shade: 2 },  // blush
};

/** Ramps a face sheet indexes by name rather than through a worn slot, in the order the bundle's
 *  `fixedColors` declares them: sheet slot `set.slots + i`. */
export const FIXED_RAMPS: readonly FixedRamp[] = ["paper", "crimson"];

/** The pixels of one face, in paint order, for one direction. Null for the three back dirs. */
export function facePixels(
  geo: Geometry,
  picks: FacePicks,
  dir: number,
  axes: readonly AxisName[] = AXES,
): { pixels: Pixel[]; view: FaceView; mirror: boolean } | null {
  const v = VIEWS[dir];
  if (!v) return null;
  const pixels: Pixel[] = [];
  for (const axis of axes) {
    const table = geo[axis];
    const first = Object.keys(table)[0];
    const part = table[picks[axis]] ?? (first === undefined ? {} : table[first] ?? {});
    const fallback = first === undefined ? {} : table[first] ?? {};
    pixels.push(...(part[v.view] ?? fallback[v.view] ?? []));
  }
  return { pixels, view: v.view, mirror: v.mirror };
}
