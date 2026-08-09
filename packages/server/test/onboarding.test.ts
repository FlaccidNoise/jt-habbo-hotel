import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import type Database from "better-sqlite3";
import { openDb, closeDb } from "../src/db.ts";
import { register } from "../src/auth.ts";
import { settleEarn } from "../src/ledger.ts";
import { advanceOnboarding, onboardingHint, startOnboarding } from "../src/onboarding.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";

describe("onboarding state machine", () => {
  let dir: string;
  let db: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grand-onboarding-"));
    db = openDb(join(dir, "test.db"));
  });

  afterEach(() => {
    closeDb(db);
    rmSync(dir, { recursive: true, force: true });
  });

  async function account(name: string): Promise<number> {
    await register(db, name, "password1");
    return (db.prepare("SELECT id FROM accounts WHERE username = ?").get(name) as { id: number }).id;
  }

  test("registration starts the quest at the coffee step", async () => {
    const alice = await account("alice");
    expect(onboardingHint(db, alice)).toContain("Welcome quest");
  });

  test("only the current step's event advances; the chain ends silent", async () => {
    const alice = await account("alice");
    expect(advanceOnboarding(db, alice, "place")).toBeNull();
    expect(onboardingHint(db, alice)).toContain("Welcome quest");

    expect(advanceOnboarding(db, alice, "coffee")).toContain("catalog");
    expect(advanceOnboarding(db, alice, "purchase")).toContain("place");
    expect(advanceOnboarding(db, alice, "place")).toContain("Hi-Lo");
    expect(advanceOnboarding(db, alice, "arcade")).toContain("complete");

    expect(onboardingHint(db, alice)).toBeNull();
    expect(advanceOnboarding(db, alice, "arcade")).toBeNull();
  });

  test("accounts without a quest row stay silent", () => {
    expect(onboardingHint(db, 999)).toBeNull();
    expect(advanceOnboarding(db, 999, "coffee")).toBeNull();
  });

  test("startOnboarding never resets progress", async () => {
    const alice = await account("alice");
    advanceOnboarding(db, alice, "coffee");
    startOnboarding(db, alice);
    expect(onboardingHint(db, alice)).toContain("catalog");
  });
});

describe("quest over the wire", () => {
  let dir: string;
  let dbPath: string;
  let srv: ServerHandle | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grand-onboarding-http-"));
    dbPath = join(dir, "test.db");
    srv = undefined;
  });

  afterEach(async () => {
    if (srv) await srv.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test("join prompts the current step; buy, place and arcade advance it with notices", async () => {
    srv = await startServer({ port: 0, dbPath, npcGenerate: null });
    const { port } = srv;
    const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: "alice", password: "password1" }),
    });
    const { token } = (await res.json()) as { token: string };

    const [ws, bus] = await connect(port);
    ws.send(JSON.stringify({ t: "join", token, roomId: 1 }));
    const alice = (await bus.waitFor("room_state")).you;
    expect((await bus.waitFor("notice")).text).toContain("Welcome quest");

    // Skip the coffee step from outside (the ritual itself is covered in npc-ritual tests)
    // and fund the purchase.
    const side = openDb(dbPath);
    side.prepare("UPDATE onboarding SET step = 'purchase' WHERE account_id = ?").run(alice);
    settleEarn(side, { opKey: "fund", op: "test", accountId: alice, amount: 100, opCap: 100 });
    closeDb(side);

    ws.send(JSON.stringify({ t: "buy", defId: "chair_basic" }));
    const bought = await bus.waitFor("inventory_add");
    expect((await bus.waitFor("notice")).text).toContain("place your new furni");

    ws.send(JSON.stringify({ t: "place", itemId: bought.item.id, x: 5, y: 8, dir: 0 }));
    await bus.waitFor("furni_placed");
    expect((await bus.waitFor("notice")).text).toContain("Hi-Lo");

    ws.send(JSON.stringify({ t: "arcade_start" }));
    await bus.waitFor("arcade_state");
    expect((await bus.waitFor("notice")).text).toContain("complete");

    // Done: a rejoin prompts nothing.
    const [ws2, bus2] = await connect(port);
    ws2.send(JSON.stringify({ t: "join", token, roomId: 1 }));
    await bus2.waitFor("room_state");
    await bus2.never("notice", 150);
    ws.close();
    ws2.close();
  });
});
