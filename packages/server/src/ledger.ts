import type Database from "better-sqlite3";
import type { InventoryItem } from "@grand/shared";

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
export function settleEarn(
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
}

export type PurchaseResult =
  | { ok: true; itemId: number; balance: number }
  | { ok: false; reason: string };

/** Catalog purchase: debit + item mint + provenance rows in one transaction. Fails closed on
 *  insufficient balance — the CHECK(balance >= 0) constraint backstops this test. Replaying an
 *  op_key buys nothing twice. */
export function settlePurchase(
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
    const itemId = Number(
      db
        .prepare("INSERT INTO furni_items (def_id, owner_id, room_id, state) VALUES (?, ?, NULL, 0)")
        .run(opts.defId, opts.accountId).lastInsertRowid,
    );
    const entry = db.prepare(
      `INSERT INTO ledger_entries (op, op_key, seq, account_id, stars, item_id, created_at)
       VALUES ('purchase', ?, ?, ?, ?, ?, ?)`,
    );
    entry.run(opts.opKey, 0, opts.accountId, -opts.price, null, now);
    entry.run(opts.opKey, 1, opts.accountId, 0, itemId, now);
    return { ok: true, itemId, balance: balanceOf(db, opts.accountId) };
  })();
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
export function settleTrade(
  db: Database.Database,
  opts: { opKey: string; a: TradeSideInput; b: TradeSideInput; now?: number },
): TradeResult {
  const now = opts.now ?? Date.now();
  return db.transaction((): TradeResult => {
    if (settled(db, opts.opKey)) return { ok: true, aReceived: [], bReceived: [] };
    const pick = db.prepare(
      "SELECT id, def_id AS defId, owner_id AS ownerId, room_id AS roomId FROM furni_items WHERE id = ?",
    );
    const defIds = new Map<number, string>();
    for (const side of [opts.a, opts.b]) {
      for (const itemId of side.itemIds) {
        const row = pick.get(itemId) as
          | { id: number; defId: string; ownerId: number; roomId: number | null }
          | undefined;
        if (!row || row.ownerId !== side.accountId || row.roomId !== null) {
          return { ok: false, reason: "an offered item is no longer available" };
        }
        defIds.set(itemId, row.defId);
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
}
