export interface Sortable {
  x: number; y: number; z: number;
  kind: "tile" | "wall" | "wall_furni" | "floor_furni" | "avatar" | "seated" | "furni";
}

const TILE_BAND = -1e6;                                  // floor band, still ordered by depth
// `seated` is the one layer above furni: a sitter shares a tile with the seat, and drawing them
// behind it buries them in the sprite. Doing it properly — body behind a near-side chair back,
// in front of a far-side one — needs the per-direction occlusion groups the bundle format
// reserves and the generator does not emit yet (PIPELINES §2 stage 1).
const LAYER = { wall: -4e-2, wall_furni: -3e-2, floor_furni: -2e-2, avatar: -1e-2, furni: 0, seated: 1e-2 } as const;
// A wall stands half a tile behind the tiles it borders, so it takes that depth literally rather
// than a band: furni on the tile in front covers it, furni on the tile behind does not.
const WALL_INSET = 0.5;

// Ascending: larger key draws later, on top. Ties resolve by insertion order (ES2019 stable
// sort / Pixi zIndex). NOTE the layer signs are inverted relative to the reference client's
// AVATAR_SPRITE_DEFAULT_DEPTH because the reference sorts DESCENDING — do not "fix" them back.
export function depthKey(s: Sortable): number {
  if (s.kind === "tile") return TILE_BAND + (s.x + s.y);
  if (s.kind === "wall" || s.kind === "wall_furni") {
    return (s.x + s.y - WALL_INSET) + LAYER[s.kind];
  }
  return (s.x + s.y) + s.z * 1e-3 + LAYER[s.kind];
}
