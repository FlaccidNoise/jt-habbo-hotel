// Hand-authored per-direction face pixel art (#311 follow-up). Coordinates are sheet-space for
// the STAND frame, authored for dirs 3 (front), 2 (three-quarter, face right) and 1 (profile
// right); dirs 4 and 5 are the mirror (x' = 63 - x), which is shading-safe under the B4 rule.
// In the pipeline these become FaceAnchor-relative offsets; here they are absolute for review.
// Codes resolve through baker.faceInks: K line, S shadow, W eye white, U pupil, B brow/beard
// line, b beard fill, T teeth, R blush, F freckle, H skin hi.

export const VIEWS = {
  3: { view: "d3", mirror: false },
  2: { view: "d2", mirror: false },
  4: { view: "d2", mirror: true },
  1: { view: "d1", mirror: false },
  5: { view: "d1", mirror: true },
};

const px = (code, ...pts) => pts.map(([x, y]) => [x, y, code]);
const row = (code, y, x0, x1) => Array.from({ length: x1 - x0 + 1 }, (_, i) => [x0 + i, y, code]);

// ---- shared geometry A: "classic" eye block (lid y33, 2-tall eye y34-35) --------------------
const A = {
  eyes: {
    bright: {
      d3: [...row("K", 33, 26, 28), ...row("K", 33, 35, 37),
        [27,34,"W"],[28,34,"U"],[35,34,"U"],[36,34,"W"],
        [27,35,"W"],[28,35,"U"],[35,35,"U"],[36,35,"W"]],
      d2: [...row("K", 33, 31, 32), ...row("K", 33, 36, 37),
        [31,34,"W"],[32,34,"U"],[36,34,"W"],[37,34,"U"],
        [31,35,"W"],[32,35,"U"],[36,35,"W"],[37,35,"U"]],
      d1: [...row("K", 33, 38, 39),
        [38,34,"W"],[39,34,"U"],[38,35,"W"],[39,35,"U"]],
    },
    calm: { d3: [...row("K", 33, 26, 28), ...row("K", 33, 35, 37),
      [27,34,"W"],[28,34,"U"],[35,34,"U"],[36,34,"W"]] },
    lashes: { d3: [...row("K", 33, 25, 28), ...row("K", 33, 35, 38),
      [27,34,"W"],[28,34,"U"],[35,34,"U"],[36,34,"W"],
      [27,35,"W"],[28,35,"U"],[35,35,"U"],[36,35,"W"]] },
    wink: { d3: [...row("K", 34, 26, 28), ...row("K", 33, 35, 37),
      [35,34,"U"],[36,34,"W"],[35,35,"U"],[36,35,"W"]] },
    happy: { d3: px("K", [26,34],[27,33],[28,34],[35,34],[36,33],[37,34]) },
  },
  brows: {
    neutral: {
      d3: [...row("B", 31, 26, 28), ...row("B", 31, 35, 37)],
      d2: [...row("B", 31, 30, 32), ...row("B", 31, 35, 37)],
      d1: row("B", 31, 37, 39),
    },
    arched: { d3: px("B", [26,32],[27,31],[28,31],[35,31],[36,31],[37,32]) },
    heavy: { d3: [...row("B", 31, 26, 28), ...row("B", 32, 26, 28),
      ...row("B", 31, 35, 37), ...row("B", 32, 35, 37)] },
    worried: { d3: px("B", [26,32],[27,32],[28,31],[35,31],[36,32],[37,32]) },
  },
  nose: {
    std: { d3: px("S", [31,36],[32,36]), d2: [[39,35,"S"],[39,36,"K"]], d1: [] },
  },
  mouth: {
    neutral: { d3: row("K", 39, 30, 33), d2: row("K", 39, 35, 38), d1: row("K", 39, 39, 41) },
    smile: {
      d3: [[29,38,"K"],[34,38,"K"], ...row("K", 39, 30, 33)],
      d2: [[34,38,"K"], ...row("K", 39, 35, 38)],
      d1: [[38,38,"K"], ...row("K", 39, 39, 41)],
    },
    grin: { d3: [...row("K", 38, 29, 34), ...row("T", 39, 30, 33),
      [29,39,"K"],[34,39,"K"], ...row("K", 40, 30, 33)] },
    frown: { d3: [[29,40,"K"],[34,40,"K"], ...row("K", 39, 30, 33)] },
    smirk: { d3: [...row("K", 39, 31, 34), [35,38,"K"]] },
  },
  beard: {
    none: {},
    stubble: { d3: px("F", [27,40],[30,41],[33,40],[36,40],[29,42],[34,42]) },
    moustache: { d3: px("B", [29,38],[30,38],[33,38],[34,38]) },
    full: { d3: [ [26,36,"b"],[26,37,"b"],[37,36,"b"],[37,37,"b"],
      [27,38,"b"],[28,38,"b"],[35,38,"b"],[36,38,"b"],
      ...row("b", 40, 28, 35), ...row("b", 41, 29, 34), ...row("B", 42, 30, 33)] },
  },
  extra: {
    none: {},
    blush: { d3: px("R", [26,37],[27,37],[36,37],[37,37]) },
    freckles: { d3: px("F", [26,36],[28,37],[35,37],[37,36]) },
  },
};

