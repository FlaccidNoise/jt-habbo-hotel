import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import Database from "better-sqlite3";
import { BLACKJACK_OP } from "../src/blackjack.ts";
import { DAILY_STAKE_CAP } from "../src/ledger.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { WebSocket } from "ws";

// Blackjack end to end (#428), over the socket and against the real ledger. Every deck below is
// scripted, so each hand is an exact claim about an exact deal rather than a claim about the
// average of a shoe. Cards are drawn player, player, dealer, dealer, then in the order they are
// asked for; anything past the script is a 7.

let dir: string;
let dbPath: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-blackjack-"));
  dbPath = join(dir, "test.db");
  srv = undefined;
});

afterEach(async () => {
  if (srv) await srv.close();
  srv = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function start(deck: number[]): Promise<ServerHandle> {
  const cards = [...deck];
  srv = await startServer({
    port: 0,
    dbPath,
    npcGenerate: null,
    blackjackDraw: () => cards.shift() ?? 7,
  });
  return srv;
}

interface Player { ws: WebSocket; bus: Bus; id: number }

async function joinAs(port: number, username: string): Promise<Player> {
  const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ username, password: "password1" }),
  });
  const { token } = (await res.json()) as { token: string };
  const [ws, bus] = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId: 2 }));
  const state = await bus.waitFor("room_state");
  return { ws, bus, id: state.you };
}

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Nothing earns 500 Stars inside a test — the daily ceiling is 600 — so a stake starts from a
 *  credited balance, the way the sink tests do. */
function fund(accountId: number, amount: number): void {
  withDb((db) =>
    db
      .prepare(
        `INSERT INTO star_balances (account_id, balance) VALUES (?, ?)
         ON CONFLICT(account_id) DO UPDATE SET balance = balance + excluded.balance`,
      )
      .run(accountId, amount),
  );
}

const balance = (accountId: number): number =>
  withDb((db) => (db.prepare("SELECT balance FROM star_balances WHERE account_id = ?")
    .get(accountId) as { balance: number } | undefined)?.balance ?? 0);

/** The hand's ledger rows in the order they were written: the stake, then the return if there
 *  was one. Keyed rows, because the second must not reuse the first's op_key. */
const rows = (accountId: number): Array<{ opKey: string; stars: number }> =>
  withDb((db) =>
    db
      .prepare(
        "SELECT op_key AS opKey, stars FROM ledger_entries WHERE account_id = ? AND op = ?" +
          " ORDER BY id",
      )
      .all(accountId, BLACKJACK_OP) as Array<{ opKey: string; stars: number }>);

const deal = (p: Player, stake: number): void =>
  p.ws.send(JSON.stringify({ t: "bj_deal", stake }));

/** The join hands a fresh account its onboarding prompt on the same channel the table's
 *  announcement rides, so a test that reads announcements clears that one first. */
const drainHint = (p: Player): Promise<unknown> => p.bus.waitFor("notice");

test("the table opens for a player standing at it, and refuses one across the room", async () => {
  const { port } = await start([7, 8, 9, 5]);
  const { ws, bus, id } = await joinAs(port, "alice");
  const itemId = withDb((db) =>
    (db.prepare("SELECT id FROM furni_items WHERE room_id = 2 AND def_id = ?")
      .get("blackjack_table") as { id: number }).id);

  // The door is at (0,6) and the felt at (6,13), so a use from the spawn tile is out of reach.
  ws.send(JSON.stringify({ t: "use", itemId }));
  expect((await bus.waitFor("error")).code).toBe("bad_position");

  ws.send(JSON.stringify({ t: "move", x: 6, y: 12 }));
  const walk = await bus.waitFor("walk");
  await new Promise((r) => setTimeout(r, walk.path.length * walk.msPerTile + 250));

  ws.send(JSON.stringify({ t: "use", itemId }));
  expect(await bus.waitFor("blackjack_state")).toMatchObject({
    phase: "idle", player: [], dealer: [], stake: 0, stakedToday: 0,
  });

  // Using it again with a hand in play re-sends that hand rather than starting a second one:
  // this is the path a reopened panel and a reconnected socket both take.
  fund(id, 100);
  ws.send(JSON.stringify({ t: "bj_deal", stake: 25 }));
  await bus.waitFor("stars");
  await bus.waitFor("blackjack_state");
  await new Promise((r) => setTimeout(r, 750));   // the room's use cooldown
  ws.send(JSON.stringify({ t: "use", itemId }));
  expect(await bus.waitFor("blackjack_state")).toMatchObject({
    phase: "player", player: [7, 8], dealer: [9], stake: 25,
  });
}, 30_000);

