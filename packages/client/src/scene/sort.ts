export interface Sortable {
  x: number; y: number; z: number;
  kind: "tile" | "floor_furni" | "furni_far" | "avatar" | "furni" | "furni_near";
}

const TILE_BAND = -1e6;                                  // floor band, still ordered by depth

// Same-tile order, back to front: rug, the far half of a seat, avatars, ordinary furni, the near
// half of a seat.
//
// A SEATING item draws as two sprites (#227). `furni_far` is its whole sheet, below the sitter;
// `furni_near` is the companion sheet holding only the prims nearer the camera than the seat
// point, drawn again above the sitter. Everything else stays on `furni`, because you stand UNDER
// a table's sprite on the same tile. This replaces the old `seated` layer, which lifted the whole
// sitter above the whole chair and so could never let a near-side back occlude them.
const LAYER = {
  floor_furni: -3e-2, furni_far: -2e-2, avatar: -1e-2, furni: 0, furni_near: 1e-2,
} as const;

// The z term breaks ties WITHIN a layer (stacked furni on one tile) and must never cross between
// layers. At 1e-4 the whole z range (z < 10) contributes under 1e-3, a tenth of the 1e-2 layer
// spacing. It used to be 1e-3, where a tall item at z=9.9 landed exactly on the next layer —
// fine with four layers, not with five.
const Z_EPSILON = 1e-4;

// Ascending: larger key draws later, on top. Ties resolve by insertion order (ES2019 stable
// sort / Pixi zIndex). NOTE the layer signs are inverted relative to the reference client's
// AVATAR_SPRITE_DEFAULT_DEPTH because the reference sorts DESCENDING — do not "fix" them back.
export function depthKey(s: Sortable): number {
  if (s.kind === "tile") return TILE_BAND + (s.x + s.y);
  return (s.x + s.y) + s.z * Z_EPSILON + LAYER[s.kind];
}
