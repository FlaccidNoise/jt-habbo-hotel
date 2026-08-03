# Plan ↔ spec fidelity audit

**Subject:** [docs/plans/2026-08-03-v1-vertical-slice.md](../plans/2026-08-03-v1-vertical-slice.md)
**Against:** [design/GAME.md](../design/GAME.md), [design/PIPELINES.md](../design/PIPELINES.md) (authoritative),
[design/SAFETY-LEGAL-PARKED.md](../design/SAFETY-LEGAL-PARKED.md) (deliberately parked),
[review/TRIAGE.md](TRIAGE.md), [decisions/INDEX.md](../decisions/INDEX.md).
**Lens:** fidelity and scope honesty. Parked-safety omissions are out of scope and not reported.
**Date:** 2026-08-03.

Counts: **9 major, 17 minor.** Line numbers cite the plan unless a design doc is named.

The plan's central scope claim is line 15: *"this plan is build-order steps 1–2 only."* Measured
against PIPELINES §7, step 1 is missing rolling deploy, room drain, the door special case and
furni stack heights in pathfinding; step 2 is missing the café public room, focus states, and the
"authored as generator parts" clause on the starter catalog. None of those appear in the plan's
deferred list (lines 563–565). That is the finding pattern: the work the plan does do is largely
faithful, and what it drops it drops silently.

---

## Major

### F-01 — No café room, and spawn is not the lobby café

**Plan:** Task 6 line 341 seeds exactly one room — `room 1 "The Casino Floor"`. Task 7 line 395:
"New occupants spawn at the door tile."
**Design:** GAME.md line 396 — *"0:01 — Spawn is the lobby café, not the private room. Day one
starts where people are."* PIPELINES §7 step 2 line 207 — *"Casino-floor **and café** public
rooms."* GAME.md line 310 (density funnel) names *"the casino floor as the anchor space, one café,
one lounge stage."*

**Divergence.** The only public space in the slice is the casino floor. The café — named in the
build step the plan claims, in the density funnel, in the first-session script, and in
§Ambient co-presence (line 374, focus rooms are *"café and library spaces"*) — does not exist and
is not listed as deferred. Secondary effect: seeding the casino as the sole and first space
inverts the theme hierarchy rule (GAME.md line 24, *"the casino is a venue inside the resort, never
the economy's center of gravity"*; decisions/INDEX.md *"Theme: casino resort, resort-first"*). The
first thing anyone will ever see of The Grand is a casino floor with no resort around it.

**Fix.** Seed a second room `"The Lobby Café"` in Task 6's seed (same 12×12 stock heightmap, a
different tile palette) and make it the default `roomId` the client joins on login. This is one
extra seed row and one constant. Alternatively add an explicit deviation note stating the café
moves to the step-3 plan and that spawn-at-casino is a temporary prototype choice.

---

### F-02 — Focus states are absent and unmentioned, and the chat model cannot express focus rooms

**Plan:** no sit action anywhere. `canSit` is declared in `FurniDefSchema` (line 238) and consumed
by nothing. `SPEAK_RADIUS = 5` is a module-level constant (line 376). Deferred list (563–565) does
not mention focus states.
**Design:** PIPELINES §7 step 2 line 207 — *"Casino-floor and café public rooms, **focus states**."*
GAME.md §Ambient co-presence lines 370–377: focus prop (laptop, book, sketchpad), visible
do-not-disturb bubble, focused players do not idle-sleep, and *"Focus rooms: café and library
spaces tuned for lurking — **short Speak radius, no Shout**."* decisions/INDEX.md —
*"Co-working: ambient co-presence in v1."*

**Divergence.** Two levels. The feature is absent with no deferral note. And the data model
forecloses it: a module constant `SPEAK_RADIUS` cannot carry a per-room speak radius, and there is
no per-room chat config to disable Shout, so focus rooms are not a later addition to this design —
they are a rewrite of the chat path. Sitting is likewise unmodelled: `AvatarStateSchema`
(lines 244–246) has `x, y, dir` and no posture, so `canSit` can never be honoured.

**Fix.** Either (a) move the speak radius and a `shoutAllowed` flag into the room record's `doc`
JSON now (near-free — the doc already exists, Task 6 line 337) and add `posture: "stand" | "sit"`
to `AvatarStateSchema`, deferring only the props and DND bubble; or (b) state plainly in the
deferred list that focus states move to a later plan and revise line 15 to "step 1 plus part of
step 2."

