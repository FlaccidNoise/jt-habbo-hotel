import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type Database from "better-sqlite3";
import { closeDb, openDb } from "../src/db.ts";
import { DAY_MS, settleEarn, settlePurchase, settleTrade } from "../src/ledger.ts";
import {
  BIND_MS,
  BUDGET_BASE,
  BUDGET_PER_DAY,
  TRANSFER_WINDOW_MS,
  netOutbound,
  outboundBudget,
  overEarners,
  pairFlows,
  pods,
} from "../src/limits.ts";

// GAME.md §Transfer limits (#237). Stars never move between players, so goods are the whole
// laundering surface: these are the tests that the wall is load-bearing rather than documented.

const NOW = 1_700_000_000_000;

let dir: string;
let db: Database.Database;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-limits-"));
  db = openDb(join(dir, "test.db"));
});

afterEach(() => {
  closeDb(db);
  rmSync(dir, { recursive: true, force: true });
});

/** An account of a chosen age — tenure is the only term in the budget, so every test states it. */
function account(username: string, ageDays: number): number {
  return Number(
    db
      .prepare(
        "INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at)" +
          " VALUES (?, ?, ?, ?, '{}', ?)",
      )
      .run(username, username.toLowerCase(), Buffer.from("h"), Buffer.from("s"), NOW - ageDays * DAY_MS)
      .lastInsertRowid,
  );
}

/** A granted item: owned, in inventory, never purchased, so no bind clock. The starter kit. */
function grant(accountId: number, defId: string): number {
  return Number(
    db
      .prepare("INSERT INTO furni_items (def_id, owner_id, room_id, state) VALUES (?, ?, NULL, 0)")
      .run(defId, accountId).lastInsertRowid,
  );
}

/** Real faucet Stars. The 600/day global ceiling means a bigger bankroll takes several days. */
function fund(accountId: number, stars: number): void {
  for (let day = 0, left = stars; left > 0; day++) {
    const amount = Math.min(600, left);
    settleEarn(db, {
      opKey: `fund:${accountId}:${day}`,
      op: "arcade",
      accountId,
      amount,
      opCap: 600,
      now: NOW - day * DAY_MS,
    });
    left -= amount;
  }
}

const giveOneWay = (from: number, to: number, itemIds: number[], now = NOW, opKey = "t") =>
  settleTrade(db, { opKey, a: { accountId: from, itemIds }, b: { accountId: to, itemIds: [] }, now });

describe("bind-on-purchase (72 hours)", () => {
  test("a bought item cannot be handed on until the bind clears", () => {
    const alice = account("alice", 30);
    const bob = account("bob", 30);
    fund(alice, 150);

    const bought = settlePurchase(db, { opKey: "p1", accountId: alice, defId: "table_basic", price: 150, now: NOW });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;

    const early = giveOneWay(alice, bob, [bought.itemId], NOW + BIND_MS - 1, "early");
    expect(early).toEqual({ ok: false, reason: "an offered item is still within its 72-hour bind" });

    const late = giveOneWay(alice, bob, [bought.itemId], NOW + BIND_MS + 1, "late");
    expect(late.ok).toBe(true);
    expect(
      (db.prepare("SELECT owner_id AS o FROM furni_items WHERE id = ?").get(bought.itemId) as { o: number }).o,
    ).toBe(bob);
  });

  test("a granted item has no bind clock — the starter kit is not a purchase", () => {
    const alice = account("alice", 30);
    const bob = account("bob", 30);
    expect(giveOneWay(alice, bob, [grant(alice, "chair_basic")]).ok).toBe(true);
  });
});

