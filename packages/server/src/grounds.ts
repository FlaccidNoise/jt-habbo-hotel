import type { Door, RoomDecor } from "@grand/shared";
import type { ChatConfig } from "./db.ts";
import type { Hanging, Layout, Spot } from "./furnish.ts";

// The Resort Grounds (#406): the flagship public room, and the first one too big to write down.
// 300x300 is 90,000 tiles, so the floor is painted here by rect fills and the layout laid by
// modular rhythms — a heightmap literal that size is neither readable nor reviewable, and a hand
// list of 260 coordinates drifts out of step with the floor under it the first time either moves.
// Nothing is random: the same constants build the same room on every boot, which is the whole
// reason LAYOUT_VERSION can mean anything.
//
// #406 asked for room 3. MUSEUM_ROOM_ID is already 3 and every donation row points at it, so the
// grounds take 4 instead — renumbering a room that holds player property to free an id is not a
// trade worth making.
export const GROUNDS_ROOM_ID = 4;

const W = 300;
const H = 300;
const VOID = -1;

const tiles = new Int8Array(W * H);

/** Inclusive rect fill. The whole floor is drawn with this: terraces at height 1, hedges at VOID,
 *  and lawn left at the 0 the array starts on. */
function paint(x0: number, y0: number, x1: number, y1: number, h: number): void {
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) tiles[y * W + x] = h;
}

function heightAt(x: number, y: number): number {
  return tiles[y * W + x] ?? VOID;
}

/** The border of a rect, interior untouched — a raised rim rather than a raised zone. Terracing is
 *  rationed: a raised tile costs two extra painter-sort nodes in the client's addTile, so the room
 *  spends them on the plaza edge, the pool surround, the stage and two viewing decks, and nowhere
 *  else. The lawn stays flat. */
function rim(x0: number, y0: number, x1: number, y1: number, h: number): void {
  paint(x0, y0, x1, y0, h);
  paint(x0, y1, x1, y1, h);
  paint(x0, y0, x0, y1, h);
  paint(x1, y0, x1, y1, h);
}

/** A rim's tiles in ring order, so a rhythm walked along one reads as evenly spaced instead of as
 *  four runs that restart at the corners. */
function rimTiles(x0: number, y0: number, x1: number, y1: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = [];
  for (let x = x0; x <= x1; x++) out.push({ x, y: y0 });
  for (let y = y0 + 1; y <= y1; y++) out.push({ x: x1, y });
  for (let x = x1 - 1; x >= x0; x--) out.push({ x, y: y1 });
  for (let y = y1 - 1; y > y0; y--) out.push({ x: x0, y });
  return out;
}

const floor: Spot[] = [];
const walls: Hanging[] = [];

function put(defId: string, x: number, y: number, dir: 0 | 2 | 4 | 6 = 0): void {
  floor.push({ defId, x, y, dir });
}

/** One def per step along a straight run, cycling `defIds`. Every repeating structure in the room
 *  is this — the colonnade, the lounger row, the apron rails — so a two-colour rhythm is a
 *  two-element array instead of a loop body with a parity test in it. */
function run(
  defIds: readonly string[], x: number, y: number, dx: number, dy: number, n: number,
  dir: 0 | 2 | 4 | 6 = 0,
): void {
  for (let i = 0; i < n; i++) put(defIds[i % defIds.length] ?? "", x + i * dx, y + i * dy, dir);
}

// ---------------------------------------------------------------------------------------------
// The floor.
//
// Hedges are void tiles. A void is a wall the room builds for itself, so a hedge run screens a zone
// and gives the tiles beside it wall faces to hang from. Every one of them is a run or an L, never
// a closed ring: parseHeightmap fails a seed that strands a single tile, and an alcove you cannot
// walk out of is a bug rather than a mood. Read each screen with the opening named beside it.

/** The plaza rim, and the four gaps that make it a place you walk into rather than climb. */
const PLAZA = { x0: 9, y0: 142, x1: 25, y1: 158 };
rim(PLAZA.x0, PLAZA.y0, PLAZA.x1, PLAZA.y1, 1);
paint(PLAZA.x0, 149, PLAZA.x0, 151, 0);
paint(PLAZA.x1, 149, PLAZA.x1, 151, 0);
paint(16, PLAZA.y0, 18, PLAZA.y0, 0);
paint(16, PLAZA.y1, 18, PLAZA.y1, 0);

/** The promenade: a five-tile lane at y 148-152 hedged on both sides from x 34 to x 176, with
 *  three four-tile gates through each hedge. The gates are the room's connective tissue — every
 *  zone hangs off one, and the corridors below line up with them. */