---

### F-03 — Connection durability (drain, rolling deploy, reconnect, resync) dropped from a step it is explicitly assigned to

**Plan:** Task 8 line 422 — *"One `Room` instance per roomId, created lazily, disposed when
`occupantCount()` hits 0."* No deploy story, no reconnect handling, no resync message in the
`ServerMsg` union (lines 263–279).
**Design:** PIPELINES §7 step 1 line 205 — *"Rolling deploy and room drain ship here **because
every later step inherits them**. (audit H5)"* §5 Gateway row line 158 — *"drain procedure (new
joins routed away, rooms drained on emptiness or handed off)."* §5 Room server row line 157 —
*"Reconnect window + full-state resync message specified. (audit C4, C8)."* §5 line 188 —
*"Migration durability is a hard constraint… Match and room state survive restarts, clients get
reconnect windows."*

**Divergence.** Dispose-at-zero-occupants is *unload*, not *drain*: nothing routes new joins away
from a draining room, nothing hands a populated room off, and a deploy drops every connected
player. A disconnect is an unconditional `leave` — there is no reconnect window and no message
that could resend room state to a returning client. All four items are silent; none is in the
deferred list. This is the item PIPELINES gives a reason for shipping early, and the reason is that
retrofitting it costs more later.

**Fix.** Add one task: a `resync` server message carrying the same payload shape as `room_state`;
a disconnect that marks the occupant `pending` for 30 s before `leave`; and a `drain()` on the room
registry that refuses new joins and closes sockets with a reconnect hint. Rolling deploy itself
can honestly be deferred — but say so, and say that drain and resync are its prerequisites.

---

### F-04 — Pathfinding drops two of the six inputs PIPELINES names for step 1

**Plan:** Task 5 lines 298–307. `findPath(model, blocked: (x, y) => boolean, from, to)`. The
blocked callback is boolean-only; furni contributes no height. No door rule anywhere.
**Design:** PIPELINES §1 line 41–42 — *"**Pathfinding** (audit B5): build step 1 includes it
explicitly — heightmap, per-tile blocked state, **furni stack heights**, per-item walk/sit flags,
climb-delta rule, **door special case**."* Habbo research
[habbo-hotel.md:326](../research/habbo-hotel.md) — *"the door tile is marked `allowStack = false`,
and the server reconciles the door's Z with the tile in front of it."*

**Divergence, with three concrete consequences.**

1. **Furni stack heights are invisible to movement.** An avatar walking onto a rug (`canWalk`,
   stack 0.05) or any future walkable stacked item stays at floor height, and the climb-delta rule
   (line 305, `|height(to) − height(from)| ≤ 1`) reads the heightmap only. Related:
   `AvatarStateSchema` (lines 244–246) has no `z`, so even if the server knew the avatar was raised
   it could not tell the client, and `depthKey` (line 437) would sort the avatar at z = 0.
2. **The door tile can be sealed.** Nothing in `place`'s validation (lines 382–386) excludes the
   door tile, so one `plant_basic` on `{x:0, y:6}` makes the room's only entrance non-walkable and
   permanently unenterable — the exact failure `allowStack = false` exists to prevent.
3. **Two joiners collide on spawn.** Task 7 line 395 spawns every occupant on the door tile, and
   line 392 lists *"tiles under other avatars"* as blocked. The second joiner stands on the first;
   with the origin tile blocked, movement requests from that tile are at best ill-defined.

**Fix.** Change `blocked` to `tileState(x, y) => { blocked: boolean; addedHeight: number }` so
stack heights reach the climb check; add `z` to `AvatarStateSchema`; refuse `place` on the door
tile with a `bad_position` error; and give `Room.join` a spawn rule that walks the new occupant one
tile inward when the door tile is occupied.

---

### F-05 — The heightmap reachability check cannot detect the unreachability it exists to reject

**Plan:** Task 3 lines 219–222 — *"flood-fill (4-directional, **any height difference walkable for
reachability purposes**) from the door tile and throw if any non-void tile is unreached."*
**Design:** PIPELINES §1 line 46–48 — *"The validator **rejects** malformed input (short rows,
**unreachable regions from the door**) — never skips silently."*

