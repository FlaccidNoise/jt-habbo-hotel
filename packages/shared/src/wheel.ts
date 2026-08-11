// The Grand Wheel (GAME.md §The casino floor, #429). Bet a colour, the wheel spins, a slot of that
// colour pays the segment's multiplier — the house's first banked game. The layout below is the
// same object the client draws and the server draws from, so the published odds cannot drift from
// the real ones.
//
// The Luck Lever absorbs by paying in goods worth less than the pull. The wheel absorbs by
// arithmetic: every segment returns multiplier × count/24, which is 20/24 or 21/24 of the stake
// and never 1. That is a 12.5–16.7% edge — wider than a real casino's, so it drains, and narrow
// enough that hits stay frequent: Crimson lands on 10 of the 24 slots.

export interface WheelSegment {
  label: string;
  /** A matching slot pays stake × multiplier; a miss pays nothing. */
  multiplier: number;
}

export const WHEEL_SEGMENTS: Readonly<Record<string, WheelSegment>> = {
  crimson: { label: "Crimson", multiplier: 2 },
  fern: { label: "Fern", multiplier: 3 },
  plum: { label: "Plum", multiplier: 5 },
  gold: { label: "Gilded", multiplier: 10 },
  grand: { label: "The Grand", multiplier: 20 },
};

/** The wheel face, slot 0 round to slot 23. Counting it is what produces the odds, so there is no
 *  second list to keep in step — editing the wheel edits the payout table. Laid out like a Big Six
 *  wheel: no two rare slots adjacent, no colour repeated round the ring, The Grand alone at 0. */
export const WHEEL_LAYOUT: readonly string[] = [
  "grand", "crimson", "fern", "plum", "crimson", "fern",
  "crimson", "gold", "fern", "crimson", "plum", "crimson",
  "fern", "crimson", "plum", "crimson", "fern", "gold",
  "crimson", "fern", "crimson", "plum", "fern", "crimson",
];

export const WHEEL_MIN_STAKE = 10;
export const WHEEL_MAX_STAKE = 100;

/** Bounds a payout at stake × 20 = 2,000. Derived, so a richer segment moves the bound with it
 *  rather than leaving the settlement trusting a stale number. */
export const WHEEL_MAX_MULTIPLIER: number = Math.max(
  ...Object.values(WHEEL_SEGMENTS).map((s) => s.multiplier),
);

/** Draw from `roll` in [0, 1). Pure, so the server can seed it and a test can pin it. The slot is
 *  the result, not the segment: two slots of one colour are different places on the wheel. */
export function wheelDraw(roll: number): { slot: number; segment: string } {
  const slot = Math.floor(Math.min(Math.max(roll, 0), 0.999999) * WHEEL_LAYOUT.length);
  return { slot, segment: WHEEL_LAYOUT[slot] as string };
}

/** Published odds, counted off the wheel face — display only, never used to draw. */
export function wheelOdds(): Array<{
  id: string; label: string; multiplier: number; percent: string;
}> {
  return Object.entries(WHEEL_SEGMENTS).map(([id, segment]) => ({
    id,
    ...segment,
    percent: `${((WHEEL_LAYOUT.filter((s) => s === id).length / WHEEL_LAYOUT.length) * 100).toFixed(1)}%`,
  }));
}
