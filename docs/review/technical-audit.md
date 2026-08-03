# Technical audit — PIPELINES.md

Adversarial review of [docs/design/PIPELINES.md](../design/PIPELINES.md) against
[GAME.md](../design/GAME.md) and the verified research in
[habbo-hotel.md §4](../research/habbo-hotel.md) and [coke-music.md §4](../research/coke-music.md).

Audit date: 2026-08-03. Question asked: **will this architecture work when built, and what did it
hand-wave?**

## Verification method

Every rendering claim below was checked against the actual reference source, not against the
research summary. Files fetched 2026-08-03:

| Claim source | File | Fetched from |
|---|---|---|
| Sprite sort comparator | `src/room/renderer/RoomSpriteCanvas.ts` | raw.githubusercontent.com, `billsonnn/nitro-renderer@main` |
| Per-layer depth | `src/nitro/room/object/visualization/furniture/FurnitureVisualization.ts` | same |
| Layer offset schema | `src/api/asset/visualization/IAssetVisualizationLayer.ts` | same |
| Bundle schema | `src/api/asset/IAssetData.ts`, `IAsset.ts` | same |
| Animation schema | `src/api/asset/visualization/animation/*.ts` | same |
| Avatar depth constants | `src/nitro/room/object/visualization/avatar/AvatarVisualization.ts` | same |
| Wall coordinate space | `src/nitro/room/utils/LegacyWallGeometry.ts` | same |
| Furni metadata schema | `habbohotel/items/Item.java` | git.krews.org, Arcturus `dev` |
| Heightmap parser | `habbohotel/rooms/RoomLayout.java` | same |
| Licences | GitHub API `/repos/{owner}/{repo}` | api.github.com |

Counts (`git/trees?recursive=1`, 3,016 files): **41** furniture visualization classes and **62**
furniture logic classes in nitro-renderer. Those two numbers describe the behavioural surface of
the furni space PIPELINES.md §2 proposes to generate.

---

## Severity summary

| Severity | Count |
|---|---|
| Blocking | 9 |
| Major | 23 |
| Minor | 7 |
| **Total** | **39** |

"Blocking" means the doc as written cannot be built without a new design decision, not that the
project is doomed. Most blockers are one or two missing sentences in a spec.

---

## A. Procedural furni pipeline

### A1 — The recipe model cannot express a wall item at all

**Severity: blocking. Section: §2 stage 1, §1.**

§2 stage 1 lists `wall art` and `divider` as archetypes. The spec fields it defines are "part
slots, footprint in tiles, stack height, seat/lay points, and state count". Every one of those is
a floor-space concept. Wall items do not live in floor space.

Verified: `LegacyWallGeometry.getLocation(width, height, localX, localY, direction)` takes a wall
tile pair, a **sub-tile pixel offset** `localX/localY`, and a **left-or-right wall selector**.
`getOldLocationString` (line 296) serialises the result as `:w=x,y l=lx,ly <dir>`. That is a
second coordinate system with its own scale (`DEFAULT_SCALE = 32` against an internal working
scale of 64) and its own anchoring rules. §1 "Rendering constants" documents the 64×32 floor
diamond and the 32 px height unit and stops there.

