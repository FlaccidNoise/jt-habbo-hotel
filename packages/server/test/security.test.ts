import { mkdtempSync, rmSync, statSync } from "node:fs";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { WebSocket } from "ws";
import { openDb, closeDb } from "../src/db.ts";
import { login, register, sessionAccount } from "../src/auth.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";

// Public-deploy hardening (#audit, 2026-08): session TTL + hashed tokens, login lockout, WS
// heartbeat, per-socket rate limit, maxPayload, and the Origin allowlist. Every knob has a small
// test value so the suite runs in real time without fake timers.

type Opts = Parameters<typeof startServer>[0];

let dir: string;
let dbPath: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-sec-"));
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
    body: JSON.stringify(body),
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("sessions", () => {
  test("the database stores a hash of the token, never the token itself", async () => {
    const db = openDb(dbPath);
    const { token } = await register(db, "alice", "password1");
    const row = db.prepare("SELECT token, expires_at AS exp FROM sessions").get() as {
      token: string;
      exp: number;
    };
    expect(row.token).toMatch(/^[0-9a-f]{64}$/);
    expect(row.token).not.toBe(token);
    expect(row.exp).toBeGreaterThan(Date.now());
    // The plaintext token a leaked row would expose validates nothing.
    expect(sessionAccount(db, row.token)).toBeNull();
    closeDb(db);
  });

  test("an expired session resolves to nobody; an active one renews past its half-life", async () => {
    const db = openDb(dbPath);
    const { token } = await register(db, "alice", "password1");
    db.prepare("UPDATE sessions SET expires_at = ?").run(Date.now() - 1000);
    expect(sessionAccount(db, token)).toBeNull();

    const soon = Date.now() + 1000; // well under half the TTL → sliding renewal must extend it
    db.prepare("UPDATE sessions SET expires_at = ?").run(soon);
    expect(sessionAccount(db, token)?.username).toBe("alice");
    const renewed = db.prepare("SELECT expires_at AS exp FROM sessions").get() as { exp: number };
    expect(renewed.exp).toBeGreaterThan(soon + 60 * 60 * 1000);
    closeDb(db);
  });

  test("opening the database purges legacy (unexpired-column) and dead sessions", () => {
    const db = openDb(dbPath);
    db.prepare("INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at) VALUES ('bob', 'bob', x'00', x'00', 'x', 1)").run();
    db.prepare("INSERT INTO sessions (token, account_id, created_at, expires_at) VALUES ('legacy', 1, 1, 0)").run();
    closeDb(db);
    const db2 = openDb(dbPath);
    expect(db2.prepare("SELECT COUNT(*) AS n FROM sessions").get()).toMatchObject({ n: 0 });
    closeDb(db2);
  });

  test("the database file is owner-only", () => {
    const db = openDb(dbPath);
    expect(statSync(dbPath).mode & 0o777).toBe(0o600);
    closeDb(db);
  });

  test("a wrong password on a real account and a missing account both refuse (timing-equalised)", async () => {
    const db = openDb(dbPath);
    await register(db, "alice", "password1");
    await expect(login(db, "alice", "wrong-pass")).rejects.toThrow("invalid username or password");
    await expect(login(db, "nobody", "wrong-pass")).rejects.toThrow("invalid username or password");
    closeDb(db);
  });
});

describe("login lockout", () => {
  test("repeated failures lock the username with 429; register is not throttled", async () => {
    const { port } = await start({ loginMaxFailures: 2, loginLockoutMs: 60_000 });
    await post(port, "/api/register", { username: "alice", password: "password1" });
    for (let i = 0; i < 2; i++) {
      const res = await post(port, "/api/login", { username: "alice", password: "wrong-pass" });
      expect(res.status).toBe(400);
    }
    const locked = await post(port, "/api/login", { username: "alice", password: "password1" });
    expect(locked.status).toBe(429);
    // A different username is unaffected, and register failures don't count toward it.
    const other = await post(port, "/api/register", { username: "bobby", password: "password1" });
    expect(other.status).toBe(200);
  });
});

describe("websocket hardening", () => {
  test("maxPayload drops an oversize frame before it is parsed", async () => {
    const { port } = await start({ maxPayload: 64 });
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const closed = new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));
    await new Promise((resolve) => ws.on("open", resolve));
    ws.send(JSON.stringify({ t: "join", token: "x".repeat(200), roomId: 1 }));
    // ws closes 1009 (message too big) of its own accord on the oversize frame.
    expect(await closed).toBe(1009);
  });

  test("the rate limiter closes a socket that outruns its bucket", async () => {
    const { port } = await start({ ratePerSec: 1, rateBurst: 3 });
    const reg = await post(port, "/api/register", { username: "alice", password: "password1" });
    const { token } = (await reg.json()) as { token: string };
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const closed = new Promise<number>((resolve) => ws.on("close", (code) => resolve(code)));
    await new Promise((resolve) => ws.on("open", resolve));
    // The join spends one token of the 3-burst bucket; the wave flood spends the rest, and the
    // frame that finds the bucket empty is the one that kills the socket.
    ws.send(JSON.stringify({ t: "join", token, roomId: 1 }));
    for (let i = 0; i < 5; i++) ws.send(JSON.stringify({ t: "wave" }));
    expect(await closed).toBe(4408);
  });

  test("a quiet-but-healthy socket survives the heartbeat; a ghost is terminated", async () => {
    const { port } = await start({ wsHeartbeatMs: 100 });
    // Healthy client: ws answers server pings automatically, so it must not be culled.
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise((resolve) => ws.on("open", resolve));
    await sleep(350);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();

    // Ghost: complete the HTTP upgrade by hand, then never pong. The sweep must cut it.
    const ghost = await new Promise<import("node:net").Socket>((resolve, reject) => {
      const sock = netConnect(port, "127.0.0.1", () => {
        const key = "dGhlIHNhbXBsZSBub25jZQ==";
        sock.write(
          `GET /ws HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nUpgrade: websocket\r\n` +
            `Connection: Upgrade\r\nSec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n\r\n`,
        );
      });
      let buf = "";
      sock.on("data", (d) => {
        buf += d.toString();
        if (buf.includes("\r\n\r\n")) resolve(sock);
      });
      sock.on("error", reject);
    });
    const ghostGone = new Promise<void>((resolve) => ghost.on("close", () => resolve()));
    await Promise.race([ghostGone, sleep(1500).then(() => { throw new Error("ghost never culled"); })]);
  });

  test("an Origin off the allowlist is rejected; absent or listed Origins pass", async () => {
    const { port } = await start({ allowedOrigins: ["https://ok.example"] });
    const attempt = (origin?: string): Promise<number> =>
      new Promise((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, origin ? { headers: { origin } } : {});
        ws.on("open", () => { ws.close(); resolve(200); });
        ws.on("error", (e) => resolve("statusCode" in e ? (e as { statusCode: number }).statusCode : 500));
      });
    expect(await attempt("https://evil.example")).not.toBe(200);
    expect(await attempt("https://ok.example")).toBe(200);
    expect(await attempt()).toBe(200);
  });
});

describe("http hardening", () => {
  test("responses carry nosniff; metrics refuses caching", async () => {
    const { port } = await start();
    const res = await post(port, "/api/login", { username: "x", password: "y".repeat(8) });
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const metrics = await fetch(`http://127.0.0.1:${port}/api/metrics`);
    expect(metrics.headers.get("cache-control")).toBe("no-store");
  });
});
