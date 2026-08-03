import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ServerMsgSchema } from "@grand/shared";
import type { ServerMsg } from "@grand/shared";
import type Database from "better-sqlite3";
import { openDb, closeDb } from "../src/db.ts";
import { grantStarter } from "../src/items.ts";
import { Room, MS_PER_TILE } from "../src/room.ts";
import type { Emit } from "../src/room.ts";

let dir: string;
let db: Database.Database;
let room: Room;
let emitted: Array<[number, ServerMsg]>;
let emit: Emit;

beforeEach(() => {
  vi.useFakeTimers(); // BEFORE constructing the Room
  dir = mkdtempSync(join(tmpdir(), "grand-room-"));
  db = openDb(join(dir, "test.db"));
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

/** Every message of type `t` sent to `id`, in emission order. */
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
  const id = Number(info.lastInsertRowid);
  grantStarter(db, id);
  return id;
}

function itemOf(accountId: number, defId: string): number {
  const row = db
    .prepare("SELECT id FROM furni_items WHERE owner_id = ? AND def_id = ?")
    .get(accountId, defId) as { id: number };
  return row.id;
}

function at(accountId: number): { x: number; y: number; z: number } {
  const o = room.occupants().find((c) => c.accountId === accountId);
  if (!o) throw new Error(`no occupant ${accountId}`);
  return { x: o.x, y: o.y, z: o.z };
}

function stand(accountId: number, x: number, y: number): void {
  room.requestMove(accountId, x, y);
  vi.advanceTimersByTime(MS_PER_TILE * 40);
  expect(at(accountId)).toMatchObject({ x, y });
}

describe("room: join and presence", () => {
  test("join emits room_state with identity, inventory, and the room's chat config", () => {
    const a = account("alice");
    room.join(a, "alice");

    const [state] = to(a, "room_state");
    expect(state?.you).toBe(a);
    expect(state?.roomId).toBe(1);
    expect(state?.name).toBe("The Lobby Café");
    expect(state?.chat).toEqual({ speakRadius: 5, shoutAllowed: false });
    expect(state?.door).toEqual({ x: 0, y: 5, dir: 2 });
    expect(state?.inventory).toHaveLength(5);
    expect(state?.furni).toEqual([]);
    expect(state?.avatars).toEqual([
      { id: a, username: "alice", x: 0, y: 5, z: 0, dir: 2, posture: "stand" },
    ]);
  });

  test("a second joiner spawns on a free tile and is announced to the first", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");

    expect(to(a, "avatar_join").map((m) => m.avatar.id)).toEqual([b]);
    expect(to(b, "avatar_join")).toHaveLength(0);
    expect(at(a)).toMatchObject({ x: 0, y: 5 });
    expect(at(b)).toMatchObject({ x: 0, y: 4 });
    expect(room.occupantCount()).toBe(2);
  });

  test("a late joiner receives the remaining path of every walker", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.requestMove(a, 5, 5);
    vi.advanceTimersByTime(1000); // alice reaches (2,5)
    emitted.length = 0;

    room.join(b, "bob");
    const [walk] = to(b, "walk");
    expect(walk?.id).toBe(a);
    expect(walk?.from).toEqual({ x: 2, y: 5, z: 0 });
    expect(walk?.path).toEqual([
      { x: 3, y: 5, z: 0 },
      { x: 4, y: 5, z: 0 },
      { x: 5, y: 5, z: 0 },
    ]);
  });
});