This is not a corner case. GAME.md makes wall items load-bearing status objects: the Top-40 chart
poster, and the engraved Gold and Platinum Record trophies that Pillar 5 ("status must be
walkable") depends on.

**Fix:** add to §1 a wall coordinate section defining wall-tile addressing, the sub-tile offset
pair, the left/right wall selector, and wall-item anchor rules. Add to §2 stage 1 a second
archetype spec shape for wall items with those fields in place of footprint and stack height.

### A2 — The recipe model cannot express animation

**Severity: blocking. Section: §2 stages 1, 3, 4.**

Stage 1's spec fields end at "state count (lamp on/off)". Stage 3 emits "sprite sheet + metadata
JSON (footprint, height, seats, states)". Stage 4 then validates "animation frame bounds" — a gate
on data the pipeline never produces.

A state is not an animation. Verified schema: `IAssetVisualAnimation` holds `transitionTo`,
`transitionFrom`, `immediateChangeFrom`, `randomStart`, and a map of layers. Each
`IAssetVisualAnimationLayer` holds `loopCount`, `frameRepeat`, `random`, and frame sequences. Each
`IAssetVisualAnimationSequenceFrame` holds an asset id plus `x`, `y`, `randomX`, `randomY` and
per-direction offsets. That is a real timeline format, and it is per layer, per direction, per
scale.

§7 build order step 6 is "Music loop". Coke Music's public venues had an animated speaker that
reacted during performances (coke-music.md §3.2), and the Mixer furni switched sprite state when
in use (§1.1). Step 6 needs animated furni that step 3 cannot generate.

**Fix:** add an `animations` block to the archetype spec and to stage 3's emitted metadata, with
per-layer frame sequences and per-frame offsets. State explicitly which archetypes are animated at
launch, because each one multiplies the part-library cost by its frame count.

### A3 — Stage 3's output metadata omits the data that makes a sprite land in the right place

**Severity: blocking. Section: §2 stage 3.**

Stage 3 emits "footprint, height, seats, states". That list is missing the bulk of a real furni
bundle.

Verified from `IAssetVisualizationLayer`: every layer carries `x`, `y`, `z`, `alpha`, `ink`,
`tag`, `ignoreMouse` — and those are held **per direction** (`IAssetVisualizationDirection.layers`)
inside a **per-size** visualization record (`IAssetVisualizationData.size`). On top of that, each
individual asset in the spritesheet carries its own `offsetX`/`offsetY` (`IAsset.x`, `IAsset.y`).
`FurnitureVisualization.ts:297-299` composes them: `sprite.offsetX = assetData.offsetX +
getLayerXOffset(scale, direction, layerId)`.

So the required metadata is a four-way product: layer × direction × scale × (x, y, z, alpha, ink,
ignoreMouse). Without it, sprites render at the canvas origin.

Separately, `Item.java:112-121` shows `multiheight` — a semicolon-separated list of stack heights
indexed by the item's current state, read by `getCurrentHeight()`. The doc's archetype spec has a
single "stack height". Any archetype with states that change its physical height needs the list
form, and the **server** needs it for placement and pathing, not just the client.

**Fix:** rewrite stage 3's output line to name the per-layer, per-direction, per-scale offset and
depth table, plus per-state stack heights. Add a sentence stating that this metadata is published
to the room server as well as to the CDN, because it is collision data, not art.

### A4 — The part-library authoring workload is never counted, and it is the largest single cost in the plan

**Severity: major. Section: §2 stages 1–2, §7.**

The doc treats part authoring as a setup step. Count it.

Eleven archetypes are listed. Take an average of 4 part slots per archetype (a chair needs legs,
seat, back, arms — a table needs top, legs, apron). To get the combinatorial variety that justifies
"effectively infinite", each slot needs roughly 8 variants, giving 8⁴ ≈ 4,096 combinations per
archetype.

Directions: **4 authored, not 3** (see B3). Scales: **2**, and the doc itself says "no runtime
downscaling", so the 32 pass is a redraw, not a resample. Pixel art at half resolution requires
re-deciding every detail — it is not half the work of the 64 pass, it is closer to a second full
pass.

```
11 archetypes × 4 slots × 8 variants × 4 directions × 2 scales = 2,816 part sprites
```

Before animation frames, before per-state variants, before the palette-ramp and pattern authoring
in stage 2, and before the outfit part libraries that §3 needs on the same model. Add animation to
even three archetypes at 4 frames and the number passes 4,000.

For scale context on the behavioural side: the reference client carries 41 furniture visualization
classes and 62 furniture logic classes. The recipe model as specified covers one of those 41.

**Fix:** add a sizing subsection to §2 with the sprite arithmetic and a stated launch scope — the
number of archetypes, slots, and variants v1 actually ships. Then state which of those parts are
hand-drawn and who draws them. The plan currently has no owner for its biggest line item.

### A5 — "Effectively infinite catalog" collides with the 10,000-bowls-of-oatmeal problem, and no gate detects it

**Severity: major. Section: §2 intro, stage 4.**

Combinatorial variety and *perceived* variety are different quantities. This is the standard
failure mode of composition-based generators, named by Kate Compton as the 10,000 bowls of oatmeal
problem: every bowl is provably unique, and they all look the same.

Palette swap moves the least salient perceptual axis. At 64×32 with a shared ramp set and a single
light direction, two chairs that differ only in ramp read as the same chair in two colours —
because that is exactly what they are. Silhouette carries the perceptual weight, and silhouette
changes only at slot boundaries. Worse, the largest slots dominate: a chair's seat and back occupy
most of the pixels, so varying the legs slot moves almost nothing.

Stage 4's gates are palette compliance, grid alignment, silhouette contrast against floor tones,
footprint sanity, and animation frame bounds. "Silhouette contrast against floor tones" is a
**legibility** check. There is no **distinctiveness** check. Nothing in the pipeline can tell a
player that the design they just paid a minting fee for is a near-duplicate of an existing item.

That is an economic problem, not only an aesthetic one. GAME.md gives every minted design a
catalog stall, a creator cut, and a design chart. Near-duplicates turn minting into a land-grab on
good combinations and give the marketplace a spam surface.

**Fix:** two sentences. First, make silhouette a generated axis — per-slot proportion and scale
parameters, not only discrete variant picks. Second, add a near-duplicate gate to stage 4: a
perceptual hash of the rendered sprite compared against the published corpus, rejecting mints
inside a stated distance threshold.

### A6 — Determinism is asserted, never specified, and the design studio makes it load-bearing

**Severity: major. Section: §2 intro, §2 player design studio.**

"Recipes are small, deterministic, and cheap to store" states a property without naming the
mechanism that provides it.

The design studio makes this sharp: "the same pipeline with a UI on stage 3" and players "preview
in-room at both scales" **before** paying the minting fee. If the preview renders client-side and
the published sprite renders server-side, the two must agree bit for bit. If they do not, players
pay for something other than what they saw, and the refund path in the same paragraph becomes the
common case rather than the exception.

Two concrete hazards. A seeded generator using `Math.random` is not seedable at all. A generator
using floating-point arithmetic in the recipe-to-sprite path is not guaranteed bit-identical
across engines or platforms.

**Fix:** name the PRNG algorithm and pin one implementation shared by client and server. State that
the recipe-to-sprite path uses integer arithmetic only, or pin the float behaviour. Simplest
alternative that removes the whole class of problem: the studio preview calls the server renderer
and displays the returned sprite, so there is only ever one generator.

### A7 — Build order steps 2 and 3 hide that the part library is a prerequisite, not a deliverable

**Severity: minor. Section: §7 steps 2–3.**

Step 2 is "Furni placement from a hand-made starter catalog". Step 3 is "Generator pipeline
producing that same catalog from recipes".

Step 3 can only reproduce step 2's output if step 2's art was authored as generator parts from the
start. Otherwise step 3 is a rewrite of everything step 2 shipped, and the "proves stage 1–4"
claim is unearned — a generator that reproduces art built for it proves nothing.

**Fix:** reword step 2 to "hand-made starter catalog authored as generator parts", which makes the
dependency visible and moves the part-library cost to where it actually falls.

---

## B. Isometric rendering correctness

### B1 — Draw order is never mentioned, and it is the defining hard problem of this genre

**Severity: blocking. Section: §1, absent.**

§1 copies the projection constants and stops. Projection tells you where a sprite goes. It does
not tell you what draws on top of what, and in an isometric world with stacking, multi-tile items,
and avatars walking between furniture, that is the problem that consumes the schedule.

The verified mechanism, so the doc has something to specify against:

`RoomSpriteCanvas.ts:376` — every sprite in the room is sorted every frame:

```ts
this._sortableSprites.sort((a, b) => (b.z - a.z));
```

Descending z, then `createAndAddSprite` appends in ascending index order (line 683 onward), so the
largest z is added first and sits at the back. Painter's algorithm over the whole room, no depth
buffer.

`RoomSpriteCanvas.ts:466-529` — the z fed into that sort:

```ts
let z = vector.z;                                   // object's projected screen depth
if (x > 0) z = (z + (x * 1.2E-7));                  // horizontal tiebreaker
else       z = (z + (-(x) * 1.2E-7));
...
sortableSprite.z = ((z + sprite.relativeDepth) + (3.7E-11 * count));  // per-sprite offset + stable epsilon
```

`FurnitureVisualization.ts:302-315` — where `relativeDepth` comes from:

```ts
relativeDepth = this.getLayerZOffset(scale, this._direction, layerId);
relativeDepth = (relativeDepth - (layerId * 0.001));
...
sprite.relativeDepth = (relativeDepth * FurnitureVisualization.DEPTH_MULTIPLIER);  // sqrt(0.5)
```

Two consequences the doc must absorb.

First, `vector` comes from the object's **single** location. A multi-tile furni gets one base depth
from its origin tile, not one per occupied tile. Correct occlusion for multi-tile items is
therefore entirely a function of **hand-authored per-layer z offsets**. Habbo does not solve
multi-tile depth generally — it hides the problem in art data. A procedural generator has no
artist to hide it in, so the generator must **compute** those offsets from the archetype's
footprint and each part's position within it. Nothing in §2 says how.

Second, the epsilon terms (`1.2e-7` horizontal, `3.7e-11` per sprite index) exist to make the sort
stable and deterministic when depths tie. Reimplementing the sort without equivalent tiebreakers
produces z-fighting that flickers between frames as sort order changes.

**Fix:** add a §1 subsection "Draw order" stating the sort key, the tiebreaker policy, and — the
part that is genuinely new work — the rule by which the generator derives per-layer z offsets from
footprint geometry. Then add a rendering-correctness gate to §2 stage 4 that renders each generated
item against a reference scene of stacked and adjacent items and diffs the result.

### B2 — Seating draw order is the specific place the recipe model breaks, and the spec has no field for it

**Severity: blocking. Section: §2 stage 1, §1.**

The archetype spec has "seat/lay points". A seat point tells the server where to put the avatar. It
says nothing about draw order, and draw order is the whole difficulty.

Verified constants from `AvatarVisualization.ts:29-31`:

```
AVATAR_SPRITE_DEFAULT_DEPTH = -0.01
AVATAR_SPRITE_LAYING_DEPTH  = -0.409
AVATAR_OWN_DEPTH_ADJUST     =  0.001
```

An avatar sitting on a chair occupies the same tile as the chair, so both get the same base `z`
from the geometry. The avatar's sprite lands at `z - 0.01`. The chair's layers land at
`z + (layerZOffset - layerId × 0.001) × sqrt(0.5)`.

For the chair's back to occlude the sitting avatar, that layer's total must sort **after** the
avatar — smaller z, drawn later, on top. Solving for the authored value:

```
(zOffset − layerId × 0.001) × 0.7071 < −0.01
zOffset < −0.0141 + layerId × 0.001
```

And here is the part that breaks composition: **the required sign flips with direction.** When the
chair faces the camera, its back is behind the avatar and needs a positive offset. When it faces
away, the back is in front of the avatar and needs a negative one. So a chair is not one sprite per
direction — it is a **layer split into front and back groups whose depth assignment is a function
of direction**, and the split point depends on the seat position within the part geometry.

A hand artist does this by eye in four passes. A generator must derive it. The doc's part-slot model
("legs, seat, back, arms…") has no notion of which slots fall in front of an occupant, and stage 3's
metadata has no field to record it.

**Fix:** add an occlusion-group field to the archetype part-slot spec — each slot declares whether
it renders in front of or behind a seated occupant, per direction — and add the derived per-direction
layer depths to stage 3's output. Add a gate to stage 4 that renders every seating item with a test
avatar in all four directions and diffs against a reference.

### B3 — §1's direction rule is correct for avatars and wrong for furni

**Severity: major. Section: §1 bullet 3.**

> "Avatar and furni facing: **8 directions, 5 drawn** — directions 4, 5, 6 are horizontal mirrors."

The avatar half is right. `DIRECTION_IS_FLIPPED = [false, false, false, false, true, true, true,
false]` lives in `src/api/nitro/avatar/enum/AvatarDirectionAngle.ts` — the avatar subsystem — and is
consumed by the avatar renderer only.

The furni half is wrong on both counts.

**Direction count.** `Item.java:124` sets `this.rotations = 4` as the default, overridden per item
from a `rotations` column. Furni are authored in the directions the item needs, and 4 is the norm,
not 8.

**Mirroring.** Furni sprites are not mirrored by direction index. `FurnitureVisualization.ts:286`
reads the flip straight off the asset record:

```ts
sprite.flipH = assetData.flipH;
```

That comes from `IAsset.flipH`, a per-asset boolean in the bundle's `assets` map paired with a
`source` field naming the asset being mirrored. Mirroring is an **authoring decision recorded per
asset**, applied where the art permits it. Direction resolution is separate: `getValidDirection`
(`SizeData.ts:165-190`) snaps the requested angle to the nearest direction that was actually
authored.

The error matters because A4's arithmetic depends on it. The doc's "37% saving on every clothing
item" (research §4.3) is an avatar result and does not transfer to furni.

**Fix:** split the bullet. "Avatars: 8 directions, 5 drawn, directions 4–6 mirrored. Furni: 4
authored directions by default, per-item override, with mirroring declared per asset where the art
is symmetric."

### B4 — Mirroring and "one light direction" are mutually exclusive as stated

**Severity: major. Section: §1 bullet 3 against §2 stage 2.**

§2 stage 2 mandates "one light direction" across the whole style system. §1 mandates mirroring
directions 4–6.

Flipping a sprite horizontally flips its shading. A highlight authored on the top-left appears on
the top-right. In a scene where every other object is lit from the top-left, that reads as a
rendering bug, and it reads worst on exactly the large flat surfaces — table tops, sofa cushions —
that carry the style.

Habbo tolerates this on avatars because avatar art is close to flat-shaded with minimal directional
lighting. A furni style that commits to a light direction with real highlights and cast shading
cannot mirror.

The two constraints are in different sections of the same document and were never reconciled.

**Fix:** pick one. Either state that the style is flat-shaded with no directional highlight, and
mirroring is a global rule — or state that mirroring is a per-part authored flag set only on parts
whose shading is horizontally symmetric, and drop the blanket claim in §1.

### B5 — Pathfinding is named in neither document

**Severity: minor. Section: §7 step 1.**

Build order step 1 is "Room render + avatar walk + chat". Avatar walk on a heightmap with variable
tile heights, blocked tiles, furni stack heights, and `allow_walk` / `allow_sit` per item
(`Item.java:84-87`) is a real pathfinding problem with a climb-delta rule and a door special case.
Neither document mentions it. GAME.md open question 4 flags netcode prototyping but not pathing.

**Fix:** add pathfinding to step 1's description with its inputs named — heightmap, per-tile blocked
state, furni stack heights, and the per-item walk and sit flags.

---

## C. Services sketch

### C1 — Currency and item ownership live in different services with no stated transaction protocol

**Severity: blocking. Section: §5 table and closing paragraph.**

The table puts currency in the Economy ledger and the marketplace order book in Catalog/asset. The
paragraph below promises:

> "The ledger's append-only log plus item instance IDs with ownership history is the defense. Item
> state changes are transactions, never client-reported."

Every economically meaningful action mutates both sides. A catalog purchase debits Stars and creates
an item instance. A marketplace sale transfers an instance and credits the seller net of commission.
A trade transfers instances between two inventories. A minted design's first sale splits a payment
between a creator, a sink, and an inventory grant.

"Transactions" across two services is a distributed transaction, and the doc names no protocol. The
failure it invites is exactly the one GAME.md is most afraid of: a partial commit that credits the
currency and loses the item, or grants the item and loses the debit. That is duplication by
accident rather than by exploit, and Coke Music v2 died of duplication (coke-music.md §5).

The doc also never says **where item instances live**. The sentence implies the ledger, the table
implies Catalog. That ambiguity sits on the most security-critical data in the product.

**Fix:** one design decision, stated in one sentence. Either put the currency ledger and the item
instance table in the same database so a purchase is one local ACID transaction — the right answer
at this scale — or specify the outbox pattern with idempotency keys and name the reconciliation job
that detects and repairs divergence. Then state which service owns item instances.

### C2 — The ledger's problem is availability coupling, not throughput

**Severity: major. Section: §5 table, Economy ledger row.**

The brief asked about ledger throughput and contention. Both are non-problems, and saying so is more
useful than inventing a scaling concern.

The arithmetic, from GAME.md's own caps. Votes pay 5 Stars against a 350/day cap, so at most 70 vote
events per player per day. Add 3 scored plays per solo game, dailies capped near 100 Stars, some
purchases and trades. Call it 150 ledger writes per active player per day. At 10,000 daily actives
that is 1.5 million writes per day, roughly 17 per second averaged and perhaps 100 per second at
peak. A single Postgres instance handles that without tuning. Contention is likewise fine — the
daily caps are per-account read-modify-write, which shards perfectly by account id.

The real risk is that **everything** posts here. Purchases, vote payouts, minigame settlement, trade
commissions, minting fees, refunds. The doc never states what happens when the ledger is
unavailable.

The answers differ by path and the difference is a product decision, not an ops one. A failed
purchase is an annoyance and should fail closed. A failed **vote payout** destroys earned income
that the player cannot re-earn, because GAME.md's vote-once-ever rule means the vote is spent. A
failed minigame settlement after a match is worse still.

**Fix:** add a degradation policy row. State that rooms, chat, and movement have no ledger
dependency and keep running. State that vote and match results are queued durably at the room or
minigame service and settled asynchronously with an idempotency key, so a ledger outage delays
payment rather than destroying it. Then delete any implication that the ledger is a throughput risk.

### C3 — Presence and the friends console crossing shards is named and never designed

**Severity: major. Section: §5 table, Social service row.**

The row reads "Friends, groups, badges, messaging" with the note "Room-independent". GAME.md
requires a friends console with online status and room-independent messaging.

Online status is not room-independent. Presence originates on the room server holding the player's
session, and it has to reach every friend wherever they are. The doc places the friends console in a
service that has no stated connection to the room servers where the truth lives.

The fan-out is real. Habbo's free tier carries 300 friends (habbo-hotel.md §2.2). One login event
notifies up to 300 subscribers, each on an arbitrary shard. With mutual friendship, a wave of
logins produces traffic proportional to the square of the friend-graph density inside the active
population.

**Fix:** name a presence service explicitly, with room servers publishing session state to it and
clients subscribing to their friend set through it. State the subscription model — a client
subscribes once to its friend list rather than each friend notifying each friend — and state the
status granularity, because "online / offline" is far cheaper than "online and in room X".

### C4 — Rooms hold player property and have no durability story, while minigames do

**Severity: major. Section: §5 closing paragraphs.**

§5 makes a hard requirement of minigame durability: "match state that survives a process restart,
client reconnect windows, and no game-critical data outside version control and backups."

Rooms get no equivalent sentence, and rooms hold something more valuable than a match. The room
server row says "Authoritative room instances: movement, chat, furni state". Furni state **is** the
player's property, the thing they spent days of capped earnings on, arranged, and are judged on by
GAME.md's room competitions.

Unanswered: when is furni placement written through to durable storage, on every move or on a
timer? If a room process dies, does the room revert to its last persisted arrangement? Does the
player lose an hour of decorating?

Reconnect has the same gap. Minigames get reconnect windows. A room WebSocket drop means the avatar
vanishes from other clients' views and the reconnecting client needs a full room state resync —
occupants, positions, postures, every furni instance and its state. That resync is a protocol design
task nobody has been assigned.

**Fix:** apply the §5 durability paragraph to room servers verbatim. State the furni-state write
policy — write-through on every mutation is correct here, because the write rate is low and the data
is irreplaceable. State the room reconnect window and the resync message.

### C5 — "Results signed to ledger" is a word, not a design, and it is replayable as written

**Severity: major. Section: §5 table, Minigame services row.**

> "One authoritative service per game family, results signed to ledger. Never trust client scores."

A signature proves the minigame service produced the result. It does not prove the result has not
been submitted before. Without a nonce or an idempotency key, a captured signed result replays for
repeated payout, and it replays with a valid signature — so the defence the sentence describes is
the thing that makes the exploit hard to detect.

The doc is otherwise careful about duplication. This is the same class of bug, in the faucet.

**Fix:** replace "signed" with the actual requirement: each result carries a unique match id, the
ledger enforces at-most-once settlement per match id, and settlement is idempotent so a retry after
a timeout pays once. Name who holds the signing key and how it rotates.

### C6 — No gateway or room router is named

**Severity: major. Section: §5 table, Room server row.**

"One process shards many rooms" describes the shape and skips the mechanism. Nothing says how a
client discovers which process holds room N, what happens when a process is drained for deploy, or
how a room moves between processes.

This connects directly to the doc's own hard constraint. §5 elevates migration durability above
operational concern, citing Battle Ball and Key Quest. A room server deploy is a migration that
happens every week, and there is no story for it.

**Fix:** name a gateway or room-directory service that maps room id to process and holds the client
connection. State the drain procedure — new joins routed away, existing rooms either drained on
emptiness or moved with a state handoff — and pick one.

### C7 — Catalog/asset bundles three services with incompatible profiles

**Severity: minor. Section: §5 table, Catalog/asset row.**

"Recipes, bundles, marketplace order book" with "CDN in front of sprite bundles" puts an immutable
static asset store, a recipe registry, and a live financial order book with matching and settlement
behind one name. Those have different consistency needs, different latency budgets, different
scaling curves, and different blast radius when they fail.

**Fix:** split the marketplace into its own row. It is the piece with money in it and it belongs
next to the ledger, not next to the CDN.

### C8 — GAME.md reserves Wired-class architecture from day one and PIPELINES.md does not mention it

**Severity: major. Section: §5, absent.**

GAME.md is explicit:

> "Reserved for later, architecture planned from day one: programmable rooms (a Wired-class system).
> Retrofitting variables and signals is very hard."

PIPELINES.md is the architecture document. Its room server row reads "movement, chat, furni state"
and nothing else. The commitment is made in one document and not honoured in the other.

The reservation is not cosmetic. habbo-hotel.md §1.6 documents 23 triggers, roughly 40 effects, 25
conditions, 24 selectors with union and intersection semantics, and scoped variables with
arithmetic. That is a per-room deterministic rules engine with a scheduler, and research §6 item 10
flags Wired's execution semantics under load as "the highest-value remaining unknown". Retrofitting
a scheduler and a variable store into a room server built without them is the rewrite GAME.md is
trying to avoid.

**Fix:** add a sentence to the room server row naming the reservation — furni state changes flow
through an event bus with a defined ordering guarantee, and room objects carry an extensible
key-value state bag — so the later system has somewhere to attach.

---

## D. Music system

### D1 — "Server schedules playback" understates the work by a whole subsystem

**Severity: major. Section: §4 final bullet.**

> "Server schedules playback to a room so all listeners hear the same song at the same offset."

There is no shared clock between browsers. Making this true requires clock-offset estimation per
client — repeated timestamped round trips, the Cristian or NTP approach — then scheduling against
the local `AudioContext.currentTime` with `AudioBufferSourceNode.start(when, offset)`.

Achievable accuracy is tens of milliseconds, dominated by round-trip jitter and by output latency
the page cannot always measure. Chrome and Firefox expose `AudioContext.outputLatency` so it can be
compensated. Safari historically does not, so Safari clients carry an uncompensated hardware buffer
offset.

Tens of milliseconds is fine for the stated goal — everyone hears the same song at the same place.
It is **not** fine for anything beat-locked across clients, and Coke Music's venues had animated
speakers reacting during performances (coke-music.md §3.2). Reactions on beat will visibly disagree
between clients.

**Fix:** replace the bullet with the mechanism and an accuracy target. "The server broadcasts (song,
bank, start time in server clock). Clients estimate their offset from the server clock by round-trip
sampling and schedule against `AudioContext.currentTime`. Target alignment within 50 ms. Visual
reactions are triggered by song section, not by beat."

