export interface Sortable {
  x: number; y: number; z: number;
  kind: "tile" | "floor_furni" | "avatar" | "seated" | "furni";
}

const TILE_BAND = -1e6;                                  // floor band, still ordered by depth
// `seated` is the one layer above furni: a sitter shares a tile with the seat, and drawing them
// behind it buries them in the sprite. Doing it properly — body behind a near-side chair back,
// in front of a far-side one — needs the per-direction occlusion groups the bundle format
// reserves and the generator does not emit yet (PIPELINES §2 stage 1).
const LAYER = { floor_furni: -2e-2, avatar: -1e-2, furni: 0, seated: 1e-2 } as const;

// Ascending: larger key draws later, on top. Ties resolve by insertion order (ES2019 stable
// sort / Pixi zIndex). NOTE the layer signs are inverted relative to the reference client's
// AVATAR_SPRITE_DEFAULT_DEPTH because the reference sorts DESCENDING — do not "fix" them back.
export function depthKey(s: Sortable): number {
  if (s.kind === "tile") return TILE_BAND + (s.x + s.y);
  return (s.x + s.y) + s.z * 1e-3 + LAYER[s.kind];
}
