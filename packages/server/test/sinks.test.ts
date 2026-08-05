import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import Database from "better-sqlite3";
import { COLLECTION_SETS, LEVER_COST, LEVER_PRIZES, LEVER_TOTAL_WEIGHT } from "@grand/shared";
import { flows } from "../src/metrics.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { ServerMsg } from "@grand/shared";
import type { WebSocket } from "ws";

// #210 wealth sinks end to end: the Stars have to actually leave, and /api/metrics has to be able
// to say which sink took them.

let dir: string;
let dbPath: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-sinks-"));
  dbPath = join(dir, "test.db");
  srv = undefined;
});

afterEach(async () => {
  if (srv) await srv.close();
  srv = undefined;
  rmSync(dir, { recursive: true, force: true });
});

interface Player { ws: WebSocket; bus: Bus; id: number; token: string }

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
  // Join emits set progress too; consume it so a later waitFor("sets") sees the current one
  // rather than this stale snapshot.
  await bus.waitFor("sets");
  return { ws, bus, id: state.you, token };
}

/** A second session for an account that already exists — registering again would 4401. */
async function rejoin(port: number, token: string): Promise<{ ws: WebSocket; bus: Bus }> {
  const [ws, bus] = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId: 2 }));
  await bus.waitFor("room_state");
  return { ws, bus };
}

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** Credits the balance directly rather than through settleEarn, which clamps every faucet to
 *  GLOBAL_EARN_CEILING (600/day) — deliberately, and the reason a 3,300-Star fixture is weeks of
 *  play. A sink test cannot earn its way to one, so it starts from a balance instead. */
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

/** A roll that lands squarely on the named prize. */
function rollFor(label: string): number {
  let low = 0;
  for (const prize of LEVER_PRIZES) {
    const high = low + prize.weight;
    if (prize.label === label) return (low + prize.weight / 2) / LEVER_TOTAL_WEIGHT;
    low = high;
  }
  throw new Error(`no such prize: ${label}`);
}

const BLANK = LEVER_PRIZES.find((p) => p.defId === null)!.label;
const WINNER = LEVER_PRIZES.find((p) => p.defId !== null)!;

test("a losing lever pull still takes the money", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null, leverRoll: () => rollFor(BLANK) });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 300);
  alice.ws.send(JSON.stringify({ t: "lever_pull" }));

  const paid = await alice.bus.waitFor("stars");
  expect(paid).toMatchObject({ balance: 200, delta: -LEVER_COST });
  const result = await alice.bus.waitFor("lever_result");
  expect(result.defId).toBeNull();
  expect(result.item).toBeUndefined();
  await alice.bus.never("inventory_add", 100);
});

test("a winning pull mints the prize and still charges for it", async () => {
  srv = await startServer({
    port: 0, dbPath, npcGenerate: null, leverRoll: () => rollFor(WINNER.label),
  });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 300);
  alice.ws.send(JSON.stringify({ t: "lever_pull" }));

  expect(await alice.bus.waitFor("stars")).toMatchObject({ balance: 200, delta: -LEVER_COST });
  const result = await alice.bus.waitFor("lever_result");
  expect(result.defId).toBe(WINNER.defId);
  const added = await alice.bus.waitFor("inventory_add");
  expect(added.item.defId).toBe(WINNER.defId);
});

test("pulling with too few Stars is refused and costs nothing", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null, leverRoll: () => rollFor(BLANK) });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, LEVER_COST - 1);
  alice.ws.send(JSON.stringify({ t: "lever_pull" }));
  expect((await alice.bus.waitFor("error")).code).toBe("purchase");
  expect(withDb((db) =>
    db.prepare("SELECT balance FROM star_balances WHERE account_id = ?").get(alice.id))).toEqual(
    { balance: LEVER_COST - 1 },
  );
});

