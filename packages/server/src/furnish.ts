import { randomBytes } from "node:crypto";
import {
  PROTOTYPE_CATALOG,
  ROOM_FURNI_CAP,
  WALL_CATALOG,
  checkPlacement,
  checkWallPlacement,
  footprintTiles,
  parseHeightmap,
  tileHeight,
} from "@grand/shared";
import type {
  Door, FurniDef, FurniItem, RoomModel, WallDef, WallItem, WallSide,
} from "@grand/shared";
import type Database from "better-sqlite3";
import { NPC_ROSTER } from "./npc.ts";
import { findPath } from "./pathfind.ts";

// House-placed layouts for the public rooms (#312). The Lobby Café and The Casino Floor shipped
// with heightmaps, decor and staff but a bare floor, so neither read as a place anyone works or
// plays in. Both are laid out here the way the stock suite is (items.ts): coordinates by hand,
// every one of them run through the same placement checker the live server uses, so a layout that
// disagrees with the rules fails at boot rather than arriving as a broken room.

interface Spot {
  defId: string;
  x: number;
  y: number;
  dir?: 0 | 2 | 4 | 6;              // 0=N, 2=E, 4=S, 6=W; a seat faces the way it faces
}
interface Hanging {
  defId: string;
  side: WallSide;
  x: number;
  y: number;
  u: number;
  v: number;
}
interface Layout {
  floor: Spot[];
  walls: Hanging[];
}

// 10x10, flat, door at (0,5). Maya works the counter run at y=3 with the back shelf behind her —
// the welcome quest promises a first coffee at the café counter, so there has to be one. The door
// aisle (y=5) and the middle of the floor stay clear: that is the hangout floor.
const CAFE: Layout = {
  floor: [
    { defId: "lamp_basic", x: 0, y: 0 },
    { defId: "shelf_basic", x: 7, y: 1, dir: 4 },              // back bar, behind Maya
    { defId: "bar_counter", x: 6, y: 3, dir: 4 },
    { defId: "bar_counter", x: 8, y: 3, dir: 4 },
    { defId: "cafe_chair", x: 6, y: 4 },                       // counter seats, facing the bar
    { defId: "cafe_chair_navy", x: 7, y: 4 },
    { defId: "cafe_chair_crimson", x: 8, y: 4 },
    { defId: "cafe_table", x: 2, y: 3 },
    { defId: "cafe_chair_crimson", x: 1, y: 3, dir: 2 },
    { defId: "cafe_chair_navy", x: 3, y: 3, dir: 6 },
    { defId: "cafe_table", x: 2, y: 7 },
    { defId: "cafe_chair_crimson", x: 1, y: 7, dir: 2 },
    { defId: "cafe_chair_navy", x: 3, y: 7, dir: 6 },
    { defId: "cafe_table_marble", x: 6, y: 7 },
    { defId: "cafe_chair_navy", x: 5, y: 7, dir: 2 },
    { defId: "cafe_chair_crimson", x: 7, y: 7, dir: 6 },
    { defId: "stereo_basic", x: 9, y: 6, dir: 6 },
    { defId: "plant_basic", x: 0, y: 9 },
    { defId: "plant_basic", x: 9, y: 9 },
  ],
  walls: [
    { defId: "wall_art", side: "right", x: 2, y: 0, u: 2, v: 35 },
    { defId: "poster", side: "right", x: 4, y: 0, u: 4, v: 34 },
    { defId: "wall_art", side: "right", x: 6, y: 0, u: 2, v: 35 },
    { defId: "wall_shelf", side: "right", x: 8, y: 0, u: 0, v: 46 },
    { defId: "wall_art", side: "left", x: 0, y: 2, u: 2, v: 35 },
    { defId: "poster", side: "left", x: 0, y: 7, u: 4, v: 34 },
  ],
};