describe("room: movement", () => {
  test("a walk advances one tile per MS_PER_TILE and clears its timer on arrival", () => {
    const a = account("alice");
    room.join(a, "alice");
    room.requestMove(a, 4, 5);

    const [walk] = to(a, "walk");
    expect(walk?.msPerTile).toBe(MS_PER_TILE);
    expect(walk?.from).toEqual({ x: 0, y: 5, z: 0 });
    expect(walk?.path).toEqual([
      { x: 1, y: 5, z: 0 },
      { x: 2, y: 5, z: 0 },
      { x: 3, y: 5, z: 0 },
      { x: 4, y: 5, z: 0 },
    ]);

    vi.advanceTimersByTime(1500);
    expect(at(a)).toMatchObject({ x: 3, y: 5 });
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(MS_PER_TILE);
    expect(at(a)).toMatchObject({ x: 4, y: 5 });
    expect(vi.getTimerCount()).toBe(0);
  });

  test("a new move cancels at the current tile and re-paths from there", () => {
    const a = account("alice");
    room.join(a, "alice");
    room.requestMove(a, 9, 5);
    vi.advanceTimersByTime(1500); // alice reaches (3,5)
    emitted.length = 0;

    room.requestMove(a, 3, 9);
    const [walk] = to(a, "walk");
    expect(walk?.from).toEqual({ x: 3, y: 5, z: 0 });
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(MS_PER_TILE * 8);
    expect(at(a)).toMatchObject({ x: 3, y: 9 });
    expect(vi.getTimerCount()).toBe(0);
  });

  test("an unreachable target is no_path and changes nothing", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");
    emitted.length = 0;

    room.requestMove(a, 0, 4); // bob is standing there
    expect(to(a, "error").map((m) => m.code)).toEqual(["no_path"]);
    expect(to(a, "walk")).toHaveLength(0);
    expect(at(a)).toMatchObject({ x: 0, y: 5 });
  });

  test("leaving mid-walk clears the walk timer", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");
    room.requestMove(a, 9, 5);
    vi.advanceTimersByTime(MS_PER_TILE);

    room.leave(a);
    expect(vi.getTimerCount()).toBe(0);
    expect(() => vi.advanceTimersByTime(MS_PER_TILE * 20)).not.toThrow();
    expect(room.occupantCount()).toBe(1);
    expect(to(b, "avatar_leave").map((m) => m.id)).toEqual([a]);
  });

  test("dispose mid-walk clears every timer", () => {
    const a = account("alice");
    room.join(a, "alice");
    room.requestMove(a, 9, 5);
    expect(vi.getTimerCount()).toBe(1);

    room.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => vi.advanceTimersByTime(MS_PER_TILE * 20)).not.toThrow();
  });

  test("two walkers cannot reserve the same destination", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");
    room.requestMove(a, 5, 5);
    emitted.length = 0;

    room.requestMove(b, 5, 5);
    expect(to(b, "error").map((m) => m.code)).toEqual(["no_path"]);

    vi.advanceTimersByTime(MS_PER_TILE * 12);
    expect(at(a)).toMatchObject({ x: 5, y: 5 });
    expect([at(b).x, at(b).y]).not.toEqual([at(a).x, at(a).y]);
  });

  test("a walk stops at the previous tile when the next tile becomes blocked", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");
    room.requestMove(a, 9, 5);
    vi.advanceTimersByTime(1000); // alice reaches (2,5)

    room.place(b, itemOf(b, "chair_basic"), 5, 5, 0);
    vi.advanceTimersByTime(MS_PER_TILE * 10);

    expect(at(a)).toMatchObject({ x: 4, y: 5 });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("room: chat", () => {
  test("say reaches the speaker and fades beyond the speak radius", () => {
    const a = account("alice");
    const b = account("bob");
    const c = account("carol");
    room.join(a, "alice");
    room.join(b, "bob");
    room.join(c, "carol");
    stand(a, 0, 0);
    stand(b, 5, 5); // Chebyshev 5 — inside
    stand(c, 6, 6); // Chebyshev 6 — outside
    emitted.length = 0;

    room.chat(a, "say", "hello");
    expect(to(a, "chat")[0]).toEqual({ t: "chat", from: a, mode: "say", text: "hello", faded: false });
    expect(to(b, "chat")[0]).toMatchObject({ text: "hello", faded: false });
    expect(to(c, "chat")[0]).toMatchObject({ text: "…", faded: true });
  });

  test("say is filtered before it is faded", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");
    emitted.length = 0;

    room.chat(a, "say", "shiiit");
    expect(to(a, "chat")[0]).toMatchObject({ text: "blah", faded: false });
    expect(to(b, "chat")[0]).toMatchObject({ text: "blah", faded: false });
  });

  test("shouting is refused in the café", () => {
    const a = account("alice");
    room.join(a, "alice");
    emitted.length = 0;

    room.chat(a, "shout", "hello");
    expect(to(a, "error").map((m) => m.code)).toEqual(["bad_message"]);
    expect(to(a, "chat")).toHaveLength(0);
  });

  test("shouting in the casino reaches everyone, filtered", () => {
    const a = account("alice");
    const b = account("bob");
    const casino = new Room(db, 2, emit);
    try {
      casino.join(a, "alice");
      casino.join(b, "bob");
      emitted.length = 0;

      casino.chat(a, "shout", "shiiit");
      expect(to(a, "chat")[0]).toMatchObject({ mode: "shout", text: "blah", faded: false });
      expect(to(b, "chat")[0]).toMatchObject({ mode: "shout", text: "blah", faded: false });
    } finally {
      casino.dispose();
    }
  });

  test("whisper reaches the target and the sender only", () => {
    const a = account("alice");
    const b = account("bob");
    const c = account("carol");
    room.join(a, "alice");
    room.join(b, "bob");
    room.join(c, "carol");
    emitted.length = 0;

    room.whisper(a, "bob", "psst");
    expect(to(a, "chat")[0]).toMatchObject({ from: a, mode: "whisper", text: "psst", faded: false });
    expect(to(b, "chat")[0]).toMatchObject({ from: a, mode: "whisper", text: "psst" });
    expect(to(c, "chat")).toHaveLength(0);
  });

  test("whisper to someone outside the room is whisper_target", () => {
    const a = account("alice");
    room.join(a, "alice");
    emitted.length = 0;

    room.whisper(a, "nobody", "psst");
    expect(to(a, "error").map((m) => m.code)).toEqual(["whisper_target"]);
  });
});

