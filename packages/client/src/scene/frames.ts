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
  /** #430: how many state frames the sheet carries per dir, as rows down from row 0. Absent means
   *  one — every item whose states are a light being switched on rather than a part of it moving.
   *  Everything else the sheet carries is placed after them, so the two never collide. */
  states?: number;
  /** Per dir, the half of the sprite that draws in front of a seated occupant. Null throughout
   *  when the sheet is a single row, which is every item you cannot sit on.
   *
   *  This is the procedural composer's encoding: row 1 of the same sheet, with a measured box.
   *  A 3D-assisted part carries `nearSheet` instead — same split, different container. */
  occlusion?: Array<Occluder | null> | null;
  /** #227: present only on 3D-assisted seating, where the split ships as a companion sheet so
   *  the base bytes and the `pixelHash` that identifies the item never move. Same frame geometry
   *  as `sheet`, so `frameFor` places it. It carries no box of its own — the Blender path never
   *  measured one (#235) — so the client falls back to the item's own footprint. */
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

/** Pure sheet geometry: which frame shows `dir` in `state`, and where its anchor sits. A state the
 *  sheet does not carry falls back to row 0 rather than reading past the last row — an item whose
 *  states are a glow the client paints has one row and every state of it looks the same. */
export function frameFor(meta: FurniMeta, dir: number, state = 0): FrameSpec | null {
  const i = meta.dirs.indexOf(dir);
  if (i < 0) return null;
  const row = state >= 0 && state < (meta.states ?? 1) ? state : 0;
  return {
    x: i * meta.frameW,
    y: row * meta.frameH,
    w: meta.frameW,
    h: meta.frameH,
    offsetX: -(meta.anchorsX[i] ?? 0),
    offsetY: -meta.anchorY,
  };
}

/** The row after the last state row: the half of `dir`'s frame that draws in front of a seated
 *  occupant, with the box to sort it by. Null when nothing does — a stool with no back, a chair
 *  seen from behind, anything you cannot sit on. Same anchor as row 0, so the two halves line up
 *  pixel for pixel. Nothing carries both a seat and authored states today, but the row is derived
 *  rather than fixed at 1, so a sheet that grows state rows moves this one with them (#430). */
export function occluderFor(meta: FurniMeta, dir: number): { frame: FrameSpec; box: Occluder } | null {
  const i = meta.dirs.indexOf(dir);
  const box = i < 0 ? null : meta.occlusion?.[i];
  const frame = frameFor(meta, dir);
  if (!box || !frame) return null;
  return { frame: { ...frame, y: (meta.states ?? 1) * meta.frameH }, box };
}
