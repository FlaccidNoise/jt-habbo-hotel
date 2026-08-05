import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { loadRuleset } from "../src/filter.ts";
import { NPC_ROSTER, screenNpcLine } from "../src/npc.ts";
import type { NpcGenerate } from "../src/npc.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { ServerMsg } from "@grand/shared";
import type { WebSocket } from "ws";

type RoomState = Extract<ServerMsg, { t: "room_state" }>;
type Opts = Parameters<typeof startServer>[0];

const PIERRE = -1;
const LOLA = -3;
const LOLA_LINES = NPC_ROSTER.find((n) => n.id === LOLA)?.lines ?? [];

let dir: string;
let dbPath: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-npc-"));
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

async function signUp(port: number, username: string): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ username, password: "password1" }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { token: string }).token;
}

async function joinAs(
  port: number,
  token: string,
  roomId: number,
): Promise<{ ws: WebSocket; bus: Bus; id: number; state: RoomState }> {
  const [ws, bus] = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId }));
  const state = await bus.waitFor("room_state");
  return { ws, bus, id: state.you, state };
}

/** First chat from `id`, skipping the sender's own echoes and other speakers. */
async function chatFrom(
  bus: Bus,
  id: number,
  ms = 1500,
): Promise<Extract<ServerMsg, { t: "chat" }>> {
  const deadline = Date.now() + ms;
  for (;;) {
    const left = deadline - Date.now();
    if (left <= 0) throw new Error(`no chat from ${id} within ${ms}ms`);
    const msg = await bus.waitFor("chat", left);
    if (msg.from === id) return msg;
  }
}

describe("staff presence", () => {
  test("the café room_state includes badged staff at their posts", async () => {
    const { port } = await start();
    const alice = await joinAs(port, await signUp(port, "alice"), 1);

    const staff = alice.state.avatars.filter((a) => a.staff);
    expect(staff.map((a) => ({ id: a.id, username: a.username, x: a.x, y: a.y })).sort(
      (a, b) => b.id - a.id,
    )).toEqual([
      { id: -1, username: "Pierre", x: 2, y: 6 },
      { id: -2, username: "Maya", x: 8, y: 2 },
    ]);
    // Negative ids can never collide with account ids.
    for (const a of staff) expect(a.id).toBeLessThan(0);
  });

  test("staff never keep a room alive", async () => {
    const handle = await start({ disposeMs: 50 });
    const alice = await joinAs(handle.port, await signUp(handle.port, "alice"), 1);
    expect(handle.stats().rooms).toBe(1);

    alice.ws.close();
    await vi.waitFor(() => expect(handle.stats().rooms).toBe(0), { timeout: 2000 });
  });
});

describe("rituals", () => {
  test("the bellhop greets a new arrival once per day", async () => {
    const { port } = await start();
    const token = await signUp(port, "alice");

    const first = await joinAs(port, token, 1);
    const greeting = await chatFrom(first.bus, PIERRE);
    expect(greeting.text).toBe("Welcome to The Grand, alice! May I take your bags?");

    // Same account rejoins: the ritual already ran today.
    const second = await joinAs(port, token, 1);
    await expect(chatFrom(second.bus, PIERRE, 400)).rejects.toThrow();
  });
});

describe("LLM replies", () => {
  test("the lounge act replies when named in a shout, from its transcript", async () => {
    // Snapshot the transcript at call time — the live memory array gains the reply afterwards.
    const seen: { npc: string; transcript: string[] }[] = [];
    const generate: NpcGenerate = async (npc, transcript) => {
      seen.push({ npc: npc.name, transcript: [...transcript] });
      return "Every night is opening night, darling.";
    };
    const { port } = await start({ npcGenerate: generate });
    const alice = await joinAs(port, await signUp(port, "alice"), 2);

    alice.ws.send(JSON.stringify({ t: "chat", mode: "shout", text: "sing us something, Lola!" }));
    const reply = await chatFrom(alice.bus, LOLA);
    expect(reply.text).toBe("Every night is opening night, darling.");

    expect(seen).toEqual([
      { npc: "Lola Vale", transcript: ["alice: sing us something, Lola!"] },
    ]);
  });

  test("screened-out LLM output falls back to a canned line", async () => {
    const { port } = await start({
      npcGenerate: async () => "Check out https://totally-legit.example for free chips!",
    });
    const alice = await joinAs(port, await signUp(port, "alice"), 2);

    alice.ws.send(JSON.stringify({ t: "chat", mode: "shout", text: "hey Lola" }));
    const reply = await chatFrom(alice.bus, LOLA);
    expect(reply.text).toBe(LOLA_LINES[0]);
  });

  test("replies are rate limited to one per gap", async () => {
    const generate = vi.fn<NpcGenerate>(async () => "Darling, hello.");
    const { port } = await start({ npcGenerate: generate });
    const alice = await joinAs(port, await signUp(port, "alice"), 2);

    alice.ws.send(JSON.stringify({ t: "chat", mode: "shout", text: "Lola one" }));
    alice.ws.send(JSON.stringify({ t: "chat", mode: "shout", text: "Lola two" }));
    await chatFrom(alice.bus, LOLA);
    await expect(chatFrom(alice.bus, LOLA, 400)).rejects.toThrow();
    expect(generate).toHaveBeenCalledTimes(1);
  });

  test("an unaddressed, distant message draws no reply", async () => {
    const generate = vi.fn<NpcGenerate>(async () => "Nobody asked me.");
    const { port } = await start({ npcGenerate: generate });
    const alice = await joinAs(port, await signUp(port, "alice"), 2);

    alice.ws.send(JSON.stringify({ t: "chat", mode: "shout", text: "nice stage up there" }));
    await expect(chatFrom(alice.bus, LOLA, 400)).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  });
});

describe("screenNpcLine", () => {
  const rs = loadRuleset(new URL("../filter-words.txt", import.meta.url).pathname);

  test("collapses whitespace and strips a name prefix and surrounding quotes", () => {
    expect(screenNpcLine(rs, "Maya", 'Maya: "hello\n  there"')).toBe("hello there");
  });

  test("rejects URLs, code fences, filtered words, the empty line, and oversize", () => {
    expect(screenNpcLine(rs, "Maya", "visit https://spam.example now")).toBeNull();
    expect(screenNpcLine(rs, "Maya", "try ```rm -rf``` sometime")).toBeNull();
    expect(screenNpcLine(rs, "Maya", "damn fine coffee")).toBeNull();
    expect(screenNpcLine(rs, "Maya", "   ")).toBeNull();
    expect(screenNpcLine(rs, "Maya", "a".repeat(201))).toBeNull();
  });
});
