# Pipelines — assets, content, and services

Companion to [GAME.md](GAME.md). Covers how content gets made, validated, and served.

## 1. Rendering constants

Copy Habbo's numbers verbatim — they are verified from renderer source and land on integer pixels
(research/habbo-hotel.md §4.1–4.3):

- Floor tile: **64 × 32 px diamond** at zoom 1, exact 2:1 dimetric. Zoom 0.5 halves everything.
- Height unit: **32 px** vertical.
- Avatar and furni facing: **8 directions, 5 drawn** — directions 4, 5, 6 are horizontal mirrors.
- **Two authored art scales** (64 and 32), no runtime downscaling.
- Room model: text heightmap — `x` = void, `0-9` = height 0–9, `a-z` = height 10–35, plus door
  coordinates, door direction, wall height.

## 2. Procedural furni pipeline

Goal: an effectively infinite catalog in one coherent style, plus a player-facing design tool.
The Coke Music lesson governs everything: curate the parts, constrain the space, and every output
stays comparable and stylistically coherent. (research/coke-music.md §6.3)

### Approach: part composition first, not free generation

Author part libraries per archetype, generate by recombination. Free pixel generation cannot hold
a style. A furni design is a **recipe**: `archetype + part selections + palette ramp + pattern +
seed`. Recipes are small, deterministic, and cheap to store. Sprites render from recipes and cache
forever.

### Stages

1. **Archetype specs.** Chair, sofa, table, bed, lamp, plant, shelf, rug, wall art, divider,
   stereo. Each spec defines part slots (legs, seat, back, arms…), footprint in tiles, stack
   height, seat/lay points, and state count (lamp on/off).
2. **Style system.** Global palette of N ramps × M shades, one light direction, outline rule,
   dither rules, material patterns (wood grain, fabric weaves, metals). Every part is drawn in
   ramp-indexed color so recoloring is palette swapping, never hue rotation.
3. **Generation.** Seeded recipe → compose part sprites per direction and scale → apply palette
   and pattern → emit sprite sheet + metadata JSON (footprint, height, seats, states). Mirror
   directions 4–6.
4. **Validation gates (automated).** Palette compliance, grid alignment, silhouette contrast
   against both floor tones, footprint sanity, animation frame bounds. A gate exists only if a
   known-bad recipe actually bounces — test the gates with staged bad inputs.
5. **Moderation gate (player-minted only).** Name and description through the standard filter,
   rendered sprite through image screening, then human review queue for flagged items.
6. **Publish.** Asset bundle (sprite sheet + JSON, the `.nitro` shape) to CDN, catalog entry to DB.

Genuinely procedural classes — rugs, wallpaper, flooring, tile patterns — can use constrained
symmetric pattern generators from the start. They tolerate abstraction and read well at 64×32.

### Player design studio

The same pipeline with a UI on stage 3. Players never touch pixels — they pick archetype, parts,
ramps, patterns, and a seed, preview in-room at both scales, and pay the minting fee to submit
through gates 4–5. Rejected mints refund the fee minus a small processing sink.

## 3. Avatar and outfit pipeline

- Figure string model: dot-separated `type-set-color` triples (research/habbo-hotel.md §4.3).
- Layered part types with **first-class hidden-layer rules** (hats hide hair) from day one.
- Palette per set type. Outfit generation = garment part sprites + ramp swaps + patterns, same
  recipe model as furni.
- Action set for launch: stand, walk, sit, lay, wave, dance, sleep, carry, plus the focus props
  (laptop, book, sketchpad) for the co-presence layer. 5 drawn directions, 2 scales.
- **Pets** use the same recipe model: species body types × colors × patterns from the generator,
  plus a pet clothing layer system (collars, hats, coats) with its own hidden-layer rules. Pet
  action set: follow, sit, sleep, react, trick.

## 4. Music pipeline

- Curated sample banks per genre, authored so any combination within a bank stays coherent — the
  banks share tempo and key families. Commission or license the banks the way Sulake used DJ
  Orkidea. (research/coke-music.md §4.1)
- Sequencer: 5 tracks, step grid scaled to sample length, fixed ~60-second timeline.
- Song serialization: compact recipe (bank + sample + step bitmap per track), a few hundred bytes.
- Server schedules playback to a room so all listeners hear the same song at the same offset.

## 5. Services sketch

| Service | Responsibility | Notes |
|---|---|---|
| Room server | Authoritative room instances: movement, chat, furni state | One process shards many rooms, WebSocket to clients |
| Economy ledger | Every Star in and out, caps, anomaly detection | Single source of truth. All faucets and sinks post here. Append-only log |
| Minigame services | One authoritative service per game family, results signed to ledger | Never trust client scores |
| Catalog/asset service | Recipes, bundles, marketplace order book | CDN in front of sprite bundles |
| Moderation service | Filter (reject names, substitute chat), report queue, room watch, audit log | Filter is one shared service so every surface behaves the same |
| Social service | Friends, groups, badges, messaging | Room-independent |
| NPC service | LLM gateway for staff characters: prompt templates, per-NPC memory, room context | Small local or cheap cloud models. Output passes the moderation filter plus an outbound screen. **No payout authority** — economic triggers are deterministic server rules |
| Casino service | House-banked chance games, stake caps, odds tables | Odds published internally, auditable RNG, every stake and payout through the ledger |

Client: TypeScript + PixiJS web client. nitro-renderer and Arcturus are **format references only**
— GPL/AGPL forbids copying code into this project. (research/habbo-hotel.md §4.6)

Duplication is the historical killer: Coke Music v2 died of dupe exploits and packet editing. The
ledger's append-only log plus item instance IDs with ownership history is the defense. Item state
changes are transactions, never client-reported.

Migration durability is a hard constraint, not an operational afterthought. The two most-loved
official multiplayer games in this research — Habbo's Battle Ball and Neopets' Key Quest — both
died in infrastructure migrations (Flash rewrite, lost files in a server move), not from economy
or fun failures. Minigame services need: match state that survives a process restart, client
reconnect windows, and no game-critical data outside version control and backups.
(research/neopets.md §3, §6)

## 6. Content cadence

- Catalog releases on a steady clock.
- Limited editions roughly every 2 months, serial-numbered, capped.
- Seasonal events: new line + re-release of last year's line (scarcity pressure valve).
- Timed free drops during events — they raise trading activity, not just logins.
- Minigame seasons align with the event calendar.

## 7. Build order (sketch, plan to follow separately)

V1 focus is the hangout core — the third-place experience ships first.

1. Room render + avatar walk + chat (the vertical slice that proves the projection constants).
2. Furni placement from a hand-made starter catalog. Lobby + café public rooms, focus states.
3. NPC staff service (liveness from the first invited player).
4. Generator pipeline producing the starter catalog from recipes (proves stage 1–4).
5. Trade window + ledger. Cosmetics and pets ride the same item rails.
6. First solo arcade game end-to-end through the ledger.
7. Music loop. 8. Design studio. 9. Multiplayer games + Casino.
