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
