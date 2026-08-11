import { randomBytes } from "node:crypto";
import {
  PROTOTYPE_CATALOG,
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
import { GROUNDS, GROUNDS_ROOM_ID } from "./grounds.ts";
import { NPC_ROSTER } from "./npc.ts";
import { reachable } from "./pathfind.ts";

// House-placed layouts for the public rooms (#312). The Lobby Café and The Casino Floor shipped
// with heightmaps, decor and staff but a bare floor, so neither read as a place anyone works or
// plays in. Both are laid out here the way the stock suite is (items.ts): coordinates by hand,
// every one of them run through the same placement checker the live server uses, so a layout that
// disagrees with the rules fails at boot rather than arriving as a broken room.

export interface Spot {
  defId: string;
  x: number;
  y: number;
  dir?: 0 | 2 | 4 | 6;              // 0=N, 2=E, 4=S, 6=W; a seat faces the way it faces
}
export interface Hanging {
  defId: string;
  side: WallSide;
  x: number;
  y: number;
  u: number;
  v: number;
}
export interface Layout {
  floor: Spot[];
  walls: Hanging[];
}

/** What the house may put in a room it laid out itself. ROOM_FURNI_CAP stays 100 and is untouched
 *  (#404): that is the bound on what a *player* may add, and lowering the ceiling on a flagship is
 *  not a reason to raise the ceiling on every bedroom. The Resort Grounds is 90,000 tiles and 285
 *  pieces, so it also means players cannot add furni there while it sits over the player cap —
 *  deliberate, and the reason the room is house-laid rather than left for a crowd to fill. */
const HOUSE_FURNI_CAP = 300;

// 16x16, flat, door at (0,5), with a void alcove cut out of the north-east corner and two void
// columns at y=9. Zoned the way a Habbo public room is, so the floor reads as places rather than
// one field of furniture: the counter run and its back bar take the whole north wall with Maya
// working the lane at y=2 between them — the welcome quest promises a first coffee at the café
// counter, so there has to be one — the run ends at the wash basin by the alcove mouth, the alcove
// holds a quiet marble table, four table clusters fill the middle in two rows, and the lounge takes
// the south-west corner. Aisles are two tiles everywhere: y 5-6 in from the door, x 7-8 between the
// cluster columns, y 8-10 between their rows, with the vending machine on the west wall in the last
// of them.
const CAFE: Layout = {
  floor: [
    { defId: "lamp_basic", x: 0, y: 0 },
    { defId: "shelf_basic", x: 5, y: 1, dir: 4 },              // back bar, behind Maya
    { defId: "shelf_basic", x: 7, y: 1, dir: 4 },
    { defId: "shelf_basic", x: 9, y: 1, dir: 4 },
    { defId: "cafe_counter", x: 4, y: 3, dir: 4 },             // coffee, 1 Star, off the def (#347)
    { defId: "cafe_counter", x: 6, y: 3, dir: 4 },
    { defId: "cafe_counter", x: 8, y: 3, dir: 4 },
    { defId: "cafe_counter", x: 10, y: 3, dir: 4 },
    { defId: "sink_basic", x: 12, y: 3 },                      // the wash basin ends the run
    { defId: "stool_lodge", x: 4, y: 4 },                      // counter seats, facing the bar
    { defId: "stool_lodge_charcoal", x: 6, y: 4 },
    { defId: "stool_lodge", x: 8, y: 4 },
    { defId: "stool_lodge_charcoal", x: 10, y: 4 },
    { defId: "stereo_basic", x: 15, y: 4, dir: 6 },
    { defId: "cafe_table_marble", x: 13, y: 5 },
    { defId: "cafe_chair_navy", x: 12, y: 5, dir: 2 },
    { defId: "cafe_chair_crimson", x: 14, y: 5, dir: 6 },
    { defId: "cafe_table", x: 5, y: 7 },                       // table clusters, two by two
    { defId: "cafe_chair_crimson", x: 4, y: 7, dir: 2 },
    { defId: "cafe_chair_navy", x: 6, y: 7, dir: 6 },
    { defId: "cafe_table", x: 10, y: 7 },
    { defId: "cafe_chair_navy", x: 9, y: 7, dir: 2 },
    { defId: "cafe_chair_crimson", x: 11, y: 7, dir: 6 },
    { defId: "vending_machine", x: 0, y: 9 },                  // cola, on the aisle wall (#347)
    { defId: "cafe_table", x: 5, y: 11 },
    { defId: "cafe_chair_navy", x: 4, y: 11, dir: 2 },
    { defId: "cafe_chair_crimson", x: 6, y: 11, dir: 6 },
    { defId: "cafe_table", x: 10, y: 11 },
    { defId: "cafe_chair_crimson", x: 9, y: 11, dir: 2 },
    { defId: "cafe_chair_navy", x: 11, y: 11, dir: 6 },
    { defId: "table_round", x: 13, y: 12 },
    { defId: "cafe_chair_crimson", x: 12, y: 12, dir: 2 },
    { defId: "cafe_chair_navy", x: 14, y: 12, dir: 6 },
    { defId: "fireplace", x: 1, y: 11 },                       // the lounge, around its hearth
    { defId: "rug_lodge", x: 1, y: 12 },                       // covers x 1-2, y 12-13
    { defId: "table_round", x: 2, y: 12 },                     // stands on the rug
    { defId: "armchair_lounge", x: 4, y: 12, dir: 6 },
    { defId: "armchair_lounge_navy", x: 4, y: 13, dir: 6 },
    { defId: "sofa_lodge", x: 1, y: 14 },                      // facing the fire across the rug
    { defId: "plant_fern", x: 0, y: 15 },
  ],
  walls: [
    { defId: "wall_art", side: "right", x: 2, y: 0, u: 2, v: 35 },
    { defId: "poster", side: "right", x: 4, y: 0, u: 4, v: 34 },
    { defId: "wall_art", side: "right", x: 7, y: 0, u: 2, v: 35 },
    { defId: "wall_shelf", side: "right", x: 10, y: 0, u: 0, v: 46 },
    { defId: "wall_clock", side: "right", x: 11, y: 0, u: 2, v: 36 },
    // The alcove's own back wall, three tiles further south than the rest of the north run.
    { defId: "wall_art_gilded", side: "right", x: 13, y: 3, u: 2, v: 35 },
    { defId: "antlers", side: "right", x: 14, y: 3, u: 0, v: 24 },
    { defId: "poster", side: "right", x: 15, y: 3, u: 4, v: 34 },
    { defId: "wall_art", side: "left", x: 0, y: 2, u: 2, v: 35 },
    { defId: "poster", side: "left", x: 0, y: 8, u: 4, v: 34 },
    { defId: "wall_art", side: "left", x: 0, y: 13, u: 2, v: 35 },
  ],
};

// 20x20, door at (0,6). The stage platform at x 8-13, y 2-7 is a ring at height 1 around a 2x2
// core at height 2, where Lola Vale sings; the bar stands on the raised terrace at x 16-19,
// y 12-19. Furniture cannot straddle a height change, so every piece sits wholly on the floor,
// wholly on the stage ring, or wholly on the terrace. The north wall carries the two slot banks
// split by dividers, with the vending machine standing in the gap between them at the same height
// as the slots, the card pit fills the south in a two-by-two of tables with a two-tile lane
// at x 9-10 and y 15-16, and the billiards nook and arcades take the south-west corner. The Grand
// Wheel stands on the east strip at y 9, on flat ground two rows north of where the terrace
// starts. The concourse in from the door — x 0-7, y 3-11 — stays open: that is where a crowd
// stands.
const CASINO: Layout = {
  floor: [
    { defId: "slot_machine", x: 3, y: 0, dir: 4 },             // west slot bank
    { defId: "slot_machine", x: 4, y: 0, dir: 4 },
    { defId: "slot_machine", x: 5, y: 0, dir: 4 },
    { defId: "slot_machine", x: 6, y: 0, dir: 4 },
    { defId: "divider_basic", x: 7, y: 0 },
    { defId: "vending_machine", x: 12, y: 0 },                 // cola, the gap between the banks
    { defId: "divider_basic_plum", x: 13, y: 0 },
    { defId: "slot_machine", x: 15, y: 0, dir: 4 },            // east slot bank
    { defId: "slot_machine", x: 16, y: 0, dir: 4 },
    { defId: "slot_machine", x: 17, y: 0, dir: 4 },
    { defId: "slot_machine", x: 18, y: 0, dir: 4 },
    { defId: "stereo_basic", x: 8, y: 2, dir: 4 },             // the stage, all on the ring
    { defId: "penthouse_candelabra", x: 9, y: 4 },             // either side of Lola
    { defId: "penthouse_candelabra", x: 12, y: 4 },
    { defId: "rug_basic", x: 8, y: 6 },                        // covers x 8-10, y 6-7
    { defId: "railing", x: 9, y: 9 },                          // apron rail, either side of the
    { defId: "railing_iron", x: 12, y: 9 },                    // centrepiece below the stage
    { defId: "fountain_gilded", x: 10, y: 9 },
    { defId: "casino_table_onyx", x: 16, y: 4 },               // high-roller table, north-east
    { defId: "casino_stool_fern", x: 15, y: 4, dir: 2 },
    { defId: "casino_stool_fern", x: 15, y: 5, dir: 2 },
    { defId: "casino_stool_fern", x: 18, y: 4, dir: 6 },
    { defId: "casino_stool_fern", x: 18, y: 5, dir: 6 },
    { defId: "railing_iron", x: 4, y: 13 },                    // the card pit's west rail
    { defId: "railing_iron", x: 4, y: 14 },
    { defId: "railing_iron", x: 4, y: 17 },
    { defId: "railing_iron", x: 4, y: 18 },
    // The blackjack table (#428), in the pit's north-west slot with its four stools. Its dealer
    // works the tile at (7,12), north of the felt where the chip tray is — that tile is left open
    // for Whitmore and assertOpen refuses the layout if anything ever covers it.
    { defId: "blackjack_table", x: 6, y: 13 },
    { defId: "casino_stool", x: 5, y: 13, dir: 2 },
    { defId: "casino_stool", x: 5, y: 14, dir: 2 },
    { defId: "casino_stool", x: 8, y: 13, dir: 6 },
    { defId: "casino_stool", x: 8, y: 14, dir: 6 },
    { defId: "casino_table_onyx", x: 12, y: 13 },
    { defId: "casino_stool_fern", x: 11, y: 13, dir: 2 },
    { defId: "casino_stool_fern", x: 11, y: 14, dir: 2 },
    { defId: "casino_stool_fern", x: 14, y: 13, dir: 6 },
    { defId: "casino_stool_fern", x: 14, y: 14, dir: 6 },
    { defId: "casino_table", x: 6, y: 17 },
    { defId: "casino_stool", x: 5, y: 17, dir: 2 },
    { defId: "casino_stool", x: 5, y: 18, dir: 2 },
    { defId: "casino_stool", x: 8, y: 17, dir: 6 },
    { defId: "casino_stool", x: 8, y: 18, dir: 6 },
    { defId: "casino_table_onyx", x: 12, y: 17 },
    { defId: "casino_stool_fern", x: 11, y: 17, dir: 2 },
    { defId: "casino_stool_fern", x: 11, y: 18, dir: 2 },
    { defId: "casino_stool_fern", x: 14, y: 17, dir: 6 },
    { defId: "casino_stool_fern", x: 14, y: 18, dir: 6 },
    { defId: "arcade_cabinet", x: 1, y: 15, dir: 4 },          // south-west nook
    { defId: "arcade_cabinet_plum", x: 2, y: 15, dir: 4 },
    { defId: "billiards_table", x: 1, y: 17 },                 // covers x 1-3, y 17-18
    { defId: "shelf_basic", x: 16, y: 12, dir: 4 },            // the terrace bar, y=13 its lane
    { defId: "shelf_basic", x: 18, y: 12, dir: 4 },
    { defId: "bar_counter", x: 16, y: 14, dir: 4 },
    { defId: "bar_counter", x: 18, y: 14, dir: 4 },
    { defId: "stool_lodge", x: 16, y: 15 },
    { defId: "stool_lodge_charcoal", x: 17, y: 15 },
    { defId: "stool_lodge", x: 18, y: 15 },
    { defId: "sofa_lodge", x: 16, y: 17, dir: 4 },             // terrace lounge, around its hearth
    { defId: "fireplace_stone", x: 18, y: 17 },
    { defId: "rug_basic", x: 17, y: 18 },                      // covers x 17-19, y 18-19
    // The Grand Wheel (#429) on the east strip, clear of the terrace's first raised row at y 12.
    // The casino was at the #315 density ceiling — one piece per 6-8 walkable tiles — so the two
    // pieces carrying the least went out to make room: the lone side table at (14,5), which served
    // nothing, and the fourth bar stool at (19,15), the last of a row of four. Neither breaks a
    // pair, which is why they went rather than a railing or a stool off the high-roller table.
    // dir 0 for the lit face: the disc's normal runs along fy, and only dirs 0 and 4 turn it into
    // the light — dirs 2 and 6 render the shaded side, a dark red plate on the room's landmark.
    // Both of those lay the 2x1 along x, so the wheel takes (18,9) and (19,9) and the odds board
    // stands down-left of it at (17,10), where it reads beside the wheel instead of behind it.
    { defId: "grand_wheel", x: 18, y: 9, dir: 0 },
    { defId: "wheel_podium", x: 17, y: 10 },
    { defId: "lamp_basic", x: 1, y: 3 },
    { defId: "plant_fern", x: 1, y: 10 },
    // Moved off (19,8) for the wheel: it stood on one of the tiles a player has to bet from, and
    // a 3.625-unit wheel one tile south of it would have swallowed the fern whole anyway.
    { defId: "plant_fern_exotic", x: 19, y: 6 },
  ],
  walls: [
    // High enough to clear a 2-height slot machine standing under it.
    { defId: "wall_art_gilded", side: "right", x: 4, y: 0, u: 2, v: 30 },
    { defId: "wall_art", side: "right", x: 10, y: 0, u: 2, v: 35 },
    { defId: "wall_art_gilded", side: "right", x: 16, y: 0, u: 2, v: 30 },
    { defId: "wall_clock", side: "right", x: 18, y: 0, u: 2, v: 36 },  // nearest wall to the bar
    { defId: "poster", side: "left", x: 0, y: 4, u: 4, v: 34 },
    { defId: "wall_art", side: "left", x: 0, y: 10, u: 2, v: 35 },
    { defId: "wall_art_gilded", side: "left", x: 0, y: 16, u: 2, v: 30 },
  ],
};

export const LAYOUTS: ReadonlyMap<number, Layout> = new Map([
  [1, CAFE],
  [2, CASINO],
  [GROUNDS_ROOM_ID, GROUNDS],
]);

/** Bumped whenever a Layout constant above changes shape. seedRoom (db.ts) stamps this into the
 *  room doc and compares it like the heightmap, so a layout-only edit re-lays the room even though
 *  the floor and decor never moved — #330: #323's items (wall_clock, antlers, rug_lodge,
 *  stool_lodge, side_table) landed in the catalog after #315's resize had already run the layouts,
 *  so nothing short of a version bump would have put them in a live room. This bump is the first.
 *  2 is #347: the café's counters became café counters, the fixtures the use verb needs went in,
 *  and a live room would otherwise keep serving cocktails at a coffee bar.
 *  3 is #406: the Resort Grounds joined LAYOUTS. Nothing in the café or the casino moved, but the
 *  stamp is per room and a room seeded at version 2 would never be handed the new one's layout.
 *  4 is #409: the Resort Grounds went 300x300 to 200x200 and its whole layout moved 50 rows north
 *  with it. The heightmap changed too, so seedRoom would re-lay the room on that alone — the bump
 *  is what makes the two agree instead of leaving the layout stamp claiming the old plan.
 *  5 is #428: the casino's north-west card table became the blackjack table. A live hotel would
 *  otherwise keep a plain casino_table in the slot the dealer stands at, and the one table in the
 *  building you can actually play would exist in no room that had already been seeded.
 *  6 is #429: the Grand Wheel and its odds board went onto the casino's east strip and the exotic
 *  fern moved off a tile the wheel needs to be bet from. A live hotel would otherwise have the
 *  handler, the message and the art for a wheel that stands in no room. */
export const LAYOUT_VERSION = 6;

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

/** Every tile the layout leaves open has to still be walkable to from the door, under the same
 *  movement rules the players walk by rather than a second opinion. A layout that seals off a
 *  corner — or buries a staff NPC where nobody can order from them — fails the seed the way an
 *  unwalkable heightmap fails the parse.
 *
 *  One flood-fill answers the whole room. This used to run A* per tile, which is fine at 16x16 and
 *  hangs boot at 300x300 (#406). */
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
  const open = reachable(model, blocked, { x: model.door.x, y: model.door.y });
  for (let y = 0; y < model.height; y++) {
    for (let x = 0; x < model.width; x++) {
      if (tileHeight(model, x, y) < 0 || blocked(x, y)) continue;
      if (open[y * model.width + x] === 1) continue;
      throw new Error(`room ${roomId}: tile ${x},${y} is walled off from the door`);
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
        doorTile: { x: model.door.x, y: model.door.y }, roomFurniCap: HOUSE_FURNI_CAP,
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
          furniCount: placed.length + hung.length, roomFurniCap: HOUSE_FURNI_CAP,
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

/** Takes the house's own layout back out of a public room, for a room whose floor has been redrawn
 *  under it (#315). House furni is locked and house-owned; a player's item in a public room is
 *  neither, so it stays exactly where the player put it. */
export function clearHouseLayout(db: Database.Database, roomId: number): void {
  db.prepare(
    "DELETE FROM furni_items WHERE room_id = ? AND locked = 1 AND owner_id =" +
      " (SELECT id FROM accounts WHERE username = ?)",
  ).run(roomId, HOUSE_USERNAME);
}

/** Furnishes any public room that is still bare. A room with anything in it is left exactly as it
 *  is — the layout is a starting point, not a nightly reset, so a room somebody has rearranged is
 *  never stomped. `relaid` names the rooms whose heightmap just changed: their house layout has
 *  already been cleared, and the new floor gets laid out over whatever the players left behind. */
export function seedPublicFurni(db: Database.Database, relaid: ReadonlySet<number>): void {
  for (const [roomId, layout] of LAYOUTS) {
    const taken = db.prepare("SELECT 1 FROM furni_items WHERE room_id = ? LIMIT 1").get(roomId);
    if (taken && !relaid.has(roomId)) continue;
    furnish(db, roomId, layout);
  }
}
