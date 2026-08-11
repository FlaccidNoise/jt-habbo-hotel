import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import Database from "better-sqlite3";
import { STARTER_GRANT_SETS } from "@grand/shared";
import { settleEarn } from "../src/ledger.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { WebSocket } from "ws";

let dir: string;
let dbPath: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-purchase-"));
  dbPath = join(dir, "test.db");
  srv = undefined;
});

afterEach(async () => {
  if (srv) await srv.close();
  srv = undefined;
  rmSync(dir, { recursive: true, force: true });
});

interface Joined { ws: WebSocket; bus: Bus; id: number; ownedSets: number[] }

/** Drains the join's own `wardrobe` message, so a later waitFor("wardrobe") can only match one a
 *  purchase sent. */
async function joinAs(port: number, username: string): Promise<Joined> {
  const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ username, password: "password1" }),
  });
  const { token } = (await res.json()) as { token: string };
  const [ws, bus] = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId: 2 }));
  const state = await bus.waitFor("room_state");
  const { ownedSets } = await bus.waitFor("wardrobe");
  return { ws, bus, id: state.you, ownedSets };
}

/** Fund an account through a second connection to the same database file. */
function fund(accountId: number, amount: number): void {
  const db = new Database(dbPath);
  try {
    settleEarn(db, { opKey: `fund:${accountId}`, op: "test_grant", accountId, amount, opCap: 1000 });
  } finally {
    db.close();
  }
}

test("buying with no Stars fails closed with a purchase error", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  alice.ws.send(JSON.stringify({ t: "buy", defId: "chair_basic" }));
  const err = await alice.bus.waitFor("error");
  expect(err.code).toBe("purchase");
  await alice.bus.never("inventory_add", 100);
});

test("a funded buy debits Stars and delivers the item", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 100);
  alice.ws.send(JSON.stringify({ t: "buy", defId: "chair_basic" }));
  const paid = await alice.bus.waitFor("stars");
  expect(paid).toEqual({ t: "stars", balance: 75, delta: -25, reason: "purchase" });
  const added = await alice.bus.waitFor("inventory_add");
  expect(added.item.defId).toBe("chair_basic");
});

test("an unknown catalog id is refused", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 500);
  alice.ws.send(JSON.stringify({ t: "buy", defId: "yacht_deluxe" }));
  const err = await alice.bus.waitFor("error");
  expect(err.code).toBe("purchase");
});

// The wardrobe's Stars shelf (#352). A garment is bought once and owned for good: it mints no
// item, so nothing lands in the inventory and nothing can ever be traded away.
const CURLS = 30;        // 350 ★
const BUZZ = 32;         // 150 ★

/** Every ledger row an account has, oldest first. */
function ledger(accountId: number): Array<Record<string, unknown>> {
  const db = new Database(dbPath);
  try {
    return db
      .prepare("SELECT op, seq, stars, item_id AS itemId FROM ledger_entries WHERE account_id = ?"
        + " ORDER BY id")
      .all(accountId) as Array<Record<string, unknown>>;
  } finally {
    db.close();
  }
}

test("the join tells the client its whole wardrobe, not just what it is wearing", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  expect(alice.ownedSets).toEqual([...STARTER_GRANT_SETS].sort((a, b) => a - b));
  expect(alice.ownedSets).not.toContain(CURLS);
});

test("buying hair with no Stars fails closed and grants nothing", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  alice.ws.send(JSON.stringify({ t: "buy_set", setId: CURLS }));
  const err = await alice.bus.waitFor("error");
  expect(err.code).toBe("purchase");
  expect(err.message).toContain("350");
  await alice.bus.never("wardrobe", 100);
  await alice.bus.never("stars", 100);
});

test("a funded buy debits Stars and hands back the widened wardrobe", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 400);
  alice.ws.send(JSON.stringify({ t: "buy_set", setId: CURLS }));
  const paid = await alice.bus.waitFor("stars");
  expect(paid).toEqual({ t: "stars", balance: 50, delta: -350, reason: "wardrobe" });
  const { ownedSets } = await alice.bus.waitFor("wardrobe");
  expect(ownedSets).toContain(CURLS);
  // A set is not an item: nothing is minted, so nothing reaches the inventory or the trade economy.
  await alice.bus.never("inventory_add", 100);
});

test("the purchase writes one debit-only row under its own op", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 400);
  alice.ws.send(JSON.stringify({ t: "buy_set", setId: CURLS }));
  await alice.bus.waitFor("wardrobe");
  expect(ledger(alice.id).filter((r) => r["op"] === "catalog_wearable"))
    .toEqual([{ op: "catalog_wearable", seq: 0, stars: -350, itemId: null }]);
});

test("buying the same set twice is refused, and charges once", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 400);
  alice.ws.send(JSON.stringify({ t: "buy_set", setId: BUZZ }));
  await alice.bus.waitFor("wardrobe");
  alice.ws.send(JSON.stringify({ t: "buy_set", setId: BUZZ }));
  const err = await alice.bus.waitFor("error");
  expect(err.code).toBe("purchase");
  expect(err.message).toContain("already yours");
  expect(ledger(alice.id).filter((r) => r["op"] === "catalog_wearable").length).toBe(1);
});

// Granted sets and the staff uniform are not stock. Charging for one would sell an account
// something it already has, or something it can never wear.
test.each([
  ["a starter garment", 5],
  ["a granted face", 17],
  ["the staff blazer", 16],
  ["a set that does not exist", 999],
])("%s is not for sale", async (_label, setId) => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 600);
  alice.ws.send(JSON.stringify({ t: "buy_set", setId }));
  const err = await alice.bus.waitFor("error");
  expect(err.code).toBe("purchase");
  await alice.bus.never("stars", 100);
  expect(ledger(alice.id).filter((r) => r["op"] === "catalog_wearable")).toEqual([]);
});

test("a bought set is wearable, and the same set is not for a different account", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 400);
  alice.ws.send(JSON.stringify({ t: "buy_set", setId: CURLS }));
  await alice.bus.waitFor("wardrobe");
  alice.ws.send(JSON.stringify({
    t: "set_figure", figure: `v1|hd-2-skin_3.hr-${CURLS}-walnut.lg-7-navy.sh-9-charcoal`,
  }));
  expect((await alice.bus.waitFor("figure_changed")).figure).toContain(`hr-${CURLS}-walnut`);

  const bob = await joinAs(srv.port, "bob");
  expect(bob.ownedSets).not.toContain(CURLS);
  bob.ws.send(JSON.stringify({
    t: "set_figure", figure: `v1|hd-2-skin_3.hr-${CURLS}-walnut.lg-7-navy.sh-9-charcoal`,
  }));
  expect((await bob.bus.waitFor("error")).code).toBe("figure");
});
