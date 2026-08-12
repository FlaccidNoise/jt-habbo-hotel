// The wardrobe registry (#127, PIPELINES §3). Set IDs are append-only and globally unique:
// retiring a garment flags it, never deletes, and an ID is never reused for a different garment.
// Stored figure strings carry the FIGUREDATA_VERSION they were authored against.

/** Render order, back to front. `bd` is implicit — see SELECTABLE_TYPES. */
export const LAYER_ORDER = [
  "bd", "hd", "lg", "sh", "ch", "wa", "cc", "ca", "hr", "fa", "ea", "ha",
] as const;

export type LayerType = (typeof LAYER_ORDER)[number];

/** `bd` is never named in a figure string: it is one mesh that inherits `hd`'s skin ramp. A
 *  separately chosen body colour is a neck-mismatch bug with no upside. */
export const SELECTABLE_TYPES: readonly LayerType[] = LAYER_ORDER.filter((t) => t !== "bd");

export const BODY_SET_ID = 1;

export const FIGUREDATA_VERSION = 1;

/** Ramp names, copied from generator/src/style.ts because generator depends on shared and not the
 *  other way round. `figuredata ramp names match the style bible` in the generator suite is what
 *  keeps the two honest — style.ts stays the single source of the colours themselves. */
const MATERIAL: readonly string[] = [
  "walnut", "oak", "plum", "fern", "crimson", "slate", "sand", "teal", "gold", "ivory",
  "navy", "charcoal",
];
const SKIN: readonly string[] = ["skin_1", "skin_2", "skin_3", "skin_4", "skin_5", "skin_6"];

/** Curated iris ramps — a deliberate subset of MATERIAL, not a new colour family in the style
 *  bible. Faces are a curated combo (design_handoff_avatar_customization/README.md), not
 *  free mix-and-match, so eyes only ever offer these six. */
const IRIS: readonly string[] = ["charcoal", "walnut", "oak", "teal", "fern", "navy"];

export type ColorFamily = "material" | "skin" | "iris";

export function paletteFor(family: ColorFamily): readonly string[] {
  if (family === "skin") return SKIN;
  if (family === "iris") return IRIS;
  return MATERIAL;
}

export interface FigureSet {
  id: number;
  type: LayerType;
  name: string;
  /** How many colours the figure string carries for this set. */
  slots: number;
  family: "material" | "skin";
  /** Per-slot family override, index-aligned with the figure string's colours. Absent means every
   *  slot uses `family`, unchanged from before this field existed. Only needed where slots draw
   *  from different palettes, e.g. a face set's skin slot 0 next to an iris slot 1. */
  slotFamilies?: readonly ColorFamily[];
  /** Types this set removes from the drawn stack. May only name types EARLIER in LAYER_ORDER,
   *  and never `bd` or `hd`. This is what keeps the render holdout set at size one: a hat hides
   *  hair, so a hat never needs a holdout render per hair set. */
  hides: readonly LayerType[];
  retired: boolean;
}

