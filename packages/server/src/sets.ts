import { COLLECTION_SETS, setProgress } from "@grand/shared";
import type { SetProgress } from "@grand/shared";
import type Database from "better-sqlite3";
import { awardBadge, settleSpend } from "./ledger.ts";

// Collection sets (#210). Completion mints a set-only furni piece and a badge, both once ever.
// The badge row is the idempotence key: awardBadge returns false the second time, so a player who
// completes, trades a member away and completes again gets nothing more.

export interface SetCompletion {
  setId: string;
  name: string;
  badge: string;
  defId: string;
  itemId: number;
}

/** Every def the account owns, wherever it is — inventory, its own room, hung on a wall, or on
 *  permanent exhibition. A museum donation keeps its owner, so donating a set member does not
 *  un-complete the set: you collected it, and giving it to the house is not losing it. */
export function ownedDefIds(db: Database.Database, accountId: number): string[] {
  return (
    db
      .prepare("SELECT DISTINCT def_id AS defId FROM furni_items WHERE owner_id = ?")
      .all(accountId) as Array<{ defId: string }>
  ).map((r) => r.defId);
}

export function progressFor(db: Database.Database, accountId: number): SetProgress[] {
  return setProgress(ownedDefIds(db, accountId));
}

/** Mints the reward for any set newly completed. Call it after anything that can add a def to an
 *  account: a purchase, a lever win, a trade, a set reward itself.
 *
 *  The reward is free (price 0) but still writes a ledger row, so a minted item has the same
 *  provenance trail as a bought one and /api/metrics sees the op. */
export function claimCompletedSets(
  db: Database.Database,
  accountId: number,
  now = Date.now(),
): SetCompletion[] {
  const done: SetCompletion[] = [];
  for (const progress of progressFor(db, accountId)) {
    if (!progress.complete) continue;
    const set = COLLECTION_SETS.find((s) => s.id === progress.id);
    if (!set) continue;
    // Badge and reward in one transaction. The badge is the idempotence key, so awarding it
    // outside the mint would let a failed mint strand the account: badge held, reward owed,
    // and the next claim skipped because the badge is already there.
    const claim = db.transaction((): SetCompletion | null => {
      if (!awardBadge(db, accountId, set.badge, now)) return null;   // already claimed, ever
      const result = settleSpend(db, {
        opKey: `set:${accountId}:${set.id}`,
        op: "set_reward",
        accountId,
        price: 0,
        mint: { defId: set.reward, bound: true, inscription: `${set.name} — completed` },
        now,
      });
      if (!result.ok || result.itemId === undefined) {
        throw new Error(`${set.id} reward mint failed: ${result.ok ? "no item" : result.reason}`);
      }
      return {
        setId: set.id, name: set.name, badge: set.badge, defId: set.reward, itemId: result.itemId,
      };
    });
    const claimed = claim();
    if (claimed) done.push(claimed);
  }
  return done;
}
