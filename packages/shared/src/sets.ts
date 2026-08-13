// Collection sets (GAME.md §Status systems, #210). Catalog lines ship as named sets with progress
// counts; completing one mints a set badge and a set-only furni piece. Completion is what players
// chase, not progression — so the reward lands on the last item, never in slices along the way.
//
// Economically this is a sink because it makes the *skipped* items worth buying: a player who
// owns three of the four café pieces now has a reason to buy the fourth they did not want.

export interface CollectionSet {
  id: string;
  name: string;
  /** Every def that must be owned, in display order. */
  members: readonly string[];
  /** Minted on completion, account-bound, and obtainable no other way. */
  reward: string;
  badge: string;
}

export const COLLECTION_SETS: readonly CollectionSet[] = [
  {
    id: "cafe",
    name: "The Café Set",
    members: ["cafe_table", "cafe_chair", "cafe_chair_crimson", "cafe_chair_navy"],
    reward: "cafe_table_marble",
    badge: "set_cafe",
  },
  {
    id: "casino",
    name: "The Casino Floor",
    members: ["casino_table", "casino_stool", "casino_stool_fern", "slot_machine"],
    reward: "casino_table_onyx",
    badge: "set_casino",
  },
  {
    id: "suite",
    name: "The Suite Basics Set",
    members: ["bedroom_bed_frame", "bedroom_dresser", "bedroom_wardrobe", "bedroom_vanity"],
    reward: "bedroom_vanity_ivory",
    badge: "set_suite",
  },
  {
    id: "tidal",
    name: "The Tidal Set",
    members: ["tidal_shell_bed", "tidal_chart_desk", "tidal_coral_table", "tidal_reef_shelf"],
    reward: "tidal_shell_bed_dusk",
    badge: "set_tidal",
  },
  {
    id: "fablewood",
    name: "The Fablewood Set",
    members: ["fablewood_wizard_desk", "fablewood_alchemy_bench", "fablewood_crystal_orb", "fablewood_aether_throne"],
    reward: "fablewood_aether_throne_stone",
    badge: "set_fablewood",
  },

  {
    id: "starliner",
    name: "The Starliner Set",
    members: ["starliner_bunk_pod", "starliner_console", "starliner_captain_chair", "starliner_holo_projector"],
    reward: "starliner_holo_projector_astro",
    badge: "set_starliner",
  },
  {
    id: "mochi",
    name: "The Mochi Set",
    members: ["mochi_day_bed", "mochi_boba_cart", "mochi_mallow_plush", "mochi_cloud_sofa"],
    reward: "mochi_mallow_plush_yuzu",
    badge: "set_mochi",
  },
  {
    id: "nocturne",
    name: "The Nocturne Set",
    members: ["nocturne_coffin_daybed", "nocturne_high_throne", "nocturne_pipe_organ", "nocturne_iron_gate"],
    reward: "nocturne_coffin_daybed_slate",
    badge: "set_nocturne",
  },
  {
    id: "bannerhold",
    name: "The Bannerhold Set",
    members: ["bannerhold_feast_table", "bannerhold_high_seat", "bannerhold_armor_stand", "bannerhold_hearth_brazier"],
    reward: "bannerhold_high_seat_navy",
    badge: "set_bannerhold",
  },
  {
    id: "deco_suite",
    name: "The Deco Suite Set",
    members: ["penthouse_sofa", "penthouse_marble_table", "penthouse_dining_chair", "penthouse_bar"],
    reward: "penthouse_telescope_copper",
    badge: "set_deco_suite",
  },
  {
    id: "after_hours",
    name: "The After Hours Set",
    members: ["lounge_vibraphone", "lounge_velvet_sofa", "lounge_record_console", "lounge_stage_rug"],
    reward: "lounge_vibraphone_ivory",
    badge: "set_after_hours",
  },
  {
    id: "hearthside",
    name: "The Hearthside Set",
    members: ["lodge_log_bed", "lodge_wood_table", "lodge_wood_stove", "lodge_lantern"],
    reward: "lodge_wood_stove_slate",
    badge: "set_hearthside",
  },
  {
    id: "poolside",
    name: "The Poolside Set",
    members: ["pool_hanging_chair", "pool_shade_sail", "pool_float_rack", "pool_towel_cart"],
    reward: "pool_mosaic_rug_lagoon",
    badge: "set_poolside",
  },
  {
    id: "gallery",
    name: "The Gallery",
    members: ["wall_art", "poster", "record_trophy", "wall_shelf"],
    reward: "wall_art_gilded",
    badge: "set_gallery",
  },
];

/** Set rewards are minted, never sold — the catalog test knows to expect no price for them. */
export const SET_REWARD_DEFS: ReadonlySet<string> = new Set(COLLECTION_SETS.map((s) => s.reward));

/** Mutable arrays: this goes straight onto the wire, and the protocol schema infers them so. */
export interface SetProgress {
  id: string;
  name: string;
  owned: string[];
  missing: string[];
  complete: boolean;
  reward: string;
}

/** Progress for every set given the defs an account owns. Duplicates do not count twice — a set
 *  is completed by breadth, so buying four of the same chair gets you nowhere. */
export function setProgress(ownedDefIds: Iterable<string>): SetProgress[] {
  const owned = new Set(ownedDefIds);
  return COLLECTION_SETS.map((set) => {
    const have = set.members.filter((m) => owned.has(m));
    const missing = set.members.filter((m) => !owned.has(m));
    return {
      id: set.id,
      name: set.name,
      owned: have,
      missing,
      complete: missing.length === 0,
      reward: set.reward,
    };
  });
}
