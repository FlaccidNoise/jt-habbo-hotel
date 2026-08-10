import { Texture } from "pixi.js";
import { resolveLayers, resolvedKey } from "@grand/shared";
import type { Figure, Layer } from "@grand/shared";

// Avatar figure rendering (#127). The frozen layer sheets are INDEXED, not RGB: each pixel
// carries a colour slot in red and a shade index in green, because colour is per player and a
// sheet per colour would put the combinatorics back into colour space. Compositing an outfit and
// resolving those indices through the worn ramps are the same pass, so recolouring is free.
//
// Baking is lazy per (frame, dir). A whole outfit is 8x8 cells = 458k px, so 20 distinct outfits
// in a room would be ~37 MB of GPU texture; one cell is 28 KB and an avatar standing still needs
// exactly one.

export interface FigureLayerMeta {
  partId: string;
  setId: number;
  type: string;
  sheet: string;
  frameW: number;
  frameH: number;
  frames: string[];
  anchorX: number;
  anchorY: number[];
  slots: number;
  fixedColors?: string[];
}

export interface FigureAtlas {
  /** `crown[row]` is how far the bare figure's head reaches above the anchor in that frame —
   *  computed from the rendered pixels, so sitting does not need a separate guess. */
  canvas: { w: number; h: number; height: number; frames: string[]; crown: number[] };
  /** ramp name -> [outline, left, right, top, hi]. Shipped with the bundle so a frozen sheet can
   *  never be repainted by a later style edit, and so the client needs no generator import. */
  palette: Record<string, number[]>;
  layers: Map<number, FigureLayerMeta>;   // set id -> meta
  pixels: Map<number, Uint8ClampedArray>; // set id -> the whole indexed sheet, RGBA
}

/** Which sheet row a posture/animation frame lives on. An unknown frame falls back to row 0 —
 *  a figure that stands still is wrong, a figure that vanishes is worse. */
export function frameRow(frames: readonly string[], frame: string): number {
  const i = frames.indexOf(frame);
  return i < 0 ? 0 : i;
}

/** Top-left corner of one (frame, dir) cell in a layer sheet. Sheets are 8 dirs across and one
 *  row per frame, so this is the whole sheet layout. */
export function cellOrigin(
  meta: Pick<FigureLayerMeta, "frameW" | "frameH">,
  frames: readonly string[],
  frame: string,
  dir: number,
): { x: number; y: number } {
  return { x: dir * meta.frameW, y: frameRow(frames, frame) * meta.frameH };
}

/** Which ramp paints a sheet pixel carrying this colour slot: the worn colour at that slot if the
 *  outfit reaches it, else a fixed ramp the part declares past its own slot count (an inked line
 *  or eye white that never changes with the outfit), else the base colour. */
export function resolveRamp(
  layer: Pick<Layer, "colors">,
  meta: Pick<FigureLayerMeta, "slots" | "fixedColors">,
  slot: number,
): string | undefined {
  return layer.colors[slot] ?? meta.fixedColors?.[slot - meta.slots] ?? layer.colors[0];
}

function readSheet(image: HTMLImageElement | ImageBitmap): Uint8ClampedArray {
  const w = image.width, h = image.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("no 2d context for figure sheet");
  ctx.drawImage(image as CanvasImageSource, 0, 0);
  return ctx.getImageData(0, 0, w, h).data;
}

/** Null when the figure bundles are missing. The caller draws a loud missing-asset marker rather
 *  than a plausible-looking placeholder — a silent fallback hides a broken deploy. */
export async function loadFigureAtlas(): Promise<FigureAtlas | null> {
  try {
    const res = await fetch("/figure/figures.json");
    if (!res.ok) throw new Error(`figures.json: HTTP ${res.status}`);
    const doc = (await res.json()) as {
      canvas: FigureAtlas["canvas"];
      palette: Record<string, number[]>;
      layers: FigureLayerMeta[];
    };
    const layers = new Map<number, FigureLayerMeta>();
    const pixels = new Map<number, Uint8ClampedArray>();
    for (const meta of doc.layers) {
      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`figure sheet ${meta.sheet} failed to load`));
        img.src = `/figure/${meta.sheet}`;
      });
      layers.set(meta.setId, meta);
      pixels.set(meta.setId, readSheet(image));
    }
    return { canvas: doc.canvas, palette: doc.palette, layers, pixels };
  } catch (e) {
    console.error("figure sprites unavailable:", e);
    return null;
  }
}

