# Pipelines — assets, content, and services

Companion to [GAME.md](GAME.md). Covers how content gets made, validated, and served. This
revision integrates the technical audit ([review/technical-audit.md](../review/technical-audit.md))
— finding IDs cited inline.

## 1. Rendering constants and rules

Verified constants, copied from Habbo (research/habbo-hotel.md §4.1–4.3):

- Floor tile: **64 × 32 px diamond** at zoom 1, exact 2:1 dimetric. Zoom 0.5 halves everything.
- Height unit: **32 px** vertical.
- **Avatars: 8 directions, all 8 rendered natively. No mirroring.** (Revised 2026-08-05, #127 —
  supersedes "5 drawn, directions 4/5/6 are horizontal mirrors".) Mirroring exists to halve
  *hand-drawing*; the 3D-assisted path does not hand-draw, so it saves render minutes and costs
  every asymmetric garment — a chest logo, a shoulder bag, side-part hair.
  The old mirror table was also simply wrong for this rig: it assumes dir 0/4 face the camera,
  but the camera sits in the +X+Y octant, so **dirs 3 and 7 are the self-symmetric ones** and the
  pairs are 0↔6, 1↔5, 2↔4. Measured on the v1 body: the self-symmetric directions still differ
  from their own mirror by ~12 % of lit pixels and the best true pair by 25 %, so mirroring was
  never free here. Movement is 8-way (`heightmap.ts` walks all of `DIR_STEPS`), so all 8 are
  needed regardless.
- **Furni:** 4 authored directions by default, per-item override. Mirroring is a per-asset
  authored flag used only where the art is symmetric — not a blanket direction rule. (audit B3)
- **Two authored art scales** (64 and 32), no runtime downscaling. V1 authors 64 only — the 32
  pass is deferred, architecture unchanged ([ART-DIRECTION.md](ART-DIRECTION.md), resolves C-45).

**Light and mirroring** (audit B4, revised 2026-08-05): B4 claimed the above-front key gives
vertically symmetric shading, so horizontal mirroring is shading-safe. **That is not true of the
shipped rig** — the sun is `(-0.22, -0.80, -1.05)` (`rig.py`), whose lateral component breaks
left-right symmetry by construction. Measured, it accounts for ~5 points of mirror-pair
difference; the remaining ~20 comes from the dimetric camera itself. Nothing depends on the claim
today: furni renders 4 directions natively and avatars render 8, so no asset is ever mirrored.
The sun stays as it is because 22 frozen bundles are lit by it and their pixels are their
identity. Do not build a mirroring optimisation on B4 without re-measuring first.

