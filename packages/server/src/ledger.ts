import type Database from "better-sqlite3";
import type { InventoryItem } from "@grand/shared";
import { BIND_MS, checkBudget, swingOf } from "./limits.ts";
import { timed } from "./metrics.ts";

// The unified Stars-and-item ledger (decision log 2026-08-03, PIPELINES §5): one append-only
// entry log in the one SQLite database, one local ACID transaction per operation, idempotent
// per op_key. Stars are earned-only — nothing here moves Stars between players; trades move
// items only. Append-only is enforced by triggers in db.ts, not by convention.

// GAME.md §Currency: one ceiling over all faucets, rolling 24h — at the ceiling every faucet
// pays zero. All amounts are (tune).
export const GLOBAL_EARN_CEILING = 600;
export const NPC_FAUCET_CAP = 50;    // GAME.md §Faucets: NPC staff rituals + tips, per 24h
export const COFFEE_STARS = 10;      // GAME.md §Dailies: the barista coffee
export const DAY_MS = 24 * 60 * 60 * 1000;

export function balanceOf(db: Database.Database, accountId: number): number {
  const row = db.prepare("SELECT balance FROM star_balances WHERE account_id = ?").get(accountId) as
    | { balance: number }
    | undefined;
  return row?.balance ?? 0;
}

const settled = (db: Database.Database, opKey: string): boolean =>
  db.prepare("SELECT 1 FROM ledger_entries WHERE op_key = ? LIMIT 1").get(opKey) !== undefined;

