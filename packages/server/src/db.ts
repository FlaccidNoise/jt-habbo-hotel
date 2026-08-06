import Database from "better-sqlite3";
import { parseHeightmap } from "@grand/shared";
import type { Door } from "@grand/shared";

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
  x INTEGER, y INTEGER, z REAL, dir INTEGER, state INTEGER NOT NULL DEFAULT 0);
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

function seedRoom(
  db: Database.Database,
  id: number,
  name: string,
  heightmap: string,
  door: Door,
  chat: ChatConfig,
): void {
  parseHeightmap(heightmap, door); // never skip: an unwalkable seed must fail loudly at boot
  const doc = JSON.stringify({ v: 1, heightmap, door, chat });
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
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${decl}`);
}

export function openDb(path: string): Database.Database {
  const db = new Database(path);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(DDL);
  addColumn(db, "accounts", "figure", "figure TEXT");
  seedRoom(db, 1, "The Lobby Café", CAFE_HEIGHTMAP, CAFE_DOOR, CAFE_CHAT);
  seedRoom(db, 2, "The Casino Floor", CASINO_HEIGHTMAP, CASINO_DOOR, CASINO_CHAT);
  return db;
}

export function closeDb(db: Database.Database): void {
  db.close();
}
