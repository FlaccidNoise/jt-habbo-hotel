import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { ServerMsg, Tile } from "@grand/shared";
import type Database from "better-sqlite3";
import { closeDb, openDb } from "../src/db.ts";
import { grantStarter } from "../src/items.ts";
import { NPC_ROSTER, NpcService } from "../src/npc.ts";
import type { NpcDef, NpcOccupant, NpcRoom } from "../src/npc.ts";
import { MS_PER_TILE, Room } from "../src/room.ts";
import type { Emit } from "../src/room.ts";

// Zone-scoped wandering. What is pinned here: an NPC only ever asks for a tile the room's static
// reachability mask allows (the guarantee that keeps findPath off unreachable pockets), it stays
// inside its home rect and within ROAM_MAX of itself, an NPC without a home rect never moves at
// all, and the per-tick path budget defers rather than drops.

const TICK_MS = 1000;
const IDLE_MS = 20_000;
const IDLE_JITTER = 20_000;
const ROAM_MAX = 20;
const ENGAGE_HOLD_MS = 20_000;

/** With Math.random pinned to 0.5: the post bias misses, the draw lands mid-rect, and every
 *  waypoint is due IDLE_MS + half the jitter after the room activates. */
const CYCLE_MS = IDLE_MS + IDLE_JITTER / 2;

const REX = -1;
const ALICE = 7;

const npc = (id: number, post: Tile, extra: Partial<NpcDef> = {}): NpcDef => ({
  id,
  roomId: 1,
  name: `Npc${-id}`,
  post,
  dir: 2,
  persona: "a test-only NPC.",
  lines: [`${-id}-canned`],
  ...extra,
});

const staff = (def: NpcDef): NpcOccupant => ({
  accountId: def.id,
  username: def.name,
  x: def.post.x,
  y: def.post.y,
  posture: "stand",
});

const player = (accountId: number, username: string, x: number, y: number): NpcOccupant => ({
  accountId,
  username,
  x,
  y,
  posture: "stand",
});

/** A room with no players in it does no tick work at all, so every wandering test needs one —
 *  parked far enough away that it never triggers the engagement hold. */
const far = (): NpcOccupant => player(ALICE, "alice", 99, 99);

/** A room whose `requestMove` lands instantly, so the occupant snapshot the next tick reads is
 *  the one the NPC asked for. `open` stands in for the static reachability mask; the occupancy
 *  half of `roamOk` is modelled too, because Room's version refuses a tile someone is on. */
function fakeRoom(occ: NpcOccupant[], open: (x: number, y: number) => boolean = () => true) {
  const moves: Array<{ from: Tile; to: Tile }> = [];
  const walking = new Set<number>();
  return {
    chatConfig: { speakRadius: 6 },
    occupants: vi.fn((): readonly NpcOccupant[] => occ),
    occupantCount: vi.fn(() => occ.filter((o) => o.accountId > 0).length),
    requestMove: vi.fn((id: number, x: number, y: number) => {
      const o = occ.find((c) => c.accountId === id);
      if (!o) return;
      moves.push({ from: { x: o.x, y: o.y }, to: { x, y } });
      o.x = x;
      o.y = y;
    }),
    requestSit: vi.fn(),
    requestStand: vi.fn(),
    isWalking: vi.fn((id: number) => walking.has(id)),
    roamOk: vi.fn((x: number, y: number) => open(x, y) && !occ.some((o) => o.x === x && o.y === y)),
    face: vi.fn(),
    moves,
    walking,
  };
}

let services: NpcService[];
let random: ReturnType<typeof vi.spyOn> | null;

function service(roster: NpcDef[], rooms: Map<number, NpcRoom>) {
  const say = vi.fn();
  const svc = new NpcService({
    generate: null,
    say,
    roster,
    room: (roomId: number) => rooms.get(roomId) ?? null,
  });
  services.push(svc);
  return { svc, say };
}

/** A linear congruential generator standing in for Math.random: varied draws, same sequence on
 *  every run, so "it stayed in its rect over 200 cycles" is a fact and not a coin flip. */
function seedRandom(seed: number): void {
  let s = seed;
  random = vi.spyOn(Math, "random").mockImplementation(() => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  });
}

const cheb = (a: Tile, b: Tile): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

beforeEach(() => {
  vi.useFakeTimers(); // BEFORE constructing the service — the tick starts in the constructor
  vi.setSystemTime(new Date("2026-08-10T12:00:00Z")); // the cold clocks all read 0; use a real one
  services = [];
  random = null;
});

