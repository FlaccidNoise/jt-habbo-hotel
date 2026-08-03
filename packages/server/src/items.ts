import { PROTOTYPE_CATALOG } from "@grand/shared";
import type { InventoryItem, FurniItem } from "@grand/shared";
import type Database from "better-sqlite3";

export function grantStarter(db: Database.Database, accountId: number): void {
  const row = db.prepare("SELECT starter_granted FROM accounts WHERE id = ?").get(accountId) as
    | { starter_granted: number }
    | undefined;
  if (!row || row.starter_granted) return;

  const insert = db.prepare(
    "INSERT INTO furni_items (def_id, owner_id, room_id, x, y, z, dir, state) VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, 0)",
  );
  const grant = db.transaction(() => {
    for (const def of PROTOTYPE_CATALOG) insert.run(def.id, accountId);
    db.prepare("UPDATE accounts SET starter_granted = 1 WHERE id = ?").run(accountId);
  });
  grant();
}

export function listInventory(db: Database.Database, accountId: number): InventoryItem[] {
  return db
    .prepare("SELECT id, def_id AS defId FROM furni_items WHERE owner_id = ? AND room_id IS NULL")
    .all(accountId) as InventoryItem[];
}

export function listRoomFurni(db: Database.Database, roomId: number): FurniItem[] {
  return db
    .prepare("SELECT id, def_id AS defId, x, y, z, dir, state FROM furni_items WHERE room_id = ?")
    .all(roomId) as FurniItem[];
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

export function pickupItem(db: Database.Database, itemId: number): void {
  db.prepare(
    "UPDATE furni_items SET room_id = NULL, x = NULL, y = NULL, z = NULL, dir = NULL WHERE id = ?",
  ).run(itemId);
}

export function updateItemZ(db: Database.Database, itemId: number, z: number): void {
  db.prepare("UPDATE furni_items SET z = ? WHERE id = ?").run(z, itemId);
}

export function getItem(
  db: Database.Database,
  itemId: number,
): (FurniItem & { ownerId: number; roomId: number | null }) | null {
  const row = db
    .prepare(
      "SELECT id, def_id AS defId, owner_id AS ownerId, room_id AS roomId, x, y, z, dir, state FROM furni_items WHERE id = ?",
    )
    .get(itemId) as (FurniItem & { ownerId: number; roomId: number | null }) | undefined;
  return row ?? null;
}
