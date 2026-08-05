import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type Database from "better-sqlite3";
import { openDb, closeDb } from "../src/db.ts";
import { settleEarn, settlePurchase } from "../src/ledger.ts";
import { flows, hourly, ledgerStats, wsStats } from "../src/metrics.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";

const T0 = 1_700_000_000_000;
const HOUR = 60 * 60 * 1000;

describe("flows and hourly", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grand-metrics-"));
    db = openDb(join(dir, "test.db"));
  });

  afterEach(() => {
    closeDb(db);
    rmSync(dir, { recursive: true, force: true });
  });

  function account(name: string): number {
    const info = db
      .prepare(
        `INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at)
         VALUES (?, ?, ?, ?, 'test', 0)`,
      )
      .run(name, name, Buffer.alloc(1), Buffer.alloc(1));
    return Number(info.lastInsertRowid);
  }

  test("aggregates per-faucet issuance and per-sink absorption inside the window", () => {
    const alice = account("alice");
    settleEarn(db, { opKey: "k1", op: "npc_coffee", accountId: alice, amount: 10, opCap: 50, now: T0 });
    settleEarn(db, { opKey: "k2", op: "arcade_hilo", accountId: alice, amount: 20, opCap: 50, now: T0 + HOUR });
    settlePurchase(db, { opKey: "k3", accountId: alice, defId: "chair_basic", price: 15, now: T0 + HOUR });
    // Outside the window: must not appear.
    settleEarn(db, { opKey: "k4", op: "npc_coffee", accountId: alice, amount: 10, opCap: 50, now: T0 - 2 * HOUR });

    const { faucets, sinks } = flows(db, T0 - HOUR);
    expect(faucets).toEqual([
      { op: "arcade_hilo", stars: 20 },
      { op: "npc_coffee", stars: 10 },
    ]);
    expect(sinks).toEqual([{ op: "purchase", stars: 15 }]);
  });

  test("hourly buckets net Stars per op", () => {
    const alice = account("alice");
    settleEarn(db, { opKey: "k1", op: "npc_coffee", accountId: alice, amount: 10, opCap: 50, now: T0 });
    settleEarn(db, { opKey: "k2", op: "npc_coffee", accountId: alice, amount: 10, opCap: 50, now: T0 + 1000 });
    settlePurchase(db, { opKey: "k3", accountId: alice, defId: "chair_basic", price: 5, now: T0 + HOUR });

    const bucket = (t: number): number => Math.floor(t / HOUR) * HOUR;
    expect(hourly(db, T0 - 1)).toEqual([
      { hour: bucket(T0), op: "npc_coffee", stars: 20 },
      { hour: bucket(T0 + HOUR), op: "purchase", stars: -5 },
    ]);
  });

  test("settlement calls land in ledgerStats, errors included", () => {
    const before = { ...ledgerStats };
    const alice = account("alice");
    settleEarn(db, { opKey: "k1", op: "npc_coffee", accountId: alice, amount: 10, opCap: 50, now: T0 });
    expect(ledgerStats.ops).toBe(before.ops + 1);
    expect(() =>
      settleEarn(db, { opKey: "k1", op: "npc_coffee", accountId: -1, amount: NaN, opCap: NaN, now: NaN }),
    ).not.toThrow(); // replay is a no-op, still counted
    expect(ledgerStats.ops).toBe(before.ops + 2);
    expect(ledgerStats.totalMs).toBeGreaterThanOrEqual(before.totalMs);
  });
});

describe("GET /api/metrics", () => {
  let dir: string;
  let srv: ServerHandle | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grand-metrics-http-"));
    srv = undefined;
  });

  afterEach(async () => {
    if (srv) await srv.close();
    rmSync(dir, { recursive: true, force: true });
  });

  async function register(port: number, username: string): Promise<string> {
    const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "password1" }),
    });
    expect(res.status).toBe(200);
    return ((await res.json()) as { token: string }).token;
  }

  test("requires a valid session and reports flows, ws and room stats", async () => {
    srv = await startServer({ port: 0, dbPath: join(dir, "test.db"), npcGenerate: null });
    const { port } = srv;

    expect((await fetch(`http://127.0.0.1:${port}/api/metrics`)).status).toBe(401);
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/api/metrics`, {
          headers: { authorization: "Bearer bogus" },
        })
      ).status,
    ).toBe(401);

    const token = await register(port, "alice");
    // A token in the query string is not accepted — it would leak through logs and history.
    expect((await fetch(`http://127.0.0.1:${port}/api/metrics?token=${token}`)).status).toBe(401);
    const wsBefore = { ...wsStats };
    const [ws, bus] = await connect(port);
    ws.send(JSON.stringify({ t: "join", token, roomId: 1 }));
    await bus.waitFor("room_state");

    // Same account on a second socket: the displacement is the reconnect signal.
    const [ws2, bus2] = await connect(port);
    ws2.send(JSON.stringify({ t: "join", token, roomId: 1 }));
    await bus2.waitFor("room_state");

    const res = await fetch(`http://127.0.0.1:${port}/api/metrics`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      day: { faucets: unknown[]; sinks: unknown[] };
      week: { faucets: unknown[]; sinks: unknown[] };
      hourly: unknown[];
      ledger: { ops: number };
      ws: { connects: number; reconnects: number; open: number };
      lag: { lastMs: number; maxMs: number };
      rooms: Array<{ roomId: number; players: number; occupants: number }>;
    };
    expect(body.ws.connects).toBe(wsBefore.connects + 2);
    expect(body.ws.reconnects).toBe(wsBefore.reconnects + 1);
    expect(body.rooms).toEqual([{ roomId: 1, players: 1, occupants: 3 }]); // alice + 2 NPCs
    expect(body.day.faucets).toEqual([]);
    expect(body.lag.maxMs).toBeGreaterThanOrEqual(0);
    ws.close();
    ws2.close();
  });
});
