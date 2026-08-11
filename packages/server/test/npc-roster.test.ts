import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vitest";
import { PROTOTYPE_CATALOG, footprintTiles, parseHeightmap, tileHeight } from "@grand/shared";
import type { Door, FurniItem, RoomModel, ServerMsg, Tile } from "@grand/shared";
import Database from "better-sqlite3";
import { closeDb, openDb } from "../src/db.ts";
import { GROUNDS_ROOM_ID } from "../src/grounds.ts";
import type { Rect } from "../src/grounds.ts";
import { COFFEE_STARS, NPC_FAUCET_CAP, balanceOf, settleEarn } from "../src/ledger.ts";
import { NPC_ROSTER, NpcService } from "../src/npc.ts";
import type { NpcDef, NpcOccupant, NpcRoom } from "../src/npc.ts";
import { reachable } from "../src/pathfind.ts";
import { MS_PER_TILE, Room } from "../src/room.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { WebSocket } from "ws";

// WP8: the Resort Grounds gets its staff. The posts in the roster were chosen against a floor
// that grounds.ts generates from rect fills, so the honest deliverable is not the coordinates —
// it is this sweep. Everything a post has to be (walkable, unblocked, reachable, inside its own
// home rect) and everything a seat has to be (a real seat the room will actually sit an NPC on)
// is checked here against a seeded database rather than read off the layout by eye.

// Mirrors of npc.ts constants. Kept local on purpose: they are behaviour numbers, not API, and a
// test that imports them cannot notice one changing underneath the roster.
const ROAM_MAX = 20;
const IDLE_MS = 20_000;
const ENGAGE_R = 3;
const ENGAGE_SPACING = 2 * ENGAGE_R + 1;   // two notice circles plus the tile between them
const CAFE_SPEAK_RADIUS = 5;               // CAFE_CHAT, db.ts
const GROUNDS_SPEAK_RADIUS = 6;            // GROUNDS_CHAT, grounds.ts

/** server.ts builds the faucet op as `npc_${ritual}`. The end-to-end test below pins that the
 *  production path really writes this string, which is what makes the cap test's arithmetic a
 *  claim about the running hotel and not about a copy of its wiring. */
const NPC_COFFEE_OP = "npc_coffee";

const GROUNDS_STAFF = ["Odette", "Bruno", "Kit", "Sable Rey", "Milo", "Delphine", "Aurelio", "Wren"];

const DEFS = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
const cheb = (a: Tile, b: Tile): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const inRect = (r: Rect, t: Tile): boolean =>
  t.x >= r.x0 && t.x <= r.x1 && t.y >= r.y0 && t.y <= r.y1;

const npcNamed = (name: string): NpcDef => {
  const npc = NPC_ROSTER.find((n) => n.name === name);
  if (!npc) throw new Error(`the roster no longer has ${name}`);
  return npc;
};

/** A room as a walker sees it: the parsed floor, what the seeded furniture closes, what it seats,
 *  and one reachability sweep from the door. The same shape grounds.test.ts uses, per room id. */
interface Survey {
  model: RoomModel;
  blocked: (x: number, y: number) => boolean;
  coveredBy: (x: number, y: number) => string | undefined;
  open: Uint8Array;
}

let dir: string;
let db: Database.Database;
const surveys = new Map<number, Survey>();

function survey(roomId: number): Survey {
  const known = surveys.get(roomId);
  if (known) return known;

  const doc = JSON.parse(
    (db.prepare("SELECT doc FROM rooms WHERE id = ?").get(roomId) as { doc: string }).doc,
  ) as { heightmap: string; door: Door };
  const model = parseHeightmap(doc.heightmap, doc.door);
  const items = db
    .prepare(
      "SELECT id, def_id AS defId, x, y, z, dir, state FROM furni_items" +
        " WHERE room_id = ? AND wall_side IS NULL",
    )
    .all(roomId) as FurniItem[];

  const solid = new Map<string, string>();
  for (const item of items) {
    const def = DEFS.get(item.defId);
    if (!def) throw new Error(`the layout names a def that is not in the catalog: ${item.defId}`);
    if (def.canWalk) continue;
    for (const t of footprintTiles(def, item.x, item.y, item.dir)) solid.set(`${t.x},${t.y}`, def.id);
  }
  const blocked = (x: number, y: number): boolean => solid.has(`${x},${y}`);
  const made: Survey = {
    model,
    blocked,
    coveredBy: (x, y) => solid.get(`${x},${y}`),
    open: reachable(model, blocked, { x: doc.door.x, y: doc.door.y }),
  };
  surveys.set(roomId, made);
  return made;
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-roster-"));
  db = openDb(join(dir, "survey.db"));
}, 30_000);

