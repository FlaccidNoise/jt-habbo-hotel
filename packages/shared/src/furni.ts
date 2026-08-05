import type { FurniDef, WallDef } from "./protocol.ts";

// seatHeight is the seat surface read off the authored geometry, not guessed: the box-path defs
// come from archetypes.ts slot boxes, the 3D-assisted ones from the rig.py primitive that forms
// the seat. It is always below stackHeights[0], which is the silhouette top.
export const PROTOTYPE_CATALOG: FurniDef[] = [
  { id: "chair_basic", name: "Chair",  w: 1, l: 1, stackHeights: [1.0],  canWalk: false, canStackOn: false, seatHeight: 0.65625, color: 0xb5651d },
  { id: "table_basic", name: "Table",  w: 2, l: 1, stackHeights: [1.0],  canWalk: false, canStackOn: true,  seatHeight: null,    color: 0x8b4513 },
  { id: "sofa_basic",  name: "Sofa",   w: 2, l: 1, stackHeights: [1.0],  canWalk: false, canStackOn: false, seatHeight: 0.5625,  color: 0x7a3e9d },
  { id: "plant_basic", name: "Plant",  w: 1, l: 1, stackHeights: [2.0],  canWalk: false, canStackOn: false, seatHeight: null,    color: 0x2e8b57 },
  { id: "rug_basic",   name: "Rug",    w: 3, l: 2, stackHeights: [0.05], canWalk: true,  canStackOn: true,  seatHeight: null,    color: 0xaa3333 },
  // 3D-assisted path (#202): frozen bundles in tools/artgen/frozen, merged by the generator CLI.
  // stackHeights[0] = drawn height rounded up to a whole z-pixel (1/32).
  { id: "casino_table",  name: "Casino Table", w: 2, l: 2, stackHeights: [1.4375],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x2e8b57 },
  { id: "casino_stool",  name: "Casino Stool", w: 1, l: 1, stackHeights: [0.84375], canWalk: false, canStackOn: false, seatHeight: 0.82, color: 0xaa3333 },
  { id: "cafe_table",    name: "Café Table",   w: 1, l: 1, stackHeights: [1.03125], canWalk: false, canStackOn: true,  seatHeight: null, color: 0xcfc7b6 },
  { id: "cafe_chair",    name: "Café Chair",   w: 1, l: 1, stackHeights: [1.25],    canWalk: false, canStackOn: false, seatHeight: 0.58, color: 0x2f8f8f },
  { id: "bed_basic",     name: "Bed",          w: 2, l: 3, stackHeights: [0.96875], canWalk: false, canStackOn: false, seatHeight: 0.55, color: 0x3f5e9e },
  { id: "lamp_basic",    name: "Lamp",         w: 1, l: 1, stackHeights: [2.21875], canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520 },
  { id: "shelf_basic",   name: "Shelf",        w: 2, l: 1, stackHeights: [1.90625], canWalk: false, canStackOn: false, seatHeight: null, color: 0xb5651d },
  { id: "divider_basic", name: "Divider",      w: 2, l: 1, stackHeights: [1.0625],  canWalk: false, canStackOn: true,  seatHeight: null, color: 0x5b6672 },
  { id: "stereo_basic",  name: "Stereo",       w: 1, l: 1, stackHeights: [1.375],   canWalk: false, canStackOn: false, seatHeight: null, color: 0x4a4d55 },
  { id: "slot_machine",   name: "Slot Machine",   w: 1, l: 1, stackHeights: [2],       canWalk: false, canStackOn: false, seatHeight: null, color: 0xaa3333 },
  { id: "bar_counter",    name: "Bar Counter",    w: 2, l: 1, stackHeights: [1.1875],  canWalk: false, canStackOn: true,  seatHeight: null, color: 0xb5651d },
  { id: "arcade_cabinet", name: "Arcade Cabinet", w: 1, l: 1, stackHeights: [1.875],   canWalk: false, canStackOn: false, seatHeight: null, color: 0x3f5e9e },
  { id: "fountain",       name: "Fountain",       w: 2, l: 2, stackHeights: [1.6875],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x2f8f8f },
  // Prestige fixtures (#210): account-bound, flagship-priced, never tradeable. Deliberately their
  // own meshes rather than recolours — a fixture at 5.5× the daily ceiling has to read as one.
  { id: "billiards_table",      name: "Billiards Table", w: 3, l: 2, stackHeights: [1.09375], canWalk: false, canStackOn: false, seatHeight: null, color: 0x2e8b57 },
  { id: "penthouse_candelabra", name: "Candelabra",  w: 1, l: 1, stackHeights: [2.34375], canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520 },
  // Colorways (#229): the same authored mesh with its ramps remapped, so they share their base's
  // geometry exactly — heights and seat surfaces are identical and the gates check that.
  { id: "cafe_chair_crimson",  name: "Crimson Café Chair", w: 1, l: 1, stackHeights: [1.25],    canWalk: false, canStackOn: false, seatHeight: 0.58, color: 0xaa3333 },
  { id: "cafe_chair_navy",     name: "Navy Café Chair",    w: 1, l: 1, stackHeights: [1.25],    canWalk: false, canStackOn: false, seatHeight: 0.58, color: 0x3f5e9e },
  { id: "casino_stool_fern",   name: "Baize Stool",        w: 1, l: 1, stackHeights: [0.84375], canWalk: false, canStackOn: false, seatHeight: 0.82, color: 0x2e8b57 },
  { id: "divider_basic_plum",  name: "Plum Divider",       w: 2, l: 1, stackHeights: [1.0625],  canWalk: false, canStackOn: true,  seatHeight: null, color: 0x7a3e9d },
  // Luck Lever exclusives (#210): won, never sold, so they carry no catalog price.
  { id: "arcade_cabinet_plum", name: "Plum Arcade Cabinet", w: 1, l: 1, stackHeights: [1.875],   canWalk: false, canStackOn: false, seatHeight: null, color: 0x7a3e9d },
  { id: "fountain_gilded",     name: "Gilded Fountain",     w: 2, l: 2, stackHeights: [1.6875],  canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520 },
];