### D2 — Browser autoplay policy means a player entering a room hears nothing

**Severity: major. Section: §4, absent.**

`AudioContext` is created in the `suspended` state and requires `resume()` from inside a user
gesture handler. This is the autoplay policy in Chrome and Safari and it has no workaround.

Walking an avatar into a room is not a user gesture. So the first performance a player witnesses is
silent, and the loop GAME.md calls its earning path — "perform on public stages, audience votes" —
fails at the moment it matters most, for every new player.

**Fix:** state that the client requires an explicit audio-enable interaction, and design where it
lives — a one-time prompt at login is better than a per-room one, because it also lets the audio
context be created before the first room join.

### D3 — Sample bank preload and decode memory are unaddressed

**Severity: major. Section: §4.**

Playback cannot start until the client has fetched and decoded the bank. The doc has no preload
policy and no statement of what a player joining mid-performance hears.

The memory is not trivial. A 4-second stereo sample at 44.1 kHz decoded to Float32 occupies
4 × 44100 × 2 × 4 ≈ 1.35 MiB. Coke Music's library was 114 samples averaging near 3 seconds
(coke-music.md §1.2), so a fully decoded equivalent library is roughly 115 MiB resident, in a tab
that is also holding sprite atlases for a room.

Per bank it is manageable — 7 banks over 114 samples is about 16 samples each, near 16 MiB — but
only if a song is confined to one bank. §4 says the banks "share tempo and key families" and that
"any combination within a bank stays coherent", which reads as bank-confined without saying so.
Coke Music itself let all 5 tracks draw from the whole 114-sample library.

