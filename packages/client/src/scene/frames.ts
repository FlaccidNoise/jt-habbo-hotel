/** The slice of generator bundle metadata the client renders with (see @grand/generator). */
export interface FurniMeta {
  sheet: string;
  frameW: number;
  frameH: number;
  dirs: number[];
  anchorsX: number[];
  anchorY: number;
  /** #227: present only on seating items. Same frame geometry as `sheet`. */
  nearSheet?: string;
}

export interface FrameSpec {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Add to the origin tile's screen point to place the frame's top-left corner. */
  offsetX: number;
  offsetY: number;
}

/** Pure sheet geometry: which frame shows `dir`, and where its anchor sits. */
export function frameFor(meta: FurniMeta, dir: number): FrameSpec | null {
  const i = meta.dirs.indexOf(dir);
  if (i < 0) return null;
  return {
    x: i * meta.frameW,
    y: 0,
    w: meta.frameW,
    h: meta.frameH,
    offsetX: -(meta.anchorsX[i] ?? 0),
    offsetY: -meta.anchorY,
  };
}