// ---- geometry C: "expressive" — taller 2x3 eyes, raised heavy brows -------------------------
const C = {
  ...A,
  eyes: {
    bright: {
      d3: [...row("K", 32, 26, 28), ...row("K", 32, 35, 37),
        [27,33,"W"],[28,33,"U"],[35,33,"U"],[36,33,"W"],
        [27,34,"W"],[28,34,"U"],[35,34,"U"],[36,34,"W"],
        [27,35,"W"],[28,35,"I"],[35,35,"I"],[36,35,"W"]],
      d2: [...row("K", 32, 31, 32), ...row("K", 32, 36, 37),
        [31,33,"W"],[32,33,"U"],[36,33,"W"],[37,33,"U"],
        [31,34,"W"],[32,34,"U"],[36,34,"W"],[37,34,"U"],
        [31,35,"W"],[32,35,"I"],[36,35,"W"],[37,35,"I"]],
      d1: [...row("K", 32, 38, 39),
        [38,33,"W"],[39,33,"U"],[38,34,"W"],[39,34,"U"],[38,35,"W"],[39,35,"I"]],
    },
    calm: { d3: [...row("K", 33, 26, 28), ...row("K", 33, 35, 37),
      [27,34,"W"],[28,34,"U"],[35,34,"U"],[36,34,"W"],
      [27,35,"W"],[28,35,"I"],[35,35,"I"],[36,35,"W"]] },
    lashes: { d3: [...row("K", 32, 25, 28), ...row("K", 32, 35, 38),
      [27,33,"W"],[28,33,"U"],[35,33,"U"],[36,33,"W"],
      [27,34,"W"],[28,34,"U"],[35,34,"U"],[36,34,"W"],
      [27,35,"W"],[28,35,"I"],[35,35,"I"],[36,35,"W"]] },
    wink: { d3: [...row("K", 34, 26, 28), ...row("K", 32, 35, 37),
      [35,33,"U"],[36,33,"W"],[35,34,"U"],[36,34,"W"],[35,35,"I"],[36,35,"W"]] },
    happy: { d3: px("K", [26,34],[27,33],[28,34],[35,34],[36,33],[37,34]) },
  },
  brows: {
    ...A.brows,
    neutral: {
      d3: [...row("B", 30, 26, 28), ...row("B", 30, 35, 37)],
      d2: [...row("B", 30, 30, 32), ...row("B", 30, 35, 37)],
      d1: row("B", 30, 37, 39),
    },
  },
};

export const STYLES = {
  classic: {
    name: "Classic Bright", mode: "paper", geo: A,
    blurb: "Habbo-weight features: dark lid, white 2x2 eye, pupil toward the nose. Needs the paper ramp.",
  },
  soft: {
    name: "Soft Tonal", mode: "tonal", geo: A,
    blurb: "Same drawing, zero palette change — the catch is the skin ramp's own hi. No style_version bump.",
  },
  expressive: {
    name: "Wide Eyed", mode: "paper", geo: C,
    blurb: "2x3 eyes with an iris row, raised brows. Maximum charm, tallest feature block (risks hat lines).",
  },
};

/** Compose one face: pick per-axis part ids, resolve the view for `dir`, in paint order. */
export function facePixels(style, picks, dir) {
  const v = VIEWS[dir];
  if (!v) return { pixels: [], mirror: false };
  const geo = style.geo;
  const order = ["beard", "eyes", "brows", "nose", "mouth", "extra"];
  const pixels = [];
  for (const axis of order) {
    const table = geo[axis];
    if (!table) continue;
    const part = table[picks[axis] ?? Object.keys(table)[0]] ?? {};
    // variants beyond the defaults are authored front-only; other views fall back to the
    // axis default so turnarounds stay complete
    const fallback = table[Object.keys(table)[0]] ?? {};
    pixels.push(...(part[v.view] ?? fallback[v.view] ?? []));
  }
  return { pixels, mirror: v.mirror };
}
