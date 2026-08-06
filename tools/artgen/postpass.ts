// Post-pass for tools/artgen/rig.py output (#202, docs/design/ART-DIRECTION.md).
// Per pixel: the mask render names the prim → its palette ramp; normalized luma from the lit
// render picks the shade (left/right/top/hi). Interior detail lines land on prim-group
// boundaries in the local ramp's outline shade, then the global silhouette outline. Assembles
// compose.ts-format sheets and runs the real stage-4 gates.
//
// Proof parts ("proof_*") render and gate only. Catalog parts must have a FurniDef in
// @grand/shared and additionally freeze to tools/artgen/frozen/ (<id>.png + <id>.json) —
// the committed bundle cli.ts merges into the catalog. Gate failure freezes nothing.
//
// VARIANTS below are colorways: extra catalog items assembled from a base part's existing
// frames with its ramps remapped, so they cost no Blender render (see the note there).
//
//   node --experimental-strip-types tools/artgen/postpass.ts <renderDir> [--freeze]
//   make art            — render every part, gate, freeze
//   make art PART=<id>  — re-render one part and its colorways

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { PROTOTYPE_CATALOG } from "../../packages/shared/src/furni.ts";
import type { FurniDef } from "../../packages/shared/src/protocol.ts";
import type { Canvas } from "../../packages/generator/src/raster.ts";
import { makeCanvas, putPixel, getPixel, blit } from "../../packages/generator/src/raster.ts";
import { rampByName, OUTLINE, STYLE_VERSION, GENERATOR_VERSION } from "../../packages/generator/src/style.ts";
import { runGates } from "../../packages/generator/src/gates.ts";
import type { Bundle } from "../../packages/generator/src/compose.ts";
import { encodePng } from "../../packages/generator/src/png.ts";

const H = 32, V = 16, ZU = 32;
const ALPHA_MIN = 128;
// Absolute linear-luma buckets → ramp shades. The rig lights white geometry with a lone 0.9
// sun over a black world, so faces sit at fixed levels: unlit/left ≈ .00-.15, right ≈ .54,
// flat top ≈ .70, sun-facing band ≈ .90. `hi` is that band: bevel strips and curve crests.
const THRESH_LEFT = 0.30, THRESH_RIGHT = 0.62, THRESH_TOP = 0.80;

/** sRGB byte → linear [0,1]. */
function toLinear(v: number): number {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

const renderDir = process.argv[2] ?? "/tmp/artgen";
const freeze = process.argv.includes("--freeze");
const frozenDir = new URL("./frozen/", import.meta.url).pathname;

interface Frame { dir: number; spanY: number; rgba: string; mask: string; near?: boolean[] }
interface PartMeta {
  w: number; l: number; ramp: string; maxZ: number; seatZ: number | null; frames: Frame[];
  prims: Array<{ ramp: string; group: number }>;
  src: unknown;
}

/** Colorways. rig.py renders white geometry lit by one sun and a flat index mask — neither pass
 *  sees a ramp, so a recolor reuses the base part's frames and costs no Blender time at all.
 *  The remap is keyed by ramp name rather than prim index, so it survives reordering the mesh.
 *  Each colorway still needs its own FurniDef, gets its own recipeHash, and runs the full gates.
 *
 *  Remap the whole palette, not just the dominant ramp. The gates check that a colorway is
 *  on-palette and readable, not that it is harmonious — divider_basic_plum first shipped as a
 *  plum body still wearing its walnut cap, which reads bright orange against purple. Single-ramp
 *  parts like cafe_chair are safe with one substitution; multi-ramp parts need every accent
 *  reconsidered against the new base. Look at the @3x preview before freezing. */
const VARIANTS: Record<string, { base: string; ramps: Record<string, string> }> = {
  cafe_chair_crimson:  { base: "cafe_chair",    ramps: { teal: "crimson" } },
  cafe_chair_navy:     { base: "cafe_chair",    ramps: { teal: "navy" } },
  casino_stool_fern:   { base: "casino_stool",  ramps: { crimson: "fern" } },
  divider_basic_plum:  { base: "divider_basic", ramps: { slate: "plum", walnut: "ivory" } },
};

function recolor(base: PartMeta, remap: Record<string, string>): PartMeta {
  const swap = (name: string): string => remap[name] ?? name;
  return {
    ...base,
    ramp: swap(base.ramp),
    prims: base.prims.map((p) => ({ ...p, ramp: swap(p.ramp) })),
  };
}
const meta = JSON.parse(readFileSync(join(renderDir, "meta.json"), "utf8")) as {
  res: number;
  parts: Record<string, PartMeta>;
};
const RES = meta.res;

/** Mask channels render at exactly {0, 187, 255} (linear {0, .5, 1} through sRGB). */
function maskDigit(v: number): number {
  return v < 94 ? 0 : v < 221 ? 1 : 2;
}

function outlineSilhouette(c: Canvas): void {
  const edge: Array<[number, number]> = [];
  for (let y = 0; y < c.h; y++) {
    for (let x = 0; x < c.w; x++) {
      if (getPixel(c, x, y).alpha === 0) continue;
      const open =
        x === 0 || y === 0 || x === c.w - 1 || y === c.h - 1 ||
        getPixel(c, x - 1, y).alpha === 0 || getPixel(c, x + 1, y).alpha === 0 ||
        getPixel(c, x, y - 1).alpha === 0 || getPixel(c, x, y + 1).alpha === 0;
      if (open) edge.push([x, y]);
    }
  }
  for (const [x, y] of edge) putPixel(c, x, y, OUTLINE);
}

function upscale(c: Canvas, k: number): Canvas {
  const out = makeCanvas(c.w * k, c.h * k);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const i = ((y / k | 0) * c.w + (x / k | 0)) * 4;
      const j = (y * out.w + x) * 4;
      out.px[j] = c.px[i] ?? 0; out.px[j + 1] = c.px[i + 1] ?? 0;
      out.px[j + 2] = c.px[i + 2] ?? 0; out.px[j + 3] = c.px[i + 3] ?? 0;
    }
  }
  return out;
}