export const FIGURE_SETS: readonly FigureSet[] = [
  { id: 1,  type: "bd", name: "Body",          slots: 1, family: "skin",     hides: [], retired: false },
  { id: 2,  type: "hd", name: "Head",          slots: 1, family: "skin",     hides: [], retired: false },
  { id: 3,  type: "hr", name: "Short Crop",    slots: 1, family: "material", hides: [], retired: false },
  { id: 4,  type: "hr", name: "Long Waves",    slots: 1, family: "material", hides: [], retired: false },
  { id: 5,  type: "ch", name: "Tee",           slots: 1, family: "material", hides: [], retired: false },
  { id: 6,  type: "ch", name: "Trim Shirt",    slots: 2, family: "material", hides: [], retired: false },
  { id: 7,  type: "lg", name: "Trousers",      slots: 1, family: "material", hides: [], retired: false },
  { id: 8,  type: "lg", name: "Pleated Skirt", slots: 1, family: "material", hides: [], retired: false },
  { id: 9,  type: "sh", name: "Loafers",       slots: 1, family: "material", hides: [], retired: false },
  { id: 10, type: "ha", name: "Bellhop Cap",   slots: 1, family: "material", hides: ["hr"], retired: false },
  { id: 11, type: "cc", name: "Overcoat",      slots: 2, family: "material", hides: ["ch"], retired: false },
  { id: 12, type: "ea", name: "Spectacles",    slots: 1, family: "material", hides: [], retired: false },
  { id: 13, type: "fa", name: "Domino Mask",   slots: 1, family: "material", hides: [], retired: false },
  { id: 14, type: "ca", name: "Pendant",       slots: 1, family: "material", hides: [], retired: false },
  { id: 15, type: "wa", name: "Belt",          slots: 1, family: "material", hides: [], retired: false },
  // Staff uniform. Never in the starter grant and never purchasable — NPC accounts own it, so a
  // player naming it in a figure string fails the ownership check like any other unowned set.
  { id: 16, type: "ch", name: "Staff Blazer",  slots: 2, family: "material", hides: [], retired: false },
  // Curated face sets (design_handoff_avatar_customization README, "faces are hd SETS"). Slot 0
  // is the skin ramp shared with the body, slot 1 is the curated iris ramp — no frozen sheets
  // yet, they ship with #342.
  { id: 17, type: "hd", name: "Bright",  slots: 2, family: "skin", slotFamilies: ["skin", "iris"], hides: [], retired: false },
  { id: 18, type: "hd", name: "Calm",    slots: 2, family: "skin", slotFamilies: ["skin", "iris"], hides: [], retired: false },
  { id: 19, type: "hd", name: "Spark",   slots: 2, family: "skin", slotFamilies: ["skin", "iris"], hides: [], retired: false },
  { id: 20, type: "hd", name: "Wink",    slots: 2, family: "skin", slotFamilies: ["skin", "iris"], hides: [], retired: false },
  { id: 21, type: "hd", name: "Sunny",   slots: 2, family: "skin", slotFamilies: ["skin", "iris"], hides: [], retired: false },
  { id: 22, type: "hd", name: "Stern",   slots: 2, family: "skin", slotFamilies: ["skin", "iris"], hides: [], retired: false },
  { id: 23, type: "hd", name: "Worry",   slots: 2, family: "skin", slotFamilies: ["skin", "iris"], hides: [], retired: false },
  { id: 24, type: "hd", name: "Freckle", slots: 2, family: "skin", slotFamilies: ["skin", "iris"], hides: [], retired: false },
  // Facial hair. `fa` was already the mask/chin layer type (Domino Mask, id 13) and already
  // renders right after `hr` in LAYER_ORDER, so no layer-order change is needed.
  { id: 25, type: "fa", name: "Stubble",    slots: 1, family: "material", hides: [], retired: false },
  { id: 26, type: "fa", name: "Moustache",  slots: 1, family: "material", hides: [], retired: false },
  { id: 27, type: "fa", name: "Full Beard", slots: 1, family: "material", hides: [], retired: false },
  // Hair expansion (#345). One mesh each in rig.py FIGURE_PARTS, all one colour slot, none hiding
  // anything — hair is the layer hats hide, never the layer that hides.
  { id: 28, type: "hr", name: "Bob",        slots: 1, family: "material", hides: [], retired: false },
  { id: 29, type: "hr", name: "Ponytail",   slots: 1, family: "material", hides: [], retired: false },
  { id: 30, type: "hr", name: "Curls",      slots: 1, family: "material", hides: [], retired: false },
  { id: 31, type: "hr", name: "Slick Back", slots: 1, family: "material", hides: [], retired: false },
  { id: 32, type: "hr", name: "Buzz",       slots: 1, family: "material", hides: [], retired: false },
  { id: 33, type: "hr", name: "Bun",        slots: 1, family: "material", hides: [], retired: false },
  { id: 34, type: "hr", name: "Fringe",     slots: 1, family: "material", hides: [], retired: false },
  { id: 35, type: "hr", name: "Afro",       slots: 1, family: "material", hides: [], retired: false },
  { id: 36, type: "hr", name: "Braids",     slots: 1, family: "material", hides: [], retired: false },
  { id: 37, type: "hr", name: "Mohawk",     slots: 1, family: "material", hides: [], retired: false },
  // Tops pack (#440). Seven ch garments, each authored to a different outline — the
  // near-duplicate rule is the whole brief, so 39 differs from the staff blazer 16 by
  // hem and shoulder width, not by ramp. None hides anything: ch is what a coat hides.
  { id: 38, type: "ch", name: "Hoodie",        slots: 2, family: "material", hides: [], retired: false },
  { id: 39, type: "ch", name: "Blazer",        slots: 2, family: "material", hides: [], retired: false },
  { id: 40, type: "ch", name: "Vest + Shirt",  slots: 2, family: "material", hides: [], retired: false },
  { id: 41, type: "ch", name: "Polo",          slots: 1, family: "material", hides: [], retired: false },
  { id: 42, type: "ch", name: "Turtleneck",    slots: 1, family: "material", hides: [], retired: false },
  { id: 43, type: "ch", name: "Tank",          slots: 1, family: "material", hides: [], retired: false },
  { id: 44, type: "ch", name: "Tracksuit Top", slots: 2, family: "material", hides: [], retired: false },
  // Legs and shoes pack (#440). Four lg and four sh, all one colour slot, none hiding anything —
  // lg and sh are the two layer types nothing in the wardrobe has ever hidden.
  { id: 45, type: "lg", name: "Shorts",     slots: 1, family: "material", hides: [], retired: false },
  { id: 46, type: "lg", name: "Flares",     slots: 1, family: "material", hides: [], retired: false },
  { id: 47, type: "lg", name: "Cargo",      slots: 1, family: "material", hides: [], retired: false },
  { id: 48, type: "lg", name: "Long Skirt", slots: 1, family: "material", hides: [], retired: false },
  { id: 49, type: "sh", name: "Sneakers",   slots: 1, family: "material", hides: [], retired: false },
  { id: 50, type: "sh", name: "Boots",      slots: 1, family: "material", hides: [], retired: false },
  { id: 51, type: "sh", name: "Heels",      slots: 1, family: "material", hides: [], retired: false },
  { id: 52, type: "sh", name: "Sandals",    slots: 1, family: "material", hides: [], retired: false },
  // Hats pack (#440). Five ha sets, one colour slot each, splitting on the hides rule: a beanie, a
  // top hat and a crown replace the hair the way the Bellhop Cap 10 does, while headphones and a
  // visor are worn WITH it. That split is free — `hr` is an earlier layer type, so hiding it costs
  // no extra render, and not hiding it costs none either: the holdout set is still the body alone,
  // and a hat that keeps the hair simply draws over whichever one is worn.
  { id: 53, type: "ha", name: "Beanie",     slots: 1, family: "material", hides: ["hr"], retired: false },
  { id: 54, type: "ha", name: "Top Hat",    slots: 1, family: "material", hides: ["hr"], retired: false },
  { id: 55, type: "ha", name: "Headphones", slots: 1, family: "material", hides: [], retired: false },
  { id: 56, type: "ha", name: "Visor",      slots: 1, family: "material", hides: [], retired: false },
  { id: 57, type: "ha", name: "Crown",      slots: 1, family: "material", hides: ["hr"], retired: false },
  // Accessories pack (#440), the last of the blitz. Three layer types that all draw over a
  // garment rather than replacing one, so none of them hides anything: ea sits on the face after
  // hr and fa, ca draws after cc so a neck piece is worn over a coat, and wa draws between ch and
  // cc so a coat covers it. Only the sash carries a second slot.
  { id: 58, type: "ea", name: "Sunglasses",  slots: 1, family: "material", hides: [], retired: false },
  { id: 59, type: "ea", name: "Round Specs", slots: 1, family: "material", hides: [], retired: false },
  { id: 60, type: "ca", name: "Scarf",       slots: 1, family: "material", hides: [], retired: false },
  { id: 61, type: "ca", name: "Tie",         slots: 1, family: "material", hides: [], retired: false },
  { id: 62, type: "ca", name: "Chain",       slots: 1, family: "material", hides: [], retired: false },
  { id: 63, type: "wa", name: "Sash",        slots: 2, family: "material", hides: [], retired: false },
  // Costume pack 1 — bannerhold (#449). One shelf that dresses a whole figure, so the pack spans
  // seven layer types rather than crowding one. The `hides` column is the shipped pattern and
  // nothing more: the surcoat hides the shirt it is worn over, the helm replaces hair, and the
  // other five draw alongside whatever is underneath.
  { id: 64, type: "lg", name: "Breeches",        slots: 1, family: "material", hides: [], retired: false },
  { id: 65, type: "sh", name: "Sabatons",        slots: 1, family: "material", hides: [], retired: false },
  { id: 66, type: "ch", name: "Gambeson",        slots: 2, family: "material", hides: [], retired: false },
  { id: 67, type: "wa", name: "Sword Belt",      slots: 2, family: "material", hides: [], retired: false },
  { id: 68, type: "cc", name: "Surcoat",         slots: 2, family: "material", hides: ["ch"], retired: false },
  { id: 69, type: "ca", name: "Heraldic Mantle", slots: 2, family: "material", hides: [], retired: false },
  { id: 70, type: "ha", name: "Crested Helm",    slots: 2, family: "material", hides: ["hr"], retired: false },
  // Costume pack 2 — nocturne (#450). Gothic manor: tiers, a cinched waist, and a coat that is
  // cut away at the front. Same `hides` discipline as bannerhold — the tailcoat hides the shirt
  // it is worn over, the mourning hat replaces hair, and the other five draw alongside.
  { id: 71, type: "lg", name: "Tiered Skirt",    slots: 2, family: "material", hides: [], retired: false },
  { id: 72, type: "sh", name: "Pointed Boot",    slots: 1, family: "material", hides: [], retired: false },
  { id: 73, type: "ch", name: "Corset Bodice",   slots: 2, family: "material", hides: [], retired: false },
  { id: 74, type: "wa", name: "Waist Cincher",   slots: 2, family: "material", hides: [], retired: false },
  { id: 75, type: "cc", name: "Tailcoat",        slots: 2, family: "material", hides: ["ch"], retired: false },
  { id: 76, type: "ca", name: "Lace Ruff",       slots: 1, family: "material", hides: [], retired: false },
  { id: 77, type: "ha", name: "Mourning Hat",    slots: 2, family: "material", hides: ["hr"], retired: false },
  // Costume pack 3 — mochi (#452). Soft and rounded, where the first two packs are cut and
  // padded. No `cc` in this one: the pack's read is curves on the figure itself, so the layer
  // that would cover them is the one it leaves out. Only the sleep cap hides anything.
  { id: 78, type: "lg", name: "Bloomers",        slots: 1, family: "material", hides: [], retired: false },
  { id: 79, type: "sh", name: "Puff Slippers",   slots: 2, family: "material", hides: [], retired: false },
  { id: 80, type: "ch", name: "Cloud Cardigan",  slots: 2, family: "material", hides: [], retired: false },
  { id: 81, type: "wa", name: "Pinafore Apron",  slots: 2, family: "material", hides: [], retired: false },
  { id: 82, type: "ca", name: "Puff Muffler",    slots: 1, family: "material", hides: [], retired: false },
  { id: 83, type: "ha", name: "Sleep Cap",       slots: 2, family: "material", hides: ["hr"], retired: false },
  // Costume pack 4 — starliner (#454). Spacefarer: ringed limbs, a hard shoulder, and gear that
  // stands off the body. The helmet is the only set here that hides anything, and it hides `hr`
  // for the shipped reason — it replaces the hair rather than sitting on it.
  { id: 84, type: "lg", name: "Pressure Leggings", slots: 2, family: "material", hides: [], retired: false },
  { id: 85, type: "sh", name: "Mag Boots",       slots: 2, family: "material", hides: [], retired: false },
  { id: 86, type: "ch", name: "Flight Suit",     slots: 2, family: "material", hides: [], retired: false },
  { id: 87, type: "ca", name: "Oxygen Line",     slots: 2, family: "material", hides: [], retired: false },
  { id: 88, type: "ea", name: "Pressure Goggles", slots: 2, family: "material", hides: [], retired: false },
  { id: 89, type: "ha", name: "Flight Helmet",   slots: 2, family: "material", hides: ["hr"], retired: false },
  // Costume pack 5 — fablewood (#455). Wizard: the only bell sleeves in the wardrobe, the longest
  // robe and the tallest hat. The robe hides the shirt it is worn over and the hat replaces hair,
  // which is the shipped `hides` pattern and nothing more. The beard 95 is the first set in the
  // blitz with no mesh — it is a stamp on facedata.ts's `beard` axis, like 25-27.
  { id: 90, type: "lg", name: "Sage Trousers",   slots: 1, family: "material", hides: [], retired: false },
  { id: 91, type: "ch", name: "Rune Tunic",      slots: 2, family: "material", hides: [], retired: false },
  { id: 92, type: "wa", name: "Potion Belt",     slots: 2, family: "material", hides: [], retired: false },
  { id: 93, type: "cc", name: "Wizard Robe",     slots: 2, family: "material", hides: ["ch"], retired: false },
  { id: 94, type: "ca", name: "Star Stole",      slots: 2, family: "material", hides: [], retired: false },
  { id: 95, type: "fa", name: "Sage Beard",      slots: 1, family: "material", hides: [], retired: false },
  { id: 96, type: "ha", name: "Pointed Hat",     slots: 2, family: "material", hides: ["hr"], retired: false },
  // Costume pack 6 — tidal (#456). Mariner. Every row puts its silhouette event somewhere the
  // wardrobe has not used one: a hem at mid-shin, a boot shaft that widens upward, a collar that
  // exists only behind the figure, a ring standing off the chest, and a brim at the nape. No `cc`
  // — a coat over a life ring hides the one thing this shelf is selling, so the pack leaves out
  // the layer that would cover it. Only the sou'wester hides anything, and it hides `hr` for the
  // shipped reason: it replaces the hair rather than sitting on it.
  { id: 97,  type: "lg", name: "Rolled Deck Trousers", slots: 2, family: "material", hides: [], retired: false },
  { id: 98,  type: "sh", name: "Sea Boots",            slots: 1, family: "material", hides: [], retired: false },
  { id: 99,  type: "ch", name: "Sailor Middy",         slots: 2, family: "material", hides: [], retired: false },
  { id: 100, type: "wa", name: "Rope Belt",            slots: 1, family: "material", hides: [], retired: false },
  { id: 101, type: "ca", name: "Life Ring",            slots: 2, family: "material", hides: [], retired: false },
  { id: 102, type: "ha", name: "Sou'wester",           slots: 2, family: "material", hides: ["hr"], retired: false },
  // Costume pack 7 — verdant (#457). Gardener. Working clothes, and every row is defined by where
  // it STOPS: culottes cut 2 px below the knee, a clog open at the heel, a sleeve rolled to the
  // elbow over a hem that is 4 px lower at the front than the back, a belt whose mass plates the
  // front instead of hanging under it. Only the sunshade hides anything, and it hides `hr` for the
  // shipped reason: it replaces the hair rather than sitting on it.
  { id: 103, type: "lg", name: "Gathered Culottes",    slots: 1, family: "material", hides: [], retired: false },
  { id: 104, type: "sh", name: "Garden Clogs",         slots: 1, family: "material", hides: [], retired: false },
  { id: 105, type: "ch", name: "Rolled-Sleeve Shirt",  slots: 2, family: "material", hides: [], retired: false },
  { id: 106, type: "wa", name: "Tool Roll",            slots: 2, family: "material", hides: [], retired: false },
  { id: 107, type: "ca", name: "Seed Satchel",         slots: 2, family: "material", hides: [], retired: false },
  { id: 108, type: "ha", name: "Woven Sunshade",       slots: 2, family: "material", hides: ["hr"], retired: false },
  // Costume pack 8 — clockwork (#458). Steampunk artisan, and every row is a machine part bolted
  // to a plain garment: an arm that changes width at the elbow, a cog beside the hip driven by a
  // chain up the ribs, a coat that opens at the back, goggles pushed up onto the forehead. The
  // mutton chops are the second and last stamp-path `fa` set, and the goggle cap hides `hr`
  // because it replaces the hair rather than sitting on it.
  { id: 109, type: "lg", name: "Jodhpurs",             slots: 1, family: "material", hides: [], retired: false },
  { id: 110, type: "ch", name: "Bracered Jacket",      slots: 2, family: "material", hides: [], retired: false },
  { id: 111, type: "wa", name: "Gear Belt",            slots: 2, family: "material", hides: [], retired: false },
  { id: 112, type: "cc", name: "Frock Coat",           slots: 2, family: "material", hides: ["ch"], retired: false },
  { id: 113, type: "ca", name: "Cravat",               slots: 1, family: "material", hides: [], retired: false },
  { id: 114, type: "fa", name: "Mutton Chops",         slots: 1, family: "material", hides: [], retired: false },
  { id: 115, type: "ha", name: "Goggle Cap",           slots: 2, family: "material", hides: ["hr"], retired: false },
  // Costume pack 9 — penthouse (#459). Gala wear, sold beside the penthouse furniture, and every
  // row is defined by what it leaves out: the gown's train is the only geometry in the wardrobe
  // that exists behind the figure and nowhere else, the halter has no back, the cape has neither
  // sleeves nor a body. The fascinator leaves the hair alone, so unlike every other `ha` in these
  // packs it hides nothing.
  { id: 116, type: "lg", name: "Trained Gown",         slots: 2, family: "material", hides: [], retired: false },
  { id: 117, type: "ch", name: "Halter Bodice",        slots: 2, family: "material", hides: [], retired: false },
];