function earnedSince(db: Database.Database, accountId: number, since: number, op?: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(stars), 0) AS s FROM ledger_entries
       WHERE account_id = ? AND stars > 0 AND created_at > ?${op ? " AND op = ?" : ""}`,
    )
    .get(...(op ? [accountId, since, op] : [accountId, since])) as { s: number };
  return row.s;
}

export interface EarnResult {
  granted: number;
  balance: number;
}

/** Settled operations of one kind inside a window — the scored-plays counter. */
export function countOps(db: Database.Database, accountId: number, op: string, since: number): number {
  const row = db
    .prepare(
      "SELECT COUNT(DISTINCT op_key) AS n FROM ledger_entries WHERE account_id = ? AND op = ? AND created_at > ?",
    )
    .get(accountId, op, since) as { n: number };
  return row.n;
}

/** Deterministic faucet grant, clamped so rolling-24h earnings never pass the per-op cap or the
 *  global ceiling — the last grant before a cap pays the remainder, at the cap it pays zero.
 *  Replaying an op_key grants nothing. recordZero writes an entry even for a zero grant, so the
 *  operation still counts toward countOps (a busted arcade play consumes a scored play). */
export const settleEarn = timed(function settleEarn(
  db: Database.Database,
  opts: {
    opKey: string;
    op: string;
    accountId: number;
    amount: number;
    opCap: number;
    now?: number;
    recordZero?: boolean;
  },
): EarnResult {
  const now = opts.now ?? Date.now();
  const since = now - DAY_MS;
  return db.transaction((): EarnResult => {
    const done = (granted: number): EarnResult => ({ granted, balance: balanceOf(db, opts.accountId) });
    if (settled(db, opts.opKey)) return done(0);
    const granted = Math.max(
      0,
      Math.min(
        opts.amount,
        opts.opCap - earnedSince(db, opts.accountId, since, opts.op),
        GLOBAL_EARN_CEILING - earnedSince(db, opts.accountId, since),
      ),
    );
    if (granted === 0 && !opts.recordZero) return done(0);
    db.prepare(
      "INSERT INTO ledger_entries (op, op_key, account_id, stars, created_at) VALUES (?, ?, ?, ?, ?)",
    ).run(opts.op, opts.opKey, opts.accountId, granted, now);
    if (granted === 0) return done(0);
    db.prepare(
      `INSERT INTO star_balances (account_id, balance) VALUES (?, ?)
       ON CONFLICT(account_id) DO UPDATE SET balance = balance + excluded.balance`,
    ).run(opts.accountId, granted);
    return done(granted);
  })();
});

// GAME.md §Faucets registration row: 100 Stars trickled over the first 7 days, never a day-one
// lump (audit R-10, S19) — day 1 is the first payday, so a fresh alt is worth nothing on the day
// it is made. No scheduler: the days owed are settled the next time the account joins, and the
// op_key makes each day payable exactly once however often that happens.
export const TRICKLE_SCHEDULE = [15, 15, 15, 15, 15, 15, 10];
const TRICKLE_TOTAL = TRICKLE_SCHEDULE.reduce((a, b) => a + b, 0);

export function settleTrickle(
  db: Database.Database,
  accountId: number,
  now = Date.now(),
): EarnResult {
  const row = db.prepare("SELECT created_at AS createdAt FROM accounts WHERE id = ?").get(accountId) as
    | { createdAt: number }
    | undefined;
  if (!row) return { granted: 0, balance: balanceOf(db, accountId) };

  const due = Math.min(TRICKLE_SCHEDULE.length, Math.floor((now - row.createdAt) / DAY_MS));
  let granted = 0;
  for (let day = 1; day <= due; day++) {
    granted += settleEarn(db, {
      opKey: `trickle:${accountId}:${day}`,
      op: "trickle",
      accountId,
      amount: TRICKLE_SCHEDULE[day - 1] ?? 0,
      // The schedule itself is the limit, so the per-op window must not clamp a catch-up: a
      // player away for three days is owed all three paydays at once.
      opCap: TRICKLE_TOTAL,
      now,
    }).granted;
  }
  return { granted, balance: balanceOf(db, accountId) };
}

export type PurchaseResult =
  | { ok: true; itemId: number; balance: number }
  | { ok: false; reason: string };

/** Catalog purchase: debit + item mint + provenance rows in one transaction. Fails closed on
 *  insufficient balance — the CHECK(balance >= 0) constraint backstops this test. Replaying an
 *  op_key buys nothing twice. */
export const settlePurchase = timed(function settlePurchase(
  db: Database.Database,
  opts: { opKey: string; accountId: number; defId: string; price: number; now?: number },
): PurchaseResult {
  const now = opts.now ?? Date.now();
  return db.transaction((): PurchaseResult => {
    if (settled(db, opts.opKey)) {
      return { ok: false, reason: "this purchase was already settled" };
    }
    if (balanceOf(db, opts.accountId) < opts.price) {
      return { ok: false, reason: `not enough Stars — that costs ${opts.price}` };
    }
    db.prepare("UPDATE star_balances SET balance = balance - ? WHERE account_id = ?").run(
      opts.price,
      opts.accountId,
    );
    // Bind-on-purchase, 72 hours (#237): a bought item cannot be handed on until it clears.
    const itemId = Number(
      db
        .prepare(
          "INSERT INTO furni_items (def_id, owner_id, room_id, state, bind_until) VALUES (?, ?, NULL, 0, ?)",
        )
        .run(opts.defId, opts.accountId, now + BIND_MS).lastInsertRowid,
    );
    const entry = db.prepare(
      `INSERT INTO ledger_entries (op, op_key, seq, account_id, stars, item_id, created_at)
       VALUES ('purchase', ?, ?, ?, ?, ?, ?)`,
    );
    entry.run(opts.opKey, 0, opts.accountId, -opts.price, null, now);
    entry.run(opts.opKey, 1, opts.accountId, 0, itemId, now);
    return { ok: true, itemId, balance: balanceOf(db, opts.accountId) };
  })();
});

export type SpendResult =
  | { ok: true; balance: number; itemId?: number }
  | { ok: false; reason: string };

/** The shape every #210 sink shares: debit Stars, optionally mint one item, log both under one
 *  op so /api/metrics can show what each sink absorbs. `bound` items can never be traded away
 *  (settleTrade refuses them) and `inscription` is the engraving shown on click.
 *
 *  A sink with `price` 0 still writes its entry — a Luck Lever pull that wins nothing has to be
 *  visible, and a free mint (a completed collection set) is absorption of a different kind. */
export const settleSpend = timed(function settleSpend(
  db: Database.Database,
  opts: {
    opKey: string;
    op: string;
    accountId: number;
    price: number;
    mint?: { defId: string; bound?: boolean; inscription?: string };
    now?: number;
  },
): SpendResult {
  const now = opts.now ?? Date.now();
  return db.transaction((): SpendResult => {
    if (settled(db, opts.opKey)) return { ok: false, reason: "that was already settled" };
    if (balanceOf(db, opts.accountId) < opts.price) {
      return { ok: false, reason: `not enough Stars — that costs ${opts.price}` };
    }
    if (opts.price > 0) {
      db.prepare("UPDATE star_balances SET balance = balance - ? WHERE account_id = ?")
        .run(opts.price, opts.accountId);
    }
    const entry = db.prepare(
      `INSERT INTO ledger_entries (op, op_key, seq, account_id, stars, item_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    entry.run(opts.op, opts.opKey, 0, opts.accountId, -opts.price, null, now);
    let itemId: number | undefined;
    if (opts.mint) {
      itemId = Number(
        db
          .prepare(
            "INSERT INTO furni_items (def_id, owner_id, room_id, state, bound, inscription, bind_until)" +
              " VALUES (?, ?, NULL, 0, ?, ?, ?)",
          )
          .run(
            opts.mint.defId,
            opts.accountId,
            opts.mint.bound ? 1 : 0,
            opts.mint.inscription ?? null,
            // A permanently bound mint never trades, so a timer on it would be noise. The
            // tradeable ones — Luck Lever prizes — bind for 72 hours like a purchase (#237):
            // the lever is the pod's cheapest route to fresh tradeable goods.
            opts.mint.bound ? null : now + BIND_MS,
          )
          .lastInsertRowid,
      );
      entry.run(opts.op, opts.opKey, 1, opts.accountId, 0, itemId, now);
    }
    return { ok: true, balance: balanceOf(db, opts.accountId), ...(itemId ? { itemId } : {}) };
  })();
});