**Divergence.** The validator's walkability model and the game's walkability model are different
models, and they disagree in both directions:

- **False pass.** A height-5 plateau adjacent to height-0 floor flood-fills fine (height ignored)
  but is unreachable in play under the ≤ 1 climb rule. The validator certifies a room that traps
  its occupants — precisely the case F3 names.
- **False reject.** The flood fill is 4-directional; `findPath` is 8-directional (line 304). A
  region joined to the rest of the room only diagonally is genuinely walkable and gets rejected.

**Fix.** Run the flood fill with the same neighbour set (8-dir, no corner cutting) and the same
climb-delta rule as `findPath`. The cheapest correct version is to share one `stepAllowed(model,
from, to)` predicate between `heightmap.ts` and `pathfind.ts` — which also stops the two from
drifting later. Add a test: a 2-height-step plateau must throw.

---

### F-06 — Draw order inverts the sort direction of the reference it cites, contradicting its own test

**Plan:** Task 9 line 438 — *"sort ascending by depthKey"*; lines 441–442 — *"avatars subtract
`1e-2` relative to furni on the same tile-depth (`AVATAR_SPRITE_DEFAULT_DEPTH`'s sign, habbo §4 /
audit B1)"*; test at line 448 — *"an avatar standing at (3,3) draws over a rug at (3,3)."*
**Design/source:** [technical-audit.md:233](technical-audit.md) — the reference sorts
**descending**: `this._sortableSprites.sort((a, b) => (b.z - a.z))`, *"the largest z is added first
and sits at the back"*, so in that renderer a **smaller z draws later, on top** (restated at
technical-audit.md line 293). PIPELINES §1 line 29–31 requires *"explicit tiebreakers (horizontal
epsilon, stable per-sprite epsilon) so ties never flicker."*

**Divergence.** The plan copies the reference's *sign* into the opposite *sort direction*. Under
ascending sort a smaller key is drawn **first**, i.e. underneath. So `−1e-2` puts every avatar
behind the furni on its tile — behind rugs, behind chair legs. The plan's own Task 9 test at line
448 asserts the opposite, so Task 9 cannot pass as written. Note the plan's `z` term (`+ z * 1e-3`,
line 441) already uses the ascending convention correctly, which is what makes the avatar term
detectably wrong rather than a consistent inversion. Two smaller defects in the same key:

- `tiles pin to -Infinity + (x + y) * 1e-9` (line 443): `-Infinity + finite === -Infinity`, so the
  positional term is absorbed and every floor tile shares one key. Floor order then depends
  entirely on insertion order, which the comparator spec (line 438) preserves but never specifies.
- The **horizontal epsilon** named in PIPELINES §1 line 30 has no counterpart in `depthKey`. Only
  the per-sprite epsilon (`seq * 1e-7`) is present.

**Fix.** Under ascending sort make the avatar term `+1e-2`; replace the tile base with a finite
value (`-1e6 + (x + y)`), or move tiles to a separate container drawn below `world`; add a
horizontal term (`Math.abs(x) * 1e-5`). Fix the citation too — `AVATAR_SPRITE_DEFAULT_DEPTH` is
quoted at [technical-audit.md:288](technical-audit.md), not in habbo-hotel.md §4.

---

### F-07 — The §5 seam claim does not match the file map, and `room.ts` absorbs ledger and registration duties

**Plan:** lines 10–11 — *"`@grand/server` is one Node process — WebSocket room server with SQLite
persistence, **module seams named after the PIPELINES §5 services** so the scale split stays
possible."* File map lines 42–47: `db.ts`, `auth.ts`, `pathfind.ts`, `filter.ts`, `room.ts`,
`server.ts`.
**Design:** PIPELINES §5 services: Identity, Room server, Gateway / room directory, Economy ledger,
Marketplace, Catalog / asset, Minigame, Casino, Presence, Social, NPC, Filter, Observability.

**Divergence.** Mapping the claim honestly:

| PIPELINES §5 service | Plan module | Verdict |
|---|---|---|
| Identity | `auth.ts` | present, renamed |
| Room server | `room.ts` | present, over-scoped (below) |
| Filter | `filter.ts` | present (see M-05 on the artifact shape) |
| Gateway / room directory | `server.ts` | fused with HTTP + WS transport; no directory, no drain (F-03) |
| Economy ledger (item ownership) | — | absent; ownership mutated by raw SQL in `room.ts` |
| Presence, Observability | — | absent, unmentioned |