afterEach(() => {
  for (const svc of services) svc.stop();
  random?.mockRestore();
  vi.useRealTimers();
});

describe("wandering: waypoint selection", () => {
  test("a tile the mask rejects is never asked for", () => {
    // The right half of the rect is a hedged pocket: walkable, empty, and with no route to it.
    const rex = npc(REX, { x: 4, y: 4 }, { home: { x0: 0, y0: 0, x1: 20, y1: 8 } });
    const room = fakeRoom([staff(rex), far()], (x) => x <= 10);
    const { svc } = service([rex], new Map([[1, room]]));
    seedRandom(7);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(CYCLE_MS * 60);

    expect(room.moves.length).toBeGreaterThan(10);
    for (const m of room.moves) expect(m.to.x).toBeLessThanOrEqual(10);
  });

  test("every waypoint is inside the home rect, and every drift is inside ROAM_MAX", () => {
    // A rect three times ROAM_MAX wide, so the distance cap is what bounds the walk, not the rect.
    const post = { x: 30, y: 5 };
    const home = { x0: 0, y0: 0, x1: 60, y1: 10 };
    const rex = npc(REX, post, { home });
    const room = fakeRoom([staff(rex), far()]);
    const { svc } = service([rex], new Map([[1, room]]));
    seedRandom(11);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(CYCLE_MS * 200);

    expect(room.moves.length).toBeGreaterThan(50);
    const drifts = room.moves.filter((m) => cheb(m.to, post) > 0);
    for (const m of room.moves) {
      expect(m.to.x).toBeGreaterThanOrEqual(home.x0);
      expect(m.to.x).toBeLessThanOrEqual(home.x1);
      expect(m.to.y).toBeGreaterThanOrEqual(home.y0);
      expect(m.to.y).toBeLessThanOrEqual(home.y1);
    }
    for (const m of drifts) expect(cheb(m.from, m.to)).toBeLessThanOrEqual(ROAM_MAX);

    // Not vacuous: this rect is wide enough that the NPC does get further from its post than the
    // cap, which is the case the walk home is exempt from.
    expect(room.moves.some((m) => cheb(m.from, post) > ROAM_MAX)).toBe(true);
  });

  test("one waypoint in three is the post, so an NPC that drifts comes back", () => {
    const rex = npc(REX, { x: 30, y: 5 }, { home: { x0: 0, y0: 0, x1: 60, y1: 10 } });
    const room = fakeRoom([staff(rex), far()]);
    const { svc } = service([rex], new Map([[1, room]]));
    seedRandom(3);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(CYCLE_MS * 200);

    const home = room.moves.filter((m) => m.to.x === 30 && m.to.y === 5);
    expect(home.length).toBeGreaterThan(10);
  });
});

describe("wandering: who roams", () => {
  test("no home rect, no roaming — however long the room stays busy", () => {
    const rex = npc(REX, { x: 4, y: 4 });
    const room = fakeRoom([staff(rex), player(ALICE, "alice", 30, 30)]);
    const { svc } = service([rex], new Map([[1, room]]));
    seedRandom(5);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(CYCLE_MS * 100);

    expect(room.requestMove).not.toHaveBeenCalled();
  });

  test("a performer with a home rect stays on its stage", () => {
    const act = npc(REX, { x: 4, y: 4 }, { performs: true, home: { x0: 0, y0: 0, x1: 8, y1: 8 } });
    const room = fakeRoom([staff(act), player(ALICE, "alice", 30, 30)]);
    const { svc, say } = service([act], new Map([[1, room]]));
    seedRandom(5);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(CYCLE_MS * 100);

    expect(room.requestMove).not.toHaveBeenCalled();
    expect(say).toHaveBeenCalled(); // it is still working, just not walking
  });

  test("the shipped roster is unchanged: Pierre, Maya and Lola never take a step", () => {
    expect(NPC_ROSTER.filter((n) => n.home !== undefined)).toEqual([]);

    const occ = NPC_ROSTER.map(staff);
    const rooms = new Map<number, NpcRoom>();
    const seen: ReturnType<typeof fakeRoom>[] = [];
    for (const roomId of new Set(NPC_ROSTER.map((n) => n.roomId))) {
      const r = fakeRoom([...occ, player(ALICE, "alice", 30, 30)]);
      rooms.set(roomId, r);
      seen.push(r);
    }
    const { svc } = service(NPC_ROSTER, rooms);
    seedRandom(13);

    for (const roomId of rooms.keys()) svc.onPlayerJoin(roomId, "alice");
    vi.advanceTimersByTime(CYCLE_MS * 100);

    for (const r of seen) expect(r.requestMove).not.toHaveBeenCalled();
  });
});

