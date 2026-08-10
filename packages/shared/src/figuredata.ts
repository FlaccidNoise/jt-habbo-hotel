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
];

const BY_ID = new Map(FIGURE_SETS.map((s) => [s.id, s]));

export function setById(id: number): FigureSet | undefined {
  return BY_ID.get(id);
}

/** What a new account is given, and nothing else. Head, both hairs, both shirts, both legs,
 *  shoes, and the cap — the cap is in so the hides rule is exercised by a real player outfit.
 *  Coat and the accessories are deliberately held back: they are the first cosmetics that have
 *  to be earned (GAME.md — cosmetics are economy goods). */
export const STARTER_GRANT_SETS: readonly number[] = [2, 3, 4, 5, 6, 7, 8, 9, 10];

/** The staff uniform, granted to NPC accounts only. */
export const STAFF_GRANT_SETS: readonly number[] = [2, 3, 9, 7, 16];
