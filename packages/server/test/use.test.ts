import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ServerMsgSchema } from "@grand/shared";
import type { ServerMsg } from "@grand/shared";
import type Database from "better-sqlite3";
import { openDb, closeDb } from "../src/db.ts";
import { DRINK_COST, DRINK_ITEM, DRINK_MS, MS_PER_TILE, Room } from "../src/room.ts";
import type { Emit } from "../src/room.ts";

// The "use" verb (#326): three hand-written behaviours behind one message. What each one claims —
// a Star leaves, a state survives a reload, a wash costs nothing — is checked rather than assumed.

let dir: string;
let db: Database.Database;
let room: Room;
let emitted: Array<[number, ServerMsg]>;
let emit: Emit;

beforeEach(() => {
  vi.useFakeTimers(); // BEFORE constructing the Room
  dir = mkdtempSync(join(tmpdir(), "grand-use-"));
  db = openDb(join(dir, "test.db"));
  db.prepare("DELETE FROM furni_items WHERE room_id IN (1, 2)").run();
  emitted = [];
  emit = (id, msg) => {
    ServerMsgSchema.parse(msg); // pins outbound conformance
    emitted.push([id, msg]);
  };
  room = new Room(db, 1, emit);
});

afterEach(() => {
  room.dispose();
  closeDb(db);
  rmSync(dir, { recursive: true, force: true });
  vi.useRealTimers();
});

type Of<T extends ServerMsg["t"]> = Extract<ServerMsg, { t: T }>;

function to<T extends ServerMsg["t"]>(id: number, t: T): Of<T>[] {
  return emitted
    .filter((e): e is [number, Of<T>] => e[0] === id && e[1].t === t)
    .map(([, msg]) => msg);
}

function account(username: string): number {
  const info = db
    .prepare(
      `INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at)
       VALUES (?, ?, x'00', x'00', 'test', 0)`,
    )
    .run(username, username.toLowerCase());
  return Number(info.lastInsertRowid);
}

function fund(accountId: number, amount: number): void {
  db.prepare(
    `INSERT INTO star_balances (account_id, balance) VALUES (?, ?)
     ON CONFLICT(account_id) DO UPDATE SET balance = balance + excluded.balance`,
  ).run(accountId, amount);
}

function balance(accountId: number): number {
  const row = db.prepare("SELECT balance FROM star_balances WHERE account_id = ?").get(accountId) as
    | { balance: number }
    | undefined;
  return row?.balance ?? 0;
}

function vendEntries(accountId: number): number {
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE op = 'vend' AND account_id = ?")
    .get(accountId) as { n: number };
  return row.n;
}

function stateOf(itemId: number): number {
  const row = db.prepare("SELECT state FROM furni_items WHERE id = ?").get(itemId) as
    { state: number };
  return row.state;
}

function handOf(accountId: number): { item: string; until: number } | undefined {
  return room.occupants().find((o) => o.accountId === accountId)?.hand;
}

/** Puts a fresh item of `defId` into `accountId`'s inventory, then into the room. */
function install(accountId: number, defId: string, x: number, y: number): number {
  const itemId = Number(
    db
      .prepare("INSERT INTO furni_items (def_id, owner_id, room_id, state) VALUES (?, ?, NULL, 0)")
      .run(defId, accountId).lastInsertRowid,
  );
  expect(room.place(accountId, itemId, x, y, 0), `${defId} at ${x},${y}`).toBe(true);
  return itemId;
}

function stand(accountId: number, x: number, y: number): void {
  room.requestMove(accountId, x, y);
  vi.advanceTimersByTime(MS_PER_TILE * 40);
  const at = room.occupants().find((o) => o.accountId === accountId);
  expect(at).toMatchObject({ x, y });
}

/** Alice at the door, a bar counter two tiles north of her — out of reach until she walks up. */
function atTheBar(): { alice: number; counter: number } {
  const alice = account("alice");
  room.join(alice, "alice");
  const counter = install(alice, "bar_counter", 0, 3);
  return { alice, counter };
}

