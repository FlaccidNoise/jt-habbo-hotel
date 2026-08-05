import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { ROOM_CAPACITY } from "@grand/shared";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { WebSocket } from "ws";

let dir: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-nav-"));
  srv = undefined;
});

afterEach(async () => {
  if (srv) await srv.close();
  rmSync(dir, { recursive: true, force: true });
});

async function start(): Promise<ServerHandle> {
  srv = await startServer({ port: 0, dbPath: join(dir, "test.db"), npcGenerate: null });
  return srv;
}

async function signUp(port: number, username: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "password1" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function joinAs(port: number, token: string, roomId: number): Promise<[WebSocket, Bus]> {
  const [ws, bus] = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId }));
  await bus.waitFor("room_state");
  return [ws, bus];
}

describe("navigator listing", () => {
  test("lists open rooms busiest first, flags your own suite and counts players not staff", async () => {
    const { port } = await start();
    const alice = await signUp(port, "alice");
    const bob = await signUp(port, "bob");

    const [aliceWs, aliceBus] = await joinAs(port, alice, 1); // café: 1 player + 2 staff NPCs
    const [bobWs] = await joinAs(port, bob, 2);               // casino: 1 player

    aliceWs.send(JSON.stringify({ t: "nav_list" }));
    const listing = await aliceBus.waitFor("nav_rooms");

    const cafe = listing.rooms.find((r) => r.roomId === 1);
    expect(cafe).toEqual({ roomId: 1, name: "The Lobby Café", players: 1, yours: false });
    expect(listing.rooms.find((r) => r.roomId === 2)?.players).toBe(1);

    // Both suites are listed; only alice's is hers, and neither is loaded so both read zero.
    const suites = listing.rooms.filter((r) => r.roomId > 2);
    expect(suites).toHaveLength(2);
    expect(suites.filter((r) => r.yours)).toHaveLength(1);
    expect(suites.every((r) => r.players === 0)).toBe(true);

    // Busiest first: the two occupied rooms lead the list.
    expect(listing.rooms.slice(0, 2).map((r) => r.roomId).sort()).toEqual([1, 2]);
    aliceWs.close();
    bobWs.close();
  });

  test("a suite is listed for its owner and visitable by anyone", async () => {
    const { port } = await start();
    const alice = await signUp(port, "alice");
    const bob = await signUp(port, "bob");

    const [aliceWs, aliceBus] = await joinAs(port, alice, 1);
    aliceWs.send(JSON.stringify({ t: "nav_list" }));
    const mine = (await aliceBus.waitFor("nav_rooms")).rooms.find((r) => r.yours);
    expect(mine).toBeDefined();

    const [bobWs, bobBus] = await connect(port);
    bobWs.send(JSON.stringify({ t: "join", token: bob, roomId: mine!.roomId }));
    const state = await bobBus.waitFor("room_state");
    expect(state.roomId).toBe(mine!.roomId);
    expect(state.furni).toHaveLength(5);   // alice's starter furni, placed at registration
    expect(state.myRoomId).not.toBe(mine!.roomId);
    aliceWs.close();
    bobWs.close();
  });
});

describe("room capacity", () => {
  test("a full room refuses the next arrival and keeps serving the people inside", async () => {
    const { port } = await start();
    const sockets: WebSocket[] = [];
    for (let i = 0; i < ROOM_CAPACITY; i++) {
      const token = await signUp(port, `guest${i}`);
      const [ws] = await joinAs(port, token, 2);
      sockets.push(ws);
    }

    const latecomer = await signUp(port, "latecomer");
    const [lateWs, lateBus] = await connect(port);
    lateWs.send(JSON.stringify({ t: "join", token: latecomer, roomId: 2 }));
    const refusal = await lateBus.waitFor("error");
    expect(refusal.code).toBe("room_busy");
    expect(refusal.message).toContain(String(ROOM_CAPACITY));

    // The café is unaffected — capacity is per room.
    const [elsewhere] = await joinAs(port, latecomer, 1);
    lateWs.close();
    elsewhere.close();
    for (const ws of sockets) ws.close();
  }, 30000);

  test("someone already inside a full room can reconnect to it", async () => {
    const { port } = await start();
    const sockets: WebSocket[] = [];
    let firstToken = "";
    for (let i = 0; i < ROOM_CAPACITY; i++) {
      const token = await signUp(port, `guest${i}`);
      if (i === 0) firstToken = token;
      const [ws] = await joinAs(port, token, 2);
      sockets.push(ws);
    }

    // Same account, new socket, same room: displacement, not a new occupant.
    const [again, againBus] = await connect(port);
    again.send(JSON.stringify({ t: "join", token: firstToken, roomId: 2 }));
    expect((await againBus.waitFor("room_state")).roomId).toBe(2);
    again.close();
    for (const ws of sockets) ws.close();
  }, 30000);
});
