import type { FurniDef, WallDef } from "./protocol.ts";

// seatHeight is the seat surface read off the authored geometry, not guessed: the box-path defs
// come from archetypes.ts slot boxes, the 3D-assisted ones from the rig.py primitive that forms
// the seat. It is always below stackHeights[0], which is the silhouette top.
export const PROTOTYPE_CATALOG: FurniDef[] = [
  { id: "chair_basic", name: "Chair",  theme: "starter", w: 1, l: 1, stackHeights: [1.0],  canWalk: false, canStackOn: false, seatHeight: 0.65625, color: 0xb5651d },
  { id: "table_basic", name: "Table",  theme: "starter", w: 2, l: 1, stackHeights: [1.0],  canWalk: false, canStackOn: true,  seatHeight: null,    color: 0x8b4513 },
  { id: "sofa_basic",  name: "Sofa",   theme: "starter", w: 2, l: 1, stackHeights: [1.0],  canWalk: false, canStackOn: false, seatHeight: 0.5625,  color: 0x7a3e9d },
  { id: "plant_basic", name: "Plant",  theme: "starter", w: 1, l: 1, stackHeights: [2.0],  canWalk: false, canStackOn: false, seatHeight: null,    color: 0x2e8b57 },
  { id: "rug_basic",   name: "Rug",    theme: "starter", w: 3, l: 2, stackHeights: [0.05], canWalk: true,  canStackOn: true,  seatHeight: null,    color: 0xaa3333 },
  // 3D-assisted path (#202): frozen bundles in tools/artgen/frozen, merged by the generator CLI.
  // stackHeights[0] = drawn height rounded up to a whole z-pixel (1/32).
  { id: "casino_table",  name: "Casino Table", theme: "casino", w: 2, l: 2, stackHeights: [1.4375],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x2e8b57 },
  { id: "casino_stool",  name: "Casino Stool", theme: "casino", w: 1, l: 1, stackHeights: [0.84375], canWalk: false, canStackOn: false, seatHeight: 0.82, color: 0xaa3333 },
  { id: "cafe_table",    name: "Café Table",   theme: "cafe", w: 1, l: 1, stackHeights: [1.03125], canWalk: false, canStackOn: true,  seatHeight: null, color: 0xcfc7b6 },
  { id: "cafe_chair",    name: "Café Chair",   theme: "cafe", w: 1, l: 1, stackHeights: [1.25],    canWalk: false, canStackOn: false, seatHeight: 0.58, color: 0x2f8f8f },
  { id: "bed_basic",     name: "Bed",          theme: "bedroom", w: 2, l: 3, stackHeights: [0.96875], canWalk: false, canStackOn: false, seatHeight: 0.55, color: 0x3f5e9e },
  // A lit lamp is the same size as an unlit one, but placement reads stackHeights[state] and
  // throws on a state it has no height for — so every toggle def declares both (#326).
  { id: "lamp_basic",    name: "Lamp",         theme: "bedroom", w: 1, l: 1, stackHeights: [2.21875, 2.21875], canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520, interaction: "toggle" },
  // Free (#347): a book is a prop, not a sink. It runs the vend rail so the shelf behaves like
  // every other counter — walk up, use it, carry the thing for two minutes.
  { id: "shelf_basic",   name: "Shelf",        theme: "bedroom", w: 2, l: 1, stackHeights: [1.90625], canWalk: false, canStackOn: false, seatHeight: null, color: 0xb5651d, interaction: "read", vend: { item: "book", price: 0 } },
  { id: "divider_basic", name: "Divider",      theme: "bedroom", w: 2, l: 1, stackHeights: [1.0625],  canWalk: false, canStackOn: true,  seatHeight: null, color: 0x5b6672 },
  // Switched on and off like the lamp (#331), and like the lamp the state is all client-side — the
  // frozen bundle has one frame per facing, so nothing here needs re-rendering.
  { id: "stereo_basic",  name: "Stereo",       theme: "bedroom", w: 1, l: 1, stackHeights: [1.375, 1.375], canWalk: false, canStackOn: false, seatHeight: null, color: 0x4a4d55, interaction: "toggle" },
  { id: "slot_machine",   name: "Slot Machine",   theme: "casino", w: 1, l: 1, stackHeights: [2],       canWalk: false, canStackOn: false, seatHeight: null, color: 0xaa3333 },
  // The casino-side drink (#347): the bar shakes cocktails at 2 Stars, the café pours coffee at 1.
  { id: "bar_counter",    name: "Bar Counter",    theme: "casino", w: 2, l: 1, stackHeights: [1.1875],  canWalk: false, canStackOn: true,  seatHeight: null, color: 0xb5651d, interaction: "vend", vend: { item: "drink_cocktail", price: 2 } },
  { id: "arcade_cabinet", name: "Arcade Cabinet", theme: "casino", w: 1, l: 1, stackHeights: [1.875],   canWalk: false, canStackOn: false, seatHeight: null, color: 0x3f5e9e },
  // Wishing, not washing (#347): the basin is where you scrub, the fountain is where the Star goes.
  { id: "fountain",       name: "Fountain",       theme: "casino", w: 2, l: 2, stackHeights: [1.6875],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x2f8f8f, interaction: "wish" },
  // Lodge set (#314): soft furniture, a hearth, greenery and a divider that is not a wall.
  { id: "armchair_lounge", name: "Lodge Armchair", theme: "lodge", w: 1, l: 1, stackHeights: [1.75],    canWalk: false, canStackOn: false, seatHeight: 1,    color: 0xaa3333 },
  { id: "sofa_lodge",      name: "Lodge Sofa",     theme: "lodge", w: 2, l: 1, stackHeights: [2],       canWalk: false, canStackOn: false, seatHeight: 1,    color: 0x2e8b57 },
  { id: "table_round",     name: "Round Table",    theme: "lodge", w: 1, l: 1, stackHeights: [1.5],     canWalk: false, canStackOn: true,  seatHeight: null, color: 0xb5651d },
  { id: "plant_fern",      name: "Potted Fern",    theme: "lodge", w: 1, l: 1, stackHeights: [1.53125], canWalk: false, canStackOn: false, seatHeight: null, color: 0x2e8b57 },
  // Lit and unlit (#331). The mesh already carries flames in the firebox, so the switch is the
  // firelight and the smoke off them rather than a second set of frames.
  { id: "fireplace",       name: "Fireplace",      theme: "lodge", w: 2, l: 1, stackHeights: [2.5, 2.5], canWalk: false, canStackOn: false, seatHeight: null, color: 0x5b6672, interaction: "toggle" },
  { id: "railing",         name: "Railing",        theme: "lodge", w: 1, l: 1, stackHeights: [1],       canWalk: false, canStackOn: false, seatHeight: null, color: 0xb5651d },
  // Lodge round 2 (#323): the floor half of the wall-clutter pass. rug_lodge is the only walkable
  // 3D-assisted part — canWalk puts it on the client's floor_furni layer, under every avatar.
  { id: "rug_lodge",   name: "Lodge Rug",   theme: "lodge", w: 2, l: 2, stackHeights: [0.0625],  canWalk: true,  canStackOn: true,  seatHeight: null, color: 0xaa3333 },
  { id: "stool_lodge", name: "Lodge Stool", theme: "lodge", w: 1, l: 1, stackHeights: [0.84375], canWalk: false, canStackOn: false, seatHeight: 0.82, color: 0xb5651d },
  { id: "side_table",  name: "Side Table",  theme: "lodge", w: 1, l: 1, stackHeights: [0.75],    canWalk: false, canStackOn: true,  seatHeight: null, color: 0xb5651d },
  // Amenities (#327): the two fixtures a café and a washroom need that no archetype covered.
  { id: "vending_machine", name: "Vending Machine", theme: "cafe", w: 1, l: 1, stackHeights: [2],       canWalk: false, canStackOn: false, seatHeight: null, color: 0x2f8f8f, interaction: "vend", vend: { item: "drink_cola", price: 1 } },
  { id: "sink_basic",      name: "Wash Basin",      theme: "cafe", w: 1, l: 1, stackHeights: [1],       canWalk: false, canStackOn: false, seatHeight: null, color: 0x9c9484, interaction: "wash" },
  // Pool & spa deck (#357): the resort half of a casino resort, which the catalog had none of.
  // Nothing here stacks. The parasol's stack top is the canopy at 2.5 and the trolley's is a hand
  // above its own bottles — canStackOn would put a lamp on top of an umbrella.
  { id: "sun_lounger",   name: "Sun Lounger",   theme: "pool", w: 1, l: 2, stackHeights: [1.1875],  canWalk: false, canStackOn: false, seatHeight: 0.58, color: 0x2f8f8f },
  { id: "deck_chair",    name: "Deck Chair",    theme: "pool", w: 1, l: 1, stackHeights: [1.5625],  canWalk: false, canStackOn: false, seatHeight: 0.62, color: 0x2f8f8f },
  { id: "parasol_table", name: "Parasol Table", theme: "pool", w: 2, l: 2, stackHeights: [2.5],     canWalk: false, canStackOn: false, seatHeight: null, color: 0xaa3333 },
  { id: "cabana",        name: "Cabana",        theme: "pool", w: 2, l: 2, stackHeights: [2.5],     canWalk: false, canStackOn: false, seatHeight: null, color: 0x2f8f8f },
  // `wash` off the def (#347): the rail broadcasts the action and the client plays the splash, so
  // a tub reuses the basin's verb and needs no server code of its own.
  { id: "hot_tub",       name: "Hot Tub",       theme: "pool", w: 2, l: 2, stackHeights: [0.84375], canWalk: false, canStackOn: false, seatHeight: null, color: 0x2f8f8f, interaction: "wash" },
  { id: "towel_rack",    name: "Towel Rack",    theme: "pool", w: 1, l: 1, stackHeights: [1.4375],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x2f8f8f },
  { id: "potted_palm",   name: "Potted Palm",   theme: "pool", w: 1, l: 1, stackHeights: [1.875],   canWalk: false, canStackOn: false, seatHeight: null, color: 0x2e8b57 },
  { id: "drinks_trolley", name: "Drinks Trolley", theme: "pool", w: 1, l: 1, stackHeights: [1.375], canWalk: false, canStackOn: false, seatHeight: null, color: 0x9c9484 },
  { id: "pool_ladder",   name: "Pool Ladder",   theme: "pool", w: 1, l: 1, stackHeights: [1.25],    canWalk: false, canStackOn: false, seatHeight: null, color: 0x9c9484 },
  // Prestige fixtures (#210): account-bound, flagship-priced, never tradeable. Deliberately their
  // own meshes rather than recolours — a fixture at 5.5× the daily ceiling has to read as one.
  { id: "billiards_table",      name: "Billiards Table", theme: "prestige", w: 3, l: 2, stackHeights: [1.09375], canWalk: false, canStackOn: false, seatHeight: null, color: 0x2e8b57 },
  { id: "penthouse_candelabra", name: "Candelabra",  theme: "prestige", w: 1, l: 1, stackHeights: [2.34375, 2.34375], canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520, interaction: "toggle" },
  // Colorways (#229): the same authored mesh with its ramps remapped, so they share their base's
  // geometry exactly — heights and seat surfaces are identical and the gates check that.
  { id: "cafe_chair_crimson",  name: "Crimson Café Chair", theme: "cafe", w: 1, l: 1, stackHeights: [1.25],    canWalk: false, canStackOn: false, seatHeight: 0.58, color: 0xaa3333 },
  { id: "cafe_chair_navy",     name: "Navy Café Chair",    theme: "cafe", w: 1, l: 1, stackHeights: [1.25],    canWalk: false, canStackOn: false, seatHeight: 0.58, color: 0x3f5e9e },
  { id: "casino_stool_fern",   name: "Baize Stool",        theme: "casino", w: 1, l: 1, stackHeights: [0.84375], canWalk: false, canStackOn: false, seatHeight: 0.82, color: 0x2e8b57 },
  { id: "divider_basic_plum",  name: "Plum Divider",       theme: "bedroom", w: 2, l: 1, stackHeights: [1.0625],  canWalk: false, canStackOn: true,  seatHeight: null, color: 0x7a3e9d },
  { id: "armchair_lounge_navy", name: "Navy Lodge Armchair", theme: "lodge", w: 1, l: 1, stackHeights: [1.75],    canWalk: false, canStackOn: false, seatHeight: 1,    color: 0x3f5e9e },
  { id: "armchair_lounge_fern", name: "Fern Lodge Armchair", theme: "lodge", w: 1, l: 1, stackHeights: [1.75],    canWalk: false, canStackOn: false, seatHeight: 1,    color: 0x2e8b57 },
  { id: "sofa_lodge_plum",      name: "Plum Lodge Sofa",     theme: "lodge", w: 2, l: 1, stackHeights: [2],       canWalk: false, canStackOn: false, seatHeight: 1,    color: 0x7a3e9d },
  { id: "table_round_onyx",     name: "Onyx Round Table",    theme: "lodge", w: 1, l: 1, stackHeights: [1.5],     canWalk: false, canStackOn: true,  seatHeight: null, color: 0x4a4d55 },
  { id: "plant_fern_exotic",    name: "Exotic Fern",         theme: "lodge", w: 1, l: 1, stackHeights: [1.53125], canWalk: false, canStackOn: false, seatHeight: null, color: 0x7a3e9d },
  { id: "fireplace_stone",      name: "Sandstone Hearth",    theme: "lodge", w: 2, l: 1, stackHeights: [2.5, 2.5], canWalk: false, canStackOn: false, seatHeight: null, color: 0xc2a36b, interaction: "toggle" },
  { id: "railing_iron",         name: "Iron Railing",        theme: "lodge", w: 1, l: 1, stackHeights: [1],       canWalk: false, canStackOn: false, seatHeight: null, color: 0x4a4d55 },
  { id: "stool_lodge_charcoal", name: "Charcoal Lodge Stool", theme: "lodge", w: 1, l: 1, stackHeights: [0.84375], canWalk: false, canStackOn: false, seatHeight: 0.82, color: 0x4a4d55 },
  { id: "side_table_slate",     name: "Slate Side Table",     theme: "lodge", w: 1, l: 1, stackHeights: [0.75],    canWalk: false, canStackOn: true,  seatHeight: null, color: 0x5b6672 },
  { id: "cafe_counter",         name: "Café Counter",         theme: "cafe", w: 2, l: 1, stackHeights: [1.1875],  canWalk: false, canStackOn: true,  seatHeight: null, color: 0x2f8f8f, interaction: "vend", vend: { item: "drink_coffee", price: 1 } },
  // Pool & spa deck colorways (#357).
  { id: "sun_lounger_crimson",   name: "Crimson Sun Lounger",   theme: "pool", w: 1, l: 2, stackHeights: [1.1875],  canWalk: false, canStackOn: false, seatHeight: 0.58, color: 0xaa3333 },
  { id: "deck_chair_crimson",    name: "Crimson Deck Chair",    theme: "pool", w: 1, l: 1, stackHeights: [1.5625],  canWalk: false, canStackOn: false, seatHeight: 0.62, color: 0xaa3333 },
  { id: "deck_chair_navy",       name: "Navy Deck Chair",       theme: "pool", w: 1, l: 1, stackHeights: [1.5625],  canWalk: false, canStackOn: false, seatHeight: 0.62, color: 0x3f5e9e },
  { id: "parasol_table_teal",    name: "Teal Parasol Table",    theme: "pool", w: 2, l: 2, stackHeights: [2.5],     canWalk: false, canStackOn: false, seatHeight: null, color: 0x2f8f8f },
  { id: "cabana_crimson",        name: "Crimson Cabana",        theme: "pool", w: 2, l: 2, stackHeights: [2.5],     canWalk: false, canStackOn: false, seatHeight: null, color: 0xaa3333 },
  { id: "hot_tub_cedar",         name: "Cedar Hot Tub",         theme: "pool", w: 2, l: 2, stackHeights: [0.84375], canWalk: false, canStackOn: false, seatHeight: null, color: 0xc2a36b, interaction: "wash" },
  { id: "towel_rack_linen",      name: "Linen Towel Rack",      theme: "pool", w: 1, l: 1, stackHeights: [1.4375],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x3f5e9e },
  { id: "potted_palm_teal",      name: "Teal Potted Palm",      theme: "pool", w: 1, l: 1, stackHeights: [1.875],   canWalk: false, canStackOn: false, seatHeight: null, color: 0x2f8f8f },
  { id: "drinks_trolley_sunset", name: "Sunset Drinks Trolley", theme: "pool", w: 1, l: 1, stackHeights: [1.375],   canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520 },
  { id: "bar_counter_pool",      name: "Pool Bar",              theme: "pool", w: 2, l: 1, stackHeights: [1.1875],  canWalk: false, canStackOn: true,  seatHeight: null, color: 0xc2a36b, interaction: "vend", vend: { item: "drink_cocktail", price: 2 } },
  // Penthouse suites (#356): the art-deco set for The Grand's suites. Navy and charcoal carcases,
  // gold trim, ivory upholstery — four ramps that differ in hue, so the trim reads on every body
  // the colorways below reach for.
  { id: "bed_grand",       name: "Grand Bed",       theme: "penthouse", w: 2, l: 2, stackHeights: [1.5625],  canWalk: false, canStackOn: false, seatHeight: 0.82, color: 0x3f5e9e },
  // Not stackable, unlike the dresser: stacking lands at stackHeights[0], which on a vanity is the
  // top of the mirror rather than the top of the table.
  { id: "vanity_deco",     name: "Deco Vanity",     theme: "penthouse", w: 2, l: 1, stackHeights: [1.96875], canWalk: false, canStackOn: false, seatHeight: null, color: 0x3f5e9e },
  { id: "chaise_deco",     name: "Deco Chaise",     theme: "penthouse", w: 2, l: 1, stackHeights: [1.1875],  canWalk: false, canStackOn: false, seatHeight: 0.76, color: 0x3f5e9e },
  { id: "armoire_deco",    name: "Deco Armoire",    theme: "penthouse", w: 2, l: 1, stackHeights: [2.5625],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x4a4d55 },
  { id: "barcart_deco",    name: "Bar Cart",        theme: "penthouse", w: 1, l: 1, stackHeights: [1.40625], canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520 },
  { id: "screen_deco",     name: "Folding Screen",  theme: "penthouse", w: 2, l: 1, stackHeights: [2.0625],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x3f5e9e },
  { id: "mirror_standing", name: "Cheval Mirror",   theme: "penthouse", w: 1, l: 1, stackHeights: [1.8125],  canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520 },
  { id: "ottoman_deco",    name: "Deco Ottoman",    theme: "penthouse", w: 1, l: 1, stackHeights: [0.75],    canWalk: false, canStackOn: false, seatHeight: 0.74, color: 0x3f5e9e },
  { id: "dresser_deco",    name: "Deco Dresser",    theme: "penthouse", w: 2, l: 1, stackHeights: [1.125],   canWalk: false, canStackOn: true,  seatHeight: null, color: 0x4a4d55 },
  // A bulb on a stand, so the client's default Glow already describes it — the toggle costs the
  // second stackHeights entry (#326) and nothing else.
  { id: "lamp_deco",       name: "Deco Floor Lamp", theme: "penthouse", w: 1, l: 1, stackHeights: [2.25, 2.25], canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520, interaction: "toggle" },
  { id: "bed_grand_plum",       name: "Plum Grand Bed",     theme: "penthouse", w: 2, l: 2, stackHeights: [1.5625],  canWalk: false, canStackOn: false, seatHeight: 0.82, color: 0x7a3e9d },
  { id: "chaise_deco_crimson",  name: "Crimson Chaise",     theme: "penthouse", w: 2, l: 1, stackHeights: [1.1875],  canWalk: false, canStackOn: false, seatHeight: 0.76, color: 0xaa3333 },
  { id: "screen_deco_jade",     name: "Jade Screen",        theme: "penthouse", w: 2, l: 1, stackHeights: [2.0625],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x2e8b57 },
  { id: "dresser_deco_navy",    name: "Navy Deco Dresser",  theme: "penthouse", w: 2, l: 1, stackHeights: [1.125],   canWalk: false, canStackOn: true,  seatHeight: null, color: 0x3f5e9e },
  { id: "ottoman_deco_ivory",   name: "Ivory Deco Ottoman", theme: "penthouse", w: 1, l: 1, stackHeights: [0.75],    canWalk: false, canStackOn: false, seatHeight: 0.74, color: 0x9c9484 },
  { id: "armoire_deco_ivory",   name: "Ivory Deco Armoire", theme: "penthouse", w: 2, l: 1, stackHeights: [2.5625],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x9c9484 },
  { id: "mirror_standing_plum", name: "Plum Cheval Mirror", theme: "penthouse", w: 1, l: 1, stackHeights: [1.8125],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x7a3e9d },
  // Luck Lever exclusives (#210): won, never sold, so they carry no catalog price.
  { id: "arcade_cabinet_plum", name: "Plum Arcade Cabinet", theme: "casino", w: 1, l: 1, stackHeights: [1.875],   canWalk: false, canStackOn: false, seatHeight: null, color: 0x7a3e9d },
  { id: "fountain_gilded",     name: "Gilded Fountain",     theme: "casino", w: 2, l: 2, stackHeights: [1.6875],  canWalk: false, canStackOn: false, seatHeight: null, color: 0xdaa520, interaction: "wish" },
  // Collection-set rewards (#210): minted account-bound on completion, obtainable no other way.
  { id: "cafe_table_marble",   name: "Marble Café Table",   theme: "cafe", w: 1, l: 1, stackHeights: [1.03125], canWalk: false, canStackOn: true,  seatHeight: null, color: 0x5b6672 },
  { id: "casino_table_onyx",   name: "Onyx Casino Table",   theme: "casino", w: 2, l: 2, stackHeights: [1.4375],  canWalk: false, canStackOn: false, seatHeight: null, color: 0x4a4d55 },
];

