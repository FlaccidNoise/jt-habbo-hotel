import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type Database from "better-sqlite3";
import { openDb, closeDb } from "../src/db.ts";
import { register } from "../src/auth.ts";
import { GLOBAL_EARN_CEILING, TRICKLE_SCHEDULE, balanceOf, settleEarn, settleTrickle } from "../src/ledger.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";

const DAY = 24 * 60 * 60 * 1000;
const TOTAL = TRICKLE_SCHEDULE.reduce((a, b) => a + b, 0);

describe("registration Star trickle", () => {
  let dir: string;
  let db: Database.Database;
  let alice: number;
  let createdAt: number;

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), "grand-trickle-"));
    db = openDb(join(dir, "test.db"));
    await register(db, "alice", "password1");
    const row = db.prepare("SELECT id, created_at AS createdAt FROM accounts WHERE username = 'alice'")
      .get() as { id: number; createdAt: number };
    alice = row.id;
    createdAt = row.createdAt;
  });

  afterEach(() => {
    closeDb(db);
    rmSync(dir, { recursive: true, force: true });
  });

  test("day one pays nothing — a fresh alt is worth zero the day it is made", () => {
    expect(settleTrickle(db, alice, createdAt).granted).toBe(0);
    expect(settleTrickle(db, alice, createdAt + DAY - 1).granted).toBe(0);
    expect(balanceOf(db, alice)).toBe(0);
  });

  test("each payday pays once, however many times the account joins", () => {
    expect(settleTrickle(db, alice, createdAt + DAY).granted).toBe(TRICKLE_SCHEDULE[0]);
    expect(settleTrickle(db, alice, createdAt + DAY).granted).toBe(0);
    expect(settleTrickle(db, alice, createdAt + DAY + 1000).granted).toBe(0);
    expect(balanceOf(db, alice)).toBe(TRICKLE_SCHEDULE[0]);
  });

  test("an absence pays every day owed at once, uncapped by the rolling window", () => {
    const granted = settleTrickle(db, alice, createdAt + 3 * DAY).granted;
    expect(granted).toBe(TRICKLE_SCHEDULE.slice(0, 3).reduce((a, b) => a + b, 0));
    expect(balanceOf(db, alice)).toBe(granted);
  });

  test("the schedule totals 100 and stops there forever", () => {
    expect(settleTrickle(db, alice, createdAt + 7 * DAY).granted).toBe(TOTAL);
    expect(TOTAL).toBe(100);
    expect(settleTrickle(db, alice, createdAt + 90 * DAY).granted).toBe(0);
    expect(balanceOf(db, alice)).toBe(TOTAL);
  });

  test("a payday blocked by the global ceiling is not burned — it pays on a later join", () => {
    // Spend the whole 24h ceiling on another faucet first.
    settleEarn(db, {
      opKey: "grind",
      op: "arcade_hilo",
      accountId: alice,
      amount: GLOBAL_EARN_CEILING,
      opCap: GLOBAL_EARN_CEILING,
      now: createdAt + DAY,
    });
    expect(settleTrickle(db, alice, createdAt + DAY).granted).toBe(0);

    // A day later the rolling window has moved on and the unpaid payday is still owed.
    expect(settleTrickle(db, alice, createdAt + 2 * DAY + 1).granted).toBe(
      TRICKLE_SCHEDULE[0]! + TRICKLE_SCHEDULE[1]!,
    );
  });

  test("the grants are ledger rows under one op, so the faucet is auditable", () => {
    settleTrickle(db, alice, createdAt + 7 * DAY);
    const rows = db
      .prepare("SELECT COUNT(*) AS n, SUM(stars) AS s FROM ledger_entries WHERE op = 'trickle'")
      .get() as { n: number; s: number };
    expect(rows).toEqual({ n: TRICKLE_SCHEDULE.length, s: TOTAL });
  });
});

describe("trickle at the door", () => {
  let dir: string;
  let dbPath: string;
  let srv: ServerHandle | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grand-trickle-http-"));
    dbPath = join(dir, "test.db");
    srv = undefined;
  });

  afterEach(async () => {
    if (srv) await srv.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("joining after a day owed pays it and room_state already shows the balance", async () => {
    srv = await startServer({ port: 0, dbPath, npcGenerate: null });
    const { port } = srv;
    const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "password1" }),
    });
    const { token } = (await res.json()) as { token: string };

    // Backdate registration by two days: two paydays are owed at the door.
    const side = openDb(dbPath);
    side.prepare("UPDATE accounts SET created_at = ? WHERE username = 'alice'").run(Date.now() - 2 * DAY);
    closeDb(side);

    const [ws, bus] = await connect(port);
    ws.send(JSON.stringify({ t: "join", token, roomId: 1 }));
    const owed = TRICKLE_SCHEDULE.slice(0, 2).reduce((a, b) => a + b, 0);
    expect((await bus.waitFor("room_state")).stars).toBe(owed);
    const paid = await bus.waitFor("stars");
    expect(paid).toMatchObject({ balance: owed, delta: owed, reason: "welcome trickle" });
    ws.close();
  });
});