afterAll(() => {
  closeDb(db);
  rmSync(dir, { recursive: true, force: true });
});

describe("every NPC stands somewhere real", () => {
  test("posts are walkable, unblocked, reachable from the door, and inside their home rect", () => {
    const faults: string[] = [];
    for (const npc of NPC_ROSTER) {
      const { model, blocked, coveredBy, open } = survey(npc.roomId);
      const { x, y } = npc.post;
      const at = `${npc.name} at ${x},${y}`;
      if (x < 0 || y < 0 || x >= model.width || y >= model.height) {
        faults.push(`${at}: outside a ${model.width}x${model.height} room`);
        continue;
      }
      if (tileHeight(model, x, y) < 0) faults.push(`${at}: void tile`);
      if (blocked(x, y)) faults.push(`${at}: standing inside ${coveredBy(x, y)}`);
      if (open[y * model.width + x] !== 1) faults.push(`${at}: no route from the door`);
      if (npc.home && !inRect(npc.home, npc.post)) faults.push(`${at}: outside its own home rect`);
    }
    expect(faults).toEqual([]);
  });

  test("home rects sit inside their room and leave somewhere to roam", () => {
    const faults: string[] = [];
    for (const npc of NPC_ROSTER) {
      if (!npc.home) continue;
      const { model, open } = survey(npc.roomId);
      const h = npc.home;
      if (h.x0 > h.x1 || h.y0 > h.y1) faults.push(`${npc.name}: inside-out home rect`);
      if (h.x0 < 0 || h.y0 < 0 || h.x1 >= model.width || h.y1 >= model.height) {
        faults.push(`${npc.name}: home rect leaves the room`);
        continue;
      }
      // A home rect made entirely of hedge and furniture would leave the NPC drawing six dead
      // waypoints a cycle forever, which reads as a broken NPC rather than a still one.
      let roamable = 0;
      for (let y = h.y0; y <= h.y1; y++) {
        for (let x = h.x0; x <= h.x1; x++) if (open[y * model.width + x] === 1) roamable++;
      }
      if (roamable < 20) faults.push(`${npc.name}: only ${roamable} reachable tiles at home`);
    }
    expect(faults).toEqual([]);
  });

  test("listed seats are inside the home rect and within one walk of the post", () => {
    const faults: string[] = [];
    for (const npc of NPC_ROSTER) {
      for (const seat of npc.seats ?? []) {
        const at = `${npc.name}'s seat at ${seat.x},${seat.y}`;
        if (npc.home && !inRect(npc.home, seat)) faults.push(`${at}: outside the home rect`);
        // seatpoint refuses anything past ROAM_MAX, so a seat further than that is furniture the
        // NPC can never pick — dead content that no other check would notice.
        if (cheb(seat, npc.post) > ROAM_MAX) faults.push(`${at}: ${cheb(seat, npc.post)} from the post`);
      }
      // WP6: an NPC that just stood up is still standing on the seat it vacated, and it cannot
      // pick that tile again while it is on it. One seat means one sit and then nothing.
      if (npc.seats && npc.seats.length < 2) faults.push(`${npc.name}: only one seat listed`);
    }
    expect(faults).toEqual([]);
  });

  test("ids are unique and negative, and every roomId is a room that exists", () => {
    const ids = NPC_ROSTER.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id >= 0)).toEqual([]);

    const rooms = new Set(
      (db.prepare("SELECT id FROM rooms").all() as Array<{ id: number }>).map((r) => r.id),
    );
    expect(NPC_ROSTER.filter((n) => !rooms.has(n.roomId)).map((n) => n.name)).toEqual([]);
  });
});

