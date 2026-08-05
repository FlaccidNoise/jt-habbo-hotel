/** The box, in the dir's own footprint units, that a sprite's in-front-of-the-sitter half covers. */
export interface Occluder {
  x0: number; y0: number; z0: number;
  x1: number; y1: number; z1: number;
}

/** The slice of generator bundle metadata the client renders with (see @grand/generator). */
export interface FurniMeta {
  sheet: string;
  frameW: number;
  frameH: number;
  dirs: number[];
  anchorsX: number[];
  anchorY: number;
  /** Per dir, the half of the sprite that draws in front of a seated occupant. Null throughout
   *  when the sheet is a single row, which is every item you cannot sit on. */
  occlusion?: Array<Occluder | null> | null;
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

/** Row 1: the half of `dir`'s frame that draws in front of a seated occupant, with the box to
 *  sort it by. Null when nothing does — a stool with no back, a chair seen from behind, anything
 *  you cannot sit on. Same anchor as row 0, so the two halves line up pixel for pixel. */
export function occluderFor(meta: FurniMeta, dir: number): { frame: FrameSpec; box: Occluder } | null {
  const i = meta.dirs.indexOf(dir);
  const box = i < 0 ? null : meta.occlusion?.[i];
  const frame = frameFor(meta, dir);
  if (!box || !frame) return null;
  return { frame: { ...frame, y: meta.frameH }, box };
}
