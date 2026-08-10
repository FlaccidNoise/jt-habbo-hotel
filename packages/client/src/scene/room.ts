import { Container, Graphics } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import { WALL_TOP_PX, screenToTile, tileHeight, worldToScreen } from "@grand/shared";
import type { RoomModel, Tile } from "@grand/shared";
import type { DecorAsset, FloorDecor } from "./decor.ts";
import { LAYER, tileDepth } from "./sort.ts";
import type { DepthIndex } from "./sort.ts";

export const SCALE = 64;
/** View magnification, 1 or 2 and nothing between: sprites are nearest-sampled, so a fractional
 *  scale gives some rows of a sheet two screen pixels and their neighbours one. 1 shows four times
 *  the floor, 2 is the chunky Habbo read. Mutable, because the player switches it at runtime —
 *  every importer reads the live binding, so nobody caches a copy. */
export let ZOOM: 1 | 2 = 1;

/** Namespaced alongside the client's other browser-stored keys (`grand-token`). */
const ZOOM_KEY = "grand-zoom";

export function setZoom(n: number): void {
  ZOOM = n === 2 ? 2 : 1;
  globalThis.localStorage?.setItem(ZOOM_KEY, String(ZOOM));
}

/** The player's stored choice. Anything unreadable — never set, or garbage — is 1. */
export function loadZoom(): void {
  setZoom(Number(globalThis.localStorage?.getItem(ZOOM_KEY)));
}

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

/** The half-open tile rectangle the camera can currently see. Every layer that draws one object
 *  per tile culls against this same rectangle, so the floor and the walls never disagree about
 *  what is on screen. */
export interface TileWindow {
  x0: number; y0: number; x1: number; y1: number;
}

/** The lowest and highest walkable tiles. The low end is what `tileDepth` keys off — everything in
 *  the room stands at or above it, so a tile there can never rise into anything's sprite. The high
 *  end is how far up-screen a tile can be pushed by its own lift, which is what the visible window
 *  has to reach past to find every tile that can appear in it. */
function heightRange(m: RoomModel): { low: number; high: number } {
  let low = Infinity;
  let high = 0;
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      const h = tileHeight(m, x, y);
      if (h < 0) continue;
      if (h < low) low = h;
      if (h > high) high = h;
    }
  }
  return { low: low === Infinity ? 0 : low, high };
}

/** Tiles of slack around the visible rect. Covers the half-tile each diamond reaches past its own
 *  point, the slab lip below the floor, and the rounding in the camera — cheap insurance against a
 *  tile popping in at the edge of the screen. */
