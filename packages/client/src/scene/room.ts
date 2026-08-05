import { Container, Graphics } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import { screenToTile, tileHeight, worldToScreen } from "@grand/shared";
import type { RoomModel, Tile } from "@grand/shared";
import { tileDepth } from "./sort.ts";

export const SCALE = 64;

const LONG_PRESS_MS = 500;
const LONG_PRESS_SLOP = 10;

const FLOOR_A = 0x6f9e4c;
const FLOOR_B = 0x5d8a3f;
const DOOR = 0xa33b3b;
const SIDE_LEFT = 0x3f6029;
const SIDE_RIGHT = 0x4d7434;

export interface TileHandlers {
  click(x: number, y: number, button: number): void;
  hover(tile: Tile | null): void;
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
  private handlers: TileHandlers;
  private background: (e: FederatedPointerEvent) => void;
  private touchMove: (e: FederatedPointerEvent) => void;
  private touchEnd: () => void;
  private touch: { x: number; y: number; sx: number; sy: number; timer: ReturnType<typeof setTimeout> } | null = null;

  constructor(stage: Container, model: RoomModel, handlers: TileHandlers) {
    this.model = model;
    this.stage = stage;
    this.handlers = handlers;
    this.world = new Container();
    this.world.sortableChildren = true;
    stage.addChild(this.world);

    this.marker = new Graphics();
    this.marker.eventMode = "none";
    this.marker.zIndex = -1;   // above every tile in the floor band, below every sprite
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

  center(width: number, height: number): void {
    this.world.x = Math.round(width / 2 - (this.model.width - this.model.height) * (SCALE / 4));
    this.world.y = Math.round(height / 2 - (this.model.width + this.model.height - 2) * (SCALE / 8));
  }

  /** Placement preview at the height the item would rest at: green when the shared
   *  `checkPlacement` says yes, red when it says no. */
  highlight(tiles: Tile[], ok: boolean, z: number): void {
    this.marker.clear();
    for (const t of tiles) {
      this.marker.poly(diamond(t.x, t.y, z)).fill({ color: ok ? 0x3fd94f : 0xd93f3f, alpha: 0.45 });
    }
  }

  clearHighlight(): void {
    this.marker.clear();
  }

  destroy(): void {
    this.cancelTouch();
    this.stage.off("pointerdown", this.background);
    this.stage.off("pointermove", this.touchMove);
    this.stage.off("pointerup", this.touchEnd);
    this.stage.off("pointerupoutside", this.touchEnd);
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
    tile
      .poly(diamond(x, y, h))
      .fill(isDoor ? DOOR : (x + y) % 2 === 0 ? FLOOR_A : FLOOR_B)
      .stroke({ width: 1, color: 0x000000, alpha: 0.2 });
    tile.eventMode = "static";
    tile.cursor = "pointer";
    tile.zIndex = tileDepth(x, y);
    tile.on("pointerdown", (e) => {
      if (e.pointerType === "touch") this.beginTouch(x, y, e);
      else handlers.click(x, y, e.button);
    });
    tile.on("pointerup", (e) => {
      if (e.pointerType === "touch") this.endTouch(x, y);
    });
    tile.on("pointerover", () => handlers.hover({ x, y }));
    tile.on("pointerout", () => handlers.hover(null));
    this.world.addChild(tile);

    const sides = this.sides(x, y, h);
    if (sides) {
      sides.eventMode = "none";
      sides.zIndex = tile.zIndex;
      this.world.addChild(sides);
    }
  }

  /** Vertical faces where a tile overhangs its south and east neighbours, so raised platforms
   *  read as raised. Null when the tile is flush with both. */
  private sides(x: number, y: number, h: number): Graphics | null {
    const south = Math.max(0, tileHeight(this.model, x, y + 1));
    const east = Math.max(0, tileHeight(this.model, x + 1, y));
    if (south >= h && east >= h) return null;

    const g = new Graphics();
    const face = (ax: number, ay: number, bx: number, by: number, bottom: number, color: number): void => {
      const at = worldToScreen(ax, ay, h, SCALE);
      const bt = worldToScreen(bx, by, h, SCALE);
      const ab = worldToScreen(ax, ay, bottom, SCALE);
      const bb = worldToScreen(bx, by, bottom, SCALE);
      g.poly([at.sx, at.sy, bt.sx, bt.sy, bb.sx, bb.sy, ab.sx, ab.sy]).fill(color);
    };
    if (south < h) face(x - 0.5, y + 0.5, x + 0.5, y + 0.5, south, SIDE_LEFT);
    if (east < h) face(x + 0.5, y + 0.5, x + 0.5, y - 0.5, east, SIDE_RIGHT);
    return g;
  }
}