Three specific fusions. (1) PIPELINES §5 line 159 puts **item ownership** in the ledger —
*"Stars AND item ownership in one append-only log"* — while the plan's `place`/`pickup`
(lines 382–390) mutate `furni_items.room_id` and read `owner_id` directly inside `room.ts`, and
`furni_items` is mutable state, not an append-only log. (2) The **registration starter grant** —
a GAME.md faucet-table row (line 91) — fires inside `Room.join` (line 395). (3) `room_state`
carries `inventory` (line 267), putting an account-scoped ledger view inside a room-scoped message.

The mutable-ownership choice is defensible for a slice with no trade. The claim that seams are
preserved is what fails: a reader of line 11 expects to find the split already drawn, and it is
not. The SQLite-for-Postgres substitution (§5 storage column) is likewise never flagged.

**Fix.** Add `packages/server/src/items.ts` — `grantStarter(db, accountId)`, `moveToRoom`,
`moveToInventory`, `listInventory` — and let `room.ts` call it rather than issue SQL. Move
`grantStarter` to `register()`. Then the claim is true. If that is unwanted, soften line 11 to
"one process; the ledger, gateway and presence seams are not drawn yet."

---

### F-08 — The starter grant diverges from GAME.md in trigger, content, and idempotency

**Plan:** Task 7 line 395–396 — *"on `join`, starter inventory is granted once per account: one of
each `PROTOTYPE_CATALOG` def (INSERT only if the account owns zero items)."*
**Design:** GAME.md line 91 (faucet table) — *"Registration | starter furni + 100 Stars trickled
over first 7 days (tune) | once."* GAME.md lines 391–392 — *"0:00 — Registration grants a default
outfit, 10 blank CDs, and **a room already created** with a stock layout and **starter furni
placed**. Nobody faces an empty room."*

**Divergence, three parts.**

1. **Trigger.** Registration in the design; first room join in the plan. Observable difference: an
   account that registers and never joins owns nothing, and the grant is charged to the room
   server rather than to identity/ledger (see F-07).
2. **Idempotency.** *"once"* is implemented as *"if the account owns zero items"* — a count, not a
   once-flag. Inside this slice inventory can never reach zero, so it holds today; the moment room
   deletion, trade, or a sink lands, emptying inventory re-mints the grant. GAME.md's alt strategy
   (line 152–156) rests on a fresh account being worth nothing, and this is a re-grant hole in
   exactly that surface.
3. **Content.** No per-account room is created and no furni is placed — *"Nobody faces an empty
   room"* is the stated purpose of the grant and the slice delivers an inventory strip instead.
   The Star trickle is legitimately covered by the stated ledger deferral (line 564); the room and
   the placement are not mentioned anywhere.

**Fix.** Add `starter_granted INTEGER NOT NULL DEFAULT 0` to `accounts`, grant inside `register()`
guarded by that column, and either create the per-account room with the furni pre-placed (the seed
code from Task 6 already does exactly this shape) or add "per-account rooms and pre-placed starter
furni" to the deferred list with a note that first-session onboarding is not proven by this slice.

---

### F-09 — Step 2's catalog clause is not met, while the plan claims step 2

**Plan:** line 15 — *"this plan is build-order steps 1–2 only."* Line 281–284: `PROTOTYPE_CATALOG`
is five hardcoded `FurniDef` literals; Task 12 line 525–527 renders them as `Graphics` extruded
boxes. Deferred list line 564 — *"generator pipeline (real art replaces every placeholder here)."*
**Design:** PIPELINES §7 step 2 line 206 — *"Furni placement from a starter catalog **authored as
generator parts**."* §2 line 116–117 — *"Build order note (audit A7): the starter catalog is
**authored as generator parts from the start** — the generator reproducing art built for it proves
nothing otherwise."*

**Divergence.** The plan implements the placement half of step 2 and drops the catalog half. This
is defensible on its merits — coloured `Graphics` boxes are not authored art, so nothing is being
built now to be thrown away later, and A7's actual warning (art authored outside the generator)
is not triggered. What is not defensible is the scope sentence: line 15 claims steps 1–2 without
qualification, and the self-review (lines 555–565) repeats the claim. A later reader planning
step 3 will believe step 2 is behind them.