/** One baked (outfit, frame, dir) cell. Keyed by the RESOLVED stack, so a hat that hides hair
 *  yields one texture no matter which hair is underneath. The cell holds the canvas the bake drew
 *  on: the room wants a Texture, the wardrobe panel draws the same pixels into the DOM, and one
 *  cache serves both. The Texture is made on first use so DOM-only previews never allocate one. */
export class FigureBaker {
  private cache = new Map<string, { canvas: HTMLCanvasElement; texture?: Texture }>();

  constructor(private atlas: FigureAtlas) {}

  /** The mid shade of a ramp, for UI that has to match a garment. */
  rampColor(ramp: string): number | undefined {
    return this.atlas.palette[ramp]?.[2];
  }

  /** How far this frame's head reaches above the avatar's world position point. */
  crown(frame: string): number {
    const row = frameRow(this.atlas.canvas.frames, frame);
    return this.atlas.canvas.crown[row] ?? this.atlas.canvas.height;
  }

  /** Screen offset from the avatar's world position point to the cell's top-left corner. */
  anchor(frame: string): { x: number; y: number } {
    const row = frameRow(this.atlas.canvas.frames, frame);
    const any = this.atlas.layers.values().next().value;
    return { x: -(any?.anchorX ?? 32), y: -(any?.anchorY[row] ?? 0) };
  }

  texture(figure: Figure, frame: string, dir: number): Texture | null {
    const cell = this.cell(figure, frame, dir);
    if (!cell) return null;
    if (!cell.texture) {
      cell.texture = Texture.from(cell.canvas);
      cell.texture.source.scaleMode = "nearest";   // pixel art: never smooth
    }
    return cell.texture;
  }

  /** The same baked cell as a canvas, for previews the DOM draws rather than pixi. */
  canvas(figure: Figure, frame: string, dir: number): HTMLCanvasElement | null {
    return this.cell(figure, frame, dir)?.canvas ?? null;
  }

  destroy(): void {
    for (const cell of this.cache.values()) cell.texture?.destroy(true);
    this.cache.clear();
  }

  private cell(
    figure: Figure, frame: string, dir: number,
  ): { canvas: HTMLCanvasElement; texture?: Texture } | null {
    const key = `${resolvedKey(figure)}|${frame}|${dir}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const canvas = this.bake(resolveLayers(figure), frame, dir);
    if (!canvas) return null;
    const cell = { canvas };
    this.cache.set(key, cell);
    return cell;
  }

  private bake(layers: Layer[], frame: string, dir: number): HTMLCanvasElement | null {
    const { w, h } = this.atlas.canvas;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const out = ctx.createImageData(w, h);

    let drew = false;
    for (const layer of layers) {
      const meta = this.atlas.layers.get(layer.set);
      const sheet = this.atlas.pixels.get(layer.set);
      if (!meta || !sheet) continue;   // a set with no authored mesh simply does not draw
      const sheetW = meta.frameW * 8;
      const { x: ox, y: oy } = cellOrigin(meta, this.atlas.canvas.frames, frame, dir);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const s = ((oy + y) * sheetW + ox + x) * 4;
          if ((sheet[s + 3] ?? 0) < 128) continue;
          const slot: number = sheet[s] ?? 0;
          const shade: number = sheet[s + 1] ?? 0;
          const ramp = resolveRamp(layer, meta, slot);
          if (ramp === undefined) continue;
          const color = this.atlas.palette[ramp]?.[shade];
          if (color === undefined) continue;
          const d = (y * w + x) * 4;
          out.data[d] = (color >> 16) & 0xff;
          out.data[d + 1] = (color >> 8) & 0xff;
          out.data[d + 2] = color & 0xff;
          out.data[d + 3] = 255;
          drew = true;
        }
      }
    }
    if (!drew) return null;
    ctx.putImageData(out, 0, 0);
    return canvas;
  }
}
