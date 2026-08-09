import { Container, Graphics } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import { WALL_TOP_PX, screenToTile, tileHeight, worldToScreen } from "@grand/shared";
import type { RoomModel, Tile } from "@grand/shared";
import type { DecorAsset, FloorDecor } from "./decor.ts";
import { LAYER, tileDepth } from "./sort.ts";
import type { DepthIndex } from "./sort.ts";

export const SCALE = 64;
/** View magnification. Sprites are authored at 64 and shown at 128 — the chunky read is the
 *  style, so this is nearest-sampled, never smoothed. */
export const ZOOM = 2;

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

const FLOOR_A = 0x6f9e4c;
const FLOOR_B = 0x5d8a3f;
const DOOR = 0xa33b3b;
const SIDE_LEFT = 0x3f6029;
const SIDE_RIGHT = 0x4d7434;
/** Grout between the default checker's tiles. A floor decor draws its own seams into the tile, so
 *  this comes off — a fixed grid over a parquet weave would cut it into squares. */
const SEAM = { width: 1, color: 0x000000, alpha: 0.2 } as const;

export interface TileHandlers {
  click(x: number, y: number, button: number): void;
  hover(tile: Tile | null): void;
}

/** The lowest walkable tile. Everything in the room stands at or above it, so a tile at this
 *  height can never rise into anything's sprite — see `tileDepth`. */
function floorHeight(m: RoomModel): number {
  let low = Infinity;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const h = tileHeight(m, x, y);
      if (h >= 0 && h < low) low = h;
    }
  }
  return low === Infinity ? 0 : low;
}

/** Screen-space corners of the tile diamond at (x, y) whose floor sits at height z. */
export function diamond(x: number, y: number, z: number): number[] {
  const corners = [
    worldToScreen(x - 0.5, y - 0.5, z, SCALE),
    worldToScreen(x + 0.5, y - 0.5, z, SCALE),
    worldToScreen(x + 0.5, y + 0.5, z, SCALE),
    worldToScreen(x - 0.5, y + 0.5, z, SCALE),
  ];
  return corners.flatMap((c) => [c.sx, c.sy]);
}

/** The floor, and the camera that holds every sprite drawn on it. Floor tiles are the only
 *  interactive objects in the scene: a click resolves through Pixi's hit test on the diamond,
 *  which stays correct over raised tiles where `screenToTile` on raw pointer coordinates does
 *  not. `screenToTile` runs only for clicks that hit no tile at all. */
export class RoomScene {
  readonly world: Container;
  private model: RoomModel;
  private stage: Container;
  private marker: Graphics;
  private depth: DepthIndex;
  private floor: number;
  private tiles = new Map<string, Graphics>();
  private handlers: TileHandlers;
  private decor: DecorAsset<FloorDecor> | null;
  private background: (e: FederatedPointerEvent) => void;
  private touchMove: (e: FederatedPointerEvent) => void;
  private touchEnd: () => void;
  private touch: { x: number; y: number; sx: number; sy: number; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(
    stage: Container,
    model: RoomModel,
    handlers: TileHandlers,
    depth: DepthIndex,
    decor: DecorAsset<FloorDecor> | null = null,
  ) {
    this.model = model;
    this.stage = stage;
    this.handlers = handlers;
    this.depth = depth;
    this.decor = decor;
    this.floor = floorHeight(model);
    this.world = new Container();
    this.world.sortableChildren = true;
    this.world.scale.set(ZOOM);
    stage.addChild(this.world);

    this.marker = new Graphics();
    this.marker.eventMode = "none";
    this.marker.zIndex = -1;   // above every tile in the floor band; `highlight` sorts it properly
    this.world.addChild(this.marker);

    for (let y = 0; y < model.height; y++) {
      for (let x = 0; x < model.width; x++) {
        const h = tileHeight(model, x, y);
        if (h < 0) continue;
        this.addTile(x, y, h, handlers);
      }
    }

    this.background = (e) => {
      if (e.target !== stage) return;
      const p = this.world.toLocal(e.global);
      const t = screenToTile(p.x, p.y, SCALE);
      handlers.click(t.x, t.y, e.button);
    };
    stage.on("pointerdown", this.background);

    // A drifting finger is a scroll attempt, not a press; lifting off-tile abandons the tap.
    this.touchMove = (e) => {
      if (this.touch && Math.hypot(e.global.x - this.touch.sx, e.global.y - this.touch.sy) > LONG_PRESS_SLOP) {
        this.cancelTouch();
      }
    };
    this.touchEnd = () => this.cancelTouch();
    stage.on("pointermove", this.touchMove);
    stage.on("pointerup", this.touchEnd);
    stage.on("pointerupoutside", this.touchEnd);
  }

  /** The floor diamond drawn for (x, y), or null where the heightmap has a void. */
  tileAt(x: number, y: number): Graphics | null {
    return this.tiles.get(`${x},${y}`) ?? null;
  }

  center(width: number, height: number): void {
    this.world.x = Math.round(width / 2 - ZOOM * (this.model.width - this.model.height) * (SCALE / 4));
    this.world.y = Math.round(height / 2 - ZOOM * (this.model.width + this.model.height - 2) * (SCALE / 8));
  }

  /** The camera. A room that fits the viewport sits centred and never moves — the Habbo read.
   *  One that overflows follows `target` (the player's own view position, world px) on the
   *  overflowing axis, clamped so the room edge never pulls inside the viewport. */
  follow(target: { sx: number; sy: number } | null, width: number, height: number): void {
    if (!target) return;
    const h = SCALE / 2, v = SCALE / 4;
    const m = this.model;
    // Floor extremes in world px, padded up for the walls and down for the slab lip.
    const minSx = -m.height * h, maxSx = m.width * h;
    const minSy = -v - WALL_TOP_PX - 8, maxSy = (m.width + m.height - 1) * v + 12;
    const clamp = (n: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, n));
    this.world.x = Math.round(
      ZOOM * (maxSx - minSx) <= width
        ? width / 2 - ZOOM * ((minSx + maxSx) / 2)
        : clamp(width / 2 - ZOOM * target.sx, width - ZOOM * maxSx, -ZOOM * minSx),
    );
    this.world.y = Math.round(
      ZOOM * (maxSy - minSy) <= height
        ? height / 2 - ZOOM * ((minSy + maxSy) / 2)
        : clamp(height / 2 - ZOOM * (target.sy - 40), height - ZOOM * maxSy, -ZOOM * minSy),
    );
  }