**Fix.** Change line 15 to *"build-order step 1 plus the placement mechanics of step 2; step 2's
'authored as generator parts' catalog clause, the café public room and focus states move to the
generator plan"* — and mirror that in the deferred list. No code changes.

---

## Minor

### M-01 — Whisper has no client UI

Plan line 502: `onSend(handler: (mode: "say" | "shout", text: string) => void)`. The protocol
(line 255), the room contract (line 381) and the smoke test (line 548) all carry whisper; the chat
UI cannot produce one, and the Task 11 manual verification (lines 509–510) does not exercise it.
GAME.md line 358 lists whisper as one of three registers, and GAME.md line 419–420 sets the
new-account whisper restriction to off for the prototype, so nothing gates it.
**Fix.** Parse a `/w <name> <text>` prefix in `ChatUi` and widen the `onSend` mode union, or state
that whisper is server-only in this slice.

### M-02 — A whisper is not echoed to its sender

Plan line 381: *"Whisper: filtered text to the named target only."* The sender sees no bubble and
no confirmation that anything was sent. Every reference implementation in the genre echoes the
whisper to the speaker.
**Fix.** Emit the `chat` message to the sender as well as the target.

### M-03 — The word filter is never applied to usernames

GAME.md line 412 (active prototype list, not parked): *"A basic word filter on chat **and names**."*
Plan Task 6 line 345 validates `/^[a-z0-9_-]{3,20}$/i` and uniqueness only; `filterChat` is called
from `room.ts` only.
**Fix.** Reject registration when the wordlist hits the username — one call in `register()`, and a
test asserting a wordlist name is refused.

### M-04 — The plan parks an item GAME.md lists as active

Plan line 346: *"COLLATE NOCASE handles near-case dupes; exact homoglyph check is parked."*
GAME.md line 412 lists *"Usernames permanent, near-miss similarity rejected"* in the **active**
prototype set. SAFETY-LEGAL-PARKED.md parks confusables normalisation as part of filter hardening
(S7/S9/S10), so the parking is arguable — but the plan makes the call unilaterally against a doc
that says otherwise, which leaves the two documents contradicting each other.
**Fix.** Either implement the cheap version (fold `_`/`-` out, map `0→o 1→l 5→s 3→e`, compare the
normalised form against a unique index) or amend GAME.md line 412 to move similarity to the parked
register. Do not leave the contradiction standing.

### M-05 — The filter is a bare word set, not a versioned ruleset artifact

Plan line 360: `loadWordlist(path: string): Set<string>` over `filter-words.txt` (line 48).
PIPELINES §5 Filter row line 167: *"**Versioned ruleset artifact**, evaluated in-process on every
room server — basic wordlist for the prototype; the hot path stays local either way, and **the
artifact model is where the parked scoring layer attaches later**."* The plan keeps the in-process
evaluation (correct) and drops the versioning (the stated attach point).
**Fix.** `loadRuleset(path): { version: string; words: Set<string> }` with a `# version: 1` header
line in the file, and log the version at startup. Two lines of parsing.

### M-06 — Rooms unload instantly rather than after a grace period

Plan line 422: *"disposed when `occupantCount()` hits 0."* GAME.md lines 344–345: *"instances load
on first entry, **unload minutes after** the last occupant leaves."* One player stepping out and
back reconstructs the room and re-reads the DB each time, and instant disposal is incompatible with
the reconnect window in F-03.
**Fix.** Dispose on a 5-minute timer, cancelled by a join.

### M-07 — `FurniDef.stackHeight` is a scalar where the design requires a per-state list

Plan line 237: `stackHeight: z.number().min(0)`. `FurniItemSchema` (lines 248–250) has no `state`.
PIPELINES §2 stage 1 lines 75–76: *"**per-state stack heights** (the `multiheight` list — **the
server needs it for placement and pathing**, audit A3)."* Harmless for five single-state prototype
items; it is a wire-format change to widen later, and the plan declares the protocol closed
(line 230).
**Fix.** `stackHeights: z.array(z.number().min(0)).min(1)` plus `state: z.number().int()` on the
item now, with the prototype catalog using single-element arrays. Or add a deviation note.

