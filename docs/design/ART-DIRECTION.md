# Art Direction — part authoring path and style bible

Companion to [PIPELINES.md](PIPELINES.md) §2. Decided 2026-08-04 (decision log). Owner: Josh.

## The problem this solves

The launch part library is ~2,300 sprites at Habbo visual quality (PIPELINES §2, audit A4) —
the project's largest line item, unstarted. The figure multiplies hand-drawn work by
4 directions × 2 scales per part. Hand-pixeling it is months of full-time art. Commissioning it
costs real money on a hobby project. Image-model generation cannot hold exact 2:1 dimetric,
palette compliance, or per-layer decomposition — cleanup would exceed authoring.

## Decision: 3D-assisted authoring

Author each part once as a low-poly mesh. Rendering directions becomes mechanical. Pixel quality
comes from an automated post-pass plus a hand-polish pass, enforced by the existing stage-4 gates.

Pipeline per part:

1. Model the part in Blender. Low-poly, flat materials keyed to palette ramp indices.
2. Render 4 directions through the shared rig: orthographic camera at the exact 2:1 dimetric
   angle, above-front key light (the B4 rule — mirroring stays shading-safe).
3. Post-pass script: quantize colors to the ramp shades, draw the outline, apply dither rules,
   snap to the pixel grid at 64.
4. Hand-polish at 64 where the silhouette or highlights read wrong. Track which parts needed it.
5. The stage-4 gates run unchanged: palette compliance, grid alignment, silhouette contrast,
   reference-scene draw order, seating occlusion.

Authored cost per part falls from 8 drawn sprites (4 directions × 2 scales) to one mesh plus
polish. The mesh is also the source for future animation frames and the 32 scale.

Determinism note: Blender output is not expected to be bit-identical across machines or GPU
drivers. That is safe because bundles freeze at publish (PIPELINES §2) — the render is an
authoring step, and the frozen pixels are the item's identity, never a re-render.

## Scale: 64 only in v1

Resolves deferred audit item C-45. The 32 pass was "near a second full pass" — deferring it
halves the line item. The renderer keeps the two-scale architecture and the recipe format keeps
both scale slots. When zoom-out demand appears, the 32 pass re-renders from the same meshes with
its own polish pass, not a from-scratch redraw.

## Style bible v1

A versioned artifact — `style_version` in every recipe pins it (PIPELINES §2). Values below are
the v1 pins, marked (tune) where authoring may move them.

