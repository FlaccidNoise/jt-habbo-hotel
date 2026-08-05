// Post-pass for tools/artgen/rig.py output (#202, docs/design/ART-DIRECTION.md).
// Reads per-direction raw RGBA renders, quantizes luminance to the part's style.ts ramp
// (left/right/top shades), assembles the 4-direction sheet in compose.ts frame geometry,
// applies the global silhouette outline, and runs the real stage-4 gates.
//
//   node --experimental-strip-types tools/artgen/postpass.ts <renderDir> <outDir>

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { FurniDef } from "../../packages/shared/src/protocol.ts";
import type { Canvas } from "../../packages/generator/src/raster.ts";
import { makeCanvas, putPixel, getPixel, blit } from "../../packages/generator/src/raster.ts";
import { rampByName, OUTLINE, luminance } from "../../packages/generator/src/style.ts";
import { runGates } from "../../packages/generator/src/gates.ts";
import type { Bundle } from "../../packages/generator/src/compose.ts";
import { encodePng } from "../../packages/generator/src/png.ts";

const H = 32, V = 16, ZU = 32;
const ALPHA_MIN = 128;
const THRESH_LEFT = 0.34, THRESH_RIGHT = 0.72;   // normalized-luma buckets -> ramp shades

const renderDir = process.argv[2] ?? "/tmp/artgen";
const outDir = process.argv[3] ?? renderDir;
mkdirSync(outDir, { recursive: true });

interface Frame { dir: number; spanY: number; rgba: string }
interface PartMeta { w: number; l: number; ramp: string; maxZ: number; frames: Frame[] }
const meta = JSON.parse(readFileSync(join(renderDir, "meta.json"), "utf8")) as {
  res: number;
  parts: Record<string, PartMeta>;
};
const RES = meta.res;

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

let failures = 0;

for (const [id, part] of Object.entries(meta.parts)) {
  const ramp = rampByName(part.ramp);
  const heightPx = Math.ceil(part.maxZ * ZU);
  const frameW = (part.w + part.l) * H;
  const frameH = (part.w + part.l) * V + heightPx;
  const raws = part.frames.map((f) => readFileSync(join(renderDir, f.rgba)));

  // luma range across all four renders, so shading quantizes consistently per part
  let lo = Infinity, hi = -Infinity;
  for (const raw of raws) {
    for (let i = 0; i < raw.length; i += 4) {
      if ((raw[i + 3] ?? 0) < ALPHA_MIN) continue;
      const lum = 0.299 * (raw[i] ?? 0) + 0.587 * (raw[i + 1] ?? 0) + 0.114 * (raw[i + 2] ?? 0);
      if (lum < lo) lo = lum;
      if (lum > hi) hi = lum;
    }
  }
  const range = Math.max(1, hi - lo);

  const sheet = makeCanvas(frameW * part.frames.length, frameH);
  const anchorsX: number[] = [];
  for (let q = 0; q < part.frames.length; q++) {
    const { spanY } = part.frames[q]!;
    anchorsX.push(spanY * H);
    const frame = makeCanvas(frameW, frameH);
    const raw = raws[q]!;
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
        const lum = 0.299 * (raw[i] ?? 0) + 0.587 * (raw[i + 1] ?? 0) + 0.114 * (raw[i + 2] ?? 0);
        const t = (lum - lo) / range;
        putPixel(frame, fx, fy, t < THRESH_LEFT ? ramp.left : t < THRESH_RIGHT ? ramp.right : ramp.top);
      }
    }
    outlineSilhouette(frame);
    blit(sheet, frame, q * frameW, 0);
  }

  const def: FurniDef = {
    id, name: id, w: part.w, l: part.l, stackHeights: [part.maxZ],
    canWalk: false, canSit: false, canStackOn: false, color: 0,
  };
  const bundle: Bundle = {
    sheet,
    meta: {
      defId: id, archetype: "proof", sheet: `${id}.png`, frameW, frameH,
      dirs: part.frames.map((f) => f.dir), anchorsX, anchorY: V + heightPx,
      footprint: { w: part.w, l: part.l }, stackHeights: [part.maxZ],
      drawnHeight: heightPx / ZU, occlusion: [], styleVersion: 0, generatorVersion: 0,
      partLibraryHash: "artgen-proof", recipeHash: id,
      pixelHash: createHash("sha256").update(sheet.px).digest("hex"),
    },
  };
  const result = runGates(bundle, def);
  if (result.ok) {
    // silhouette-mean detail for the report (gates only assert the threshold)
    let sum = 0, n = 0;
    for (let y = 0; y < sheet.h; y++) {
      for (let x = 0; x < sheet.w; x++) {
        const p = getPixel(sheet, x, y);
        if (p.alpha !== 0 && p.color === OUTLINE) { sum += luminance(p.color); n++; }
      }
    }
    console.log(`${id}: PASS all gates  (${frameW}x${frameH} frames, outline luma ${(sum / n).toFixed(0)})`);
  } else {
    failures++;
    console.error(`${id}: FAIL ${result.gate} gate: ${result.detail}`);
  }
  writeFileSync(join(outDir, `${id}.png`), encodePng(sheet.w, sheet.h, sheet.px));
  const big = upscale(sheet, 3);
  writeFileSync(join(outDir, `${id}@3x.png`), encodePng(big.w, big.h, big.px));
}

process.exit(failures === 0 ? 0 : 1);
