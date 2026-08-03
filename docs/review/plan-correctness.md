# Plan correctness review — 2026-08-03 v1 vertical slice

Adversarial review of the code, formulas, schemas, and algorithm specs embedded in
[docs/plans/2026-08-03-v1-vertical-slice.md](../plans/2026-08-03-v1-vertical-slice.md).
Reference facts from [research §4](../research/habbo-hotel.md) and
[technical-audit B1/F3](technical-audit.md).

Everything below was computed, traced, or executed. Claims that check out are not reported.
Verification environment: Node v22.23.1, pnpm 11.18.0, TypeScript 5.9.3, zod 3.25.76,
SQLite 3.51.0.

**Counts: 5 blocking (C-01…C-05), 16 major (C-06…C-21), 16 minor (C-22…C-37). 37 total.**

## What checks out (not reported below, stated once so the rest reads as exceptions)

`worldToScreen` matches all six verified constants exactly. `screenToTile` is a correct
floor-plane inverse, including negative tiles and boundary ties. The composite test
`worldToScreen(3,2,1.5,64)` really is `{sx:32, sy:32}` (`(3−2)·32 = 32`,
`(3+2)·16 − 1.5·32 = 80 − 48 = 32`). Every heightmap index and value in the Task 3 tests is
right, including `tiles[2·4+3] = 2`, `'a'→10`, `'z'→35`, and all five rejection fixtures.
Footprint rotation `w↔l` at dir 2 and dir 6 is correct for an 8-direction compass. The
`z = 1.0` plant-on-table expectation is arithmetically right. `vi.advanceTimersByTime(1500)`
really does yield 3 tiles at `MS_PER_TILE = 500`. All zod schemas construct and parse under
zod 3.25.76 and use `discriminatedUnion` correctly. `scryptSync(pw, salt, 64)` fits inside the
32 MiB default `maxmem` (128·16384·8 = 16 MiB) and `timingSafeEqual` never sees a length
mismatch. `TEXT UNIQUE COLLATE NOCASE NOT NULL` does give a case-insensitive unique index.
`import type { Database } from "better-sqlite3"` typechecks. Node type-stripping resolves a
pnpm workspace symlink to a `.ts` entry point without complaint.

---

## Blocking

### C-01 — The avatar depth offset has the wrong sign, and Task 9's own test catches it

**Task 9, "avatars subtract `1e-2`".**

The spec says sort **ascending** by `depthKey`, and that avatars **subtract** `1e-2`, citing
`AVATAR_SPRITE_DEFAULT_DEPTH = -0.01`. Those two rules together invert the intended result.

The Habbo constant comes from a **descending** sort. Technical-audit B1 quotes
`RoomSpriteCanvas.ts:376`:

```ts
this._sortableSprites.sort((a, b) => (b.z - a.z));   // DESCENDING
```

Largest z is added first and sits at the back, so in Habbo a *smaller* z draws *later* and
therefore on top. `−0.01` on the avatar pushes it on top of the furni it shares a tile with.
Flip the sort to ascending and the sign must flip with it.

Compute the plan's own test — "an avatar standing at (3,3) draws over a rug at (3,3)":

```
rug    key = (3+3) + 0·1e-3            = 6.000
avatar key = (3+3) + 0·1e-3 − 1e-2     = 5.990
5.990 < 6.000  →  avatar sorts first  →  avatar is drawn UNDER the rug
```