describe("the Resort Grounds roster", () => {
  const grounds = (): NpcDef[] => NPC_ROSTER.filter((n) => n.roomId === GROUNDS_ROOM_ID);

  test("npcsFor(4) is the eight the zones were staffed with", () => {
    const svc = new NpcService({ generate: null, say: vi.fn() });
    try {
      expect(svc.npcsFor(GROUNDS_ROOM_ID).map((n) => n.name)).toEqual(GROUNDS_STAFF);
      expect(svc.npcsFor(GROUNDS_ROOM_ID).map((n) => n.id)).toEqual([-4, -5, -6, -7, -8, -9, -10, -11]);
      expect(svc.npcsFor(1).map((n) => n.name)).toEqual(["Pierre", "Maya"]);
    } finally {
      svc.stop();
    }
  });

  test("no player who stops walking is inside two NPCs' notice radius", () => {
    // ENGAGE_R is a radius, so two NPCs closer than 2R+1 share tiles a stopped player can occupy.
    // PROACTIVE_GAP_MS would space the lines out, but the player still ends up talked at twice for
    // standing still once. The stage pair is the deliberate exception: the tick never lets a
    // `performs` NPC greet, so two acts on one stage cannot double up on anyone.
    const crowded: string[] = [];
    const staff = grounds();
    for (let i = 0; i < staff.length; i++) {
      for (let j = i + 1; j < staff.length; j++) {
        const a = staff[i] as NpcDef, b = staff[j] as NpcDef;
        if (a.performs && b.performs) continue;
        const d = cheb(a.post, b.post);
        if (d < ENGAGE_SPACING) crowded.push(`${a.name} and ${b.name} are ${d} apart`);
      }
    }
    expect(crowded).toEqual([]);
    expect(staff.filter((n) => n.performs).map((n) => n.name)).toEqual(["Sable Rey", "Milo"]);
  });

  test("the residency stays on the stage and the roamers stay in their zones", () => {
    // `performs` and `home` are the two switches that decide whether an NPC moves at all. A singer
    // with a home rect would wander off mid-set; a roamer without one is a statue.
    for (const npc of grounds()) {
      if (npc.performs) expect(npc.home, `${npc.name} performs`).toBeUndefined();
      else expect(npc.home, `${npc.name} roams`).toBeDefined();
    }
  });

  test("every proactive greeter has canned lines to greet with", () => {
    // Proactive lines are canned by contract (§6.3) — the LLM is never asked for one. An NPC with
    // no `greetings` falls back to `lines`, so what matters is that both pools are stocked.
    for (const npc of grounds()) {
      expect(npc.lines.length, `${npc.name} lines`).toBeGreaterThanOrEqual(4);
      if (npc.performs) continue;
      expect(npc.greetings?.length ?? 0, `${npc.name} greetings`).toBeGreaterThanOrEqual(3);
    }
  });

  test("no persona puts the model near the money", () => {
    // Decision log 2026-08-03: NPC payouts are deterministic and the LLM has no payout authority.
    // systemPrompt already forbids the model to promise Stars, chips, prizes, discounts or
    // payouts; a persona is the one part of that prompt content work writes, so a persona naming
    // any of them argues with the guardrail sitting two sentences below it. Canned lines are not
    // checked — they are authored output, screened on the way out, and a lounge singer is allowed
    // to sing about stars falling.
    const money = /\b(stars?|chips?|prizes?|discounts?|payouts?|odds)\b/i;
    for (const npc of NPC_ROSTER) {
      expect(money.test(npc.persona), `${npc.name}'s persona`).toBe(false);
    }
  });
});