**Wall coordinate system** (audit A1, shipped #203): wall items live in a second coordinate space.
A segment is named by the floor tile it borders plus a left/right selector — left is the plane at
`x-0.5` running along +y, right is `y-0.5` running along +x — and a position on it is `(u, v)` in
scale-64 screen pixels, `u` along the wall from the segment's near corner, `v` down from the wall
top (`WALL_HEIGHT` 4 units, 128 px). **`u` is even by rule**: the wall's horizontal axis is the
projection's 2:1 diagonal, so one along-wall pixel moves a sprite (±1, +0.5) and an odd offset
would land it half a pixel off the plane. `packages/shared/src/walls.ts` owns all of it.

Wall archetypes (wall art, poster, record trophy, wall shelf) use `WallDef` — span, plane box,
mount — in place of footprint and stack height, a parallel shape rather than a variant of
`FurniDef`, since none of `w`/`l`/`stackHeights`/`canWalk`/`canStackOn`/`seatHeight` means
anything for a poster. `span`/`plane`/`mount` are read off the render by the post-pass, which
prints the def line to paste; the wall gates check the declaration back against the pixels.
Engraved record trophies are wall items, which is why this shipped before the museum wing (#210).

**Draw order** (audit B1): painter's algorithm over **boxes, not points**. Every sprite carries its
whole footprint and height (`DepthBox`), and `painterOrder` (packages/shared/src/depth.ts) sorts
them topologically: A draws before B when A is west, north, or underneath B *and* the two overlap
in the axes that let their sprites meet. A scalar depth key cannot do this — a 4×1 table needs a
chair behind it at one end and in front at the other, and one number puts both on the same side.
Ties (diagonal neighbours, boxes sharing a space) fall back to a depth key and then to insertion
order, so they never flicker. The same order runs inside one sprite, over its part boxes, which is
what keeps a leg from stamping its lid over the tabletop.

A constraint is kept only when the two boxes could share a pixel (`meet`). "West of" holds at any
pair of heights, but between a low box and a high one it is also vacuous — and a vacuous constraint
still closes a cycle, which makes `painterOrder` fall back and drop a constraint that was not
vacuous.

The rendering-correctness gate (stage 4) is `gateDrawOrder`. It renders each generated item twice —
alone, and in a reference scene of a neighbour on every adjacent tile plus one stacked on top — and
diffs the painter render against a per-pixel depth test (packages/generator/src/scene.ts). A pixel
passes when the colour the painter left is one that a nearest-surface box would have painted. Two
boxes that pass through each other therefore always fail: each is in front of the other somewhere,
so no order is right, and parts are authored to touch rather than overlap. Coverage is the box path
only — 3D-assisted defs ship frozen pixels with no boxes to re-render (#233).

Floor tiles join the sort as columns, from the lowest point their overhang faces reach up to their
surface — a platform occludes what stands behind it, and furniture on it draws over it. Tiles at
the room's own floor height stay in a band below every sprite instead: a tile is only ever drawn
over things north and west of it, and to reach up-screen into any of them its top has to clear the
floor they stand on, which the lowest height in the room never does. So a flat room puts no tile in
the sort and costs exactly what it did before — 0.36 ms per restack over 125 items. A 20×20 room
terraced to height 2 across half its area puts 190 tiles in and costs 2.21 ms. Restacks are
event-driven, so that is the price of a move, not of a frame; if a room ever gets big enough to
feel it, the tile order is static and can be computed once and merged (#230).

**Seating occlusion** (audit B2): a seat's geometry splits into a half **behind** a seated occupant
and a half **in front**, **per direction** — a chair back is in front of the avatar facing away
from the camera, behind it facing toward. Nothing is declared: the occupant joins the sprite's own
painter sort as one more box, over the tagged seat slot's footprint from its surface up, and the
order is cut where it lands. The two halves concatenated are therefore the order the whole sprite
would draw in, so every constraint between parts still holds by construction.

A split sheet has a second frame row — row 0 the back half, row 1 the front — and the client builds
two Sprites. Geometry cannot order the front half against the occupant (the near-side backrest sits
inside the tile they occupy, and on a 2-tile sofa one backrest has to follow sitters on either
tile), so that one edge is forced from the layers: `seated` always draws before `seat_front`
(client scene/sort.ts `seatEdges`, `painterOrder`'s `forced` argument).

`gateSeatOcclusion` is the stage-4 gate: it renders every seating item with a test occupant on
every seat tile in every direction and diffs against the depth test. Box path only — a 3D-assisted
seat ships pixels, not boxes, so the gate has nothing to re-render (#235).

**The 3D-assisted path splits too, by a different route** (#227). The split is derived, not
declared: the rig already knows where every primitive is, and depth in the painter's algorithm is
just `fx+fy`, so "nearer than the seat point" falls out of the rotation the direction loop already
does. No artist in the loop, and no way for a declaration to disagree with the geometry.

Its near half ships as a **companion sheet** (`<id>.near.png`, `nearHash`) rather than a second
row, cut from the finished frame so it carries the same outlines and detail lines as the base.
Additive on purpose: every base sheet stays byte-identical, so no frozen bundle loses the pixels
that are its identity. `occlusion` stays null on these bundles — that field means the in-sheet
row-1 split, and the Blender path has never measured one.

So the two paths differ only in where the near pixels live. Both draw as a second Sprite on
`seat_front`, and both are ordered against their sitter by the same forced edge. What the
companion sheet lacks is a measured box, so the client sorts it by the item's own extent
instead — sound, because every near pixel is a subset of the base frame, but coarser than the
box path against a neighbour that overlaps the same tile (#235).

**Pathfinding** (audit B5): build step 1 includes it explicitly — heightmap, per-tile blocked
state, furni stack heights, per-item walk/sit flags, climb-delta rule, door special case.

**Room format** (audit F3): the text heightmap (`x` void, `0-9a-z` heights) is the authoring
format. Storage is a **versioned structured document** with the heightmap as one field, so
per-tile attribute layers (materials, no-stack, trigger regions) can be added without format
migration. The validator **rejects** malformed input (short rows, unreachable regions from the
door) — never skips silently. Custom floor plans are untrusted input: size limits, connectivity
check, validated before reaching the server.

## 2. Procedural furni pipeline

Goal: unbounded *new* designs in one coherent style, plus the player design studio. Part
composition over curated libraries — free pixel generation cannot hold a style. (Coke §6.3)

A design is a **recipe**: `archetype + part selections + palette ramp + pattern + seed`, plus
`style_version + generator_version + part_library_hash`. Rendering is reproducible only within a
pinned version pair. **Publishing freezes the rendered bundle — the bundle is the item's
identity**; the recipe demotes to provenance and derivation seed. Every published item stores the
hash of its rendered output, so a disagreeing re-render is a detected error, not a silent visual
change to owned property. Serial-numbered LEs make this non-negotiable: a regenerated sprite is a
different object wearing the same serial. (audit F1, C-38)

**Determinism mechanism** (audit A6): one generator, server-side. The design studio preview calls
the server renderer and displays the returned sprite — client and server can never disagree
because there is only one renderer. Named seeded PRNG, integer arithmetic in the
recipe-to-sprite path.

### Stages

1. **Archetype specs.** Floor archetypes: chair, sofa, table, bed, lamp, plant, shelf, rug,
   divider, stereo, casino table. Wall archetypes: wall art, poster, record trophy, wall shelf.
   Each spec: part slots — a slot named `seat` is what makes the item sittable, and the
   per-direction occlusion split is derived from its geometry, not declared — footprint (or
   wall-span),
   **per-state stack heights** (the `multiheight` list — server needs it for placement and
   pathing, audit A3), seat/lay points, state count, and an **animations block** — per-layer frame
   sequences with per-frame offsets, per direction, per scale. Animated archetypes are named
   explicitly (stereo, casino table, lounge speaker) because each multiplies part cost by frame
   count. (audit A2)
2. **Style system.** Global palette of N ramps × M shades, above-front light, outline rule, dither
   rules, material patterns. Ramp-indexed color — recoloring is palette swapping, never hue
   rotation. **Pattern generators are a curated authored set with recoloring — no free seed space.**
   A free symmetric pattern generator produces hate symbols by construction (a swastika is a
   4-fold rotationally symmetric grid motif). The curated set is the moderation mechanism for
   procedural classes, and a geometry check runs on designer-authored patterns too — an unlucky
   seed in our own catalog is the same headline. (audit S12, E2)
3. **Generation.** Seeded recipe → compose part sprites per direction and scale → palette and
   pattern → emit sprite sheet + **full metadata**: per-layer × per-direction × per-scale offsets
   and depths, per-state stack heights, footprint, seats, occlusion groups, animation timelines.
   Metadata publishes to the room server as well as the CDN — it is collision data, not just art.
   (audit A3)
4. **Validation gates (automated).** Palette compliance, grid alignment, silhouette contrast
   against the two extreme floor tones, footprint sanity, animation bounds, **recipe-uniqueness**
   (duplicate hash rejects, full refund), **near-duplicate gate** (perceptual hash at both scales
   against the published corpus — rejects counterfeits of high-value items and oatmeal-clones),
   **similarity to previously rejected designs**, the reference-scene render gates (draw order,
   seating). A gate exists only if a staged known-bad recipe actually bounces — test them that
   way. (audit A5, R-07, S11)

   Gates run by surface. Palette, contrast and uniqueness are surface-blind. Footprint, seat and
   ground-contact bounds are floor-only, and wall bundles **replace** them rather than relaxing
   them — `gateWallFit` and `gateWallBounds` reject a mesh that floats off the wall, stands off it
   like a table, carries a seat, overhangs its span, or declares a plane box that no longer matches
   the render. `gateBounds` still rejects every wall sprite, and a test asserts that: it is why the
   variant exists.
5. **Mint gate (prototype).** Names and descriptions through the basic word filter. Composed
   furni from the curated part library needs no image screening — the part library is the gate.
   Per-account mint rate limits and rejection economics per GAME.md §Design minting (integrity
   rules, active). The full screening pipeline (geometry checks, review queues, recall staffing)
   is parked: SAFETY-LEGAL-PARKED.md.
6. **Publish.** Frozen bundle (sprite sheet + metadata JSON, **our own bundle format** — the
   `.nitro` shape bought no interop and carried GPL reference risk, audit G2) to CDN, catalog
   entry to DB.

### Part-library sizing (the real cost, audit A4)

The part library is the project's largest art line item and has an owner from day one. Launch
scope (tune): **8 floor + 3 wall archetypes × ~3 slots × 4 variants × 4 directions × 2 scales ≈
2,300 part sprites**, before animation. The 32-scale pass is a redraw, not a resample — near a
second full pass. Variety beyond launch comes from ramps, patterns, and added variants, not new
archetypes. "Effectively infinite" means the *recipe space*; perceived variety is enforced by the
near-duplicate gate and by per-slot proportion parameters so silhouettes actually differ.

Build order note (audit A7): the starter catalog is **authored as generator parts from the
start** — the generator reproducing art built for it proves nothing otherwise.

**Authoring path decided 2026-08-04:** 3D-assisted — parts modeled once as low-poly meshes, a
fixed dimetric rig renders the directions, a post-pass quantizes to palette and draws outlines,
hand polish behind the stage-4 gates. Style bible, proportion parameters, proof gate, and
sizing: [ART-DIRECTION.md](ART-DIRECTION.md). Tracked as #202 (wall archetypes need #203).

## 3. Avatar and outfit pipeline

Built 2026-08-05 (#127). Revisions below are what the build actually produced.

- Figure string model: `v<N>|type-set-color(-color)*`, parts joined by `.`. **N colours per part**,
  the slot count declared by the set — a two-tone shirt is one mesh with two independently chosen
  ramps, which the colorway machinery (#229, remaps keyed by ramp *name*) already supported.
  **Set IDs are append-only and never reused**; retiring a garment flags it, never deletes. The
  figuredata version rides in the string itself because the string is stored, broadcast, and
  copied between systems. (audit F2)
- **12 layer types in render order, 11 selectable:** `bd hd lg sh ch wa cc ca hr fa ea ha`.
  `bd` is implicit and inherits `hd`'s skin ramp — a separately chosen body colour is a
  neck-mismatch bug with no upside, so the parser refuses it.
- **Order is per type; hiding is per set** (`hides: [type…]`, backwards in the order only, gated).
  A tiara and a beanie are both `ha` and only one hides hair, so there is no type × type matrix to
  design before garments exist.
- **Hidden-layer rules are load-bearing, not cosmetic.** A garment renders against the canonical
  body as a holdout and keeps only its own pixels, so where the body is nearer it won the depth
  test and the client composites with plain alpha-over and no runtime depth. That works only while
  the holdout set is exactly one thing. A hat hides hair so a hat never needs a holdout render per
  hair set — which is what keeps the cost `layers × dirs × frames` instead of combinatorial.
  Corollary: a second **head shape** would break it, so `hd` stays one mesh and head variety comes
  from colour and hair.
- **Figure sheets are indexed.** A pixel stores (colour slot, shade index) and the client resolves
  it through the worn ramps while it composites. Colour is per player; baking colour into the
  sheet would move the combinatorics into colour space.
- **Shadows must stay off for figures** (`scene.eevee.use_shadows`, a master switch that overrides
  the per-light flag). With them on, a shirt casts onto the torso and the bare body renders
  differently depending on what is worn over it — 1374 pixels of the same primitive differing by a
  mean of 56/255. Layer independence is the whole model.
- Action set v1: **stand, walk (4 frames), sit, wave (2)** — 8 frames, 8 directions, scale 64.
  lay, dance, sleep, carry and the focus props are deferred to #232. Poses are authored once as
  bone angles and every garment ever made inherits them, so an action costs protocol surface and
  sheet bytes, not art.
- **Pets:** same recipe model — species body types × colors × patterns, pet clothing layer system
  with its own hidden-layer rules. Actions: follow, sit, sleep, react, trick.

## 4. Music pipeline

- **Sample banks are commissioned work-for-hire, or licensed under a perpetual, irrevocable,
  worldwide, sublicensable grant that expressly contemplates distribution in extractable form and
  end-user derivative works — in writing before the first bank is commissioned.** Banks shipped
  to browsers *will* be extracted (Coke Music's 114 samples circulate as .wav today), and player
  songs, tradeable CDs, charts, and engraved trophies are all derivative works of the samples. A
  revocable license expiring is the Key Quest failure arriving by contract. (audit D4)
- Banks share tempo and key families. **A song is bank-confined** — one bank loads at a time
  (~16 MiB decoded), which sets the client memory budget and preload size. (audit D3)
- Sequencer: 5 tracks, step grid scaled to sample length, fixed ~60-second timeline.
- **Song format is versioned**, and step positions are stored as fractions of the song timeline,
  not indices into a sample-length-derived grid — sample edits must never silently re-time stored
  songs. (audit D5)
- **Synchronized playback, mechanism stated** (audit D1): server broadcasts (song, bank, start
  time in server clock); clients estimate clock offset by round-trip sampling and schedule against
  `AudioContext.currentTime`; target alignment 50 ms. Visual reactions trigger by song section,
  never by beat — cross-client beat lock is not achievable.
- **Autoplay policy** (audit D2): `AudioContext` starts suspended until a user gesture. One-time
  audio-enable interaction at login, so the context exists before the first room join. Joining
  mid-song with the bank not yet loaded is silence until ready — a decision, not an accident.

## 5. Services

| Service | Responsibility | Storage | Notes |
|---|---|---|---|
| Identity | Registration, credentials, sessions, permanent usernames + similarity check, ban state, alt/device heuristics | Postgres | Every service authenticates sessions against it. Feeds signals to the ledger's anomaly detection. (audit H1) |
| Room server | Authoritative room instances: movement, pathfinding, chat, furni state, **event bus + extensible per-object state bag + per-room execution budget** (the reserved Wired substrate) | writes through to Postgres | Furni mutations write through immediately — irreplaceable property, low write rate. Reconnect window + full-state resync message specified. (audit C4, C8) |
| Gateway / room directory | Maps room ID → process, holds client connections, drain procedure (new joins routed away, rooms drained on emptiness or handed off) | — | A deploy is a migration that happens weekly. Rolling deploy ships with build step 1. (audit C6, H5) |
| Economy ledger | **Stars AND item ownership in one append-only log, one Postgres database** — a purchase, trade, or stall sale is one local ACID transaction, never a distributed one | Postgres (shared with item instances) | Partial commits cannot exist. Counterparty-graph anomaly queries run here. (audit C1, R-02) |
| Marketplace | Order book, escrow, matching, commission | same DB as ledger | Money lives next to the ledger, not next to the CDN. (audit C7) |
| Catalog / asset | Recipes, frozen bundles, stalls | Postgres + CDN | Immutable bundles cached forever *because* they are frozen at publish. |
| Minigame services | One authoritative service per family. Results carry a unique match ID; the ledger enforces **at-most-once settlement per match ID**, idempotent retries | Postgres | A signature proves origin, not freshness — replay is dedup'd at the ledger. Match state survives process restart. (audit C5) |
| Casino | House-banked games, published odds tables, stake caps, auditable RNG | Postgres via ledger | Every stake and payout is a ledger transaction. |
| Presence | Room servers publish session state; clients subscribe once to their friend list | Redis or similar | Fan-out is subscription-based, never friend-notifies-friend. Granularity: online/offline cheap, room-level opt-in. (audit C3) |
| Social | Friends, groups, badges, messaging | Postgres | DM retention and sampling per GAME.md §Safety. |
| NPC | LLM gateway: prompt templates, per-NPC memory, room context | Postgres | Small local/cheap cloud models. Output through filter + outbound screen. **No payout authority.** |
| Filter | **Versioned ruleset artifact, evaluated in-process on every room server** — basic wordlist for the prototype; the hot path stays local either way, and the artifact model is where the parked scoring layer attaches later | Postgres | (audit E1; full moderation service parked — SAFETY-LEGAL-PARKED.md) |
| Observability | Per-faucet issuance and per-sink absorption over time, ledger latency/errors, room population and tick health, WebSocket connect/reconnect rates | — | Collusion auditing requires the data to exist before the exploit. (audit H4) |

**Degradation policy** (audit C2): rooms, chat, and movement have zero ledger dependency — they
never stop because the ledger is down. Vote and match results queue durably at their service with
idempotency keys and settle asynchronously: an outage delays payment, never destroys it (a spent
vote cannot be re-earned). Purchases fail closed.

**Backups** (audit H2): a backup that has never been restored is a belief. Each durable store has
a stated RPO and RTO, and a scheduled restore drill into a scratch environment — the drill's
success is the only accepted evidence. Key Quest's files existed; nobody had proven a restore.

**Client:** TypeScript + PixiJS web client.

**GPL process, not just a rule** (audit G1): constants and file formats are facts and may be
copied. Implementations may not. One person reads the reference (nitro-renderer GPL-3.0, Arcturus,
Havana AGPL-3.0, **nitro-react: no license declared = all rights reserved, stricter than GPL**)
and writes a plain-language spec; a different person implements from the spec without opening the
reference; the split is recorded per file.

**Migration durability is a hard constraint.** Battle Ball and Key Quest — the two most-loved
official games in the research — died in infrastructure migrations, not from fun or economy
failures. Match and room state survive restarts, clients get reconnect windows, no game-critical
data lives outside version control and backups (and see the restore-drill rule above).

## 6. Content cadence

- Catalog releases on a steady clock, shipped as named collection sets with progress counts.
- Limited editions ~every 2 months, serial-numbered, capped, per-account purchase caps.
- Seasonal events: new line + re-release of last year's line.
- Timed free drops during events.
- Minigame seasons and the monthly arcade-ratio rebalance share the calendar's fixed dates.

## 7. Build order (sketch, plan to follow separately)

V1 focus is the hangout core — the resort as third place ships first. Per-step acceptance
criteria, step↔bug mapping, and the pinned tunables table: [ROADMAP.md](ROADMAP.md).

1. Room render + pathfinding + avatar walk + chat, with the basic word filter. Rolling deploy
   and room drain ship here because every later step inherits them. (audit H5)
2. Furni placement from a starter catalog **authored as generator parts**. Casino-floor and café
   public rooms, focus states.
3. NPC staff service (liveness from the first invited player).
4. Generator pipeline reproducing the starter catalog from recipes (proves stages 1–4).
5. Trade window + unified ledger. Cosmetics and pets ride the same item rails.
6. First solo arcade game end-to-end through the ledger.
7. Music loop. 8. Design studio. 9. Multiplayer games + casino floor games.

Public-deployment legal gates are parked with everything else: SAFETY-LEGAL-PARKED.md.
