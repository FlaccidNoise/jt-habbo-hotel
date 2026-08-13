// Post-pass for tools/artgen/rig.py output (#202, docs/design/ART-DIRECTION.md).
// Per pixel: the mask render names the prim → its palette ramp; normalized luma from the lit
// render picks the shade (left/right/top/hi). Interior detail lines land on prim-group
// boundaries in the local ramp's outline shade, then the global silhouette outline. Assembles
// compose.ts-format sheets and runs the real stage-4 gates.
//
// Proof parts ("proof_*") render and gate only. Catalog parts must have a FurniDef in
// @grand/shared and additionally freeze to tools/artgen/frozen/ (<id>.png + <id>.json) —
// the committed bundle cli.ts merges into the catalog. Gate failure freezes nothing, and so does
// a bundle that only moved its style pins — see PROVENANCE_KEYS.
//
// VARIANTS below are colorways: extra catalog items assembled from a base part's existing
// frames with its ramps remapped, so they cost no Blender render (see the note there).
//
//   node --experimental-strip-types tools/artgen/postpass.ts <renderDir> [--freeze]
//   make art            — render every part, gate, freeze
//   make art PART=<id>  — re-render one part and its colorways

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PROTOTYPE_CATALOG, WALL_CATALOG } from "../../packages/shared/src/furni.ts";
import type { FurniDef, WallDef } from "../../packages/shared/src/protocol.ts";
import { WALL_HEIGHT } from "../../packages/shared/src/walls.ts";
import type { Canvas } from "../../packages/generator/src/raster.ts";
import { makeCanvas, putPixel, getPixel, blit } from "../../packages/generator/src/raster.ts";
import { rampByName, OUTLINE, STYLE_VERSION, GENERATOR_VERSION } from "../../packages/generator/src/style.ts";
import { runGates, runWallGates, gatePrimCount, gateWallMountEven } from "../../packages/generator/src/gates.ts";
import { reviewIslands } from "../../packages/generator/src/review.ts";
import type { Bundle } from "../../packages/generator/src/compose.ts";
import { encodePng } from "../../packages/generator/src/png.ts";

const H = 32, V = 16, ZU = 32;
const ALPHA_MIN = 128;
// Absolute linear-luma buckets → ramp shades. The rig lights white geometry with a lone 0.9
// sun over a black world, so faces sit at fixed levels: unlit/left ≈ .00-.15, right ≈ .54,
// flat top ≈ .70, sun-facing band ≈ .90. `hi` is that band: bevel strips and curve crests.
const THRESH_LEFT = 0.30, THRESH_RIGHT = 0.62, THRESH_TOP = 0.80;
// The style bible's 2x2 checker (ART-DIRECTION), finally applied where it belongs: within
// DITHER_BAND of a threshold AND on a curve whose transition is WIDE — flat faces sit at the
// fixed levels above (no gradient), and a thin cylinder crosses a whole band in a pixel or two,
// which needs no softening and reads as noise when checkered. The window is per-pixel luma
// slope: above CURVE_MIN it is a curve, below CURVE_MAX the banding line it leaves is wide
// enough to be worth breaking.
const DITHER_BAND = 0.05, CURVE_MIN = 0.004, CURVE_MAX = 0.03;
const THRESHOLDS = [THRESH_LEFT, THRESH_RIGHT, THRESH_TOP];

/** sRGB byte → linear [0,1]. */
function toLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

const renderDir = process.argv[2] ?? "/tmp/artgen";
const freeze = process.argv.includes("--freeze");
const frozenDir = new URL("./frozen/", import.meta.url).pathname;

interface Frame { dir: number; spanY: number; rgba: string; mask: string; near?: boolean[]; state?: number }
interface PartMeta {
  w: number; l: number; ramp: string; maxZ: number; seatZ: number | null; frames: Frame[];
  surface?: "floor" | "wall";
  wallGap: number; wallDepth: number;
  prims: Array<{ ramp: string; group: number }>;
  src: unknown;
  /** #430: the axle a state turns about and the step per state, when the part declares one. */
  spin?: unknown;
}

interface BBox { minX: number; minY: number; maxX: number; maxY: number }

function opaqueBox(c: Canvas): BBox | null {
  let box: BBox | null = null;
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (getPixel(c, x, y).alpha === 0) continue;
      if (!box) box = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        if (x < box.minX) box.minX = x;
        if (x > box.maxX) box.maxX = x;
        if (y < box.minY) box.minY = y;
        if (y > box.maxY) box.maxY = y;
      }
    }
  }
  return box;
}

/** Where the dir-0 render sits in the wall plane, snapped out to the wall's 2 px lattice so the
 *  declared box always covers the pixels. Screen width folds in the item's depth, and the plane's
 *  own tilt costs half its width in screen height — both come back out here. */
function wallPlane(box: BBox, anchorX: number, anchorY: number): {
  planeW: number; planeH: number; mountU: number; mountV: number;
} {
  const w = box.maxX + 1 - box.minX;
  const h = box.maxY + 1 - box.minY;
  const rawU = box.minX - anchorX;
  const rawV = box.minY - (anchorY - V - WALL_HEIGHT * ZU) - rawU / 2;
  const mountU = 2 * Math.floor(rawU / 2);
  const mountV = Math.floor(rawV);
  return {
    planeW: 2 * Math.ceil((rawU + w - mountU) / 2),
    planeH: Math.ceil(rawV + h - w / 2 - mountV),
    mountU,
    mountV,
  };
}

/** Colorways. rig.py renders white geometry lit by one sun and a flat index mask — neither pass
 *  sees a ramp, so a recolor reuses the base part's frames and costs no Blender time at all.
 *  The remap is keyed by ramp name rather than prim index, so it survives reordering the mesh.
 *  Each colorway still needs its own FurniDef, gets its own recipeHash, and runs the full gates.
 *
 *  Remap the whole palette, not just the dominant ramp. The gates check that a colorway is
 *  on-palette and readable, not that it is harmonious — divider_basic_plum first shipped as a
 *  plum body still wearing its walnut cap, which reads bright orange against purple. Single-ramp
 *  parts like cafe_chair are safe with one substitution; multi-ramp parts need every accent
 *  reconsidered against the new base. Look at the @3x preview before freezing. */
