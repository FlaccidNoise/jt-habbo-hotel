import type { DepthBox } from "./depth.ts";
import { tileHeight } from "./heightmap.ts";
import type { RoomModel } from "./heightmap.ts";
import type { Scale } from "./projection.ts";
import { worldToScreen } from "./projection.ts";
import type { WallDef, WallItem, WallSide } from "./protocol.ts";

// The second coordinate space (PIPELINES §1). Floor items live on tiles; wall items live on the
// vertical planes that close the room's exposed north-west and north-east edges.
//
// A segment is named by the floor tile it borders. The left wall of tile (x, y) is the plane at
// world x-0.5 and runs along +y; the right wall is the plane at y-0.5 and runs along +x. Both
// measure their offsets from the same world point — the tile's low corner at wall height.
//
// Offsets are scale-64 screen pixels, the same units the generator's frames are cut in:
//   u — along the wall from the segment's near corner. One segment spans WALL_SEG_PX of screen x.
//   v — straight down from the wall top.
// The wall's horizontal axis is the projection's 2:1 diagonal, so one along-wall pixel moves the
// sprite (±1, +0.5) on screen. u is therefore even by rule and the arithmetic stays exact — no
// half-pixel wobble when an item slides along a wall.

/** Wall height in height units — 128 px at scale 64, a shade under three avatar bodies. */
export const WALL_HEIGHT = 4;
/** Screen-x pixels one wall segment spans, at scale 64. */
export const WALL_SEG_PX = 32;
/** Usable vertical pixels on a wall, at scale 64. */
export const WALL_TOP_PX = WALL_HEIGHT * 32;
/** How far a wall item may stand off its wall, in tiles. A shelf's brackets, not a table. */
export const WALL_MAX_DEPTH = 0.3;

export interface WallSegment {
  side: WallSide;
  x: number;
  y: number;
}

/** A hanging position: which segment, and where on it. */
export interface WallPos extends WallSegment {
  u: number;
  v: number;
}

/** True where a wall closes this tile's edge: the neighbour behind it is void, and the tile is
 *  not the door — the doorway is a hole in the wall, not a place to hang a poster. */
export function hasWallSegment(m: RoomModel, side: WallSide, x: number, y: number): boolean {
  if (tileHeight(m, x, y) < 0) return false;
  if (x === m.door.x && y === m.door.y) return false;
  return side === "left" ? tileHeight(m, x - 1, y) < 0 : tileHeight(m, x, y - 1) < 0;
}

export function wallSegments(m: RoomModel): WallSegment[] {
  const out: WallSegment[] = [];
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      for (const side of ["left", "right"] as const) {
        if (hasWallSegment(m, side, x, y)) out.push({ side, x, y });
      }
    }
  }
  return out;
}

/** The point a segment's (u, v) offsets measure from: its near corner at wall height. Left and
 *  right walls of the same tile share it — they meet there. */
export function wallOrigin(x: number, y: number, scale: Scale): { sx: number; sy: number } {
  return worldToScreen(x - 0.5, y - 0.5, WALL_HEIGHT, scale);
}

/** Which way along-wall +u runs on screen: right walls travel +x (screen right), left walls +y
 *  (screen left). Both drop half a pixel of screen y per pixel of u. */
export function wallSign(side: WallSide): 1 | -1 {
  return side === "left" ? -1 : 1;
}

/** Screen offset from `wallOrigin` for a position on the wall. Exact for even u. */
export function wallOffset(side: WallSide, u: number, v: number): { dx: number; dy: number } {
  return { dx: wallSign(side) * u, dy: u / 2 + v };
}

/** A wall segment as a box in the painter sort (#203, #230). The plane has no thickness, but the
 *  sort works in boxes, so a segment takes the half tile between the plane and the floor tile it
 *  borders — the same half tile the old scalar key subtracted by hand as `WALL_INSET`.
 *
 *  Being a box instead of a key offset is the whole point: the wall is now literally west (left
 *  side) or north (right side) of everything standing on that tile, so `behind` orders it first
 *  by the ordinary rule and nothing has to declare that walls draw early. A raised platform in
 *  front of it still covers it, which a fixed band could never express. */
