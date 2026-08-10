import { DIR_STEPS } from "./projection.ts";

export interface Door { x: number; y: number; dir: number }
export interface RoomModel { width: number; height: number; tiles: Int16Array; door: Door }

export class HeightmapError extends Error {}

/** #406: raised from 64 for the giant public rooms. The client's cost follows the viewport rather
 *  than the room (#359/#360) and the pathfinder is bounded by EXPANSION_CAP, so the ceiling here is
 *  the room_state payload — 300x300 measures ~103 KB (#362), and 512 leaves headroom above the
 *  flagship without inviting a room nothing can serialise. The flagship itself is 200x200 since
 *  #409; the ceiling is sized for what a room may grow to, not for what the largest one is. */
const MAX_DIM = 512;

/** 'x'→-1 (void), '0'-'9'→0-9, 'a'-'z'→10-35, case-insensitive. Known Habbo quirk: 'x' shadows
 *  height 33, so 33 is unrepresentable. */
export function charToHeight(ch: string): number {
  const c = ch.toLowerCase();
  if (c === "x") return -1;
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "a" && c <= "z") return c.charCodeAt(0) - 97 + 10;
  throw new HeightmapError(`invalid heightmap character: ${JSON.stringify(ch)}`);
}

/** Shared with pathfinding: a step is climbable when neither end is void and the rise is ≤ 1. */
export function climbOk(hFrom: number, hTo: number): boolean {
  return hFrom >= 0 && hTo >= 0 && Math.abs(hTo - hFrom) <= 1;
}

export function tileHeight(m: RoomModel, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return -1;
  return m.tiles[y * m.width + x] ?? -1;
}

/** The pathfinder's movement rules minus its dynamic blocked set: target climbable, and a
 *  diagonal additionally needs both orthogonal tiles climbable from `from` (no corner cutting). */
function stepAllowed(m: RoomModel, fx: number, fy: number, tx: number, ty: number): boolean {
  const hFrom = tileHeight(m, fx, fy);
  if (!climbOk(hFrom, tileHeight(m, tx, ty))) return false;
  if (fx === tx || fy === ty) return true;
  return climbOk(hFrom, tileHeight(m, tx, fy)) && climbOk(hFrom, tileHeight(m, fx, ty));
}

export function parseHeightmap(text: string, door: Door): RoomModel {
  const body = text.endsWith("\n") ? text.slice(0, -1) : text;
  const rows = body.split("\n");
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  if (width === 0) throw new HeightmapError("heightmap is empty");
  if (width > MAX_DIM || height > MAX_DIM) {
    throw new HeightmapError(`heightmap ${width}x${height} exceeds ${MAX_DIM}x${MAX_DIM}`);
  }

  const tiles = new Int16Array(width * height);
  for (let y = 0; y < height; y++) {
    const row = rows[y] ?? "";
    if (row.length !== width) {
      throw new HeightmapError(`row ${y} has ${row.length} tiles, expected ${width}`);
    }
    for (let x = 0; x < width; x++) tiles[y * width + x] = charToHeight(row[x] ?? "");
  }

  const m: RoomModel = { width, height, tiles, door };
  if (tileHeight(m, door.x, door.y) < 0) {
    throw new HeightmapError(`door ${door.x},${door.y} is not a walkable tile`);
  }

  const seen = new Uint8Array(width * height);
  const queue: number[] = [door.y * width + door.x];
  seen[queue[0] ?? 0] = 1;
  let reached = 0;
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head] ?? 0;
    reached++;
    const fx = i % width, fy = (i / width) | 0;
    for (const s of DIR_STEPS) {
      const tx = fx + s.dx, ty = fy + s.dy;
      if (tx < 0 || ty < 0 || tx >= width || ty >= height) continue;
      const j = ty * width + tx;
      if (seen[j] === 1 || !stepAllowed(m, fx, fy, tx, ty)) continue;
      seen[j] = 1;
      queue.push(j);
    }
  }

  let walkable = 0;
  for (let i = 0; i < tiles.length; i++) if ((tiles[i] ?? -1) >= 0) walkable++;
  if (reached !== walkable) {
    throw new HeightmapError(`${walkable - reached} tile(s) unreachable from the door`);
  }

  return m;
}