describe("rolling 7-day net outbound budget", () => {
  test("the budget starts low and rises with tenure, capped", () => {
    expect(outboundBudget(db, account("fresh", 0), NOW)).toBe(BUDGET_BASE);
    expect(outboundBudget(db, account("week", 7), NOW)).toBe(BUDGET_BASE + 7 * BUDGET_PER_DAY);
    expect(outboundBudget(db, account("veteran", 500), NOW)).toBe(4200);
  });

  test("a day-old account bounces the second median item inside the window", () => {
    const alice = account("alice", 0);
    const bob = account("bob", 30);
    expect(giveOneWay(alice, bob, [grant(alice, "table_basic")], NOW, "first").ok).toBe(true);

    const second = giveOneWay(alice, bob, [grant(alice, "table_basic")], NOW + 1, "second");
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toContain("7-day transfer limit");
    expect(netOutbound(db, alice, NOW - TRANSFER_WINDOW_MS)).toBe(150); // the first one only
  });

  test("an even swap never bounces, however much value crosses", () => {
    const alice = account("alice", 0);
    const bob = account("bob", 0);
    const swap = settleTrade(db, {
      opKey: "swap",
      a: { accountId: alice, itemIds: [grant(alice, "casino_table")] },   // 300
      b: { accountId: bob, itemIds: [grant(bob, "bar_counter")] },        // 300
      now: NOW,
    });
    expect(swap.ok).toBe(true);
    expect(netOutbound(db, alice, NOW - TRANSFER_WINDOW_MS)).toBe(0);
  });

  test("the window rolls — value handed out 8 days ago is not still spent", () => {
    const alice = account("alice", 30);
    const bob = account("bob", 30);
    const old = NOW - 8 * DAY_MS;
    expect(giveOneWay(alice, bob, [grant(alice, "casino_table")], old, "old").ok).toBe(true);
    expect(netOutbound(db, alice, NOW - TRANSFER_WINDOW_MS)).toBe(0);
  });
});

describe("standing collusion queries", () => {
  /** Three alts funnelling their granted goods into one main — the classic pod. Each alt is old
   *  enough that the budget lets the hop through, which is the point: the wall slows a funnel,
   *  the queries are what find it. */
  function stagePod(): { main: number; alts: number[] } {
    const main = account("main", 30);
    const alts = [1, 2, 3].map((n) => account(`alt${n}`, 5));
    alts.forEach((alt, i) => {
      const items = ["casino_table"].map((defId) => grant(alt, defId));
      expect(giveOneWay(alt, main, items, NOW, `pod${i}`).ok).toBe(true);
    });
    return { main, alts };
  }

  test("net flow per pair names the funnel and its direction", () => {
    const { main, alts } = stagePod();
    const pairs = pairFlows(db, NOW - TRANSFER_WINDOW_MS);
    expect(pairs).toHaveLength(3);
    for (const pair of pairs) {
      expect(pair.b).toBe(main);          // b is the net receiver
      expect(alts).toContain(pair.a);
      expect(pair.net).toBe(300);
    }
  });

  test("outbound beyond inbound plus own earnings flags the alts, not the main", () => {
    const { main, alts } = stagePod();
    const flagged = overEarners(db, NOW - TRANSFER_WINDOW_MS).map((r) => r.accountId);
    expect(flagged.sort()).toEqual([...alts].sort());
    expect(flagged).not.toContain(main);
  });

  test("an account that paid for what it gave away is not flagged", () => {
    const alice = account("alice", 30);
    const bob = account("bob", 30);
    fund(alice, 300);
    const bought = settlePurchase(db, { opKey: "p", accountId: alice, defId: "casino_table", price: 300, now: NOW });
    expect(bought.ok).toBe(true);
    if (!bought.ok) return;
    expect(giveOneWay(alice, bob, [bought.itemId], NOW + BIND_MS + 1).ok).toBe(true);
    expect(overEarners(db, NOW - TRANSFER_WINDOW_MS).map((r) => r.accountId)).not.toContain(alice);
  });

  test("the pod surfaces as one insular component in a single run", () => {
    const { main, alts } = stagePod();
    const found = pods(db, NOW - TRANSFER_WINDOW_MS);
    expect(found).toHaveLength(1);
    expect(found[0]?.members).toEqual([main, ...alts].sort((x, y) => x - y));
    expect(found[0]?.internal).toBe(900);
    expect(found[0]?.external).toBe(0);
  });

  test("a pair that also trades with the hotel is not an insular component", () => {
    const { main, alts } = stagePod();
    // The main hands the same value back out to four unrelated players: no longer insular.
    const outsiders = [1, 2, 3, 4].map((n) => account(`outsider${n}`, 30));
    outsiders.forEach((outsider, i) => {
      const item = db
        .prepare("SELECT id FROM furni_items WHERE owner_id = ? LIMIT 1")
        .get(main) as { id: number };
      expect(giveOneWay(main, outsider, [item.id], NOW + 1, `out${i}`).ok).toBe(true);
      // Hand it straight back so the main keeps stock to give the next outsider.
      expect(giveOneWay(outsider, main, [item.id], NOW + 2, `back${i}`).ok).toBe(true);
    });
    expect(pods(db, NOW - TRANSFER_WINDOW_MS)).toEqual([]);
    expect(alts).toHaveLength(3);
  });
});