const VARIANTS: Record<string, { base: string; ramps: Record<string, string> }> = {
  cafe_chair_crimson:  { base: "cafe_chair",    ramps: { teal: "crimson" } },
  cafe_chair_navy:     { base: "cafe_chair",    ramps: { teal: "navy" } },
  casino_stool_fern:   { base: "casino_stool",  ramps: { crimson: "fern" } },
  divider_basic_plum:  { base: "divider_basic", ramps: { slate: "plum", walnut: "ivory" } },
  // Luck Lever exclusives (#210): never sold, only won. Colorways cost no render, so an item that
  // exists purely to be rare is the cheapest thing in the pipeline to make.
  fountain_gilded:      { base: "fountain",       ramps: { slate: "gold" } },
  arcade_cabinet_plum:  { base: "arcade_cabinet", ramps: { navy: "plum", crimson: "gold" } },
  // Collection-set rewards (#210): minted on completion, never sold, never won.
  cafe_table_marble:    { base: "cafe_table",     ramps: { walnut: "slate", ivory: "ivory" } },
  casino_table_onyx:    { base: "casino_table",   ramps: { walnut: "charcoal", fern: "plum" } },
  wall_art_gilded:      { base: "wall_art",       ramps: { gold: "ivory", teal: "plum" } },
  // Lodge set (#314). The upholstery ramp is the only one that moves on the seats — walnut wood
  // and sand cushions read against crimson, navy, fern and plum alike, because they differ from
  // all four in hue rather than only in luma.
  armchair_lounge_navy: { base: "armchair_lounge", ramps: { crimson: "navy" } },
  armchair_lounge_fern: { base: "armchair_lounge", ramps: { crimson: "fern" } },
  sofa_lodge_plum:      { base: "sofa_lodge",      ramps: { fern: "plum" } },
  table_round_onyx:     { base: "table_round",     ramps: { walnut: "charcoal" } },
  plant_fern_exotic:    { base: "plant_fern",      ramps: { fern: "plum" } },
  // The keystone has to move with the body: slate → sand alone would sink a sand keystone into
  // its own masonry, which is the divider_basic_plum lesson.
  fireplace_stone:      { base: "fireplace",       ramps: { slate: "sand", sand: "charcoal" } },
  // Same for the finials — charcoal caps on a charcoal railing would vanish.
  railing_iron:         { base: "railing",         ramps: { walnut: "charcoal", charcoal: "gold" } },
  // Lodge round 2 (#323). Neither moves the wood alone. The stool's sand cushion would still read
  // on charcoal, but a charcoal frame under a sand cushion is a beige stool, so the cushion goes
  // crimson to keep the colorway a different object. The side table has no choice: its rim is
  // charcoal, and charcoal against slate is two desaturated blue-greys 23 luma apart — the same
  // shape of failure as gold on walnut, one corner of the palette over.
  stool_lodge_charcoal: { base: "stool_lodge",     ramps: { walnut: "charcoal", sand: "crimson" } },
  side_table_slate:     { base: "side_table",      ramps: { walnut: "slate", charcoal: "walnut" } },
  // Amenities (#327). The body is the only ramp that moves, because the counter's other three all
  // hold against teal: the charcoal kick is 45 luma below it, the ivory top 27 above it, and gold
  // is a warm accent on a cyan body rather than the gold-on-walnut collision.
  cafe_counter:         { base: "bar_counter",     ramps: { walnut: "teal" } },
  // Pool & spa deck (#357). Teal is the set's body ramp, so every colorway moves it and then has
  // to move whatever the old accent was — crimson trim on a crimson lounger is the
  // divider_basic_plum failure with the two ramps swapped round.
  sun_lounger_crimson:  { base: "sun_lounger",     ramps: { teal: "crimson", crimson: "sand" } },
  // The sling is the only ramp that moves: ivory stripes and a sand frame differ from crimson and
  // navy alike in hue, not only in luma, which is what armchair_lounge's colorways rest on too.
  deck_chair_crimson:   { base: "deck_chair",      ramps: { teal: "crimson" } },
  deck_chair_navy:      { base: "deck_chair",      ramps: { teal: "navy" } },
  // A straight swap of the two accents. teal -> sand was the first try and it is the exact trap
  // the note above describes: the top is sand, so a sand rim on it disappeared and the table lost
  // its inlay. Crimson keeps the rim in the silhouette and keeps the pair a real exchange.
  parasol_table_teal:   { base: "parasol_table",   ramps: { crimson: "teal", teal: "crimson" } },
  cabana_crimson:       { base: "cabana",          ramps: { teal: "crimson", crimson: "navy" } },
  // The water stays teal — it is water. What moves is the shell, and the rim has to move with it
  // or an ivory rim sinks into a sand shell (the fireplace_stone keystone lesson).
  hot_tub_cedar:        { base: "hot_tub",         ramps: { ivory: "sand", sand: "walnut",
                                                            crimson: "navy" } },
  // Both towels move and they swap corners of the palette: navy against sand on the rail, ivory
  // against crimson on the rolls, so neither pair is two warm neutrals side by side.
  towel_rack_linen:     { base: "towel_rack",      ramps: { teal: "navy", crimson: "sand",
                                                            sand: "crimson" } },
  potted_palm_teal:     { base: "potted_palm",     ramps: { ivory: "teal", teal: "crimson" } },
  drinks_trolley_sunset: { base: "drinks_trolley", ramps: { ivory: "sand", teal: "crimson",
                                                            crimson: "gold", sand: "teal" } },
  // The resort's bar. NOT walnut -> teal: cafe_counter above already took that, and two teal bar
  // counters is one item shipped twice. Sand body, teal top, crimson rail — the pool ramps in the
  // other order, so the three counters differ in body AND in trim.
  bar_counter_pool:     { base: "bar_counter",     ramps: { walnut: "sand", ivory: "teal",
                                                            gold: "crimson" } },
  // Penthouse suites (#356). The set's four ramps differ in hue as well as luma, so the body can
  // move without dragging the trim after it — gold and ivory both read on navy, plum, crimson,
  // fern and charcoal alike. The two that swap more than one ramp are the two whose accent would
  // otherwise land on itself: the armoire's ivory doors on an ivory carcase, and the standing
  // mirror's slate glass, which against a charcoal frame is two blue-greys 23 luma apart.
  bed_grand_plum:       { base: "bed_grand",       ramps: { navy: "plum" } },
  chaise_deco_crimson:  { base: "chaise_deco",     ramps: { navy: "crimson" } },
  screen_deco_jade:     { base: "screen_deco",     ramps: { navy: "fern" } },
  dresser_deco_navy:    { base: "dresser_deco",    ramps: { charcoal: "navy" } },
  ottoman_deco_ivory:   { base: "ottoman_deco",    ramps: { navy: "ivory", ivory: "navy" } },
  armoire_deco_ivory:   { base: "armoire_deco",    ramps: { charcoal: "ivory", ivory: "navy", navy: "charcoal" } },
  mirror_standing_plum: { base: "mirror_standing", ramps: { gold: "plum", navy: "gold", slate: "ivory" } },
  sconce_deco_onyx:     { base: "sconce_deco",     ramps: { gold: "charcoal", navy: "crimson" } },
  // Jazz Lounge (#358). Every lounge base is charcoal hardware under one warm accent, so no
  // colorway here moves a single ramp: swap the body and the accent it was chosen against has to
  // move with it, or the part keeps wearing the old scheme's highlight.
  // Dark skirt, mid deck, and the gold nosing stays gold. sand over walnut with a charcoal nosing
  // was the first try and read as a pale sandbox: on a part that is 90% one flat deck, the deck
  // ramp has to carry the whole object, so it takes the wood and the skirt goes darker under it.
  stage_platform_parquet: { base: "stage_platform",
    ramps: { charcoal: "oak", plum: "walnut" } },
  // oak, not walnut, and the gold stays gold. walnut's hi clamps, which turned the case a garish
  // orange, and a charcoal band on it was two desaturated darks 7 luma apart — the gold-on-walnut
  // trap in both corners at once. oak sits 82 luma under gold and 65 under the ivory keys.
  grand_piano_oak:      { base: "grand_piano",     ramps: { charcoal: "oak" } },
  double_bass_ebony:    { base: "double_bass",     ramps: { oak: "charcoal", charcoal: "slate" } },
  speaker_column_vintage: { base: "speaker_column",
    ramps: { charcoal: "walnut", slate: "charcoal", gold: "ivory" } },
  velvet_booth_plum:    { base: "velvet_booth",    ramps: { crimson: "plum" } },
  // Charcoal upholstery would swallow the charcoal feet, so they go slate.
  velvet_booth_charcoal: { base: "velvet_booth",   ramps: { crimson: "charcoal", charcoal: "slate" } },
  cocktail_table_walnut: { base: "cocktail_table", ramps: { charcoal: "walnut", plum: "crimson" } },
  // The lens rim is crimson against a charcoal can; on a plum can it would be two neighbouring
  // hues, so the rim goes ivory and keeps framing the gold lens.
  stage_light_plum:     { base: "stage_light",     ramps: { charcoal: "plum", crimson: "ivory" } },
  stage_curtain_plum:   { base: "stage_curtain",   ramps: { crimson: "plum" } },
  // Bannerhold pilot colorway (blitz task 5): the oak plank goes slate for dusk; the walnut
  // trestles stay, so the colorway is a different object, not a relabel.
  bannerhold_oak_bench_dusk: { base: "bannerhold_oak_bench", ramps: { oak: "slate" } },
  // Wave A3 colorways (blitz task 8).
  lodge_wood_stove_slate: {  base: "lodge_wood_stove", ramps: {'charcoal': 'slate' }  },
  lodge_log_bed_pine: {  base: "lodge_log_bed", ramps: {'walnut': 'fern' }  },
  lodge_antler_chair_russet: {  base: "lodge_antler_chair", ramps: {'sand': 'crimson' }  },
  lodge_wood_table_cedar: {  base: "lodge_wood_table", ramps: {'oak': 'sand' }  },
  lodge_fur_rug_grey: {  base: "lodge_fur_rug", ramps: {'sand': 'slate', 'ivory': 'slate' }  },
  lodge_lantern_copper: {  base: "lodge_lantern", ramps: {'gold': 'sand' }  },
  pool_hanging_chair_coral: {  base: "pool_hanging_chair", ramps: {'ivory': 'crimson' }  },
  pool_shade_sail_aqua: {  base: "pool_shade_sail", ramps: {'ivory': 'teal' }  },
  pool_side_table_teal: {  base: "pool_side_table", ramps: {'ivory': 'teal' }  },
  pool_float_rack_sunny: {  base: "pool_float_rack", ramps: {'crimson': 'gold' }  },
  pool_towel_cart_white: {  base: "pool_towel_cart", ramps: {'crimson': 'ivory' }  },
  pool_mosaic_rug_lagoon: {  base: "pool_mosaic_rug", ramps: {'teal': 'navy' }  },
  // Wave A4 colorways (blitz task 9).
  penthouse_sofa_ivory: { base: "penthouse_sofa", ramps: { gold: "ivory" } },
  penthouse_marble_table_noir: { base: "penthouse_marble_table", ramps: { ivory: "charcoal" } },
  penthouse_dining_chair_champagne: { base: "penthouse_dining_chair", ramps: { ivory: "sand" } },
  penthouse_bar_midnight: { base: "penthouse_bar", ramps: { walnut: "navy" } },
  penthouse_silk_rug_pearl: { base: "penthouse_silk_rug", ramps: { gold: "ivory" } },
  penthouse_telescope_copper: { base: "penthouse_telescope", ramps: { gold: "sand" } },
  lounge_vibraphone_ivory: { base: "lounge_vibraphone", ramps: { gold: "ivory" } },
  lounge_velvet_sofa_berry: { base: "lounge_velvet_sofa", ramps: { navy: "crimson" } },
  lounge_record_console_smoke: { base: "lounge_record_console", ramps: { walnut: "slate" } },
  lounge_bar_stool_brass: { base: "lounge_bar_stool", ramps: { navy: "sand" } },
  lounge_floor_lamp_amber: { base: "lounge_floor_lamp", ramps: { gold: "sand" } },
  lounge_stage_rug_noir: { base: "lounge_stage_rug", ramps: { navy: "charcoal" } },
  prestige_gold_throne_onyx: { base: "prestige_gold_throne", ramps: { crimson: "charcoal" } },
  prestige_marble_fountain_moonstone: { base: "prestige_marble_fountain", ramps: { teal: "slate" } },
  prestige_crystal_screen_amber: { base: "prestige_crystal_screen", ramps: { teal: "sand" } },
  // Wave B1 colorways (blitz task 10).
  bannerhold_feast_table_crimson: { base: "bannerhold_feast_table", ramps: {'walnut': 'crimson'} },
  bannerhold_high_seat_azure: { base: "bannerhold_high_seat", ramps: {'walnut': 'slate'} },
  bannerhold_war_table_sable: { base: "bannerhold_war_table", ramps: {'walnut': 'slate'} },
  bannerhold_armor_stand_gold: { base: "bannerhold_armor_stand", ramps: {'slate': 'gold'} },
  bannerhold_hearth_brazier_forest: { base: "bannerhold_hearth_brazier", ramps: {'gold': 'crimson'} },
  bannerhold_map_table_ivory: { base: "bannerhold_map_table", ramps: {'walnut': 'sand'} },
  bannerhold_banner_pole_royal: { base: "bannerhold_banner_pole", ramps: {'crimson': 'slate'} },
  bannerhold_shield_rack_ash: { base: "bannerhold_shield_rack", ramps: {'walnut': 'sand'} },
  bannerhold_candle_stand_rust: { base: "bannerhold_candle_stand", ramps: {'gold': 'crimson'} },
  bannerhold_rug_runner_sage: { base: "bannerhold_rug_runner", ramps: {'crimson': 'sand'} },
  bannerhold_spear_rack_bone: { base: "bannerhold_spear_rack", ramps: {'walnut': 'sand'} },
  bannerhold_feast_table_scarlet: { base: "bannerhold_feast_table", ramps: {'oak': 'crimson'} },
  bannerhold_high_seat_navy: { base: "bannerhold_high_seat", ramps: {'crimson': 'slate', 'walnut': 'slate'} },
  bannerhold_war_table_bronze: { base: "bannerhold_war_table", ramps: {'slate': 'sand'} },
  bannerhold_armor_stand_moss: { base: "bannerhold_armor_stand", ramps: {'slate': 'sand'} },
  bannerhold_hearth_brazier_storm: { base: "bannerhold_hearth_brazier", ramps: {'gold': 'slate'} },
  bannerhold_map_table_wine: { base: "bannerhold_map_table", ramps: {'walnut': 'crimson'} },
  // Wave B2 colorways (blitz task 11).
  nocturne_pipe_organ_midnight: { base: "nocturne_pipe_organ", ramps: {'gold': 'charcoal'} },
  nocturne_coffin_daybed_plum: { base: "nocturne_coffin_daybed", ramps: {'plum': 'crimson'} },
  nocturne_high_throne_silver: { base: "nocturne_high_throne", ramps: {'charcoal': 'slate'} },
  nocturne_dusk_sofa_raven: { base: "nocturne_dusk_sofa", ramps: {'plum': 'charcoal'} },
  nocturne_obsidian_table_dusk: { base: "nocturne_obsidian_table", ramps: {'gold': 'slate'} },
  nocturne_iron_gate_wine: { base: "nocturne_iron_gate", ramps: {'charcoal': 'crimson'} },
  nocturne_gramophone_fog: { base: "nocturne_gramophone", ramps: {'gold': 'slate'} },
  nocturne_candelabra_stand_onyx: { base: "nocturne_candelabra_stand", ramps: {'gold': 'charcoal'} },
  nocturne_scrying_font_lilac: { base: "nocturne_scrying_font", ramps: {'plum': 'slate'} },
  nocturne_midnight_rug_ash: { base: "nocturne_midnight_rug", ramps: {'plum': 'slate'} },
  nocturne_nightstand_indigo: { base: "nocturne_nightstand", ramps: {'charcoal': 'navy'} },
  nocturne_raven_perch_pearl: { base: "nocturne_raven_perch", ramps: {'charcoal': 'ivory'} },
  nocturne_pipe_organ_ember: { base: "nocturne_pipe_organ", ramps: {'gold': 'crimson'} },
  nocturne_coffin_daybed_slate: { base: "nocturne_coffin_daybed", ramps: {'plum': 'slate'} },
  nocturne_high_throne_moth: { base: "nocturne_high_throne", ramps: {'plum': 'sand'} },
  nocturne_dusk_sofa_ink: { base: "nocturne_dusk_sofa", ramps: {'plum': 'navy'} },
  nocturne_obsidian_table_amethyst: { base: "nocturne_obsidian_table", ramps: {'charcoal': 'plum'} },
  nocturne_iron_gate_storm: { base: "nocturne_iron_gate", ramps: {'charcoal': 'slate'} },
  // Wave B3 colorways (blitz task 13).
  mochi_day_bed_cream: { base: "mochi_day_bed", ramps: { rose: "ivory" } },
  mochi_day_bed_berry: { base: "mochi_day_bed", ramps: { rose: "crimson" } },
  mochi_boba_cart_sakura: { base: "mochi_boba_cart", ramps: { teal: "rose" } },
  mochi_boba_cart_milk: { base: "mochi_boba_cart", ramps: { teal: "ivory" } },
  mochi_mallow_plush_taro: { base: "mochi_mallow_plush", ramps: { ivory: "plum" } },
  mochi_mallow_plush_yuzu: { base: "mochi_mallow_plush", ramps: { ivory: "sand" } },
  mochi_cloud_sofa_matcha: { base: "mochi_cloud_sofa", ramps: { rose: "fern" } },
  mochi_cloud_sofa_redbean: { base: "mochi_cloud_sofa", ramps: { rose: "crimson" } },
  mochi_pastel_drawers_honey: { base: "mochi_pastel_drawers", ramps: { rose: "gold" } },
  mochi_pastel_drawers_latte: { base: "mochi_pastel_drawers", ramps: { rose: "sand" } },
  mochi_low_table_sesame: { base: "mochi_low_table", ramps: { sand: "charcoal" } },
  mochi_low_table_plum: { base: "mochi_low_table", ramps: { sand: "plum" } },
  mochi_rice_lamp_sky: { base: "mochi_rice_lamp", ramps: { ivory: "navy" } },
  mochi_cloud_rug_peach: { base: "mochi_cloud_rug", ramps: { rose: "sand" } },
  mochi_tea_tray_stand_cocoa: { base: "mochi_tea_tray_stand", ramps: { sand: "walnut", rose: "crimson" } },
  mochi_bean_bag_mint: { base: "mochi_bean_bag", ramps: { teal: "fern" } },
  mochi_floor_cushion_lilac: { base: "mochi_floor_cushion", ramps: { rose: "plum" } },
  mochi_round_stool_butter: { base: "mochi_round_stool", ramps: { sand: "gold" } },
  // Wave B4 colorways (blitz task 14).
  starliner_bunk_pod_chrome: { base: "starliner_bunk_pod", ramps: { charcoal: "slate" } },
  starliner_bunk_pod_drift: { base: "starliner_bunk_pod", ramps: { navy: "slate" } },
  starliner_console_nebula: { base: "starliner_console", ramps: { navy: "teal" } },
  starliner_console_flare: { base: "starliner_console", ramps: { teal: "signal" } },
  starliner_captain_chair_solar: { base: "starliner_captain_chair", ramps: { navy: "gold" } },
  starliner_captain_chair_cosmic: { base: "starliner_captain_chair", ramps: { charcoal: "slate" } },
  starliner_navigation_desk_nova: { base: "starliner_navigation_desk", ramps: { charcoal: "teal" } },
  starliner_navigation_desk_xenon: { base: "starliner_navigation_desk", ramps: { teal: "ivory" } },
  starliner_galley_counter_comet: { base: "starliner_galley_counter", ramps: { slate: "teal" } },
  starliner_galley_counter_radar: { base: "starliner_galley_counter", ramps: { charcoal: "slate" } },
  starliner_holo_projector_ion: { base: "starliner_holo_projector", ramps: { slate: "teal" } },
  starliner_holo_projector_astro: { base: "starliner_holo_projector", ramps: { signal: "teal" } },
  starliner_viewport_seat_orbit: { base: "starliner_viewport_seat", ramps: { navy: "teal" } },
  starliner_corridor_light_lunar: { base: "starliner_corridor_light", ramps: { teal: "ivory" } },
  starliner_docking_bench_ember: { base: "starliner_docking_bench", ramps: { navy: "signal" } },
  starliner_orbit_table_void: { base: "starliner_orbit_table", ramps: { navy: "charcoal" } },
  starliner_suit_rack_aurora: { base: "starliner_suit_rack", ramps: { charcoal: "teal" } },
  starliner_cargo_crate_pulse: { base: "starliner_cargo_crate", ramps: { navy: "teal" } },
  // Wave B5 colorways (blitz task 15).
  fablewood_moss_bed_moss: { base: "fablewood_moss_bed", ramps: { sand: "fern" } },
  fablewood_moss_bed_dusk: { base: "fablewood_moss_bed", ramps: { sand: "aether" } },
  fablewood_wizard_desk_acorn: { base: "fablewood_wizard_desk", ramps: { gold: "oak" } },
  fablewood_wizard_desk_honey: { base: "fablewood_wizard_desk", ramps: { fern: "gold" } },
  fablewood_alchemy_bench_fern: { base: "fablewood_alchemy_bench", ramps: { gold: "ivory" } },
  fablewood_alchemy_bench_sage: { base: "fablewood_alchemy_bench", ramps: { sand: "fern" } },
  fablewood_root_chair_bark: { base: "fablewood_root_chair", ramps: { fern: "oak" } },
  fablewood_root_chair_rust: { base: "fablewood_root_chair", ramps: { fern: "rose" } },
  fablewood_spellbook_shelf_dawn: { base: "fablewood_spellbook_shelf", ramps: { fern: "ivory" } },
  fablewood_spellbook_shelf_petal: { base: "fablewood_spellbook_shelf", ramps: { fern: "rose" } },
  fablewood_crystal_orb_berry: { base: "fablewood_crystal_orb", ramps: { aether: "rose" } },
  fablewood_runestone_mist: { base: "fablewood_runestone", ramps: { aether: "slate" } },
  fablewood_firefly_lantern_clover: { base: "fablewood_firefly_lantern", ramps: { gold: "fern" } },
  fablewood_stump_table_amber: { base: "fablewood_stump_table", ramps: { fern: "gold" } },
  fablewood_leaf_rug_thorn: { base: "fablewood_leaf_rug", ramps: { sand: "oak" } },
  fablewood_mushroom_stool_willow: { base: "fablewood_mushroom_stool", ramps: { ivory: "slate" } },
  fablewood_aether_throne_brook: { base: "fablewood_aether_throne", ramps: { fern: "slate" } },
  fablewood_aether_throne_stone: { base: "fablewood_aether_throne", ramps: { ivory: "slate" } },
  // Wave B6 colorways (blitz task 16).

  // Wave B7 colorways (blitz task 17).
  verdant_canopy_bed_fern: { base: "verdant_canopy_bed", ramps: { oak: "teal", fern: "oak" } },
  verdant_canopy_bed_rain: { base: "verdant_canopy_bed", ramps: { oak: "ivory", fern: "teal" } },
  verdant_potting_bench_moss: { base: "verdant_potting_bench", ramps: { oak: "fern", sand: "teal" } },
  verdant_potting_bench_honey: { base: "verdant_potting_bench", ramps: { oak: "gold", sand: "oak" } },
  verdant_terrarium_case_sage: { base: "verdant_terrarium_case", ramps: { teal: "fern", oak: "sand" } },
  verdant_terrarium_case_olive: { base: "verdant_terrarium_case", ramps: { teal: "rose", oak: "fern" } },
  verdant_watering_cart_bloom: { base: "verdant_watering_cart", ramps: { walnut: "oak", rose: "sand" } },
  verdant_watering_cart_rose: { base: "verdant_watering_cart", ramps: { walnut: "oak", sand: "rose" } },
  verdant_trellis_screen_clay: { base: "verdant_trellis_screen", ramps: { oak: "rose", fern: "sand" } },
  verdant_trellis_screen_mint: { base: "verdant_trellis_screen", ramps: { oak: "teal", fern: "oak" } },
  verdant_herb_table_dew: { base: "verdant_herb_table", ramps: { oak: "teal", fern: "oak" } },
  verdant_herb_table_bark: { base: "verdant_herb_table", ramps: { sand: "walnut" } },
  verdant_wicker_chair_cedar: { base: "verdant_wicker_chair", ramps: { sand: "oak", oak: "walnut" } },
  verdant_plant_stand_sprout: { base: "verdant_plant_stand", ramps: { walnut: "fern", rose: "rose" } },
  verdant_vine_lamp_amber: { base: "verdant_vine_lamp", ramps: { fern: "oak", gold: "rose" } },
  verdant_moss_rug_ivy: { base: "verdant_moss_rug", ramps: { fern: "teal", sand: "oak" } },
  verdant_garden_stool_petal: { base: "verdant_garden_stool", ramps: { sand: "rose", oak: "teal" } },
  verdant_seed_drawers_stone: { base: "verdant_seed_drawers", ramps: { sand: "oak", oak: "teal", walnut: "slate" } },
  tidal_shell_bed_aqua: { base: "tidal_shell_bed", ramps: { ivory: "teal" } },
  tidal_shell_bed_dusk: { base: "tidal_shell_bed", ramps: { sand: "navy" } },
  tidal_net_hammock_coral: { base: "tidal_net_hammock", ramps: { teal: "crimson" } },
  tidal_net_hammock_reef: { base: "tidal_net_hammock", ramps: { teal: "fern" } },
  tidal_tide_pool_bar_pearl: { base: "tidal_tide_pool_bar", ramps: { teal: "ivory" } },
  tidal_tide_pool_bar_brine: { base: "tidal_tide_pool_bar", ramps: { teal: "slate" } },
  tidal_chart_desk_kelp: { base: "tidal_chart_desk", ramps: { ivory: "fern" } },
  tidal_chart_desk_sun: { base: "tidal_chart_desk", ramps: { walnut: "oak" } },
  tidal_coral_table_sand: { base: "tidal_coral_table", ramps: { teal: "sand" } },
  tidal_coral_table_mist: { base: "tidal_coral_table", ramps: { ivory: "slate" } },
  tidal_reef_shelf_foam: { base: "tidal_reef_shelf", ramps: { teal: "ivory" } },
  tidal_reef_shelf_wave: { base: "tidal_reef_shelf", ramps: { walnut: "navy" } },
  tidal_shell_vanity_lagoon: { base: "tidal_shell_vanity", ramps: { ivory: "teal" } },
  tidal_driftwood_bench_drift: { base: "tidal_driftwood_bench", ramps: { oak: "sand" } },
  tidal_pearl_lamp_storm: { base: "tidal_pearl_lamp", ramps: { ivory: "navy" } },
  tidal_kelp_planter_shell: { base: "tidal_kelp_planter", ramps: { sand: "ivory" } },
  tidal_wave_rug_deep: { base: "tidal_wave_rug", ramps: { navy: "charcoal" } },
  tidal_buoy_stool_spray: { base: "tidal_buoy_stool", ramps: { teal: "slate" } },

  // Wave A2 colorways (blitz task 7).
  casino_card_table_emerald: {  base: "casino_card_table", ramps: {'walnut': 'oak' }  },
  casino_dice_table_noir: {  base: "casino_dice_table", ramps: {'teal': 'charcoal' }  },
  casino_chip_rack_gold: {  base: "casino_chip_rack", ramps: {'walnut': 'gold' }  },
  casino_dealer_chair_oxblood: {  base: "casino_dealer_chair", ramps: {'charcoal': 'walnut' }  },
  casino_velvet_rope_crimson: {  base: "casino_velvet_rope", ramps: {'gold': 'charcoal' }  },
  casino_round_rug_onyx: {  base: "casino_round_rug", ramps: {'crimson': 'charcoal' }  },
  casino_pendant_lamp_brass: {  base: "casino_pendant_lamp", ramps: {'gold': 'sand' }  },
  // Wave A1 colorways (blitz task 6).
  starter_armchair_sky: {  base: "starter_armchair", ramps: {"sand": "navy" }  },
  starter_coffee_table_walnut: {  base: "starter_coffee_table", ramps: {"walnut": "oak" }  },
  starter_entry_mat_sunny: {  base: "starter_entry_mat", ramps: {"crimson": "gold" }  },
  starter_floor_lamp_mint: {  base: "starter_floor_lamp", ramps: {"ivory": "fern" }  },
  cafe_espresso_machine_copper: {  base: "cafe_espresso_machine", ramps: {"charcoal": "sand" }  },
  cafe_bakery_island_sage: {  base: "cafe_bakery_island", ramps: {"ivory": "fern" }  },
  cafe_bistro_table_terracotta: {  base: "cafe_bistro_table", ramps: {"ivory": "crimson" }  },
  cafe_bistro_chair_cream: {  base: "cafe_bistro_chair", ramps: {"teal": "ivory" }  },
  cafe_pastry_case_walnut: {  base: "cafe_pastry_case", ramps: {"walnut": "charcoal" }  },
  cafe_barista_stool_honey: {  base: "cafe_barista_stool", ramps: {"crimson": "gold" }  },
  bedroom_bed_frame_blush: {  base: "bedroom_bed_frame", ramps: {"navy": "crimson" }  },
  bedroom_dresser_ivory: {  base: "bedroom_dresser", ramps: {"oak": "ivory" }  },
  bedroom_nightstand_walnut: {  base: "bedroom_nightstand", ramps: {"oak": "walnut" }  },
  bedroom_wardrobe_mist: {  base: "bedroom_wardrobe", ramps: {"oak": "slate" }  },
  bedroom_vanity_ivory: {  base: "bedroom_vanity", ramps: {"walnut": "ivory" }  },
  bedroom_rug_dusk: {  base: "bedroom_rug", ramps: {"plum": "navy" }  },
  bedroom_table_lamp_sage: {  base: "bedroom_table_lamp", ramps: {"ivory": "fern" }  },
  bedroom_bench_linen: {  base: "bedroom_bench", ramps: {"plum": "ivory" }  },
  bedroom_reading_chair_plum: {  base: "bedroom_reading_chair", ramps: {"plum": "crimson" }  },
};

