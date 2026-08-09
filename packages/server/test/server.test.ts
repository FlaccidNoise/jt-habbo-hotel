import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect, stockUp } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { ServerMsg } from "@grand/shared";
import type { WebSocket } from "ws";

type RoomState = Extract<ServerMsg, { t: "room_state" }>;

type Opts = Parameters<typeof startServer>[0];

let dir: string;
let dbPath: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-server-"));
  dbPath = join(dir, "test.db");
  srv = undefined;
});

afterEach(async () => {
  if (srv) await srv.close();
  srv = undefined;
  rmSync(dir, { recursive: true, force: true });
});

async function start(opts: Partial<Opts> = {}): Promise<ServerHandle> {
  srv = await startServer({ port: 0, dbPath, npcGenerate: null, ...opts });
  return srv;
}

function post(port: number, path: string, body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

async function signUp(port: number, username: string): Promise<string> {
  const res = await post(port, "/api/register", { username, password: "password1" });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function joinAs(
  port: number,
  token: string,
  roomId = 1,
): Promise<{ ws: WebSocket; bus: Bus; id: number; state: RoomState }> {
  const [ws, bus] = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId }));
  const state = await bus.waitFor("room_state");
  return { ws, bus, id: state.you, state };
}

async function eventually(check: () => boolean, ms = 1000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!check()) {
    if (Date.now() > deadline) throw new Error("condition still false after " + ms + "ms");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("http auth endpoints", () => {
  test("register then login both return a usable token", async () => {
    const { port } = await start();
    const registered = await signUp(port, "alice");
    expect(registered).toMatch(/^[0-9a-f]{64}$/);

    const res = await post(port, "/api/login", { username: "alice", password: "password1" });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    const alice = await joinAs(port, token);
    expect(alice.id).toBeGreaterThan(0);
  });

  test("duplicate register is 400 with an error body", async () => {
    const { port } = await start();
    await signUp(port, "alice");
    const res = await post(port, "/api/register", { username: "alice", password: "password1" });
    expect(res.status).toBe(400);
    expect((await res.json()) as { error: string }).toMatchObject({ error: expect.any(String) });
  });

  test("malformed credentials are 400", async () => {
    const { port } = await start();
    const res = await post(port, "/api/register", { username: "al", password: "short" });
    expect(res.status).toBe(400);
  });

  test("a body over 1 KiB is 413", async () => {
    const { port } = await start();
    const res = await post(port, "/api/register", "x".repeat(1100));
    expect(res.status).toBe(413);
  });
});

describe("pre-join handshake", () => {
  test("garbage, a non-join message, and a bad token all close 4401", async () => {
    const { port } = await start();

    const [garbage, garbageBus] = await connect(port);
    garbage.send("not json at all");
    expect(await garbageBus.closed()).toBe(4401);

    const [early, earlyBus] = await connect(port);
    early.send(JSON.stringify({ t: "move", x: 1, y: 1 }));
    expect(await earlyBus.closed()).toBe(4401);

    const [impostor, impostorBus] = await connect(port);
    impostor.send(JSON.stringify({ t: "join", token: "nope", roomId: 1 }));
    expect(await impostorBus.closed()).toBe(4401);
  });

  test("no join within handshakeMs closes 4401", async () => {
    const { port } = await start({ handshakeMs: 50 });
    const [, bus] = await connect(port);
    expect(await bus.closed()).toBe(4401);
  });

  test("joining an unknown room is no_room and leaves the socket usable", async () => {
    const { port } = await start();
    const token = await signUp(port, "alice");

    const [ws, bus] = await connect(port);
    ws.send(JSON.stringify({ t: "join", token, roomId: 999 }));
    expect(await bus.waitFor("error")).toMatchObject({ code: "no_room" });

    ws.send(JSON.stringify({ t: "join", token, roomId: 1 }));
    expect(await bus.waitFor("room_state")).toMatchObject({ roomId: 1 });
  });
});

describe("room session", () => {
  test("join yields room_state for the seeded lobby", async () => {
    const { port } = await start();
    const token = await signUp(port, "alice");
    const [ws, bus] = await connect(port);
    ws.send(JSON.stringify({ t: "join", token, roomId: 1 }));

    const state = await bus.waitFor("room_state");
    expect(state).toMatchObject({ roomId: 1, name: "The Lobby Café" });
    const players = state.avatars.filter((a) => !a.staff);
    expect(players).toHaveLength(1);
    // Starter furni is placed in the suite at registration, not held as inventory.
    expect(state.inventory).toHaveLength(0);
    expect(state.myRoomId).toBeGreaterThan(2);
    expect(state.you).toBe(players[0]?.id);
  });

  test("a second client raises avatar_join on the first", async () => {
    const { port } = await start();
    const alice = await joinAs(port, await signUp(port, "alice"));
    const bob = await joinAs(port, await signUp(port, "bob"));

    const joined = await alice.bus.waitFor("avatar_join");
    expect(joined.avatar).toMatchObject({ id: bob.id, username: "bob" });
  });

  test("a move broadcasts walk with from and startedAt to both sockets", async () => {
    const { port } = await start();
    const alice = await joinAs(port, await signUp(port, "alice"));
    const bob = await joinAs(port, await signUp(port, "bob"));

    const before = Date.now();
    alice.ws.send(JSON.stringify({ t: "move", x: 2, y: 5 }));

    const seenByAlice = await alice.bus.waitFor("walk");
    const seenByBob = await bob.bus.waitFor("walk");
    expect(seenByAlice).toEqual(seenByBob);
    expect(seenByAlice.id).toBe(alice.id);
    expect(seenByAlice.from).toEqual({ x: 0, y: 5, z: 0 });
    expect(seenByAlice.path.at(-1)).toEqual({ x: 2, y: 5, z: 0 });
    expect(seenByAlice.startedAt).toBeGreaterThanOrEqual(before);
  });

  test("a shout in the casino round-trips through the word filter", async () => {
    const { port } = await start();
    const alice = await joinAs(port, await signUp(port, "alice"), 2);
    const bob = await joinAs(port, await signUp(port, "bob"), 2);

    alice.ws.send(JSON.stringify({ t: "chat", mode: "shout", text: "damn this place" }));
    for (const client of [alice, bob]) {
      expect(await client.bus.waitFor("chat")).toEqual({
        t: "chat",
        from: alice.id,
        mode: "shout",
        text: "blah this place",
        faded: false,
      });
    }
  });

  test("a whisper reaches the target and the sender only", async () => {
    // Casino: no greeter NPC, so the only chat traffic is the whisper itself.
    const { port } = await start();
    const alice = await joinAs(port, await signUp(port, "alice"), 2);
    const bob = await joinAs(port, await signUp(port, "bob"), 2);
    const carol = await joinAs(port, await signUp(port, "carol"), 2);

    alice.ws.send(JSON.stringify({ t: "whisper", to: "bob", text: "psst" }));
    expect(await bob.bus.waitFor("chat")).toMatchObject({ from: alice.id, mode: "whisper", text: "psst" });
    expect(await alice.bus.waitFor("chat")).toMatchObject({ from: alice.id, mode: "whisper" });
    await carol.bus.never("chat");
  });

  test("all four malformed frame shapes are bad_message and the connection survives", async () => {
    const { port } = await start();
    const alice = await joinAs(port, await signUp(port, "alice"));

    alice.ws.send("not json");
    alice.ws.send(JSON.stringify({ t: "teleport", x: 1 }));
    alice.ws.send(JSON.stringify({ t: "move", x: "over there", y: 1 }));
    alice.ws.send(Buffer.from([0x01, 0x02, 0x03]));
    for (let i = 0; i < 4; i++) {
      expect(await alice.bus.waitFor("error")).toMatchObject({ code: "bad_message" });
    }

    alice.ws.send(JSON.stringify({ t: "move", x: 1, y: 5 }));
    expect(await alice.bus.waitFor("walk")).toMatchObject({ id: alice.id });
  });

  test("a second join on the same socket is already_joined", async () => {
    const { port } = await start();
    const token = await signUp(port, "alice");
    const alice = await joinAs(port, token);

    alice.ws.send(JSON.stringify({ t: "join", token, roomId: 1 }));
    expect(await alice.bus.waitFor("error")).toMatchObject({ code: "already_joined" });
  });

  test("a second socket for one account closes the older with 4409 and no duplicate avatar_join", async () => {
    const { port } = await start();
    const token = await signUp(port, "alice");
    const alice = await joinAs(port, token);
    const bob = await joinAs(port, await signUp(port, "bob"));
    expect((await alice.bus.waitFor("avatar_join")).avatar.id).toBe(bob.id);

    const second = await joinAs(port, token);
    expect(second.id).toBe(alice.id);
    expect(second.state.avatars.filter((a) => !a.staff).map((a) => a.id).sort()).toEqual(
      [alice.id, bob.id].sort(),
    );
    expect(await alice.bus.closed()).toBe(4409);
    await bob.bus.never("avatar_join");
    await bob.bus.never("avatar_leave");
  });

  test("closing a socket broadcasts avatar_leave to the others", async () => {
    const { port } = await start();
    const alice = await joinAs(port, await signUp(port, "alice"));
    const bob = await joinAs(port, await signUp(port, "bob"));

    alice.ws.close();
    expect(await bob.bus.waitFor("avatar_leave")).toMatchObject({ id: alice.id });
  });
});

describe("server lifecycle", () => {
  test("an empty room is disposed after the grace period", async () => {
    const server = await start({ disposeMs: 50 });
    const alice = await joinAs(server.port, await signUp(server.port, "alice"));
    const bob = await joinAs(server.port, await signUp(server.port, "bob"));
    expect(server.stats().rooms).toBe(1);

    alice.ws.close();
    await bob.bus.waitFor("avatar_leave");
    bob.ws.close();
    await eventually(() => server.stats().rooms === 0);
  });

  test("close() resolves with a socket still open", { timeout: 2000 }, async () => {
    const server = await start();
    await joinAs(server.port, await signUp(server.port, "alice"));
    await server.close();
    srv = undefined;
  });

  test("placed furni survives a restart and the original token still joins", async () => {
    const first = await start();
    const port = first.port;
    const token = await signUp(port, "alice");
    await stockUp(port, token);
    const alice = await joinAs(port, token);
    const bob = await joinAs(port, await signUp(port, "bob"));

    const chair = alice.state.inventory.find((i) => i.defId === "chair_basic");
    if (!chair) throw new Error("no chair in the starter inventory");
    alice.ws.send(JSON.stringify({ t: "place", itemId: chair.id, x: 2, y: 2, dir: 0 }));

    const placed = await alice.bus.waitFor("furni_placed");
    expect(placed.item).toEqual({ id: chair.id, defId: "chair_basic", x: 2, y: 2, z: 0, dir: 0, state: 0 });
    expect((await bob.bus.waitFor("furni_placed")).item).toEqual(placed.item);

    await first.close();
    const second = await start({ port });
    expect(second.port).toBe(port);

    // The café comes furnished (#312), so the chair is what this looks for, not the whole floor.
    const rejoined = await joinAs(port, token);
    expect(rejoined.state.furni.filter((f) => f.id === chair.id)).toEqual([
      { id: chair.id, defId: "chair_basic", x: 2, y: 2, z: 0, dir: 0, state: 0 },
    ]);
  });
});

describe("static serving", () => {
  function makeDist(): string {
    const root = join(dir, "dist");
    mkdirSync(join(root, "assets"), { recursive: true });
    writeFileSync(join(root, "index.html"), "<!doctype html><title>grand</title>");
    writeFileSync(join(root, "assets", "app-abc123.js"), "console.log(1)");
    return root;
  }

  /** fetch() collapses dot segments (even %2e-encoded) before sending, so traversal
   *  attempts need a raw socket path. */
  function rawGet(port: number, path: string): Promise<number> {
    return new Promise((resolvePromise, reject) => {
      const req = request({ host: "127.0.0.1", port, path, method: "GET" }, (res) => {
        res.resume();
        res.on("end", () => resolvePromise(res.statusCode ?? 0));
      });
      req.on("error", reject);
      req.end();
    });
  }

  test("serves index.html at / with no-cache", async () => {
    const { port } = await start({ staticDir: makeDist() });
    const res = await fetch(`http://127.0.0.1:${port}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(await res.text()).toContain("grand");
  });

  test("serves hashed assets as immutable", async () => {
    const { port } = await start({ staticDir: makeDist() });
    const res = await fetch(`http://127.0.0.1:${port}/assets/app-abc123.js`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/javascript");
    expect(res.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  });

  test("missing file 404s", async () => {
    const { port } = await start({ staticDir: makeDist() });
    expect((await fetch(`http://127.0.0.1:${port}/nope.js`)).status).toBe(404);
  });

  test("path traversal is rejected", async () => {
    const { port } = await start({ staticDir: makeDist() });
    expect(await rawGet(port, "/../test.db")).toBe(404);
    expect(await rawGet(port, "/assets/%2e%2e/%2e%2e/test.db")).toBe(404);
  });

  test("static root does not shadow /api, and auth still works", async () => {
    const server = await start({ staticDir: makeDist() });
    expect((await fetch(`http://127.0.0.1:${server.port}/api/anything`)).status).toBe(404);
    await signUp(server.port, "alice");
  });

  test("GET / without staticDir stays a 404", async () => {
    const { port } = await start();
    expect((await fetch(`http://127.0.0.1:${port}/`)).status).toBe(404);
  });
});
