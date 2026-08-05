import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type Database from "better-sqlite3";
import { openDb, closeDb } from "../src/db.ts";
import { grantStarter, listInventory } from "../src/items.ts";
import {
  GLOBAL_EARN_CEILING,
  balanceOf,
  settleEarn,
  settlePurchase,
  settleTrade,
} from "../src/ledger.ts";
import { PROTOTYPE_CATALOG, STARTER_GRANT_DEFS } from "@grand/shared";

let dir: string;
let db: Database.Database;
let nextAccount = 0;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-ledger-"));
  db = openDb(join(dir, "test.db"));
});

afterEach(() => {
  closeDb(db);
  rmSync(dir, { recursive: true, force: true });
});

function account(): number {
  const name = `acct${++nextAccount}`;
  const info = db
    .prepare(
      `INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at)
       VALUES (?, ?, ?, ?, 'test', 0)`,
    )
    .run(name, name, Buffer.alloc(1), Buffer.alloc(1));
  return Number(info.lastInsertRowid);
}

function itemFor(accountId: number, defId = "chair_basic"): number {
  const info = db
    .prepare("INSERT INTO furni_items (def_id, owner_id, room_id, state) VALUES (?, ?, NULL, 0)")
    .run(defId, accountId);
  return Number(info.lastInsertRowid);
}

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;
let nextKey = 0;
const earn = (accountId: number, amount: number, over: Partial<Parameters<typeof settleEarn>[1]> = {}) =>
  settleEarn(db, {
    opKey: `k${++nextKey}`,
    op: "npc_coffee",
    accountId,
    amount,
    opCap: 50,
    now: T0,
    ...over,
  });

describe("settleEarn", () => {
  test("grants stars, rolls the balance, and appends one entry", () => {
    const id = account();
    expect(earn(id, 10)).toEqual({ granted: 10, balance: 10 });
    expect(balanceOf(db, id)).toBe(10);
    const rows = db.prepare("SELECT op, stars FROM ledger_entries WHERE account_id = ?").all(id);
    expect(rows).toEqual([{ op: "npc_coffee", stars: 10 }]);
  });

  test("replaying an op_key grants nothing", () => {
    const id = account();
    earn(id, 10, { opKey: "same" });
    expect(earn(id, 10, { opKey: "same" })).toEqual({ granted: 0, balance: 10 });
  });

  test("the per-op cap clamps, then pays zero", () => {
    const id = account();
    for (let i = 0; i < 4; i++) expect(earn(id, 10).granted).toBe(10);
    expect(earn(id, 12).granted).toBe(10);   // 40 earned, cap 50 — clamped to the remainder
    expect(earn(id, 10).granted).toBe(0);
    expect(balanceOf(db, id)).toBe(50);
  });

  test("the global ceiling clamps across ops", () => {
    const id = account();
    earn(id, 595, { op: "test_grant", opCap: 1000 });
    expect(earn(id, 10).granted).toBe(GLOBAL_EARN_CEILING - 595);
    expect(earn(id, 10).granted).toBe(0);
    expect(balanceOf(db, id)).toBe(GLOBAL_EARN_CEILING);
  });

  test("the window rolls: earnings older than 24h stop counting", () => {
    const id = account();
    for (let i = 0; i < 5; i++) earn(id, 10);
    expect(earn(id, 10).granted).toBe(0);
    expect(earn(id, 10, { now: T0 + 25 * HOUR }).granted).toBe(10);
  });
});

