import Database from "better-sqlite3";
import { RoomDecorSchema, STARTER_GRANT_SETS, decorRegionsFault, parseHeightmap } from "@grand/shared";
import type { Door, RoomDecor } from "@grand/shared";
import { LAYOUT_VERSION, clearHouseLayout, seedPublicFurni } from "./furnish.ts";
import {
  GROUNDS_CHAT, GROUNDS_DECOR, GROUNDS_DOOR, GROUNDS_HEIGHTMAP, GROUNDS_ROOM_ID,
} from "./grounds.ts";
import { log } from "./log.ts";
import { MUSEUM_ROOM_ID } from "./museum.ts";

/** Ids below this belong to the house. A suite is allocated above it (items.ts) so that reserving
 *  an id for a new public room can never collide with a room a player already owns — which is
 *  exactly what happened when Resort Grounds wanted 4 and the first suite on every existing
 *  database already had it (#406). */
export const RESERVED_ROOM_IDS = 100;

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

export interface ChatConfig {
  speakRadius: number;
  shoutAllowed: boolean;
}

// Public rooms are sized for a crowd, not for a viewport (#315): the client's camera follows the
// player through a room that overflows the screen (#311), so these read like Habbo's big public
// spaces — long walls to line with furniture, and structure to walk around rather than one open
// rectangle. A void tile is a wall the room builds itself: the two faces of it that point at the
// camera are drawn, so the north-east notch is an alcove and the two lone voids are columns.
const CAFE_HEIGHTMAP = [
  "000000000000xxxx",
  "000000000000xxxx",
  "000000000000xxxx",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000x000000x0000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
  "0000000000000000",
].join("\n");
const CAFE_DOOR: Door = { x: 0, y: 5, dir: 2 };
const CAFE_CHAT: ChatConfig = { speakRadius: 5, shoutAllowed: false };
// Lodge look (#311): the reference café is a log cabin, and the decor class has the tiles now.
const CAFE_DECOR: RoomDecor = { floor: "floor_planks", wall: "wall_logcabin" };

// The stage keeps its ring-around-a-core motif at six times the floor area: heights 1 and 2 at
// x 8-13, y 2-7, with the raised bar terrace along the east edge from y 12. The stepped void in
// the north-west corner is the old room's chamfer, cut deeper.
const CASINO_HEIGHTMAP = [
  "xxx00000000000000000",
  "xx000000000000000000",
  "x0000000111111000000",
  "00000000111111000000",
  "00000000112211000000",
  "00000000112211000000",
  "00000000111111000000",
  "00000000111111000000",
  "00000000000000000000",
  "00000000000000000000",
  "00000000000000000000",
  "00000000000000000000",
  "00000000000000001111",
  "00000000000000001111",
  "00000000000000001111",
  "00000000000000001111",
  "00000000000000001111",
  "00000000000000001111",
  "00000000000000001111",
  "00000000000000001111",
].join("\n");
const CASINO_DOOR: Door = { x: 0, y: 6, dir: 2 };
const CASINO_CHAT: ChatConfig = { speakRadius: 5, shoutAllowed: true };
const CASINO_DECOR: RoomDecor = { floor: "floor_marble", wall: "wall_pinstripe" };

// The Museum wing (#210). A long gallery: donations stand on the plinth row against the back
// wall, where the donor plaque hangs behind each one. Staff-owned, so nobody can rearrange it.
const MUSEUM_HEIGHTMAP = Array.from({ length: 8 }, () => "0".repeat(12)).join("\n");
const MUSEUM_DOOR: Door = { x: 0, y: 7, dir: 2 };
const MUSEUM_CHAT: ChatConfig = { speakRadius: 6, shoutAllowed: false };

/** Seeds a house room, and re-seeds one whose floor has since been redrawn (#315) or whose layout
 *  constant has since changed shape (#330, LAYOUT_VERSION). `INSERT OR IGNORE` alone would leave
 *  every existing hotel on the shape and layout it first booted with, so a house room whose stored
 *  heightmap or layout version has drifted from the constants takes the new doc in place and gives
 *  up its house layout, which the caller lays out again. The room the house owns is house property
 *  end to end; a room with an `owner_id` belongs to a player and is never touched. Returns true
 *  when the doc was replaced. */
