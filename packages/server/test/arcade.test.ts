import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import Database from "better-sqlite3";
import { HILO_OP } from "../src/arcade.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { WebSocket } from "ws";

let dir: string;
let dbPath: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-arcade-"));
  dbPath = join(dir, "test.db");
  srv = undefined;
});

afterEach(async () => {
  if (srv) await srv.close();
  srv = undefined;
  rmSync(dir, { recursive: true, force: true });
});

/** A server whose deck is scripted; after the script runs out, always 7. */
async function start(deck: number[]): Promise<ServerHandle> {
  const cards = [...deck];
  srv = await startServer({
    port: 0,
    dbPath,
    npcGenerate: null,
    arcadeDraw: () => cards.shift() ?? 7,
  });
  return srv;
}

async function joinAs(port: number, username: string): Promise<{ ws: WebSocket; bus: Bus; id: number }> {
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

function ledgerRows(accountId: number): Array<{ stars: number }> {
  const db = new Database(dbPath, { readonly: true });
  try {
    return db
      .prepare("SELECT stars FROM ledger_entries WHERE account_id = ? AND op = ?")
      .all(accountId, HILO_OP) as Array<{ stars: number }>;
  } finally {
    db.close();
  }
}

test("a winning run pays score ÷ ratio through the ledger on stop", async () => {
  const { port } = await start([5, 10, 3]);   // deal 5, higher→10 ✓, lower→3 ✓
  const alice = await joinAs(port, "alice");
  alice.ws.send(JSON.stringify({ t: "arcade_start" }));
  const dealt = await alice.bus.waitFor("arcade_state");
  expect(dealt).toMatchObject({ card: 5, score: 0, scored: true, over: false });

  alice.ws.send(JSON.stringify({ t: "arcade_move", move: "higher" }));
  expect(await alice.bus.waitFor("arcade_state")).toMatchObject({ card: 10, score: 10 });
  alice.ws.send(JSON.stringify({ t: "arcade_move", move: "lower" }));
  expect(await alice.bus.waitFor("arcade_state")).toMatchObject({ card: 3, score: 20 });

  alice.ws.send(JSON.stringify({ t: "arcade_move", move: "stop" }));
  const paid = await alice.bus.waitFor("stars");
  expect(paid).toMatchObject({ delta: 10, reason: "arcade" });   // 20 ÷ ratio 2
  const over = await alice.bus.waitFor("arcade_state");
  expect(over).toMatchObject({ over: true, outcome: "stopped", paid: 10 });
  expect(ledgerRows(alice.id)).toEqual([{ stars: 10 }]);
});

test("a bust pays nothing but still consumes a scored play", async () => {
  const { port } = await start([5, 2]);   // deal 5, higher→2 ✗
  const alice = await joinAs(port, "alice");
  alice.ws.send(JSON.stringify({ t: "arcade_start" }));
  await alice.bus.waitFor("arcade_state");
  alice.ws.send(JSON.stringify({ t: "arcade_move", move: "higher" }));
  const over = await alice.bus.waitFor("arcade_state");
  expect(over).toMatchObject({ card: 2, score: 0, over: true, outcome: "bust", paid: 0 });
  await alice.bus.never("stars", 100);
  expect(ledgerRows(alice.id)).toEqual([{ stars: 0 }]);   // recordZero: the play is spent
});

test("the fourth play of the day is practice — playable, never settled", async () => {
  const { port } = await start([]);   // every card 7: stop immediately each run
  const alice = await joinAs(port, "alice");
  for (let i = 0; i < 3; i++) {
    alice.ws.send(JSON.stringify({ t: "arcade_start" }));
    expect(await alice.bus.waitFor("arcade_state")).toMatchObject({ scored: true });
    alice.ws.send(JSON.stringify({ t: "arcade_move", move: "stop" }));
    await alice.bus.waitFor("arcade_state");
  }
  alice.ws.send(JSON.stringify({ t: "arcade_start" }));
  expect(await alice.bus.waitFor("arcade_state")).toMatchObject({ scored: false });
  alice.ws.send(JSON.stringify({ t: "arcade_move", move: "stop" }));
  expect(await alice.bus.waitFor("arcade_state")).toMatchObject({ over: true, paid: 0 });
  expect(ledgerRows(alice.id)).toHaveLength(3);
});

test("starting twice and moving with no run are arcade errors", async () => {
  const { port } = await start([]);
  const alice = await joinAs(port, "alice");
  alice.ws.send(JSON.stringify({ t: "arcade_move", move: "higher" }));
  expect((await alice.bus.waitFor("error")).code).toBe("arcade");
  alice.ws.send(JSON.stringify({ t: "arcade_start" }));
  await alice.bus.waitFor("arcade_state");
  alice.ws.send(JSON.stringify({ t: "arcade_start" }));
  expect((await alice.bus.waitFor("error")).code).toBe("arcade");
});

test("disconnecting mid-run settles as a stop", async () => {
  const { port } = await start([5, 10]);
  const alice = await joinAs(port, "alice");
  alice.ws.send(JSON.stringify({ t: "arcade_start" }));
  await alice.bus.waitFor("arcade_state");
  alice.ws.send(JSON.stringify({ t: "arcade_move", move: "higher" }));
  await alice.bus.waitFor("arcade_state");   // score 10
  alice.ws.close();
  const deadline = Date.now() + 1000;
  for (;;) {
    const rows = ledgerRows(alice.id);
    if (rows.length > 0) {
      expect(rows).toEqual([{ stars: 5 }]);   // 10 ÷ ratio 2, settled by onLeave
      break;
    }
    if (Date.now() > deadline) throw new Error("no settlement after disconnect");
    await new Promise((r) => setTimeout(r, 25));
  }
});
