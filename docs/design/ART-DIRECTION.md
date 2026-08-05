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

## Scale: 64 only in v1

Resolves deferred audit item C-45. The 32 pass was "near a second full pass" — deferring it
halves the line item. The renderer keeps the two-scale architecture and the recipe format keeps
both scale slots. When zoom-out demand appears, the 32 pass re-renders from the same meshes with
its own polish pass, not a from-scratch redraw.

## Style bible v1

A versioned artifact — `style_version` in every recipe pins it (PIPELINES §2). Values below are
the v1 pins, marked (tune) where authoring may move them.

- **Palette:** 12 ramps × 5 shades (tune). Ramp-indexed color only — recolor is palette swap,
  never hue rotation.
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
  Variants must differ in silhouette, not only in palette — this feeds the near-duplicate gate.
- **Avatar reference:** standing figure ~100 px tall on a 64 × 110 canvas, ~3 height units
  (tune — pins jointly with the figure pipeline, bug #127).

## Proof gate before build-out

Re-render the three shipped archetype families (chair, sofa, plant) through this path. All three
must pass every stage-4 gate and read as one style side by side in the reference room. Until
that passes, no library build-out — the pipeline is the risk, not the part count.

Build-out order after the gate: casino-floor set, café set (the public rooms every player sees),
then the remaining floor archetypes, then wall archetypes (which also need the wall-item
coordinate system — currently unbuilt, see its bug).

## Sizing after the cuts

11 archetypes × ~3 slots × 4 variants ≈ 130 meshes, each with post-pass and possible polish.
The 2,300-sprite figure was the hand-drawn cost. The mesh is the authored unit now. Variety
beyond launch still comes from ramps, patterns, and added variants, not new archetypes
(PIPELINES §2 rule, unchanged).
