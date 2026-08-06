import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FigureError, ServerMsgSchema, parseFigure } from "@grand/shared";
import type { ServerMsg } from "@grand/shared";
import type Database from "better-sqlite3";
import { closeDb, openDb } from "../src/db.ts";
import { register } from "../src/auth.ts";
import { defaultFigure, figureOf, grantFigure, ownsSet, saveFigure } from "../src/figure.ts";
import { Room } from "../src/room.ts";
import type { Emit } from "../src/room.ts";

let dir: string;
let db: Database.Database;
let room: Room;
let emitted: Array<[number, ServerMsg]>;

beforeEach(() => {
  vi.useFakeTimers();
  dir = mkdtempSync(join(tmpdir(), "grand-figure-"));
  db = openDb(join(dir, "test.db"));
  emitted = [];
  const emit: Emit = (id, msg) => {
    ServerMsgSchema.parse(msg);
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

function account(username: string): number {
  const info = db
    .prepare(
      `INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params, created_at)
       VALUES (?, ?, x'00', x'00', 'test', 0)`,
    )
    .run(username, username.toLowerCase());
  const id = Number(info.lastInsertRowid);
  grantFigure(db, id);
  return id;
}

describe("the registration grant", () => {
  test("dresses a new account in a figure that parses", () => {
    const a = account("alice");
    expect(() => parseFigure(figureOf(db, a))).not.toThrow();
  });

  test("gives every granted set a row, and nothing more", () => {
    const a = account("alice");
    // Held back deliberately: the coat and the accessories are the first cosmetics that have to
    // be earned, and the staff blazer is never player-grantable at all.
    for (const set of [11, 12, 13, 14, 15, 16]) expect(ownsSet(db, a, set)).toBe(false);
    for (const set of [2, 3, 4, 5, 6, 7, 8, 9, 10]) expect(ownsSet(db, a, set)).toBe(true);
  });

  test("only ever names sets the account owns", () => {
    for (let id = 1; id <= 30; id++) {
      for (const part of parseFigure(defaultFigure(id)).parts) {
        expect([2, 3, 4, 5, 6, 7, 8, 9, 10], `account ${id} wears set ${part.set}`)
          .toContain(part.set);
      }
    }
  });

  test("two accounts do not look the same", () => {
    // A fixed default makes every new player identical and, since the chat bubble colour derives
    // from the outfit, gives them all the same bubble.
    const figures = new Set(Array.from({ length: 30 }, (_, i) => defaultFigure(i + 1)));
    expect(figures.size).toBeGreaterThan(20);
  });

  test("is deterministic for a given account", () => {
    expect(defaultFigure(7)).toBe(defaultFigure(7));
  });
});

describe("wearing is gated on ownership", () => {
  test("an owned outfit saves and normalises", () => {
    const a = account("alice");
    const saved = saveFigure(db, a, "v1|hr-3-walnut.hd-2-skin_2.lg-7-navy");
    expect(saved).toBe("v1|hd-2-skin_2.lg-7-navy.hr-3-walnut");   // reordered into LAYER_ORDER
    expect(figureOf(db, a)).toBe(saved);
  });

  test("an unowned set is refused and the stored figure is untouched", () => {
    const a = account("alice");
    const before = figureOf(db, a);
    // Set 11 is the Overcoat: a real, non-retired, correctly-coloured set that alice does not own.
    // The string is well-formed, so only the ownership check can stop it.
    expect(() => saveFigure(db, a, "v1|hd-2-skin_2.cc-11-navy-gold"))
      .toThrow(new FigureError("you do not own set 11"));
    expect(figureOf(db, a)).toBe(before);
  });

  test("the staff blazer is refused to players", () => {
    const a = account("alice");
    expect(() => saveFigure(db, a, "v1|hd-2-skin_2.ch-16-navy-gold"))
      .toThrow(/do not own set 16/);
  });
});

describe("set_figure over the wire", () => {
  test("broadcasts the change to the room", () => {
    const a = account("alice");
    room.join(a, "alice");
    room.setFigure(a, "v1|hd-2-skin_5.hr-4-teal");

    const changed = emitted.filter(([, m]) => m.t === "figure_changed");
    expect(changed).toHaveLength(1);
    expect(changed[0]?.[1]).toMatchObject({ id: a, figure: "v1|hd-2-skin_5.hr-4-teal" });
    // The occupant carries it too, so the next joiner sees the new outfit rather than the default.
    expect(room.occupants().find((o) => o.accountId === a)?.figure)
      .toBe("v1|hd-2-skin_5.hr-4-teal");
  });

  test("a refused change emits an error and broadcasts nothing", () => {
    const a = account("alice");
    room.join(a, "alice");
    const before = room.occupants().find((o) => o.accountId === a)?.figure;

    room.setFigure(a, "v1|hd-2-skin_2.cc-11-navy-gold");

    expect(emitted.filter(([, m]) => m.t === "figure_changed")).toHaveLength(0);
    const errors = emitted.filter(([, m]) => m.t === "error");
    expect(errors).toHaveLength(1);
    expect(errors[0]?.[1]).toMatchObject({ code: "figure" });
    expect(room.occupants().find((o) => o.accountId === a)?.figure).toBe(before);
    expect(figureOf(db, a)).toBe(before);
  });

  test("a malformed string is refused the same way", () => {
    const a = account("alice");
    room.join(a, "alice");
    room.setFigure(a, "not-a-figure");
    expect(emitted.filter(([, m]) => m.t === "error")).toHaveLength(1);
    expect(emitted.filter(([, m]) => m.t === "figure_changed")).toHaveLength(0);
  });
});

describe("staff", () => {
  test("wear the blazer, and it is not a player outfit", () => {
    room.addNpc({ id: -1, name: "Maya", post: { x: 2, y: 2 }, dir: 4 });
    const npc = room.occupants().find((o) => o.accountId === -1);
    expect(npc?.staff).toBe(true);
    const parsed = parseFigure(npc!.figure);
    expect(parsed.parts.some((p) => p.set === 16)).toBe(true);
  });
});

describe("registration wires the grant in", () => {
  test("a registered account joins already dressed", async () => {
    await register(db, "carol", "password123");
    const id = (db.prepare("SELECT id FROM accounts WHERE username = ?").get("carol") as
      { id: number }).id;
    room.join(id, "carol");
    const avatar = room.occupants().find((o) => o.accountId === id);
    expect(avatar?.figure).toBe(figureOf(db, id));
    expect(() => parseFigure(avatar!.figure)).not.toThrow();
  });
});