That ambiguity decides the client's memory budget and the preload size.

**Fix:** state whether a song is bank-confined. If yes, say so and load one bank at a time. State
the join-mid-song behaviour — silence until the bank is ready is acceptable if it is a decision
rather than an accident.

### D4 — Sample licensing needs a decision before anything is commissioned, and the doc conflates two very different postures

**Severity: blocking. Section: §4 first bullet.**

> "Commission or license the banks the way Sulake used DJ Orkidea."

Those are not alternatives with similar consequences.

**The banks will be extracted.** This is not speculation. coke-music.md §4.4 records that Mark
Hughes' recreation ships "all 114 samples as `.wav`", extracted from a client that shipped them 20
years ago. Any bank shipped to a browser is downloadable, decodable, and republishable. Standard
sample-pack licences commonly forbid redistribution in a form from which the samples can be
extracted — which is precisely and unavoidably what this product does.

**Player songs are derivative works of the samples.** A player's song is a recipe referencing bank
samples, GAME.md makes it a tradeable CD item, a chart entry, and the basis of Gold and Platinum
Record trophies. If the sample licence is term-limited or revocable, its expiry destroys every
player song, every chart position, and every trophy retroactively. That is the same class of loss
as the Battle Ball and Key Quest migrations this document is built to avoid, arriving through the
contract instead of the server move.

