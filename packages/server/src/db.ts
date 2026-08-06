import Database from "better-sqlite3";
import { parseHeightmap } from "@grand/shared";
import type { Door, RoomDecor } from "@grand/shared";
import { MUSEUM_ROOM_ID } from "./museum.ts";

const DDL = `
CREATE TABLE IF NOT EXISTS accounts(
  id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE NOT NULL,
  username_normalized TEXT UNIQUE NOT NULL,
  pw_hash BLOB NOT NULL, pw_salt BLOB NOT NULL, pw_params TEXT NOT NULL,
  starter_granted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
  created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS rooms(
  id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES accounts(id), name TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'open',
  doc TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS furni_items(
  id INTEGER PRIMARY KEY, def_id TEXT NOT NULL,
  owner_id INTEGER NOT NULL REFERENCES accounts(id),
  room_id INTEGER REFERENCES rooms(id),
  x INTEGER, y INTEGER, z REAL, dir INTEGER, state INTEGER NOT NULL DEFAULT 0,
  -- Wall items (#203) share the table so an item keeps one identity across both surfaces. They
  -- use x, y for the segment tile and u, v for the offsets on it; z and dir stay NULL.
  wall_side TEXT, wall_u INTEGER, wall_v INTEGER);
-- Status systems (GAME.md §Status systems, #210). A badge is earned once and never spent, so the
-- row's existence is the whole record.
CREATE TABLE IF NOT EXISTS badges(
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  badge_id TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY(account_id, badge_id));
CREATE TABLE IF NOT EXISTS ledger_entries(
  id INTEGER PRIMARY KEY,
  op TEXT NOT NULL, op_key TEXT NOT NULL, seq INTEGER NOT NULL DEFAULT 0,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  stars INTEGER NOT NULL DEFAULT 0,
  item_id INTEGER,           -- no FK: the log outlives any item it mentions
  counterparty_id INTEGER,   -- item rows: the previous owner (NULL for grants/mints)
  created_at INTEGER NOT NULL,
  UNIQUE(op_key, seq));
CREATE INDEX IF NOT EXISTS ledger_by_account_time ON ledger_entries(account_id, created_at);
CREATE TABLE IF NOT EXISTS star_balances(
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  balance INTEGER NOT NULL CHECK(balance >= 0));
CREATE TABLE IF NOT EXISTS onboarding(
  account_id INTEGER PRIMARY KEY REFERENCES accounts(id),
  step TEXT NOT NULL);
-- Garment ownership (#127). Wearing is gated on a row here from day one; today the only writer is
-- the registration grant, and #118's ledger takes the table over without the check moving.
CREATE TABLE IF NOT EXISTS owned_sets(
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  set_id INTEGER NOT NULL,
  granted_at INTEGER NOT NULL,
  PRIMARY KEY (account_id, set_id));
CREATE TRIGGER IF NOT EXISTS ledger_append_only_update BEFORE UPDATE ON ledger_entries
  BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
CREATE TRIGGER IF NOT EXISTS ledger_append_only_delete BEFORE DELETE ON ledger_entries
  BEGIN SELECT RAISE(ABORT, 'ledger is append-only'); END;
`;

interface ChatConfig {
  speakRadius: number;
  shoutAllowed: boolean;
}

const CAFE_HEIGHTMAP = Array.from({ length: 10 }, () => "0".repeat(10)).join("\n");
const CAFE_DOOR: Door = { x: 0, y: 5, dir: 2 };
const CAFE_CHAT: ChatConfig = { speakRadius: 5, shoutAllowed: false };
const CAFE_DECOR: RoomDecor = { floor: "floor_parquet", wall: "wall_wainscot" };

const CASINO_HEIGHTMAP = [
  "xx0000000000",
  "x00000000000",
  "000011110000",
  "000012210000",
  "000012210000",
  "000011110000",
  "000000000000",
  "000000000000",
  "000000000000",
  "000000000000",
  "000000000000",
  "000000000000",
].join("\n");
const CASINO_DOOR: Door = { x: 0, y: 6, dir: 2 };
const CASINO_CHAT: ChatConfig = { speakRadius: 5, shoutAllowed: true };
const CASINO_DECOR: RoomDecor = { floor: "floor_marble", wall: "wall_pinstripe" };

// The Museum wing (#210). A long gallery: donations stand on the plinth row against the back
// wall, where the donor plaque hangs behind each one. Staff-owned, so nobody can rearrange it.
const MUSEUM_HEIGHTMAP = Array.from({ length: 8 }, () => "0".repeat(12)).join("\n");
const MUSEUM_DOOR: Door = { x: 0, y: 7, dir: 2 };
const MUSEUM_CHAT: ChatConfig = { speakRadius: 6, shoutAllowed: false };

function seedRoom(
  db: Database.Database,
  id: number,
  name: string,
  heightmap: string,
  door: Door,
  chat: ChatConfig,
  decor: RoomDecor = {},
): void {
  parseHeightmap(heightmap, door); // never skip: an unwalkable seed must fail loudly at boot
  const doc = JSON.stringify({ v: 1, heightmap, door, chat, decor });
  db.prepare("INSERT OR IGNORE INTO rooms (id, owner_id, name, doc) VALUES (?, NULL, ?, ?)").run(
    id,
    name,
    doc,
  );
}

/** `CREATE TABLE IF NOT EXISTS` never adds a column to a table that already exists, so a dev
 *  database made before the column was declared would reach the server missing it and fail at the
 *  first read. Add it explicitly instead of finding out at runtime. */
function addColumn(db: Database.Database, table: string, column: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(DDL);
  addColumn(db, "accounts", "figure", "TEXT");
  // #226. One bit, flagged by hand with `make staff USER=<username>`. It gates /api/metrics and
  // nothing else — the `staff` flag in the protocol describes NPC occupants, not accounts.
  addColumn(db, "accounts", "is_staff", "INTEGER NOT NULL DEFAULT 0");
  for (const [col, decl] of [
    ["wall_side", "TEXT"], ["wall_u", "INTEGER"], ["wall_v", "INTEGER"],
    // #210. `bound` is account-bound-forever: prestige fixtures, set pieces, museum donations.
    // `inscription` is the engraving — there is no text renderer, so it is data shown on click.
    // `locked` is a museum donation: placed by the house, never picked up again.
    ["bound", "INTEGER NOT NULL DEFAULT 0"], ["inscription", "TEXT"],
    ["locked", "INTEGER NOT NULL DEFAULT 0"],
  ]) {
    addColumn(db, "furni_items", col ?? "", decl ?? "");
  }
  seedRoom(db, 1, "The Lobby Café", CAFE_HEIGHTMAP, CAFE_DOOR, CAFE_CHAT, CAFE_DECOR);
  seedRoom(db, 2, "The Casino Floor", CASINO_HEIGHTMAP, CASINO_DOOR, CASINO_CHAT, CASINO_DECOR);
  seedRoom(db, MUSEUM_ROOM_ID, "The Museum", MUSEUM_HEIGHTMAP, MUSEUM_DOOR, MUSEUM_CHAT);
  return db;
}

export function closeDb(db: Database.Database): void {
  db.close();
}
