import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { openDb, closeDb } from "../src/db.ts";
import type Database from "better-sqlite3";

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-db-"));
  dbPath = join(dir, "test.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("db", () => {
  test("seeds exactly the three public rooms, and reopening is idempotent", () => {
    let db: Database.Database = openDb(dbPath);
    const rooms = db.prepare("SELECT id, name FROM rooms ORDER BY id").all() as {
      id: number;
      name: string;
    }[];
    expect(rooms).toHaveLength(3);
    expect(rooms[0]?.name).toBe("The Lobby Café");
    expect(rooms[1]?.name).toBe("The Casino Floor");
    expect(rooms[2]?.name).toBe("The Museum");
    closeDb(db);

    db = openDb(dbPath);
    expect(db.prepare("SELECT id FROM rooms").all()).toHaveLength(3);
    closeDb(db);
  });

  test("seeded room docs carry heightmap, door, and chat config", () => {
    const db = openDb(dbPath);
    const row = db.prepare("SELECT doc FROM rooms WHERE id = 2").get() as { doc: string };
    const doc = JSON.parse(row.doc);
    expect(doc.door).toEqual({ x: 0, y: 6, dir: 2 });
    expect(doc.chat).toEqual({ speakRadius: 5, shoutAllowed: true });
    expect(typeof doc.heightmap).toBe("string");
    closeDb(db);
  });

  test("WAL and foreign_keys pragmas are active", () => {
    const db = openDb(dbPath);
    expect(db.pragma("journal_mode", { simple: true })).toBe("wal");
    expect(db.pragma("foreign_keys", { simple: true })).toBe(1);
    closeDb(db);
  });
});