describe("room: furni", () => {
  test("placing furni persists the row and broadcasts to the room", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");
    const table = itemOf(a, "table_basic");
    emitted.length = 0;

    room.place(a, table, 2, 2, 0);
    expect(
      db.prepare("SELECT room_id AS roomId, x, y, z, dir FROM furni_items WHERE id = ?").get(table),
    ).toEqual({ roomId: 1, x: 2, y: 2, z: 0, dir: 0 });
    expect(to(a, "furni_placed")[0]?.item).toEqual({
      id: table, defId: "table_basic", x: 2, y: 2, z: 0, dir: 0, state: 0,
    });
    expect(to(b, "furni_placed")).toHaveLength(1);
  });

  test("placing someone else's item is not_owner", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");
    emitted.length = 0;

    room.place(a, itemOf(b, "chair_basic"), 2, 2, 0);
    expect(to(a, "error").map((m) => m.code)).toEqual(["not_owner"]);
    expect(db.prepare("SELECT room_id AS roomId FROM furni_items WHERE id = ?").get(itemOf(b, "chair_basic")))
      .toEqual({ roomId: null });
  });

  test("placing on the door tile is bad_position", () => {
    const a = account("alice");
    room.join(a, "alice");
    emitted.length = 0;

    room.place(a, itemOf(a, "chair_basic"), 0, 5, 0);
    expect(to(a, "error").map((m) => m.code)).toEqual(["bad_position"]);
  });

  test("placing under an avatar is occupied", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob"); // bob spawns on (0,4)
    emitted.length = 0;

    room.place(a, itemOf(a, "chair_basic"), 0, 4, 0);
    expect(to(a, "error").map((m) => m.code)).toEqual(["occupied"]);
  });

  test("a chair on a chair is no_stack", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");
    room.place(a, itemOf(a, "chair_basic"), 2, 2, 0);
    emitted.length = 0;

    room.place(b, itemOf(b, "chair_basic"), 2, 2, 0);
    expect(to(b, "error").map((m) => m.code)).toEqual(["no_stack"]);
  });

  test("a plant stacks on a table and settles when the table is picked up", () => {
    const a = account("alice");
    room.join(a, "alice");
    const table = itemOf(a, "table_basic");
    const plant = itemOf(a, "plant_basic");
    room.place(a, table, 2, 2, 0); // covers (2,2) and (3,2)
    room.place(a, plant, 3, 2, 0); // the table's far tile
    expect(to(a, "furni_placed").at(-1)?.item).toMatchObject({ id: plant, z: 1 });
    emitted.length = 0;

    room.pickup(a, table);
    expect(to(a, "furni_removed").map((m) => m.itemId)).toEqual([table]);
    expect(to(a, "inventory_add").map((m) => m.item)).toEqual([{ id: table, defId: "table_basic" }]);
    expect(to(a, "furni_moved").map((m) => m.item)).toEqual([
      { id: plant, defId: "plant_basic", x: 3, y: 2, z: 0, dir: 0, state: 0 },
    ]);
    expect(db.prepare("SELECT z FROM furni_items WHERE id = ?").get(plant)).toEqual({ z: 0 });
    expect(db.prepare("SELECT room_id AS roomId FROM furni_items WHERE id = ?").get(table))
      .toEqual({ roomId: null });
  });

  test("picking up an item placed by someone else is not_owner", () => {
    const a = account("alice");
    const b = account("bob");
    room.join(a, "alice");
    room.join(b, "bob");
    const chair = itemOf(a, "chair_basic");
    room.place(a, chair, 2, 2, 0);
    emitted.length = 0;

    room.pickup(b, chair);
    expect(to(b, "error").map((m) => m.code)).toEqual(["not_owner"]);
    expect(db.prepare("SELECT room_id AS roomId FROM furni_items WHERE id = ?").get(chair))
      .toEqual({ roomId: 1 });
  });

  test("paths route around solid furni", () => {
    const a = account("alice");
    room.join(a, "alice");
    room.place(a, itemOf(a, "table_basic"), 2, 5, 0); // covers (2,5) and (3,5)
    emitted.length = 0;

    room.requestMove(a, 5, 5);
    const [walk] = to(a, "walk");
    expect(walk?.path.some((s) => s.y === 5 && (s.x === 2 || s.x === 3))).toBe(false);
    expect(walk?.path.at(-1)).toMatchObject({ x: 5, y: 5 });
  });

  test("a rug is walkable and its tiles carry the rug height", () => {
    const a = account("alice");
    room.join(a, "alice");
    room.place(a, itemOf(a, "rug_basic"), 2, 4, 0); // covers x 2-4, y 4-5
    emitted.length = 0;

    room.requestMove(a, 5, 5);
    expect(to(a, "walk")[0]?.path).toEqual([
      { x: 1, y: 5, z: 0 },
      { x: 2, y: 5, z: 0.05 },
      { x: 3, y: 5, z: 0.05 },
      { x: 4, y: 5, z: 0.05 },
      { x: 5, y: 5, z: 0 },
    ]);

    vi.advanceTimersByTime(MS_PER_TILE * 2);
    expect(at(a)).toEqual({ x: 2, y: 5, z: 0.05 });
  });
});