const PROM_GATES: ReadonlyArray<readonly [number, number]> = [[44, 47], [96, 99], [150, 153]];
for (const y of [147, 153]) {
  paint(34, y, 176, y, VOID);
  for (const [a, b] of PROM_GATES) paint(a, y, b, y, 0);
}

/** Pool courtyard: screened north, west and east, open south through the x 44-47 gate and around
 *  both screen ends at y 143-146. */
paint(38, 110, 92, 110, VOID);
paint(38, 110, 38, 142, VOID);
paint(92, 110, 92, 142, VOID);
rim(51, 117, 79, 133, 1);            // the pool curb
paint(82, 116, 90, 126, 1);          // east viewing deck, looking across the water

/** Jazz wing: the mirror of the courtyard, open north through the x 44-47 gate and around the
 *  screen ends at y 189-191. */
paint(38, 158, 38, 188, VOID);
paint(92, 158, 92, 188, VOID);
paint(42, 192, 88, 192, VOID);
paint(58, 164, 74, 172, 1);          // the stage
paint(44, 176, 52, 184, 1);          // west viewing deck, facing the stage

/** Gallery colonnade: two rows of single-tile columns four apart, with the gallery walk between
 *  them. The columns are what give the deco pieces a wall to stand against and the gallery its
 *  hangings — a 300x300 room has walls only at x 0 and y 0 otherwise. */
const COLUMNS: readonly number[] = [104, 108, 112, 116, 120, 124, 128, 132, 136, 140, 144];
for (const x of COLUMNS) {
  paint(x, 126, x, 126, VOID);
  paint(x, 138, x, 138, VOID);
}

/** Six corridors, two per promenade gate: parallel screens four apart, open at both ends, running
 *  north to the courtyard and gallery and south to the wing and the café. Walking between zones
 *  goes through these rather than across open lawn. */
for (const [x0, x1] of [[43, 48], [95, 100], [149, 154]] as const) {
  paint(x0, 140, x0, 146, VOID);
  paint(x1, 140, x1, 146, VOID);
  paint(x0, 154, x0, 160, VOID);
  paint(x1, 154, x1, 160, VOID);
}

/** Two nooks off the far end of the promenade, screened from it by the promenade hedge itself and
 *  open only on the side that faces away from it — north onto the lawn, south onto the lawn. */
paint(160, 141, 160, 146, VOID);
paint(172, 141, 172, 146, VOID);
paint(160, 154, 160, 159, VOID);
paint(172, 154, 172, 159, VOID);

/** The café's quiet corner: an L, open east and south. */
paint(116, 160, 116, 168, VOID);
paint(116, 160, 124, 160, VOID);

export const GROUNDS_HEIGHTMAP: string = Array.from({ length: H }, (_, y) => {
  let row = "";
  for (let x = 0; x < W; x++) {
    const h = heightAt(x, y);
    row += h < 0 ? "x" : String(h);
  }
  return row;
}).join("\n");

export const GROUNDS_DOOR: Door = { x: 0, y: 150, dir: 2 };
/** Outdoors and loud: the promenade is long enough that a normal voice has to carry further than
 *  it does indoors, and a resort lawn is the one public room where shouting across it is the point. */
export const GROUNDS_CHAT: ChatConfig = { speakRadius: 6, shoutAllowed: true };
/** Decor is room-wide (decor.ts), so the whole 300x300 takes one pair. Deck boards and spa tile
 *  are the pair that reads as ground rather than as a floor — the zones are told apart by what
 *  stands on them, which is the only lever a single-decor room has. */
export const GROUNDS_DECOR: RoomDecor = { floor: "floor_deck", wall: "wall_spa" };

// ---------------------------------------------------------------------------------------------
// Arrival plaza. The fountain sits at the centre of a sunken court; the rim carries a railing
// every fourth tile, which is what makes the step read as a balustrade rather than as a ledge.

put("fountain_gilded", 16, 149);
put("sofa_lodge", 16, 146, 4);
put("sofa_lodge", 16, 153, 0);
put("sofa_lodge_plum", 13, 149, 2);
put("sofa_lodge_plum", 20, 149, 6);
run(["potted_palm"], 11, 144, 12, 0, 2);
run(["potted_palm"], 11, 156, 12, 0, 2);
run(["potted_palm_teal"], 11, 150, 12, 0, 2);

const RIM_RAIL = rimTiles(PLAZA.x0, PLAZA.y0, PLAZA.x1, PLAZA.y1)
  .filter((t) => heightAt(t.x, t.y) === 1);
