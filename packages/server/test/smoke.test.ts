import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { closeDb, openDb } from "../src/db.ts";
import { getItem } from "../src/items.ts";
import { MS_PER_TILE } from "../src/room.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { ServerMsg } from "@grand/shared";
import type { WebSocket } from "ws";

type RoomState = Extract<ServerMsg, { t: "room_state" }>;
type Client = { ws: WebSocket; bus: Bus; id: number; state: RoomState };

let dir: string;
let dbPath: string;
let port: number;
let srv: ServerHandle;
let tokens: { alice: string; bob: string; carol: string };

const DISPOSE_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function eventually(check: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`condition still false after ${ms}ms`);
    await sleep(10);
  }
}

function post(path: string, body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify(body),
  });
}

async function signUp(username: string): Promise<string> {
  const res = await post("/api/register", { username, password: "password1" });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function joinAs(token: string, roomId: number): Promise<Client> {
  const [ws, bus] = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId }));
  const state = await bus.waitFor("room_state");
  return { ws, bus, id: state.you, state };
}

/** Sends a move and waits out the real walk (this file is the one allowed to). */
async function walkAndSettle(client: Client, x: number, y: number): Promise<void> {
  client.ws.send(JSON.stringify({ t: "move", x, y }));
  const walk = await client.bus.waitFor("walk");
  await sleep(walk.path.length * MS_PER_TILE + 200);
}