function recolor(base: PartMeta, remap: Record<string, string>): PartMeta {
  const swap = (name: string): string => remap[name] ?? name;
  return {
    ...base,
    ramp: swap(base.ramp),
    prims: base.prims.map((p) => ({ ...p, ramp: swap(p.ramp) })),
  };
}
const meta = JSON.parse(readFileSync(join(renderDir, "meta.json"), "utf8")) as {
  res: number;
  parts: Record<string, PartMeta>;
};
const RES = meta.res;

/** Mask channels render at exactly {0, 187, 255} (linear {0, .5, 1} through sRGB). */
function maskDigit(v: number): number {
  return v < 94 ? 0 : v < 221 ? 1 : 2;
}

function outlineSilhouette(c: Canvas): void {
  const edge: Array<[number, number]> = [];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (getPixel(c, x, y).alpha === 0) continue;
      const open =
        x === 0 || y === 0 || x === c.w - 1 || y === c.h - 1 ||
        getPixel(c, x - 1, y).alpha === 0 || getPixel(c, x + 1, y).alpha === 0 ||
        getPixel(c, x, y - 1).alpha === 0 || getPixel(c, x, y + 1).alpha === 0;
      if (open) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) putPixel(c, x, y, OUTLINE);
}

function upscale(c: Canvas, k: number): Canvas {
  const out = makeCanvas(c.w * k, c.h * k);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const i = ((y / k | 0) * c.w + (x / k | 0)) * 4;
      const j = (y * out.w + x) * 4;
      out.px[j] = c.px[i] ?? 0; out.px[j + 1] = c.px[i + 1] ?? 0;
      out.px[j + 2] = c.px[i + 2] ?? 0; out.px[j + 3] = c.px[i + 3] ?? 0;
    }
  }
  return out;
}