export function wallBox(side: WallSide, x: number, y: number, layer: number): DepthBox {
  return side === "left"
    ? { x0: x - 0.5, y0: y, z0: 0, x1: x, y1: y + 1, z1: WALL_HEIGHT, layer }
    : { x0: x, y0: y - 0.5, z0: 0, x1: x + 1, y1: y, z1: WALL_HEIGHT, layer };
}

/** A hung item's box: the half tile of every segment it spans. It ties exactly with the wall's own
 *  box — neither is west, north, or under the other — so the `wall_furni` layer is what draws it
 *  in front of the wall, and its being west of the bordering tile is what puts it behind a plant
 *  standing there. Depth off the wall is not modelled: every legal value is under half a tile
 *  (`WALL_MAX_DEPTH`), so none of them changes an ordering. */
export function wallItemBox(
  def: WallDef, side: WallSide, x: number, y: number, layer: number,
): DepthBox {
  const segs = wallSpanSegments(def, side, x, y);
  const near = wallBox(side, x, y, layer);
  const last = segs[segs.length - 1];
  if (!last) return near;
  const far = wallBox(side, last.x, last.y, layer);
  return { ...near, x1: far.x1, y1: far.y1 };
}

/** Items collide only within one straight run of wall. A run is a whole plane: all left segments
 *  sharing an x, all right segments sharing a y. Two left walls at different x never touch. */
function runKey(side: WallSide, x: number, y: number): string {
  return side === "left" ? `l${x}` : `r${y}`;
}

/** Absolute along-wall pixel of a position, measured across the whole run. */
function alongPx(side: WallSide, x: number, y: number, u: number): number {
  return (side === "left" ? y : x) * WALL_SEG_PX + u;
}

/** The segments an item covers, in order along the wall. */
export function wallSpanSegments(def: WallDef, side: WallSide, x: number, y: number): WallSegment[] {
  const out: WallSegment[] = [];
  for (let i = 0; i < def.span; i++) {
    out.push(side === "left" ? { side, x, y: y + i } : { side, x: x + i, y });
  }
  return out;
}

export interface WallPlacementCtx {
  model: RoomModel;
  wallFurni: WallItem[];
  defs: ReadonlyMap<string, WallDef>;
  /** Everything already placed in the room, floor and wall — the cap covers both. */
  furniCount: number;
  roomFurniCap: number;
}
export type WallPlacementResult =
  | { ok: true }
  | { ok: false; code: "bad_position" | "occupied" | "room_full" };

/** The bounds an item's offsets must stay inside: it may not overhang its own span or the wall. */
export function wallOffsetLimits(def: WallDef): { maxU: number; maxV: number } {
  return {
    maxU: def.span * WALL_SEG_PX - def.plane.w,
    maxV: WALL_TOP_PX - def.plane.h,
  };
}

/** One definition of a legal hanging position, shared by both sides — the client never previews a
 *  spot the server refuses. */
export function checkWallPlacement(
  ctx: WallPlacementCtx,
  def: WallDef,
  side: WallSide,
  x: number,
  y: number,
  u: number,
  v: number,
): WallPlacementResult {
  if (ctx.furniCount >= ctx.roomFurniCap) return { ok: false, code: "room_full" };

  const { maxU, maxV } = wallOffsetLimits(def);
  if (u % 2 !== 0 || u < 0 || u > maxU) return { ok: false, code: "bad_position" };
  if (v < 0 || v > maxV) return { ok: false, code: "bad_position" };

  for (const seg of wallSpanSegments(def, side, x, y)) {
    if (!hasWallSegment(ctx.model, seg.side, seg.x, seg.y)) return { ok: false, code: "bad_position" };
  }

  const run = runKey(side, x, y);
  const a0 = alongPx(side, x, y, u);
  const a1 = a0 + def.plane.w;
  for (const other of ctx.wallFurni) {
    if (runKey(other.side, other.x, other.y) !== run) continue;
    const od = ctx.defs.get(other.defId);
    if (!od) throw new Error(`unknown wall def: ${other.defId}`);
    const b0 = alongPx(other.side, other.x, other.y, other.u);
    if (a0 >= b0 + od.plane.w || b0 >= a1) continue;
    if (v >= other.v + od.plane.h || other.v >= v + def.plane.h) continue;
    return { ok: false, code: "occupied" };
  }
  return { ok: true };
}