const BY_ID = new Map(FIGURE_SETS.map((s) => [s.id, s]));

export function setById(id: number): FigureSet | undefined {
  return BY_ID.get(id);
}

/** What a new account is given, and nothing else. Head, both hairs, both shirts, both legs,
 *  shoes, and the cap — the cap is in so the hides rule is exercised by a real player outfit.
 *  Coat and the accessories are deliberately held back: they are the first cosmetics that have
 *  to be earned (GAME.md — cosmetics are economy goods).
 *
 *  Faces 17-24 and facial hair 25-27 are in because a face is identity, not a cosmetic prize:
 *  the plain head 2 has no eyes, so holding the eyed sets back shipped every new player a blank
 *  skull (#346). The hair expansion 28-37 stays earned (#352). */
export const STARTER_GRANT_SETS: readonly number[] = [
  2, 3, 4, 5, 6, 7, 8, 9, 10,
  17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27,
];

/** The staff uniform, granted to NPC accounts only.
 *
 *  The faces are in for the reason the starter grant has them: dress() prefers an eyed head, and
 *  a grant holding no face set has nothing to prefer, so every NPC came out in the eyeless head 2
 *  even after #346 fixed it for players (#410). Only the blazer 16 is staff-only — the creator
 *  hides this grant's non-starter sets, and 17-24 are starter sets, so widening it here does not
 *  widen what a player is offered. */
