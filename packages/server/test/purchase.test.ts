import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import Database from "better-sqlite3";
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
