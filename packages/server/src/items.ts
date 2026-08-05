import {
  PROTOTYPE_CATALOG,
  ROOM_FURNI_CAP,
  STARTER_GRANT_DEFS,
  checkPlacement,
  parseHeightmap,
} from "@grand/shared";
import type { InventoryItem, FurniItem, WallItem, WallSide } from "@grand/shared";
import type Database from "better-sqlite3";
import { logItemGrants } from "./ledger.ts";

// GAME.md §First session 0:00: registration creates the suite with the starter furni already
// placed — nobody faces an empty room. 8x8, same doc shape as the seeded rooms.
const SUITE_HEIGHTMAP = Array.from({ length: 8 }, () => "0".repeat(8)).join("\n");
const SUITE_DOOR = { x: 0, y: 4, dir: 2 } as const;
const SUITE_CHAT = { speakRadius: 5, shoutAllowed: false } as const;
const SUITE_SPOTS: ReadonlyMap<string, { x: number; y: number }> = new Map([
  ["chair_basic", { x: 2, y: 2 }],
  ["table_basic", { x: 2, y: 1 }],
  ["sofa_basic", { x: 5, y: 1 }],
  ["plant_basic", { x: 7, y: 7 }],
  ["rug_basic", { x: 4, y: 5 }],
]);

// Adding a starter def without giving it a spot would silently leave it in the new player's
// inventory. Fail at boot instead, the way an unwalkable seeded room does.
for (const defId of STARTER_GRANT_DEFS) {
  if (!SUITE_SPOTS.has(defId)) {
    throw new Error(`starter def ${defId} has no spot in the stock suite layout`);
  }
}

export function grantStarter(db: Database.Database, accountId: number): void {
  const row = db.prepare("SELECT starter_granted FROM accounts WHERE id = ?").get(accountId) as
    | { starter_granted: number }
    | undefined;
  if (!row || row.starter_granted) return;

  const insert = db.prepare(
    "INSERT INTO furni_items (def_id, owner_id, room_id, x, y, z, dir, state) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 0)",
  );
  const grant = db.transaction(() => {
    const itemIds = STARTER_GRANT_DEFS.map((defId) => Number(insert.run(defId, accountId).lastInsertRowid));
    db.prepare("UPDATE accounts SET starter_granted = 1 WHERE id = ?").run(accountId);
    logItemGrants(db, { opKey: `starter:${accountId}`, op: "starter", accountId, itemIds });
  });
  grant();
}

/** The account's own room. Null only for accounts that predate suites. */
export function suiteOf(db: Database.Database, accountId: number): number | null {
  const row = db.prepare("SELECT id FROM rooms WHERE owner_id = ?").get(accountId) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

/** Creates the account's suite and moves the starter furni into it, through the real placement
 *  checker so the stock layout can never disagree with the rules. Idempotent per account. */
export function provisionSuite(db: Database.Database, accountId: number, username: string): number {
  const existing = suiteOf(db, accountId);
  if (existing !== null) return existing;

  const model = parseHeightmap(SUITE_HEIGHTMAP, SUITE_DOOR);
  const defs = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
  return db.transaction((): number => {
    const doc = JSON.stringify({ v: 1, heightmap: SUITE_HEIGHTMAP, door: SUITE_DOOR, chat: SUITE_CHAT });
    const roomId = Number(
      db
        .prepare("INSERT INTO rooms (owner_id, name, doc) VALUES (?, ?, ?)")
        .run(accountId, `${username}'s Suite`, doc).lastInsertRowid,
    );
    const placed: FurniItem[] = [];
    for (const item of listInventory(db, accountId)) {
      const spot = SUITE_SPOTS.get(item.defId);
      const def = defs.get(item.defId);
      if (!spot || !def) continue;
      const ctx = {
        model,
        furni: placed,
        defs,
        avatars: [],
        doorTile: { x: SUITE_DOOR.x, y: SUITE_DOOR.y },
        roomFurniCap: ROOM_FURNI_CAP,
      };
      const result = checkPlacement(ctx, def, spot.x, spot.y, 0);
      if (!result.ok) throw new Error(`stock suite layout rejects ${item.defId}: ${result.code}`);
      placeItem(db, item.id, roomId, spot.x, spot.y, result.z, 0);
      placed.push({ id: item.id, defId: item.defId, x: spot.x, y: spot.y, z: result.z, dir: 0, state: 0 });
    }
    return roomId;
  })();
}

export function listInventory(db: Database.Database, accountId: number): InventoryItem[] {
  return db
    .prepare("SELECT id, def_id AS defId FROM furni_items WHERE owner_id = ? AND room_id IS NULL")
    .all(accountId) as InventoryItem[];
}

export function listRoomFurni(db: Database.Database, roomId: number): FurniItem[] {
  return db
    .prepare(
      "SELECT id, def_id AS defId, x, y, z, dir, state FROM furni_items WHERE room_id = ? AND wall_side IS NULL",
    )
    .all(roomId) as FurniItem[];
}

export function listRoomWallFurni(db: Database.Database, roomId: number): WallItem[] {
  return db
    .prepare(
      "SELECT id, def_id AS defId, wall_side AS side, x, y, wall_u AS u, wall_v AS v, state" +
        " FROM furni_items WHERE room_id = ? AND wall_side IS NOT NULL",
    )
    .all(roomId) as WallItem[];
}

export function placeItem(
  db: Database.Database,
  itemId: number,
  roomId: number,
  x: number,
  y: number,
  z: number,
  dir: number,
): void {
  db.prepare("UPDATE furni_items SET room_id = ?, x = ?, y = ?, z = ?, dir = ? WHERE id = ?").run(
    roomId,
    x,
    y,
    z,
    dir,
    itemId,
  );
}

export function placeWallItem(
  db: Database.Database,
  itemId: number,
  roomId: number,
  side: WallSide,
  x: number,
  y: number,
  u: number,
  v: number,
): void {
  db.prepare(
    "UPDATE furni_items SET room_id = ?, x = ?, y = ?, z = NULL, dir = NULL," +
      " wall_side = ?, wall_u = ?, wall_v = ? WHERE id = ?",
  ).run(roomId, x, y, side, u, v, itemId);
}

/** Clears both coordinate spaces: an item taken off a wall must not keep wall columns that would
 *  make it reappear there the next time it is placed on the floor. */
export function pickupItem(db: Database.Database, itemId: number): void {
  db.prepare(
    "UPDATE furni_items SET room_id = NULL, x = NULL, y = NULL, z = NULL, dir = NULL," +
      " wall_side = NULL, wall_u = NULL, wall_v = NULL WHERE id = ?",
  ).run(itemId);
}

export function updateItemZ(db: Database.Database, itemId: number, z: number): void {
  db.prepare("UPDATE furni_items SET z = ? WHERE id = ?").run(z, itemId);
}

/** `side` is what tells the two surfaces apart: non-null means the item is hanging, and its z and
 *  dir are meaningless. */
export function getItem(
  db: Database.Database,
  itemId: number,
): (FurniItem & { ownerId: number; roomId: number | null; side: WallSide | null }) | null {
  const row = db
    .prepare(
      "SELECT id, def_id AS defId, owner_id AS ownerId, room_id AS roomId, x, y, z, dir, state," +
        " wall_side AS side FROM furni_items WHERE id = ?",
    )
    .get(itemId) as
    | (FurniItem & { ownerId: number; roomId: number | null; side: WallSide | null })
    | undefined;
  return row ?? null;
}