for (let i = 0; i < RIM_RAIL.length; i += 4) {
  const t = RIM_RAIL[i];
  if (t) put(i % 8 === 0 ? "railing" : "railing_iron", t.x, t.y);
}

// The approach, between the door and the rim. The lane at y 150 stays clear end to end.
put("sofa_lodge", 4, 147, 4);
put("sofa_lodge", 4, 153, 0);
run(["potted_palm"], 2, 145, 0, 10, 2);
run(["potted_palm_teal"], 7, 145, 0, 10, 2);
run(["lamp_deco"], 3, 148, 0, 4, 2);
run(["railing"], 8, 148, 0, 4, 2);

// The promenade's own planting, on its two outer lanes so the middle three stay a lane.
run(["potted_palm", "potted_palm_teal"], 36, 148, 20, 0, 7);
run(["potted_palm_teal", "potted_palm"], 36, 152, 20, 0, 7);

// ---------------------------------------------------------------------------------------------
// Pool courtyard. Cabanas along the north screen, loungers south, the bar and the tubs west, and
// the viewing deck east. Palms every eighth curb tile ring the water.

const POOL_RIM = rimTiles(51, 117, 79, 133);
for (let i = 0; i < POOL_RIM.length; i += 8) {
  const t = POOL_RIM[i];
  if (t) put(i % 16 === 0 ? "potted_palm" : "potted_palm_teal", t.x, t.y);
}
put("pool_ladder", 52, 120);
put("pool_ladder", 52, 130);
put("pool_ladder", 78, 120);
put("pool_ladder", 78, 130);

run(["cabana", "cabana_crimson"], 54, 112, 6, 0, 4);
run(["towel_rack", "towel_rack_linen"], 57, 112, 6, 0, 3);

// Loungers on a three-tile beat with a parasol dropped into every second pair of gaps.
run(["sun_lounger", "sun_lounger_crimson"], 52, 137, 3, 0, 9);
run(["parasol_table", "parasol_table_teal"], 53, 137, 6, 0, 4);

// The pool bar. Its lane at y 119 and the gaps between the deck chairs both reach the counter, so
// the vend rail is usable from either side of it.
run(["bar_counter_pool"], 42, 120, 2, 0, 3, 4);
run(["deck_chair", "deck_chair_navy", "deck_chair_crimson"], 42, 121, 2, 0, 3);
put("drinks_trolley", 48, 120);
put("drinks_trolley_sunset", 48, 122);
put("hot_tub", 42, 126);
put("hot_tub_cedar", 46, 126);
put("towel_rack_linen", 44, 126);

run(["deck_chair_navy", "deck_chair", "deck_chair_crimson"], 84, 118, 2, 0, 3);
put("parasol_table", 84, 121);
put("potted_palm", 83, 125);
put("potted_palm_teal", 89, 125);
run(["railing_iron"], 82, 117, 0, 3, 4);

// Below the deck, on the ground: the overflow row for when the curb is full.
run(["sun_lounger_crimson"], 84, 129, 3, 0, 3);
put("parasol_table_teal", 85, 129);

// ---------------------------------------------------------------------------------------------
// Jazz wing. The stage is the terrace; the band stands on it and the parquet boards are the apron
// they play over. Booths face it in two rows, and the west deck looks down the length of it.

put("speaker_column", 58, 164);
put("speaker_column_vintage", 74, 164);
run(["stage_light", "stage_light_plum"], 61, 164, 3, 0, 4);
put("grand_piano", 60, 166);
put("drum_kit", 65, 166);
put("double_bass", 69, 166);
put("double_bass_ebony", 71, 166);
put("mic_stand", 64, 169);
run(["stage_platform_parquet", "stage_platform"], 60, 170, 2, 0, 6);
run(["railing", "railing_iron"], 58, 174, 3, 0, 6);
put("stage_light", 56, 174);
put("stage_light_plum", 76, 174);

for (const x of [56, 66, 76, 86]) {
  put("velvet_booth", x, 177, 4);
  put("cocktail_table", x, 179);
  put("velvet_booth_charcoal", x, 181, 0);
  put("velvet_booth_plum", x, 186, 4);
  put("cocktail_table_walnut", x, 188);
}

put("velvet_booth", 46, 178, 4);
put("cocktail_table", 49, 178);
put("velvet_booth_plum", 46, 182, 4);
put("cocktail_table_walnut", 49, 182);
run(["railing", "railing_iron", "railing"], 44, 176, 0, 3, 3);

put("potted_palm", 40, 158);
put("potted_palm_teal", 90, 158);
put("potted_palm_teal", 40, 190);
put("potted_palm", 90, 190);

