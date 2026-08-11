// Content blitz ledger (docs/plans/2026-08-11-furniture-content-blitz-catalog.md, Appendix A/B).
// The manifest is the release ledger: 500 new furniture/wall defs and 102 decor tiles. These
// tests pin the ledger's shape, then gate every landed wave against the authoritative catalogs —
// each wave adds its ids to LANDED_BLITZ_IDS / LANDED_DECOR_IDS (packages/shared/src/furni.ts)
// in the same commit as its defs and assets. The ledger constants were generated from the plan
// file; if the plan's appendix changes, regenerate rather than hand-patch.

import { expect, test } from "vitest";
import { DECOR_CATALOG } from "../src/decor.ts";
import {
  CATALOG_PRICES, LANDED_BLITZ_IDS, LANDED_DECOR_IDS, PRESTIGE_DEFS, PROTOTYPE_CATALOG,
  RELEASED_PRESTIGE_IDS, STARTER_GRANT_DEFS, UNPRICED, WALL_CATALOG,
} from "../src/furni.ts";
import { COLLECTION_SETS, SET_REWARD_DEFS } from "../src/sets.ts";

interface BlitzEntry {
  id: string;
  theme: string;
  kind: "floor" | "wall";
  role: "base" | "colorway" | "wall";
  price?: number;
  reward?: true;
  base?: string;
}

interface BlitzDecor {
  id: string;
  theme: string;
  kind: "floor" | "wall";
}

