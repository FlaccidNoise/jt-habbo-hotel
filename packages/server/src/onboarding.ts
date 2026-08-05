import type Database from "better-sqlite3";

// GAME.md §First session: the scripted welcome quest, advanced by real server events only —
// coffee payout, catalog purchase, placement, first arcade hand. Rejoining re-prompts the
// current step until the chain is done.

const STEPS = ["coffee", "purchase", "place", "arcade", "done"] as const;
export type OnboardingStep = (typeof STEPS)[number];
export type OnboardingEvent = Exclude<OnboardingStep, "done">;

const HINTS: Record<OnboardingEvent, string> = {
  coffee:
    "📜 Welcome quest: Maya at the café counter pours your first coffee — walk up and ask her. First daily pays 10 ★.",
  purchase: "📜 Quest: Stars in hand. Open the catalog below and buy your first piece of furni.",
  place:
    "📜 Quest: place your new furni — click it in your inventory, then a tile. Your own suite is behind the 🏠 button.",
  arcade: "📜 Quest: one more — play a hand at the 🎰 Hi-Lo arcade. Scored plays pay Stars.",
};

const DONE_TEXT = "📜 Quest complete! Dailies reset every 24h — the café, the arcade and The Grand are yours.";

export function startOnboarding(db: Database.Database, accountId: number): void {
  db.prepare("INSERT OR IGNORE INTO onboarding (account_id, step) VALUES (?, 'coffee')").run(accountId);
}

function stepOf(db: Database.Database, accountId: number): OnboardingStep | null {
  const row = db.prepare("SELECT step FROM onboarding WHERE account_id = ?").get(accountId) as
    | { step: OnboardingStep }
    | undefined;
  return row?.step ?? null;
}

/** The current step's prompt, for re-sending on join. Null once done (or for pre-quest accounts). */
export function onboardingHint(db: Database.Database, accountId: number): string | null {
  const step = stepOf(db, accountId);
  return step && step !== "done" ? HINTS[step] : null;
}

/** Advances the quest when `event` is the current step; returns the next prompt to show, once. */
export function advanceOnboarding(
  db: Database.Database,
  accountId: number,
  event: OnboardingEvent,
): string | null {
  if (stepOf(db, accountId) !== event) return null;
  const next = STEPS[STEPS.indexOf(event) + 1] as OnboardingStep;
  db.prepare("UPDATE onboarding SET step = ? WHERE account_id = ?").run(next, accountId);
  return next === "done" ? DONE_TEXT : HINTS[next as OnboardingEvent];
}