/** Awards a badge once. Returns false when the account already had it. */
export function awardBadge(
  db: Database.Database,
  accountId: number,
  badgeId: string,
  now = Date.now(),
): boolean {
  return (
    db
      .prepare("INSERT OR IGNORE INTO badges (account_id, badge_id, earned_at) VALUES (?, ?, ?)")
      .run(accountId, badgeId, now).changes > 0
  );
}

/** Item-grant rows (starter kit, mints). The caller owns the surrounding transaction. */
export function logItemGrants(
  db: Database.Database,
  opts: { opKey: string; op: string; accountId: number; itemIds: number[]; now?: number },
): void {
  const stmt = db.prepare(
    "INSERT INTO ledger_entries (op, op_key, seq, account_id, item_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  );
  const now = opts.now ?? Date.now();
  opts.itemIds.forEach((itemId, seq) =>
    stmt.run(opts.op, opts.opKey, seq, opts.accountId, itemId, now),
  );
}

interface TradeSideInput {
  accountId: number;
  itemIds: number[];
}

export type TradeResult =
  | { ok: true; aReceived: InventoryItem[]; bReceived: InventoryItem[] }
  | { ok: false; reason: string };

/** Items-for-items swap in one ACID transaction: every item is re-verified as owned by its side
 *  and in inventory, or nothing moves — fail closed. Replaying an op_key changes nothing. */
export const settleTrade = timed(function settleTrade(
  db: Database.Database,
  opts: { opKey: string; a: TradeSideInput; b: TradeSideInput; now?: number },
): TradeResult {
  const now = opts.now ?? Date.now();
  return db.transaction((): TradeResult => {
    if (settled(db, opts.opKey)) return { ok: true, aReceived: [], bReceived: [] };
    const pick = db.prepare(
      "SELECT id, def_id AS defId, owner_id AS ownerId, room_id AS roomId, bound, bind_until AS bindUntil" +
        " FROM furni_items WHERE id = ?",
    );
    const defIds = new Map<number, string>();
    for (const side of [opts.a, opts.b]) {
      for (const itemId of side.itemIds) {
        const row = pick.get(itemId) as
          | {
              id: number; defId: string; ownerId: number; roomId: number | null;
              bound: number; bindUntil: number | null;
            }
          | undefined;
        if (!row || row.ownerId !== side.accountId || row.roomId !== null) {
          return { ok: false, reason: "an offered item is no longer available" };
        }
        // Account-bound items never change hands (GAME.md §Status systems, #210). The check lives
        // here, in the only code that moves an owner_id, rather than only in the trade UI —
        // a client that never asks the UI still cannot launder a prestige fixture.
        if (row.bound) {
          return { ok: false, reason: "an offered item is account-bound and cannot be traded" };
        }
        if (row.bindUntil !== null && row.bindUntil > now) {
          return { ok: false, reason: "an offered item is still within its 72-hour bind" };
        }
        defIds.set(itemId, row.defId);
      }
    }
    // GAME.md §Transfer limits (#237): the rolling 7-day net outbound budget, enforced at the
    // ledger so every path that moves goods inherits it. Checked after the items are verified so
    // a stale offer fails as a stale offer, not as a budget refusal.
    const values = (side: TradeSideInput): string[] =>
      side.itemIds.map((itemId) => defIds.get(itemId) ?? "");
    for (const [side, other] of [[opts.a, opts.b], [opts.b, opts.a]] as const) {
      const check = checkBudget(db, side.accountId, swingOf(values(side), values(other)), now);
      if (!check.ok) {
        return {
          ok: false,
          reason: `that would pass a 7-day transfer limit (${check.used + check.swing} of ${check.budget})`,
        };
      }
    }
    const move = db.prepare("UPDATE furni_items SET owner_id = ? WHERE id = ?");
    const entry = db.prepare(
      `INSERT INTO ledger_entries (op, op_key, seq, account_id, item_id, counterparty_id, created_at)
       VALUES ('trade', ?, ?, ?, ?, ?, ?)`,
    );
    let seq = 0;
    const transfer = (giver: TradeSideInput, receiver: TradeSideInput): InventoryItem[] =>
      giver.itemIds.map((itemId) => {
        move.run(receiver.accountId, itemId);
        entry.run(opts.opKey, seq++, receiver.accountId, itemId, giver.accountId, now);
        return { id: itemId, defId: defIds.get(itemId) ?? "" };
      });
    const bReceived = transfer(opts.a, opts.b);
    const aReceived = transfer(opts.b, opts.a);
    return { ok: true, aReceived, bReceived };
  })();
});