// 12x12, door at (0,6), with the stage platform at x 4-7, y 2-5 — a ring at height 1 around a 2x2
// core at height 2, where Lola Vale sings. Furniture cannot straddle a height change, so the two
// candelabras take single ring tiles beside her and the fountain stays on the flat floor. The
// north wall carries the billiards nook and the slot row, split by the dividers; y=6 is the aisle
// in from the door, and x 5-6 is the two-tile lane between the south card tables.
const CASINO: Layout = {
  floor: [
    { defId: "billiards_table", x: 2, y: 0, dir: 4 },          // covers x 2-4, y 0-1
    { defId: "divider_basic", x: 5, y: 0 },
    { defId: "divider_basic_plum", x: 5, y: 1 },
    { defId: "slot_machine", x: 7, y: 0, dir: 4 },
    { defId: "slot_machine", x: 8, y: 0, dir: 4 },
    { defId: "slot_machine", x: 9, y: 0, dir: 4 },
    { defId: "slot_machine", x: 10, y: 0, dir: 4 },
    { defId: "penthouse_candelabra", x: 4, y: 3 },             // stage ring, either side of Lola
    { defId: "penthouse_candelabra", x: 7, y: 3 },
    { defId: "fountain_gilded", x: 10, y: 2 },
    { defId: "casino_table", x: 2, y: 7 },
    { defId: "casino_stool", x: 1, y: 7, dir: 2 },
    { defId: "casino_stool", x: 1, y: 8, dir: 2 },
    { defId: "casino_stool", x: 4, y: 7, dir: 6 },
    { defId: "casino_stool", x: 4, y: 8, dir: 6 },
    { defId: "casino_table_onyx", x: 8, y: 7 },
    { defId: "casino_stool_fern", x: 7, y: 7, dir: 2 },
    { defId: "casino_stool_fern", x: 7, y: 8, dir: 2 },
    { defId: "casino_stool_fern", x: 10, y: 7, dir: 6 },
    { defId: "casino_stool_fern", x: 10, y: 8, dir: 6 },
    { defId: "bar_counter", x: 2, y: 10, dir: 4 },
    { defId: "bar_counter", x: 8, y: 10, dir: 4 },
  ],
  walls: [
    // High enough to clear a 2-height slot machine standing under it.
    { defId: "wall_art_gilded", side: "right", x: 3, y: 0, u: 2, v: 30 },
    { defId: "wall_art_gilded", side: "right", x: 8, y: 0, u: 2, v: 30 },
    { defId: "wall_art_gilded", side: "left", x: 0, y: 3, u: 2, v: 35 },
  ],
};

const LAYOUTS: ReadonlyMap<number, Layout> = new Map([
  [1, CAFE],
  [2, CASINO],
]);

const DEFS: ReadonlyMap<string, FurniDef> = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
const WALL_DEFS: ReadonlyMap<string, WallDef> = new Map(WALL_CATALOG.map((d) => [d.id, d]));

/** `furni_items.owner_id` is NOT NULL and points at `accounts`, so the hotel needs an account row
 *  of its own to own what it puts in the public rooms. The name carries a space, which
 *  registration's charset forbids, and the stored hash is random bytes no password derives — the
 *  row exists to satisfy the foreign key, not to be signed into. */
const HOUSE_USERNAME = "The Grand";

function houseAccount(db: Database.Database): number {
  db.prepare(
    "INSERT OR IGNORE INTO accounts (username, username_normalized, pw_hash, pw_salt, pw_params," +
      " created_at) VALUES (?, ?, ?, ?, 'house', ?)",
  ).run(HOUSE_USERNAME, HOUSE_USERNAME, randomBytes(64), randomBytes(16), Date.now());
  const row = db.prepare("SELECT id FROM accounts WHERE username = ?").get(HOUSE_USERNAME) as
    | { id: number }
    | undefined;
  if (!row) throw new Error("the house account went missing right after it was written");
  return row.id;
}

function defOf(defId: string, roomId: number): FurniDef {
  const def = DEFS.get(defId);
  if (!def) throw new Error(`room ${roomId} layout names an unknown furni def: ${defId}`);
  return def;
}

/** The tiles nobody can stand on once the layout is down — the same rule the live room indexes by,
 *  so this sees exactly what a walker would. */
function solidTiles(roomId: number, placed: FurniItem[]): (x: number, y: number) => boolean {
  const solid = new Set<string>();
  for (const item of placed) {
    const def = defOf(item.defId, roomId);
    if (def.canWalk) continue;
    for (const t of footprintTiles(def, item.x, item.y, item.dir)) solid.add(`${t.x},${t.y}`);
  }
  return (x, y) => solid.has(`${x},${y}`);
}