describe("wandering: the path budget", () => {
  test("three NPCs due on one tick issue two paths, and the third goes next tick", () => {
    // Separate rects so the pinned draw gives each a distinct tile — one NPC standing on
    // another's target would fail `roamOk` and muddy what the budget is being credited for.
    const npcs = [
      npc(-1, { x: 0, y: 0 }, { home: { x0: 0, y0: 0, x1: 2, y1: 2 } }),
      npc(-2, { x: 10, y: 0 }, { home: { x0: 10, y0: 0, x1: 12, y1: 2 } }),
      npc(-3, { x: 20, y: 0 }, { home: { x0: 20, y0: 0, x1: 22, y1: 2 } }),
    ];
    const room = fakeRoom([...npcs.map(staff), far()]);
    const { svc } = service(npcs, new Map([[1, room]]));
    random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(CYCLE_MS);
    expect(room.moves.map((m) => m.to)).toEqual([
      { x: 1, y: 1 },
      { x: 11, y: 1 },
    ]);

    // Deferred, not dropped: the third NPC's clock was never advanced, so it fires immediately.
    vi.advanceTimersByTime(TICK_MS);
    expect(room.moves.map((m) => m.to)).toEqual([
      { x: 1, y: 1 },
      { x: 11, y: 1 },
      { x: 21, y: 1 },
    ]);
  });
});

describe("wandering: engagement and lifecycle", () => {
  test("a player standing nearby holds the NPC at its post until the hold lapses", () => {
    const rex = npc(REX, { x: 0, y: 0 }, { home: { x0: 0, y0: 0, x1: 8, y1: 8 } });
    const alice = player(ALICE, "alice", 2, 1);
    const room = fakeRoom([staff(rex), alice]);
    const { svc } = service([rex], new Map([[1, room]]));
    random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(CYCLE_MS * 3);
    expect(room.requestMove).not.toHaveBeenCalled();

    // She walks off. The hold is a timer, not a mode: it lapses on its own.
    alice.x = 40;
    alice.y = 40;
    vi.advanceTimersByTime(ENGAGE_HOLD_MS + TICK_MS);
    expect(room.moves.map((m) => m.to)).toEqual([{ x: 4, y: 4 }]);
  });

  test("a re-activated room sends staff who drifted back to their posts", () => {
    const rex = npc(REX, { x: 4, y: 4 }, { home: { x0: 0, y0: 0, x1: 8, y1: 8 } });
    const wandered = staff(rex);
    wandered.x = 7;
    wandered.y = 8;
    const room = fakeRoom([wandered]);
    const { svc } = service([rex], new Map([[1, room]]));
    random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    svc.onPlayerJoin(1, "alice");
    expect(room.moves).toEqual([{ from: { x: 7, y: 8 }, to: { x: 4, y: 4 } }]);

    // A second player joining a room that is already busy is not a re-activation.
    svc.onPlayerJoin(1, "bob");
    expect(room.moves).toHaveLength(1);
  });

  test("an NPC already at its post is not sent anywhere on re-activation", () => {
    const rex = npc(REX, { x: 4, y: 4 }, { home: { x0: 0, y0: 0, x1: 8, y1: 8 } });
    const room = fakeRoom([staff(rex)]);
    const { svc } = service([rex], new Map([[1, room]]));
    random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    svc.onPlayerJoin(1, "alice");
    expect(room.requestMove).not.toHaveBeenCalled();
  });

  test("an emptied room's movement clock dies with it and restarts on the next join", () => {
    const rex = npc(REX, { x: 0, y: 0 }, { home: { x0: 0, y0: 0, x1: 8, y1: 8 } });
    const room = fakeRoom([staff(rex), far()]);
    const { svc } = service([rex], new Map([[1, room]]));
    random = vi.spyOn(Math, "random").mockReturnValue(0.5);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(CYCLE_MS - TICK_MS); // one tick short of the first waypoint
    svc.onRoomEmpty(1);

    vi.advanceTimersByTime(CYCLE_MS * 5);
    expect(room.requestMove).not.toHaveBeenCalled();

    // The interrupted clock is gone: the new player gets a settled room, not an NPC that walks
    // off the instant they arrive.
    svc.onPlayerJoin(1, "bob");
    vi.advanceTimersByTime(CYCLE_MS - TICK_MS);
    expect(room.requestMove).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TICK_MS);
    expect(room.moves.map((m) => m.to)).toEqual([{ x: 4, y: 4 }]);
  });
});

