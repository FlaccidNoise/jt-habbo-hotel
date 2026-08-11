import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import SQLite from "better-sqlite3";
import { NpcService } from "../src/npc.ts";
import type { NpcDef, NpcGenerate, Speaker } from "../src/npc.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";

// GLOBAL_LLM_CAP pins fleet-wide LLM spend at what 3 NPCs committed to (decision log 2026-08-04)
// now that the roster is 11. Pinned here: the cap binds fleet-wide even when no single NPC is
// anywhere near its own DAILY_LLM_CAP, both counters share the same UTC-day rollover, and the
// tick/path/proactive numbers surface on GET /api/metrics.

const REPLY_GAP_MS = 8000;
const PER_NPC_CAP = 200;
const GLOBAL_CAP = 600;
const TICK_MS = 1000;

const npc = (id: number, extra: Partial<NpcDef> = {}): NpcDef => ({
  id,
  roomId: 1,
  name: `Npc${-id}`,
  post: { x: 0, y: 0 },
  dir: 2,
  persona: "a test-only NPC.",
  lines: [`${-id}-canned`],
  ...extra,
});

const ALICE: Speaker = { accountId: 7, username: "alice", x: 0, y: 0 };

let services: NpcService[] = [];

function service(roster: NpcDef[], generate: NpcGenerate | null) {
  const say = vi.fn();
  const svc = new NpcService({ generate, say, roster });
  services.push(svc);
  return { svc, say };
}

/** Direct address by name, heard fleet-wide ("shout" skips the distance check) — the shortest
 *  path to `reply()` without needing a fake room. */
function chat(svc: NpcService, text: string): void {
  svc.onPlayerChat(1, ALICE, [ALICE], 6, "shout", text);
}

describe("fleet-wide LLM budget and tick metrics", () => {
  beforeEach(() => {
    vi.useFakeTimers(); // BEFORE constructing the service — the tick starts in the constructor
    services = [];
  });

  afterEach(() => {
    for (const svc of services) svc.stop();
    vi.useRealTimers();
  });

  describe("GLOBAL_LLM_CAP", () => {
    test("the 601st LLM call of the day falls back to canned, spread so no per-NPC cap trips", async () => {
      const roster = [0, 1, 2, 3].map((i) => npc(-(i + 1)));
      const generate = vi.fn<NpcGenerate>(async () => "an LLM line");
      const { svc, say } = service(roster, generate);

      for (let i = 0; i < 601; i++) {
        const target = roster[i % 4]!;
        chat(svc, `hello ${target.name}`);
        await vi.advanceTimersByTimeAsync(REPLY_GAP_MS); // clears that NPC's own reply gate
      }

      // 601 dispatches, 4 NPCs: each stays at 150-151 calls — nowhere near its own 200-cap — yet
      // the fleet total stops at 600.
      expect(generate).toHaveBeenCalledTimes(GLOBAL_CAP);
      expect(svc.metrics().llm).toEqual({ today: GLOBAL_CAP, perNpcCap: PER_NPC_CAP, globalCap: GLOBAL_CAP });
      expect(say.mock.calls.at(-1)?.[2]).toBe(roster[0]!.lines[0]); // the 601st fell back to canned
    });

    test("both the per-NPC and fleet-wide counters reset at UTC midnight", async () => {
      vi.setSystemTime(new Date("2026-08-10T23:00:00Z"));
      const rex = npc(-1);
      const generate = vi.fn<NpcGenerate>(async () => "an LLM line");
      const { svc, say } = service([rex], generate);

      for (let i = 0; i < PER_NPC_CAP; i++) {
        chat(svc, `hi ${rex.name}`);
        await vi.advanceTimersByTimeAsync(REPLY_GAP_MS);
      }
      expect(generate).toHaveBeenCalledTimes(PER_NPC_CAP);
      expect(svc.metrics().llm).toEqual({ today: PER_NPC_CAP, perNpcCap: PER_NPC_CAP, globalCap: GLOBAL_CAP });

      // capped per-NPC, same day, even with headroom left in the global budget.
      chat(svc, `hi ${rex.name}`);
      await vi.advanceTimersByTimeAsync(0);
      expect(generate).toHaveBeenCalledTimes(PER_NPC_CAP);
      expect(say.mock.calls.at(-1)?.[2]).toBe(rex.lines[0]);

      vi.setSystemTime(new Date("2026-08-11T00:05:00Z")); // past UTC midnight
      expect(svc.metrics().llm.today).toBe(0); // rolls over lazily on read, no call needed

      chat(svc, `hi ${rex.name}`);
      await vi.advanceTimersByTimeAsync(0);
      expect(generate).toHaveBeenCalledTimes(PER_NPC_CAP + 1);
      expect(svc.metrics().llm.today).toBe(1);
    });
  });

  describe("tick timing", () => {
    test("lastMs, maxMs and count advance as the tick runs", () => {
      const { svc } = service([], null);
      expect(svc.metrics().tick).toEqual({ lastMs: 0, maxMs: 0, count: 0 });

      vi.advanceTimersByTime(TICK_MS * 3);
      const m = svc.metrics().tick;
      expect(m.count).toBe(3);
      expect(m.lastMs).toBeGreaterThanOrEqual(0);
      expect(m.maxMs).toBeGreaterThanOrEqual(m.lastMs);
    });
  });
});

describe("GET /api/metrics npc block", () => {
  let dir: string;
  let srv: ServerHandle | undefined;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grand-npc-metrics-"));
    srv = undefined;
  });

  afterEach(async () => {
    if (srv) await srv.close();
    rmSync(dir, { recursive: true, force: true });
  });

  /** What `make staff USER=<username>` does, against the running server's own database. */
  function makeStaff(dbPath: string, username: string): void {
    const side = new SQLite(dbPath);
    side.prepare("UPDATE accounts SET is_staff = 1 WHERE username = ?").run(username);
    side.close();
  }

  async function register(port: number, username: string): Promise<string> {
    const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, password: "password1" }),
    });
    return ((await res.json()) as { token: string }).token;
  }

  test("carries the npc block for staff, still 403 for a non-staff session", async () => {
    const dbPath = join(dir, "test.db");
    srv = await startServer({ port: 0, dbPath, npcGenerate: null });
    const { port } = srv;

    const token = await register(port, "alice");
    expect(
      (
        await fetch(`http://127.0.0.1:${port}/api/metrics`, {
          headers: { authorization: `Bearer ${token}` },
        })
      ).status,
    ).toBe(403);

    makeStaff(dbPath, "alice");
    const res = await fetch(`http://127.0.0.1:${port}/api/metrics`, {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      npc: {
        tick: { lastMs: number; maxMs: number; count: number };
        paths: { issued: number; deferred: number };
        llm: { today: number; perNpcCap: number; globalCap: number };
        proactive: { today: number; suppressed: number };
        roaming: number;
      };
    };
    expect(body.npc.llm).toEqual({ today: 0, perNpcCap: PER_NPC_CAP, globalCap: GLOBAL_CAP });
    expect(body.npc.paths).toEqual({ issued: 0, deferred: 0 });
    expect(body.npc.proactive).toEqual({ today: 0, suppressed: 0 });
    expect(body.npc.roaming).toBe(0);
    expect(body.npc.tick.count).toBeGreaterThanOrEqual(0);
  });
});
