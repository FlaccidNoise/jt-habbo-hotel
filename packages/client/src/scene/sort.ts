import type { Container } from "pixi.js";
import { painterOrder } from "@grand/shared";
import type { DepthBox } from "@grand/shared";

const TILE_BAND = -1e6;

/** Tie-break for boxes that share a space, where no side is west, north, or underneath the
 *  other: a rug under an avatar, an avatar under a table on its tile.
 *
 *  The top two are a pair. A sitter shares a tile with the seat, so `seated` puts the body over
 *  it; `seat_front` is the half of that seat which belongs over the body in turn — the near-side
 *  back and arm the generator splits off (PIPELINES §1 Seating occlusion). `seatEdges` is what
 *  actually orders those two, because their boxes cannot.
 *
 *  `wall` and `wall_furni` sit lowest of the real sprites, but that is only a tie-break: a wall
 *  is a box half a tile behind the tiles it borders (#203, walls.ts `wallBox`), so `behind` puts
 *  it before anything standing on them by plain geometry. The layer is what orders a poster
 *  against the wall it hangs on, since the two share that half-tile and neither is west, north,
 *  or under the other. */
export const LAYER = {
  tile: 0, wall: 1, wall_furni: 2, floor_furni: 3, marker: 4, avatar: 5, furni: 6,
  seated: 7, seat_front: 8,
} as const;

/** Where a tile sits when it is not in the painter sort: a band of its own below every sprite.
 *
 *  Only tiles at the room's own floor height get this. A tile is drawn over things north and west
 *  of it, and to reach up-screen far enough to cover any of them its top has to clear the floor
 *  they stand on — which nothing at the lowest height in the room ever does. Everything higher
 *  joins the sort and occludes for real (#230, room.ts). */
export function tileDepth(x: number, y: number): number {
  return TILE_BAND + (x + y);
}

/** A sitter always draws before the half of their seat that belongs in front of them.
 *
 *  Geometry cannot say this. The near-side backrest of a chair sits inside the tile the sitter
 *  occupies, so neither is west, north, or under the other, and on a 2-tile sofa one backrest has
 *  to come after sitters on either tile — no single box orders it against both. So it is a forced
 *  edge on the two layers instead, for every overlapping pair. */
function seatEdges(boxes: readonly DepthBox[]): Array<[number, number]> {
  const at = (layer: number): number[] =>
    boxes.flatMap((b, i) => (b.layer === layer ? [i] : []));
  const fronts = at(LAYER.seat_front);
  if (fronts.length === 0) return [];
  return at(LAYER.seated).flatMap((s) =>
    fronts.flatMap((f): Array<[number, number]> => {
      const a = boxes[s], b = boxes[f];
      if (!a || !b || a.x0 >= b.x1 || b.x0 >= a.x1 || a.y0 >= b.y1 || b.y0 >= a.y1) return [];
      return [[s, f]];
    }));
}

/** Draw order for everything standing on the floor. Items are boxes, not points: a 2×3 bed has
 *  tiles that must draw over a chair and tiles that must draw under it, so the order comes from
 *  `painterOrder` over the whole footprint rather than from a per-item key. */
export class DepthIndex {
  private nodes = new Map<string, { box: DepthBox; view: Container }>();
  private dirty = false;

  set(id: string, box: DepthBox, view: Container): void {
    this.nodes.set(id, { box, view });
    this.dirty = true;
  }

  delete(id: string): void {
    if (this.nodes.delete(id)) this.dirty = true;
  }

  /** Cheap to call every frame: it returns immediately unless something moved. */
  flush(): void {
    if (!this.dirty) return;
    this.dirty = false;
    const nodes = [...this.nodes.values()];
    const boxes = nodes.map((n) => n.box);
    const order = painterOrder(boxes, seatEdges(boxes));
    for (const [depth, i] of order.entries()) {
      const node = nodes[i];
      if (node) node.view.zIndex = depth;
    }
  }
}