export const STAFF_GRANT_SETS: readonly number[] = [
  2, 3, 9, 7, 16,
  17, 18, 19, 20, 21, 22, 23, 24,
];

/** Wearables bought with Stars (#352). One row per set on sale: what it costs, and the catalog
 *  shelf it files under. Themes are the catalog's organizing unit (#355, #364), so a garment pack
 *  opens a new shelf by writing a new `theme` string here and nothing else — the client derives
 *  its tabs from this, and no UI edit follows (#438).
 *
 *  A bought set belongs to the account for good. Ownership is not an item: sets never trade, so
 *  none of this touches #118's marketplace.
 *
 *  Rows are cheapest-first within a theme, because that is the order a shelf shows them in. Hair
 *  is the cosmetics economy's stock — the one garment type with the variety to make a cut say
 *  something — so 28-37 are sold rather than granted, on four rungs inside the furni band
 *  (25-3300) and under the 600 daily earn ceiling: 150 for a plain silhouette, 250 for a shaped
 *  one, 350 for a styled one, and 450 for the three that read across a room.
 *
 *  Tops (38-44, #440) price on the same idea one shelf over: 150 for the one-slot basics, 200-250
 *  once a garment carries a collar or a second colour slot, and 300-400 for the three that change
 *  the figure's outline — a hood, a shirt under a vest, a jacket that hangs past the hip.
 *
 *  Legs (45-48, #440) run 150-300 on how much of the leg the garment replaces: shorts leave the
 *  shin bare, cargo and flares clothe it, and the long skirt covers the leg to the calf. *
 *  Shoes (49-52, #440) are two rungs, not four: 150 for the flat everyday pair and 250-300 once
 *  the shoe changes the leg's outline — a shaft up the shin, or a heel.
 *
 *  Hats (53-57, #440) price on how much of the head the garment takes and how far it stands off
 *  it: 150 for a brim on its own, 200-300 for the two that cover the head or hang off its sides,
 *  and 400-450 for the pair that changes the figure's outline from across a room.
 *
 *  Accessories (58-63, #440) are the cheapest shelf, and deliberately: they are the pieces a
 *  player adds to a look already paid for, so the whole shelf sits at or under the mid rung of
 *  every other one. 150 for the two that are a line on the chest, 200-250 once a set lands on the
 *  face, and 300-350 for the two that add real bulk — a scarf's drape and the sash's second
 *  colour slot.
 *
 *  bannerhold (64-70, #449) is the first shelf that dresses a whole figure rather than one layer,
 *  so it prices on how much of the outline a piece changes rather than on which layer it sits:
 *  200-250 for the breeches and sabatons that reshape a limb, 300 for the three that add a band or
 *  a padded body, and 350-450 for the mantle, the helm and the surcoat, which are read across a
 *  room. The theme string is the furniture chapter's, exactly — a folio chapter sells its room and
 *  its outfit from the same page, and a new theme costs no UI edit (#438).
 *
 *  nocturne (71-77, #450) prices on the same axis: 200-250 for the ruff, the boot and the cincher,
 *  which each reshape one end of the figure, 300 for the skirt and the bodice that rebuild a whole
 *  half of it, and 400-450 for the hat and the tailcoat, whose read is a wide brim and a pair of
 *  tails seen from across a room.
 *
 *  mochi (78-83, #452) is the cheapest of the three costume shelves, because softness is the one
 *  thing this wardrobe can add without adding bulk: 150-200 for the slippers, the bloomers and the
 *  muffler, which round off one end of the figure, 250 for the apron's hanging panel, and 300 for
 *  the cardigan and the sleep cap, the two that change the outline — the widest body in the
 *  wardrobe, and a taper standing 8 px over the crown. Six rows rather than seven: the pack has no
 *  `cc`, so nothing here covers the curves it is selling. */