describe("smoke suite", () => {
  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "grand-smoke-"));
    dbPath = join(dir, "smoke.db");
    srv = await startServer({ port: 0, dbPath, disposeMs: DISPOSE_MS });
    port = srv.port;
    tokens = {
      alice: await signUp("alice"),
      bob: await signUp("bob"),
      carol: await signUp("carol"),
    };
  }, 10000);

  afterAll(async () => {
    await srv.close();
    rmSync(dir, { recursive: true, force: true });
  });

  let alice: Client;
  let bob: Client;

  test("joins are mutually visible", { timeout: 5000 }, async () => {
    alice = await joinAs(tokens.alice, 1);
    expect(alice.state).toMatchObject({ roomId: 1, name: "The Lobby Café" });
    expect(alice.state.avatars).toEqual([
      { id: alice.id, username: "alice", x: 0, y: 5, z: 0, dir: 2, posture: "stand" },
    ]);

    bob = await joinAs(tokens.bob, 1);
    expect(bob.state.avatars.find((a) => a.id === alice.id)).toMatchObject({ username: "alice" });

    const seenByAlice = await alice.bus.waitFor("avatar_join");
    expect(seenByAlice.avatar).toMatchObject({ id: bob.id, username: "bob" });
  });

  test("a completed walk is visible to a later joiner", { timeout: 8000 }, async () => {
    await walkAndSettle(alice, 3, 5);

    const carolInCafe = await joinAs(tokens.carol, 1);
    expect(carolInCafe.state.avatars.find((a) => a.id === alice.id)).toMatchObject({
      x: 3,
      y: 5,
      z: 0,
    });
  });

  const room2 = {} as Record<"alice" | "bob" | "carol", Client>;
  let tableId: number;
  let plantId: number;

  test("chat delivery matrix in the casino", { timeout: 12000 }, async () => {
    room2.alice = await joinAs(tokens.alice, 2);
    room2.bob = await joinAs(tokens.bob, 2);
    room2.carol = await joinAs(tokens.carol, 2);

    // Break the door-spawn cluster so one listener is outside the 5-tile speak radius.
    await walkAndSettle(room2.carol, 6, 6);

    room2.alice.ws.send(JSON.stringify({ t: "chat", mode: "say", text: "hello world" }));
    expect(await room2.alice.bus.waitFor("chat")).toMatchObject({
      from: room2.alice.id,
      mode: "say",
      text: "hello world",
      faded: false,
    });
    expect(await room2.bob.bus.waitFor("chat")).toMatchObject({
      from: room2.alice.id,
      mode: "say",
      text: "hello world",
      faded: false,
    });
    expect(await room2.carol.bus.waitFor("chat")).toMatchObject({
      from: room2.alice.id,
      mode: "say",
      text: "…",
      faded: true,
    });

    room2.bob.ws.send(JSON.stringify({ t: "chat", mode: "shout", text: "attention please" }));
    for (const client of [room2.alice, room2.bob, room2.carol]) {
      expect(await client.bus.waitFor("chat")).toMatchObject({
        from: room2.bob.id,
        mode: "shout",
        text: "attention please",
        faded: false,
      });
    }

    room2.alice.ws.send(JSON.stringify({ t: "whisper", to: "bob", text: "psst" }));
    expect(await room2.bob.bus.waitFor("chat")).toMatchObject({
      from: room2.alice.id,
      mode: "whisper",
      text: "psst",
    });
    expect(await room2.alice.bus.waitFor("chat")).toMatchObject({
      from: room2.alice.id,
      mode: "whisper",
      text: "psst",
    });
    await room2.carol.bus.never("chat");
  });

  test(
    "place, stack, and pick up furniture broadcasts furni_moved and updates the db",
    { timeout: 8000 },
    async () => {
      const table = room2.alice.state.inventory.find((i) => i.defId === "table_basic");
      const plant = room2.alice.state.inventory.find((i) => i.defId === "plant_basic");
      if (!table || !plant) throw new Error("alice's starter inventory is missing table or plant");
      tableId = table.id;
      plantId = plant.id;

      room2.alice.ws.send(JSON.stringify({ t: "place", itemId: tableId, x: 5, y: 10, dir: 0 }));
      const placedTable = await room2.alice.bus.waitFor("furni_placed");
      expect(placedTable.item).toEqual({
        id: tableId, defId: "table_basic", x: 5, y: 10, z: 0, dir: 0, state: 0,
      });
      expect((await room2.bob.bus.waitFor("furni_placed")).item).toEqual(placedTable.item);

      // Far tile of the 2x1 table: stacks on top of it.
      room2.alice.ws.send(JSON.stringify({ t: "place", itemId: plantId, x: 6, y: 10, dir: 0 }));
      const placedPlant = await room2.alice.bus.waitFor("furni_placed");
      expect(placedPlant.item).toEqual({
        id: plantId, defId: "plant_basic", x: 6, y: 10, z: 1, dir: 0, state: 0,
      });

      const rawDb = openDb(dbPath);
      expect(getItem(rawDb, plantId)).toMatchObject({ x: 6, y: 10, z: 1, roomId: 2 });

      room2.alice.ws.send(JSON.stringify({ t: "pickup", itemId: tableId }));
      expect(await room2.alice.bus.waitFor("furni_removed")).toEqual({
        t: "furni_removed", itemId: tableId,
      });
      expect(await room2.alice.bus.waitFor("inventory_add")).toEqual({
        t: "inventory_add", item: { id: tableId, defId: "table_basic" },
      });

      const moved = await room2.alice.bus.waitFor("furni_moved");
      expect(moved.item).toEqual({
        id: plantId, defId: "plant_basic", x: 6, y: 10, z: 0, dir: 0, state: 0,
      });
      expect((await room2.bob.bus.waitFor("furni_moved")).item).toEqual(moved.item);

      expect(getItem(rawDb, plantId)).toMatchObject({ x: 6, y: 10, z: 0, roomId: 2 });
      expect(getItem(rawDb, tableId)).toMatchObject({
        roomId: null, x: null, y: null, z: null, dir: null,
      });
      closeDb(rawDb);
    },
  );

  let aliceAgain: Client;

  test("furni state survives a server restart with the same token", { timeout: 8000 }, async () => {
    await srv.close();
    srv = await startServer({ port, dbPath, disposeMs: DISPOSE_MS });
    expect(srv.port).toBe(port);

    aliceAgain = await joinAs(tokens.alice, 2);
    expect(aliceAgain.state.furni).toEqual([
      { id: plantId, defId: "plant_basic", x: 6, y: 10, z: 0, dir: 0, state: 0 },
    ]);
    expect(aliceAgain.state.inventory).toContainEqual({ id: tableId, defId: "table_basic" });
    expect(aliceAgain.state.inventory.some((i) => i.id === plantId)).toBe(false);
  });

  test("disposes the room once every socket is gone", { timeout: 5000 }, async () => {
    aliceAgain.ws.close();
    await eventually(() => srv.stats().rooms === 0);
    expect(srv.stats().rooms).toBe(0);
  });
});