test("a deal debits the stake through the ledger", async () => {
  const { port } = await start([7, 8, 9, 5]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 25);

  expect(await alice.bus.waitFor("stars")).toMatchObject({ delta: -25, balance: 75 });
  expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({
    phase: "player", player: [7, 8], dealer: [9], stake: 25, stakedToday: 25,
  });
  expect(balance(alice.id)).toBe(75);
  expect(rows(alice.id).map((r) => r.stars)).toEqual([-25]);
});

// The hole card is the one thing a client must not be able to read early. It is in the service's
// hand and in no message until the hand is over.
test("the dealer's second card stays hidden until the hand resolves", async () => {
  const { port } = await start([7, 8, 9, 5, 4]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 10);
  await alice.bus.waitFor("stars");
  expect((await alice.bus.waitFor("blackjack_state")).dealer).toEqual([9]);

  alice.ws.send(JSON.stringify({ t: "bj_hit" }));
  expect((await alice.bus.waitFor("blackjack_state")).dealer).toEqual([9]);   // player 19 now

  alice.ws.send(JSON.stringify({ t: "bj_stand" }));
  expect((await alice.bus.waitFor("blackjack_state")).dealer).toEqual([9, 5, 7]);
});

test("a blackjack at 25 pays 63 — the odd Star of the 3:2 goes to the player", async () => {
  const { port } = await start([1, 13, 9, 5]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 25);

  expect(await alice.bus.waitFor("stars")).toMatchObject({ delta: -25 });
  expect(await alice.bus.waitFor("stars")).toMatchObject({ delta: 63, reason: "blackjack" });
  expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({
    phase: "resolved", player: [1, 13], dealer: [9, 5], outcome: "blackjack", paid: 63,
  });
  expect(balance(alice.id)).toBe(100 - 25 + 63);

  const ledger = rows(alice.id);
  expect(ledger.map((r) => r.stars)).toEqual([-25, 63]);
  expect(ledger[1]?.opKey).toBe(`${ledger[0]?.opKey}:win`);
});

test("equal totals push and the stake comes back whole", async () => {
  const { port } = await start([10, 9, 10, 9]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 25);
  await alice.bus.waitFor("stars");
  await alice.bus.waitFor("blackjack_state");

  alice.ws.send(JSON.stringify({ t: "bj_stand" }));
  expect(await alice.bus.waitFor("stars")).toMatchObject({ delta: 25 });
  expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({
    phase: "resolved", outcome: "push", paid: 25,
  });
  expect(balance(alice.id)).toBe(100);
  expect(rows(alice.id).map((r) => r.stars)).toEqual([-25, 25]);
});

test("the dealer draws to 17 and no further", async () => {
  const { port } = await start([10, 9, 7, 6, 4, 12]);   // dealer 13, draws a 4, stands on 17
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 25);
  await alice.bus.waitFor("stars");
  await alice.bus.waitFor("blackjack_state");

  alice.ws.send(JSON.stringify({ t: "bj_stand" }));
  await alice.bus.waitFor("stars");
  expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({
    phase: "resolved", dealer: [7, 6, 4], outcome: "win", paid: 50,
  });
});