**Fix:** delete "or license". State the requirement: banks are commissioned work-for-hire, or
licensed under a perpetual, irrevocable, worldwide, sublicensable grant that expressly contemplates
distribution in extractable form and the creation of derivative works by end users. Get that in
writing before the first bank is commissioned, because it cannot be fixed afterwards.

### D5 — The sequencer's serialization format is the hardest thing here to change later

**Severity: minor. Section: §4 third bullet.**

"Song serialization: compact recipe (bank + sample + step bitmap per track), a few hundred bytes."

A step bitmap is implicitly tied to the step count, and §4 says the step grid "scales to sample
length". So the format encodes the current sample durations. Change one sample's length later and
every stored song using it decodes to the wrong rhythm. Coke Music's own exported song blob is
undocumented today for exactly this reason (coke-music.md open question 3).

GAME.md's non-goals correctly defer mobile, so mobile audio is out of scope. This format is the one
music decision that outlives that deferral.

**Fix:** version the song blob and store step positions as fractions of the song timeline rather
than as indices into a sample-length-derived grid. See F1 — this is the same failure as the recipe
format.

---

## E. Moderation pipeline

### E1 — A filter service in the chat hot path has an unstated failure mode, and both answers are bad

**Severity: major. Section: §5 table, Moderation service row.**