  /** Placement preview at the height the item would rest at: green when the shared
   *  `checkPlacement` says yes, red when it says no.
   *
   *  It joins the painter sort like anything else, or a raised platform would be drawn over the
   *  highlight lying on top of it. `checkPlacement` only accepts footprints of one height, so a
   *  single box covers every highlighted tile. */
  highlight(tiles: Tile[], ok: boolean, z: number): void {
    this.marker.clear();
    if (tiles.length === 0) return this.clearHighlight();
    for (const t of tiles) {
      this.marker.poly(diamond(t.x, t.y, z)).fill({ color: ok ? 0x3fd94f : 0xd93f3f, alpha: 0.45 });
    }
    const xs = tiles.map((t) => t.x);
    const ys = tiles.map((t) => t.y);
    this.depth.set(
      "marker",
      {
        x0: Math.min(...xs), y0: Math.min(...ys), z0: z,
        x1: Math.max(...xs) + 1, y1: Math.max(...ys) + 1, z1: z,
        layer: LAYER.marker,
      },
      this.marker,
    );
  }

  clearHighlight(): void {
    this.marker.clear();
    this.depth.delete("marker");
    this.marker.zIndex = -1;
  }

  destroy(): void {
    this.cancelTouch();
    this.stage.off("pointerdown", this.background);
    this.stage.off("pointermove", this.touchMove);
    this.stage.off("pointerup", this.touchEnd);
    this.stage.off("pointerupoutside", this.touchEnd);
    // Whatever this room put in the sort comes back out: the views are about to be destroyed, and
    // a stale node would have the next flush write to a dead Container.
    this.clearHighlight();
    for (const key of this.tiles.keys()) {
      this.depth.delete(`tile:${key}`);
      this.depth.delete(`tile:${key}:sides`);
    }
    this.world.destroy({ children: true });
  }

  /** Touch has no right button, so a press on a tile decides on release: a quick lift is the
   *  tap (left-click path), holding still for LONG_PRESS_MS opens the furni menu (right-click
   *  path) — the same rotate/pick-up actions a mouse gets. */
  private beginTouch(x: number, y: number, e: FederatedPointerEvent): void {
    this.cancelTouch();
    this.touch = {
      x,
      y,
      sx: e.global.x,
      sy: e.global.y,
      timer: setTimeout(() => {
        this.touch = null;
        this.handlers.click(x, y, 2);
      }, LONG_PRESS_MS),
    };
  }