// ---------------------------------------------------------------------------------------------
// Penthouse gallery. Deco pieces stand against the columns on both sides of the walk, with a
// lighter rhythm down the middle of it so the walk itself is furnished without being blocked.

for (let i = 0; i < COLUMNS.length; i++) {
  const x = COLUMNS[i] ?? 0;
  const north = ["armoire_deco", "screen_deco", "armoire_deco_ivory", "screen_deco_jade"];
  const south = ["chaise_deco", "dresser_deco", "chaise_deco_crimson", "dresser_deco_navy"];
  put(north[i % north.length] ?? "", x, 124, 4);
  put(south[i % south.length] ?? "", x, 140, 0);
}
run(
  ["mirror_standing", "lamp_deco", "ottoman_deco", "barcart_deco", "mirror_standing_plum",
    "ottoman_deco_ivory"],
  106, 132, 4, 0, 10,
);
run(["ottoman_deco", "ottoman_deco_ivory"], 106, 136, 8, 0, 5);
put("vanity_deco", 104, 130, 4);
put("vanity_deco", 142, 134, 0);
run(["potted_palm"], 101, 127, 0, 10, 2);
run(["potted_palm_teal"], 148, 127, 0, 10, 2);
run(["lamp_deco"], 102, 132, 44, 0, 2);

// ---------------------------------------------------------------------------------------------
// Café corner. The counter run, the wash basin that ends it and the vending machine that starts it
// all front onto the open lane at y 165, and the stools are spaced so every counter tile keeps a
// walkable neighbour.

put("vending_machine", 102, 164);
run(["cafe_counter"], 104, 164, 2, 0, 4, 4);
put("sink_basic", 113, 164);
run(["shelf_basic"], 104, 162, 3, 0, 3, 4);
run(["cafe_chair_navy", "cafe_chair_crimson"], 104, 166, 2, 0, 4);

for (const x of [103, 111, 119, 127]) {
  put("cafe_table", x, 172);
  put("cafe_chair_navy", x - 1, 172, 2);
  put("cafe_chair_crimson", x + 1, 172, 6);
  put("cafe_table_marble", x, 178);
  put("cafe_chair_crimson", x - 1, 178, 2);
  put("cafe_chair_navy", x + 1, 178, 6);
  put("cafe_table", x, 184);
  put("cafe_chair_crimson", x - 1, 184, 2);
  put("cafe_chair_crimson", x + 1, 184, 6);
}

put("cafe_table_marble", 120, 164);
put("cafe_chair_navy", 119, 164, 2);
put("cafe_chair_crimson", 121, 164, 6);
put("potted_palm", 118, 162);
put("potted_palm_teal", 123, 167);
put("potted_palm", 101, 161);
put("potted_palm_teal", 140, 161);
put("potted_palm", 101, 185);

// ---------------------------------------------------------------------------------------------
// The two promenade nooks.

put("velvet_booth_charcoal", 164, 144, 4);
put("cocktail_table", 167, 144);
put("potted_palm", 162, 142);
put("potted_palm_teal", 170, 142);
put("chaise_deco", 164, 156, 4);
put("ottoman_deco", 167, 156);
put("lamp_deco", 162, 158);
put("mirror_standing", 170, 158);

// ---------------------------------------------------------------------------------------------
// Hangings. Only two runs of wall exist in the whole room — the x 0 edge behind the door, and the
// faces the gallery columns cut — so this is a handful of pieces in two places rather than the
// perimeter dressing an indoor room gets.

walls.push(
  { defId: "wall_art", side: "left", x: 0, y: 146, u: 2, v: 35 },
  { defId: "poster", side: "left", x: 0, y: 148, u: 4, v: 34 },
  { defId: "wallmirror_deco", side: "left", x: 0, y: 152, u: 4, v: 38 },
  { defId: "wall_art_gilded", side: "left", x: 0, y: 154, u: 2, v: 35 },
);
// A column at (x, 126) puts a wall on the west face of (x+1, 126); one at (x, 138) puts a wall on
// the north face of (x, 139). Both are checked by checkWallPlacement at seed time.
for (const [i, x] of [104, 112, 120, 128].entries()) {
  walls.push({
    defId: i % 2 === 0 ? "wall_art_gilded" : "wallmirror_deco",
    side: "left", x: x + 1, y: 126, u: i % 2 === 0 ? 2 : 4, v: i % 2 === 0 ? 35 : 38,
  });
}
for (const [i, x] of [108, 124, 140].entries()) {
  walls.push({
    defId: i % 2 === 0 ? "sconce_deco" : "sconce_deco_onyx",
    side: "right", x, y: 139, u: 0, v: 39,
  });
}

export const GROUNDS: Layout = { floor, walls };
