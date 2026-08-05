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

- **Palette:** 12 ramps × 5 shades, pinned 2026-08-05 in `packages/generator/src/style.ts`.
  Ramps: walnut, oak, plum, fern, crimson, slate, sand, teal, gold, ivory, navy, charcoal.
  Shades per ramp are one base color × fixed light factors — outline 0.35, left 0.65, right 1.0,
  top 1.3, hi 1.55. `hi` is the sun-facing band: bevel strips and curve crests. Ramp-indexed
  color only — recolor is palette swap, never hue rotation. A base color bright enough to clip
  a shade to white is a style failure, not a highlight: the palette test bounces it.
- **Light:** above-front, vertically symmetric shading (audit B4).
- **Outline:** 1 px, the part ramp's darkest shade. Pure black reserved for ground-contact
  edges (tune).
- **Dither:** 2×2 checker only, on surfaces 4×4 px or larger, never across an outline.
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
- **Avatar reference:** standing figure ~100 px tall on a 64 × 110 canvas, ~3 height units
  (tune — pins jointly with the figure pipeline, bug #127).

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

Remaining for the epic: wall archetypes (blocked on the wall-item coordinate system, see its
bug), and hand-polish passes where a silhouette reads wrong at 64. No part has needed polish yet.

## Sizing after the cuts

Measured on the first build-out: 12 parts (3 proof + 9 catalog) render and gate in ~13 s total
on the dev box, unattended. Authoring the mesh is the whole cost; the 4 directions are free.

So are colorways (#229). The rig lights white geometry and emits a flat index mask, so neither
render pass ever sees a ramp — the recolor happens entirely in the post-pass. A colorway is
declared as `base part + ramp remap` in `postpass.ts` and reuses the base's frames, so it adds a
catalog item for no Blender time at all: the second build-out rendered 9 parts and published 13.
Ramp remaps are keyed by ramp name, not primitive index, so they survive editing the mesh.

11 archetypes × ~3 slots × 4 variants ≈ 130 meshes, each with post-pass and possible polish.
The 2,300-sprite figure was the hand-drawn cost. The mesh is the authored unit now. Variety
beyond launch still comes from ramps, patterns, and added variants, not new archetypes
(PIPELINES §2 rule, unchanged).