/** Key-sorted copy, so JSON.stringify is canonical. */
function sorted(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(sorted);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, v]) => [k, sorted(v)]),
  );
}

// What the bundle was authored against. PIPELINES §2: freezing makes the bundle the item's
// identity and demotes the recipe to provenance — a record of the past, not a mirror of the
// current pins.
const PROVENANCE_KEYS = ["styleVersion", "generatorVersion", "partLibraryHash", "recipeHash"];

/** The bundle meta minus its provenance, canonical — equality here means the pixels and every
 *  declared measurement are unmoved and only the style pins have advanced (#234). */
function withoutProvenance(meta: object): string {
  return JSON.stringify(sorted(
    Object.fromEntries(Object.entries(meta).filter(([k]) => !PROVENANCE_KEYS.includes(k))),
  ));
}

/** Canonical JSON (sorted keys) of the authored mesh + style pins — the provenance hash. */
function provenanceHash(id: string, part: PartMeta): string {
  return createHash("sha256")
    .update(JSON.stringify(sorted({
      id, w: part.w, l: part.l, ramp: part.ramp, prims: part.prims, src: part.src,
      spin: part.spin,
      styleVersion: STYLE_VERSION, generatorVersion: GENERATOR_VERSION,
    })))
    .digest("hex");
}

