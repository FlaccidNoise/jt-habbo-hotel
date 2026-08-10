# Handoff: Avatar faces, customization & creation flow — The Grand (jt-habbo-hotel)

## Overview
Replaces the procedural #311 face stamps with hand-authored per-direction face pixel art shipped
as figuredata SETS, adds the eye-white palette decision, and replaces the nine-flat-button
wardrobe with a real create-your-look flow + wardrobe panel with live baked previews.

## About the Design Files
Files in this bundle are **design references created in HTML** — prototypes showing intended look
and behavior, not production code to copy. The task is to recreate them inside the existing
codebase: TypeScript, pixi.js client, the artgen pipeline (rig.py + figurepass.ts), and the
figuredata registry. `baker.js` in this bundle is a browser port of the client's own
FigureBaker resolve — use it only to READ the intended output; the client already has the real one.

## Fidelity
**High-fidelity.** The face pixel maps in `faces.js` are the actual authored art — port them
verbatim (coordinates + shade codes). The creator UI is pixel-specified below using the client's
existing palette from `packages/client/index.html`.

---

## Part 1 — Face pixel art (replaces the #311 stamps)

### Palette: dedicated `paper` ramp
- Add to `packages/generator/src/style.ts`: `ramp("paper", 0xa4a29a)` →
  shades [0x39382f, 0x6a6964, 0xa4a29a, 0xd5d3c8, 0xfefcf0] (outline/left/right/top/hi).
- `hi` = 0xfefcf0 is the eye white; `top` = 0xd5d3c8 is teeth.
- Brightest channel of base is 164 → hi ≤ 254: extend the "no skin shade clamps a channel" gate
  to cover it. Bump STYLE_VERSION 2→3 (v1→v2 precedent: 0 pixel hashes moved). `make gen` after.
- paper is NEVER offered by figuredata as a wearable colour — only face art indexes it.
  Document all of this in docs/design/ART-DIRECTION.md (palette section).

### Mechanism: faces are hd SETS (Habbo's own model)
- hd stays ONE mesh forever (decision log 2026-08-05). Every face set shares the identical skull
  render; only the authored feature map differs. Hats stay non-combinatorial.
- New hd sets append after id 16, each `slots: 2`: slot 0 = skin (family "skin"),
  slot 1 = iris. Iris is a curated list: charcoal, walnut, oak, teal, fern, navy.
  This needs per-slot families in figuredata (today a set has one family) — smallest change:
  optional `slotFamilies?: readonly ("material"|"skin"|"iris")[]`.
- Whites/teeth index `paper` directly in the authored map (a fixed ramp reference, not a slot).
- A shipped face is a CURATED combo of axes (eyes+brows+mouth+extras), not free mix-and-match.
- Facial hair = `fa` sets (renders after hr — fine for chins), material family (hair colours).

### Curated launch face sets (hd, ids 17–24) — combos from faces.js axes
| id | name | eyes | brows | mouth | extra |
|---|---|---|---|---|---|
| 17 | Bright  | bright | neutral | smile   | — |
| 18 | Calm    | calm   | neutral | neutral | — |
| 19 | Spark   | lashes | arched  | smile   | blush |
| 20 | Wink    | wink   | arched  | smirk   | — |
| 21 | Sunny   | happy  | neutral | grin    | — |
| 22 | Stern   | calm   | heavy   | neutral | — |
| 23 | Worry   | bright | worried | frown   | — |
| 24 | Freckle | bright | neutral | smile   | freckles |

Facial hair (fa): 25 Stubble, 26 Moustache, 27 Full Beard.

### Registration (the FaceAnchor machinery is the reusable part of #311)
Authored coordinates in faces.js are absolute sheet coords for the STAND frame; in the pipeline
they become FaceAnchor-relative offsets, translated per (frame, dir) by rig.py's projection.
Measured registration, stand dir 3 (skull bbox x22–41, y21–45):
- brow row y31 · lid y33 · eye rows y34–35 · nose y36 · mouth y39 · chin y42
- The eye block sits 2 rows HIGHER than the old stamp (y37) — most of why the old face read low.
Views: d3 front (symmetric about x31.5), d2 three-quarter (face on screen right),
d1 profile (front edge right, eye at x38–39). Dirs 4/5 = mirror x' = 63 - x (shading-safe, B4).
Shade codes (resolved through worn ramps at composite, sheets stay indexed):
K = skin outline · S = skin left · W = paper hi · T = paper top · U = iris outline ·
I = iris left · B = brow/beard ramp outline · b = beard fill (left) · R = crimson right (blush) ·
F = skin outline dot (freckle/stubble).

