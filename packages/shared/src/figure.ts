import type { FigureSet, LayerType } from "./figuredata.ts";
import {
  BODY_SET_ID, FIGUREDATA_VERSION, FIGURE_SETS, LAYER_ORDER, paletteFor, setById,
} from "./figuredata.ts";

// Figure string grammar (#127, PIPELINES §3):
//
//   v1|hd-2-skin_3.hr-3-charcoal.ch-6-crimson-ivory.lg-7-navy
//
// Parts joined by ".", fields by "-". The version prefix is the FIGUREDATA_VERSION the string was
// authored against — carried in the string itself because it is stored, broadcast, and copied
// between systems, so it has to be self-describing. Colours are ramp NAMES, matching #229's rule
// that remaps are keyed by name so they survive mesh edits. How many colours a part carries is
// declared by its set, never by the string.

export class FigureError extends Error {}

export interface WornPart {
  type: LayerType;
  set: number;
  colors: string[];
}

export interface Figure {
  version: number;
  parts: WornPart[];
}

/** One entry of the drawn stack, in LAYER_ORDER. */
export interface Layer {
  type: LayerType;
  set: number;
  colors: string[];
}

const ORDER_INDEX = new Map(LAYER_ORDER.map((t, i) => [t, i]));

function isLayerType(s: string): s is LayerType {
  return ORDER_INDEX.has(s as LayerType);
}

export type SetLookup = (id: number) => FigureSet | undefined;

/** `lookup` is injectable so the retirement and unknown-set branches can be exercised against a
 *  staged registry — otherwise they would ship untested until the first garment is withdrawn. */
export function parseFigure(input: string, lookup: SetLookup = setById): Figure {
  const bar = input.indexOf("|");
  if (bar === -1) throw new FigureError("no version prefix");
  const version = input.slice(0, bar);
  if (!/^v\d+$/.test(version)) throw new FigureError(`malformed version prefix: ${version}`);
  const v = Number(version.slice(1));
  if (v < 1 || v > FIGUREDATA_VERSION) throw new FigureError(`unknown figuredata version: ${v}`);

  const body = input.slice(bar + 1);
  if (body === "") throw new FigureError("no parts");

  const parts: WornPart[] = [];
  const seen = new Set<LayerType>();
  for (const chunk of body.split(".")) {
    const fields = chunk.split("-");
    const [type, rawSet, ...colors] = fields;
    if (type === undefined || rawSet === undefined) throw new FigureError(`malformed part: ${chunk}`);
    if (!isLayerType(type)) throw new FigureError(`unknown type: ${type}`);
    if (type === "bd") throw new FigureError("bd is implicit and cannot be worn explicitly");
    if (seen.has(type)) throw new FigureError(`duplicate type: ${type}`);
    seen.add(type);

    if (!/^\d+$/.test(rawSet)) throw new FigureError(`malformed set id: ${rawSet}`);
    const set = lookup(Number(rawSet));
    if (!set) throw new FigureError(`unknown set: ${rawSet}`);
    if (set.type !== type) throw new FigureError(`set ${set.id} is ${set.type}, not ${type}`);
    if (set.retired) throw new FigureError(`set ${set.id} is retired`);
    if (colors.length !== set.slots) {
      throw new FigureError(`set ${set.id} takes ${set.slots} colour(s), got ${colors.length}`);
    }
    colors.forEach((c, i) => {
      const family = set.slotFamilies?.[i] ?? set.family;
      if (!paletteFor(family).includes(c)) {
        throw new FigureError(`set ${set.id} cannot wear ramp ${c}`);
      }
    });
    parts.push({ type, set: set.id, colors });
  }

  // A figure with no head has no skin ramp, so the implicit body has nothing to inherit.
  if (!seen.has("hd")) throw new FigureError("hd is required");

  parts.sort((a, b) => (ORDER_INDEX.get(a.type) ?? 0) - (ORDER_INDEX.get(b.type) ?? 0));
  return { version: v, parts };
}

export function serializeFigure(f: Figure): string {
  const parts = [...f.parts].sort(
    (a, b) => (ORDER_INDEX.get(a.type) ?? 0) - (ORDER_INDEX.get(b.type) ?? 0),
  );
  return `v${f.version}|${parts.map((p) => [p.type, p.set, ...p.colors].join("-")).join(".")}`;
}

/** The stack to draw, in order: worn parts minus anything a worn set hides, with the implicit
 *  body prepended wearing `hd`'s skin ramp. */
export function resolveLayers(f: Figure, lookup: SetLookup = setById): Layer[] {
  const hidden = new Set<LayerType>();
  for (const p of f.parts) {
    const set = lookup(p.set);
    if (set) for (const t of set.hides) hidden.add(t);
  }
  const head = f.parts.find((p) => p.type === "hd");
  const skin = head?.colors[0];
  if (skin === undefined) throw new FigureError("hd is required");

  const body: Layer = { type: "bd", set: BODY_SET_ID, colors: [skin] };
  const worn = f.parts.filter((p) => !hidden.has(p.type)).map((p) => ({ ...p }));
  return [body, ...worn].sort(
    (a, b) => (ORDER_INDEX.get(a.type) ?? 0) - (ORDER_INDEX.get(b.type) ?? 0),
  );
}

/** Two figures that resolve to the same stack render to the same pixels, so the client's bake
 *  cache keys on this rather than on the raw string — a hat that hides hair must not produce two
 *  textures depending on which hair is underneath. */
export function resolvedKey(f: Figure, lookup: SetLookup = setById): string {
  return resolveLayers(f, lookup).map((l) => [l.type, l.set, ...l.colors].join("-")).join(".");
}

/** Structural check on the registry itself. `hides` may only name types EARLIER in LAYER_ORDER —
 *  outward hiding is the only coherent direction, because a layer drawn later is drawn on top
 *  and never needs to remove one that is already beneath it. `bd` and `hd` are the body and can
 *  never be hidden. Runs as a test, so a bad set cannot ship. */
export function checkHideDirection(sets: readonly FigureSet[] = FIGURE_SETS): string[] {
  const errors: string[] = [];
  for (const set of sets) {
    const own = ORDER_INDEX.get(set.type) ?? 0;
    for (const t of set.hides) {
      const target = ORDER_INDEX.get(t) ?? 0;
      if (t === "bd" || t === "hd") errors.push(`set ${set.id} hides ${t}, which is the body`);
      else if (target >= own) errors.push(`set ${set.id} (${set.type}) hides ${t}, drawn later`);
    }
  }
  return errors;
}