if (freeze) mkdirSync(frozenDir, { recursive: true });
let failures = 0;

const work: Array<[string, PartMeta]> = Object.entries(meta.parts);
for (const [id, variant] of Object.entries(VARIANTS)) {
  const base = meta.parts[variant.base];
  if (!base) {
    console.error(`${id}: variant base "${variant.base}" is not in ${renderDir}/meta.json`);
    failures++;
    continue;
  }
  if (meta.parts[id]) {
    console.error(`${id}: a colorway cannot share an id with a rendered part — both would freeze`);
    failures++;
    continue;
  }
  work.push([id, recolor(base, variant.ramps)]);
}

for (const [id, part] of work) {
  const isProof = id.startsWith("proof_");
  const isWall = part.surface === "wall";
  const catalogDef = isWall ? undefined : PROTOTYPE_CATALOG.find((d) => d.id === id);
  const wallDef = isWall ? WALL_CATALOG.find((d) => d.id === id) : undefined;
  const heightPx = Math.ceil(part.maxZ * ZU);
  // A wall def's numbers come off the assembled sheet, not the mesh, so its missing-def message
  // waits until after the frames exist. The floor one can bail early.
  if (!isWall && !isProof && !catalogDef) {
    // Both numbers come off the mesh, so hand them over rather than making the author derive
    // ceil(maxZ*32)/32 and read the seat surface out of the rig by eye.
    console.error(
      `${id}: no FurniDef in packages/shared/src/furni.ts. Add this, then re-run:\n` +
      `  { id: "${id}", name: "${id}", w: ${part.w}, l: ${part.l}, ` +
      `stackHeights: [${heightPx / ZU}], canWalk: false, canStackOn: false, ` +
      `seatHeight: ${part.seatZ}, color: 0x000000 },`,
    );
    failures++;
    continue;
  }
  const ramps = part.prims.map((p) => rampByName(p.ramp));
  const frameW = (part.w + part.l) * H;
  const frameH = (part.w + part.l) * V + heightPx;
  const raws = part.frames.map((f) => readFileSync(join(renderDir, f.rgba)));
  const masks = part.frames.map((f) => readFileSync(join(renderDir, f.mask)));

  // #430: the sheet is a grid, direction across and state down — state 0 in row 0, so a part with
  // one state lays out exactly as it always did. `dirs` is read off state 0 alone, which every
  // part has; the later states are the same object with a sub-assembly turned, so they repeat it
  // direction for direction. The seat-occluder row, when there is one, follows the last state row
  // (see BundleMeta.states) — it is no longer row 1 by construction.
  const dirs = part.frames.filter((f) => (f.state ?? 0) === 0).map((f) => f.dir);
  const states = Math.max(...part.frames.map((f) => f.state ?? 0)) + 1;
  const sheet = makeCanvas(frameW * dirs.length, frameH * states);
  // #227: the same frames again, keeping only the prims that draw IN FRONT of a seated occupant.
  // A companion sheet rather than a new base sheet layout, so the base bytes and the pixelHash
  // that is the item's identity never move. One row: a seat does not turn.
  const nearSheet = makeCanvas(frameW * dirs.length, frameH);
  let hasNear = false;
  const anchorsX: number[] = [];
  const boxes: Array<BBox | null> = [];
  for (let q = 0; q < part.frames.length; q++) {
    const { spanY, state = 0 } = part.frames[q]!;
    const col = dirs.indexOf(part.frames[q]!.dir);
    if (state === 0) anchorsX.push(spanY * H);
    const frame = makeCanvas(frameW, frameH);
    const nearOf = part.frames[q]!.near ?? [];
    const groupAt = new Int32Array(frameW * frameH).fill(-1);
    const rampAt = new Int32Array(frameW * frameH).fill(-1);
    const raw = raws[q]!;
    const mask = masks[q]!;
    // rig.py projection: footprint (fx,fy,z) -> render px (RES/2 + (fx-fy)*32, RES/2 + 16 +
    // (fx+fy-1)*16 - z*32); compose frame anchor is (spanY*32, 16 + heightPx). Inverse map:
    for (let fy = 0; fy < frameH; fy++) {
      const ry = fy + RES / 2 - heightPx;
      if (ry < 0 || ry >= RES) continue;
      for (let fx = 0; fx < frameW; fx++) {
        const rx = fx + RES / 2 - spanY * H;
        if (rx < 0 || rx >= RES) continue;
        const i = (ry * RES + rx) * 4;
        if ((raw[i + 3] ?? 0) < ALPHA_MIN) continue;
        const n = maskDigit(mask[i] ?? 0) + 3 * maskDigit(mask[i + 1] ?? 0) + 9 * maskDigit(mask[i + 2] ?? 0);
        // lit-pass AA can cover a pixel the maskless pass misses — fall back to prim 0
        const prim = n > 0 && n <= part.prims.length ? n - 1 : 0;
        const ramp = ramps[prim]!;
        const luma = (j: number): number => 0.299 * toLinear(raw[j] ?? 0)
          + 0.587 * toLinear(raw[j + 1] ?? 0) + 0.114 * toLinear(raw[j + 2] ?? 0);
        const t = luma(i);
        let band = t < THRESH_LEFT ? 1 : t < THRESH_RIGHT ? 2 : t < THRESH_TOP ? 3 : 4;
        // Within DITHER_BAND of the threshold above (still under it) or below (just over it)?
        const above = band < 4 && THRESHOLDS[band - 1]! - t < DITHER_BAND;
        const below = band > 1 && t - THRESHOLDS[band - 2]! < DITHER_BAND;
        if ((above || below) && ((fx >> 1) + (fy >> 1)) % 2 === 1) {
          const g = Math.max(
            Math.abs(luma(i + 4) - luma(i - 4)),
            Math.abs(luma(i + RES * 4) - luma(i - RES * 4)),
          );
          // The bible's size rule, measured on the mask: a table leg is a curve too, but at
          // 7 px wide its whole transition is a pixel or two and checker there is only noise.
          let run = 1;
          for (let d = 1; d <= 6 && maskDigit(mask[i - 4 * d] ?? 0) + 3 * maskDigit(mask[i - 4 * d + 1] ?? 0) + 9 * maskDigit(mask[i - 4 * d + 2] ?? 0) === n; d++) run++;
          for (let d = 1; d <= 6 && maskDigit(mask[i + 4 * d] ?? 0) + 3 * maskDigit(mask[i + 4 * d + 1] ?? 0) + 9 * maskDigit(mask[i + 4 * d + 2] ?? 0) === n; d++) run++;
          if (run >= 10 && g > CURVE_MIN && g < CURVE_MAX) band += above ? 1 : -1;
        }
        const shade = [ramp.left, ramp.right, ramp.top, ramp.hi][band - 1]!;
        putPixel(frame, fx, fy, shade);
        groupAt[fy * frameW + fx] = part.prims[prim]!.group;
        rampAt[fy * frameW + fx] = prim;
      }
    }
    // interior detail lines: 1px in the local ramp's darkest shade along prim-group boundaries
    const lined = new Uint8Array(frameW * frameH);
    for (let fy = 0; fy < frameH; fy++) {
      for (let fx = 0; fx < frameW; fx++) {
        const g = groupAt[fy * frameW + fx]!;
        if (g < 0) continue;
        const right = fx + 1 < frameW ? groupAt[fy * frameW + fx + 1]! : -1;
        const down = fy + 1 < frameH ? groupAt[(fy + 1) * frameW + fx]! : -1;
        if ((right >= 0 && right !== g) || (down >= 0 && down !== g)) {
          putPixel(frame, fx, fy, ramps[rampAt[fy * frameW + fx]!]!.outline);
          lined[fy * frameW + fx] = 1;
        }
      }
    }
    // Crease shade: the pixel under a detail line drops one shade — the dirt in the seam that
    // grounds a leg against an apron or a lid against a body. One pixel, never on a line.
    for (let fy = 1; fy < frameH; fy++) {
      for (let fx = 0; fx < frameW; fx++) {
        if (!lined[(fy - 1) * frameW + fx] || lined[fy * frameW + fx]) continue;
        const prim = rampAt[fy * frameW + fx]!;
        if (prim < 0) continue;
        const ramp = ramps[prim]!;
        const here = getPixel(frame, fx, fy).color;
        const darker = here === ramp.hi ? ramp.top : here === ramp.top ? ramp.right
          : here === ramp.right ? ramp.left : null;
        if (darker !== null) putPixel(frame, fx, fy, darker);
      }
    }
    outlineSilhouette(frame);
    if (state === 0) boxes.push(opaqueBox(frame));
    blit(sheet, frame, col * frameW, state * frameH);

    if (state === 0 && nearOf.some(Boolean)) {
      // Cut from the FINISHED frame, so the near half carries the same outlines and detail lines
      // the base does — re-rendering it separately would give it its own silhouette.
      const nearFrame = makeCanvas(frameW, frameH);
      for (let fy = 0; fy < frameH; fy++) {
        for (let fx = 0; fx < frameW; fx++) {
          const prim = rampAt[fy * frameW + fx]!;
          if (prim < 0 || !nearOf[prim]) continue;
          const px = getPixel(frame, fx, fy);
          if (px.alpha === 0) continue;
          putPixel(nearFrame, fx, fy, px.color);
        }
      }
      blit(nearSheet, nearFrame, col * frameW, 0);
      hasNear = true;
    }
  }

  const png = encodePng(sheet.w, sheet.h, sheet.px);
  writeFileSync(join(renderDir, `${id}.png`), png);
  const nearPng = hasNear ? encodePng(nearSheet.w, nearSheet.h, nearSheet.px) : null;
  if (nearPng) writeFileSync(join(renderDir, `${id}.near.png`), nearPng);
  const big = upscale(sheet, 3);
  writeFileSync(join(renderDir, `${id}@3x.png`), encodePng(big.w, big.h, big.px));

  const plane = isWall && boxes[0]
    ? wallPlane(boxes[0], anchorsX[0] ?? 0, V + heightPx)
    : null;
  if (isWall && !plane) {
    console.error(`${id}: dir 0 frame is empty — nothing to hang`);
    failures++;
    continue;
  }
  if (plane && plane.mountU < 0) {
    console.error(
      `${id}: renders ${-plane.mountU}px before its own segment starts. Depth projects into ` +
      `screen width, so shift the mesh along the wall until min fx >= max fy.`,
    );
    failures++;
    continue;
  }
  if (isWall && !wallDef) {
    // Every number is read off the render — hand them over rather than making the author
    // measure a parallelogram by eye.
    console.error(
      `${id}: no WallDef in packages/shared/src/furni.ts. Add this, then re-run:\n` +
      `  { id: "${id}", name: "${id}", span: ${part.w}, ` +
      `plane: { w: ${plane?.planeW}, h: ${plane?.planeH} }, ` +
      `mount: { u: ${plane?.mountU}, v: ${plane?.mountV} }, color: 0x000000 },`,
    );
    failures++;
    continue;
  }

  const def: FurniDef = catalogDef ?? {
    id, name: id, theme: "unassigned", w: part.w, l: part.l, stackHeights: [heightPx / ZU],
    canWalk: false, canStackOn: false, seatHeight: part.seatZ, color: 0,
  };
  const recipeHash = provenanceHash(id, part);
  const bundle: Bundle = {
    sheet,
    // A 3D-assisted part ships frozen pixels, not boxes — which is why gateDrawOrder and
    // gateSeatOcclusion cannot reach it (#233). They read this field to know that.
    geometry: null,
    meta: {
      defId: id, archetype: isProof ? "proof" : "artgen", sheet: `${id}.png`, frameW, frameH,
      dirs, anchorsX, anchorY: V + heightPx,
      footprint: { w: part.w, l: part.l },
      // `occlusion` stays null: that is the in-sheet row-1 split the procedural composer emits,
      // and the Blender path has never had one (#235). A 3D-assisted seat splits through the
      // companion near-sheet below instead, which the client sorts on the same `seat_front` layer.
      drawnHeight: heightPx / ZU, seatZ: part.seatZ, occlusion: null,
      // Declared only when the part authored more than one (#430), so a still part's frozen
      // metadata — and the provenance check that reads it — is unmoved.
      ...(states > 1 ? { states } : {}),
      ...(plane ? { wall: { span: part.w, ...plane, gap: part.wallGap, depth: part.wallDepth } } : {}),
      ...(hasNear
        ? { nearSheet: `${id}.near.png`,
            nearHash: createHash("sha256").update(nearSheet.px).digest("hex") }
        : {}),
      styleVersion: STYLE_VERSION,
      generatorVersion: GENERATOR_VERSION,
      partLibraryHash: `artgen:${recipeHash.slice(0, 16)}`, recipeHash,
      pixelHash: createHash("sha256").update(sheet.px).digest("hex"),
    },
  };
  // Visual review (#258): warnings, not gates. Printed before the gate line so a detached part
  // is visible next to the ${id}@3x.png just written, whether or not the gates pass.
  for (const w of reviewIslands(bundle)) {
    console.warn(`${id}: WARN ${w.where}: ${w.detail}`);
  }
  const primGate = gatePrimCount(part.prims.length);
  if (!primGate.ok) {
    failures++;
    console.error(`${id}: FAIL ${primGate.gate} gate: ${primGate.detail}`);
    continue;
  }
  if (isWall && wallDef) {
    const mountGate = gateWallMountEven(wallDef.mount.u);
    if (!mountGate.ok) {
      failures++;
      console.error(`${id}: FAIL ${mountGate.gate} gate: ${mountGate.detail}`);
      continue;
    }
  }
  const result = wallDef ? runWallGates(bundle, wallDef) : runGates(bundle, def);
  if (!result.ok) {
    failures++;
    console.error(`${id}: FAIL ${result.gate} gate: ${result.detail}`);
    continue;
  }
  console.log(`${id}: PASS all gates  (${frameW}x${frameH} frames${states > 1 ? `, ${states} states` : ""})`);
  if (freeze && !isProof) {
    const metaPath = join(frozenDir, `${id}.json`);
    // #234: a style or generator bump moves every recipeHash, but a bundle it did not repaint was
    // still authored under the old pins. Leave it saying so — otherwise `make art` for one part
    // sweeps a false provenance record onto every other frozen bundle, visible only in git status.
    const prior = existsSync(metaPath)
      ? JSON.parse(readFileSync(metaPath, "utf8")) as Record<string, unknown>
      : null;
    if (prior && withoutProvenance(prior) === withoutProvenance(bundle.meta)) {
      console.log(`${id}: unchanged — kept the provenance it was frozen with`);
    } else {
      writeFileSync(join(frozenDir, `${id}.png`), png);
      if (nearPng) writeFileSync(join(frozenDir, `${id}.near.png`), nearPng);
      writeFileSync(metaPath, JSON.stringify(bundle.meta, null, 2));
      console.log(`${id}: frozen`);
    }
  }
}

process.exit(failures === 0 ? 0 : 1);