/** Canonical JSON (sorted keys) of the authored mesh + style pins — the provenance hash. */
function provenanceHash(id: string, part: PartMeta): string {
  const sorted = (value: unknown): unknown => {
    if (value === null || typeof value !== "object") return value;
    if (Array.isArray(value)) return value.map(sorted);
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([k, v]) => [k, sorted(v)]),
    );
  };
  return createHash("sha256")
    .update(JSON.stringify(sorted({
      id, w: part.w, l: part.l, ramp: part.ramp, prims: part.prims, src: part.src,
      styleVersion: STYLE_VERSION, generatorVersion: GENERATOR_VERSION,
    })))
    .digest("hex");
}

if (freeze) mkdirSync(frozenDir, { recursive: true });
let failures = 0;

const work: Array<[string, PartMeta]> = Object.entries(meta.parts);
for (const [id, variant] of Object.entries(VARIANTS)) {
  const base = meta.parts[variant.base];
  if (!base) {
    console.error(`${id}: variant base "${variant.base}" is not in ${renderDir}/meta.json`);
    failures++;
    continue;
  }
  if (meta.parts[id]) {
    console.error(`${id}: a colorway cannot share an id with a rendered part — both would freeze`);
    failures++;
    continue;
  }
  work.push([id, recolor(base, variant.ramps)]);
}

