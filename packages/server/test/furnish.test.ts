import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PROTOTYPE_CATALOG, footprintTiles, parseHeightmap, tileHeight } from "@grand/shared";
import type { FurniItem } from "@grand/shared";
import SQLite from "better-sqlite3";
import type Database from "better-sqlite3";
import { openDb, closeDb } from "../src/db.ts";
import { NPC_ROSTER } from "../src/npc.ts";
import { findPath } from "../src/pathfind.ts";

// The house layout for the public rooms (#312). The seed validates itself at boot, so what these
// tests hold onto is that it runs at all, that it runs once, and that the room it leaves behind is
// one a player can walk around.

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-furnish-"));
  dbPath = join(dir, "test.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DEFS = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));

function floorOf(db: Database.Database, roomId: number): FurniItem[] {
  return db
    .prepare(
      "SELECT id, def_id AS defId, x, y, z, dir, state FROM furni_items" +
        " WHERE room_id = ? AND wall_side IS NULL",
    )
    .all(roomId) as FurniItem[];
}

function countIn(db: Database.Database, roomId: number): number {
  return (
    db.prepare("SELECT COUNT(*) AS n FROM furni_items WHERE room_id = ?").get(roomId) as {
      n: number;
    }
  ).n;
}

describe("public room furniture", () => {
  test("both public rooms are furnished, house-owned and locked down", () => {
    const db = openDb(dbPath);
    for (const roomId of [1, 2]) {
      const rows = db
        .prepare(
          "SELECT owner_id AS ownerId, locked, wall_side AS side FROM furni_items WHERE room_id = ?",
        )
        .all(roomId) as Array<{ ownerId: number; locked: number; side: string | null }>;
      expect(rows.length).toBeGreaterThanOrEqual(15);
      expect(rows.every((r) => r.locked === 1)).toBe(true);
      expect(new Set(rows.map((r) => r.ownerId)).size).toBe(1);
      expect(rows.some((r) => r.side !== null)).toBe(true);   // wall items too, not just floor
    }
    // The house owns them, and it is not an account anyone can sign into.
    const house = db.prepare("SELECT username FROM accounts WHERE id = ?").get(
      (db.prepare("SELECT owner_id AS ownerId FROM furni_items WHERE room_id = 1").get() as {
        ownerId: number;
      }).ownerId,
    ) as { username: string };
    expect(house.username).toBe("The Grand");
    closeDb(db);
  });

  test("a second boot adds nothing, and a rearranged room is left alone", () => {
    let db = openDb(dbPath);
    const first = { cafe: countIn(db, 1), casino: countIn(db, 2) };
    closeDb(db);

    db = openDb(dbPath);
    expect({ cafe: countIn(db, 1), casino: countIn(db, 2) }).toEqual(first);

    // Somebody moves the café around: the next boot must not put it back.
    db.prepare("DELETE FROM furni_items WHERE room_id = 1").run();
    db.prepare("INSERT INTO furni_items (def_id, owner_id, room_id, x, y, z, dir, state)" +
      " SELECT 'cafe_table', owner_id, 1, 4, 4, 0, 0, 0 FROM furni_items WHERE room_id = 2 LIMIT 1")
      .run();
    closeDb(db);

    db = openDb(dbPath);
    expect(countIn(db, 1)).toBe(1);
    expect(countIn(db, 2)).toBe(first.casino);
    closeDb(db);
  });

  test("every open tile is still walkable to from the door, and no NPC is buried", () => {
    const db = openDb(dbPath);
    for (const roomId of [1, 2]) {
      const doc = JSON.parse(
        (db.prepare("SELECT doc FROM rooms WHERE id = ?").get(roomId) as { doc: string }).doc,
      ) as { heightmap: string; door: { x: number; y: number; dir: number } };
      const model = parseHeightmap(doc.heightmap, doc.door);

      const solid = new Set<string>();
      for (const item of floorOf(db, roomId)) {
        const def = DEFS.get(item.defId);
        if (!def) throw new Error(`seeded def is not in the catalog: ${item.defId}`);
        if (def.canWalk) continue;
        for (const t of footprintTiles(def, item.x, item.y, item.dir)) solid.add(`${t.x},${t.y}`);
      }
      const blocked = (x: number, y: number): boolean => solid.has(`${x},${y}`);

      expect(blocked(doc.door.x, doc.door.y)).toBe(false);
      for (const npc of NPC_ROSTER.filter((n) => n.roomId === roomId)) {
        expect(blocked(npc.post.x, npc.post.y)).toBe(false);
      }

      const stranded: string[] = [];
      for (let y = 0; y < model.height; y++) {
        for (let x = 0; x < model.width; x++) {
          if (tileHeight(model, x, y) < 0 || blocked(x, y)) continue;
          if (x === doc.door.x && y === doc.door.y) continue;
          if (!findPath(model, blocked, doc.door, { x, y })) stranded.push(`${x},${y}`);
        }
      }
      expect(stranded).toEqual([]);
    }
    closeDb(db);
  });

  test("a layout that does not fit its room fails the boot rather than half-furnishing", () => {
    const db = openDb(dbPath);
    db.prepare("DELETE FROM furni_items WHERE room_id = 1").run();
    // Same room id, three tiles across: the layout now runs off the edge of it.
    db.prepare("UPDATE rooms SET doc = ? WHERE id = 1").run(
      JSON.stringify({
        v: 1,
        heightmap: "000\n000\n000",
        door: { x: 0, y: 1, dir: 2 },
        chat: { speakRadius: 5, shoutAllowed: false },
      }),
    );
    closeDb(db);

    expect(() => openDb(dbPath)).toThrow(/bad_position/);

    const side = new SQLite(dbPath);
    expect(
      side.prepare("SELECT COUNT(*) AS n FROM furni_items WHERE room_id = 1").get(),
    ).toEqual({ n: 0 });
    side.close();
  });
});