describe("roamOk: the static mask", () => {
  let dir: string;
  let db: Database.Database;
  let room: Room;
  let emitted: Array<[number, ServerMsg]>;

  const account = (username: string): number => {
    const info = db
      .prepare(
        `INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at)
         VALUES (?, ?, x'00', x'00', 'test', 0)`,
      )
      .run(username, username.toLowerCase());
    const id = Number(info.lastInsertRowid);
    grantStarter(db, id);
    return id;
  };

  const itemOf = (accountId: number, defId: string): number => {
    const row = db
      .prepare("SELECT id FROM furni_items WHERE owner_id = ? AND def_id = ?")
      .get(accountId, defId) as { id: number };
    return row.id;
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grand-wander-"));
    db = openDb(join(dir, "test.db"));
    db.prepare("DELETE FROM furni_items WHERE room_id IN (1, 2)").run();
    emitted = [];
    const emit: Emit = (id, msg) => emitted.push([id, msg]);
    room = new Room(db, 1, emit);
  });

  afterEach(() => {
    room.dispose();
    closeDb(db);
    rmSync(dir, { recursive: true, force: true });
  });

  test("an open tile is fine; off the grid never is", () => {
    expect(room.roamOk(5, 5)).toBe(true);
    expect(room.roamOk(-1, 5)).toBe(false);
    expect(room.roamOk(5, -1)).toBe(false);
    expect(room.roamOk(room.model.width, 5)).toBe(false);
    expect(room.roamOk(5, room.model.height)).toBe(false);
  });

  test("a tile someone is standing on is refused", () => {
    const a = account("alice");
    room.join(a, "alice");
    const spot = room.occupants()[0];
    expect(spot).toBeDefined();
    expect(room.roamOk(spot!.x, spot!.y)).toBe(false);
  });

  test("a walkable tile with no route to it is refused, and the mask follows the furni", () => {
    const b = account("bob");
    const c = account("carol");
    // The room's corner, sealed off by three items — walkable, empty, and unreachable. This is
    // exactly the tile that would make findPath drain its whole open set to prove there is no way in.
    expect(room.roamOk(0, 0)).toBe(true);
    room.place(b, itemOf(b, "chair_basic"), 1, 0, 0);
    room.place(b, itemOf(b, "plant_basic"), 0, 1, 0);
    room.place(c, itemOf(c, "chair_basic"), 1, 1, 0);
    expect(room.roamOk(0, 0)).toBe(false);
    expect(room.roamOk(1, 0)).toBe(false); // the furni itself

    room.pickup(b, itemOf(b, "plant_basic"));
    expect(room.roamOk(0, 0)).toBe(true);  // the mask was dropped when the furni moved
  });
});

describe("an NPC crossing a player's path", () => {
  let dir: string;
  let db: Database.Database;
  let room: Room;

  const account = (username: string): number => {
    const info = db
      .prepare(
        `INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at)
         VALUES (?, ?, x'00', x'00', 'test', 0)`,
      )
      .run(username, username.toLowerCase());
    return Number(info.lastInsertRowid);
  };

  const at = (accountId: number): Tile => {
    const o = room.occupants().find((c) => c.accountId === accountId);
    if (!o) throw new Error(`no occupant ${accountId}`);
    return { x: o.x, y: o.y };
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grand-cross-"));
    db = openDb(join(dir, "test.db"));
    db.prepare("DELETE FROM furni_items WHERE room_id IN (1, 2)").run();
    room = new Room(db, 1, () => {});
  });

  afterEach(() => {
    room.dispose();
    closeDb(db);
    rmSync(dir, { recursive: true, force: true });
  });

  test("a player whose route a wandering NPC parks on still arrives", () => {
    const a = account("alice");
    room.join(a, "alice");
    expect(at(a)).toEqual({ x: 0, y: 5 });   // the door: the walk below runs the length of row 5
    room.addNpc({ id: REX, name: "Rex", post: { x: 5, y: 3 }, dir: 2 });

    room.requestMove(a, 9, 5);               // computed with row 5 clear
    vi.advanceTimersByTime(MS_PER_TILE * 2); // alice reaches (2,5)

    room.requestMove(REX, 5, 5);             // the NPC wanders down into her row and stops there
    vi.advanceTimersByTime(MS_PER_TILE * 2);
    expect(at(REX)).toEqual({ x: 5, y: 5 });
    expect(room.isWalking(REX)).toBe(false);

    vi.advanceTimersByTime(MS_PER_TILE * 12); // alice hits the block, re-routes, keeps going
    expect(at(a)).toEqual({ x: 9, y: 5 });
    expect(room.isWalking(a)).toBe(false);
  });
});