> "Filter is one shared service so every surface behaves the same."

The consistency goal is right. The mechanism defeats it.

GAME.md requires the filter on chat "everywhere including private rooms". So every chat line
becomes a synchronous network call from the room server before the message can be delivered. That
adds a round trip to the most latency-sensitive interaction in the product, and it creates a hard
dependency with no stated behaviour when the dependency fails.

Both answers are unacceptable as defaults. Fail open and unfiltered chat reaches minors, which is
GAME.md Pillar 6's stated existential risk and Habbo's actual 2012 near-death. Fail closed and chat
stops globally when one service restarts.

Habbo's real architecture is the resolution: a fast local filter plus Community Sift doing
asynchronous machine-learning scoring on top (habbo-hotel.md §2.4). The scoring is the service. The
substitution is local.

**Fix:** restate the row. The filter is a **versioned ruleset artifact** built and distributed by
the moderation service and evaluated in-process on every room server, so the hot path is local and
every surface still behaves the same because every surface loads the same artifact version. The
moderation service owns ruleset builds, distribution, asynchronous scoring, the report queue, and
the audit log.

### E2 — Image screening of player mints is both weak and, if the constraint story is honest, unnecessary

**Severity: major. Section: §2 stage 5.**

> "rendered sprite through image screening, then human review queue for flagged items."

Two problems.

The mechanism is weak. Commercial image classifiers are trained on photographs. A 64×32 pixel-art
sprite is far outside that distribution. More to the point, the abuse vector for pixel art is not
what those classifiers detect — it is hate symbols, flags, and text rendered as pixels, none of
which is nudity detection's job.

The mechanism is also mostly unnecessary, **if** §2's central claim is true. The whole argument of
the pipeline is that output is composition over a curated part library. If the library contains no
offensive parts, the output space is bounded and screening has nothing to find. The exception is
§2's own carve-out: "genuinely procedural classes — rugs, wallpaper, flooring, tile patterns — can
use constrained symmetric pattern generators". A free-form pattern generator over a free palette on
a rug is a flag generator. That is where the risk actually lives, and it is a constraint problem,
not a classifier problem.

The doc does not say which world it is in.

**Fix:** two sentences. State that composed furni from the curated library needs no image screening,
because the part library is the gate. State that pattern generators are constrained to symmetric
generators over a fixed palette subset, with no free-form pixel placement, and that this constraint
is the moderation mechanism for the procedural classes. Keep names and descriptions as the human
review gate, since those are the real vector and the doc already routes them correctly.

### E3 — Room watch is the highest privacy-risk feature in the product and is one table cell

**Severity: major. Section: §5 table, Moderation service row.**

"report queue, room watch, audit log" names three tools and designs none.