describe("the seats the roster lists", () => {
  // The room is the authority on whether a seat is a seat. This drives the real Room through the
  // same call npc.ts makes — requestSit walks there and sits on arrival — so it fails if the tile
  // holds no seat def, if the seat cannot be reached from the post, or if the walk never lands.
  test("the real room sits an NPC on every one of them", () => {
    vi.useFakeTimers();
    try {
      const room = new Room(db, GROUNDS_ROOM_ID, () => {});
      for (const npc of NPC_ROSTER.filter((n) => n.roomId === GROUNDS_ROOM_ID && n.seats)) {
        room.addNpc({ id: npc.id, name: npc.name, post: npc.post, dir: npc.dir });
        for (const seat of npc.seats ?? []) {
          room.requestSit(npc.id, seat.x, seat.y);
          vi.advanceTimersByTime(MS_PER_TILE * (ROAM_MAX + 2));
          expect(
            room.occupants().find((o) => o.accountId === npc.id),
            `${npc.name} on the seat at ${seat.x},${seat.y}`,
          ).toMatchObject({ x: seat.x, y: seat.y, posture: "sit" });
        }
      }
    } finally {
      vi.useRealTimers();
    }
  });

  // Regression for the seam between npc.ts and Room: `seatpoint` used to gate a seat on
  // `roamOk`, which answers "may an occupant stand here" — and a chair is non-walkable furni, so
  // it refused every seat in the hotel. Nothing caught it, because the WP6 tests run against a
  // fake room whose roamOk knows nothing about furniture. This one wires the real mask in.
  test("an NPC set loose in the real room actually sets off for one", () => {
    vi.useFakeTimers();
    const random = vi.spyOn(Math, "random").mockReturnValue(0);   // seat branch, first seat listed
    const room = new Room(db, GROUNDS_ROOM_ID, () => {});
    const bruno = npcNamed("Bruno");
    const occupants: NpcOccupant[] = [
      { accountId: bruno.id, username: bruno.name, ...bruno.post, posture: "stand" },
      { accountId: 7, username: "alice", x: 0, y: 100, posture: "stand" },
    ];
    const sits: Tile[] = [];
    const harness: NpcRoom = {
      chatConfig: { speakRadius: GROUNDS_SPEAK_RADIUS },
      occupants: () => occupants,
      occupantCount: () => 1,
      requestMove: () => {},
      requestSit: (_id, x, y) => void sits.push({ x, y }),
      requestStand: () => {},
      isWalking: () => false,
      roamOk: (x, y) => room.roamOk(x, y),        // the real mask, off the real seeded floor
      face: () => {},
    };
    const svc = new NpcService({
      generate: null, say: vi.fn(), roster: [bruno], room: () => harness,
    });
    try {
      svc.onPlayerJoin(GROUNDS_ROOM_ID, "alice");
      vi.advanceTimersByTime(IDLE_MS);
      expect(sits).toEqual([bruno.seats?.[0]]);
    } finally {
      svc.stop();
      random.mockRestore();
      vi.useRealTimers();
    }
  });
});

describe("the Grounds staff in a booted room", () => {
  let srv: ServerHandle | undefined;
  let bootDir: string | undefined;
  let dbPath = "";

  async function boot(): Promise<number> {
    bootDir = mkdtempSync(join(tmpdir(), "grand-roster-ws-"));
    dbPath = join(bootDir, "test.db");
    srv = await startServer({ port: 0, dbPath, npcGenerate: null });
    return srv.port;
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
    port: number, token: string, roomId: number,
  ): Promise<{ ws: WebSocket; bus: Bus; state: Extract<ServerMsg, { t: "room_state" }> }> {
    const [ws, bus] = await connect(port);
    ws.send(JSON.stringify({ t: "join", token, roomId }));
    return { ws, bus, state: await bus.waitFor("room_state") };
  }

  afterEach(async () => {
    if (srv) await srv.close();
    srv = undefined;
    if (bootDir) rmSync(bootDir, { recursive: true, force: true });
    bootDir = undefined;
  });

  test("room_state shows all eight badged at their posts", async () => {
    const port = await boot();
    const alice = await joinAs(port, await signUp(port, "alice"), GROUNDS_ROOM_ID);

    const staff = alice.state.avatars
      .filter((a) => a.staff)
      .sort((a, b) => b.id - a.id)
      .map((a) => ({ id: a.id, username: a.username, x: a.x, y: a.y }));

    expect(staff).toEqual(
      NPC_ROSTER.filter((n) => n.roomId === GROUNDS_ROOM_ID).map((n) => ({
        id: n.id, username: n.name, x: n.post.x, y: n.post.y,
      })),
    );
    for (const a of staff) expect(a.id).toBeLessThan(0);
  }, 30_000);

  // The money claim, half one. Everything below turns on the faucet op the ritual writes, so read
  // it off the running server rather than off the source.
  test("the coffee ritual writes exactly one ledger op, and it is npc_coffee", async () => {
    const port = await boot();
    const alice = await joinAs(port, await signUp(port, "alice"), 1);
    const maya = npcNamed("Maya");

    // The ritual needs the player inside APPROACH of the barista, and a join spawns them at the
    // door. (6, 2) is the nearest tile to the café door that is within two of her post.
    alice.ws.send(JSON.stringify({ t: "move", x: 6, y: 2 }));
    const walk = await alice.bus.waitFor("walk");
    await new Promise((r) => setTimeout(r, walk.path.length * walk.msPerTile + 250));

    alice.ws.send(JSON.stringify({ t: "chat", mode: "say", text: "one coffee please" }));
    const paid = await alice.bus.waitFor("stars");
    expect(paid).toMatchObject({ delta: COFFEE_STARS, reason: "coffee" });

    alice.ws.close();
    await srv?.close();
    srv = undefined;

    const raw = new Database(dbPath, { readonly: true });
    const rows = raw
      .prepare("SELECT op, stars FROM ledger_entries WHERE account_id = ? AND op LIKE 'npc_%'")
      .all(alice.state.you) as Array<{ op: string; stars: number }>;
    raw.close();
    expect(rows).toEqual([{ op: NPC_COFFEE_OP, stars: COFFEE_STARS }]);
  }, 30_000);
});

