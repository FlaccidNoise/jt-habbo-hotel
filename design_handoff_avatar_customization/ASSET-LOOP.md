# ASSET-LOOP.md — looping a Claude Code session into an asset factory

## The economics (from ART-DIRECTION.md, measured)
A wearable layer costs ONE Blender mesh in tools/artgen/rig.py FIGURE_PARTS; the 8 dirs x 8
frames render is mechanical (~75s/layer, full wardrobe ~20 min unattended). figurepass.ts
re-gates against the accumulated /tmp/artgen in seconds — that is the iteration loop. So the
factory unit is: mesh → figuredata set append → render → gate → freeze → commit.

## Per-part recipe (one jtbug bug, one commit)
1. Append the FigureSet in packages/shared/src/figuredata.ts (id append-only, declare slots,
   family, hides — hats hide hr, coats hide ch; hides only names EARLIER layer types).
2. Author the mesh in rig.py FIGURE_PARTS: prims keyed to colour slots, budget ~26 prims,
   silhouette must differ from every sibling set (near-duplicate rule) — vary silhouette,
   never just palette. Garments render as holdouts against bd1+hd2; never touch hd geometry.
3. make art PART=<id>  (renders just this layer; PART= skips the rest).
4. node --experimental-strip-types tools/artgen/figurepass.ts /tmp/artgen — ALL gates green:
   registration, bounds, figureHeight, holdout, face. Look at figure_face.png / the @3x preview;
   fix and re-run figurepass (seconds) until it reads.
5. --freeze, verify in-client at 2x (make dev + Playwright screenshot), commit
   "jtbug #N: <type><id> <name>". Frozen pixels are identity — only intentional repaints
   re-freeze.

## Looping it
- In-session: work the backlog table below top-to-bottom, one part per commit; check jtbug
  briefing at session start; file discovered problems as new bugs instead of fixing inline.
- Unattended: the repo's runner-worker pattern (CLAUDE.md) — one worker per backlog row,
  tests-gated merge to main. Headless: \`claude -p "<per-part recipe + row>" \` per row; the
  gates + golden-hash tests are the quality bar that makes unattended safe.
- Batch renders: queue several PART= renders, then one figurepass pass gates them all (it reads
  the whole accumulated meta.json).

## Backlog manifest (silhouette notes are the authored intent — vary them, never just ramps)
| type | name | slots | hides | silhouette |
|---|---|---|---|---|
| hr | Bob | 1 | — | helmet dome, hard bottom edge at jaw |
| hr | Ponytail | 1 | — | crown + back mass visible dirs 0/6/7 |
| hr | Curls | 1 | — | bumpy crown silhouette, +2px width |
| hr | Slick Back | 1 | — | tight to skull, peak at back |
| hr | Buzz | 1 | — | skull-tight, 1px lift |
| hr | Bun | 1 | — | top knot breaks crown line |
| hr | Fringe | 1 | — | brow-line straight cut front |
| hr | Afro | 1 | — | +4px radius sphere |
| hr | Braids | 1 | — | two side tails, dirs 2/4 asymmetric |
| hr | Mohawk | 1 | — | thin center crest |
| ch | Hoodie | 2 | — | hood bulk behind neck; slot 1 = drawstring/pocket |
| ch | Blazer | 2 | — | lapel wedge; slot 1 = shirt beneath |
| ch | Vest + Shirt | 2 | — | shoulder = shirt ramp, torso = vest |
| ch | Polo | 1 | — | collar step |
| ch | Turtleneck | 1 | — | neck covered — check chin clearance vs face maps |
| ch | Tank | 1 | — | bare shoulders (skin shows: torso prim keeps bd) |
| ch | Tracksuit Top | 2 | — | zip line = slot 1 flush band |
| lg | Shorts | 1 | — | ends above knee, shin = skin |
| lg | Flares | 1 | — | widens at ankle |
| lg | Cargo | 1 | — | pocket bumps at thigh |
| lg | Long Skirt | 1 | — | ankle-length cone, hides leg gap |
| sh | Sneakers | 1 | — | +1px sole, toe cap hi |
| sh | Boots | 1 | — | shaft to mid-shin |
| sh | Heels | 1 | — | heel notch, +1px height (watch figureHeight gate!) |
| sh | Sandals | 1 | — | straps, toes = skin |
| ha | Beanie | 1 | hr | skull-tight dome + fold band |
| ha | Top Hat | 1 | hr | cylinder + brim (bounds gate: 21px hat room) |
| ha | Headphones | 1 | — | band over crown, cups at ears — does NOT hide hr |
| ha | Visor | 1 | — | brim only, hair shows |
| ha | Crown | 1 | hr | gold default, 3 points |
| ea | Sunglasses | 1 | — | filled lens block over eye rows y33-35 |
| ea | Round Specs | 1 | — | outline circles, lens = paper top? no — keep transparent |
| ca | Scarf | 1 | — | neck wrap + hanging tail |
| ca | Tie | 1 | — | thin wedge on ch |
| ca | Chain | 1 | — | gold default, 1px arc |
| wa | Sash | 2 | — | diagonal band across ch |
| fa | Stubble / Moustache / Full Beard | 1 | — | from faces.js maps (raster stamp path, not mesh) |
| hd | face sets 17-24 | 2 | — | from faces.js curated combos (stamp path) |

Face/beard rows go through the facedata stamp path (no mesh); everything else is mesh path.
Colorways of any of these are ramp remaps — free, declare in the part def, no render.
