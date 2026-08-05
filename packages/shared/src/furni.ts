import type { FurniDef } from "./protocol.ts";

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
]);
