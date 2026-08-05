// The Luck Lever (GAME.md §Sinks, #210). 100 Stars a pull, odds published — the table below is
// the same object the client shows the player and the server draws from, so the published odds
// cannot drift from the real ones.
//
// It is the only *repeatable* sink. Everything else in the economy is bounded: the catalog is
// bought out once, prestige fixtures are bought once each, a collection set completes once. Once
// those are done a player's balance grows without limit, so the lever is what keeps absorbing.

export interface LeverPrize {
  /** null is the blank — the common outcome, and the reason the lever drains. */
  defId: string | null;
  label: string;
  /** Relative weight. Published as a percentage of the total. */
  weight: number;
}

export const LEVER_COST = 100;

/** Weights are relative, not percentages, so a prize can be added without restating the rest.
 *  Two prizes are lever-only: a gacha whose whole table is buyable has no reason to exist, and a
 *  colorway costs no render, so an item that exists purely to be rare is nearly free to make.
 *  Prestige fixtures are deliberately absent — they are the sink you save for, not a lucky drop. */
export const LEVER_PRIZES: readonly LeverPrize[] = [
  { defId: null, label: "No win", weight: 620 },
  { defId: "cafe_chair_crimson", label: "Crimson Café Chair", weight: 120 },
  { defId: "casino_stool_fern", label: "Baize Stool", weight: 120 },
  { defId: "divider_basic_plum", label: "Plum Divider", weight: 60 },
  { defId: "arcade_cabinet_plum", label: "Plum Arcade Cabinet (lever only)", weight: 55 },
  { defId: "record_trophy", label: "Record Trophy", weight: 20 },
  { defId: "fountain_gilded", label: "Gilded Fountain (lever only)", weight: 5 },
];

/** Never sold, only won — so they carry no catalog price and the catalog test knows why. */
export const LEVER_EXCLUSIVE_DEFS: ReadonlySet<string> = new Set([
  "arcade_cabinet_plum",
  "fountain_gilded",
]);

export const LEVER_TOTAL_WEIGHT: number = LEVER_PRIZES.reduce((n, p) => n + p.weight, 0);

/** Published odds, rounded for display only — never used to draw. */
export function leverOdds(): Array<{ label: string; percent: string }> {
  return LEVER_PRIZES.map((p) => ({
    label: p.label,
    percent: `${((p.weight / LEVER_TOTAL_WEIGHT) * 100).toFixed(1)}%`,
  }));
}

/** Draw from `roll` in [0, 1). Pure, so the server can seed it and a test can pin it. */
export function leverDraw(roll: number): LeverPrize {
  let n = Math.min(Math.max(roll, 0), 0.999999) * LEVER_TOTAL_WEIGHT;
  for (const prize of LEVER_PRIZES) {
    n -= prize.weight;
    if (n < 0) return prize;
  }
  return LEVER_PRIZES[0] as LeverPrize;
}