// The money claim, half two. Two coffee servers is one faucet, not two: the payout is capped per
// account per op, and both baristas derive the same op from the same ritual name. This runs the
// real ledger through the real service, and the test above pins that the op it writes is the one
// production writes.
describe("two coffee servers, one daily allowance", () => {
  const maya = (): NpcDef => npcNamed("Maya");
  const aurelio = (): NpcDef => npcNamed("Aurelio");

  function account(name: string): number {
    const info = db
      .prepare(
        `INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at)
         VALUES (?, ?, ?, ?, 'test', 0)`,
      )
      .run(name, name, Buffer.alloc(1), Buffer.alloc(1));
    return Number(info.lastInsertRowid);
  }

  /** The service wired to the real ledger the way server.ts wires it. */
  function served(): { svc: NpcService; say: ReturnType<typeof vi.fn>; grants: number[] } {
    const grants: number[] = [];
    const say = vi.fn();
    const svc = new NpcService({
      generate: null,
      say,
      payout: (accountId, ritual) => {
        const { granted } = settleEarn(db, {
          opKey: randomUUID(),
          op: `npc_${ritual}`,
          accountId,
          amount: COFFEE_STARS,
          opCap: NPC_FAUCET_CAP,
        });
        grants.push(granted);
        return granted;
      },
    });
    return { svc, say, grants };
  }

  const askMaya = (svc: NpcService, accountId: number, username: string): void =>
    svc.onPlayerChat(
      1, { accountId, username, x: maya().post.x - 1, y: maya().post.y }, [],
      CAFE_SPEAK_RADIUS, "say", "coffee please",
    );

  const askAurelio = (svc: NpcService, accountId: number, username: string): void =>
    svc.onPlayerChat(
      GROUNDS_ROOM_ID, { accountId, username, x: aurelio().post.x, y: aurelio().post.y + 2 }, [],
      GROUNDS_SPEAK_RADIUS, "say", "coffee please",
    );

  test("both baristas run the same ritual, so both derive the same faucet op", () => {
    expect(maya().ritual).toBe("coffee");
    expect(aurelio().ritual).toBe("coffee");
    expect(`npc_${aurelio().ritual}`).toBe(NPC_COFFEE_OP);
  });

  test("a player capped by Maya gets nothing from Aurelio, and hears why", () => {
    const { svc, say, grants } = served();
    const alice = account("capped-alice");
    try {
      const cups = NPC_FAUCET_CAP / COFFEE_STARS;
      for (let i = 0; i < cups; i++) askMaya(svc, alice, "alice");
      expect(grants).toEqual(Array.from({ length: cups }, () => COFFEE_STARS));
      expect(balanceOf(db, alice)).toBe(NPC_FAUCET_CAP);

      askAurelio(svc, alice, "alice");
      expect(grants.at(-1)).toBe(0);
      expect(balanceOf(db, alice)).toBe(NPC_FAUCET_CAP);
      expect(say.mock.calls.at(-1)?.[2]).toMatch(/tomorrow/);

      const ops = db
        .prepare("SELECT DISTINCT op FROM ledger_entries WHERE account_id = ?")
        .all(alice) as Array<{ op: string }>;
      expect(ops).toEqual([{ op: NPC_COFFEE_OP }]);
    } finally {
      svc.stop();
    }
  });

  test("Aurelio still serves a player who has not been served — the cap is shared, not spent", () => {
    const { svc, grants, say } = served();
    const bob = account("fresh-bob");
    try {
      askAurelio(svc, bob, "bob");
      expect(grants).toEqual([COFFEE_STARS]);
      expect(balanceOf(db, bob)).toBe(COFFEE_STARS);
      expect(say.mock.calls.at(-1)?.[2]).toContain(`${COFFEE_STARS} Stars`);
    } finally {
      svc.stop();
    }
  });
});