Executed, to remove any doubt: `avatarKey 5.9900001 rugKey 6 → avatar drawn after rug? false`.
The test as written fails against the scheme as written. The result holds whether the client
gives the avatar `z = 0` or `z = 0.05` (the rug's top), since `0.05·1e-3` is two orders of
magnitude smaller than the `1e-2` term.

The plan's other avatar test — "under furni at (4,3)" — passes under *either* sign
(`5.99 < 7` and `6.01 < 7`), so it does not catch this.

**Fix:** in an ascending scheme the avatar term is `+1e-2`, not `−1e-2`. Add a comment stating
the sign is inverted relative to `AVATAR_SPRITE_DEFAULT_DEPTH` because the sort direction is
inverted, or the next reader will "correct" it back.

```ts
const AVATAR_OFFSET = 1e-2;   // ascending sort: larger key draws later/on top
```

### C-02 — Inventory items carry NULL positions that `FurniItemSchema` rejects, so the first join fails

**Tasks 4 (`FurniItemSchema`), 6 (`furni_items` DDL), 7 (starter grant), 10 (`Net` parses via `ServerMsgSchema`).**

Trace the very first join by a new account:

1. Task 7: "starter inventory is granted once per account: one of each `PROTOTYPE_CATALOG` def
   (INSERT only if the account owns zero items)". Five rows.
2. Task 6 DDL: `furni_items(... room_id INTEGER, x INTEGER, y INTEGER, z REAL, dir INTEGER)` —
   every positional column is nullable, and an inventory item has no position. The plan never
   says what to write there.
3. Task 4: `room_state.inventory: z.array(FurniItemSchema)` and
   `FurniItemSchema` demands `x`, `y`, `dir` as `z.number().int()` and `z` as `z.number()` —
   all required, all non-nullable.
4. Task 10: `Net.onMessage` "parses via `ServerMsgSchema`".

Executed against zod 3.25.76 with the row SQLite actually produces:

```
sqlite> INSERT INTO furni_items(def_id, owner_id) VALUES('chair_basic', 1);
1|chair_basic|1||||||null|null          -- typeof(x)=null, typeof(z)=null

inventory_add with NULL cols -> FAIL:
  item.x Expected number, received null; item.y Expected number, received null;
  item.z Expected number, received null; item.dir Expected number, received null
```

`room_state` never validates, so the client cannot join. This fires on the first login of
every account and on every `inventory_add` after a pickup.

**Fix:** an inventory item is a different type from a placed item. Split them.

```ts
export const InventoryItemSchema = z.object({ id: z.number().int(), defId: z.string() });
export const FurniItemSchema = InventoryItemSchema.extend({
  x: z.number().int(), y: z.number().int(), z: z.number(), dir: z.number().int(),
});
// room_state.inventory: z.array(InventoryItemSchema)
// inventory_add.item:   InventoryItemSchema
```

and state in Task 7 that the starter grant inserts `(def_id, owner_id)` only.

### C-03 — A* returns zig-zags, and the "straight line" test cannot pass deterministically

**Task 5, "A* with Chebyshev heuristic, deterministic neighbor order ... so tests are stable".**

Two errors compound.

**The step cost is never specified.** Chebyshev distance is the free-space cost only when every
step, diagonal included, costs 1. Under that cost model a diagonal is as cheap as an orthogonal
step, so a zig-zag is exactly as optimal as a straight line and A* is free to return either.

**Neighbor order does not make A* deterministic.** It fixes the order neighbors are *pushed*,
not the order the open set *pops*. With a uniform cost and an exact heuristic, every node on
every optimal path shares the same `f`, so the returned path is decided entirely by the
priority queue's tie-breaking — which a binary heap does not specify.

I implemented the spec exactly as written (8-directional, Chebyshev, neighbor order N, NE, E,
SE, S, SW, W, NW, uniform cost 1) on a flat 5×5 and asked for the plan's first test, a straight
line from (0,0) to (4,0), varying only the tie-break:

```
LIFO tiebreak  : (1,1)→(2,2)→(3,1)→(4,0)      <- cost 4, and not a straight line
FIFO tiebreak  : (1,0)→(2,0)→(3,0)→(4,0)      <- cost 4
high-g tiebreak: (1,0)→(2,0)→(3,0)→(4,0)      <- cost 4
```

A last-in-first-out tie-break is what a naive binary heap gives you for equal keys, and it
returns a diamond-shaped detour for a straight-line request. The test fails, the avatar
visibly wanders, and nothing in the spec is violated.

**Fix:** two changes, both needed.

1. Charge `Math.SQRT2` for diagonals and use octile distance as the heuristic. A straight line
   then costs 4 and the zig-zag costs `2·√2 + 2 = 4.8284`, so the straight line is strictly
   optimal and the test has one answer.
   ```ts
   const D = 1, D2 = Math.SQRT2;
   const h = (dx: number, dy: number) => D * (dx + dy) + (D2 - 2 * D) * Math.min(dx, dy);
   ```
   Chebyshev with √2 diagonals stays admissible but is loose. Octile is the tight one.
2. State the full pop order, not just the neighbor order: **lowest `f`, then lowest `h`, then
   lowest insertion sequence.** That is a total order, so the result is reproducible across
   queue implementations.

### C-04 — Nothing in the protocol can tell a client that a placed item's `z` changed

**Tasks 4 (`ServerMsgSchema`), 7 (pickup), 12 (manual acceptance).**

Task 7's pickup contract: "Items stacked on top of it drop by its stack height (keep it simple:
recompute z for items above on the same origin tile)."

The server recomputes and persists. Now enumerate every message that can carry a furni
position: `furni_placed { item }`, `furni_removed { itemId }`, `inventory_add { item }`,
`room_state { furni }`. Only `furni_placed` carries a full `FurniItem`, and it means "a new item
appeared". There is no message for "an existing item moved".

So after picking up a table with a plant on it, every connected client — including the one who
did it — keeps drawing the plant at `z = 1.0`, 32 px in the air, until someone rejoins the room.
This is Task 12's stated manual acceptance path ("place a table, stack a plant on it, ... pick
everything back up").

**Fix:** add one message, and emit it for each item whose `z` the recompute changed.

```ts
z.object({ t: z.literal("furni_moved"), item: FurniItemSchema }),
```

Re-using `furni_placed` also works if the client treats a known id as an update, but say so
explicitly — it is otherwise an invitation to duplicate sprites.

### C-05 — `screenToTile` reads the floor plane only, so any click over a raised surface targets the wrong tile

**Tasks 2 (`screenToTile`), 10 (`onTileClick`: "screenToTile on pointerdown"), 12.**

`screenToTile` inverts `worldToScreen` at `z = 0`. That is correct, and it is the whole problem:
the pointer is a screen point, and the screen point over a raised surface belongs to a
different floor tile than the surface it appears to be on.

Derive the error. Let `a = x + 0.5`, `b = y + 0.5` be the center of tile `(x, y)` drawn at
height `H`. Forward:

```
sx = (a − b)·32
sy = (a + b)·16 − 32H
```

Feed that back through the floor-plane inverse:

```
X = sx/64 + sy/32 = (a−b)/2 + (a+b)/2 − H = a − H
Y = sy/32 − sx/64 = (a+b)/2 − H − (a−b)/2 = b − H
```

So a click on the visual center of a tile or a furni top face at height `H` resolves to tile
**`(x − H, y − H)`**. Executed:

```
tile 5,5 at height 1 renders at { sx: 0, sy: 144 }  screenToTile -> { x: 4, y: 4 }
tile 5,5 at height 2 renders at { sx: 0, sy: 112 }  screenToTile -> { x: 3, y: 3 }
```

Consequences in Phase 1, in order of how soon they bite:

- Task 10, flat seed room: a placeholder avatar is a 24×48 rectangle. Clicking anywhere on
  another avatar's body resolves to a tile up to `48/32 = 1.5` → 1 tile up-left of the one
  under the cursor. Clicking a person to walk next to them sends you somewhere else.
- Task 12: `table_basic` has `stackHeight 1.0`, so its top face is 32 px up. Clicking the table
  to stack a plant on it sends `place` at `(x−1, y−1)`. The plan's manual check "stack a plant
  on it (z lands at 1.0)" cannot pass through the specified click path.
- Any heightmap with a non-zero tile — which `parseHeightmap` accepts up to height 35 — is
  unclickable at its true position.

**Fix:** stop deriving the tile from raw pointer coordinates. Make the floor diamonds the only
interactive display objects (`eventMode: "static"` on tiles, `"none"` on furni and avatars) and
take the tile from Pixi's hit test, which resolves what is actually under the cursor. Keep
`screenToTile` for the empty-floor fallback and rename its contract to say what it is:

```ts
/** Inverse of worldToScreen on the z=0 plane. Wrong by (H, H) tiles for a point on a
 *  surface at height H — do not call it on a point that lies over furni or an avatar. */
export function screenToTile(sx: number, sy: number, scale: Scale): { x: number; y: number };
```

---

## Major

### C-06 — `-Infinity + (x + y) * 1e-9` is exactly `-Infinity`, and it makes the comparator return NaN

**Task 9, "tiles pin to `-Infinity + (x + y) * 1e-9`".**

IEEE 754: `-Infinity` plus any finite value is `-Infinity`. The per-tile term is a no-op.
Executed:

```
tile(0,0) = -Infinity   tile(11,11) = -Infinity   equal? true
comparator tile-vs-tile: -Infinity − (-Infinity) = NaN
```

Two results. First, every floor tile gets an identical key, so the stated per-tile ordering
does not exist. Adjacent 64×32 diamonds tessellate without overlap, so a flat room looks fine —
but the parser accepts heights 0–35, and a tile at height 1 is drawn 32 px up where it overlaps
the tile behind it. Those two tiles are unordered, and which one wins is whatever the insertion
order happened to be.

Second, an idiomatic `(a, b) => depthKey(a) - depthKey(b)` returns `NaN` for every tile-vs-tile
comparison. ECMAScript's `CompareArrayElements` coerces a `NaN` comparator result to `+0`, so
`Array.prototype.sort` treats the tiles as equal rather than throwing, and the stable sort saves
you. That is luck, not design, and it does not survive anyone reaching for `Math.sign`, a
bucketed sort, or Pixi's `zIndex`.

**Fix:** use a finite band below every other key instead of an infinity.

```ts
const TILE_BAND = -1e6;                       // room depth never approaches 1e6
if (s.kind === "tile") return TILE_BAND + (s.x + s.y);
```

### C-07 — The `seq` tiebreaker is unbounded and eats the other two epsilons

**Task 9, "`seq * 1e-7` as the stable tiebreaker epsilon".**

`seq` is an insertion counter with no stated bound or reset. The three additive terms sit at
fixed magnitudes, so the counter walks straight through them:

| `seq` | `seq · 1e-7` | equals |
|---|---|---|
| 10,000 | 0.001 | one full unit of the `z · 1e-3` term (`z = 1`, a whole table height) |
| 100,000 | 0.01 | the entire avatar offset |
| 10,000,000 | 1.0 | one full tile of base depth |

Executed and confirmed at all three. A session that creates 10,000 sprites — avatars joining
and leaving, furni placed and picked up, bubbles, re-renders — starts sorting a low-`seq` item
one stack-level above where it belongs. At 100,000 the avatar/furni relationship inverts.

The rule also contradicts the line above it. The interface comment says "equal keys keep
insertion order", but with `seq` inside the key, two distinct sprites never *have* equal keys,
so that sentence describes a state the scheme cannot reach (see C-19).

**Fix:** drop `seq` from the key. `Array.prototype.sort` has been stable since ES2019, so equal
keys already keep insertion order — which is exactly what the tiebreaker was for. If a stable
sort cannot be assumed, bound it: `(seq % 1000) * 1e-9`, which is 6 orders below the `z` term.

### C-08 — The pickup recompute is keyed on "same origin tile", which misses the plan's own stacking example

**Task 7, pickup: "recompute z for items above on the same origin tile".**

`table_basic` is 2×1 and `plant_basic` is 1×1. Place the table with origin `(5,5)`, covering
`(5,5)` and `(6,5)`. Stack the plant on `(6,5)` — legal, since the table is `canStackOn` and
the plant's own footprint is one tile.

Now pick up the table. The table's origin is `(5,5)`. The plant's origin is `(6,5)`. They are
not the same origin tile, so the recompute does not touch the plant, and it stays at `z = 1.0`
over bare floor. The plan's Task 12 manual check stacks a plant on a table and then picks
everything up, so this is on the acceptance path.

**Fix:** key the recompute on footprint intersection, not origin equality.

```
for every tile T covered by the removed item's footprint:
  for every item I whose footprint covers T and whose z >= removed.z:
    recompute I.z from the remaining stack under I
```