Room watch means a moderator reading a live room's chat from outside the room, including private
and password-locked rooms, which GAME.md's filter-everywhere rule already implies is in scope. That
is a cross-shard subscription to private conversation. It needs its own authorization model, its own
audit trail separate from the general one, and a stated retention policy for what a moderator sees.

Coke Music shipped exactly this — "moderators had tools to watch several rooms simultaneously"
(coke-music.md §3.5) — so the precedent is real. That makes it a build item, not an aspiration.

The report queue has the same problem in the other direction. GAME.md promises one-click Call for
Assistance on every screen routed to staffed moderation, and pays for paid moderators. Nothing
states the queue's SLA, its routing, or its tooling, and staffing cost is a direct function of
those.

**Fix:** give room watch its own row with an authorization model, a separate audit log, and a
retention policy. Give the report queue a stated response-time target, because that number sets the
moderation headcount and GAME.md commits to paying for it.

### E4 — Moderation appears nowhere in the build order

**Severity: minor. Section: §7.**

GAME.md Pillar 6 is "Moderation is a core feature". §7's eight build steps contain no moderation
work at all. Step 1 ships chat, and chat needs the filter on day one.

**Fix:** add the filter to step 1 and the report queue and room watch before any public test.

---

## F. Data formats, versioning, and migration

### F1 — The doc names migration death as a hard constraint and specifies no versioning for any of its three formats

**Severity: blocking. Section: §5 final paragraph against §2, §3, §1.**

§5 is unambiguous:

> "Migration durability is a hard constraint, not an operational afterthought."

Then §2, §3, and §1 define three long-lived data formats — recipes, figure strings, and text
heightmaps — with no version field, no migration policy, and no compatibility rule between them.

**Recipes are the severe case.** §2 says "Recipes are small, deterministic, and cheap to store.
Sprites render from recipes and cache forever." If the recipe is the stored representation and the
sprite is derived, then editing any part sprite, any palette ramp, or any generator behaviour
silently changes **every item that references it** — including items players bought, traded, and
were paid for. GAME.md's serial-numbered limited editions make this worse: their entire value is
identity, and a regenerated sprite is a different object wearing the same serial.

"Cache forever" is doing enormous unstated work. A cache that can never be invalidated is not a
cache. It is a frozen artifact with no name and no policy.

**Fix:** three sentences.

1. Every recipe stores a generator version and a content hash of the part library it was rendered
   against. A render is reproducible only within a pinned pair.
2. Publishing an item **freezes its rendered bundle**. The bundle becomes the item's identity. The
   recipe demotes to provenance metadata and to the seed for derivative designs.
3. Every published item stores the hash of its rendered output, so a re-render that disagrees is a
   detected error rather than a silent visual change to something a player owns.

### F2 — Figure string set IDs need an append-only rule stated

**Severity: major. Section: §3.**

A figure string is `type-set-color` triples referencing global set ids. Every stored avatar,
every saved outfit, and every design entered in an outfit chart is a set of integer references.

Mutating set 210 changes the appearance of every avatar wearing it, retroactively and silently.
Reusing a retired set id is worse, because it puts a different garment on players who never chose
it. Habbo survives 25 years of this by never mutating `figuredata` sets. The doc does not say so.

**Fix:** one sentence in §3. Set ids are append-only and never reused. Retiring a garment sets a
flag and never deletes the record. Stored figure strings carry the figuredata version they were
authored against.

### F3 — The heightmap format has no version field, no extension point, and a reference parser that fails silently

**Severity: major. Section: §1 final bullet.**

§1 adopts the text heightmap verbatim. Two problems come with it.

**Silent failure.** Verified in `RoomLayout.java:112-121`:

```java
if (modelTemp[y].isEmpty() || modelTemp[y].equalsIgnoreCase("\r")) {
  continue;                                    // empty row skipped entirely
}
for (short x = 0; x < this.mapSizeX; x++) {
  if (modelTemp[y].length() != this.mapSizeX) {
    break;                                     // short row: rest of row left null
  }
```

A short row breaks out and leaves `roomTiles[x][y]` null for the remainder. Those nulls then flow
into pathing and placement. A malformed room loads as a subtly broken room rather than as an error.
Copying the format verbatim imports this behaviour.

**No extension point.** The encoding is one character per tile, so it carries exactly one value:
height, capped at 35. Habbo needed door coordinates, door direction, and wall height, and had to
add them as **sidecar columns** on `room_models` because the string could not carry them. Any future
per-tile attribute — material, no-stack, no-walk, a Wired trigger region — hits the same wall. GAME.md
promises custom floor plans and reserves a Wired-class system, so those attributes are coming.

Custom floor plans also make the heightmap **untrusted input** crossing a system boundary, needing
size limits, a connectivity check from the door tile, and rejection of unreachable regions.

**Fix:** keep the text format for authoring, because §1 is right that it is diffable and
human-editable. Store a room as a versioned structured document with the heightmap text as one
field, so per-tile attribute layers can be added later without a format migration. Write a
validator that **rejects** malformed input rather than skipping it, and state that the validator
runs on every custom floor plan before it reaches the server.

---

## G. GPL contamination

### G1 — "Reference formats only" is a conclusion, not a process

**Severity: major. Section: §5 client paragraph.**

> "nitro-renderer and Arcturus are **format references only** — GPL/AGPL forbids copying code into
> this project."

The legal conclusion is right. The risk it addresses is unmitigated, because the doc states a rule
and no mechanism for keeping it.

The conditions here are the worst case for accidental copying. Same language (TypeScript), same
framework (PixiJS), same problem domain, and a reference implementation that is the best-documented
artifact of how this genre renders. A contributor solving the sort-order problem will read
`RoomSpriteCanvas.ts`. A 20-line geometry function transcribed from it is a derivative work, and it
is invisible in code review because it looks exactly like the correct solution — which it is.

Licences verified via the GitHub API on 2026-08-03:

| Project | SPDX |
|---|---|
| `billsonnn/nitro-renderer` | GPL-3.0 |
| `billsonnn/nitro-converter` | GPL-3.0 |
| `billsonnn/nitro-react` | **none declared** |
| `Quackster/Havana` | AGPL-3.0 |

The doc's phrase "GPL/AGPL" misses that nitro-react declares **no licence at all**. No licence means
all rights reserved, which is stricter than GPL, not looser. A contributor reading the doc would
reasonably assume nitro-react sits under the same permission as the others.

**Fix:** replace the sentence with a process. Constants and file formats are facts and may be
copied. Implementations may not. One person reads the reference and writes a plain-language spec.
A different person implements from the spec without opening the reference. Record which files were
written under that split. Add nitro-react to the list explicitly, marked no-licence.

### G2 — Adopting "the `.nitro` shape" imports the risk and buys nothing

**Severity: minor. Section: §2 stage 6.**

> "Asset bundle (sprite sheet + JSON, the `.nitro` shape) to CDN"

The only reason to adopt a foreign container format is interoperability. This project generates all
its own assets and will never load a Habbo bundle. So the format buys no interop, and it is the one
format whose only reference implementation — `nitro-converter` — is GPL-3.0 and stale since
December 2022.

**Fix:** define the project's own bundle format. It needs a spritesheet, a per-layer offset and
depth table, animation sequences, and a metadata block. Borrow the *schema shape* freely, since
that is a set of facts, and stop naming the file format after someone else's tool.

---

## H. Missing infrastructure

Only items the docs' own stated goals require are listed.

### H1 — There is no auth or accounts service anywhere in either document

**Severity: blocking. Section: §5 table, absent.**

Six services are listed. None is identity.

GAME.md depends on accounts in at least six places. Anti-abuse requires "one account per person
policy" and "device/payment-free alt heuristics" — both are identity systems. Usernames are
permanent and filtered, which is a registration flow with a moderation gate. The registration
faucet grants Stars once per account, which requires knowing what an account is. The vote-once-ever
rule, GAME.md's single most important economic constraint, is enforced per identity. Permanent bans
wipe an account.

The entire anti-abuse posture rests on a service that no document names.

**Fix:** add an identity service row. State what it owns — registration, credentials, session
tokens, the permanent username, ban state, and the alt-detection signals. State how room servers
and every other service authenticate a session, because that is the seam everything else crosses.

### H2 — "Backups" appears as a noun with no RPO, no RTO, and no restore drill

**Severity: major. Section: §5 final paragraph.**

> "no game-critical data outside version control and backups"

The failure this sentence cites is Key Quest, which died "because the key files needed to run it
were lost in the transition" (neopets.md §3). That is not a missing-backup failure. It is an
untested-restore failure. Backups almost certainly existed. Nobody had proven a restore worked.

A backup you have never restored is a belief, not a backup. Configured is not enforced.

**Fix:** state a recovery point objective and a recovery time objective for each durable store, and
require a scheduled restore drill into a scratch environment whose success is the only evidence that
counts. Put the drill on the calendar in the same document that names migration durability a hard
constraint.

### H3 — No persistence layer is named

**Severity: major. Section: §5 table, absent.**

The only mention of storage is "catalog entry to DB" in §2 stage 6. Nothing says which store holds
the ledger's append-only log, item instances and their ownership history, room furni state, avatar
figures, or the friend graph.

This is not a premature-optimization complaint. C1 shows that whether the ledger and the item table
share a database determines whether a purchase is one local transaction or a distributed one — the
single most consequential architectural decision in the economy.

**Fix:** add a storage column to the §5 table naming the store per service, and state which
services share a database. That one column resolves C1.

### H4 — No observability, though the ledger promises anomaly detection

**Severity: major. Section: §5 table, Economy ledger row.**

"anomaly detection" is listed as a ledger responsibility. Anomaly detection is a metrics pipeline, a
baseline, alerting, and someone to route alerts to. None of that exists in the document.

GAME.md's collusion warning compounds it: "Audit every faucet for 'can a group manufacture value
from nothing.'" Auditing a faucet means querying it over time, which means the data has to be
collected before the exploit rather than after.

**Fix:** add an observability row. State the minimum — per-faucet Star issuance over time, per-sink
absorption, ledger write latency and error rate, room server population and tick health, and
WebSocket connect and reconnect rates.

### H5 — No deploy or rollout story for room servers

**Severity: minor. Section: §7, absent.**

The build order ends at feature 8. Nothing describes how any of it reaches production or how a room
server is updated without dropping every player standing in a room. This is C6's drain question from
the operational side.

**Fix:** one line in §7 stating that room drain and rolling deploy ship with step 1, not after step
8, because every later step inherits it.

---

## What is right and should not change

Skepticism is only useful if it discriminates. These decisions are correct and well-evidenced.

- **Copying the projection constants verbatim.** The 2:1 dimetric grid on integer pixels is
  verified from source and the `sqrt(1/2)/sqrt(3/4)` correction genuinely is what lands the height
  unit on exactly 32 px. Constants are facts and carry no licence risk.
- **Part composition over free pixel generation.** The reasoning from Coke Music's 114 curated
  samples is sound and the failure mode of the alternative is well established.
- **Two authored art scales, no runtime downscale.** Correct for pixel art, and matching Habbo's
  `h`/`sh` split.
- **Ramp-indexed color rather than hue rotation.** Correct, and it is what makes palette swapping
  cheap and consistent.
- **Testing gates with staged bad inputs** (§2 stage 4). This is the right instinct and it is stated
  more rigorously than most of the document.
- **Append-only ledger with item instance ids and ownership history.** The right defence against the
  duplication failure that killed Coke Music v2. C1 is a gap in how it is wired, not in the idea.
- **Naming migration durability a hard constraint.** The evidence is strong and the conclusion
  follows. F1 and H2 are complaints that the document does not act on its own finding.