### M-08 — Furni `dir` is unvalidated and unconstrained to the authored directions

Plan line 249 (`FurniItemSchema`) and lines 257–258 (`place`): `dir: z.number().int()` with no
bounds, while `AvatarStateSchema` (line 245) correctly bounds `0..7`. PIPELINES §1 line 14:
*"Furni: **4 authored directions** by default, per-item override."* The plan's own global rule
(lines 25–26) says the server never trusts a client field, and the rotation logic (line 383) only
handles `dir 2/6`, so `dir: 7` or `dir: 9999` reaches placement with undefined footprint semantics.
**Fix.** `dir: z.number().int().min(0).max(7).refine(d => d % 2 === 0)` on furni.

### M-09 — Height 33 is unrepresentable in the heightmap encoding

Plan line 190: *"`x` = void, `0-9` = heights 0–9, `a-z` = 10–35"* and line 220's map
`10 + code − 97`. `x` is both the void marker and the letter that would encode 33, so the height
range is 0–32 plus 34 and 35 — a hole nobody will remember in a year. The Task 3 test (line 215)
asserts `z → 35`, cementing it.
**Fix.** Document the range as 0–32 (`0-9`, `a-w`) and reject `y`/`z`, or state the hole in the
format comment.

### M-10 — No size limit on `parseHeightmap`

PIPELINES §1 lines 48–49: *"Custom floor plans are untrusted input: **size limits**, connectivity
check, validated before reaching the server."* The plan implements the connectivity check
(weakly — F-05) and no size limit. Custom plans do not exist in this slice, but `parseHeightmap`
is the shared boundary that will receive them, and it allocates an `Int16Array` of `width × height`
from caller text.
**Fix.** Cap at 64 × 64 in the parser with a `HeightmapError`, and add a test.

### M-11 — No furni-per-room or inventory cap

GAME.md line 343: *"~100 furni per room (tune)"*; line 350: *"Inventory: one per account, 600 items
(tune)… **Acquisition is full-stop**: a purchase or trade that would exceed capacity fails before
it commits (audit C-5)."* `place` (lines 382–388) enforces ownership, footprint, height, occupancy
and stackability — not count. Neither cap appears in the deferred list.
**Fix.** Enforce the room cap in `place` with a new error code `room_full` (the error-code list at
line 388 is the natural home) and note the inventory cap as landing with trade.

### M-12 — The zoom-scale decision assigned to this plan is never made

TRIAGE.md — *"**C-45** (which zoom scale ships v1) — **deferred to the implementation plan**."*
The plan defines `Scale = 64 | 32` (line 126), tests both (line 142), and then hardcodes scale-64
placeholder art everywhere (lines 481–483) without stating the decision. The decision is implicitly
"64", but a reader auditing TRIAGE closure will not find it.
**Fix.** One sentence under Global constraints: *"v1 ships scale 64; the projection API accepts 32
and nothing renders at it yet."*

### M-13 — No observability of any kind

PIPELINES §5 Observability row line 168: *"room population and tick health, WebSocket
connect/reconnect rates… **Collusion auditing requires the data to exist before the exploit**."*
The plan has no logging, no counters, no metrics seam, and no mention in the deferred list. Task 8
line 421 emits `error{code:"bad_message"}` to the client and records nothing server-side.
**Fix.** A `packages/server/src/log.ts` with structured line logging for join/leave/place/pickup
and malformed-frame counts. Twenty lines, and it is the seam the §5 row names.

### M-14 — `join` trusts a client-supplied `roomId` past its type

`ClientMsgSchema` (line 253) validates `roomId` is an integer; Task 8 line 422 creates a `Room`
lazily per roomId; `Room`'s constructor (line 366) reads the room row. A nonexistent id yields an
undefined `doc` and a crash inside `parseHeightmap` or the JSON parse. This contradicts the plan's
own global constraint at lines 25–26.
**Fix.** Look the row up in the connection handler and emit `error{code:"no_such_room"}` when it
is missing; add it to the Task 8 integration tests.

### M-15 — Five GAME.md room and social behaviours are absent from both the plan and its deferred list

None of these belong to build steps 1–2 by name, so absence is fine; silence is the finding, since
the deferred list (lines 563–565) is the plan's own honesty mechanism and names only NPCs, the
generator, ledger + trade, the arcade, music and figure strings.