### Head cleanup (one intentional re-freeze of hd2)
Strip from hd2: the old 4-px stamps AND the brow/nose prim interior boundary lines below y43
(keep the y44 neck row). Rule used in the design: interior shade-0 pixels (no transparent
neighbour within 1px) below y43 → repaint with the modal neighbouring shade; stray hi pixels
(y34–42, <2 hi neighbours) likewise. Pixels are identity — this is the sanctioned repaint path.

### gateFace evolution (keep the invariants, add these)
- every authored pixel lands on the skull prim (unchanged);
- front dirs 2/3/4: ≥1 W and ≥1 U pixel; back dirs 0/6/7: zero; profiles 1/5: exactly one eye;
- feature-bounds: whole block inside the skull's lower half (protects hat space);
- tonal fallback must never be needed: gate fails if a face set names a ramp the palette lacks.

## Part 2 — Hair expansion (hair is where heads get identity)
New hr meshes in rig.py FIGURE_PARTS (each ~75s/layer to render, 8 dirs free):
bob, ponytail, curls, slick-back, buzz, bun, fringe, afro, braids, mohawk.
Silhouette rule: each must differ in SILHOUETTE, not palette (near-duplicate gate feeds on this).
Hair colour = 1 material slot. Bellhop-cap hides rule already covers them.

## Part 3 — Character creation + wardrobe (see Character Creator.dc.html)

### Flow
Full-screen step after register, before first room join; the SAME panel reopens in-room replacing
renderWardrobe's button strip ("Enter The Grand" becomes "Wear it"). Client bakes previews at
runtime via FigureBaker — no new server surface beyond set_figure it already has.

### Layout (1440×900 reference, client palette)
- bg #11131a · cards #1c1f2b, border 1px #333a4d, radius 10px · text #eef, secondary #9aa3b8,
  hint #7d8496 · label blue #9fd0ff · gold #ffd76a · selected #24405c bg + #7fb2d9 border
  (the existing .worn treatment) · CTA green: #24422a bg, #7fd98a border · font 14px system-ui.
- Header: "The Grand" 18px/700 + "Create your look" 14px #9aa3b8.
- Left column 400px: preview card — floor-green stage (#6f9e4c, #5d8a3f band at top), avatar
  baked at 5–8× nearest, crop y8–110 of the 64×112 cell; under it: ⟲/⟳ turn buttons
  (8 dirs), dir readout (ui-monospace 12px), 🎲 Randomize (gold-family button: #2b2517/#6a5a2e);
  live figure string in ui-monospace 11px #7d8496, e.g.
  v1|hd-17-skin_3-charcoal.lg-7-navy.sh-9-charcoal.ch-5-crimson.hr-3-charcoal
- Tab rail 132px: Skin · Face · Hair · Top · Legs · Shoes · Hat. Buttons 13px/600, 9px 12px pad,
  radius 8; idle #1b2836/#3c5670/#dbe6f2, active = worn treatment.
- Content panel (scroll-y): per-tab groups, headed 11px/600 uppercase +.06em #9fd0ff.
  - Swatch rows: 40px chips, radius 8, ramp MID shade as fill; selected = #7fb2d9 border +
    0 0 0 3px #24405c glow. Skin chips from skin ramps; material chips all 12 ramps.
  - Set cards: baked thumbnail on #6f9e4c, label 12px #dbe6f2; idle #10121a/#333a4d,
    selected worn treatment. Crops: face [21,26,22,20]@6× · hair [14,16,36,30]@4× ·
    top [14,38,36,34]@4× · legs [16,60,32,40]@4× · shoes [16,84,32,22]@5× · hat [14,14,36,28]@4×.
  - Face tab: 8 face cards + iris swatches + facial-hair cards (wears hair colour).
  - Top tab: slot-1 trim swatch row appears only for 2-slot sets (ch6).
- Footer: reuse note 12px #7d8496 · "Not now" (#2c3346/#444c63) · "Enter The Grand →" (CTA green).

### State
{ dir, tab, skin, faceSetId, iris, beardSetId, hair, hairColor, top, topColors[2], legs,
legsColor, shoesColor, hat, hatColor } → serializeFigure on confirm; ownership stays the
server's call (error{code:"figure"} path unchanged). Bake cache keys on the resolved stack
(resolvedKey), as the client already does.

## Design tokens
Everything above; no values outside packages/client/index.html + style.ts ramps except the new
paper ramp.

## Assets
figure/ sheets + figures.json are copies of packages/client/public/figure/ (frozen bundles).
No new raster assets — all previews bake at runtime.

## Files in this bundle
- faces.js — THE authored face art (port to tools/artgen/facedata.ts or similar)
- baker.js — browser FigureBaker port + hd2 cleanup rule (patchHead) + paper ramp values
- Face Directions.dc.html · Character Creator.dc.html · Current Client HUD.dc.html — design refs
- CLAUDE-PROMPT.md — paste-ready kickoff prompt for the Claude Code session
- ASSET-LOOP.md — the looped asset-factory playbook + backlog manifest
