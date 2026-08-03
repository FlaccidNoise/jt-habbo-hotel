import { Container, Graphics } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import { screenToTile, tileHeight, worldToScreen } from "@grand/shared";
import type { RoomModel, Tile } from "@grand/shared";
import { depthKey } from "./sort.ts";

export const SCALE = 64;

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
  private background: (e: FederatedPointerEvent) => void;

  constructor(stage: Container, model: RoomModel, handlers: TileHandlers) {
    this.model = model;
    this.stage = stage;
    this.world = new Container();
    this.world.sortableChildren = true;
    stage.addChild(this.world);

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
  }

  center(width: number, height: number): void {
    this.world.x = Math.round(width / 2 - (this.model.width - this.model.height) * (SCALE / 4));
    this.world.y = Math.round(height / 2 - (this.model.width + this.model.height - 2) * (SCALE / 8));
  }

  destroy(): void {
    this.stage.off("pointerdown", this.background);
    this.world.destroy({ children: true });
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
    tile.zIndex = depthKey({ kind: "tile", x, y, z: h });
    tile.on("pointerdown", (e) => handlers.click(x, y, e.button));
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