// Wall items (#203). span, plane and mount are read off the render by tools/artgen/postpass.ts,
// which prints the line to paste — never measure a parallelogram by hand. plane is the drawn size
// in the wall plane and mount the offsets it was authored at, both in scale-64 px.
export const WALL_CATALOG: WallDef[] = [
  { id: "wall_art",      name: "Wall Art",      span: 1, plane: { w: 26, h: 23 }, mount: { u: 2, v: 35 }, color: 0xdaa520 },
  { id: "poster",        name: "Poster",        span: 1, plane: { w: 24, h: 29 }, mount: { u: 4, v: 34 }, color: 0xaa3333 },
  { id: "record_trophy", name: "Record Trophy", span: 1, plane: { w: 22, h: 21 }, mount: { u: 4, v: 35 }, color: 0x3f5e9e },
  { id: "wall_shelf",    name: "Wall Shelf",    span: 1, plane: { w: 26, h: 13 }, mount: { u: 0, v: 46 }, color: 0xb5651d },
];

/** What a new account is given, and nothing else. Explicitly listed, never "the whole catalog" —
 *  every def added later must be earned through the Stars sink, not granted for free. */
export const STARTER_GRANT_DEFS: readonly string[] = [
  "chair_basic", "table_basic", "sofa_basic", "plant_basic", "rug_basic",
];

// GAME.md §Price ladder (all tune): entry furni 25, median furni 150.
export const CATALOG_PRICES: ReadonlyMap<string, number> = new Map([
  ["chair_basic", 25],
  ["plant_basic", 25],
  ["rug_basic", 50],
  ["table_basic", 150],
  ["sofa_basic", 150],
  ["casino_stool", 25],
  ["cafe_chair", 25],
  ["lamp_basic", 75],
  ["divider_basic", 75],
  ["cafe_table", 150],
  ["bed_basic", 150],
  ["shelf_basic", 150],
  ["stereo_basic", 150],
  ["casino_table", 300],
  ["arcade_cabinet", 150],
  ["slot_machine", 300],
  ["bar_counter", 300],
  ["fountain", 300],
  ["cafe_chair_crimson", 25],
  ["cafe_chair_navy", 25],
  ["casino_stool_fern", 25],
  ["divider_basic_plum", 75],
  ["poster", 50],
  ["wall_art", 150],
  ["wall_shelf", 150],
  ["record_trophy", 300],
  // Prestige (#210). GAME.md §Price ladder puts the flagship at 3,300 — 5.5× the daily earn
  // ceiling, so it is weeks of play rather than an afternoon's.
  ["billiards_table", 3300],
  ["penthouse_candelabra", 1800],
]);

/** Bought like anything else, but minted account-bound: these never enter the trade economy, so
 *  the Stars they absorb are gone rather than recirculating as goods (GAME.md §Sinks). */
export const PRESTIGE_DEFS: ReadonlySet<string> = new Set([
  "billiards_table",
  "penthouse_candelabra",
]);