/** Every tile the layout leaves open has to still be walkable to from the door, asked of the
 *  pathfinder the players use rather than a second opinion. A layout that seals off a corner —
 *  or buries a staff NPC where nobody can order from them — fails the seed the way an unwalkable
 *  heightmap fails the parse. */
function assertOpen(model: RoomModel, roomId: number, placed: FurniItem[]): void {
  const blocked = solidTiles(roomId, placed);
  for (const npc of NPC_ROSTER) {
    if (npc.roomId !== roomId) continue;
    if (blocked(npc.post.x, npc.post.y)) {
      throw new Error(
        `room ${roomId}: ${npc.name} stands inside the furniture at ${npc.post.x},${npc.post.y}`,
      );
    }
  }
  const door = { x: model.door.x, y: model.door.y };
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) {
      if (tileHeight(model, x, y) < 0 || blocked(x, y)) continue;
      if (x === door.x && y === door.y) continue;
      if (!findPath(model, blocked, door, { x, y })) {
        throw new Error(`room ${roomId}: tile ${x},${y} is walled off from the door`);
      }
    }
  }
}

function furnish(db: Database.Database, roomId: number, layout: Layout): void {
  const row = db.prepare("SELECT doc FROM rooms WHERE id = ?").get(roomId) as
    | { doc: string }
    | undefined;
  if (!row) throw new Error(`cannot furnish room ${roomId}: it is not seeded`);
  const doc = JSON.parse(row.doc) as { heightmap: string; door: Door };
  const model = parseHeightmap(doc.heightmap, doc.door);
  const owner = houseAccount(db);

  // locked, like a museum donation (#210): the house arranges the public rooms, and nobody picks
  // a piece of them up or turns it around.
  const insert = db.prepare(
    "INSERT INTO furni_items (def_id, owner_id, room_id, x, y, z, dir, state, locked)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)",
  );
  const hang = db.prepare(
    "INSERT INTO furni_items (def_id, owner_id, room_id, x, y, wall_side, wall_u, wall_v," +
      " state, locked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 1)",
  );

  db.transaction(() => {
    const placed: FurniItem[] = [];
    for (const spot of layout.floor) {
      const def = defOf(spot.defId, roomId);
      const dir = spot.dir ?? 0;
      const ctx = {
        model, furni: placed, defs: DEFS, avatars: [],
        doorTile: { x: model.door.x, y: model.door.y }, roomFurniCap: ROOM_FURNI_CAP,
      };
      const result = checkPlacement(ctx, def, spot.x, spot.y, dir);
      if (!result.ok) {
        throw new Error(`room ${roomId}: ${spot.defId} at ${spot.x},${spot.y} is ${result.code}`);
      }
      const id = Number(
        insert.run(spot.defId, owner, roomId, spot.x, spot.y, result.z, dir).lastInsertRowid,
      );
      placed.push({ id, defId: spot.defId, x: spot.x, y: spot.y, z: result.z, dir, state: 0 });
    }

    const hung: WallItem[] = [];
    for (const item of layout.walls) {
      const def = WALL_DEFS.get(item.defId);
      if (!def) throw new Error(`room ${roomId} layout names an unknown wall def: ${item.defId}`);
      const result = checkWallPlacement(
        {
          model, wallFurni: hung, defs: WALL_DEFS,
          furniCount: placed.length + hung.length, roomFurniCap: ROOM_FURNI_CAP,
        },
        def, item.side, item.x, item.y, item.u, item.v,
      );
      if (!result.ok) {
        throw new Error(
          `room ${roomId}: ${item.defId} on the ${item.side} wall at ${item.x},${item.y} is ${result.code}`,
        );
      }
      const id = Number(
        hang
          .run(item.defId, owner, roomId, item.x, item.y, item.side, item.u, item.v)
          .lastInsertRowid,
      );
      hung.push({ ...item, id, state: 0 });
    }

    assertOpen(model, roomId, placed);
  })();
}

/** Furnishes any public room that is still bare. A room with anything in it is left exactly as it
 *  is — the layout is a starting point, not a nightly reset, so a room somebody has rearranged is
 *  never stomped. */
export function seedPublicFurni(db: Database.Database): void {
  for (const [roomId, layout] of LAYOUTS) {
    const taken = db.prepare("SELECT 1 FROM furni_items WHERE room_id = ? LIMIT 1").get(roomId);
    if (taken) continue;
    furnish(db, roomId, layout);
  }
}