test("a prestige fixture mints account-bound and cannot be traded", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 2000);
  alice.ws.send(JSON.stringify({ t: "buy", defId: "penthouse_candelabra" }));

  expect(await alice.bus.waitFor("stars")).toMatchObject({ balance: 200, reason: "prestige" });
  const added = await alice.bus.waitFor("inventory_add");
  expect(added.item).toMatchObject({ defId: "penthouse_candelabra", bound: true });
  expect(withDb((db) =>
    db.prepare("SELECT bound FROM furni_items WHERE id = ?").get(added.item.id))).toEqual(
    { bound: 1 },
  );

  // The trade window refuses it up front rather than cancelling three seconds after both accept.
  const bob = await joinAs(srv.port, "bob");
  alice.ws.send(JSON.stringify({ t: "trade_open", to: "bob" }));
  await bob.bus.waitFor("trade_invite");
  bob.ws.send(JSON.stringify({ t: "trade_open", to: "alice" }));
  await alice.bus.waitFor("trade_state");
  alice.ws.send(JSON.stringify({ t: "trade_offer", itemIds: [added.item.id] }));
  expect((await alice.bus.waitFor("error")).message).toMatch(/account-bound/);
});

const CAFE = COLLECTION_SETS.find((s) => s.id === "cafe")!;

/** Buys each def in turn and returns the set progress after the last one. Each buy emits its own
 *  progress message, so they are consumed here rather than left to shadow a later read. */
async function buyAll(
  player: { ws: WebSocket; bus: Bus }, defIds: readonly string[],
): Promise<Extract<ServerMsg, { t: "sets" }>> {
  let progress!: Extract<ServerMsg, { t: "sets" }>;
  for (const defId of defIds) {
    player.ws.send(JSON.stringify({ t: "buy", defId }));
    await player.bus.waitFor("inventory_add");
    progress = await player.bus.waitFor("sets");
  }
  return progress;
}

test("completing a set mints its reward and badge, exactly once ever", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 2000);

  // Everything but the last member: no reward yet, and the progress message says what is missing.
  const partial = await buyAll(alice, CAFE.members.slice(0, -1));
  const cafe = partial.sets.find((s) => s.id === CAFE.id)!;
  expect(cafe.complete).toBe(false);
  expect(cafe.missing).toEqual([CAFE.members.at(-1)]);
  await alice.bus.never("set_complete", 100);

  await buyAll(alice, CAFE.members.slice(-1));
  const done = await alice.bus.waitFor("set_complete");
  expect(done).toMatchObject({ setId: CAFE.id, badge: CAFE.badge });
  expect(done.item).toMatchObject({ defId: CAFE.reward, bound: true });

  expect(withDb((db) =>
    db.prepare("SELECT COUNT(*) AS n FROM badges WHERE account_id = ?").get(alice.id)))
    .toEqual({ n: 1 });

  // Re-joining must not pay again — the badge row is the idempotence key, so a second claim
  // would double-mint a bound item that can never be traded away.
  const again = await rejoin(srv.port, alice.token);
  await again.bus.waitFor("sets");
  await again.bus.never("set_complete", 200);
  expect(withDb((db) =>
    db.prepare("SELECT COUNT(*) AS n FROM furni_items WHERE owner_id = ? AND def_id = ?")
      .get(alice.id, CAFE.reward))).toEqual({ n: 1 });
});

test("the set reward is bound and carries its inscription", async () => {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 2000);
  await buyAll(alice, CAFE.members);
  const done = await alice.bus.waitFor("set_complete");
  expect(withDb((db) =>
    db.prepare("SELECT bound, inscription FROM furni_items WHERE id = ?").get(done.item.id)))
    .toEqual({ bound: 1, inscription: `${CAFE.name} — completed` });
});

// The reason #210 exists: /api/metrics reports absorption per op, so each sink must be its own op
// rather than everything landing under "purchase".
test("each sink absorbs under its own op in the metrics", async () => {
  srv = await startServer({
    port: 0, dbPath, npcGenerate: null, leverRoll: () => rollFor(BLANK),
  });
  const alice = await joinAs(srv.port, "alice");
  fund(alice.id, 5000);
  alice.ws.send(JSON.stringify({ t: "buy", defId: "chair_basic" }));
  await alice.bus.waitFor("stars");
  alice.ws.send(JSON.stringify({ t: "buy", defId: "penthouse_candelabra" }));
  await alice.bus.waitFor("stars");
  alice.ws.send(JSON.stringify({ t: "lever_pull" }));
  await alice.bus.waitFor("lever_result");

  const sinks = withDb((db) => flows(db, 0).sinks);
  expect(Object.fromEntries(sinks.map((s) => [s.op, s.stars]))).toEqual({
    purchase: 25,
    prestige: 1800,
    lever: LEVER_COST,
  });
});
