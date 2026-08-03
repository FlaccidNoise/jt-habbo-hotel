# Pipelines — assets, content, and services

Companion to [GAME.md](GAME.md). Covers how content gets made, validated, and served. This
revision integrates the technical audit ([review/technical-audit.md](../review/technical-audit.md))
— finding IDs cited inline.

## 1. Rendering constants and rules

Verified constants, copied from Habbo (research/habbo-hotel.md §4.1–4.3):

- Floor tile: **64 × 32 px diamond** at zoom 1, exact 2:1 dimetric. Zoom 0.5 halves everything.
- Height unit: **32 px** vertical.
- **Avatars:** 8 directions, 5 drawn — directions 4, 5, 6 are horizontal mirrors.
- **Furni:** 4 authored directions by default, per-item override. Mirroring is a per-asset
  authored flag used only where the art is symmetric — not a blanket direction rule. (audit B3)
- **Two authored art scales** (64 and 32), no runtime downscaling.

**Light and mirroring reconciled** (audit B4): the style lights from directly above-front —
vertically symmetric shading — so horizontal mirroring is shading-safe. Highlights avoid lateral
bias by rule. Parts whose shading must break this declare themselves non-mirrorable.

**Wall coordinate system** (audit A1): wall items live in a second coordinate space — wall-tile
pair, sub-tile pixel offset, left/right wall selector, anchor rules — at wall scale 32 against
internal 64. Wall archetypes (wall art, trophies, posters, shelves) use a wall spec shape:
wall-span, offset bounds, anchor — in place of footprint and stack height. Engraved record
trophies are wall items, so this ships v1.

**Draw order** (audit B1): painter's algorithm — all room sprites sorted by projected depth every
frame, with explicit tiebreakers (horizontal epsilon, stable per-sprite epsilon) so ties never
flicker. Multi-tile furni takes one base depth from its origin tile, so correct occlusion comes
from **per-layer z offsets the generator computes from footprint geometry** — there is no artist
to hide the problem in. A rendering-correctness gate (stage 4) renders each generated item in a
reference scene of stacked and adjacent items and diffs the result.

**Seating occlusion** (audit B2): every part slot declares an **occlusion group** — in front of or
behind a seated occupant, **per direction** (the chair back is behind the avatar facing the
camera, in front facing away). The generator derives per-direction layer depths from the
declaration. A stage-4 gate renders every seating item with a test avatar in all directions and
diffs against reference.

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
   Each spec: part slots with **occlusion groups per direction**, footprint (or wall-span),
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

## 3. Avatar and outfit pipeline

- Figure string model: `type-set-color` triples. **Set IDs are append-only and never reused**;
  retiring a garment flags it, never deletes; stored figure strings carry the figuredata version
  they were authored against. (audit F2)
- Layered part types with first-class hidden-layer rules (hats hide hair) from day one.
- Action set: stand, walk, sit, lay, wave, dance, sleep, carry, plus the focus props (laptop,
  book, sketchpad). 5 drawn directions, 2 scales.
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

V1 focus is the hangout core — the resort as third place ships first.

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