  private endTouch(x: number, y: number): void {
    if (!this.touch || this.touch.x !== x || this.touch.y !== y) return;
    this.cancelTouch();
    this.handlers.click(x, y, 0);
  }

  private cancelTouch(): void {
    if (!this.touch) return;
    clearTimeout(this.touch.timer);
    this.touch = null;
  }

  private addTile(x: number, y: number, h: number, handlers: TileHandlers): void {
    const isDoor = x === this.model.door.x && y === this.model.door.y;
    const tile = new Graphics();
    // The decor tile is laid down once across the whole floor plane and each diamond cuts its own
    // window out of it (textureSpace "global"), so the pattern runs on unbroken between tiles and
    // a raised tile still lands on the same phase — its lift is a whole number of tile heights.
    // Hit-testing is untouched: the shape is still the polygon, only the paint changed.
    tile.poly(diamond(x, y, h));
    if (isDoor) tile.fill(DOOR).stroke(SEAM);
    else if (this.decor) tile.fill({ texture: this.decor.texture, textureSpace: "global" });
    else tile.fill((x + y) % 2 === 0 ? FLOOR_A : FLOOR_B).stroke(SEAM);
    tile.eventMode = "static";
    tile.cursor = "pointer";
    tile.on("pointerdown", (e) => {
      if (e.pointerType === "touch") this.beginTouch(x, y, e);
      else handlers.click(x, y, e.button);
    });
    tile.on("pointerup", (e) => {
      if (e.pointerType === "touch") this.endTouch(x, y);
    });
    tile.on("pointerover", () => handlers.hover({ x, y }));
    tile.on("pointerout", () => handlers.hover(null));

    this.tiles.set(`${x},${y}`, tile);
    this.world.addChild(tile);

    const sides = this.sides(x, y, h);
    if (sides) {
      sides.eventMode = "none";
      this.world.addChild(sides);
    }

    if (h <= this.floor) {
      tile.zIndex = tileDepth(x, y);
      if (sides) sides.zIndex = tile.zIndex;
      return;
    }
    // Raised: the tile is a column reaching from the lowest point it is drawn to up to its
    // surface, and it sorts against furniture like anything else (#230). Its overhang faces are
    // the same solid, so they take the same box and land in the next slot — the two never overlap
    // on screen, so which of them comes first does not matter.
    const south = Math.max(0, tileHeight(this.model, x, y + 1));
    const east = Math.max(0, tileHeight(this.model, x + 1, y));
    const box = {
      x0: x, y0: y, z0: Math.min(h, south, east),
      x1: x + 1, y1: y + 1, z1: h,
      layer: LAYER.tile,
    };
    this.depth.set(`tile:${x},${y}`, box, tile);
    if (sides) this.depth.set(`tile:${x},${y}:sides`, box, sides);
  }

  /** Vertical faces where a tile overhangs its south and east neighbours, so raised platforms
   *  read as raised. A void neighbour gets a face too — the floor is a slab with thickness, not
   *  a painted sheet, so the room boundary shows a lip below the lowest floor. Null when the
   *  tile is flush with both neighbours. */
  private sides(x: number, y: number, h: number): Graphics | null {
    const SLAB = 0.25;
    const sRaw = tileHeight(this.model, x, y + 1);
    const eRaw = tileHeight(this.model, x + 1, y);
    const south = sRaw < 0 ? this.floor - SLAB : sRaw;
    const east = eRaw < 0 ? this.floor - SLAB : eRaw;
    if (south >= h && east >= h) return null;

    const g = new Graphics();
    const face = (ax: number, ay: number, bx: number, by: number, bottom: number, color: number): void => {
      const at = worldToScreen(ax, ay, h, SCALE);
      const bt = worldToScreen(bx, by, h, SCALE);
      const ab = worldToScreen(ax, ay, bottom, SCALE);
      const bb = worldToScreen(bx, by, bottom, SCALE);
      g.poly([at.sx, at.sy, bt.sx, bt.sy, bb.sx, bb.sy, ab.sx, ab.sy]).fill(color);
    };
    // Flat colours even under a decor floor: a riser is the ground plane turned on edge, and
    // shearing the tile pattern up it would read as a smear rather than as the same material.
    const left = this.decor?.def.sides.left ?? SIDE_LEFT;
    const right = this.decor?.def.sides.right ?? SIDE_RIGHT;
    if (south < h) face(x - 0.5, y + 0.5, x + 0.5, y + 0.5, south, left);
    if (east < h) face(x + 0.5, y + 0.5, x + 0.5, y - 0.5, east, right);
    return g;
  }
}