// Appendix A — 500 furniture/wall entries. Bases and walls carry their price; a colorway
// inherits its base's price and geometry. Entries marked reward are the 13 earn-only
// collection rewards.
const BLITZ: readonly BlitzEntry[] = [
  // ── Track A · starter (12) ──
  { id: "starter_armchair", theme: "starter", kind: "floor", role: "base", price: 50 },
  { id: "starter_coffee_table", theme: "starter", kind: "floor", role: "base", price: 75 },
  { id: "starter_entry_mat", theme: "starter", kind: "floor", role: "base", price: 25 },
  { id: "starter_floor_lamp", theme: "starter", kind: "floor", role: "base", price: 50 },
  { id: "starter_bookcase", theme: "starter", kind: "floor", role: "base", price: 75 },
  { id: "starter_armchair_sky", theme: "starter", kind: "floor", role: "colorway", base: "starter_armchair", price: 50 },
  { id: "starter_coffee_table_walnut", theme: "starter", kind: "floor", role: "colorway", base: "starter_coffee_table", price: 75 },
  { id: "starter_entry_mat_sunny", theme: "starter", kind: "floor", role: "colorway", base: "starter_entry_mat", price: 25 },
  { id: "starter_floor_lamp_mint", theme: "starter", kind: "floor", role: "colorway", base: "starter_floor_lamp", price: 50 },
  { id: "starter_wall_clock", theme: "starter", kind: "wall", role: "wall", price: 25 },
  { id: "starter_poster_set", theme: "starter", kind: "wall", role: "wall", price: 25 },
  { id: "starter_wall_shelf", theme: "starter", kind: "wall", role: "wall", price: 50 },
  // ── Track A · casino (20) ──
  { id: "casino_card_table", theme: "casino", kind: "floor", role: "base", price: 300 },
  { id: "casino_dice_table", theme: "casino", kind: "floor", role: "base", price: 250 },
  { id: "casino_chip_rack", theme: "casino", kind: "floor", role: "base", price: 75 },
  { id: "casino_dealer_chair", theme: "casino", kind: "floor", role: "base", price: 150 },
  { id: "casino_velvet_rope", theme: "casino", kind: "floor", role: "base", price: 75 },
  { id: "casino_round_rug", theme: "casino", kind: "floor", role: "base", price: 150 },
  { id: "casino_pendant_lamp", theme: "casino", kind: "floor", role: "base", price: 75 },
  { id: "casino_banquette", theme: "casino", kind: "floor", role: "base", price: 150 },
  { id: "casino_card_table_emerald", theme: "casino", kind: "floor", role: "colorway", base: "casino_card_table", price: 300 },
  { id: "casino_dice_table_noir", theme: "casino", kind: "floor", role: "colorway", base: "casino_dice_table", price: 250 },
  { id: "casino_chip_rack_gold", theme: "casino", kind: "floor", role: "colorway", base: "casino_chip_rack", price: 75 },
  { id: "casino_dealer_chair_oxblood", theme: "casino", kind: "floor", role: "colorway", base: "casino_dealer_chair", price: 150 },
  { id: "casino_velvet_rope_crimson", theme: "casino", kind: "floor", role: "colorway", base: "casino_velvet_rope", price: 75 },
  { id: "casino_round_rug_onyx", theme: "casino", kind: "floor", role: "colorway", base: "casino_round_rug", price: 150 },
  { id: "casino_pendant_lamp_brass", theme: "casino", kind: "floor", role: "colorway", base: "casino_pendant_lamp", price: 75 },
  { id: "casino_neon_dice", theme: "casino", kind: "wall", role: "wall", price: 150 },
  { id: "casino_card_mural", theme: "casino", kind: "wall", role: "wall", price: 150 },
  { id: "casino_gold_sconce", theme: "casino", kind: "wall", role: "wall", price: 75 },
  { id: "casino_velvet_drape", theme: "casino", kind: "wall", role: "wall", price: 75 },
  { id: "casino_marquee_sign", theme: "casino", kind: "wall", role: "wall", price: 150 },
  // ── Track A · cafe (20) ──
  { id: "cafe_espresso_machine", theme: "cafe", kind: "floor", role: "base", price: 400 },
  { id: "cafe_bakery_island", theme: "cafe", kind: "floor", role: "base", price: 250 },
  { id: "cafe_bistro_table", theme: "cafe", kind: "floor", role: "base", price: 75 },
  { id: "cafe_bistro_chair", theme: "cafe", kind: "floor", role: "base", price: 50 },
  { id: "cafe_pastry_case", theme: "cafe", kind: "floor", role: "base", price: 150 },
  { id: "cafe_barista_stool", theme: "cafe", kind: "floor", role: "base", price: 50 },
  { id: "cafe_potted_herb", theme: "cafe", kind: "floor", role: "base", price: 25 },
  { id: "cafe_woven_rug", theme: "cafe", kind: "floor", role: "base", price: 75 },
  { id: "cafe_espresso_machine_copper", theme: "cafe", kind: "floor", role: "colorway", base: "cafe_espresso_machine", price: 400 },
  { id: "cafe_bakery_island_sage", theme: "cafe", kind: "floor", role: "colorway", base: "cafe_bakery_island", price: 250 },
  { id: "cafe_bistro_table_terracotta", theme: "cafe", kind: "floor", role: "colorway", base: "cafe_bistro_table", price: 75 },
  { id: "cafe_bistro_chair_cream", theme: "cafe", kind: "floor", role: "colorway", base: "cafe_bistro_chair", price: 50 },
  { id: "cafe_pastry_case_walnut", theme: "cafe", kind: "floor", role: "colorway", base: "cafe_pastry_case", price: 150 },
  { id: "cafe_barista_stool_honey", theme: "cafe", kind: "floor", role: "colorway", base: "cafe_barista_stool", price: 50 },
  { id: "cafe_menu_board", theme: "cafe", kind: "wall", role: "wall", price: 75 },
  { id: "cafe_chalk_art", theme: "cafe", kind: "wall", role: "wall", price: 25 },
  { id: "cafe_cup_shelf", theme: "cafe", kind: "wall", role: "wall", price: 50 },
  { id: "cafe_neon_cup", theme: "cafe", kind: "wall", role: "wall", price: 150 },
  { id: "cafe_tile_mural", theme: "cafe", kind: "wall", role: "wall", price: 150 },
  { id: "cafe_herb_pressing", theme: "cafe", kind: "wall", role: "wall", price: 25 },
  // ── Track A · bedroom (26) ──
  { id: "bedroom_bed_frame", theme: "bedroom", kind: "floor", role: "base", price: 300 },
  { id: "bedroom_dresser", theme: "bedroom", kind: "floor", role: "base", price: 250 },
  { id: "bedroom_nightstand", theme: "bedroom", kind: "floor", role: "base", price: 75 },
  { id: "bedroom_wardrobe", theme: "bedroom", kind: "floor", role: "base", price: 300 },
  { id: "bedroom_vanity", theme: "bedroom", kind: "floor", role: "base", price: 250 },
  { id: "bedroom_rug", theme: "bedroom", kind: "floor", role: "base", price: 75 },
  { id: "bedroom_table_lamp", theme: "bedroom", kind: "floor", role: "base", price: 50 },
  { id: "bedroom_bench", theme: "bedroom", kind: "floor", role: "base", price: 150 },
  { id: "bedroom_reading_chair", theme: "bedroom", kind: "floor", role: "base", price: 150 },
  { id: "bedroom_desk", theme: "bedroom", kind: "floor", role: "base", price: 250 },
  { id: "bedroom_bed_frame_blush", theme: "bedroom", kind: "floor", role: "colorway", base: "bedroom_bed_frame", price: 300 },
  { id: "bedroom_dresser_ivory", theme: "bedroom", kind: "floor", role: "colorway", base: "bedroom_dresser", price: 250 },
  { id: "bedroom_nightstand_walnut", theme: "bedroom", kind: "floor", role: "colorway", base: "bedroom_nightstand", price: 75 },
  { id: "bedroom_wardrobe_mist", theme: "bedroom", kind: "floor", role: "colorway", base: "bedroom_wardrobe", price: 300 },
  { id: "bedroom_vanity_ivory", theme: "bedroom", kind: "floor", role: "colorway", base: "bedroom_vanity", reward: true },
  { id: "bedroom_rug_dusk", theme: "bedroom", kind: "floor", role: "colorway", base: "bedroom_rug", price: 75 },
  { id: "bedroom_table_lamp_sage", theme: "bedroom", kind: "floor", role: "colorway", base: "bedroom_table_lamp", price: 50 },
  { id: "bedroom_bench_linen", theme: "bedroom", kind: "floor", role: "colorway", base: "bedroom_bench", price: 150 },
  { id: "bedroom_reading_chair_plum", theme: "bedroom", kind: "floor", role: "colorway", base: "bedroom_reading_chair", price: 150 },
  { id: "bedroom_mirror", theme: "bedroom", kind: "wall", role: "wall", price: 75 },
  { id: "bedroom_photo_wall", theme: "bedroom", kind: "wall", role: "wall", price: 50 },
  { id: "bedroom_wall_sconce", theme: "bedroom", kind: "wall", role: "wall", price: 50 },
  { id: "bedroom_tapestry", theme: "bedroom", kind: "wall", role: "wall", price: 75 },
  { id: "bedroom_shelf", theme: "bedroom", kind: "wall", role: "wall", price: 50 },
  { id: "bedroom_clock", theme: "bedroom", kind: "wall", role: "wall", price: 25 },
  { id: "bedroom_dream_print", theme: "bedroom", kind: "wall", role: "wall", price: 25 },
  // ── Track A · lodge (18) ──
  { id: "lodge_wood_stove", theme: "lodge", kind: "floor", role: "base", price: 400 },
  { id: "lodge_log_bed", theme: "lodge", kind: "floor", role: "base", price: 300 },
  { id: "lodge_antler_chair", theme: "lodge", kind: "floor", role: "base", price: 250 },
  { id: "lodge_wood_table", theme: "lodge", kind: "floor", role: "base", price: 150 },
  { id: "lodge_fur_rug", theme: "lodge", kind: "floor", role: "base", price: 150 },
  { id: "lodge_lantern", theme: "lodge", kind: "floor", role: "base", price: 75 },
  { id: "lodge_bench", theme: "lodge", kind: "floor", role: "base", price: 75 },
  { id: "lodge_wood_stove_slate", theme: "lodge", kind: "floor", role: "colorway", base: "lodge_wood_stove", reward: true },
  { id: "lodge_log_bed_pine", theme: "lodge", kind: "floor", role: "colorway", base: "lodge_log_bed", price: 300 },
  { id: "lodge_antler_chair_russet", theme: "lodge", kind: "floor", role: "colorway", base: "lodge_antler_chair", price: 250 },
  { id: "lodge_wood_table_cedar", theme: "lodge", kind: "floor", role: "colorway", base: "lodge_wood_table", price: 150 },
  { id: "lodge_fur_rug_grey", theme: "lodge", kind: "floor", role: "colorway", base: "lodge_fur_rug", price: 150 },
  { id: "lodge_lantern_copper", theme: "lodge", kind: "floor", role: "colorway", base: "lodge_lantern", price: 75 },
  { id: "lodge_antler_mount", theme: "lodge", kind: "wall", role: "wall", price: 150 },
  { id: "lodge_tapestry", theme: "lodge", kind: "wall", role: "wall", price: 150 },
  { id: "lodge_wall_lantern", theme: "lodge", kind: "wall", role: "wall", price: 50 },
  { id: "lodge_map_frame", theme: "lodge", kind: "wall", role: "wall", price: 75 },
  { id: "lodge_wood_carving", theme: "lodge", kind: "wall", role: "wall", price: 75 },
  // ── Track A · pool (16) ──
  { id: "pool_hanging_chair", theme: "pool", kind: "floor", role: "base", price: 150 },
  { id: "pool_shade_sail", theme: "pool", kind: "floor", role: "base", price: 75 },
  { id: "pool_side_table", theme: "pool", kind: "floor", role: "base", price: 50 },
  { id: "pool_float_rack", theme: "pool", kind: "floor", role: "base", price: 75 },
  { id: "pool_towel_cart", theme: "pool", kind: "floor", role: "base", price: 75 },
  { id: "pool_mosaic_rug", theme: "pool", kind: "floor", role: "base", price: 150 },
  { id: "pool_hanging_chair_coral", theme: "pool", kind: "floor", role: "colorway", base: "pool_hanging_chair", price: 150 },
  { id: "pool_shade_sail_aqua", theme: "pool", kind: "floor", role: "colorway", base: "pool_shade_sail", price: 75 },
  { id: "pool_side_table_teal", theme: "pool", kind: "floor", role: "colorway", base: "pool_side_table", price: 50 },
  { id: "pool_float_rack_sunny", theme: "pool", kind: "floor", role: "colorway", base: "pool_float_rack", price: 75 },
  { id: "pool_towel_cart_white", theme: "pool", kind: "floor", role: "colorway", base: "pool_towel_cart", price: 75 },
  { id: "pool_mosaic_rug_lagoon", theme: "pool", kind: "floor", role: "colorway", base: "pool_mosaic_rug", reward: true },
  { id: "pool_tile_mural", theme: "pool", kind: "wall", role: "wall", price: 150 },
  { id: "pool_lifeguard_sign", theme: "pool", kind: "wall", role: "wall", price: 75 },
  { id: "pool_wave_art", theme: "pool", kind: "wall", role: "wall", price: 75 },
  { id: "pool_sconce", theme: "pool", kind: "wall", role: "wall", price: 50 },
  // ── Track A · penthouse (16) ──
  { id: "penthouse_sofa", theme: "penthouse", kind: "floor", role: "base", price: 400 },
  { id: "penthouse_marble_table", theme: "penthouse", kind: "floor", role: "base", price: 300 },
  { id: "penthouse_dining_chair", theme: "penthouse", kind: "floor", role: "base", price: 250 },
  { id: "penthouse_bar", theme: "penthouse", kind: "floor", role: "base", price: 400 },
  { id: "penthouse_silk_rug", theme: "penthouse", kind: "floor", role: "base", price: 250 },
  { id: "penthouse_telescope", theme: "penthouse", kind: "floor", role: "base", price: 300 },
  { id: "penthouse_sofa_ivory", theme: "penthouse", kind: "floor", role: "colorway", base: "penthouse_sofa", price: 400 },
  { id: "penthouse_marble_table_noir", theme: "penthouse", kind: "floor", role: "colorway", base: "penthouse_marble_table", price: 300 },
  { id: "penthouse_dining_chair_champagne", theme: "penthouse", kind: "floor", role: "colorway", base: "penthouse_dining_chair", price: 250 },
  { id: "penthouse_bar_midnight", theme: "penthouse", kind: "floor", role: "colorway", base: "penthouse_bar", price: 400 },
  { id: "penthouse_silk_rug_pearl", theme: "penthouse", kind: "floor", role: "colorway", base: "penthouse_silk_rug", price: 250 },
  { id: "penthouse_telescope_copper", theme: "penthouse", kind: "floor", role: "colorway", base: "penthouse_telescope", reward: true },
  { id: "penthouse_skyline_art", theme: "penthouse", kind: "wall", role: "wall", price: 150 },
  { id: "penthouse_gold_mirror", theme: "penthouse", kind: "wall", role: "wall", price: 150 },
  { id: "penthouse_sconce", theme: "penthouse", kind: "wall", role: "wall", price: 75 },
  { id: "penthouse_marble_relief", theme: "penthouse", kind: "wall", role: "wall", price: 150 },
  // ── Track A · lounge (16) ──
  { id: "lounge_vibraphone", theme: "lounge", kind: "floor", role: "base", price: 500 },
  { id: "lounge_velvet_sofa", theme: "lounge", kind: "floor", role: "base", price: 300 },
  { id: "lounge_record_console", theme: "lounge", kind: "floor", role: "base", price: 150 },
  { id: "lounge_bar_stool", theme: "lounge", kind: "floor", role: "base", price: 75 },
  { id: "lounge_floor_lamp", theme: "lounge", kind: "floor", role: "base", price: 75 },
  { id: "lounge_stage_rug", theme: "lounge", kind: "floor", role: "base", price: 150 },
  { id: "lounge_vibraphone_ivory", theme: "lounge", kind: "floor", role: "colorway", base: "lounge_vibraphone", reward: true },
  { id: "lounge_velvet_sofa_berry", theme: "lounge", kind: "floor", role: "colorway", base: "lounge_velvet_sofa", price: 300 },
  { id: "lounge_record_console_smoke", theme: "lounge", kind: "floor", role: "colorway", base: "lounge_record_console", price: 150 },
  { id: "lounge_bar_stool_brass", theme: "lounge", kind: "floor", role: "colorway", base: "lounge_bar_stool", price: 75 },
  { id: "lounge_floor_lamp_amber", theme: "lounge", kind: "floor", role: "colorway", base: "lounge_floor_lamp", price: 75 },
  { id: "lounge_stage_rug_noir", theme: "lounge", kind: "floor", role: "colorway", base: "lounge_stage_rug", price: 150 },
  { id: "lounge_neon_note", theme: "lounge", kind: "wall", role: "wall", price: 150 },
  { id: "lounge_stage_drape", theme: "lounge", kind: "wall", role: "wall", price: 75 },
  { id: "lounge_vinyl_print", theme: "lounge", kind: "wall", role: "wall", price: 75 },
  { id: "lounge_disco_ball", theme: "lounge", kind: "wall", role: "wall", price: 150 },
  // ── Track A · wall_art (28) ──
  { id: "wall_art_print_aurora", theme: "wall_art", kind: "wall", role: "wall", price: 75 },
  { id: "wall_art_print_bloom", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_print_circuit", theme: "wall_art", kind: "wall", role: "wall", price: 75 },
  { id: "wall_art_print_dune", theme: "wall_art", kind: "wall", role: "wall", price: 25 },
  { id: "wall_art_print_ember", theme: "wall_art", kind: "wall", role: "wall", price: 75 },
  { id: "wall_art_print_fjord", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_print_grove", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_print_harbor", theme: "wall_art", kind: "wall", role: "wall", price: 75 },
  { id: "wall_art_print_iris", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_print_juniper", theme: "wall_art", kind: "wall", role: "wall", price: 25 },
  { id: "wall_art_print_kelp", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_print_lumen", theme: "wall_art", kind: "wall", role: "wall", price: 75 },
  { id: "wall_art_print_mesa", theme: "wall_art", kind: "wall", role: "wall", price: 25 },
  { id: "wall_art_print_north", theme: "wall_art", kind: "wall", role: "wall", price: 75 },
  { id: "wall_art_print_onyx", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_print_prism", theme: "wall_art", kind: "wall", role: "wall", price: 75 },
  { id: "wall_art_print_quill", theme: "wall_art", kind: "wall", role: "wall", price: 25 },
  { id: "wall_art_print_ridge", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_print_sol", theme: "wall_art", kind: "wall", role: "wall", price: 75 },
  { id: "wall_art_print_tide", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_triptych_aurora_left", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_triptych_aurora_center", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_triptych_aurora_right", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_triptych_tide_left", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_triptych_tide_center", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_triptych_tide_right", theme: "wall_art", kind: "wall", role: "wall", price: 50 },
  { id: "wall_art_gallery_clock", theme: "wall_art", kind: "wall", role: "wall", price: 75 },
  { id: "wall_art_sculpture_relief", theme: "wall_art", kind: "wall", role: "wall", price: 150 },
  // ── Track A · prestige (8) ──
  { id: "prestige_gold_throne", theme: "prestige", kind: "floor", role: "base", price: 3300 },
  { id: "prestige_marble_fountain", theme: "prestige", kind: "floor", role: "base", price: 3300 },
  { id: "prestige_crystal_screen", theme: "prestige", kind: "floor", role: "base", price: 1800 },
  { id: "prestige_obsidian_table", theme: "prestige", kind: "floor", role: "base", price: 1800 },
  { id: "prestige_velvet_daybed", theme: "prestige", kind: "floor", role: "base", price: 1800 },
  { id: "prestige_gold_throne_onyx", theme: "prestige", kind: "floor", role: "base", price: 3300 },
  { id: "prestige_marble_fountain_moonstone", theme: "prestige", kind: "floor", role: "base", price: 3300 },
  { id: "prestige_crystal_screen_amber", theme: "prestige", kind: "floor", role: "base", price: 1800 },
  // ── Track B · bannerhold (40) ──
  { id: "bannerhold_feast_table", theme: "bannerhold", kind: "floor", role: "base", price: 300 },
  { id: "bannerhold_high_seat", theme: "bannerhold", kind: "floor", role: "base", price: 250 },
  { id: "bannerhold_war_table", theme: "bannerhold", kind: "floor", role: "base", price: 250 },
  { id: "bannerhold_armor_stand", theme: "bannerhold", kind: "floor", role: "base", price: 150 },
  { id: "bannerhold_hearth_brazier", theme: "bannerhold", kind: "floor", role: "base", price: 150 },
  { id: "bannerhold_map_table", theme: "bannerhold", kind: "floor", role: "base", price: 150 },
  { id: "bannerhold_banner_pole", theme: "bannerhold", kind: "floor", role: "base", price: 75 },
  { id: "bannerhold_shield_rack", theme: "bannerhold", kind: "floor", role: "base", price: 75 },
  { id: "bannerhold_candle_stand", theme: "bannerhold", kind: "floor", role: "base", price: 75 },
  { id: "bannerhold_rug_runner", theme: "bannerhold", kind: "floor", role: "base", price: 75 },
  { id: "bannerhold_oak_bench", theme: "bannerhold", kind: "floor", role: "base", price: 50 },
  { id: "bannerhold_spear_rack", theme: "bannerhold", kind: "floor", role: "base", price: 50 },
  { id: "bannerhold_feast_table_crimson", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_feast_table", price: 300 },
  { id: "bannerhold_high_seat_azure", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_high_seat", price: 250 },
  { id: "bannerhold_war_table_sable", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_war_table", price: 250 },
  { id: "bannerhold_armor_stand_gold", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_armor_stand", price: 150 },
  { id: "bannerhold_hearth_brazier_forest", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_hearth_brazier", price: 150 },
  { id: "bannerhold_map_table_ivory", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_map_table", price: 150 },
  { id: "bannerhold_banner_pole_royal", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_banner_pole", price: 75 },
  { id: "bannerhold_shield_rack_ash", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_shield_rack", price: 75 },
  { id: "bannerhold_candle_stand_rust", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_candle_stand", price: 75 },
  { id: "bannerhold_rug_runner_sage", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_rug_runner", price: 75 },
  { id: "bannerhold_oak_bench_dusk", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_oak_bench", price: 50 },
  { id: "bannerhold_spear_rack_bone", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_spear_rack", price: 50 },
  { id: "bannerhold_feast_table_scarlet", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_feast_table", price: 300 },
  { id: "bannerhold_high_seat_navy", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_high_seat", reward: true },
  { id: "bannerhold_war_table_bronze", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_war_table", price: 250 },
  { id: "bannerhold_armor_stand_moss", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_armor_stand", price: 150 },
  { id: "bannerhold_hearth_brazier_storm", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_hearth_brazier", price: 150 },
  { id: "bannerhold_map_table_wine", theme: "bannerhold", kind: "floor", role: "colorway", base: "bannerhold_map_table", price: 150 },
  { id: "bannerhold_crest_banner", theme: "bannerhold", kind: "wall", role: "wall", price: 75 },
  { id: "bannerhold_sword_display", theme: "bannerhold", kind: "wall", role: "wall", price: 75 },
  { id: "bannerhold_shield_mount", theme: "bannerhold", kind: "wall", role: "wall", price: 75 },
  { id: "bannerhold_heraldry_tapestry", theme: "bannerhold", kind: "wall", role: "wall", price: 50 },
  { id: "bannerhold_torch_sconce", theme: "bannerhold", kind: "wall", role: "wall", price: 50 },
  { id: "bannerhold_oath_scroll", theme: "bannerhold", kind: "wall", role: "wall", price: 50 },
  { id: "bannerhold_arrow_slit_panel", theme: "bannerhold", kind: "wall", role: "wall", price: 50 },
  { id: "bannerhold_drum_mount", theme: "bannerhold", kind: "wall", role: "wall", price: 25 },
  { id: "bannerhold_chain_curtain", theme: "bannerhold", kind: "wall", role: "wall", price: 25 },
  { id: "bannerhold_sigil_plate", theme: "bannerhold", kind: "wall", role: "wall", price: 25 },
  // ── Track B · nocturne (40) ──
  { id: "nocturne_pipe_organ", theme: "nocturne", kind: "floor", role: "base", price: 400 },
  { id: "nocturne_coffin_daybed", theme: "nocturne", kind: "floor", role: "base", price: 300 },
  { id: "nocturne_high_throne", theme: "nocturne", kind: "floor", role: "base", price: 250 },
  { id: "nocturne_dusk_sofa", theme: "nocturne", kind: "floor", role: "base", price: 250 },
  { id: "nocturne_obsidian_table", theme: "nocturne", kind: "floor", role: "base", price: 150 },
  { id: "nocturne_iron_gate", theme: "nocturne", kind: "floor", role: "base", price: 150 },
  { id: "nocturne_gramophone", theme: "nocturne", kind: "floor", role: "base", price: 150 },
  { id: "nocturne_candelabra_stand", theme: "nocturne", kind: "floor", role: "base", price: 75 },
  { id: "nocturne_scrying_font", theme: "nocturne", kind: "floor", role: "base", price: 75 },
  { id: "nocturne_midnight_rug", theme: "nocturne", kind: "floor", role: "base", price: 75 },
  { id: "nocturne_nightstand", theme: "nocturne", kind: "floor", role: "base", price: 50 },
  { id: "nocturne_raven_perch", theme: "nocturne", kind: "floor", role: "base", price: 50 },
  { id: "nocturne_pipe_organ_midnight", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_pipe_organ", price: 400 },
  { id: "nocturne_coffin_daybed_plum", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_coffin_daybed", price: 300 },
  { id: "nocturne_high_throne_silver", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_high_throne", price: 250 },
  { id: "nocturne_dusk_sofa_raven", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_dusk_sofa", price: 250 },
  { id: "nocturne_obsidian_table_dusk", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_obsidian_table", price: 150 },
  { id: "nocturne_iron_gate_wine", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_iron_gate", price: 150 },
  { id: "nocturne_gramophone_fog", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_gramophone", price: 150 },
  { id: "nocturne_candelabra_stand_onyx", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_candelabra_stand", price: 75 },
  { id: "nocturne_scrying_font_lilac", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_scrying_font", price: 75 },
  { id: "nocturne_midnight_rug_ash", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_midnight_rug", price: 75 },
  { id: "nocturne_nightstand_indigo", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_nightstand", price: 50 },
  { id: "nocturne_raven_perch_pearl", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_raven_perch", price: 50 },
  { id: "nocturne_pipe_organ_ember", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_pipe_organ", price: 400 },
  { id: "nocturne_coffin_daybed_slate", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_coffin_daybed", reward: true },
  { id: "nocturne_high_throne_moth", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_high_throne", price: 250 },
  { id: "nocturne_dusk_sofa_ink", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_dusk_sofa", price: 250 },
  { id: "nocturne_obsidian_table_amethyst", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_obsidian_table", price: 150 },
  { id: "nocturne_iron_gate_storm", theme: "nocturne", kind: "floor", role: "colorway", base: "nocturne_iron_gate", price: 150 },
  { id: "nocturne_moon_phase_chart", theme: "nocturne", kind: "wall", role: "wall", price: 75 },
  { id: "nocturne_raven_frame", theme: "nocturne", kind: "wall", role: "wall", price: 75 },
  { id: "nocturne_velvet_drape", theme: "nocturne", kind: "wall", role: "wall", price: 75 },
  { id: "nocturne_candle_sconce", theme: "nocturne", kind: "wall", role: "wall", price: 50 },
  { id: "nocturne_star_chart", theme: "nocturne", kind: "wall", role: "wall", price: 50 },
  { id: "nocturne_moth_print", theme: "nocturne", kind: "wall", role: "wall", price: 50 },
  { id: "nocturne_mirror_arch", theme: "nocturne", kind: "wall", role: "wall", price: 50 },
  { id: "nocturne_night_sky_panel", theme: "nocturne", kind: "wall", role: "wall", price: 25 },
  { id: "nocturne_bat_silhouette", theme: "nocturne", kind: "wall", role: "wall", price: 25 },
  { id: "nocturne_lyric_plaque", theme: "nocturne", kind: "wall", role: "wall", price: 25 },
  // ── Track B · mochi (40) ──
  { id: "mochi_day_bed", theme: "mochi", kind: "floor", role: "base", price: 250 },
  { id: "mochi_boba_cart", theme: "mochi", kind: "floor", role: "base", price: 250 },
  { id: "mochi_mallow_plush", theme: "mochi", kind: "floor", role: "base", price: 250 },
  { id: "mochi_cloud_sofa", theme: "mochi", kind: "floor", role: "base", price: 150 },
  { id: "mochi_pastel_drawers", theme: "mochi", kind: "floor", role: "base", price: 150 },
  { id: "mochi_low_table", theme: "mochi", kind: "floor", role: "base", price: 75 },
  { id: "mochi_rice_lamp", theme: "mochi", kind: "floor", role: "base", price: 75 },
  { id: "mochi_cloud_rug", theme: "mochi", kind: "floor", role: "base", price: 75 },
  { id: "mochi_tea_tray_stand", theme: "mochi", kind: "floor", role: "base", price: 50 },
  { id: "mochi_bean_bag", theme: "mochi", kind: "floor", role: "base", price: 50 },
  { id: "mochi_floor_cushion", theme: "mochi", kind: "floor", role: "base", price: 25 },
  { id: "mochi_round_stool", theme: "mochi", kind: "floor", role: "base", price: 25 },
  { id: "mochi_day_bed_cream", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_day_bed", price: 250 },
  { id: "mochi_boba_cart_sakura", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_boba_cart", price: 250 },
  { id: "mochi_mallow_plush_taro", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_mallow_plush", price: 250 },
  { id: "mochi_cloud_sofa_matcha", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_cloud_sofa", price: 150 },
  { id: "mochi_pastel_drawers_honey", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_pastel_drawers", price: 150 },
  { id: "mochi_low_table_sesame", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_low_table", price: 75 },
  { id: "mochi_rice_lamp_sky", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_rice_lamp", price: 75 },
  { id: "mochi_cloud_rug_peach", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_cloud_rug", price: 75 },
  { id: "mochi_tea_tray_stand_cocoa", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_tea_tray_stand", price: 50 },
  { id: "mochi_bean_bag_mint", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_bean_bag", price: 50 },
  { id: "mochi_floor_cushion_lilac", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_floor_cushion", price: 25 },
  { id: "mochi_round_stool_butter", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_round_stool", price: 25 },
  { id: "mochi_day_bed_berry", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_day_bed", price: 250 },
  { id: "mochi_boba_cart_milk", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_boba_cart", price: 250 },
  { id: "mochi_mallow_plush_yuzu", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_mallow_plush", reward: true },
  { id: "mochi_cloud_sofa_redbean", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_cloud_sofa", price: 150 },
  { id: "mochi_pastel_drawers_latte", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_pastel_drawers", price: 150 },
  { id: "mochi_low_table_plum", theme: "mochi", kind: "floor", role: "colorway", base: "mochi_low_table", price: 75 },
  { id: "mochi_boba_menu", theme: "mochi", kind: "wall", role: "wall", price: 75 },
  { id: "mochi_mallow_clock", theme: "mochi", kind: "wall", role: "wall", price: 75 },
  { id: "mochi_cloud_shelf", theme: "mochi", kind: "wall", role: "wall", price: 75 },
  { id: "mochi_pastel_bunting", theme: "mochi", kind: "wall", role: "wall", price: 50 },
  { id: "mochi_cream_print", theme: "mochi", kind: "wall", role: "wall", price: 50 },
  { id: "mochi_steam_decal", theme: "mochi", kind: "wall", role: "wall", price: 50 },
  { id: "mochi_round_window_cling", theme: "mochi", kind: "wall", role: "wall", price: 50 },
  { id: "mochi_snack_poster", theme: "mochi", kind: "wall", role: "wall", price: 25 },
  { id: "mochi_soft_sconce", theme: "mochi", kind: "wall", role: "wall", price: 25 },
  { id: "mochi_charm_hooks", theme: "mochi", kind: "wall", role: "wall", price: 25 },
  // ── Track B · starliner (40) ──
  { id: "starliner_bunk_pod", theme: "starliner", kind: "floor", role: "base", price: 400 },
  { id: "starliner_console", theme: "starliner", kind: "floor", role: "base", price: 300 },
  { id: "starliner_captain_chair", theme: "starliner", kind: "floor", role: "base", price: 250 },
  { id: "starliner_navigation_desk", theme: "starliner", kind: "floor", role: "base", price: 250 },
  { id: "starliner_galley_counter", theme: "starliner", kind: "floor", role: "base", price: 250 },
  { id: "starliner_holo_projector", theme: "starliner", kind: "floor", role: "base", price: 150 },
  { id: "starliner_viewport_seat", theme: "starliner", kind: "floor", role: "base", price: 150 },
  { id: "starliner_corridor_light", theme: "starliner", kind: "floor", role: "base", price: 75 },
  { id: "starliner_docking_bench", theme: "starliner", kind: "floor", role: "base", price: 75 },
  { id: "starliner_orbit_table", theme: "starliner", kind: "floor", role: "base", price: 75 },
  { id: "starliner_suit_rack", theme: "starliner", kind: "floor", role: "base", price: 50 },
  { id: "starliner_cargo_crate", theme: "starliner", kind: "floor", role: "base", price: 25 },
  { id: "starliner_bunk_pod_chrome", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_bunk_pod", price: 400 },
  { id: "starliner_console_nebula", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_console", price: 300 },
  { id: "starliner_captain_chair_solar", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_captain_chair", price: 250 },
  { id: "starliner_navigation_desk_nova", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_navigation_desk", price: 250 },
  { id: "starliner_galley_counter_comet", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_galley_counter", price: 250 },
  { id: "starliner_holo_projector_ion", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_holo_projector", price: 150 },
  { id: "starliner_viewport_seat_orbit", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_viewport_seat", price: 150 },
  { id: "starliner_corridor_light_lunar", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_corridor_light", price: 75 },
  { id: "starliner_docking_bench_ember", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_docking_bench", price: 75 },
  { id: "starliner_orbit_table_void", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_orbit_table", price: 75 },
  { id: "starliner_suit_rack_aurora", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_suit_rack", price: 50 },
  { id: "starliner_cargo_crate_pulse", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_cargo_crate", price: 25 },
  { id: "starliner_bunk_pod_drift", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_bunk_pod", price: 400 },
  { id: "starliner_console_flare", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_console", price: 300 },
  { id: "starliner_captain_chair_cosmic", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_captain_chair", price: 250 },
  { id: "starliner_navigation_desk_xenon", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_navigation_desk", price: 250 },
  { id: "starliner_galley_counter_radar", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_galley_counter", price: 250 },
  { id: "starliner_holo_projector_astro", theme: "starliner", kind: "floor", role: "colorway", base: "starliner_holo_projector", reward: true },
  { id: "starliner_viewport_panel", theme: "starliner", kind: "wall", role: "wall", price: 75 },
  { id: "starliner_star_chart", theme: "starliner", kind: "wall", role: "wall", price: 75 },
  { id: "starliner_warning_placard", theme: "starliner", kind: "wall", role: "wall", price: 75 },
  { id: "starliner_conduit_strip", theme: "starliner", kind: "wall", role: "wall", price: 50 },
  { id: "starliner_mission_patch_board", theme: "starliner", kind: "wall", role: "wall", price: 50 },
  { id: "starliner_neon_orbit_sign", theme: "starliner", kind: "wall", role: "wall", price: 50 },
  { id: "starliner_planet_poster", theme: "starliner", kind: "wall", role: "wall", price: 50 },
  { id: "starliner_airvent_grille", theme: "starliner", kind: "wall", role: "wall", price: 25 },
  { id: "starliner_docking_schedule", theme: "starliner", kind: "wall", role: "wall", price: 25 },
  { id: "starliner_comet_print", theme: "starliner", kind: "wall", role: "wall", price: 25 },
  // ── Track B · fablewood (40) ──
  { id: "fablewood_moss_bed", theme: "fablewood", kind: "floor", role: "base", price: 300 },
  { id: "fablewood_wizard_desk", theme: "fablewood", kind: "floor", role: "base", price: 250 },
  { id: "fablewood_alchemy_bench", theme: "fablewood", kind: "floor", role: "base", price: 250 },
  { id: "fablewood_root_chair", theme: "fablewood", kind: "floor", role: "base", price: 150 },
  { id: "fablewood_spellbook_shelf", theme: "fablewood", kind: "floor", role: "base", price: 150 },
  { id: "fablewood_crystal_orb", theme: "fablewood", kind: "floor", role: "base", price: 150 },
  { id: "fablewood_runestone", theme: "fablewood", kind: "floor", role: "base", price: 75 },
  { id: "fablewood_firefly_lantern", theme: "fablewood", kind: "floor", role: "base", price: 75 },
  { id: "fablewood_stump_table", theme: "fablewood", kind: "floor", role: "base", price: 75 },
  { id: "fablewood_leaf_rug", theme: "fablewood", kind: "floor", role: "base", price: 75 },
  { id: "fablewood_mushroom_stool", theme: "fablewood", kind: "floor", role: "base", price: 50 },
  { id: "fablewood_aether_throne", theme: "fablewood", kind: "floor", role: "base", price: 250 },
  { id: "fablewood_moss_bed_moss", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_moss_bed", price: 300 },
  { id: "fablewood_wizard_desk_acorn", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_wizard_desk", price: 250 },
  { id: "fablewood_alchemy_bench_fern", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_alchemy_bench", price: 250 },
  { id: "fablewood_root_chair_bark", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_root_chair", price: 150 },
  { id: "fablewood_spellbook_shelf_dawn", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_spellbook_shelf", price: 150 },
  { id: "fablewood_crystal_orb_berry", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_crystal_orb", price: 150 },
  { id: "fablewood_runestone_mist", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_runestone", price: 75 },
  { id: "fablewood_firefly_lantern_clover", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_firefly_lantern", price: 75 },
  { id: "fablewood_stump_table_amber", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_stump_table", price: 75 },
  { id: "fablewood_leaf_rug_thorn", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_leaf_rug", price: 75 },
  { id: "fablewood_mushroom_stool_willow", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_mushroom_stool", price: 50 },
  { id: "fablewood_aether_throne_brook", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_aether_throne", price: 250 },
  { id: "fablewood_moss_bed_dusk", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_moss_bed", price: 300 },
  { id: "fablewood_wizard_desk_honey", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_wizard_desk", price: 250 },
  { id: "fablewood_alchemy_bench_sage", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_alchemy_bench", price: 250 },
  { id: "fablewood_root_chair_rust", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_root_chair", price: 150 },
  { id: "fablewood_spellbook_shelf_petal", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_spellbook_shelf", price: 150 },
  { id: "fablewood_aether_throne_stone", theme: "fablewood", kind: "floor", role: "colorway", base: "fablewood_aether_throne", reward: true },
  { id: "fablewood_vine_garland", theme: "fablewood", kind: "wall", role: "wall", price: 75 },
  { id: "fablewood_mushroom_shelf", theme: "fablewood", kind: "wall", role: "wall", price: 75 },
  { id: "fablewood_owl_print", theme: "fablewood", kind: "wall", role: "wall", price: 75 },
  { id: "fablewood_story_page_frame", theme: "fablewood", kind: "wall", role: "wall", price: 50 },
  { id: "fablewood_moss_panel", theme: "fablewood", kind: "wall", role: "wall", price: 50 },
  { id: "fablewood_firefly_sconce", theme: "fablewood", kind: "wall", role: "wall", price: 50 },
  { id: "fablewood_acorn_hooks", theme: "fablewood", kind: "wall", role: "wall", price: 50 },
  { id: "fablewood_leaf_mobile", theme: "fablewood", kind: "wall", role: "wall", price: 25 },
  { id: "fablewood_bark_relief", theme: "fablewood", kind: "wall", role: "wall", price: 25 },
  { id: "fablewood_fern_pressing", theme: "fablewood", kind: "wall", role: "wall", price: 25 },
  // ── Track B · tidal (40) ──
  { id: "tidal_shell_bed", theme: "tidal", kind: "floor", role: "base", price: 300 },
  { id: "tidal_net_hammock", theme: "tidal", kind: "floor", role: "base", price: 250 },
  { id: "tidal_tide_pool_bar", theme: "tidal", kind: "floor", role: "base", price: 250 },
  { id: "tidal_chart_desk", theme: "tidal", kind: "floor", role: "base", price: 250 },
  { id: "tidal_coral_table", theme: "tidal", kind: "floor", role: "base", price: 150 },
  { id: "tidal_reef_shelf", theme: "tidal", kind: "floor", role: "base", price: 150 },
  { id: "tidal_shell_vanity", theme: "tidal", kind: "floor", role: "base", price: 150 },
  { id: "tidal_driftwood_bench", theme: "tidal", kind: "floor", role: "base", price: 75 },
  { id: "tidal_pearl_lamp", theme: "tidal", kind: "floor", role: "base", price: 75 },
  { id: "tidal_kelp_planter", theme: "tidal", kind: "floor", role: "base", price: 75 },
  { id: "tidal_wave_rug", theme: "tidal", kind: "floor", role: "base", price: 75 },
  { id: "tidal_buoy_stool", theme: "tidal", kind: "floor", role: "base", price: 50 },
  { id: "tidal_shell_bed_aqua", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_shell_bed", price: 300 },
  { id: "tidal_net_hammock_coral", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_net_hammock", price: 250 },
  { id: "tidal_tide_pool_bar_pearl", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_tide_pool_bar", price: 250 },
  { id: "tidal_chart_desk_kelp", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_chart_desk", price: 250 },
  { id: "tidal_coral_table_sand", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_coral_table", price: 150 },
  { id: "tidal_reef_shelf_foam", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_reef_shelf", price: 150 },
  { id: "tidal_shell_vanity_lagoon", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_shell_vanity", price: 150 },
  { id: "tidal_driftwood_bench_drift", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_driftwood_bench", price: 75 },
  { id: "tidal_pearl_lamp_storm", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_pearl_lamp", price: 75 },
  { id: "tidal_kelp_planter_shell", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_kelp_planter", price: 75 },
  { id: "tidal_wave_rug_deep", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_wave_rug", price: 75 },
  { id: "tidal_buoy_stool_spray", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_buoy_stool", price: 50 },
  { id: "tidal_shell_bed_dusk", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_shell_bed", reward: true },
  { id: "tidal_net_hammock_reef", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_net_hammock", price: 250 },
  { id: "tidal_tide_pool_bar_brine", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_tide_pool_bar", price: 250 },
  { id: "tidal_chart_desk_sun", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_chart_desk", price: 250 },
  { id: "tidal_coral_table_mist", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_coral_table", price: 150 },
  { id: "tidal_reef_shelf_wave", theme: "tidal", kind: "floor", role: "colorway", base: "tidal_reef_shelf", price: 150 },
  { id: "tidal_porthole_frame", theme: "tidal", kind: "wall", role: "wall", price: 75 },
  { id: "tidal_net_drape", theme: "tidal", kind: "wall", role: "wall", price: 75 },
  { id: "tidal_shell_garland", theme: "tidal", kind: "wall", role: "wall", price: 75 },
  { id: "tidal_tide_clock", theme: "tidal", kind: "wall", role: "wall", price: 50 },
  { id: "tidal_coral_relief", theme: "tidal", kind: "wall", role: "wall", price: 50 },
  { id: "tidal_wave_print", theme: "tidal", kind: "wall", role: "wall", price: 50 },
  { id: "tidal_buoy_hooks", theme: "tidal", kind: "wall", role: "wall", price: 50 },
  { id: "tidal_kelp_curtain", theme: "tidal", kind: "wall", role: "wall", price: 25 },
  { id: "tidal_lighthouse_print", theme: "tidal", kind: "wall", role: "wall", price: 25 },
  { id: "tidal_foam_sconce", theme: "tidal", kind: "wall", role: "wall", price: 25 },
  // ── Track B · verdant (40) ──
  { id: "verdant_canopy_bed", theme: "verdant", kind: "floor", role: "base", price: 300 },
  { id: "verdant_potting_bench", theme: "verdant", kind: "floor", role: "base", price: 250 },
  { id: "verdant_terrarium_case", theme: "verdant", kind: "floor", role: "base", price: 250 },
  { id: "verdant_watering_cart", theme: "verdant", kind: "floor", role: "base", price: 150 },
  { id: "verdant_trellis_screen", theme: "verdant", kind: "floor", role: "base", price: 150 },
  { id: "verdant_herb_table", theme: "verdant", kind: "floor", role: "base", price: 150 },
  { id: "verdant_wicker_chair", theme: "verdant", kind: "floor", role: "base", price: 75 },
  { id: "verdant_plant_stand", theme: "verdant", kind: "floor", role: "base", price: 75 },
  { id: "verdant_vine_lamp", theme: "verdant", kind: "floor", role: "base", price: 75 },
  { id: "verdant_moss_rug", theme: "verdant", kind: "floor", role: "base", price: 75 },
  { id: "verdant_garden_stool", theme: "verdant", kind: "floor", role: "base", price: 50 },
  { id: "verdant_seed_drawers", theme: "verdant", kind: "floor", role: "base", price: 75 },
  { id: "verdant_canopy_bed_fern", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_canopy_bed", price: 300 },
  { id: "verdant_potting_bench_moss", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_potting_bench", price: 250 },
  { id: "verdant_terrarium_case_sage", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_terrarium_case", price: 250 },
  { id: "verdant_watering_cart_bloom", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_watering_cart", price: 150 },
  { id: "verdant_trellis_screen_clay", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_trellis_screen", price: 150 },
  { id: "verdant_herb_table_dew", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_herb_table", price: 150 },
  { id: "verdant_wicker_chair_cedar", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_wicker_chair", price: 75 },
  { id: "verdant_plant_stand_sprout", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_plant_stand", price: 75 },
  { id: "verdant_vine_lamp_amber", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_vine_lamp", price: 75 },
  { id: "verdant_moss_rug_ivy", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_moss_rug", price: 75 },
  { id: "verdant_garden_stool_petal", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_garden_stool", price: 50 },
  { id: "verdant_seed_drawers_stone", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_seed_drawers", price: 75 },
  { id: "verdant_canopy_bed_rain", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_canopy_bed", reward: true },
  { id: "verdant_potting_bench_honey", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_potting_bench", price: 250 },
  { id: "verdant_terrarium_case_olive", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_terrarium_case", price: 250 },
  { id: "verdant_watering_cart_rose", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_watering_cart", price: 150 },
  { id: "verdant_trellis_screen_mint", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_trellis_screen", price: 150 },
  { id: "verdant_herb_table_bark", theme: "verdant", kind: "floor", role: "colorway", base: "verdant_herb_table", price: 150 },
  { id: "verdant_trellis_panel", theme: "verdant", kind: "wall", role: "wall", price: 75 },
  { id: "verdant_herb_pressing_frame", theme: "verdant", kind: "wall", role: "wall", price: 75 },
  { id: "verdant_seed_chart", theme: "verdant", kind: "wall", role: "wall", price: 75 },
  { id: "verdant_vine_mirror", theme: "verdant", kind: "wall", role: "wall", price: 50 },
  { id: "verdant_glass_shelf", theme: "verdant", kind: "wall", role: "wall", price: 50 },
  { id: "verdant_botanical_print", theme: "verdant", kind: "wall", role: "wall", price: 50 },
  { id: "verdant_mist_rail", theme: "verdant", kind: "wall", role: "wall", price: 50 },
  { id: "verdant_leaf_decal", theme: "verdant", kind: "wall", role: "wall", price: 25 },
  { id: "verdant_grow_light_bar", theme: "verdant", kind: "wall", role: "wall", price: 25 },
  { id: "verdant_bee_hotel", theme: "verdant", kind: "wall", role: "wall", price: 25 },
  // ── Track B · clockwork (40) ──
  { id: "clockwork_brass_bed", theme: "clockwork", kind: "floor", role: "base", price: 300 },
  { id: "clockwork_gauge_console", theme: "clockwork", kind: "floor", role: "base", price: 250 },
  { id: "clockwork_winding_desk", theme: "clockwork", kind: "floor", role: "base", price: 250 },
  { id: "clockwork_boiler_cart", theme: "clockwork", kind: "floor", role: "base", price: 250 },
  { id: "clockwork_piston_chair", theme: "clockwork", kind: "floor", role: "base", price: 150 },
  { id: "clockwork_escapement_cabinet", theme: "clockwork", kind: "floor", role: "base", price: 150 },
  { id: "clockwork_mainspring_bench", theme: "clockwork", kind: "floor", role: "base", price: 150 },
  { id: "clockwork_pipe_shelf", theme: "clockwork", kind: "floor", role: "base", price: 75 },
  { id: "clockwork_gear_table", theme: "clockwork", kind: "floor", role: "base", price: 150 },
  { id: "clockwork_steam_lamp", theme: "clockwork", kind: "floor", role: "base", price: 75 },
  { id: "clockwork_copper_rug", theme: "clockwork", kind: "floor", role: "base", price: 75 },
  { id: "clockwork_cog_stool", theme: "clockwork", kind: "floor", role: "base", price: 50 },
  { id: "clockwork_brass_bed_brass", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_brass_bed", price: 300 },
  { id: "clockwork_gauge_console_copper", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_gauge_console", price: 250 },
  { id: "clockwork_winding_desk_iron", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_winding_desk", price: 250 },
  { id: "clockwork_boiler_cart_steam", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_boiler_cart", price: 250 },
  { id: "clockwork_piston_chair_oil", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_piston_chair", price: 150 },
  { id: "clockwork_escapement_cabinet_rust", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_escapement_cabinet", price: 150 },
  { id: "clockwork_mainspring_bench_ivory", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_mainspring_bench", price: 150 },
  { id: "clockwork_pipe_shelf_cobalt", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_pipe_shelf", price: 75 },
  { id: "clockwork_gear_table_ember", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_gear_table", price: 150 },
  { id: "clockwork_steam_lamp_ash", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_steam_lamp", price: 75 },
  { id: "clockwork_copper_rug_gold", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_copper_rug", price: 75 },
  { id: "clockwork_cog_stool_slate", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_cog_stool", price: 50 },
  { id: "clockwork_brass_bed_verdigris", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_brass_bed", reward: true },
  { id: "clockwork_gauge_console_coal", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_gauge_console", price: 250 },
  { id: "clockwork_winding_desk_amber", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_winding_desk", price: 250 },
  { id: "clockwork_boiler_cart_tin", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_boiler_cart", price: 250 },
  { id: "clockwork_piston_chair_mahogany", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_piston_chair", price: 150 },
  { id: "clockwork_escapement_cabinet_pearl", theme: "clockwork", kind: "floor", role: "colorway", base: "clockwork_escapement_cabinet", price: 150 },
  { id: "clockwork_gear_clock", theme: "clockwork", kind: "wall", role: "wall", price: 75 },
  { id: "clockwork_gauge_panel", theme: "clockwork", kind: "wall", role: "wall", price: 75 },
  { id: "clockwork_blueprint_frame", theme: "clockwork", kind: "wall", role: "wall", price: 75 },
  { id: "clockwork_pipe_rail", theme: "clockwork", kind: "wall", role: "wall", price: 50 },
  { id: "clockwork_valve_hooks", theme: "clockwork", kind: "wall", role: "wall", price: 50 },
  { id: "clockwork_piston_relief", theme: "clockwork", kind: "wall", role: "wall", price: 50 },
  { id: "clockwork_brass_sconce", theme: "clockwork", kind: "wall", role: "wall", price: 50 },
  { id: "clockwork_rivet_panel", theme: "clockwork", kind: "wall", role: "wall", price: 25 },
  { id: "clockwork_escapement_diagram", theme: "clockwork", kind: "wall", role: "wall", price: 25 },
  { id: "clockwork_oil_lantern_hook", theme: "clockwork", kind: "wall", role: "wall", price: 25 },
];

// Appendix B — 102 decor tiles.
const DECOR_BLITZ: readonly BlitzDecor[] = [
  // ── starter (4) ──
  { id: "floor_starter_oak", theme: "starter", kind: "floor" },
  { id: "floor_starter_sand_check", theme: "starter", kind: "floor" },
  { id: "wall_starter_plaster_blue", theme: "starter", kind: "wall" },
  { id: "wall_starter_pinstripe", theme: "starter", kind: "wall" },
  // ── casino (4) ──
  { id: "floor_casino_felt_diamond", theme: "casino", kind: "floor" },
  { id: "floor_casino_card_suit", theme: "casino", kind: "floor" },
  { id: "wall_casino_deco_fan", theme: "casino", kind: "wall" },
  { id: "wall_casino_crimson_panel", theme: "casino", kind: "wall" },
  // ── cafe (4) ──
  { id: "floor_cafe_checker_cream", theme: "cafe", kind: "floor" },
  { id: "floor_cafe_terracotta", theme: "cafe", kind: "floor" },
  { id: "wall_cafe_subway_tile", theme: "cafe", kind: "wall" },
  { id: "wall_cafe_awning_stripe", theme: "cafe", kind: "wall" },
  // ── bedroom (6) ──
  { id: "floor_bedroom_oak_herringbone", theme: "bedroom", kind: "floor" },
  { id: "floor_bedroom_soft_check", theme: "bedroom", kind: "floor" },
  { id: "floor_bedroom_moon_inlay", theme: "bedroom", kind: "floor" },
  { id: "wall_bedroom_linen", theme: "bedroom", kind: "wall" },
  { id: "wall_bedroom_cloud", theme: "bedroom", kind: "wall" },
  { id: "wall_bedroom_pinstripe", theme: "bedroom", kind: "wall" },
  // ── lodge (4) ──
  { id: "floor_lodge_flagstone", theme: "lodge", kind: "floor" },
  { id: "floor_lodge_pine", theme: "lodge", kind: "floor" },
  { id: "wall_lodge_plank", theme: "lodge", kind: "wall" },
  { id: "wall_lodge_compass", theme: "lodge", kind: "wall" },
  // ── pool (4) ──
  { id: "floor_pool_shell_tile", theme: "pool", kind: "floor" },
  { id: "floor_pool_wave_mosaic", theme: "pool", kind: "floor" },
  { id: "wall_pool_cabana_stripe", theme: "pool", kind: "wall" },
  { id: "wall_pool_sun_tile", theme: "pool", kind: "wall" },
  // ── penthouse (4) ──
  { id: "floor_penthouse_marble_fan", theme: "penthouse", kind: "floor" },
  { id: "floor_penthouse_parquet", theme: "penthouse", kind: "floor" },
  { id: "wall_penthouse_deco_fan", theme: "penthouse", kind: "wall" },
  { id: "wall_penthouse_silk_panel", theme: "penthouse", kind: "wall" },
  // ── lounge (4) ──
  { id: "floor_lounge_parquet_dark", theme: "lounge", kind: "floor" },
  { id: "floor_lounge_stage_star", theme: "lounge", kind: "floor" },
  { id: "wall_lounge_velvet_panel", theme: "lounge", kind: "wall" },
  { id: "wall_lounge_music_note", theme: "lounge", kind: "wall" },
  // ── wall_art (4) ──
  { id: "floor_gallery_terrazzo", theme: "wall_art", kind: "floor" },
  { id: "floor_gallery_oak", theme: "wall_art", kind: "floor" },
  { id: "wall_gallery_canvas", theme: "wall_art", kind: "wall" },
  { id: "wall_gallery_picture_rail", theme: "wall_art", kind: "wall" },
  // ── bannerhold (8) ──
  { id: "floor_bannerhold_flagstone", theme: "bannerhold", kind: "floor" },
  { id: "floor_bannerhold_oak", theme: "bannerhold", kind: "floor" },
  { id: "floor_bannerhold_rush", theme: "bannerhold", kind: "floor" },
  { id: "floor_bannerhold_sigil", theme: "bannerhold", kind: "floor" },
  { id: "wall_bannerhold_castle_block", theme: "bannerhold", kind: "wall" },
  { id: "wall_bannerhold_plaster", theme: "bannerhold", kind: "wall" },
  { id: "wall_bannerhold_tapestry", theme: "bannerhold", kind: "wall" },
  { id: "wall_bannerhold_oak_panel", theme: "bannerhold", kind: "wall" },
  // ── nocturne (8) ──
  { id: "floor_nocturne_parquet", theme: "nocturne", kind: "floor" },
  { id: "floor_nocturne_moon_tile", theme: "nocturne", kind: "floor" },
  { id: "floor_nocturne_rose_inlay", theme: "nocturne", kind: "floor" },
  { id: "floor_nocturne_ash_stone", theme: "nocturne", kind: "floor" },
  { id: "wall_nocturne_damask", theme: "nocturne", kind: "wall" },
  { id: "wall_nocturne_arch_panel", theme: "nocturne", kind: "wall" },
  { id: "wall_nocturne_candle_stripe", theme: "nocturne", kind: "wall" },
  { id: "wall_nocturne_moth_frieze", theme: "nocturne", kind: "wall" },
  // ── mochi (8) ──
  { id: "floor_mochi_cream_check", theme: "mochi", kind: "floor" },
  { id: "floor_mochi_sprinkle", theme: "mochi", kind: "floor" },
  { id: "floor_mochi_cloud", theme: "mochi", kind: "floor" },
  { id: "floor_mochi_pastel_tile", theme: "mochi", kind: "floor" },
  { id: "wall_mochi_cream_soda", theme: "mochi", kind: "wall" },
  { id: "wall_mochi_cloud", theme: "mochi", kind: "wall" },
  { id: "wall_mochi_charm", theme: "mochi", kind: "wall" },
  { id: "wall_mochi_soft_stripe", theme: "mochi", kind: "wall" },
  // ── starliner (8) ──
  { id: "floor_starliner_deck_plate", theme: "starliner", kind: "floor" },
  { id: "floor_starliner_orbit_grid", theme: "starliner", kind: "floor" },
  { id: "floor_starliner_docking_marks", theme: "starliner", kind: "floor" },
  { id: "floor_starliner_comet", theme: "starliner", kind: "floor" },
  { id: "wall_starliner_panel_grid", theme: "starliner", kind: "wall" },
  { id: "wall_starliner_conduit", theme: "starliner", kind: "wall" },
  { id: "wall_starliner_starfield", theme: "starliner", kind: "wall" },
  { id: "wall_starliner_signal_stripe", theme: "starliner", kind: "wall" },
  // ── fablewood (8) ──
  { id: "floor_fablewood_moss_stone", theme: "fablewood", kind: "floor" },
  { id: "floor_fablewood_rune", theme: "fablewood", kind: "floor" },
  { id: "floor_fablewood_root", theme: "fablewood", kind: "floor" },
  { id: "floor_fablewood_aether", theme: "fablewood", kind: "floor" },
  { id: "wall_fablewood_runic_frieze", theme: "fablewood", kind: "wall" },
  { id: "wall_fablewood_vine", theme: "fablewood", kind: "wall" },
  { id: "wall_fablewood_storybook", theme: "fablewood", kind: "wall" },
  { id: "wall_fablewood_crystal", theme: "fablewood", kind: "wall" },
  // ── tidal (8) ──
  { id: "floor_tidal_reef_tile", theme: "tidal", kind: "floor" },
  { id: "floor_tidal_wave", theme: "tidal", kind: "floor" },
  { id: "floor_tidal_driftwood", theme: "tidal", kind: "floor" },
  { id: "floor_tidal_shell_inlay", theme: "tidal", kind: "floor" },
  { id: "wall_tidal_observatory_panel", theme: "tidal", kind: "wall" },
  { id: "wall_tidal_bubble", theme: "tidal", kind: "wall" },
  { id: "wall_tidal_kelp", theme: "tidal", kind: "wall" },
  { id: "wall_tidal_porthole", theme: "tidal", kind: "wall" },
  // ── verdant (8) ──
  { id: "floor_verdant_greenhouse_tile", theme: "verdant", kind: "floor" },
  { id: "floor_verdant_moss", theme: "verdant", kind: "floor" },
  { id: "floor_verdant_seed", theme: "verdant", kind: "floor" },
  { id: "floor_verdant_terracotta", theme: "verdant", kind: "floor" },
  { id: "wall_verdant_glass_grid", theme: "verdant", kind: "wall" },
  { id: "wall_verdant_trellis", theme: "verdant", kind: "wall" },
  { id: "wall_verdant_botanical", theme: "verdant", kind: "wall" },
  { id: "wall_verdant_dew", theme: "verdant", kind: "wall" },
  // ── clockwork (8) ──
  { id: "floor_clockwork_brass_plate", theme: "clockwork", kind: "floor" },
  { id: "floor_clockwork_gear", theme: "clockwork", kind: "floor" },
  { id: "floor_clockwork_rivet", theme: "clockwork", kind: "floor" },
  { id: "floor_clockwork_blueprint", theme: "clockwork", kind: "floor" },
  { id: "wall_clockwork_pipe_grid", theme: "clockwork", kind: "wall" },
  { id: "wall_clockwork_gauge", theme: "clockwork", kind: "wall" },
  { id: "wall_clockwork_gear", theme: "clockwork", kind: "wall" },
  { id: "wall_clockwork_verdigris_panel", theme: "clockwork", kind: "wall" },
];

const TRACK_A_THEMES = new Set([
  "starter", "casino", "cafe", "bedroom", "lodge",
  "pool", "penthouse", "lounge", "wall_art", "prestige",
]);
const THEME_QUOTAS: Readonly<Record<string, number>> = { starter: 12, casino: 20, cafe: 20, bedroom: 26, lodge: 18, pool: 16, penthouse: 16, lounge: 16, wall_art: 28, prestige: 8, bannerhold: 40, nocturne: 40, mochi: 40, starliner: 40, fablewood: 40, tidal: 40, verdant: 40, clockwork: 40 };
const DECOR_QUOTAS: Readonly<Record<string, number>> = { starter: 4, casino: 4, cafe: 4, bedroom: 6, lodge: 4, pool: 4, penthouse: 4, lounge: 4, wall_art: 4, bannerhold: 8, nocturne: 8, mochi: 8, starliner: 8, fablewood: 8, tidal: 8, verdant: 8, clockwork: 8 };
const REWARDS: readonly string[] = ["bedroom_vanity_ivory", "lodge_wood_stove_slate", "pool_mosaic_rug_lagoon", "penthouse_telescope_copper", "lounge_vibraphone_ivory", "bannerhold_high_seat_navy", "nocturne_coffin_daybed_slate", "mochi_mallow_plush_yuzu", "starliner_holo_projector_astro", "fablewood_aether_throne_stone", "tidal_shell_bed_dusk", "verdant_canopy_bed_rain", "clockwork_brass_bed_verdigris"];
const PRESTIGE_PRICE: Readonly<Record<string, number>> = {"prestige_gold_throne": 3300, "prestige_marble_fountain": 3300, "prestige_crystal_screen": 1800, "prestige_obsidian_table": 1800, "prestige_velvet_daybed": 1800, "prestige_gold_throne_onyx": 3300, "prestige_marble_fountain_moonstone": 3300, "prestige_crystal_screen_amber": 1800};
const BASELINE_FLOOR = 105;
const BASELINE_WALL = 13;
const BASELINE_DECOR = 18;

const byId = new Map(BLITZ.map((e) => [e.id, e]));
const decorById = new Map(DECOR_BLITZ.map((d) => [d.id, d]));
const floorById = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
const wallById = new Map(WALL_CATALOG.map((d) => [d.id, d]));
const decorCatalogById = new Map(DECOR_CATALOG.map((d) => [d.id, d]));
const priced = BLITZ.filter((e) => e.price !== undefined);
const rewardEntries = BLITZ.filter((e) => e.reward);
const trackBThemes = [...new Set(BLITZ.map((e) => e.theme))].filter((t) => !TRACK_A_THEMES.has(t));
const landedWall = [...LANDED_BLITZ_IDS].filter((id) => byId.get(id)?.kind === "wall").length;
const landedFloor = LANDED_BLITZ_IDS.size - landedWall;

test("the manifest is exactly 500 unique ids: 487 priced and 13 rewards", () => {
  expect(BLITZ.length).toBe(500);
  expect(byId.size).toBe(500);
  expect(priced.length).toBe(487);
  expect(rewardEntries.length).toBe(13);
  expect(rewardEntries.map((e) => e.id).sort()).toEqual([...REWARDS].sort());
  expect(BLITZ.filter((e) => e.price !== undefined && e.reward)).toEqual([]);
});

test("the manifest matches the per-theme quotas", () => {
  const got: Record<string, number> = {};
  for (const e of BLITZ) got[e.theme] = (got[e.theme] ?? 0) + 1;
  expect(got).toEqual(THEME_QUOTAS);
});

test("Track A adds 114 floor and 66 wall; Track B adds 240 floor and 80 wall", () => {
  const count = (trackA: boolean, kind: string) =>
    BLITZ.filter((e) => TRACK_A_THEMES.has(e.theme) === trackA && e.kind === kind).length;
  expect(count(true, "floor")).toBe(114);
  expect(count(true, "wall")).toBe(66);
  expect(count(false, "floor")).toBe(240);
  expect(count(false, "wall")).toBe(80);
});

test("the decor ledger is 102 unique tiles, 51 floor and 51 wall, on quota", () => {
  expect(DECOR_BLITZ.length).toBe(102);
  expect(decorById.size).toBe(102);
  expect(DECOR_BLITZ.filter((d) => d.kind === "floor").length).toBe(51);
  expect(DECOR_BLITZ.filter((d) => d.kind === "wall").length).toBe(51);
  const got: Record<string, number> = {};
  for (const d of DECOR_BLITZ) got[d.theme] = (got[d.theme] ?? 0) + 1;
  expect(got).toEqual(DECOR_QUOTAS);
});

test("decor ids carry their kind and theme", () => {
  for (const d of DECOR_BLITZ) {
    const token = d.theme === "wall_art" ? "gallery" : d.theme;
    expect(d.id.startsWith(`${d.kind}_${token}_`), d.id).toBe(true);
  }
});

// The ledger must not reuse an id the hotel already had. Landed wave ids are subtracted, so the
// gate keeps holding while a wave is in flight.
test("no blitz id collides with the pre-blitz catalog or the decor ledger", () => {
  const pre = [
    ...PROTOTYPE_CATALOG.filter((d) => !LANDED_BLITZ_IDS.has(d.id)),
    ...WALL_CATALOG.filter((d) => !LANDED_BLITZ_IDS.has(d.id)),
  ].map((d) => d.id);
  for (const id of pre) expect(byId.has(id), id).toBe(false);
  for (const d of DECOR_CATALOG) {
    if (!LANDED_DECOR_IDS.has(d.id)) expect(decorById.has(d.id), d.id).toBe(false);
  }
  for (const e of BLITZ) expect(decorById.has(e.id), e.id).toBe(false);
});

test("every colorway names its base by the longest complete prefix", () => {
  const bases = new Map<string, string[]>();
  for (const e of BLITZ) {
    if (e.role === "base") bases.set(e.theme, [...(bases.get(e.theme) ?? []), e.id]);
  }
  for (const e of BLITZ) {
    if (e.role !== "colorway") continue;
    const cands = (bases.get(e.theme) ?? []).filter((b) => e.id.startsWith(b + "_"));
    expect(cands.length, e.id).toBeGreaterThan(0);
    const longest = [...cands].sort((a, b) => b.length - a.length)[0];
    expect(e.base, e.id).toBe(longest);
  }
});

test("Track B gives every base a colorway and exactly six bases a second", () => {
  expect(trackBThemes.length).toBe(8);
  for (const theme of trackBThemes) {
    const t = BLITZ.filter((e) => e.theme === theme);
    const bases = t.filter((e) => e.role === "base").map((e) => e.id);
    expect(bases.length, theme).toBe(12);
    expect(t.filter((e) => e.role === "colorway").length, theme).toBe(18);
    expect(t.filter((e) => e.role === "wall").length, theme).toBe(10);
    const cw: Record<string, number> = {};
    for (const e of t) if (e.role === "colorway" && e.base) cw[e.base] = (cw[e.base] ?? 0) + 1;
    expect(bases.filter((b) => (cw[b] ?? 0) < 1), theme).toEqual([]);
    expect(bases.filter((b) => cw[b] === 2).length, theme).toBe(6);
    expect(bases.filter((b) => (cw[b] ?? 0) > 2), theme).toEqual([]);
  }
});

const LADDER = new Set([25, 50, 75, 150, 250, 300, 400, 500, 900, 1800, 3300]);
test("prices sit on the ladder; below prestige only the vibraphone crosses 400", () => {
  for (const e of priced) {
    expect(LADDER.has(e.price!), e.id).toBe(true);
    if (e.theme === "prestige") expect(e.price, e.id).toBe(PRESTIGE_PRICE[e.id]);
    else if (e.price! > 400) expect(e.id).toBe("lounge_vibraphone");
  }
  expect(byId.get("lounge_vibraphone")?.price).toBe(500);
});

test("ids are lowercase snake case under their theme prefix", () => {
  for (const e of BLITZ) {
    expect(e.id, e.id).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(e.id.startsWith(e.theme + "_"), e.id).toBe(true);
  }
  for (const d of DECOR_BLITZ) expect(d.id, d.id).toMatch(/^[a-z][a-z0-9_]*$/);
});

test("current totals equal the pre-blitz baseline plus landed waves", () => {
  expect(PROTOTYPE_CATALOG.length).toBe(BASELINE_FLOOR + landedFloor);
  expect(WALL_CATALOG.length).toBe(BASELINE_WALL + landedWall);
  expect(DECOR_CATALOG.length).toBe(BASELINE_DECOR + LANDED_DECOR_IDS.size);
});

// The release targets, as pure ledger arithmetic — green today because they check the manifest,
// not the catalog.
test("final totals follow from the manifest", () => {
  expect(BASELINE_FLOOR + BLITZ.filter((e) => e.kind === "floor").length).toBe(459);
  expect(BASELINE_WALL + BLITZ.filter((e) => e.kind === "wall").length).toBe(159);
  expect(BASELINE_DECOR + DECOR_BLITZ.length).toBe(120);
  expect(BASELINE_FLOOR + BASELINE_WALL + BLITZ.length).toBe(618);
});

test("every landed id is in the manifest and exists on its declared surface", () => {
  for (const id of LANDED_BLITZ_IDS) {
    const entry = byId.get(id);
    expect(entry, `${id} is not in the blitz manifest`).toBeDefined();
    if (!entry) continue;
    if (entry.kind === "floor") expect(floorById.has(id), id).toBe(true);
    else expect(wallById.has(id), id).toBe(true);
  }
  for (const id of LANDED_DECOR_IDS) {
    const entry = decorById.get(id);
    expect(entry, `${id} is not in the decor ledger`).toBeDefined();
    if (!entry) continue;
    const def = decorCatalogById.get(id);
    expect(def, id).toBeDefined();
    expect(def?.kind, id).toBe(entry.kind);
  }
});

test("landed rewards are set rewards, unpriced, and never for sale", () => {
  for (const id of LANDED_BLITZ_IDS) {
    if (!byId.get(id)?.reward) continue;
    expect(SET_REWARD_DEFS.has(id), id).toBe(true);
    expect(UNPRICED.has(id), id).toBe(true);
    expect(CATALOG_PRICES.has(id), id).toBe(false);
    expect(COLLECTION_SETS.some((s) => s.reward === id), id).toBe(true);
  }
});

test("landed non-prestige priced items carry exactly their manifest price", () => {
  for (const id of LANDED_BLITZ_IDS) {
    const entry = byId.get(id);
    if (!entry || entry.reward || entry.theme === "prestige" || entry.price === undefined) continue;
    expect(CATALOG_PRICES.get(id), id).toBe(entry.price);
  }
});

test("landed prestige is released or staged, never both", () => {
  for (const id of LANDED_BLITZ_IDS) {
    const entry = byId.get(id);
    if (!entry || entry.theme !== "prestige") continue;
    expect(PRESTIGE_DEFS.has(id), id).toBe(true);
    if (RELEASED_PRESTIGE_IDS.has(id)) {
      expect(CATALOG_PRICES.get(id), id).toBe(entry.price);
      expect(UNPRICED.has(id), id).toBe(false);
    } else {
      expect(UNPRICED.has(id), id).toBe(true);
      expect(CATALOG_PRICES.has(id), id).toBe(false);
    }
  }
});

test("no blitz id ever enters the registration grant", () => {
  for (const e of BLITZ) expect(STARTER_GRANT_DEFS.includes(e.id), e.id).toBe(false);
});

// A colorway is the same mesh remapped, so a landed one must match its base def exactly on
// everything the room reads: footprint, stack heights, seat surface, interaction payload.
test("landed colorways share their base's price and geometry", () => {
  for (const id of LANDED_BLITZ_IDS) {
    const entry = byId.get(id);
    if (!entry || entry.role !== "colorway" || !entry.base) continue;
    const def = floorById.get(id);
    const baseDef = floorById.get(entry.base);
    expect(baseDef, `${id}: base ${entry.base} must be in the catalog`).toBeDefined();
    expect(def, id).toBeDefined();
    if (!def || !baseDef) continue;
    if (CATALOG_PRICES.has(id)) {
      expect(CATALOG_PRICES.get(id), id).toBe(CATALOG_PRICES.get(entry.base));
    }
    expect(def.w, id).toBe(baseDef.w);
    expect(def.l, id).toBe(baseDef.l);
    expect(def.stackHeights, id).toEqual(baseDef.stackHeights);
    expect(def.seatHeight, id).toBe(baseDef.seatHeight);
    expect(def.interaction ?? null, id).toBe(baseDef.interaction ?? null);
    expect(def.vend ?? null, id).toEqual(baseDef.vend ?? null);
  }
});

test("released prestige names manifest prestige items only", () => {
  for (const id of RELEASED_PRESTIGE_IDS) {
    expect(byId.get(id)?.theme, id).toBe("prestige");
  }
});