export const WEARABLE_SHELF: readonly { set: number; price: number; theme: string }[] = [
  { set: 32, price: 150, theme: "hair" },   // Buzz
  { set: 34, price: 150, theme: "hair" },   // Fringe
  { set: 28, price: 250, theme: "hair" },   // Bob
  { set: 31, price: 250, theme: "hair" },   // Slick Back
  { set: 29, price: 350, theme: "hair" },   // Ponytail
  { set: 30, price: 350, theme: "hair" },   // Curls
  { set: 33, price: 350, theme: "hair" },   // Bun
  { set: 35, price: 450, theme: "hair" },   // Afro
  { set: 36, price: 450, theme: "hair" },   // Braids
  { set: 37, price: 450, theme: "hair" },   // Mohawk
  { set: 41, price: 150, theme: "tops" },   // Polo
  { set: 43, price: 150, theme: "tops" },   // Tank
  { set: 42, price: 200, theme: "tops" },   // Turtleneck
  { set: 44, price: 250, theme: "tops" },   // Tracksuit Top
  { set: 38, price: 300, theme: "tops" },   // Hoodie
  { set: 40, price: 350, theme: "tops" },   // Vest + Shirt
  { set: 39, price: 400, theme: "tops" },   // Blazer
  { set: 45, price: 150, theme: "legs" },   // Shorts
  { set: 47, price: 200, theme: "legs" },   // Cargo
  { set: 46, price: 250, theme: "legs" },   // Flares
  { set: 48, price: 300, theme: "legs" },   // Long Skirt
  { set: 49, price: 150, theme: "shoes" },  // Sneakers
  { set: 52, price: 150, theme: "shoes" },  // Sandals
  { set: 50, price: 250, theme: "shoes" },  // Boots
  { set: 51, price: 300, theme: "shoes" },  // Heels
  { set: 56, price: 150, theme: "hats" },   // Visor
  { set: 53, price: 200, theme: "hats" },   // Beanie
  { set: 55, price: 300, theme: "hats" },   // Headphones
  { set: 54, price: 400, theme: "hats" },   // Top Hat
  { set: 57, price: 450, theme: "hats" },   // Crown
  { set: 62, price: 150, theme: "accessories" },  // Chain
  { set: 61, price: 150, theme: "accessories" },  // Tie
  { set: 59, price: 200, theme: "accessories" },  // Round Specs
  { set: 58, price: 250, theme: "accessories" },  // Sunglasses
  { set: 60, price: 300, theme: "accessories" },  // Scarf
  { set: 63, price: 350, theme: "accessories" },  // Sash
  { set: 64, price: 200, theme: "bannerhold" },  // Breeches
  { set: 65, price: 250, theme: "bannerhold" },  // Sabatons
  { set: 66, price: 300, theme: "bannerhold" },  // Gambeson
  { set: 67, price: 300, theme: "bannerhold" },  // Sword Belt
  { set: 69, price: 350, theme: "bannerhold" },  // Heraldic Mantle
  { set: 70, price: 400, theme: "bannerhold" },  // Crested Helm
  { set: 68, price: 450, theme: "bannerhold" },  // Surcoat
  { set: 76, price: 200, theme: "nocturne" },    // Lace Ruff
  { set: 72, price: 250, theme: "nocturne" },    // Pointed Boot
  { set: 74, price: 250, theme: "nocturne" },    // Waist Cincher
  { set: 71, price: 300, theme: "nocturne" },    // Tiered Skirt
  { set: 73, price: 300, theme: "nocturne" },    // Corset Bodice
  { set: 77, price: 400, theme: "nocturne" },    // Mourning Hat
  { set: 75, price: 450, theme: "nocturne" },    // Tailcoat
  { set: 79, price: 150, theme: "mochi" },       // Puff Slippers
  { set: 78, price: 200, theme: "mochi" },       // Bloomers
  { set: 82, price: 200, theme: "mochi" },       // Puff Muffler
  { set: 81, price: 250, theme: "mochi" },       // Pinafore Apron
  { set: 80, price: 300, theme: "mochi" },       // Cloud Cardigan
  { set: 83, price: 300, theme: "mochi" },       // Sleep Cap
  { set: 84, price: 200, theme: "starliner" },   // Pressure Leggings
  { set: 87, price: 250, theme: "starliner" },   // Oxygen Line
  { set: 85, price: 300, theme: "starliner" },   // Mag Boots
  { set: 86, price: 300, theme: "starliner" },   // Flight Suit
  { set: 88, price: 350, theme: "starliner" },   // Pressure Goggles
  { set: 89, price: 400, theme: "starliner" },   // Flight Helmet
  { set: 90, price: 200, theme: "fablewood" },   // Sage Trousers
  { set: 95, price: 200, theme: "fablewood" },   // Sage Beard
  { set: 92, price: 250, theme: "fablewood" },   // Potion Belt
  { set: 94, price: 250, theme: "fablewood" },   // Star Stole
  { set: 91, price: 300, theme: "fablewood" },   // Rune Tunic
  { set: 96, price: 400, theme: "fablewood" },   // Pointed Hat
  { set: 93, price: 450, theme: "fablewood" },   // Wizard Robe
  { set: 97,  price: 150, theme: "tidal" },      // Rolled Deck Trousers
  { set: 100, price: 150, theme: "tidal" },      // Rope Belt
  { set: 102, price: 250, theme: "tidal" },      // Sou'wester
  { set: 98,  price: 300, theme: "tidal" },      // Sea Boots
  { set: 99,  price: 300, theme: "tidal" },      // Sailor Middy
  { set: 101, price: 350, theme: "tidal" },      // Life Ring
  { set: 104, price: 150, theme: "verdant" },    // Garden Clogs
  { set: 105, price: 200, theme: "verdant" },    // Rolled-Sleeve Shirt
  { set: 103, price: 250, theme: "verdant" },    // Gathered Culottes
  { set: 106, price: 250, theme: "verdant" },    // Tool Roll
  { set: 107, price: 300, theme: "verdant" },    // Seed Satchel
  { set: 108, price: 350, theme: "verdant" },    // Woven Sunshade
  { set: 114, price: 150, theme: "clockwork" },  // Mutton Chops
  { set: 113, price: 200, theme: "clockwork" },  // Cravat
  { set: 109, price: 250, theme: "clockwork" },  // Jodhpurs
  { set: 111, price: 300, theme: "clockwork" },  // Gear Belt
  { set: 110, price: 350, theme: "clockwork" },  // Bracered Jacket
  { set: 112, price: 400, theme: "clockwork" },  // Frock Coat
  { set: 115, price: 400, theme: "clockwork" },  // Goggle Cap
  { set: 117, price: 300, theme: "penthouse" },  // Halter Bodice
  { set: 116, price: 450, theme: "penthouse" },  // Trained Gown
];

/** What a set costs, for the buy path and the creator's locked-garment badges. A set missing here
 *  is not for sale. */
export const WEARABLE_PRICES: ReadonlyMap<number, number> =
  new Map(WEARABLE_SHELF.map((w) => [w.set, w.price]));

/** Every set that is neither granted nor priced must be listed here with a reason — checked by
 *  figure.test.ts, so a garment nobody can ever obtain stays a deliberate choice rather than a
 *  silent gap, the same rule UNPRICED holds furni to. */
export const UNPURCHASABLE_SETS: ReadonlySet<number> = new Set([
  BODY_SET_ID,   // implicit: never named in a figure string, so never bought
  16,            // staff blazer: the NPC uniform, granted to staff accounts and sold to nobody
  // The coat and the accessories predate the Stars shelf and still have no acquisition path —
  // #425, tracked separately because #352 covers the faces and the hair expansion.
  11, 12, 13, 14, 15,
]);
