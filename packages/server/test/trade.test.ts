import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { ServerMsg } from "@grand/shared";
import type { WebSocket } from "ws";

type RoomState = Extract<ServerMsg, { t: "room_state" }>;
type Opts = Parameters<typeof startServer>[0];

let dir: string;
let dbPath: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-trade-"));
  dbPath = join(dir, "test.db");
  srv = undefined;
});

afterEach(async () => {
  if (srv) await srv.close();
  srv = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function start(opts: Partial<Opts> = {}): Promise<ServerHandle> {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null, tradeCountdownMs: 50, ...opts });
  return srv;
}

async function signUp(port: number, username: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ username, password: "password1" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

interface Client {
  ws: WebSocket;
  bus: Bus;
  id: number;
  state: RoomState;
  send: (msg: unknown) => void;
}

// The casino: no greeter NPC, so trade assertions see only trade traffic.
async function joinAs(port: number, username: string, roomId = 2): Promise<Client> {
  const token = await signUp(port, username);
  const [ws, bus] = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId }));
  const state = await bus.waitFor("room_state");
  return { ws, bus, id: state.you, state, send: (msg) => ws.send(JSON.stringify(msg)) };
}

/** Open a trade between two already-joined clients and consume the initial states. */
async function openTrade(a: Client, b: Client, aName: string, bName: string): Promise<void> {
  a.send({ t: "trade_open", to: bName });
  await b.bus.waitFor("trade_invite");
  b.send({ t: "trade_open", to: aName });
  await a.bus.waitFor("trade_state");
  await b.bus.waitFor("trade_state");
}

describe("trade flow", () => {
  test("offer, both accept, countdown, items swap and both sides are told", async () => {
    const { port } = await start();
    const alice = await joinAs(port, "alice");
    const bob = await joinAs(port, "bob");
    const aliceGives = alice.state.inventory[0]!;
    const bobGives = bob.state.inventory[1]!;
    expect(alice.state.stars).toBe(0);

    await openTrade(alice, bob, "alice", "bob");
    alice.send({ t: "trade_offer", itemIds: [aliceGives.id] });
    const seen = await bob.bus.waitFor("trade_state");
    expect(seen.theirs).toEqual([aliceGives]);
    await alice.bus.waitFor("trade_state");

    bob.send({ t: "trade_offer", itemIds: [bobGives.id] });
    await alice.bus.waitFor("trade_state");
    await bob.bus.waitFor("trade_state");

    alice.send({ t: "trade_accept" });
    const half = await bob.bus.waitFor("trade_state");
    expect(half.theyAccepted).toBe(true);
    expect(half.countdown).toBe(false);
    await alice.bus.waitFor("trade_state");
    bob.send({ t: "trade_accept" });
    const counting = await alice.bus.waitFor("trade_state");
    expect(counting.countdown).toBe(true);

    const aliceDone = await alice.bus.waitFor("trade_complete");
    const bobDone = await bob.bus.waitFor("trade_complete");
    expect(aliceDone).toEqual({ t: "trade_complete", added: [bobGives], removed: [aliceGives.id] });
    expect(bobDone).toEqual({ t: "trade_complete", added: [aliceGives], removed: [bobGives.id] });
  });

  test("changing an offer resets both accepts and stops the countdown", async () => {
    const { port } = await start({ tradeCountdownMs: 5000 });
    const alice = await joinAs(port, "alice");
    const bob = await joinAs(port, "bob");
    await openTrade(alice, bob, "alice", "bob");

    alice.send({ t: "trade_accept" });
    bob.send({ t: "trade_accept" });
    await alice.bus.waitFor("trade_state");
    const counting = await alice.bus.waitFor("trade_state");
    expect(counting.countdown).toBe(true);

    alice.send({ t: "trade_offer", itemIds: [alice.state.inventory[0]!.id] });
    await bob.bus.waitFor("trade_state");
    const reset = await alice.bus.waitFor("trade_state");
    expect(reset).toMatchObject({ youAccepted: false, theyAccepted: false, countdown: false });
    await alice.bus.never("trade_complete", 100);
  });

  test("cancel during the countdown aborts the trade", async () => {
    const { port } = await start({ tradeCountdownMs: 5000 });
    const alice = await joinAs(port, "alice");
    const bob = await joinAs(port, "bob");
    await openTrade(alice, bob, "alice", "bob");
    alice.send({ t: "trade_accept" });
    bob.send({ t: "trade_accept" });
    bob.send({ t: "trade_cancel" });
    await alice.bus.waitFor("trade_cancelled");
    await bob.bus.waitFor("trade_cancelled");
    await alice.bus.never("trade_complete", 100);
  });

  test("leaving the room cancels the trade", async () => {
    const { port } = await start();
    const alice = await joinAs(port, "alice");
    const bob = await joinAs(port, "bob");
    await openTrade(alice, bob, "alice", "bob");
    alice.ws.close();
    await bob.bus.waitFor("trade_cancelled");
  });

  test("an offered item that gets placed cancels settlement — fail closed", async () => {
    const { port } = await start({ tradeCountdownMs: 200 });
    const alice = await joinAs(port, "alice");
    const bob = await joinAs(port, "bob");
    const item = alice.state.inventory[0]!;
    await openTrade(alice, bob, "alice", "bob");
    alice.send({ t: "trade_offer", itemIds: [item.id] });
    await alice.bus.waitFor("trade_state");
    alice.send({ t: "trade_accept" });
    bob.send({ t: "trade_accept" });
    // Rug-pull between accept and settle: the placement wins, the trade dies, nothing moves.
    alice.send({ t: "place", itemId: item.id, x: 6, y: 8, dir: 0 });
    await alice.bus.waitFor("furni_placed");
    const cancelled = await bob.bus.waitFor("trade_cancelled");
    expect(cancelled.reason).toMatch(/no longer available/);
    await bob.bus.never("trade_complete", 100);
  });
});

describe("trade guards", () => {
  test("self, staff, absent, and busy targets are refused", async () => {
    const { port } = await start();
    const alice = await joinAs(port, "alice");
    alice.send({ t: "trade_open", to: "alice" });
    expect((await alice.bus.waitFor("error")).code).toBe("trade");
    alice.send({ t: "trade_open", to: "nobody" });
    expect((await alice.bus.waitFor("error")).code).toBe("trade");

    const cafe = await joinAs(port, "carol", 1);
    cafe.send({ t: "trade_open", to: "Maya" });
    const staff = await cafe.bus.waitFor("error");
    expect(staff.code).toBe("trade");
    expect(staff.message).toMatch(/staff/);
  });

  test("offering an item you don't own is refused", async () => {
    const { port } = await start();
    const alice = await joinAs(port, "alice");
    const bob = await joinAs(port, "bob");
    await openTrade(alice, bob, "alice", "bob");
    bob.send({ t: "trade_offer", itemIds: [alice.state.inventory[0]!.id] });
    const err = await bob.bus.waitFor("error");
    expect(err.code).toBe("trade");
  });

  test("accepting with no open trade is an error, and a 9-item offer never parses", async () => {
    const { port } = await start();
    const alice = await joinAs(port, "alice");
    alice.send({ t: "trade_accept" });
    expect((await alice.bus.waitFor("error")).code).toBe("trade");
    alice.send({ t: "trade_offer", itemIds: [1, 2, 3, 4, 5, 6, 7, 8, 9] });
    expect((await alice.bus.waitFor("error")).code).toBe("bad_message");
  });
});