### C-09 — Stacking `z` from the origin tile alone is wrong for multi-tile furni, and "sum" is the wrong operator

**Task 7, place: "Computed `z` = floor height + sum of stack heights under the footprint's origin tile."**

Three defects, in increasing severity.

**The origin tile does not represent the footprint.** `rug_basic` is 3×2. Place it so its
origin sits on bare floor while it overhangs a `table_basic` (`stackHeight 1.0`, `canStackOn`).
The stated rule computes `z = 0` from the origin tile, so the rug clips through a table it is
allowed to cover. Put the origin on the table instead and the same rug computes `z = 1.0` and
floats over the floor tiles. The placement rule requires equal *floor* height across the
footprint but says nothing about equal *stack* height, so both cases are legal placements.

**"Sum" is only accidentally right.** The correct quantity is `max(item.z + def.stackHeight)`
over the items on the tile. Summing happens to agree here because the placement rules force a
single gapless tower, but it is one relaxed rule away from producing a floating item, and it
reads as if two items at the same `z` should add.

**"Under the tile" is undefined for multi-tile items.** The plan stores only the origin
`(x, y)` in `furni_items` and never says the server builds a footprint-expanded occupancy
index. Without one, a query for "what is on tile `(6,5)`" misses a table whose row says
`x = 5`. That same missing index is what `blocked` needs in `requestMove` ("tiles under
non-walkable furni") and what the `canStackOn` check needs for "every covered tile".

**Fix:** state the index explicitly as a Task 7 deliverable, and correct the formula.

```ts
// tiles(item) expands origin + def w/l + dir (w↔l at dir 2 and 6) into covered tiles
const covered = tiles(item);
const topOf = (t: Tile) => Math.max(model.height(t), ...itemsOn(t).map(i => i.z + def(i).stackHeight));
const z = Math.max(...covered.map(topOf));
// reject unless every covered tile reports the same top
```

### C-10 — `dir` is unbounded everywhere it is client-controlled

**Task 4, `ClientMsgSchema` place, `FurniItemSchema`, `room_state.door`.**

`AvatarStateSchema.dir` is correctly constrained to `z.number().int().min(0).max(7)`. The three
places a direction crosses the trust boundary are not. Executed:

```
place dir=1e9 -> true
place dir=-7  -> true
```

The global constraint says "the server never trusts a client field", and this field feeds
footprint rotation, persistence, and rendering. `dir = -7` and `dir = 1e9` both reach the
rotation rule, which only names dir 2 and dir 6, so they fall through to the unrotated
footprint and persist a direction no renderer has a case for.

The rotation rule is also silent on the four diagonals (1, 3, 5, 7) that the 0–7 range permits.
A rectangular footprint has no axis-aligned meaning at 45°.

**Fix:** constrain the schema and narrow the domain.

```ts
export const DirSchema = z.number().int().min(0).max(7);
// place: dir: z.literal(0).or(z.literal(2)).or(z.literal(4)).or(z.literal(6))
```

Restricting placement to the four cardinal directions matches `Item.java:124`'s
`this.rotations = 4` default (technical-audit B3) and removes the undefined diagonal case. Note
that with a fixed origin, dir 0 and dir 4 produce identical footprints, as do dir 2 and dir 6 —
worth a sentence in the plan so nobody writes an occupancy test that tries to tell them apart.

### C-11 — Every test file uses a `.ts` import extension, which fails `pnpm typecheck`

**Tasks 1 (`tsconfig.base.json`, root `typecheck` script), 2, 3.**

Task 2's test imports `from "../src/projection.ts"` and Task 3's from `"../src/heightmap.ts"`.
`tsconfig.base.json` sets `moduleResolution: "bundler"` and does not set
`allowImportingTsExtensions`. Task 1's root script is `"typecheck": "pnpm -r exec tsc --noEmit"`.

Reproduced with TypeScript 5.9.3 against the plan's exact `tsconfig.base.json`:

```
test/projection.test.ts(1,31): error TS5097: An import path can only end with a '.ts'
  extension when 'allowImportingTsExtensions' is enabled.
```

Vitest resolves these fine through Vite, so `pnpm test` is green and `pnpm typecheck` is red —
the worst arrangement, because the failure surfaces on whichever later task first runs
typecheck.

**Fix:** add the flag to `tsconfig.base.json`. It is legal alongside `--noEmit`, and the
packages have no build step (`exports` points at `./src/index.ts`), so nothing else changes.

```json
"allowImportingTsExtensions": true
```

### C-12 — The no-corner-cutting test is weaker than the rule and cannot detect the wrong implementation

**Task 5: rule "Diagonals require both orthogonal neighbors passable"; test "no corner cutting
(diagonal denied when both orthogonals blocked)".**

The rule denies the diagonal when **either** orthogonal is blocked. The test only exercises the
case where **both** are blocked. Those are different implementations, and the weaker one — deny
only if both are blocked, the "squeeze through a gap" variant — passes the plan's test while
violating the plan's rule. The test cannot fail for the reason it exists.

**Fix:** test the discriminating case. On a flat grid, block exactly `(1,0)`, leave `(0,1)`
open, and require `findPath({0,0} → {1,1})` to route around rather than cut the corner. Keep
the both-blocked case as a second assertion.

State also which tile the orthogonal's passability is judged against — the plan says
"passable" without saying whether the climb rule applies to the orthogonal neighbors relative
to `from`, to `to`, or not at all.

### C-13 — Avatars have no `z` anywhere in the protocol, but the renderer and the sort both need one

**Tasks 4 (`AvatarStateSchema`, `walk`), 9 (`Sortable.z`), 10 (`AvatarSprite`).**

`AvatarStateSchema` is `{ id, username, x, y, dir }` and `walk.path` is `{x, y}` pairs. But
`worldToScreen(x, y, z, scale)` takes a `z`, and `Sortable` requires a `z`. Neither the join
state nor the walk path supplies one.

The client can in principle derive it — it has `room_state.heightmap` and `room_state.furni` —
but the plan never says so, and the derivation is not trivial: it needs the floor height plus
the top of any walkable furni under the avatar (`rug_basic` is `canWalk` with
`stackHeight 0.05`). The server, which is authoritative for movement, already knows the answer.

Today's seed room is 12×12 of `0` and the only walkable furni is a 0.05-high rug, so the bug is
a 1.6 px offset. It becomes a 32 px per level error on the first non-flat room, which
`parseHeightmap` already accepts.

**Fix:** add `z: z.number()` to `AvatarStateSchema` and make `walk.path` carry
`{x, y, z}` per step. The server computes it once, both clients agree, and nothing has to be
re-derived.

### C-14 — `walk` carries no start tile and no timestamp, so a cancelled walk cannot resync

**Tasks 4 (`walk`), 7 (`requestMove`), 10 (manual criterion).**

`walk` is `{ id, msPerTile, path }` where `path` "excludes `from`, includes `to`". Two gaps.

**No authoritative start.** Task 7: "A new `requestMove` cancels the pending walk at the current
tile." The replacement `walk` starts at the tile *after* the cancellation point, and the message
never names the cancellation point. A client that missed a frame, joined mid-walk, or ran its
interpolation slightly ahead has no way to learn where the server actually put the avatar. It
can only guess from the previous path and elapsed time.

**No start time.** Task 10's manual criterion is "clicking a tile walks both views in sync at
2 tiles/second". Both clients receive the same message but at different times, and each begins
interpolating on arrival, so the two views are permanently offset by the difference in network
delivery. Nothing in the message lets them align.

The interpolation math itself is correct, incidentally — `worldToScreen` is affine in `x, y, z`,
so lerping screen points equals lerping world points, and 250 ms of a 500 ms step really is the
midpoint.

**Fix:**

```ts
z.object({ t: z.literal("walk"), id: z.number().int(), msPerTile: z.number().int(),
           from: z.object({ x: z.number().int(), y: z.number().int(), z: z.number() }),
           startedAt: z.number().int(),      // server epoch ms
           path: z.array(TileSchema) }),
```

Clients snap to `from` on receipt and offset their interpolation clock by `startedAt`.

### C-15 — The repeated-letter collapse either invents false positives or misses the words it was built for

**Task 7: "hit replaces with 'blah' case-insensitively on word boundaries, repeated-letter
collapse ('shiiit' hits)".**

There are two ways to implement this and both are broken.

**Collapse the input and the wordlist.** `"ass"` collapses to `"as"`. The ordinary English word
`"as"` collapses to `"as"`. Every occurrence of "as" in normal chat is replaced with "blah".
The same collapse maps "bee"→"be", "too"→"to", "all"→"al".

**Collapse the input only.** Now `"shiiit"` → `"shit"` matches the raw entry `"shit"`, which is
the case the plan names. But any banned word containing a doubled letter becomes unmatchable:
a wordlist entry `"ass"` can never match, because the input is always collapsed to a single
`s` before comparison, and `"asss"` — the exact evasion this feature targets — collapses to
`"as"` and misses.

Collapsing also destroys the index mapping the replacement needs: `filterChat` returns modified
text, so a hit found in collapsed space has to be mapped back to a span in the original string.
The one-line spec hides that entirely.

**Fix:** never collapse. Compile each wordlist entry to a run-tolerant regex, which matches
"shiiit" and "asss" alike, preserves original offsets for replacement, and cannot fire on "as".

```ts
const pattern = (w: string) => new RegExp(`\\b${[...w].map(c => `${c}+`).join("")}\\b`, "gi");
// "shit" -> /\bs+h+i+t+\b/gi   matches "shiiit", "shhhit"; never matches "as"
```

Add a false-positive test to the suite. The plan tests only that clean text passes unchanged,
which the collapse implementation also satisfies right up until someone types "as".

### C-16 — Whisper is built on the server and unreachable from the client

**Tasks 4, 7 (whisper contract), 11 (`ChatUi`), 13 (smoke asserts the delivery matrix).**

`ClientMsgSchema` accepts `mode: "whisper"`, Task 7 specifies delivery and a `whisper_target`
error, and Task 13's smoke test asserts a "say/shout/whisper delivery matrix". Then Task 11
defines the only chat UI in the plan:

```ts
onSend(handler: (mode: "say" | "shout", text: string) => void): void;   // no whisper
showBubble(avatarId: number, text: string, mode: "say" | "shout"): void; // no whisper
```

No client can send a whisper and no client can render one it receives. A feature exists on the
wire, in the server, and in the integration test, and is dead from the user's side.

Related, in the same contract: whisper is delivered "to the named target only", which excludes
the sender. The whisperer's own client shows nothing at all, so a working whisper is
indistinguishable from a broken one.

**Fix:** widen both signatures to `"say" | "shout" | "whisper"`, define the send affordance
(a `/whisper <name> <text>` prefix is the cheapest), and echo the whisper back to the sender.

### C-17 — `join` accepts any `roomId` and Task 8 creates a `Room` for it unconditionally

**Task 8: "One `Room` instance per roomId, created lazily".**

`roomId` is client-supplied and schema-valid for any integer — verified,
`{t:"join", token:"x", roomId:999999}` parses. Only room 1 is seeded. Lazy creation with no
existence check means `new Room(db, 999999, emit)` runs, its constructor queries `rooms` for a
row that does not exist, and dereferences `undefined` when it parses `doc`. On a WebSocket
message handler that is an unhandled throw in the connection's callback.

**Fix:** look the room up before constructing, and emit `error{code:"no_such_room"}` and close
when it is missing. Add it to the Task 8 test list beside the 4401 case.

### C-18 — `Room` has no teardown, and `requestMove`'s `setInterval` outlives the room

**Tasks 7 (`Room` interface), 8 ("disposed when `occupantCount()` hits 0"), 13 ("leave disposes
the room").**

The `Room` interface is `join`, `leave`, `requestMove`, `chat`, `place`, `pickup`,
`occupantCount`. There is no `dispose`, `close`, or `destroy`. Task 8 says rooms are disposed
and Task 13 asserts it, against an object with no disposal method and no observable disposal
state.

`requestMove` "advances the occupant one path tile every `MS_PER_TILE` via `setInterval`", and
`leave` is not specified to clear it. The ordinary sequence — a player clicks a far tile, then
closes the tab — leaves an interval holding a reference to a room the server believes is gone,
ticking forever, calling `emit` for an account with no socket. In the Task 7 tests, which use
`vi.advanceTimersByTime`, those orphan intervals fire inside later tests.

**Fix:** add `dispose(): void` to the interface, have it clear every pending walk timer, have
`leave` clear that occupant's timer, and assert in Task 13 that no timers remain
(`vi.getTimerCount() === 0`).

### C-19 — The "identical keys" test describes a state the scheme cannot produce

**Task 9: "two items with identical keys keep insertion order".**

`depthKey` includes `seq * 1e-7`, and `seq` is the insertion counter. Two distinct sprites
therefore always differ by at least `1e-7` and never have identical keys. To write the test you
must give two sprites the same `seq`, which contradicts what `seq` is — and at that point the
assertion tests `Array.prototype.sort`'s stability, not anything in `depthKey`.

**Fix:** falls out of C-07. Remove `seq` from the key and the test becomes both constructible
and meaningful: two sprites with the same `x, y, z, kind` genuinely tie, and the assertion
checks that the sort is stable.

### C-20 — The scale-32 test passes for an implementation that ignores `scale` entirely

**Task 2: `test("scale 32 halves everything", () => expect(worldToScreen(1, 1, 1, 32)).toEqual({ sx: 0, sy: 0 - 16 + 16 }))`.**

The expected value is correct — `sx = (1−1)·16 = 0`, `sy = 2·8 − 1·16 = 0`, and the written
expression `0 - 16 + 16` also evaluates to 0. The problem is that it is the same answer at every
scale. `(1,1,1)` was chosen so that `x = y` zeroes `sx` regardless of the horizontal step, and
so that `(x+y)·v − z·zu = 2v − zu = 0` for any implementation where `zu = 2v` — which holds at
scale 64 too:

```
w(1,1,1,32) = { sx: 0, sy: 0 }
w(1,1,1,64) = { sx: 0, sy: 0 }     <- identical
```

A stub that ignores its `scale` argument passes. This is the only test in the plan covering
"Zoom 0.5 halves all six numbers", which the global constraints call law.

**Fix:** test a point where every one of the three constants is separately observable.

```ts
test("scale 32 halves all three steps", () => {
  expect(worldToScreen(1, 0, 0, 32)).toEqual({ sx: 16, sy: 8 });
  expect(worldToScreen(0, 1, 0, 32)).toEqual({ sx: -16, sy: 8 });
  expect(worldToScreen(0, 0, 1, 32)).toEqual({ sx: 0, sy: -16 });
});
```

### C-21 — `scryptSync` blocks the event loop for every occupant of every room, and the HTTP bodies are unvalidated

**Tasks 6 (auth), 8 (HTTP endpoints).**

Two problems on the same code path.

**Synchronous key derivation in a single-process game server.** `crypto.scryptSync` is CPU-bound
and blocks the event loop. Measured on this machine at the Node defaults (N=16384, r=8, p=1):
**24 ms**. Every login and registration freezes movement ticks, chat delivery, and furni
operations for every connected player in every room for that long. It is also a free
amplification primitive — an unauthenticated endpoint that costs the server 24 ms of exclusive
CPU per request.

**No schema on the HTTP surface.** The global constraint says "Every WebSocket message validates
through the zod schemas", and Task 8 specifies `POST /api/register` and `POST /api/login` taking
JSON `{username, password}` with no schema named. Registration validates the username against
`/^[a-z0-9_-]{3,20}$/i`, which is fine, and nothing at all validates `password`. A 10 MB
password string goes straight into `scryptSync`. There is no minimum length either.

**Fix:** use the async `crypto.scrypt` so derivation runs on the libuv threadpool, and validate
both endpoints with a zod schema alongside the wire schemas.

```ts
export const CredentialsSchema = z.object({
  username: z.string().regex(/^[a-z0-9_-]{3,20}$/i),
  password: z.string().min(8).max(200),
});
```

Also record the scrypt cost parameters next to the hash. `pw_hash BLOB, pw_salt BLOB` cannot
express "this hash used N=16384", so raising the cost later invalidates every stored password.

---

## Minor

### C-22 — The Task 2 PASS gate says 6 tests and the file defines 8

Count the file: 4 in the `describe("verified Habbo constants at scale 64")` block, 1 for
scale 32, and 3 generated by the `for` loop over `[[0,0],[5,3],[9,9]]`. Total 8. The plan says
"expect PASS (6 tests)". Fix the number, or the implementer will assume the loop is broken.

### C-23 — The heightmap reachability check ignores the climb rule, so its fixture is an unwalkable room

**Tasks 3 (flood fill "any height difference walkable for reachability purposes"), 5 (climb rule
`|Δh| ≤ 1`).**

The two rules disagree, and the plan's own test data shows how far apart they are. The letters
fixture `"az\nAZ"` parses to heights `[10, 35, 10, 35]`. Every adjacent pair differs by 25, so
`findPath` returns `null` between any two tiles in it. The validator declares the room fully
reachable and valid.

This is a deliberate simplification, but it means "rejects tiles unreachable from the door"
guarantees topological connectivity, not walkability, and a custom floor plan can pass
validation with a permanently stranded region. Say which guarantee is intended. If it is
walkability, flood-fill with the same `|Δh| ≤ 1` rule `findPath` uses.

### C-24 — The `REFERENCES` clauses do nothing without `PRAGMA foreign_keys = ON`

**Task 6 DDL.**

SQLite disables foreign-key enforcement by default and `openDb` is not specified to enable it.
Verified:

```
sqlite> PRAGMA foreign_keys;      -- 0
sqlite> INSERT INTO rooms VALUES(1, 999, 'x', '{}');   -- accepted, no account 999
```

`sessions.account_id` and `rooms.owner_id` are decorative as written. Add
`db.pragma("foreign_keys = ON")` in `openDb`. Separately, `furni_items` declares no foreign keys
at all on `owner_id` or `room_id`, inconsistently with the other two tables.

### C-25 — Four of the five catalog entries leave required schema fields unstated

**Task 4: "`furni.ts` exports `PROTOTYPE_CATALOG: FurniDef[]` — exactly: ..."**

`FurniDefSchema` requires `canWalk`, `canSit`, and `canStackOn` on every entry. Only
`chair_basic` specifies all three. `table_basic` (2×1, stack 1.0, stack-on) omits `canWalk` and
`canSit`; `sofa_basic` omits `canWalk` and `canStackOn`; `plant_basic` omits all three;
`rug_basic` omits `canSit`. The values are inferable, but the paragraph says "exactly", and the
Task 7 tests depend on `table_basic.canStackOn === true` and `chair_basic.canStackOn === false`.
Write the five literals out.

### C-26 — `whisper` without a `to` field is schema-valid

**Task 4: `to: z.string().optional()`.**

Verified: `{t:"chat", mode:"whisper", text:"hi"}` parses successfully, and so does
`{t:"chat", mode:"say", text:"hi", to:"bob"}`. The schema is the stated trust boundary, and it
lets through a message the server must then reject at runtime with `whisper_target`. Split the
variant so the type system carries the constraint.

```ts
z.object({ t: z.literal("chat"), mode: z.enum(["say", "shout"]), text: TextSchema }),
z.object({ t: z.literal("chat"), mode: z.literal("whisper"), text: TextSchema, to: z.string() }),
```

That needs a second discriminator or a `z.union` inside the branch, since `discriminatedUnion`
keys on `t` alone — worth one line in the plan rather than leaving it to be discovered.

### C-27 — `pickup` never checks that the item is in *this* room

**Task 7: "caller must own the item and be in the room".**

The condition constrains the caller's location, not the item's. An item the caller owns that is
placed in a different room satisfies both clauses, so `pickup` succeeds and this room broadcasts
`furni_removed` for an item it never held. Add `room_id = this.roomId` to the predicate.

### C-28 — "INSERT only if the account owns zero items" is a grant-once rule that only holds while items are indestructible

**Task 7, starter inventory.**

Correct today, because Phase 1 has no way to destroy or transfer an item. It becomes an item
duplication bug the moment trade, gifting, or deletion lands — an account that trades away all
five starter items receives a fresh set on next join. The plan explicitly names trade as a later
phase.

No race exists in the current design, incidentally: better-sqlite3 is synchronous and the server
is one Node process, so the count-then-insert cannot interleave.

**Fix:** record the grant rather than inferring it —
`ALTER TABLE accounts ADD COLUMN starter_granted_at INTEGER` — and key on that.

### C-29 — "All world coordinates are integers" is contradicted by the schemas in the same plan

**Global constraints line 24 against Task 4.**

`FurniItemSchema.z` is `z.number()`, `FurniDefSchema.stackHeight` is `z.number().min(0)`,
`rug_basic` has `stackHeight 0.05`, and the Task 2 test projects `z = 1.5`. The rule is true of
`x` and `y` and false of `z`. Restate it as "tile coordinates `x` and `y` are integers, `z` is
a real height in tile units".

### C-30 — Parameter properties break the specified `dev` script

**Tasks 1 and 8: `"dev": "node --watch --experimental-strip-types src/server.ts"`.**

Node's strip-only mode removes type syntax without transforming anything, so TypeScript
constructs with runtime behavior are rejected. Verified on Node v22.23.1:

```
class Room { constructor(private db: object, private roomId: number) {} }

SyntaxError [ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX]:
  TypeScript parameter property is not supported in strip-only mode
```

`enum` and `namespace` fail the same way. `Room`, `Net`, and `AvatarSprite` are all classes with
constructor arguments they will want to retain, which is exactly where a parameter property gets
written. One line in Task 1 naming the restriction saves the discovery. (Type stripping across
the pnpm workspace symlink does work — I tested `@grand/server` importing `@grand/shared`
through `node_modules/@grand/shared` → `packages/shared/src/index.ts`, and it resolved and ran.)

### C-31 — `noUncheckedIndexedAccess` makes the specified `tileHeight` signature a type error

**Tasks 1 (`tsconfig.base.json`) and 3 (`tileHeight(m, x, y): number`).**

The flag is on, and it applies to typed arrays. Verified:

```
src/idx.ts(1,88): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
```

Returning `m.tiles[y * m.width + x]` from a function declared to return `number` does not
compile. The fix is one operator (`?? -1`), which is also the correct out-of-bounds behavior the
interface already promises, but the plan gives the signature without it and the same pattern
recurs wherever paths and rows are indexed.

### C-32 — Task 1's package.json does not contain the flag Task 1's PASS step requires

**Task 1.**

The literal `packages/shared/package.json` shows `"scripts": { "test": "vitest run" }`. Four
bullets later: "Run `pnpm test` — expect all three packages report 'no test files found' without
erroring (add `"passWithNoTests": true` via `vitest run --passWithNoTests` in each test script)".
The script shown does not have the flag, so the step fails as written. Put
`vitest run --passWithNoTests` in the JSON.

Also: `@grand/client` is described as adding `pixi.js` and dev `vite`, with no `vitest`, but
Task 9 creates `packages/client/test/sort.test.ts`. Add `vitest` to the client's
devDependencies.

### C-33 — Task 12's only automated test exercises Task 8's code, not Task 12's

**Task 12: "Extend `packages/server/test/server.test.ts` with one end-to-end case ... Run — FAIL
until client+server wiring complete, then PASS."**

The described test drives real WebSockets from Node: place from inventory, assert `furni_placed`
on both sockets, restart, rejoin, assert persistence. Every line of that exercises server code
delivered in Tasks 7 and 8. It never loads the client. So the stated expectation is wrong — the
test passes as soon as Task 8 is done, not "until client+server wiring complete" — and Task 12's
actual deliverables (`FurniSprite`, the inventory strip, the hover highlight, the right-click
pickup) have no automated coverage at all, only the manual checklist.

Either move the test to Task 8 where it belongs, or add a Task 12 test that covers what Task 12
builds — the client-side mirror of the placement rules is pure logic and testable.

### C-34 — Two Task 8 rules disagree about a malformed first frame

**Task 8.**

"The first client message must be `join` with a valid session token or the socket closes with
code 4401" and "Every inbound frame parses through `ClientMsgSchema` — parse failure emits
`error{code:"bad_message"}` and drops the frame, never the connection." A first frame of
malformed JSON satisfies both antecedents and the consequents contradict. State the precedence:
pre-authentication, any frame that is not a valid `join` closes with 4401 — otherwise an
unauthenticated socket can sit open sending garbage indefinitely.

### C-35 — The faded "…" is indistinguishable from a user who typed "…"

**Tasks 4 (`chat` comment: "server pre-fades: distant say arrives as '…'"), 11 ("gray italic for
the '…' faded form").**

`text` is `z.string()` and the fade is signalled by its content. A player who types "…" — or
"...", if the client normalizes — renders in gray italic as though they were out of earshot.
Minor cosmetically, but it also means the client's styling logic is a string comparison against
a magic literal shared across two packages. Add `faded: z.boolean()` to the `chat` server
message.

### C-36 — The heightmap has no size limit, though the plan cites the audit finding that asks for one

**Task 3, and global constraint "The heightmap validator rejects; it never skips (audit F3)".**

The plan implements half of F3. Technical-audit F3 asks for rejection *and* "size limits, a
connectivity check from the door tile, and rejection of unreachable regions" for custom floor
plans. `parseHeightmap` gets the connectivity check and the rejection, and no bound on rows,
columns, or total tiles. Phase 1 only loads room documents the server itself seeded, so nothing
is exploitable yet, but the function is the one the custom-floor-plan path will call. Add a
stated maximum — `width ≤ 64`, `height ≤ 64` — while the signature is still cheap to change.

### C-37 — The eight-direction convention the plan depends on is never written down

**Tasks 3 (`Door.dir` 0–7), 4 (`AvatarStateSchema.dir`), 7 (footprint rotation at dir 2/6, "8-dir
atan-free lookup" for the step vector), 10 ("direction lookup from step vector").**

Three separate rules depend on knowing which index is which compass direction, and no task
states the mapping. The seed door is `{x:0, y:6, dir:2}` on the west edge, which only makes
sense if 2 is east. Footprint rotation at 2 and 6 only makes sense if those are the ±90° steps.
And the step-vector lookup is specified twice — once in `room.ts` for the server's `dir` update,
once in `avatar.ts` for the client's — in two packages, from an unstated table. If they diverge,
avatars face different ways in different windows.

**Fix:** put the table in `@grand/shared` beside the projection constants, where both sides
import it, and write the convention down once.

```ts
// dir 0 = N, 1 = NE, 2 = E, 3 = SE, 4 = S, 5 = SW, 6 = W, 7 = NW
export function dirFromStep(dx: number, dy: number): number { ... }
```