- **Palette:** 12 material ramps + 6 skin ramps × 5 shades, in `packages/generator/src/style.ts`
  (`style_version` 2). Material ramps: walnut, oak, plum, fern, crimson, slate, sand, teal, gold,
  ivory, navy, charcoal. Skin ramps: `skin_1` … `skin_6`, added 2026-08-05 with the figure
  pipeline (#127) — the material ramps hold no skin tone, and `sand`-or-`ivory` is not a palette
  a hotel can ship. Skin is a separate family so figuredata can offer it for the head and nothing
  else. Shades per ramp are one base color × fixed light factors — outline 0.35, left 0.65,
  right 1.0, top 1.3, hi 1.55. `hi` is the sun-facing band: bevel strips and curve crests.
  Ramp-indexed color only — recolor is palette swap, never hue rotation.
- **Channel clamping:** a base bright enough that `top` or `hi` clamps a channel flattens the top
  of the ramp. **The skin family is gated against it** (`no skin shade clamps a channel`) because
  there a clamp drags the light band toward white, hue-shifting the tone and collapsing the deep
  end of the family into the light end. Four material ramps — walnut, crimson, sand, gold — do
  clamp their red channel; their pixels are frozen and cannot move, so the rule is scoped to skin
  rather than global. The older claim that "the palette test bounces it" was not true of the
  material ramps and is not made here.
- **Adding a ramp bumps `style_version`.** It is additive — no existing pixel changes — but a
  recipe naming `skin_3` while tagged `style_version 1` would fail to render under v1, so the
  version is load-bearing. Evidence from the v1→v2 bump: 22 bundles, **0 pixel hashes moved,
  5 recipe hashes moved** (the box-path recipes that embed the version; recipe hash is provenance
  per PIPELINES §2). Regenerate `catalog.json` with `make gen` after any ramp change.
- **Light:** above-front, vertically symmetric shading (audit B4).
- **Outline:** 1 px, the part ramp's darkest shade. Pure black reserved for ground-contact
  edges (tune).
- **Dither:** 2×2 checker only, never across an outline. Implemented in the post-pass
  (generator v2): the checker fires within 0.05 linear luma of a quantize threshold, only where
  the per-pixel luma slope says curve (0.004–0.03 — flat faces hold their level, and a thin
  cylinder crosses its whole band in a pixel or two, which reads as noise when checkered), and
  only on mask runs 10 px or wider — the measured form of the old "4×4 px or larger" rule.
  Under every prim-group seam the next pixel drops one shade: the crease that grounds a leg
  against an apron.
- **Proportions** (height units of 32 px at scale 64, all tune):

  | Archetype | Parameter | Value |
  |---|---|---|
  | chair, sofa | seat surface | 1.0 |
  | sofa | back top | 2.0 |
  | table, casino table | top surface | 1.5 |
  | bed | platform | 0.75 |
  | lamp | total height | 2.0–2.5 |
  | plant | total height | 0.5–2.5 |
  | divider | total height | 2.0 |
  | stereo | total height | 1.0–2.0 |

- **Per-slot pixel bounds** (min/max width and height at 64) live in each archetype spec.
  Slot variants must differ in silhouette, not only in palette — this feeds the near-duplicate
  gate. Colorways are the separate axis and may differ in palette alone (decided 2026-08-05):
  they are declared as a ramp remap of a base part, never as a second mesh, so they cannot drift
  from the silhouette they were cut from.
- **Avatar reference (pinned 2026-08-05, #127): standing figure 80 px on a 64 × 112 canvas,
  2.5 height units.** Supersedes "~100 px, ~3 height units". The shipped seats fixed it, not
  taste: `cafe_chair` has `seatZ 0.58` (18.6 px) and `bed_basic` 0.55, and a seated figure with a
  90° knee needs shin ≈ seat height. 18.6 px is 23 % of 80 px — stylised, short-legged, coherent.
  At 100 px it is 19 %, which puts the knees above the hips on every chair in the catalog.
  Cross-check: `cafe_chair drawnHeight 1.25` = 40 px for a ~0.87 m chair back makes one height
  unit ≈ 0.7 m, so an adult is 2.5 units. Segments sum exactly: head 22 + torso 21 + thigh 19 +
  shin 18 = 80.
- **Figure anchor is per frame**, not per bundle: the feet standing, the hip/seat contact sitting.
  One fixed anchor cannot serve both, because the client already lifts a sitter by the seat's `z`
  and seat heights range 0.55–0.82. Standing frames anchor at canvas y 102, leaving 21 px of hat
  room above the crown and 9 px under the toe — walk contact frames reach 7 px below the anchor
  bare and 9 shod, because the anchor is the tile-CENTRE ground point and a foot toward the camera
  is genuinely nearer, so it projects lower.
- **Figure mass is not gated; height is.** The first body was geometrically correct and read as a
  stick: a torso 13 wide but 7 deep went nearly edge-on at dirs 1 and 5 and vanished. Widened to
  15 × 10 with thicker limbs and a neck. This is the hand-polish pass this document already
  anticipated for silhouettes that read wrong at 64.
- **Figure sheets are indexed, not RGB.** A pixel stores (colour slot, shade index); the client
  resolves them through the worn ramps while compositing. Colour is per player, so a baked-colour
  sheet would need one render per ramp combination.

## Surface detail: trim by prim (#259, decided 2026-08-05)

Every prim carries its own `ramp`, so **a trim band is a thin prim, not a texture**. This is the
whole surface-detail mechanism on the furni path. `#259` opened asking whether a decal should be
a post-pass 2D mask or a second ramp on a prim sub-region; the answer is that neither is needed
for the case that matters. `proof_trim` in `rig.py` demonstrates three idioms and costs 8 prims:

- **Flush band** — split a box in two at the band, give the upper part the accent ramp. The
  silhouette does not move. The post-pass draws its interior detail line on the prim-group
  boundary, which reads as the band's own shadow.
- **Proud band** — the same, 2 footprint-px wider, so it breaks the silhouette and catches the
  sun band. Use where the trim should read as applied hardware rather than inlay.
- **Inlay** — a wider accent disc with the field disc standing proud inside it, leaving a ring.
  Do not make the two coplanar: separate objects sharing a plane z-fight.

Five constraints. The last three were each a failed first attempt in the pass that trimmed
`cafe_table`, `casino_table`, `divider_basic` and `bar_counter` — none was caught by a gate, and
all four passed every gate in the state that read wrong.

- **Keep `maxZ` fixed.** An artgen def transcribes `stackHeights` from the mesh and `gateFootprint`
  checks it in both directions, so trim that raises the top of a part breaks the def.
- **The budget is prim count, not render time.** `rig.py` caps a part at 26 prims. Trim costs one
  or two per band, so roughly 8–10 bands fit. A repeating pattern does not.
- **An accent needs contrast, not a different ramp name.** A flush band takes the same luma bucket
  as the face around it, so the two ramps must differ in the *base colour*. Gold (`0xdaa520`) on
  walnut (`0xb5651d`) is invisible — the trap `record_trophy` already records for its engraving
  plate. `casino_table`'s first gold apron band vanished exactly this way and went ivory.
  Where the accent must be gold on walnut, make it a **curved** prim: an `hcyl` crests into the
  `hi` band while the flat face beside it stays in `left`/`right`. That is why `bar_counter`'s
  brass rails read and its flush gold fascia did not.
- **Trim only pays on a face the camera can see.** `casino_table`'s apron is overhung 0.08 by the
  baize slab above it, so a band there is hidden from all four directions. Check the `@3x` preview,
  not the mesh. The band moved to the baize as a betting line and became the part's best feature.
- **Reconsider every colorway.** `VARIANTS` remaps by ramp *name* across all prims, so trim is
  remapped too and gets the multiplication for free — but an accent that collides with the new
  base disappears. `fountain_gilded` remaps `slate → gold`, so gold trim on `fountain` would sink
  into its own body. This is the `divider_basic_plum` lesson in `postpass.ts` applied to trim.

What this does **not** reach: marks that are not extrudable — a monogram, a crest, lettering — and
anything on a curved face. Those need raster, which is what the flat-decor class (#260) is for.

## Flat decor: raster backdrops (#260, built 2026-08-05)

Wallpapers and floor patterns are authored as plain rasters and quantized nearest-in-RGB, not
through the artgen luma buckets — a flat texture is already the colour it will be drawn in.
Mechanism, lattice rules and gates are in [PIPELINES.md](PIPELINES.md) §2a. What belongs here is
the style, and one finding that carries straight over from trim:

- **A backdrop has a luma floor, and it is derived, not chosen.** `BACKDROP_LUMA_MIN` is the
  lightest outline any ramp can paint (58.0, sand and gold) plus `MIN_CONTRAST`. Anything darker
  swallows the outline of whatever stands on it — and an avatar's outline is its *worn* ramp's,
  chosen by the player, so no decor can be designed against a known one. The two default floor
  greens clear it, which is what lets the furni contrast gate compare against one number.
- **The accent-contrast trap is worse in raster than in trim.** `floor_marble`'s first vein was a
  slightly-off-white over an ivory-top field and quantized straight back into the field —
  invisible, and nothing bounced it. The ivory ramp jumps 148.6 → 193 with nothing between, so
  "a shade off" is not a colour this palette has. Same lesson as gold-on-walnut, and the raster
  class is more exposed to it because a texture invites tonal detail that 12 five-step ramps
  cannot carry. Pick the neighbouring *shade*, or pick a different ramp.
- **The decor's own seams belong in the texture.** A floor decor drops the client's per-tile
  stroke, so `floor_marble` draws its grout and `floor_parquet` does not — a fixed grid over a
  parquet weave would cut the weave into squares.
- **Style so far.** `floor_marble` (ivory/slate chequer, grouted, one vein a slab),
  `floor_parquet` (sand/walnut basket weave, quarter-turned every slab), `floor_planks` (oak
  planks along the diamond edge, cross seams on the (x+2y) measure — its lattice period is 64,
  where the (2x+y) measure caps at 32 and read as brick paving), `wall_wainscot` (plaster over a
  walnut dado with a sand rail and a skirting), `wall_pinstripe` (gold pinstripe on charcoal,
  16 px repeat), `wall_logcabin` (one fat wall-length walnut log per 32 px course, marked only
  by its knots — 16 px courses with staggered end seams read as brickwork). The café takes the
  planks and log cabin (the lodge reference), the Casino Floor the marble and pinstripe. Two
  authoring rules from the pair: a log or plank is seamless along its run, and the darkest legal
  wood is oak `right` — luma 84.2 against `BACKDROP_LUMA_MIN` 82, so walnut `left` (76.2) is
  under the bound everywhere, not only in the wainscot groove that first proved it.

## Proof gate before build-out

Re-render the three shipped archetype families (chair, sofa, plant) through this path. All three
must pass every stage-4 gate and read as one style side by side in the reference room. Until
that passes, no library build-out — the pipeline is the risk, not the part count.

**Status 2026-08-05: gate passed, first build-out shipped.** `tools/artgen/rig.py` (Blender
headless, camera math locked to the generator projection) renders each part at 4 directions in
two passes: a lit pass, and a mask pass where every primitive emits a flat color encoding its
index. `tools/artgen/postpass.ts` reads both — the mask names the primitive and so its ramp, the
lit luma picks the shade — which is what makes multi-ramp parts work (the proof plant's pot is
sand while its foliage is fern). It then draws interior detail lines along primitive-group
boundaries, applies the global silhouette outline, assembles compose.ts-format sheets, and runs
the real stage-4 gates.

Lighting is a single 0.9 sun over a black world, so face brightness is absolute rather than
per-part relative, and the postpass quantizes on fixed linear-luma thresholds (0.30 / 0.62 /
0.80). Two parts lit the same way therefore quantize the same way — the reason the set reads as
one style rather than each part being separately normalized.

The three proof parts plus nine catalog parts pass every gate: casino table, casino stool, café
table, café chair, bed, lamp, shelf, divider, stereo. Frozen bundles live in
`tools/artgen/frozen/` (sheet PNG + metadata JSON) and the generator CLI merges them into the
published catalog, re-running the full gates on the committed bytes — pixels are the item's
identity, so they are read, never re-rendered.

Wall archetypes closed the epic (#203): wall art, poster, record trophy, wall shelf. A wall part
declares `"surface": "wall"` and is authored against the plane fy 0, extending into the room. It
costs *less* than a floor part, not more — dir 0 is the right wall and three quarter turns carry
the same mesh onto the left one as dir 6, so only two frames render. Two authoring rules the rig
asserts, both consequences of the projection folding depth into screen width:

- **Start at least your own depth along the wall** (`min fx >= max fy`), or the sprite renders
  before its segment begins.
- **Centre the bounds in the span** (`min fx + max fx == span`). Three quarter turns mirror about
  the tile centre, so an off-centre mesh hangs at a different offset on each wall and one
  declaration cannot describe both frames. Contents may sit anywhere inside; the bounds may not.

Remaining: hand-polish passes where a silhouette reads wrong at 64. No part has needed polish yet.

## Figure render cost, measured 2026-08-05

Do not extrapolate figure cost from the furni rate — it is ~5x per render, and an early estimate
in this document's history was wrong by that factor.

| Pass | Per render | Per part | Shape |
|---|---|---|---|
| Furni | 0.125 s | 1.0 s | 4 dirs × 2 passes = 8 renders |
| Figure | 0.584 s | **74.8 s** | 8 frames × 8 dirs × 2 passes = 128 renders |

A furni part builds its meshes once per direction and rotates. A figure dir-frame rebuilds the
whole scene every time — the holdout body plus the garment, with every limb three objects — so
scene construction dominates, not rendering. A 16-layer wardrobe is ~20 minutes unattended.

That still leaves an action cheap: poses are authored once and shared, so adding one costs a
re-render of every layer (minutes) rather than any drawing. It is sheet bytes and protocol surface
that make an action expensive, not art.

## Sizing after the cuts

Measured on the first build-out: 12 parts (3 proof + 9 catalog) render and gate in ~13 s total
on the dev box, unattended. Authoring the mesh is the whole cost; the 4 directions are free.

So are colorways (#229). The rig lights white geometry and emits a flat index mask, so neither
render pass ever sees a ramp — the recolor happens entirely in the post-pass. A colorway is
declared as `base part + ramp remap` in `postpass.ts` and reuses the base's frames, so it adds a
catalog item for no Blender time at all: the second build-out rendered 9 parts and published 13.
#210 leaned on this hardest — its two Luck Lever exclusives and all three collection-set rewards
are colorways, so five of the seven items it added cost no render at all. 28 frozen bundles now.
Ramp remaps are keyed by ramp name, not primitive index, so they survive editing the mesh.

11 archetypes × ~3 slots × 4 variants ≈ 130 meshes, each with post-pass and possible polish.
The 2,300-sprite figure was the hand-drawn cost. The mesh is the authored unit now. Variety
beyond launch still comes from ramps, patterns, and added variants, not new archetypes
(PIPELINES §2 rule, unchanged).