describe("use: the bar", () => {
  test("a drink costs exactly one Star and shows in the buyer's hand", () => {
    const { alice, counter } = atTheBar();
    fund(alice, 10);
    stand(alice, 0, 4);
    room.useFurni(alice, counter);

    expect(balance(alice)).toBe(10 - DRINK_COST);
    expect(vendEntries(alice)).toBe(1);
    expect(handOf(alice)).toMatchObject({ item: DRINK_ITEM });
    expect(to(alice, "handitem")).toEqual([
      { t: "handitem", accountId: alice, item: DRINK_ITEM, until: Date.now() + DRINK_MS },
    ]);
    expect(to(alice, "stars").at(-1)).toMatchObject({ delta: -DRINK_COST, balance: 9 });
  });

  test("the drink runs out on its own and the room is told", () => {
    const { alice, counter } = atTheBar();
    fund(alice, 10);
    stand(alice, 0, 4);
    room.useFurni(alice, counter);

    vi.advanceTimersByTime(DRINK_MS - 1);
    expect(handOf(alice)).toBeDefined();
    vi.advanceTimersByTime(1);
    expect(handOf(alice)).toBeUndefined();
    expect(to(alice, "handitem").at(-1)).toEqual({ t: "handitem", accountId: alice, item: null });
  });

  test("a second drink while still holding one is refused and charges nothing", () => {
    const { alice, counter } = atTheBar();
    fund(alice, 10);
    stand(alice, 0, 4);
    room.useFurni(alice, counter);
    // Past the per-occupant cooldown, so this is refused for the hand and not for the rate limit.
    vi.advanceTimersByTime(1000);
    room.useFurni(alice, counter);

    expect(balance(alice)).toBe(9);
    expect(vendEntries(alice)).toBe(1);
    expect(to(alice, "notice").at(-1)?.text).toMatch(/already holding/);
  });

  test("a player with no Stars gets an error and no drink", () => {
    const { alice, counter } = atTheBar();
    stand(alice, 0, 4);
    room.useFurni(alice, counter);

    expect(handOf(alice)).toBeUndefined();
    expect(vendEntries(alice)).toBe(0);
    expect(to(alice, "error").at(-1)).toMatchObject({ code: "purchase" });
    expect(to(alice, "handitem")).toEqual([]);
  });

  test("using it from across the room is refused", () => {
    const { alice, counter } = atTheBar();
    fund(alice, 10);
    room.useFurni(alice, counter);   // alice is still at the door, two tiles away

    expect(to(alice, "error").at(-1)).toMatchObject({ code: "bad_position" });
    expect(balance(alice)).toBe(10);
    expect(handOf(alice)).toBeUndefined();
  });

  // A 2x1 counter is one item over two tiles, and both ends have to serve — reach is measured
  // from the footprint, not from the item's origin.
  test("either end of the counter is close enough", () => {
    const { alice, counter } = atTheBar();
    fund(alice, 10);
    stand(alice, 2, 4);              // diagonal from (1,3), the counter's far tile
    room.useFurni(alice, counter);

    expect(handOf(alice)).toMatchObject({ item: DRINK_ITEM });
  });

  test("the drink is dropped when the buyer leaves and never fires afterwards", () => {
    const { alice, counter } = atTheBar();
    fund(alice, 10);
    stand(alice, 0, 4);
    room.useFurni(alice, counter);
    room.leave(alice);

    const before = emitted.length;
    vi.advanceTimersByTime(DRINK_MS * 2);
    expect(emitted.length).toBe(before);
  });
});

describe("use: the light switch", () => {
  test("a toggle flips the state, persists it, and tells the room", () => {
    const alice = account("alice");
    room.join(alice, "alice");
    const lamp = install(alice, "lamp_basic", 0, 4);

    room.useFurni(alice, lamp);
    expect(stateOf(lamp)).toBe(1);
    expect(to(alice, "furni_state").at(-1)).toEqual({ t: "furni_state", itemId: lamp, state: 1 });

    vi.advanceTimersByTime(1000);
    room.useFurni(alice, lamp);
    expect(stateOf(lamp)).toBe(0);
    expect(to(alice, "furni_state").at(-1)).toEqual({ t: "furni_state", itemId: lamp, state: 0 });
  });

  // The lamp is alice's, but the switch is not: a room where only the owner can turn the lights
  // on is a room nobody else can use.
  test("anyone in the room may work the switch, and a reload keeps it on", () => {
    const alice = account("alice");
    const bob = account("bob");
    room.join(alice, "alice");
    const lamp = install(alice, "lamp_basic", 0, 4);   // before bob, who would spawn on the tile
    room.join(bob, "bob");
    stand(bob, 1, 4);

    room.useFurni(bob, lamp);
    expect(stateOf(lamp)).toBe(1);

    const reloaded = new Room(db, 1, emit);
    reloaded.join(alice, "alice");
    expect(to(alice, "room_state").at(-1)?.furni.find((f) => f.id === lamp)?.state).toBe(1);
    reloaded.dispose();
  });
});

describe("use: the fountain", () => {
  test("washing is broadcast to the room and costs nothing", () => {
    const alice = account("alice");
    const bob = account("bob");
    room.join(alice, "alice");
    room.join(bob, "bob");
    const fountain = install(alice, "fountain", 2, 2);
    stand(alice, 1, 3);

    room.useFurni(alice, fountain);
    const washed = { t: "action", accountId: alice, action: "wash" };
    expect(to(alice, "action").at(-1)).toEqual(washed);
    expect(to(bob, "action").at(-1)).toEqual(washed);
    expect(
      db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE account_id = ?").get(alice),
    ).toEqual({ n: 0 });
  });
});

describe("use: guards", () => {
  test("a second use inside the cooldown is dropped", () => {
    const alice = account("alice");
    room.join(alice, "alice");
    const lamp = install(alice, "lamp_basic", 0, 4);

    room.useFurni(alice, lamp);
    vi.advanceTimersByTime(100);
    room.useFurni(alice, lamp);
    expect(stateOf(lamp)).toBe(1);
    expect(to(alice, "furni_state")).toHaveLength(1);
  });

  test("furni with no interaction ignores the verb", () => {
    const alice = account("alice");
    room.join(alice, "alice");
    const chair = install(alice, "chair_basic", 0, 4);

    room.useFurni(alice, chair);
    room.useFurni(alice, 999_999);
    expect(to(alice, "furni_state")).toEqual([]);
    expect(to(alice, "error")).toEqual([]);
  });
});