// S17 is a house rule with money on it: a dealer who hit soft 17 would be a different game and a
// different edge. A soft 17 has to end the hand with two cards in the dealer's row.
test("the dealer stands on soft 17", async () => {
  const { port } = await start([10, 9, 1, 6, 3]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 25);
  await alice.bus.waitFor("stars");
  await alice.bus.waitFor("blackjack_state");

  alice.ws.send(JSON.stringify({ t: "bj_stand" }));
  await alice.bus.waitFor("stars");
  const done = await alice.bus.waitFor("blackjack_state");
  expect(done.dealer).toEqual([1, 6]);
  expect(done).toMatchObject({ outcome: "win", paid: 50 });
});

test("a player bust loses the stake and writes no return", async () => {
  const { port } = await start([10, 9, 5, 5, 10]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 25);
  await alice.bus.waitFor("stars");
  await alice.bus.waitFor("blackjack_state");

  alice.ws.send(JSON.stringify({ t: "bj_hit" }));
  expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({
    phase: "resolved", player: [10, 9, 10], outcome: "loss", paid: 0,
  });
  await alice.bus.never("stars", 100);
  expect(rows(alice.id).map((r) => r.stars)).toEqual([-25]);
  expect(balance(alice.id)).toBe(75);
});

// ROADMAP acceptance: stake 501 of the day is refused. The cap lives in settleSpend, so this is
// the whole hotel's cap being enforced at a table that never asks for it by name.
test("stake 501 of the day is refused", async () => {
  const dealerNatural = [10, 9, 1, 13];               // dealer blackjack: every hand ends at once
  const { port } = await start(Array.from({ length: 5 }, () => dealerNatural).flat());
  const alice = await joinAs(port, "alice");
  fund(alice.id, 1000);

  for (let i = 0; i < 5; i++) {
    deal(alice, 100);
    await alice.bus.waitFor("stars");
    expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({
      phase: "resolved", outcome: "loss", stakedToday: 100 * (i + 1),
    });
  }
  expect(rows(alice.id)).toHaveLength(5);
  const staked = balance(alice.id);
  expect(staked).toBe(1000 - DAILY_STAKE_CAP);

  deal(alice, 10);
  const refused = await alice.bus.waitFor("error");
  expect(refused.code).toBe("casino");
  expect(refused.message).toMatch(/daily stake cap — 0 ★ of 500 left to stake today/);
  expect(rows(alice.id)).toHaveLength(5);
  expect(balance(alice.id)).toBe(staked);
});

test("a stake the balance cannot cover deals nothing", async () => {
  const { port } = await start([1, 13, 9, 5]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 9);
  deal(alice, 10);

  expect(await alice.bus.waitFor("error")).toMatchObject({
    code: "casino", message: expect.stringMatching(/not enough Stars/) as unknown as string,
  });
  expect(rows(alice.id)).toEqual([]);
  expect(balance(alice.id)).toBe(9);
});

test("an off-table stake is refused before the ledger is asked", async () => {
  const { port } = await start([]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 40);
  expect((await alice.bus.waitFor("error")).code).toBe("casino");
  expect(rows(alice.id)).toEqual([]);
});

test("hitting or standing with no hand is an error, not a crash", async () => {
  const { port } = await start([10, 9, 10, 7]);
  const alice = await joinAs(port, "alice");
  alice.ws.send(JSON.stringify({ t: "bj_hit" }));
  expect((await alice.bus.waitFor("error")).code).toBe("casino");
  alice.ws.send(JSON.stringify({ t: "bj_stand" }));
  expect((await alice.bus.waitFor("error")).code).toBe("casino");

  // And the socket still works: the same connection deals a hand afterwards.
  fund(alice.id, 100);
  deal(alice, 25);
  await alice.bus.waitFor("stars");
  await alice.bus.waitFor("blackjack_state");
  expect(rows(alice.id).map((r) => r.stars)).toEqual([-25]);
});

