// In-browser port of packages/client/src/scene/figure.ts FigureBaker resolve:
// sheets are indexed (R = colour slot, G = shade 0..4), resolved through worn ramps at bake time.
const SHEET_DIRS = 8;
export const CANVAS_W = 64, CANVAS_H = 112;

export async function loadAtlas(base = "figure/") {
  const doc = await (await fetch(base + "figures.json")).json();
  const sheets = new Map();
  for (const layer of doc.layers) {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i); i.onerror = rej;
      i.src = base + layer.sheet;
    });
    const c = document.createElement("canvas");
    c.width = img.width; c.height = img.height;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0);
    sheets.set(layer.partId, x.getImageData(0, 0, img.width, img.height));
    if (layer.partId === "hd2") patchHead(sheets.get(layer.partId), doc);
  }
  return { doc, sheets, byId: new Map(doc.layers.map((l) => [l.partId, l])) };
}

// Strip the #311 procedurally-stamped face + brow/nose prim boundary lines from hd2 so
// hand-authored faces can be laid on a clean skull. Interior dark (shade 0) pixels and isolated
// `hi` catchlights below the crown are repainted with the modal neighbouring shade. Pixels within
// 2px of the silhouette (ears, jaw) are kept.
function patchHead(im, doc) {
  const W = im.width;
  const frames = doc.canvas.frames.length;
  for (let row = 0; row < frames; row++) {
    for (let dir = 0; dir < SHEET_DIRS; dir++) {
      const ox = dir * CANVAS_W, oy = row * CANVAS_H;
      const a = (x, y) => im.data[((oy + y) * W + ox + x) * 4 + 3] >= 128;
      const shade = (x, y) => im.data[((oy + y) * W + ox + x) * 4 + 1];
      const nearEdge = (x, y) => {
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= CANVAS_W || ny >= CANVAS_H || !a(nx, ny)) return true;
        }
        return false;
      };
      const fixes = [];
      for (let y = 0; y < CANVAS_H - 1; y++) {
        for (let x = 0; x < CANVAS_W; x++) {
          if (!a(x, y) || nearEdge(x, y)) continue;
          const s = shade(x, y);
          const isLine = s === 0 && y < 43;
          let hiN = 0;
          if (s === 4) for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            if (a(x + dx, y + dy) && shade(x + dx, y + dy) === 4) hiN++;
          }
          const isStrayHi = s === 4 && y >= 34 && y < 43 && hiN < 2;
          if (!isLine && !isStrayHi) continue;
          const counts = [0, 0, 0, 0, 0];
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]) {
            if (!a(x + dx, y + dy)) continue;
            const ns = shade(x + dx, y + dy);
            if (ns !== 0 && !(ns === 4 && isStrayHi)) counts[ns]++;
          }
          let best = 2, n = -1;
          for (let i = 1; i < 5; i++) if (counts[i] > n) { n = counts[i]; best = i; }
          fixes.push([x, y, best]);
        }
      }
      for (const [x, y, s] of fixes) im.data[((oy + y) * W + ox + x) * 4 + 1] = s;
    }
  }
}

export function frameRow(doc, frame) {
  const i = doc.canvas.frames.indexOf(frame);
  return i < 0 ? 0 : i;
}

/** Bake a stack of layers into a 64x112 ImageData. layers: [{partId, colors: [rampName,...]}] */
export function bake(atlas, layers, frame, dir, into) {
  const { doc, sheets } = atlas;
  const out = into ?? new ImageData(CANVAS_W, CANVAS_H);
  const row = frameRow(doc, frame);
  for (const layer of layers) {
    const sheet = sheets.get(layer.partId);
    if (!sheet) continue;
    const ox = dir * CANVAS_W, oy = row * CANVAS_H;
    for (let y = 0; y < CANVAS_H; y++) {
      for (let x = 0; x < CANVAS_W; x++) {
        const s = ((oy + y) * sheet.width + ox + x) * 4;
        if (sheet.data[s + 3] < 128) continue;
        const slot = sheet.data[s], shade = sheet.data[s + 1];
        const ramp = layer.colors[slot] ?? layer.colors[0];
        const table = ramp === "paper" ? PAPER.paper : doc.palette[ramp];
        const color = table?.[shade];
        if (color === undefined) continue;
        const d = (y * CANVAS_W + x) * 4;
        out.data[d] = (color >> 16) & 0xff;
        out.data[d + 1] = (color >> 8) & 0xff;
        out.data[d + 2] = color & 0xff;
        out.data[d + 3] = 255;
      }
    }
  }
  return out;
}

/** Proposed `paper` ramp (style_version bump): base 0xa4a29a x the bible factors
 *  (outline .35, left .65, right 1.0, top 1.3, hi 1.55). `hi` is the eye white. */
export const PAPER = { paper: [0x39382f, 0x6a6964, 0xa4a29a, 0xd5d3c8, 0xfefcf0] };

/** Stamp authored face pixels onto a baked ImageData. pixels: [x, y, code] in dir-3 stand sheet
 *  coords (or the view's own dir). codes resolve through `inks`. mirror=true flips x' = 63 - x. */
export function stampFace(im, pixels, inks, mirror = false) {
  for (const [px, y, code] of pixels) {
    const x = mirror ? 63 - px : px;
    const color = inks[code];
    if (color === undefined) continue;
    const d = (y * CANVAS_W + x) * 4;
    if (im.data[d + 3] < 128) continue;   // only paint on the figure, like the stamp gate
    im.data[d] = (color >> 16) & 0xff;
    im.data[d + 1] = (color >> 8) & 0xff;
    im.data[d + 2] = color & 0xff;
  }
}

/** Ink table for a face rendered on `skin` (ramp name), pupils in `iris` (ramp name),
 *  brows/beard in `hairRamp`. mode "paper" uses the proposed white ramp; "tonal" stays inside
 *  today's palette (skin hi as the catch). */
export function faceInks(doc, { skin, iris, hairRamp, mode }) {
  const S = doc.palette[skin], I = doc.palette[iris] ?? doc.palette.charcoal;
  const B = doc.palette[hairRamp] ?? doc.palette.charcoal;
  const P = PAPER.paper;
  return {
    K: S[0],                          // line — the worn skin ramp's own outline shade
    S: S[1], D: S[1],                 // shadow — skin left
    H: S[4],                          // skin hi
    W: mode === "paper" ? P[4] : S[4],// eye white
    T: mode === "paper" ? P[3] : S[4],// teeth
    U: I[0],                          // pupil
    I: I[1],                          // iris
    B: B[0],                          // brow/beard line
    b: B[1],                          // beard fill
    R: doc.palette.crimson[2],        // blush
    F: S[0],                          // freckle (skin outline dot)
  };
}

/** Scale an ImageData up with nearest sampling onto a canvas, optional crop + background. */
export function toCanvas(im, scale, crop, bg) {
  const c1 = document.createElement("canvas");
  c1.width = im.width; c1.height = im.height;
  c1.getContext("2d").putImageData(im, 0, 0);
  const [cx, cy, cw, ch] = crop ?? [0, 0, im.width, im.height];
  const c2 = document.createElement("canvas");
  c2.width = cw * scale; c2.height = ch * scale;
  const x = c2.getContext("2d");
  if (bg) { x.fillStyle = bg; x.fillRect(0, 0, c2.width, c2.height); }
  x.imageSmoothingEnabled = false;
  x.drawImage(c1, cx, cy, cw, ch, 0, 0, cw * scale, ch * scale);
  return c2;
}
