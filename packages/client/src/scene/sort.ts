import type { Container } from "pixi.js";
import { painterOrder } from "@grand/shared";
import type { DepthBox } from "@grand/shared";

const TILE_BAND = -1e6;

/** Same-space tie-break: a rug draws under an avatar, an avatar under a table on its tile. */
export const LAYER = { floor_furni: 0, avatar: 1, furni: 2 } as const;

/** Floor tiles are flat, static, and never interleave with each other, so they keep a band of
 *  their own below every sprite instead of joining the painter sort each frame. */
export function tileDepth(x: number, y: number): number {
  return TILE_BAND + (x + y);
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
    const order = painterOrder(nodes.map((n) => n.box));
    for (const [depth, i] of order.entries()) {
      const node = nodes[i];
      if (node) node.view.zIndex = depth;
    }
  }
}