test("standing twice pays once — the second stand finds no hand", async () => {
  const { port } = await start([10, 9, 10, 7]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 25);
  await alice.bus.waitFor("stars");
  await alice.bus.waitFor("blackjack_state");

  alice.ws.send(JSON.stringify({ t: "bj_stand" }));
  await alice.bus.waitFor("stars");
  expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({ outcome: "win", paid: 50 });

  alice.ws.send(JSON.stringify({ t: "bj_stand" }));
  expect((await alice.bus.waitFor("error")).code).toBe("casino");
  await alice.bus.never("stars", 100);
  expect(rows(alice.id).map((r) => r.stars)).toEqual([-25, 50]);
});

test("a second deal mid-hand is refused", async () => {
  const { port } = await start([10, 9, 10, 7]);
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 25);
  await alice.bus.waitFor("stars");
  await alice.bus.waitFor("blackjack_state");

  deal(alice, 25);
  const refused = await alice.bus.waitFor("error");
  expect(refused).toMatchObject({ code: "casino" });
  expect(refused.message).toMatch(/finish your hand/);
  expect(rows(alice.id).map((r) => r.stars)).toEqual([-25]);
});

// The room can see the table (#433). A hand is private machinery — one account, one service —
// so the win is the only part of it the bystanders get, on the same win-only rule the wheel keeps.
test("a win and a natural are announced to the whole room", async () => {
  const { port } = await start([10, 9, 10, 7, 1, 13, 9, 5]);
  const alice = await joinAs(port, "alice");
  const bob = await joinAs(port, "bob");
  await drainHint(alice);
  await drainHint(bob);
  fund(alice.id, 100);

  deal(alice, 25);                                    // player 19, dealer stands on 17
  await alice.bus.waitFor("blackjack_state");
  alice.ws.send(JSON.stringify({ t: "bj_stand" }));
  expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({ outcome: "win", paid: 50 });
  expect((await bob.bus.waitFor("notice")).text).toBe("alice wins 50 ★ at the card table");
  expect((await alice.bus.waitFor("notice")).text).toBe("alice wins 50 ★ at the card table");

  deal(alice, 25);                                    // an ace and a king: it ends where it stands
  expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({
    outcome: "blackjack", paid: 63,
  });
  expect((await bob.bus.waitFor("notice")).text).toBe("alice takes blackjack — 63 ★");
});

test("a loss stays between the player and the dealer", async () => {
  const { port } = await start([10, 9, 5, 5, 10]);    // the hit takes the player to 29
  const alice = await joinAs(port, "alice");
  const bob = await joinAs(port, "bob");
  await drainHint(alice);
  await drainHint(bob);
  fund(alice.id, 100);

  deal(alice, 25);
  await alice.bus.waitFor("blackjack_state");
  alice.ws.send(JSON.stringify({ t: "bj_hit" }));
  expect(await alice.bus.waitFor("blackjack_state")).toMatchObject({ outcome: "loss", paid: 0 });
  await bob.bus.never("notice", 200);
  await alice.bus.never("notice", 100);
});

// Walking away stands the hand. A hand that voided on disconnect would refund a player who saw
// the cards first, so the settlement has to happen without them — exactly once.
test("leaving mid-hand stands it and settles it", async () => {
  const { port } = await start([10, 9, 10, 7]);   // player 19, dealer 17: a win the player never sees
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);
  deal(alice, 25);
  await alice.bus.waitFor("stars");
  await alice.bus.waitFor("blackjack_state");

  alice.ws.close();
  const deadline = Date.now() + 1000;
  for (;;) {
    const ledger = rows(alice.id);
    if (ledger.length > 1) {
      expect(ledger.map((r) => r.stars)).toEqual([-25, 50]);
      expect(ledger[1]?.opKey).toBe(`${ledger[0]?.opKey}:win`);
      expect(balance(alice.id)).toBe(125);
      break;
    }
    if (Date.now() > deadline) throw new Error("the hand was never settled after the disconnect");
    await new Promise((r) => setTimeout(r, 25));
  }
});