- **Ignore** — GAME.md line 413, in the **active** prototype list, and it ships with chat.
- **Room owner kick / ban / mute** — GAME.md pillar 1 line 32 and line 416, active nuisance control.
- **Idle honesty** — GAME.md line 368, *"avatars sleep after 5 minutes, turn their head toward
  speakers"*; ties to F-02 (focused players do not idle-sleep).
- **Room creation and the 6-rooms-per-account cap, stock layouts** — GAME.md line 343.
- **Navigator** — GAME.md line 357; the client currently reaches a room by hardcoded id.

**Fix.** Add a line to the deferred list naming these five.

### M-16 — Room state (locked / password / invite-only) has no place in the schema

GAME.md line 343: *"locked / password / invite-only states."* The `rooms` table (line 336) carries
`id, owner_id, name, doc` and no state, and `join` performs no authorisation beyond a valid session
— any authenticated account may join any room id. Moot with one public room; it is a schema gap
that arrives with room creation.
**Fix.** Either add `state TEXT NOT NULL DEFAULT 'open'` to the seed schema now (free) or list room
states with the deferred room-creation work from M-15.

### M-17 — "Phase 1" is the plan's own coinage, and the filename overstates the slice

The plan's title (line 1), body (line 3) and self-review (lines 556–557) all say *"Phase 1"*, a
term that appears in neither design doc — PIPELINES §7 numbers nine **build steps**, and "V1" is
all nine (line 202: *"V1 focus is the hangout core"*). The filename
`2026-08-03-v1-vertical-slice.md` therefore reads as the whole of V1 while the content is steps 1–2.
**Fix.** Use "build steps 1–2" consistently in the prose. The filename can stay if line 3 opens by
scoping it.

---

## Checked and clear

Recorded so the audit's silence is not read as an omission.

- **Speak radius and fade.** `SPEAK_RADIUS = 5` Chebyshev, non-recipients get `"…"` (lines 376,
  379–380) matches GAME.md line 358 *"Speak carries 5 tiles then fades to dots"*, and the server
  pre-fades rather than trusting the client (line 273) — correct authority placement.
- **Shout** reaches the whole room (line 381) per GAME.md line 358.
- **Filtering order.** *"Filtering happens before distance handling"* (line 381) — right, since the
  faded form must not leak an unfiltered payload.
- **Heightmap storage.** `doc TEXT` holding `{v:1, heightmap, door}` (line 337) matches PIPELINES
  §1 line 45–47 exactly: *"a versioned structured document with the heightmap as one field."*
  Sending the raw heightmap string over the wire (line 264) is a protocol choice, not a storage
  one, and does not conflict.
- **Validator rejects, never skips** (line 27, Task 3) matches F3 — the weakness is which cases it
  can see (F-05), not its posture.
- **Projection constants** (lines 22–23) match PIPELINES §1 lines 11–12 including the zoom-0.5
  halving rule.
- **Multi-tile depth limitation is disclosed** (lines 444–445), citing the origin-tile base depth
  and deferring per-layer offsets to the generator — exactly PIPELINES §1 line 31–32. This is the
  model the rest of the plan should follow.
- **Furni write-through persistence** (line 386) matches §5 room server line 157.
- **Server authority** over movement, chat delivery and furni state (lines 12–13) matches §5.
- **Avatar directions** 0–7 (line 245) match §1 line 13.
- **Degradation policy.** Movement and chat touch no ownership tables — consistent with §5
  line 170's *"rooms, chat, and movement have zero ledger dependency."*
- **Suites vs rooms.** No drift. The decision log's *"Rooms are suites"* is fiction for
  player-owned rooms, which this slice does not build; `"The Casino Floor"` matches GAME.md
  §The casino floor and PIPELINES §7 step 2's *"casino-floor… public rooms"*.
- **Stated deferrals** (lines 563–565) — NPC staff, generator, ledger + trade, arcade, music,
  figure strings — are all genuinely later build steps and correctly named. The Star trickle rides
  the ledger deferral legitimately.
- **Parked safety items** (age assurance, moderation tooling, filter hardening, DM sampling,
  screening pipeline) are absent from the plan and correctly so; not reported per audit scope.