const CULL_MARGIN = 4;

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
  private ceiling: number;
  private tiles = new Map<string, Graphics>();
  /** The overhang faces under a raised tile, kept beside it so culling can take both away. */
  private skirts = new Map<string, Graphics>();
  /** Viewport in screen px, once the camera has been given one. Null means "draw the whole room",
   *  which is what a scene built without a camera — every unit test — gets. */
  private view: { width: number; height: number } | null = null;
  /** The tile rectangle currently built, so a camera that has not crossed a tile boundary since
   *  the last frame costs one comparison. */
  private window: TileWindow | null = null;
  /** Told whenever the window changes, so the wall layer culls against the same rectangle. */
  onWindow: ((window: TileWindow) => void) | null = null;
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
    /** The viewport, when the caller already has one. Omitting it builds the whole floor, which is
     *  what a scene with no camera — every unit test — wants; the client passes the screen it is
     *  about to draw on, because building 90,000 tiles only to cull them on the next line is
     *  slower than never building them. */
    view: { width: number; height: number } | null = null,
  ) {
    this.model = model;
    this.stage = stage;
    this.handlers = handlers;
    this.depth = depth;
    this.decor = decor;
    const range = heightRange(model);
    this.floor = range.low;
    this.ceiling = range.high;
    this.view = view;
    this.world = new Container();
    this.world.sortableChildren = true;
    this.world.scale.set(ZOOM);
    stage.addChild(this.world);

    this.marker = new Graphics();
    this.marker.eventMode = "none";
    this.marker.zIndex = -1;   // above every tile in the floor band; `highlight` sorts it properly
    this.world.addChild(this.marker);

    // Centring first is what makes the initial build the right one: the window is read off the
    // camera, so reconciling before the camera is placed would build a screenful at the origin
    // and immediately throw it away.
    if (view) this.center(view.width, view.height);
    else this.reconcile();

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
    this.view = { width, height };
    this.world.x = Math.round(width / 2 - ZOOM * (this.model.width - this.model.height) * (SCALE / 4));
    this.world.y = Math.round(height / 2 - ZOOM * (this.model.width + this.model.height - 2) * (SCALE / 8));
    this.reconcile();
  }

  /** Take up the current ZOOM. The culling window is read off the scale, so the new magnification
   *  has to go back through the re-centre the resize handler uses: setting the scale alone would
   *  leave the floor built to the old window — at 1 that is a quarter of the tiles the screen now
   *  reaches. A scene with no camera has no window to re-derive, so it only reconciles. */
  applyZoom(): void {
    this.world.scale.set(ZOOM);
    if (this.view) this.center(this.view.width, this.view.height);
    else this.reconcile();
  }

  /** The window the floor is built to, for the layers that cull alongside it. */
  get visible(): TileWindow {
    return this.window ?? { x0: 0, y0: 0, x1: this.model.width, y1: this.model.height };
  }

  /** The tiles that can appear in the viewport right now, or the whole room when no camera has
   *  been set.
   *
   *  Inverting the projection is what makes this a rectangle rather than a search. A tile's screen
   *  point is ((x−y)·h, (x+y−2z)·v), so the visible band of screen columns fixes x−y and the band
   *  of rows fixes x+y — one interval each, and the tile rectangle is the box those two diagonals
   *  bound. Lift only ever moves a tile UP the screen, so the row band has to reach 2·ceiling
   *  further down in x+y to catch a platform whose surface has climbed into view. */
  private visibleWindow(): TileWindow {
    const m = this.model;
    const whole = { x0: 0, y0: 0, x1: m.width, y1: m.height };
    if (!this.view) return whole;
    const h = SCALE / 2, v = SCALE / 4;
    // The viewport in the world's own pixels.
    const wx0 = -this.world.x / ZOOM, wx1 = (this.view.width - this.world.x) / ZOOM;
    const wy0 = -this.world.y / ZOOM, wy1 = (this.view.height - this.world.y) / ZOOM;
    const uMin = wx0 / h, uMax = wx1 / h;                       // x − y
    const sMin = wy0 / v, sMax = wy1 / v + 2 * this.ceiling;    // x + y
    const clampX = (n: number): number => Math.max(0, Math.min(m.width, n));
    const clampY = (n: number): number => Math.max(0, Math.min(m.height, n));
    return {
      x0: clampX(Math.floor((uMin + sMin) / 2) - CULL_MARGIN),
      y0: clampY(Math.floor((sMin - uMax) / 2) - CULL_MARGIN),
      x1: clampX(Math.ceil((uMax + sMax) / 2) + CULL_MARGIN),
      y1: clampY(Math.ceil((sMax - uMin) / 2) + CULL_MARGIN),
    };
  }

  /** Bring the built tiles in line with the window. A room that fits on screen builds once and
   *  never runs the body again; a big one pays only for the rows the camera crossed.
   *
   *  Culling is what keeps a 300×300 room affordable at all: a tile is a Graphics with four
   *  listeners, and a raised one is two more nodes in the painter sort, so building the whole
   *  floor would be six figures of both (#359). Off-screen tiles are dropped rather than hidden —
   *  a hidden tile still costs its slot in the sort and in every hit test. */
  private reconcile(): void {
    const next = this.visibleWindow();
    const now = this.window;
    if (now && now.x0 === next.x0 && now.y0 === next.y0 && now.x1 === next.x1 && now.y1 === next.y1) {
      return;
    }
    this.window = next;
    for (const key of [...this.tiles.keys()]) {
      const at = key.indexOf(",");
      const x = Number(key.slice(0, at)), y = Number(key.slice(at + 1));
      if (x < next.x0 || x >= next.x1 || y < next.y0 || y >= next.y1) this.dropTile(key);
    }
    for (let y = next.y0; y < next.y1; y++) {
      for (let x = next.x0; x < next.x1; x++) {
        if (this.tiles.has(`${x},${y}`)) continue;
        const h = tileHeight(this.model, x, y);
        if (h < 0) continue;
        this.addTile(x, y, h, this.handlers);
      }
    }
    this.onWindow?.(next);
  }

  private dropTile(key: string): void {
    this.tiles.get(key)?.destroy();
    this.skirts.get(key)?.destroy();
    this.tiles.delete(key);
    this.skirts.delete(key);
    this.depth.delete(`tile:${key}`);
    this.depth.delete(`tile:${key}:sides`);
  }

  /** The camera. A room that fits the viewport sits centred and never moves — the Habbo read.
   *  One that overflows follows `target` (the player's own view position, world px) on the
   *  overflowing axis, clamped so the room edge never pulls inside the viewport. */
  follow(target: { sx: number; sy: number } | null, width: number, height: number): void {
    this.view = { width, height };
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
    this.reconcile();
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
      this.skirts.set(`${x},${y}`, sides);
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