function seedRoom(
  db: Database.Database,
  id: number,
  name: string,
  heightmap: string,
  door: Door,
  chat: ChatConfig,
  decor: RoomDecor = {},
  layout = 0,
): boolean {
  const model = parseHeightmap(heightmap, door); // never skip: unwalkable must fail loudly at boot
  // Same reason, for what the decor says: a mistyped region id or a rect that runs off the floor
  // would otherwise reach a client as a room_state it refuses to parse, locking the room instead
  // of the boot.
  RoomDecorSchema.parse(decor);
  const fault = decorRegionsFault(decor, model.width, model.height);
  if (fault) throw new Error(`room ${id} (${name}): ${fault}`);
  const doc = JSON.stringify({ v: 1, heightmap, door, chat, decor, layout });
  const inserted =
    db
      .prepare("INSERT OR IGNORE INTO rooms (id, owner_id, name, doc) VALUES (?, NULL, ?, ?)")
      .run(id, name, doc).changes > 0;
  if (inserted) return false;

  const row = db.prepare("SELECT owner_id AS ownerId, doc FROM rooms WHERE id = ?").get(id) as
    | { ownerId: number | null; doc: string }
    | undefined;
  if (!row) return false;
  // Never stomp player property: a room somebody owns keeps its floor and its furniture. It can
  // only happen on a database made before this id was reserved — a suite is inserted without an id
  // (items.ts), so SQLite used to hand out max(id) + 1 from the same range. Say so rather than
  // booting a hotel with a public room quietly missing from the navigator (#406).
  if (row.ownerId !== null) {
    log("public_room_id_taken", { roomId: id, name, fix: "make db-reset" });
    return false;
  }
  const stored = JSON.parse(row.doc) as { heightmap?: string; decor?: RoomDecor; layout?: number };
  // Same placement surface: the heightmap the layout was checked against, and the layout constant
  // itself. Either one drifting invalidates every placement the room is currently holding.
  const samePlacement = stored.heightmap === heightmap && (stored.layout ?? 0) === layout;
  if (samePlacement && JSON.stringify(stored.decor ?? {}) === JSON.stringify(decor)) return false;
  db.prepare("UPDATE rooms SET doc = ? WHERE id = ?").run(doc, id);
  // Redecorated but not redrawn: every placement is still valid, so the layout stays.
  if (samePlacement) return false;
  clearHouseLayout(db, id);
  return true;
}

/** `CREATE TABLE IF NOT EXISTS` never adds a column to a table that already exists, so a dev
 *  database made before the column was declared would reach the server missing it and fail at the
 *  first read. Add it explicitly instead of finding out at runtime. */
function addColumn(db: Database.Database, table: string, column: string, decl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${decl}`);
}

/** Registration is the only writer of owned_sets, so widening the starter grant (#346 put the
 *  eyed faces in it) would leave every account made before the change unable to wear what the
 *  wardrobe now offers them. Boot hands the missing rows out. Idempotent — the (account, set)
 *  primary key absorbs the repeat — and stored figure strings are never rewritten, so a player
 *  keeps the head they have until they re-dress. */
function backfillStarterSets(db: Database.Database): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO owned_sets (account_id, set_id, granted_at) SELECT id, ?, ? FROM accounts",
  );
  const now = Date.now();
  db.transaction(() => {
    for (const id of STARTER_GRANT_SETS) insert.run(id, now);
  })();
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
    // #237. Bind-on-purchase: the timestamp the item becomes tradeable. NULL means never bound —
    // starter grants and anything minted before the column existed. Distinct from `bound`, which
    // is forever.
    ["bind_until", "INTEGER"],
  ]) {
    addColumn(db, "furni_items", col ?? "", decl ?? "");
  }
  backfillStarterSets(db);
  const relaid = new Set<number>();
  if (
    seedRoom(db, 1, "The Lobby Café", CAFE_HEIGHTMAP, CAFE_DOOR, CAFE_CHAT, CAFE_DECOR, LAYOUT_VERSION)
  ) {
    relaid.add(1);
  }
  if (
    seedRoom(
      db, 2, "The Casino Floor", CASINO_HEIGHTMAP, CASINO_DOOR, CASINO_CHAT, CASINO_DECOR,
      LAYOUT_VERSION,
    )
  ) {
    relaid.add(2);
  }
  seedRoom(db, MUSEUM_ROOM_ID, "The Museum", MUSEUM_HEIGHTMAP, MUSEUM_DOOR, MUSEUM_CHAT);
  if (
    seedRoom(
      db, GROUNDS_ROOM_ID, "Resort Grounds", GROUNDS_HEIGHTMAP, GROUNDS_DOOR, GROUNDS_CHAT,
      GROUNDS_DECOR, LAYOUT_VERSION,
    )
  ) {
    relaid.add(GROUNDS_ROOM_ID);
  }
  // After the rooms exist and only into the bare ones (#312) plus the ones whose floor just
  // changed under them (#315). The museum furnishes itself, one donation at a time.
  seedPublicFurni(db, relaid);
  return db;
}

export function closeDb(db: Database.Database): void {
  db.close();
}