describe("append-only enforcement (staged bad writes must bounce)", () => {
  test("UPDATE and DELETE on ledger_entries are rejected by trigger", () => {
    const id = account();
    earn(id, 10);
    expect(() => db.prepare("UPDATE ledger_entries SET stars = 999").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM ledger_entries").run()).toThrow(/append-only/);
    expect(balanceOf(db, id)).toBe(10);
  });

  test("a negative balance is structurally impossible", () => {
    const id = account();
    earn(id, 10);
    expect(() =>
      db.prepare("UPDATE star_balances SET balance = -1 WHERE account_id = ?").run(id),
    ).toThrow(/CHECK/);
  });
});

describe("settleTrade", () => {
  test("swaps ownership atomically and logs both directions with counterparties", () => {
    const a = account();
    const b = account();
    const chairA = itemFor(a, "chair_basic");
    const plantB = itemFor(b, "plant_basic");
    const result = settleTrade(db, {
      opKey: "trade1",
      a: { accountId: a, itemIds: [chairA] },
      b: { accountId: b, itemIds: [plantB] },
      now: T0,
    });
    expect(result).toEqual({
      ok: true,
      aReceived: [{ id: plantB, defId: "plant_basic" }],
      bReceived: [{ id: chairA, defId: "chair_basic" }],
    });
    const owner = (id: number) =>
      (db.prepare("SELECT owner_id AS o FROM furni_items WHERE id = ?").get(id) as { o: number }).o;
    expect(owner(chairA)).toBe(b);
    expect(owner(plantB)).toBe(a);
    const rows = db
      .prepare(
        "SELECT account_id AS acct, item_id AS item, counterparty_id AS from_id FROM ledger_entries WHERE op_key = 'trade1' ORDER BY seq",
      )
      .all();
    expect(rows).toEqual([
      { acct: b, item: chairA, from_id: a },
      { acct: a, item: plantB, from_id: b },
    ]);
  });

  test("replaying the op_key moves nothing twice", () => {
    const a = account();
    const b = account();
    const item = itemFor(a);
    const args = {
      opKey: "trade2",
      a: { accountId: a, itemIds: [item] },
      b: { accountId: b, itemIds: [] },
    };
    expect(settleTrade(db, args).ok).toBe(true);
    expect(settleTrade(db, args)).toEqual({ ok: true, aReceived: [], bReceived: [] });
    expect(db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE op_key = 'trade2'").get()).toEqual({ n: 1 });
  });

  test("fails closed when an offered item is placed in a room — nothing moves", () => {
    const a = account();
    const b = account();
    const kept = itemFor(a);
    const placed = itemFor(b);
    db.prepare("UPDATE furni_items SET room_id = 1, x = 0, y = 0, z = 0, dir = 0 WHERE id = ?").run(placed);
    const result = settleTrade(db, {
      opKey: "trade3",
      a: { accountId: a, itemIds: [kept] },
      b: { accountId: b, itemIds: [placed] },
    });
    expect(result.ok).toBe(false);
    const owner = (id: number) =>
      (db.prepare("SELECT owner_id AS o FROM furni_items WHERE id = ?").get(id) as { o: number }).o;
    expect(owner(kept)).toBe(a);
    expect(owner(placed)).toBe(b);
    expect(db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE op_key = 'trade3'").get()).toEqual({ n: 0 });
  });

  test("fails closed when an item is not the giver's", () => {
    const a = account();
    const b = account();
    const item = itemFor(b);
    const result = settleTrade(db, {
      opKey: "trade4",
      a: { accountId: a, itemIds: [item] },   // a offers b's item
      b: { accountId: b, itemIds: [] },
    });
    expect(result.ok).toBe(false);
  });
});

describe("settlePurchase", () => {
  test("debits, mints the item, and logs both rows under one op_key", () => {
    const id = account();
    earn(id, 50, { op: "test_grant", opCap: 1000 });
    const result = settlePurchase(db, { opKey: "buy1", accountId: id, defId: "chair_basic", price: 25, now: T0 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.balance).toBe(25);
    const item = db
      .prepare("SELECT def_id AS defId, owner_id AS ownerId, room_id AS roomId FROM furni_items WHERE id = ?")
      .get(result.itemId);
    expect(item).toEqual({ defId: "chair_basic", ownerId: id, roomId: null });
    const rows = db
      .prepare("SELECT stars, item_id AS item FROM ledger_entries WHERE op_key = 'buy1' ORDER BY seq")
      .all();
    expect(rows).toEqual([
      { stars: -25, item: null },
      { stars: 0, item: result.itemId },
    ]);
  });

  test("fails closed on insufficient balance — no debit, no item", () => {
    const id = account();
    earn(id, 10);
    const before = db.prepare("SELECT COUNT(*) AS n FROM furni_items").get() as { n: number };
    const result = settlePurchase(db, { opKey: "buy2", accountId: id, defId: "sofa_basic", price: 150 });
    expect(result.ok).toBe(false);
    expect(balanceOf(db, id)).toBe(10);
    expect(db.prepare("SELECT COUNT(*) AS n FROM furni_items").get()).toEqual(before);
    expect(db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE op_key = 'buy2'").get()).toEqual({ n: 0 });
  });

  test("a spent Star does not refill earn headroom", () => {
    const id = account();
    for (let i = 0; i < 5; i++) earn(id, 10);   // NPC faucet cap reached
    settlePurchase(db, { opKey: "buy3", accountId: id, defId: "chair_basic", price: 25, now: T0 });
    expect(earn(id, 10).granted).toBe(0);
  });

  test("replaying an op_key buys nothing twice", () => {
    const id = account();
    earn(id, 50, { op: "test_grant", opCap: 1000 });
    const args = { opKey: "buy4", accountId: id, defId: "chair_basic", price: 25 };
    expect(settlePurchase(db, args).ok).toBe(true);
    expect(settlePurchase(db, args).ok).toBe(false);
    expect(balanceOf(db, id)).toBe(25);
  });
});

describe("item provenance", () => {
  test("the starter grant logs every item into the ledger", () => {
    const id = account();
    grantStarter(db, id);
    const rows = db
      .prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE account_id = ? AND op = 'starter'")
      .get(id) as { n: number };
    expect(rows.n).toBe(STARTER_GRANT_DEFS.length);
  });

  test("the starter grant is a proper subset of the catalog", () => {
    // Granting the whole catalog would hand every new account every item for free, bypassing the
    // Stars sink (#215). Adding a def must never change what a new account receives.
    const id = account();
    grantStarter(db, id);
    const granted = listInventory(db, id).map((i) => i.defId);
    const catalogIds = new Set(PROTOTYPE_CATALOG.map((d) => d.id));
    expect(granted.filter((defId) => !catalogIds.has(defId))).toEqual([]);
    expect(granted.length).toBeLessThan(catalogIds.size);
  });
});