for (const [id, part] of work) {
  const isProof = id.startsWith("proof_");
  const catalogDef = PROTOTYPE_CATALOG.find((d) => d.id === id);
  const heightPx = Math.ceil(part.maxZ * ZU);
  if (!isProof && !catalogDef) {
    // Both numbers come off the mesh, so hand them over rather than making the author derive
    // ceil(maxZ*32)/32 and read the seat surface out of the rig by eye.
    console.error(
      `${id}: no FurniDef in packages/shared/src/furni.ts. Add this, then re-run:\n` +
      `  { id: "${id}", name: "${id}", w: ${part.w}, l: ${part.l}, ` +
      `stackHeights: [${heightPx / ZU}], canWalk: false, canStackOn: false, ` +
      `seatHeight: ${part.seatZ}, color: 0x000000 },`,
    );
    failures++;
    continue;
  }
  const ramps = part.prims.map((p) => rampByName(p.ramp));
  const frameW = (part.w + part.l) * H;
  const frameH = (part.w + part.l) * V + heightPx;
  const raws = part.frames.map((f) => readFileSync(join(renderDir, f.rgba)));
  const masks = part.frames.map((f) => readFileSync(join(renderDir, f.mask)));

  const sheet = makeCanvas(frameW * part.frames.length, frameH);
  // #227: the same frames again, keeping only the prims that draw IN FRONT of a seated occupant.
  // A companion sheet rather than a new base sheet layout, so the base bytes and the pixelHash
  // that is the item's identity never move.
  const nearSheet = makeCanvas(frameW * part.frames.length, frameH);
  let hasNear = false;
  const anchorsX: number[] = [];
  for (let q = 0; q < part.frames.length; q++) {
    const { spanY } = part.frames[q]!;
    anchorsX.push(spanY * H);
    const frame = makeCanvas(frameW, frameH);
    const nearOf = part.frames[q]!.near ?? [];
    const groupAt = new Int32Array(frameW * frameH).fill(-1);
    const rampAt = new Int32Array(frameW * frameH).fill(-1);
    const raw = raws[q]!;
    const mask = masks[q]!;
    // rig.py projection: footprint (fx,fy,z) -> render px (RES/2 + (fx-fy)*32, RES/2 + 16 +
    // (fx+fy-1)*16 - z*32); compose frame anchor is (spanY*32, 16 + heightPx). Inverse map:
    for (let fy = 0; fy < frameH; fy++) {
      const ry = fy + RES / 2 - heightPx;
      if (ry < 0 || ry >= RES) continue;
      for (let fx = 0; fx < frameW; fx++) {
        const rx = fx + RES / 2 - spanY * H;
        if (rx < 0 || rx >= RES) continue;
        const i = (ry * RES + rx) * 4;
        if ((raw[i + 3] ?? 0) < ALPHA_MIN) continue;
        const n = maskDigit(mask[i] ?? 0) + 3 * maskDigit(mask[i + 1] ?? 0) + 9 * maskDigit(mask[i + 2] ?? 0);
        // lit-pass AA can cover a pixel the maskless pass misses — fall back to prim 0
        const prim = n > 0 && n <= part.prims.length ? n - 1 : 0;
        const ramp = ramps[prim]!;
        const t = 0.299 * toLinear(raw[i] ?? 0) + 0.587 * toLinear(raw[i + 1] ?? 0)
          + 0.114 * toLinear(raw[i + 2] ?? 0);
        const shade = t < THRESH_LEFT ? ramp.left : t < THRESH_RIGHT ? ramp.right
          : t < THRESH_TOP ? ramp.top : ramp.hi;
        putPixel(frame, fx, fy, shade);
        groupAt[fy * frameW + fx] = part.prims[prim]!.group;
        rampAt[fy * frameW + fx] = prim;
      }
    }
    // interior detail lines: 1px in the local ramp's darkest shade along prim-group boundaries
    for (let fy = 0; fy < frameH; fy++) {
      for (let fx = 0; fx < frameW; fx++) {
        const g = groupAt[fy * frameW + fx]!;
        if (g < 0) continue;
        const right = fx + 1 < frameW ? groupAt[fy * frameW + fx + 1]! : -1;
        const down = fy + 1 < frameH ? groupAt[(fy + 1) * frameW + fx]! : -1;
        if ((right >= 0 && right !== g) || (down >= 0 && down !== g)) {
          putPixel(frame, fx, fy, ramps[rampAt[fy * frameW + fx]!]!.outline);
        }
      }
    }
    outlineSilhouette(frame);
    blit(sheet, frame, q * frameW, 0);

    if (nearOf.some(Boolean)) {
      // Cut from the FINISHED frame, so the near half carries the same outlines and detail lines
      // the base does — re-rendering it separately would give it its own silhouette.
      const nearFrame = makeCanvas(frameW, frameH);
      for (let fy = 0; fy < frameH; fy++) {
        for (let fx = 0; fx < frameW; fx++) {
          const prim = rampAt[fy * frameW + fx]!;
          if (prim < 0 || !nearOf[prim]) continue;
          const px = getPixel(frame, fx, fy);
          if (px.alpha === 0) continue;
          putPixel(nearFrame, fx, fy, px.color);
        }
      }
      blit(nearSheet, nearFrame, q * frameW, 0);
      hasNear = true;
    }
  }

  const def: FurniDef = catalogDef ?? {
    id, name: id, w: part.w, l: part.l, stackHeights: [heightPx / ZU],
    canWalk: false, canStackOn: false, seatHeight: part.seatZ, color: 0,
  };
  const recipeHash = provenanceHash(id, part);
  const bundle: Bundle = {
    sheet,
    meta: {
      defId: id, archetype: isProof ? "proof" : "artgen", sheet: `${id}.png`, frameW, frameH,
      dirs: part.frames.map((f) => f.dir), anchorsX, anchorY: V + heightPx,
      footprint: { w: part.w, l: part.l },
      // `occlusion` stays null: that is the in-sheet row-1 split the procedural composer emits,
      // and the Blender path has never had one (#235). A 3D-assisted seat splits through the
      // companion near-sheet below instead, which the client sorts on the same `seat_front` layer.
      drawnHeight: heightPx / ZU, seatZ: part.seatZ, occlusion: null,
      ...(hasNear
        ? { nearSheet: `${id}.near.png`,
            nearHash: createHash("sha256").update(nearSheet.px).digest("hex") }
        : {}),
      styleVersion: STYLE_VERSION,
      generatorVersion: GENERATOR_VERSION,
      partLibraryHash: `artgen:${recipeHash.slice(0, 16)}`, recipeHash,
      pixelHash: createHash("sha256").update(sheet.px).digest("hex"),
    },
  };
  const result = runGates(bundle, def);
  const png = encodePng(sheet.w, sheet.h, sheet.px);
  writeFileSync(join(renderDir, `${id}.png`), png);
  const nearPng = hasNear ? encodePng(nearSheet.w, nearSheet.h, nearSheet.px) : null;
  if (nearPng) writeFileSync(join(renderDir, `${id}.near.png`), nearPng);
  const big = upscale(sheet, 3);
  writeFileSync(join(renderDir, `${id}@3x.png`), encodePng(big.w, big.h, big.px));
  if (!result.ok) {
    failures++;
    console.error(`${id}: FAIL ${result.gate} gate: ${result.detail}`);
    continue;
  }
  console.log(`${id}: PASS all gates  (${frameW}x${frameH} frames)`);
  if (freeze && !isProof) {
    writeFileSync(join(frozenDir, `${id}.png`), png);
    if (nearPng) writeFileSync(join(frozenDir, `${id}.near.png`), nearPng);
    writeFileSync(join(frozenDir, `${id}.json`), JSON.stringify(bundle.meta, null, 2));
    console.log(`${id}: frozen`);
  }
}

process.exit(failures === 0 ? 0 : 1);
