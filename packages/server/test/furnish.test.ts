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

  test("the seeded rooms are the big ones, and the layouts leave room to move", () => {
    const db = openDb(dbPath);
    for (const [roomId, width, height] of [[1, 16, 16], [2, 20, 20]] as const) {
      const doc = JSON.parse(
        (db.prepare("SELECT doc FROM rooms WHERE id = ?").get(roomId) as { doc: string }).doc,
      ) as { heightmap: string; door: { x: number; y: number; dir: number } };
      const model = parseHeightmap(doc.heightmap, doc.door);
      expect([model.width, model.height]).toEqual([width, height]);

      let walkable = 0;
      for (let y = 0; y < model.height; y++) {
        for (let x = 0; x < model.width; x++) if (tileHeight(model, x, y) >= 0) walkable++;
      }
      // Density (#315): one piece per 6-8 walkable tiles. Denser than that is a warehouse.
      const perItem = walkable / floorOf(db, roomId).length;
      expect(perItem).toBeGreaterThanOrEqual(6);
      expect(perItem).toBeLessThanOrEqual(8);
    }
    closeDb(db);
  });

  test("a layout that does not fit its room fails the boot rather than half-furnishing", () => {
    const db = openDb(dbPath);
    db.prepare("DELETE FROM furni_items WHERE room_id = 1").run();
    // Same room id, three tiles across: the layout now runs off the edge of it. The owner is what
    // holds the small floor in place — a house room this far from its seed is grown back to it
    // (#315), so an owned one is the only way to hand furnish a floor its layout cannot fit.
    db.prepare(
      "UPDATE rooms SET owner_id = (SELECT id FROM accounts LIMIT 1), doc = ? WHERE id = 1",
    ).run(
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

// Growing a public room (#315). `INSERT OR IGNORE` never reaches a database that already has the
// room, so every hotel booted before the rooms grew would keep the floor it started on. The doc is
// replaced in place and the house lays its layout out again; what a player put in the room is the
// player's, and stays.

const OLD_CAFE = Array.from({ length: 10 }, () => "0".repeat(10)).join("\n");
const OLD_CASINO = [
  "xx0000000000", "x00000000000", "000011110000", "000012210000",
  "000012210000", "000011110000", "000000000000", "000000000000",
  "000000000000", "000000000000", "000000000000", "000000000000",
].join("\n");

/** The house's own furniture in a room, without the ids — two databases seeded independently
 *  agree on every column but those. */
function houseLayout(db: Database.Database, roomId: number): unknown[] {
  return db
    .prepare(
      "SELECT def_id AS defId, x, y, z, dir, wall_side AS side, wall_u AS u, wall_v AS v, locked" +
        " FROM furni_items WHERE room_id = ? AND locked = 1" +
        " ORDER BY def_id, x, y, wall_side, wall_u",
    )
    .all(roomId);
}

function docOf(db: Database.Database, roomId: number): { heightmap: string; decor?: unknown } {
  return JSON.parse(
    (db.prepare("SELECT doc FROM rooms WHERE id = ?").get(roomId) as { doc: string }).doc,
  ) as { heightmap: string; decor?: unknown };
}

/** A database as it stood before the rooms grew: the old docs, a house layout placed on the old
 *  floors, and one item a player left standing in the café. */
function bootOnOldRooms(path: string): { player: number; playerItem: number } {
  const db = openDb(path);
  const house = (
    db.prepare("SELECT owner_id AS ownerId FROM furni_items WHERE room_id = 1 LIMIT 1").get() as {
      ownerId: number;
    }
  ).ownerId;
  db.prepare("DELETE FROM furni_items WHERE room_id IN (1, 2)").run();
  for (const [roomId, heightmap, door, chat] of [
    [1, OLD_CAFE, { x: 0, y: 5, dir: 2 }, { speakRadius: 5, shoutAllowed: false }],
    [2, OLD_CASINO, { x: 0, y: 6, dir: 2 }, { speakRadius: 5, shoutAllowed: true }],
  ] as const) {
    const decor = (JSON.parse(
      (db.prepare("SELECT doc FROM rooms WHERE id = ?").get(roomId) as { doc: string }).doc,
    ) as { decor: unknown }).decor;
    db.prepare("UPDATE rooms SET doc = ? WHERE id = ?").run(
      JSON.stringify({ v: 1, heightmap, door, chat, decor }),
      roomId,
    );
  }
  // The old layouts, at coordinates that only the old floors had a use for.
  const place = db.prepare(
    "INSERT INTO furni_items (def_id, owner_id, room_id, x, y, z, dir, state, locked)" +
      " VALUES (?, ?, ?, ?, ?, 0, 0, 0, 1)",
  );
  place.run("cafe_table", house, 1, 2, 3);
  place.run("cafe_chair", house, 1, 1, 3);
  place.run("bar_counter", house, 2, 2, 10);

  const player = Number(
    db
      .prepare(
        "INSERT INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params," +
          " created_at) VALUES ('dana', 'dana', x'00', x'00', 'test', 0)",
      )
      .run().lastInsertRowid,
  );
  const playerItem = Number(
    db
      .prepare(
        "INSERT INTO furni_items (def_id, owner_id, room_id, x, y, z, dir, state, locked)" +
          " VALUES ('plant_basic', ?, 1, 7, 8, 0, 0, 0, 0)",
      )
      .run(player).lastInsertRowid,
  );
  closeDb(db);
  return { player, playerItem };
}

describe("growing a public room", () => {
  test("an old database ends up with exactly the rooms a fresh one seeds", () => {
    const freshPath = join(dir, "fresh.db");
    const fresh = openDb(freshPath);

    const { playerItem } = bootOnOldRooms(dbPath);
    const grown = openDb(dbPath);

    for (const roomId of [1, 2]) {
      expect(docOf(grown, roomId)).toEqual(docOf(fresh, roomId));
      expect(houseLayout(grown, roomId)).toEqual(houseLayout(fresh, roomId));
    }
    // The old layout is gone rather than left standing inside the new one.
    expect(
      grown.prepare("SELECT COUNT(*) AS n FROM furni_items WHERE room_id = 1 AND x = 1 AND y = 3")
        .get(),
    ).toEqual({ n: 0 });
    // The player's plant is not the house's to move.
    expect(
      grown.prepare("SELECT room_id AS roomId, x, y FROM furni_items WHERE id = ?").get(playerItem),
    ).toEqual({ roomId: 1, x: 7, y: 8 });

    closeDb(grown);
    closeDb(fresh);
  });

  test("a second boot after the growth changes nothing again", () => {
    bootOnOldRooms(dbPath);
    let db = openDb(dbPath);
    const after = { cafe: houseLayout(db, 1), casino: houseLayout(db, 2), n: countIn(db, 1) };
    closeDb(db);

    db = openDb(dbPath);
    expect(houseLayout(db, 1)).toEqual(after.cafe);
    expect(houseLayout(db, 2)).toEqual(after.casino);
    expect(countIn(db, 1)).toBe(after.n);
    closeDb(db);
  });

  test("a redecorated room keeps its layout and takes the new decor", () => {
    let db = openDb(dbPath);
    const before = houseLayout(db, 1);
    // Rewind only the decor, as a database from before the lodge tiles would hold it.
    const doc = docOf(db, 1);
    db.prepare("UPDATE rooms SET doc = ? WHERE id = 1").run(
      JSON.stringify({
        v: 1, heightmap: doc.heightmap, door: { x: 0, y: 5, dir: 2 },
        chat: { speakRadius: 5, shoutAllowed: false },
        decor: { floor: "floor_parquet", wall: "wall_wainscot" },
      }),
    );
    closeDb(db);

    db = openDb(dbPath);
    expect(docOf(db, 1).decor).toEqual({ floor: "floor_planks", wall: "wall_logcabin" });
    expect(houseLayout(db, 1)).toEqual(before);
    closeDb(db);
  });

  test("a layout bump alone re-lays the room on the same floor", () => {
    let db = openDb(dbPath);
    // Rewind only the layout stamp, as a database from before the bump would hold it. The old
    // house furniture stays in place — the re-lay must drop it, not stack a second layout on top.
    db.prepare("UPDATE rooms SET doc = ? WHERE id = 1").run(
      JSON.stringify({ ...docOf(db, 1), layout: 0 }),
    );
    closeDb(db);

    db = openDb(dbPath);
    const fresh = openDb(join(dir, "fresh-layout.db"));
    expect(docOf(db, 1)).toEqual(docOf(fresh, 1));
    expect(houseLayout(db, 1)).toEqual(houseLayout(fresh, 1));
    closeDb(db);
    closeDb(fresh);
  });

  test("a room a player owns keeps its floor and its furniture", () => {
    bootOnOldRooms(dbPath);
    let db = openDb(dbPath);
    // Nobody can own a public room today; the guard is what keeps that true if anybody ever does.
    db.prepare("UPDATE rooms SET owner_id = (SELECT id FROM accounts WHERE username = 'dana')," +
      " doc = ? WHERE id = 1").run(
      JSON.stringify({
        v: 1, heightmap: OLD_CAFE, door: { x: 0, y: 5, dir: 2 },
        chat: { speakRadius: 5, shoutAllowed: false }, decor: {},
      }),
    );
    const before = countIn(db, 1);
    closeDb(db);

    db = openDb(dbPath);
    expect(docOf(db, 1).heightmap).toBe(OLD_CAFE);
    expect(countIn(db, 1)).toBe(before);
    closeDb(db);
  });
});