// Wall items (#203). span, plane and mount are read off the render by tools/artgen/postpass.ts,
// which prints the line to paste — never measure a parallelogram by hand. plane is the drawn size
// in the wall plane and mount the offsets it was authored at, both in scale-64 px.
export const WALL_CATALOG: WallDef[] = [
  { id: "wall_art",      name: "Wall Art",      theme: "wall_art", span: 1, plane: { w: 26, h: 23 }, mount: { u: 2, v: 35 }, color: 0xdaa520 },
  { id: "poster",        name: "Poster",        theme: "wall_art", span: 1, plane: { w: 24, h: 29 }, mount: { u: 4, v: 34 }, color: 0xaa3333 },
  { id: "record_trophy", name: "Record Trophy", theme: "wall_art", span: 1, plane: { w: 22, h: 21 }, mount: { u: 4, v: 35 }, color: 0x3f5e9e },
  { id: "wall_shelf",    name: "Wall Shelf",    theme: "wall_art", span: 1, plane: { w: 26, h: 13 }, mount: { u: 0, v: 46 }, color: 0xb5651d },
  { id: "wall_art_gilded", name: "Gallery Piece", theme: "wall_art", span: 1, plane: { w: 26, h: 23 }, mount: { u: 2, v: 35 }, color: 0x9c9484 },
  // Lodge round 2 (#323).
  { id: "wall_clock",    name: "Lodge Clock",   theme: "lodge", span: 1, plane: { w: 24, h: 28 }, mount: { u: 2, v: 36 }, color: 0xb5651d },
  { id: "antlers",       name: "Antler Mount",  theme: "lodge", span: 1, plane: { w: 28, h: 37 }, mount: { u: 0, v: 24 }, color: 0xc2a36b },
  // Penthouse suites (#356).
  { id: "sconce_deco",      name: "Deco Sconce",      theme: "penthouse", span: 1, plane: { w: 26, h: 16 }, mount: { u: 0, v: 39 }, color: 0xdaa520 },
  { id: "wallmirror_deco",  name: "Sunburst Mirror",  theme: "penthouse", span: 1, plane: { w: 24, h: 19 }, mount: { u: 4, v: 38 }, color: 0xdaa520 },
  { id: "sconce_deco_onyx", name: "Onyx Deco Sconce", theme: "penthouse", span: 1, plane: { w: 26, h: 16 }, mount: { u: 0, v: 39 }, color: 0x4a4d55 },
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
  // Lodge set (#314) and its colorways, on the existing rungs.
  ["railing", 50],
  ["railing_iron", 50],
  ["plant_fern", 75],
  ["plant_fern_exotic", 75],
  ["armchair_lounge", 150],
  ["armchair_lounge_navy", 150],
  ["armchair_lounge_fern", 150],
  ["table_round", 150],
  ["table_round_onyx", 150],
  ["sofa_lodge", 300],
  ["sofa_lodge_plum", 300],
  ["fireplace", 300],
  ["fireplace_stone", 300],
  // Lodge round 2 (#323): wall clutter and the props that go under it.
  ["stool_lodge", 25],
  ["stool_lodge_charcoal", 25],
  ["rug_lodge", 75],
  ["side_table", 75],
  ["side_table_slate", 75],
  ["wall_clock", 150],
  ["antlers", 300],
  // Amenities (#327). The counter is the bar counter's price, since it is the same object recoloured.
  ["sink_basic", 150],
  ["vending_machine", 250],
  ["cafe_counter", 300],
  // Pool & spa deck (#357), on the same rungs the lodge uses: a seat is entry, a 1x1 prop is 75,
  // a 1x1 with contents or a 1x2 is median, and a 2x2 centrepiece is 300 like the fountain.
  ["deck_chair", 25],
  ["deck_chair_crimson", 25],
  ["deck_chair_navy", 25],
  ["pool_ladder", 50],
  ["towel_rack", 75],
  ["towel_rack_linen", 75],
  ["potted_palm", 75],
  ["potted_palm_teal", 75],
  ["sun_lounger", 150],
  ["sun_lounger_crimson", 150],
  ["drinks_trolley", 150],
  ["drinks_trolley_sunset", 150],
  ["parasol_table", 300],
  ["parasol_table_teal", 300],
  ["cabana", 300],
  ["cabana_crimson", 300],
  ["hot_tub", 300],
  ["hot_tub_cedar", 300],
  ["bar_counter_pool", 300],
  // Penthouse suites (#356), on the existing rungs and no higher: the set is luxury by palette,
  // not by price, so its ceiling is the 300 the bar counter and the hearth already sit on. A
  // colorway costs what its base costs — they share a mesh, so they share a rung.
  ["ottoman_deco", 25],
  ["ottoman_deco_ivory", 25],
  ["lamp_deco", 75],
  ["mirror_standing", 75],
  ["mirror_standing_plum", 75],
  ["barcart_deco", 150],
  ["vanity_deco", 150],
  ["dresser_deco", 150],
  ["dresser_deco_navy", 150],
  ["screen_deco", 150],
  ["screen_deco_jade", 150],
  ["sconce_deco", 150],
  ["sconce_deco_onyx", 150],
  ["bed_grand", 300],
  ["bed_grand_plum", 300],
  ["chaise_deco", 300],
  ["chaise_deco_crimson", 300],
  ["armoire_deco", 300],
  ["armoire_deco_ivory", 300],
  ["wallmirror_deco", 300],
  // Prestige (#210). GAME.md §Price ladder puts the flagship at 3,300 — 5.5× the daily earn
  // ceiling, so it is weeks of play rather than an afternoon's.
  ["billiards_table", 3300],
  ["penthouse_candelabra", 1800],
]);

/** Every catalog id not in CATALOG_PRICES must be listed here with a reason — checked by
 *  furni.test.ts so a missing price stays a deliberate choice, not a silent gap (it would
 *  otherwise show nowhere in the shop and value at 0 Stars in limits.ts's laundering wall). */
export const UNPRICED: ReadonlySet<string> = new Set([
  // Luck Lever exclusives (#210): won, never sold.
  "arcade_cabinet_plum",
  "fountain_gilded",
  // Collection-set rewards (#210): minted account-bound on completion, obtainable no other way.
  "cafe_table_marble",
  "casino_table_onyx",
  "wall_art_gilded",
]);

/** Bought like anything else, but minted account-bound: these never enter the trade economy, so
 *  the Stars they absorb are gone rather than recirculating as goods (GAME.md §Sinks). */
export const PRESTIGE_DEFS: ReadonlySet<string> = new Set([
  "billiards_table",
  "penthouse_candelabra",
]);
