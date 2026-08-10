import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { PROTOTYPE_CATALOG, ServerMsgSchema } from "@grand/shared";
import type { ServerMsg } from "@grand/shared";
import type Database from "better-sqlite3";
import { openDb, closeDb } from "../src/db.ts";
import { FORTUNES, HAND_MS, MS_PER_TILE, Room } from "../src/room.ts";
import type { Emit } from "../src/room.ts";

// The "use" verb (#326, #347): five behaviours behind one message, four of them parameterised by
// the def rather than written out per item. What each one claims — the def's own price leaves, a
// state survives a reload, a wash and a book cost nothing — is checked rather than assumed.

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

/** The Stars every row of one op took off this account — the sink's own record of itself. */
function entries(op: string, accountId: number): number[] {
  return (
    db
      .prepare("SELECT stars FROM ledger_entries WHERE op = ? AND account_id = ? ORDER BY id")
      .all(op, accountId) as Array<{ stars: number }>
  ).map((r) => r.stars);
}

function allEntries(accountId: number): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM ledger_entries WHERE account_id = ?").get(accountId) as
      { n: number }
  ).n;
}

/** What a counter hands over and charges, read off the def exactly as the room reads it — so a
 *  price moved in the catalog moves these tests with it rather than breaking them. */
function vendOf(defId: string): { item: string; price: number } {
  const vend = PROTOTYPE_CATALOG.find((d) => d.id === defId)?.vend;
  if (!vend) throw new Error(`${defId} vends nothing`);
  return vend;
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

const COCKTAIL = vendOf("bar_counter");

describe("use: the bar", () => {
  test("a cocktail costs the two Stars its def names and shows in the buyer's hand", () => {
    const { alice, counter } = atTheBar();
    fund(alice, 10);
    stand(alice, 0, 4);
    room.useFurni(alice, counter);

    expect(COCKTAIL).toEqual({ item: "drink_cocktail", price: 2 });
    expect(balance(alice)).toBe(8);
    expect(entries("vend", alice)).toEqual([-2]);
    expect(handOf(alice)).toMatchObject({ item: "drink_cocktail" });
    expect(to(alice, "handitem")).toEqual([
      { t: "handitem", accountId: alice, item: "drink_cocktail", until: Date.now() + HAND_MS },
    ]);
    expect(to(alice, "stars").at(-1)).toMatchObject({ delta: -2, balance: 8, reason: "cocktail" });
    expect(to(alice, "notice").at(-1)?.text).toMatch(/−2 Stars\.$/);
  });

  test("the drink runs out on its own and the room is told", () => {
    const { alice, counter } = atTheBar();
    fund(alice, 10);
    stand(alice, 0, 4);
    room.useFurni(alice, counter);

    vi.advanceTimersByTime(HAND_MS - 1);
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

    expect(balance(alice)).toBe(8);
    expect(entries("vend", alice)).toEqual([-2]);
    expect(to(alice, "notice").at(-1)?.text).toMatch(/already holding/);
  });

  test("a player who cannot cover the def's price gets an error and no drink", () => {
    const { alice, counter } = atTheBar();
    fund(alice, COCKTAIL.price - 1);   // enough for a coffee, not for a cocktail
    stand(alice, 0, 4);
    room.useFurni(alice, counter);

    expect(handOf(alice)).toBeUndefined();
    expect(entries("vend", alice)).toEqual([]);
    expect(balance(alice)).toBe(1);
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

    expect(handOf(alice)).toMatchObject({ item: COCKTAIL.item });
  });

  test("the drink is dropped when the buyer leaves and never fires afterwards", () => {
    const { alice, counter } = atTheBar();
    fund(alice, 10);
    stand(alice, 0, 4);
    room.useFurni(alice, counter);
    room.leave(alice);

    const before = emitted.length;
    vi.advanceTimersByTime(HAND_MS * 2);
    expect(emitted.length).toBe(before);
  });
});

// One rail, four counters (#347). The def is the whole difference between them, so what is checked
// here is that the def is what the room actually read — the item in the hand and the Stars taken.
describe("use: the other counters", () => {
  /** Alice standing at (0,4), in reach of a counter of `defId` laid along (0,3). */
  function atACounter(defId: string, stars: number): { alice: number; counter: number } {
    const alice = account("alice");
    room.join(alice, "alice");
    const counter = install(alice, defId, 0, 3);
    fund(alice, stars);
    stand(alice, 0, 4);
    return { alice, counter };
  }

  test("the café counter pours a coffee for the one Star its def names", () => {
    const { alice, counter } = atACounter("cafe_counter", 10);
    room.useFurni(alice, counter);

    expect(vendOf("cafe_counter")).toEqual({ item: "drink_coffee", price: 1 });
    expect(balance(alice)).toBe(9);
    expect(entries("vend", alice)).toEqual([-1]);
    expect(handOf(alice)).toMatchObject({ item: "drink_coffee" });
    expect(to(alice, "handitem").at(-1)).toMatchObject({ item: "drink_coffee" });
    expect(to(alice, "stars").at(-1)).toMatchObject({ delta: -1, reason: "coffee" });
    expect(to(alice, "notice").at(-1)?.text).toMatch(/−1 Star\.$/);
  });

  // The hand item id is not a constant any more: whatever the def names is what the room hands
  // over and what everyone else is told to draw.
  test("the vending machine hands over the cola its def names", () => {
    const { alice, counter } = atACounter("vending_machine", 10);
    room.useFurni(alice, counter);

    expect(handOf(alice)).toMatchObject({ item: vendOf("vending_machine").item });
    expect(to(alice, "handitem").at(-1)).toMatchObject({ item: "drink_cola" });
    expect(balance(alice)).toBe(9);
  });

  test("a book off the shelf is free: a hand item, no ledger row, no Stars message", () => {
    const { alice, counter } = atACounter("shelf_basic", 0);
    room.useFurni(alice, counter);

    expect(vendOf("shelf_basic").price).toBe(0);
    expect(handOf(alice)).toMatchObject({ item: "book" });
    expect(to(alice, "handitem").at(-1)).toMatchObject({ item: "book", until: Date.now() + HAND_MS });
    expect(to(alice, "stars")).toEqual([]);
    expect(allEntries(alice)).toBe(0);
    expect(balance(alice)).toBe(0);
    expect(to(alice, "notice").at(-1)?.text).not.toMatch(/Star/);
  });

  // A def naming a hand item the room has no line for would vend in silence — nothing said, and a
  // Stars row labelled "vend" rather than what was bought. Every vending def in the catalog is
  // walked here, not only the four the tests above name by hand.
  test("every vending def in the catalog has a line and a reason of its own", () => {
    const alice = account("alice");
    room.join(alice, "alice");
    fund(alice, 100);

    let x = 0;
    let said = 0;
    for (const def of PROTOTYPE_CATALOG) {
      const vend = def.vend;
      if (!vend) continue;
      const counter = install(alice, def.id, x, 3);
      stand(alice, x, 4);
      room.useFurni(alice, counter);

      said++;
      expect(to(alice, "notice"), def.id).toHaveLength(said);
      expect(handOf(alice), def.id).toMatchObject({ item: vend.item });
      if (vend.price > 0) expect(to(alice, "stars").at(-1)?.reason, def.id).not.toBe("vend");
      vi.advanceTimersByTime(HAND_MS);   // the hand empties and the cooldown lapses
      x += 3;
    }
    expect(said).toBeGreaterThan(1);
  });

  test("a book runs out on the same clock a drink does", () => {
    const { alice, counter } = atACounter("shelf_basic", 0);
    room.useFurni(alice, counter);

    vi.advanceTimersByTime(HAND_MS);
    expect(handOf(alice)).toBeUndefined();
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

  // The hearth and the stereo joined the rail in #331. The hearth is the first 2-wide toggle —
  // reach over a footprint and a state flip are each covered alone (the counter, the lamp), so what
  // this adds is the pair: alice stands beside the far tile only, out of range of the origin tile.
  test("a two-tile hearth lights from either end of it", () => {
    const alice = account("alice");
    room.join(alice, "alice");
    const hearth = install(alice, "fireplace", 0, 3);   // covers (0,3) and (1,3)
    stand(alice, 2, 4);

    room.useFurni(alice, hearth);
    expect(stateOf(hearth)).toBe(1);
    expect(to(alice, "furni_state").at(-1)).toEqual({ t: "furni_state", itemId: hearth, state: 1 });
  });

  test("the stereo switches on and off like the lamp", () => {
    const alice = account("alice");
    room.join(alice, "alice");
    const stereo = install(alice, "stereo_basic", 0, 4);

    room.useFurni(alice, stereo);
    expect(stateOf(stereo)).toBe(1);

    vi.advanceTimersByTime(1000);
    room.useFurni(alice, stereo);
    expect(stateOf(stereo)).toBe(0);
  });
});

describe("use: the wash basin", () => {
  test("washing is broadcast to the room and costs nothing", () => {
    const alice = account("alice");
    const bob = account("bob");
    room.join(alice, "alice");
    room.join(bob, "bob");
    const basin = install(alice, "sink_basic", 2, 2);
    stand(alice, 1, 3);

    room.useFurni(alice, basin);
    const washed = { t: "action", accountId: alice, action: "wash" };
    expect(to(alice, "action").at(-1)).toEqual(washed);
    expect(to(bob, "action").at(-1)).toEqual(washed);
    expect(allEntries(alice)).toBe(0);
    expect(handOf(alice)).toBeUndefined();
  });
});

// The fountain stopped being a tap and became a sink (#347): a Star goes in, a fortune comes back,
// and nothing else does.
describe("use: the fountain", () => {
  /** Alice and Bob in the room, a fountain at (2,2), Alice in reach of it at (1,3). */
  function atTheFountain(stars: number): { alice: number; bob: number; fountain: number } {
    const alice = account("alice");
    const bob = account("bob");
    room.join(alice, "alice");
    room.join(bob, "bob");
    const fountain = install(alice, "fountain", 2, 2);
    fund(alice, stars);
    stand(alice, 1, 3);
    return { alice, bob, fountain };
  }

  test("a wish spends one Star, splashes the fountain and tells only the wisher", () => {
    const { alice, bob, fountain } = atTheFountain(3);
    room.useFurni(alice, fountain);

    const wished = { t: "action", accountId: alice, action: "wish", itemId: fountain };
    expect(to(alice, "action").at(-1)).toEqual(wished);
    expect(to(bob, "action").at(-1)).toEqual(wished);
    expect(balance(alice)).toBe(2);
    expect(entries("wish", alice)).toEqual([-1]);
    expect(to(alice, "stars").at(-1)).toMatchObject({ delta: -1, balance: 2, reason: "wish" });
    // The fortune is the wisher's alone, and nothing is left in the hand to carry away.
    expect(FORTUNES).toContain(to(alice, "notice").at(-1)?.text);
    expect(to(bob, "notice")).toEqual([]);
    expect(handOf(alice)).toBeUndefined();
  });

  test("the fountain no longer washes — nobody scrubs in it", () => {
    const { alice, fountain } = atTheFountain(3);
    room.useFurni(alice, fountain);

    expect(to(alice, "action").map((a) => a.action)).toEqual(["wish"]);
  });

  test("a wish with an empty balance is refused, and splashes nothing", () => {
    const { alice, bob, fountain } = atTheFountain(0);
    room.useFurni(alice, fountain);

    expect(to(alice, "error").at(-1)).toMatchObject({ code: "purchase" });
    expect(to(alice, "action")).toEqual([]);
    expect(to(bob, "action")).toEqual([]);
    expect(to(alice, "notice")).toEqual([]);
    expect(allEntries(alice)).toBe(0);
    expect(balance(alice)).toBe(0);
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
