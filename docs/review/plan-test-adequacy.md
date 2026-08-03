# Test-adequacy audit — `docs/plans/2026-08-03-v1-vertical-slice.md`

Lens: do the specified tests pin the behavior the prose claims, and does the TDD choreography
work? A contract with no test that would fail if the contract were broken is a finding. So is a
lifecycle question the plan's *design* never answers, because the engineer must invent an answer
the moment they write the test.

Line references are into the plan file. All test code below is written against the plan's own
interfaces and is meant to be pasted in.

**Counts: 11 blocking, 31 major, 13 minor (55 findings).**

## Summary

| ID | Severity | Plan:Line | Issue | Fix |
|---|---|---|---|---|
| T-01 | blocking | plan:373 | `Room` exposes no occupant accessor — the walk and chat tests in Task 7 cannot be written | Add `occupants(): readonly Occupant[]` |
| T-02 | blocking | plan:310 | Corner-cutting test certifies the *opposite* of the stated rule | Test the one-orthogonal-blocked case |
| T-03 | blocking | plan:394 | "New `requestMove` cancels the pending walk" — no test | Assert timer count and new path origin |
| T-04 | blocking | plan:374,422 | No `Room.dispose()`; walk `setInterval` survives `leave` and room disposal | Add `dispose()`, assert `getTimerCount()===0` |
| T-06 | blocking | plan:389 | Pickup drops stacked items' `z` — no protocol message can express it | Re-emit `furni_placed` for moved items |
| T-07 | blocking | plan:248,267 | Inventory rows have NULL `x/y/z/dir`; `FurniItemSchema` demands numbers | Validate every outbound frame in tests |
| T-08 | blocking | plan:422 | `join` with an unknown `roomId` (or any handler throw) kills the process | `error{code:"no_room"}`, socket survives |
| T-09 | blocking | plan:443 | `-Infinity + (x+y)*1e-9` is `-Infinity`; comparator yields `NaN` for tile pairs | Finite `TILE_BASE = -1e6` |
| T-10 | blocking | plan:448 | "avatar draws over a rug" contradicts the specified constants — the test cannot pass | Walkable furni gets its own layer |
| T-12 | blocking | plan:415 | `close()` hangs with an open WebSocket or keep-alive `fetch` socket | Terminate clients and destroy sockets |
| T-13 | blocking | plan:80,101 | `.ts` import extensions fail `tsc`; client has no DOM lib; `make test` never typechecks | `allowImportingTsExtensions`, `lib`, Makefile |
| T-05 | major | plan:427 | `avatar_leave` and room disposal have no test at all | Assert `avatar_leave` on socket close |
| T-11 | major | plan:427 | `bad_message` test does not assert the connection survives | Send a valid frame after the bad one |
| T-14 | major | plan:379 | Speaker echo undefined — does the speaker receive their own chat? | Define recipients for every emission |
| T-15 | major | plan:403 | Speak radius boundary untested; nothing distinguishes Chebyshev from Euclidean | Listener at (5,5) hears; (6,6) does not |
| T-16 | major | plan:381 | Filtering never asserted for shout or whisper | `shout "shiiit"` → both receive `"blah"` |
| T-17 | major | plan:380 | `whisper_target` error untested; whisper unreachable from the client UI | Test the code, or scope whisper out |
| T-18 | major | plan:387 | `not_owner`, `bad_position` untested; three failure modes have no code at all | `z.enum` of error codes in `protocol.ts` |
| T-19 | major | plan:249,258 | Furni `dir` is an unclamped int; rotation for dir 2/6 untested | `.min(0).max(7)` + a rotated-fit test |
| T-20 | major | plan:385 | Footprint fits on equal *floor* height but `z` comes from the origin tile's *stack* | Require an equal stack top across the footprint |
| T-21 | major | plan:395 | Starter grant idempotency and ordering untested | Rejoin → still 5 items; first `room_state` has 5 |
| T-22 | major | plan:395 | Spawn tile untested; avatars stack on the door, contradicting tile exclusivity | Spawn at the nearest free tile |
| T-23 | major | plan:393 | Join while another avatar walks → joiner sees a frozen avatar forever | Re-emit `walk` with the remaining path |
| T-24 | major | plan:392 | Two clients can walk onto the same tile | Reserve the destination at path time |
| T-25 | major | plan:419 | Two sockets on one account — the first goes dead but stays open | Close the older socket with 4409 |
| T-26 | major | plan:419 | Second `join` on the same socket undefined | `error{code:"already_joined"}` |
| T-27 | major | plan:419 | A socket that never sends `join` lives forever | 5-second handshake timeout, close 4401 |
| T-28 | major | plan:418 | CORS and the OPTIONS preflight untested — fails only in a browser | Assert `OPTIONS /api/login` → 204 + headers |
| T-29 | major | plan:417 | HTTP 400 paths untested | Duplicate register → 400 `{error}` |
| T-30 | major | plan:424 | No pattern for waiting on a specific socket message | Ship `test/helpers.ts` (code below) |
| T-31 | major | plan:400,424 | No fixture or teardown for the room/socket DBs | `mkdtempSync` per test, `db.close()` |
| T-32 | major | plan:400 | Fake-timer discipline unspecified — leaked intervals pollute later tests | `useFakeTimers`/`useRealTimers` per test |
| T-33 | major | plan:535 | Task 12's "FAIL until client wiring" is false — the test is server-only | Move it to Task 8; test the client seam |
| T-34 | major | plan:529 | Client mirrors the placement rules with no shared function and no test | `canPlace()` in `@grand/shared` |
| T-35 | major | plan:487 | Task 10's "pure-logic tests" need a live PixiJS app | Extract `lerpScreen`, `dirFromStep` |
| T-36 | major | plan:392 | The step-vector→dir mapping is never defined; two sides implement it independently | Neighbor order *is* the dir numbering |
| T-37 | major | plan:100 | `@grand/client` has no `test` script or vitest dep — its tests silently never run | Pin all three test scripts in Task 1 |
| T-38 | major | plan:307 | Step cost and open-set tie-breaking unspecified → expected paths not computable | Uniform cost 1, FIFO tie-break |
| T-39 | major | plan:302 | Target void / blocked / equal to `from` undefined | `from === to` → `[]`; blocked target → `null` |
| T-40 | major | plan:550 | "leave disposes the room" is unobservable through the public API | `stats(): { rooms: number }` |
| T-41 | major | plan:341 | The seeded room is flat, so every height rule is untested end-to-end | Seed a platform and a void |
| T-42 | major | plan:463 | `Net` behavior on a malformed *server* frame undefined | Drop the frame, never throw |
| T-43 | minor | plan:171 | "expect PASS (6 tests)" — there are 8 | Say 8 |
| T-44 | minor | plan:213 | Uppercase letters never asserted despite the case-insensitive contract | Assert `tiles[2]`, `tiles[3]` |
| T-45 | minor | plan:219 | A trailing newline makes every heightmap ragged | Strip one trailing `\n`, test it |
| T-46 | minor | plan:221 | Reachability ignores height, so a parsed room can still be unwalkable | State it, test it |
| T-47 | minor | plan:341 | Seed idempotency on reopen untested — a crash on restart | `INSERT OR IGNORE`, open twice |
| T-48 | minor | plan:345 | Username regex rejections and unknown-user login untested | Four `toThrow(AuthError)` cases |
| T-49 | minor | plan:277 | `error.code` is a free-form string — typos pass the schema | `z.enum([...])` |
| T-50 | minor | plan:546 | One giant smoke test hides every failure after the first | Split into ordered `test()`s |
| T-51 | minor | plan:543 | `smoke:` is redundant — vitest already picks the file up in `make test` | Exclude it from the default run |
| T-52 | minor | plan:106 | `make dev` orphans the server → port conflicts in manual verification | `trap 'kill 0' EXIT; ... ; wait` |
| T-53 | minor | plan:415 | Ephemeral-port semantics unstated | "port 0 binds ephemeral; read back `port`" |
| T-54 | minor | plan:417 | No body-size cap on the auth endpoints | Reject bodies over 1 KiB |
| T-55 | minor | plan:445 | `seq` in the key makes the "identical keys" test unconstructable | Drop `seq`, rely on stable sort |

---

## 1. Blocking findings

### T-01 (blocking, Task 7) — `Room` has no occupant accessor, so its two headline tests are unwritable

`plan:365-374` exports `Occupant` and then never exposes it. The public surface is
`join / leave / requestMove / chat / place / pickup / occupantCount`. Task 7's test list
(`plan:405-406`) asks for "walk advances position after `vi.advanceTimersByTime(1500)` by 3
tiles". There is no way to read a position. The only observable is `room_state`, which requires a
*third* account to join purely to snapshot the room — and that join mutates the room under test.

The same gap blocks the chat tests: every occupant spawns at the door tile (`plan:395`), so the
test must walk one avatar 5 or 6 tiles away and then assert where it ended up before asserting
what it heard.

`Occupant` being exported but unreferenced is the tell — it was meant to be reachable.

**Fix.** Add to the interface at `plan:373`:

```ts
occupants(): readonly Occupant[];
```

and write the test the plan intends:

```ts
test("a walk advances the occupant one tile per MS_PER_TILE", () => {
  room.join(1, "alice");                      // spawns at the door (0,6)
  room.requestMove(1, 3, 6);                  // path [(1,6),(2,6),(3,6)]
  vi.advanceTimersByTime(1500);
  expect(room.occupants()).toContainEqual(
    expect.objectContaining({ accountId: 1, x: 3, y: 6 }),
  );
  expect(vi.getTimerCount()).toBe(0);         // the interval stops at the end of the path
});
```

The second assertion is the one the plan omits and the one that catches the leak in T-04.

### T-02 (blocking, Task 5) — the corner-cutting test certifies the opposite of the stated rule

The rule at `plan:306`: "Diagonals require **both** orthogonal neighbors passable (no corner
cutting)." A diagonal is therefore illegal when *either* orthogonal is blocked.

The test at `plan:310-311`: "no corner cutting (diagonal denied when **both** orthogonals
blocked)."

An implementation that denies a diagonal only when both orthogonals are blocked — the classic
"squeeze between two furni corners" bug — passes the stated test. The test cannot fail for the
behavior it is named after. In the prototype room the visible symptom is an avatar slipping
diagonally between a table corner and a wall.

**Fix.** Replace with the discriminating case — exactly one orthogonal blocked:

```ts
const m = parseHeightmap("000\n000\n000", { x: 0, y: 0, dir: 2 });
const wall = (x: number, y: number) => x === 1 && y === 0;   // ONE orthogonal of the (0,0)→(1,1) diagonal

test("a diagonal is denied when either orthogonal neighbour is blocked", () => {
  expect(findPath(m, wall, { x: 0, y: 0 }, { x: 1, y: 1 }))
    .toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);   // forced around, not through the corner
});
```

`(0,1)` is the only two-step route once `(1,0)` is blocked, so the expected array is unique and
independent of tie-breaking. Keep a second copy of the test with the blocker being a void tile
rather than the `blocked` callback — the rule must hold for both sources of impassability, and
nothing in the plan says the implementation treats them the same way.

### T-03 (blocking, Task 7) — walk cancellation is a contract with no test

`plan:394`: "A new `requestMove` cancels the pending walk at the current tile." Nothing in the
test list exercises a second `requestMove`. The two failure modes are both invisible to the
listed tests: the old `setInterval` is never cleared (two intervals now fight over one occupant's
position), and the new path is computed from the *original* tile rather than the current one (the
avatar snaps backwards).

**Fix.**

```ts
test("a second requestMove cancels the first at the current tile", () => {
  room.join(1, "alice");                 // (0,6)
  room.requestMove(1, 5, 6);
  vi.advanceTimersByTime(500);           // now standing on (1,6)
  emitted.length = 0;

  room.requestMove(1, 1, 8);
  const walk = emitted.find(([, m]) => m.t === "walk")![1] as Extract<ServerMsg, { t: "walk" }>;
  expect(walk.path[0]).toEqual({ x: 1, y: 7 });   // starts from (1,6), not from (0,6)
  expect(vi.getTimerCount()).toBe(1);             // the first interval is gone, not merely shadowed

  vi.advanceTimersByTime(1000);
  expect(room.occupants()[0]).toMatchObject({ x: 1, y: 8 });  // never drifts toward (5,6)
});
```

`expect(vi.getTimerCount()).toBe(1)` is the assertion that matters. Without it a leaked interval
still produces the right final position in this test and corrupts the next one.

### T-04 (blocking, Tasks 7 and 8) — no `dispose()`, so timers outlive the room

Task 8 (`plan:422`): "One `Room` instance per roomId, created lazily, **disposed when
`occupantCount()` hits 0**." Task 7's interface (`plan:365-374`) has no `dispose`. Disposal is
therefore dropping a reference — and a live `setInterval` holds that reference. The consequences,
none of which any listed test would catch:

- A client that disconnects mid-walk leaves an interval mutating an occupant who has left. If
  `leave` deletes the occupant record, the next tick dereferences `undefined` and throws inside a
  timer callback — an uncaught exception that kills the process.
- The room, its `better-sqlite3` handle, and its `emit` closure (which captures the dead socket)
  are retained forever.
- In tests, the interval survives into the next `test()` and moves an avatar in a room that was
  supposed to be gone.

This is the single most load-bearing lifecycle gap in the plan: it is where "client disconnects
mid-walk", "room disposal while a walk timer is pending", and "cross-test isolation" all meet.

**Fix.** Add to the Task 7 interface:

```ts
dispose(): void;   // clears every pending walk timer; the room is unusable afterwards
```

State in the contracts block that `leave` clears that occupant's walk timer, and that the server
calls `dispose()` before dropping the room. Then:

```ts
test("leaving mid-walk clears the walk timer", () => {
  room.join(1, "alice");
  room.requestMove(1, 5, 6);
  vi.advanceTimersByTime(500);
  room.leave(1);
  expect(vi.getTimerCount()).toBe(0);
  expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
});

test("dispose clears timers for every occupant", () => {
  room.join(1, "alice"); room.join(2, "bob");
  room.requestMove(1, 5, 6); room.requestMove(2, 5, 7);
  expect(vi.getTimerCount()).toBe(2);
  room.dispose();
  expect(vi.getTimerCount()).toBe(0);
});
```

and in `afterEach`: `room.dispose(); db.close(); vi.useRealTimers();`.

### T-06 (blocking, Task 7) — pickup drops stacked items, and no message can say so

`plan:389-390`: "Items stacked on top of it drop by its stack height (recompute z for items above
on the same origin tile)." The server-side recompute is untested, and the wire format cannot
express the result: `ServerMsgSchema` (`plan:263-278`) has `furni_placed`, `furni_removed`,
`inventory_add` — no update. Pick up a table with a plant on it and every connected client keeps
drawing the plant at `z = 1.0`, floating, until they rejoin. The persisted `z` and the rendered
`z` disagree with no way to reconcile.

"the same origin tile" is also ill-defined for multi-tile furni: a 2×1 table sitting on a 3×2 rug
has a different origin tile from the rug, so picking up the rug leaves the table's `z` untouched
by the stated rule.

**Fix.** Either add `z.object({ t: z.literal("furni_moved"), item: FurniItemSchema })` to the
protocol, or specify that a re-computed item is re-announced with `furni_placed` (the client
treats `furni_placed` for a known id as an update). Restate the rule over *covered tiles*, not
origin tiles: "every item whose footprint intersects the removed item's footprint and whose `z`
is above it drops by the removed item's stack height." Then:

```ts
test("picking up a base item drops what was stacked on it and tells the room", () => {
  const table = place(alice, "table_basic", 4, 4);
  const plant = place(alice, "plant_basic", 4, 4);   // z = 1.0
  emitted.length = 0;
  room.pickup(alice, table.id);

  expect(msgs("furni_removed")).toContainEqual(expect.objectContaining({ itemId: table.id }));
  expect(msgs("furni_placed")).toContainEqual(
    expect.objectContaining({ item: expect.objectContaining({ id: plant.id, z: 0 }) }),
  );
  expect(db.prepare("SELECT z FROM furni_items WHERE id=?").get(plant.id)).toEqual({ z: 0 });
});
```

### T-07 (blocking, Tasks 4/7) — inventory items violate the schema the client parses with

`furni_items` (`plan:338-339`) declares `room_id, x, y, z, dir` nullable, and an inventory item is
defined as `room_id IS NULL` (`plan:382`). `FurniItemSchema` (`plan:248-250`) requires `x`, `y`,
`z`, `dir` as numbers, and `room_state.inventory` is `z.array(FurniItemSchema)` (`plan:267`). A
straight `SELECT *` serialization puts `null` into those fields. `Net.onMessage` "parses via
`ServerMsgSchema`" (`plan:464`) — so the *first* `room_state` a real client receives fails
validation and the whole join is dropped. Blank screen, no error.

No listed test catches it: the Task 7 room tests use a fake `emit` that never validates, and the
Task 8 socket tests are described as raw `ws` clients checking `msg.t`.

**Fix, two parts.**

1. Specify the serialization at `plan:382`: an item in inventory is emitted with
   `x: 0, y: 0, z: 0, dir: 0`. (The alternative — a separate `InventoryItemSchema` without
   position — is cleaner but touches three more call sites.)
2. Make every socket test validate what it receives, which pins outbound conformance for the
   whole protocol at zero extra cost. In the helper of T-30:
   `const msg = ServerMsgSchema.parse(JSON.parse(raw.toString()));`
   and in Task 7, make the fake `emit` validate too:
   `const emit: Emit = (id, msg) => { ServerMsgSchema.parse(msg); emitted.push([id, msg]); };`

Add the direct assertion to the first-join test:

```ts
expect(state.inventory).toHaveLength(5);                 // the whole starter catalog
expect(state.inventory.every((i) => Number.isInteger(i.x))).toBe(true);
```

### T-08 (blocking, Task 8) — an unknown `roomId` kills the server

`join` carries `roomId: z.number().int()` (`plan:253`) with no bound, and Task 8 creates rooms
"lazily" (`plan:422`). Any authenticated client can send `{t:"join", token, roomId: 999}`. There
is no row, so `new Room(db, 999, emit)` reads `undefined.doc`, throws inside the `ws` message
handler, and — with no try/catch anywhere in the plan — takes the process down. The same path
covers `place` with a nonexistent `itemId` and any zod-valid-but-semantically-impossible field.

The global constraint at `plan:25-26` ("the server never trusts a client field") is not enforced
by any test.

**Fix.** State at `plan:422`: "A `join` for a roomId with no `rooms` row emits
`error{code:"no_room"}` and leaves the socket open. Every inbound message is handled inside a
try/catch that emits `error{code:"internal"}` and keeps the connection." Test:

```ts
test("an unknown room is an error, not a crash", async () => {
  const ws = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId: 999 }));
  expect(await bus.waitFor("error")).toMatchObject({ code: "no_room" });
  ws.send(JSON.stringify({ t: "join", token, roomId: 1 }));
  await bus.waitFor("room_state");                 // the socket still works
});
```

### T-09 (blocking, Task 9) — the tile depth term is arithmetically dead and produces `NaN`

`plan:443`: "tiles pin to `-Infinity + (x + y) * 1e-9`". `-Infinity + anything` is `-Infinity`.
Every tile gets the identical key, so:

- The `(x + y)` ordering the formula is written to express does not exist.
- A comparator of the form `(a, b) => depthKey(a) - depthKey(b)` returns `-Infinity - -Infinity`
  = `NaN` for any two tiles. Sorting with a comparator that returns `NaN` gives an
  implementation-defined order. PixiJS's child sort compares `zIndex` numerically and hits the
  same `NaN`.
- `Container.zIndex = -Infinity` is not a usable value.

The listed test "floor tile sorts under everything" only ever compares a tile against a non-tile,
so it never sees the `NaN`.

**Fix.**

```ts
const TILE_BASE = -1e6;   // finite, below every furni/avatar key
export function depthKey(s: Sortable): number {
  if (s.kind === "tile") return TILE_BASE + (s.x + s.y);
  ...
}
```

```ts
test("tile keys are finite and ordered by depth", () => {
  const near = depthKey({ kind: "tile", x: 0, y: 0, z: 0, seq: 0 });
  const far  = depthKey({ kind: "tile", x: 5, y: 5, z: 0, seq: 1 });
  expect(Number.isFinite(near)).toBe(true);
  expect(near).toBeLessThan(far);
  expect(far - near).not.toBeNaN();
});
```

Note the semantic choice being made here: "floor always draws first" is only correct while the
floor is flat. With a raised platform (see T-41) a tile in front of an avatar must draw over it,
and the whole-floor-first model breaks. Say which model is intended in the plan.

### T-10 (blocking, Task 9) — the avatar/rug test cannot pass against the specified constants

Constants at `plan:441-445`: base `(x + y)`, `+ z * 1e-3`, avatars `- 1e-2`.
Test at `plan:448-449`: "an avatar standing at (3,3) draws over a rug at (3,3)".

Compute both:

- avatar at (3,3), z 0 → `6 + 0 - 0.01` = **5.99**
- rug at (3,3), z 0 → `6 + 0` = **6.00**

Ascending sort draws 5.99 first, so the avatar draws *under* the rug. The specified test fails
against the specified implementation, and there is no assignment of the given constants that
satisfies both. The engineer hits this at "run — expect PASS", and the cheapest way out is to
quietly edit the test — which is exactly the outcome TDD is meant to prevent.

The root cause is that one offset is being asked to do two jobs: avatars must draw *behind*
standing furni on the same tile and *in front of* flat furni on the same tile.

**Fix.** Give walkable furni its own layer below avatars. `Sortable.kind` becomes
`"tile" | "floor_furni" | "avatar" | "furni"`, where an item is `floor_furni` when its def has
`canWalk === true` (the rug is the only one in the prototype catalog):

```ts
const LAYER = { tile: -1e6, floor_furni: -2e-2, avatar: -1e-2, furni: 0 } as const;
export function depthKey(s: Sortable): number {
  if (s.kind === "tile") return LAYER.tile + (s.x + s.y);
  return (s.x + s.y) + s.z * 1e-3 + LAYER[s.kind];
}
```

Then rug 5.98 < avatar 5.99 < table 6.00, and all three listed expectations hold. Add the
missing third case explicitly:

```ts
test("an avatar draws over a rug and under a table on the same tile", () => {
  const rug    = { kind: "floor_furni", x: 3, y: 3, z: 0, seq: 0 } as const;
  const avatar = { kind: "avatar",      x: 3, y: 3, z: 0, seq: 1 } as const;
  const table  = { kind: "furni",       x: 3, y: 3, z: 0, seq: 2 } as const;
  expect(depthKey(rug)).toBeLessThan(depthKey(avatar));
  expect(depthKey(avatar)).toBeLessThan(depthKey(table));
});
```

Separately: the avatar offset `1e-2` equals a furni `z * 1e-3` at `z = 10`. Unreachable with this
catalog, but write the constraint down (`z < 10`) so the next catalog does not silently break the
ordering.

### T-12 (blocking, Tasks 8/12/13) — `close()` will hang the restart tests

`startServer` returns `close(): Promise<void>` (`plan:415`), and Task 12 (`plan:533`) restarts the
server inside a test with clients connected. Two mechanisms make a naive implementation never
resolve:

- `http.Server.close()` stops accepting new connections and fires its callback only once every
  existing connection has ended. An upgraded WebSocket never ends on its own.
- `ws`'s `WebSocketServer.close()` does not terminate connected clients; with `clientTracking` on
  it defers its `close` event until the client set empties.

There is a third, less obvious one: Node's global `fetch` (undici) keeps its socket alive for
seconds after the response. A test that registers over HTTP and then closes the server blocks on
that idle socket even with no WebSocket open.

The symptom is a vitest timeout with no useful message, in the two tests that prove persistence.

**Fix.** Specify `close()` at `plan:415`:

```ts
async close() {
  for (const client of wss.clients) client.terminate();
  wss.close();
  for (const socket of openSockets) socket.destroy();   // tracked via httpServer.on("connection")
  await new Promise<void>((res, rej) => httpServer.close((e) => (e ? rej(e) : res())));
  db.close();
}
```

and in tests use `fetch(url, { headers: { connection: "close" } })`. Add the regression test —
it is three lines and it fails loudly instead of hanging:

```ts
test("close() resolves with a socket open", async () => {
  const srv = await startServer({ port: 0, dbPath });
  const ws = await connect(srv.port);
  await expect(srv.close()).resolves.toBeUndefined();
  expect(ws.readyState).toBe(WebSocket.CLOSED);
});
```

Give it an explicit `{ timeout: 2000 }` so a regression fails in 2 s rather than at the default.

### T-13 (blocking, Tasks 1/2) — the type configuration rejects the plan's own test files

Three separate breakages, all introduced at Task 1 and all first visible at Task 2:

1. Every test imports with an explicit extension: `from "../src/projection.ts"` (`plan:134`).
   Under `moduleResolution: "bundler"` TypeScript rejects a `.ts` import specifier unless
   `allowImportingTsExtensions` is set (it requires `noEmit`, which the root `typecheck` script
   already uses). `tsconfig.base.json` (`plan:80-89`) does not set it. Every test file is a type
   error. The same flag is required for the server's `--experimental-strip-types` dev script
   (`plan:113`), which needs explicit extensions at runtime.
2. `"types": []` with no `lib` gives the client package no DOM types, while `ChatUi` takes an
   `HTMLElement` (`plan:501`) and `RoomScene` handles `pointerdown` (`plan:470`). The client
   package will not typecheck.
3. `make test` runs only `pnpm test` (`plan:108-109`). `pnpm typecheck` exists in the root
   package.json (`plan:77`) and is never invoked by any acceptance step in any task. In a project
   whose stated defense is "every message validates through zod and TypeScript is strict", the
   type gate is configured but never enforced — and vitest does not typecheck, so nothing else
   catches it.

**Fix.** In `tsconfig.base.json` add `"allowImportingTsExtensions": true, "noEmit": true, "lib":
["ES2022"]`; in the client's `tsconfig.json` add `"lib": ["ES2022", "DOM"]`. Change the Makefile:

```make
test:
	pnpm typecheck && pnpm test
```

and add to Task 1's checklist: "Run `make test` — expect exit 0 and three package headers in the
output." That last clause also catches T-37.

---

## 2. Race and lifecycle holes

The brief asked which of these the tests cover and which the *design* even defines. The honest
answer for the whole section: **none are tested, and only one (walk cancellation, T-03) is
defined.** Each finding below therefore carries a design sentence first and a test second.

### T-23 (major, Task 7) — joining while another avatar is mid-walk

`room_state.avatars` carries `x, y, dir` (`plan:244-246`) — a snapshot. A joiner receives the
walking avatar's *current* tile and never receives the in-flight `walk`, so the avatar freezes in
their view. Because there is no walk-completion message either, the joiner's view stays wrong
until that avatar walks again. Two windows plus one late window is precisely the plan's own
manual verification setup (`plan:489`).

**Design.** "On `join`, after `room_state`, the room emits a `walk` to the joiner for every
occupant with a pending path, carrying the remaining path."

**Test.**

```ts
test("a joiner is told about a walk already in progress", () => {
  room.join(1, "alice");
  room.requestMove(1, 5, 6);        // path [(1,6)..(5,6)]
  vi.advanceTimersByTime(1000);     // alice is on (2,6), three tiles remain
  emitted.length = 0;

  room.join(2, "bob");
  const state = msgsTo(2, "room_state")[0];
  expect(state.avatars.find((a) => a.id === 1)).toMatchObject({ x: 2, y: 6 });
  const walk = msgsTo(2, "walk")[0];
  expect(walk.path).toEqual([{ x: 3, y: 6 }, { x: 4, y: 6 }, { x: 5, y: 6 }]);
});
```

### T-24 (major, Task 7) — two clients can walk onto the same tile

`blocked` is "tiles under other avatars" (`plan:392`), evaluated once, at path time. Two
occupants who both request the same destination each path successfully (the other was elsewhere
when each path was computed) and both arrive. That breaks two other stated rules: the pathfinder
assumes one avatar per tile, and `place` refuses tiles that are "free of avatars" (`plan:384`) on
the same assumption.

**Design.** Pick one and write it down: (a) the destination tile is reserved for the duration of
the walk and a second path to it returns `null`, or (b) tiles are not exclusive and the
pathfinder stops treating avatars as blocking. (a) matches the genre.

**Test.**

```ts
test("two occupants cannot walk onto the same tile", () => {
  room.join(1, "alice"); room.join(2, "bob");
  room.requestMove(1, 3, 6);
  room.requestMove(2, 3, 6);
  vi.advanceTimersByTime(5000);
  const [a, b] = room.occupants();
  expect([a!.x, a!.y]).not.toEqual([b!.x, b!.y]);
});
```

Related and equally undefined: furni placed on a tile a walker has already pathed through. The
walker walks into the table. One sentence — "a walk step onto a tile that became blocked is
cancelled at the previous tile" — plus an assertion that the occupant stops.

### T-25 (major, Task 8) — two sockets, one account

`Emit` is `(accountId, msg) => void` (`plan:364`), so the transport must map accountId → socket.
Open two browser tabs on one account (or replay a token, which never expires — `plan:344`) and
the second `join` overwrites the mapping. The first socket stays open and receives nothing
forever; `Room.join` is called twice for the same id, producing either a duplicate occupant or a
silent position reset. Nothing in the plan defines it and nothing tests it. It is one tab-refresh
away in normal use.

**Design.** "A `join` for an account that already has a live socket closes the older socket with
code 4409 and replaces it; the room sees no `leave`/`join` pair."

**Test.**

```ts
test("a second login for the same account displaces the first socket", async () => {
  const a = await joinAs(token, 1);
  const b = await joinAs(token, 1);
  await expect(a.closed).resolves.toMatchObject({ code: 4409 });
  await b.waitFor("room_state");
  expect(bAll.filter((m) => m.t === "avatar_join")).toHaveLength(0);  // not a second avatar
});
```

### T-26, T-27 (major, Task 8) — double `join` on one socket, and a socket that never joins

`plan:419` defines only the *first* message. A second `join` on an already-joined socket is
undefined (`error{code:"already_joined"}`, dropped, or a duplicate occupant). A socket that
connects and sends nothing holds a connection and a session slot indefinitely — trivial to
accumulate, and there is no timeout anywhere in the plan.

**Design.** "A `join` on an already-joined socket emits `error{code:"already_joined"}` and is
otherwise ignored. A socket that has not sent a valid `join` within 5 seconds closes with 4401."

**Test.** For the timeout, fake timers on the server side make this awkward; assert it with a
real 5 s timer only in the smoke file, or make the window an option on `startServer`
(`handshakeMs`) so the unit test can pass 50 ms. Prefer the option — it keeps the suite fast:

```ts
const srv = await startServer({ port: 0, dbPath, handshakeMs: 50 });
const ws = await connect(srv.port);      // send nothing
await expect(closeOf(ws)).resolves.toMatchObject({ code: 4401 });
```

### T-05 (major, Task 8) — the whole leave path is untested

`avatar_leave` exists in the protocol (`plan:269`) and is never mentioned in any test in any task.
Neither is disposal at zero occupants. A client that closes its socket leaving a ghost avatar in
every other window is the most visible possible bug in a two-window demo, and nothing would catch
it.

```ts
test("closing a socket removes the avatar for everyone else", async () => {
  const a = await joinAs(tokenA, 1), b = await joinAs(tokenB, 1);
  await a.waitFor("avatar_join");
  b.socket.close();
  expect(await a.waitFor("avatar_leave")).toMatchObject({ id: bobId });
  expect(srv.stats().rooms).toBe(1);          // alice is still there
  a.socket.close();
  await vi.waitFor(() => expect(srv.stats().rooms).toBe(0));   // disposed at zero occupants
});
```

`stats()` is T-40.

### Server restart with a socket open

Covered by T-12 (the hang). The state side is fine and worth one explicit assertion: sessions live
in a table (`plan:334-335`), so a token minted before the restart still works after it. Task 12's
restart step should reuse the *same* token rather than re-registering, which proves session
persistence for free:

```ts
const srv2 = await startServer({ port: srv1Port, dbPath });   // same db, same token
const c = await joinAs(tokenA, 1);
expect((await c.waitFor("room_state")).furni).toContainEqual(expect.objectContaining({ id: itemId, z: 1 }));
```

Asserting `z` (not just presence) is what makes this a persistence test rather than a row-count
test.

---

## 3. TDD choreography

### Where "expect FAIL" fails for the right reason

Tasks 2, 3, 4, 5, 6, 7, 8, 9 all begin with a test importing a module that does not exist, so the
first run fails at import. That is the correct shape and the plan gets it right.

Two exceptions:

**T-33 (major, Task 12).** `plan:535` says the new server test "Run — FAIL until client+server
wiring complete, then PASS". False: the test at `plan:532-534` drives raw sockets — register,
`place`, restart, rejoin. It exercises no client code at all and passes as soon as Task 7/8 land.
The engineer will see it pass immediately and conclude Task 12 is done, while the actual Task 12
deliverables (`FurniSprite`, the inventory strip, hover highlight, right-click pickup) ship with
**zero** automated coverage.

Fix: move that test into Task 8 where it belongs, and give Task 12 a test of its own client seam —
the placement predicate of T-34 is the natural one, since it is the only non-rendering logic in
the task.

**T-10 (blocking).** Task 9 reaches "expect PASS" and cannot get there. Covered above.

### Expected values the plan does not let anyone compute

**T-38 (major, Task 5).** The A* spec (`plan:307`) fixes the heuristic and the neighbor order but
never states the **step cost** (is a diagonal 1 or √2?) or how ties in the open set break. Without
both, no expected path array can be derived, so the "straight line" and "walks around a blocked
column" tests (`plan:309-310`) cannot be written before the implementation — the engineer will
run the code and paste in whatever it produced, which is not a test.

Add to `plan:307`: "Every step costs 1 (uniform 8-direction cost, which is what makes the
Chebyshev heuristic consistent). Ties in the open set break to the earliest-inserted node."

With that, here are computable expectations, including one I worked out by hand so the plan does
not have to hand-wave it:

```ts
const flat = parseHeightmap("00000\n00000\n00000\n00000\n00000", { x: 0, y: 0, dir: 2 });

test("a clear diagonal is the unique optimal path", () => {
  expect(findPath(flat, () => false, { x: 0, y: 0 }, { x: 2, y: 2 }))
    .toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]);      // Chebyshev 2 ⇒ 2 diagonal steps, unique
});

test("a wall with one gap forces the long way round", () => {
  const wall = (x: number, y: number) => x === 2 && y <= 3;   // column x=2, gap only at y=4
  const path = findPath(flat, wall, { x: 0, y: 0 }, { x: 4, y: 0 })!;
  expect(path.at(-1)).toEqual({ x: 4, y: 0 });
  expect(path.some((t) => wall(t.x, t.y))).toBe(false);
  expect(path).toHaveLength(10);
});
```

The 10 is forced, not guessed: the gap tile (2,4) can only be *entered* from (1,4) and only
*left* toward (3,4), because both diagonal alternatives would cut the corner of the blocked
(2,3). That gives 4 steps to reach (1,4), +1 into (2,4), +1 to (3,4), +4 from (3,4) to (4,0) =
10. Put that derivation in a comment; a bare `toHaveLength(10)` is unmaintainable.

**T-15 (major, Task 7).** "say beyond 6 tiles delivers '…' and within 5 delivers text"
(`plan:403`) leaves distance 6 itself unspecified in prose, and 5-vs-6 is exactly where the
off-by-one lives. Worse, every listed distance is measured along one axis, so no test
distinguishes the specified Chebyshev metric from Euclidean or Manhattan — a diagonal listener at
(5,5) is Chebyshev 5 (hears) but Euclidean 7.07 (would not).

Since occupants spawn on one tile, the test must move them first (which is why T-01 blocks this
too). Concrete, fully derived:

```ts
async function stand(id: number, x: number, y: number) {
  room.requestMove(id, x, y);
  vi.advanceTimersByTime(20 * MS_PER_TILE);
  expect(room.occupants().find((o) => o.accountId === id)).toMatchObject({ x, y });
}

test("say carries exactly 5 Chebyshev tiles", async () => {
  room.join(1, "alice"); room.join(2, "bob");
  await stand(2, 5, 5);                 // Chebyshev 5 from (0,0)-ish, Euclidean 7.07
  await stand(1, 0, 0);
  room.chat(1, "say", "hello");
  expect(textTo(2)).toBe("hello");      // fails under a Euclidean radius

  await stand(2, 6, 6);
  room.chat(1, "say", "hello");
  expect(textTo(2)).toBe("…");
});
```

(The seeded room is 12×12, so (6,6) and (5,5) both exist. Reaching them needs the door at (0,6),
so adjust the origin tile in the test; the point is the metric, not the coordinates.)

**T-36 (major, Tasks 7/10).** The step-vector → `dir` mapping is required by Task 7
("updating dir from the step vector, 8-dir atan-free lookup", `plan:393`) and by Task 10
("direction lookup from step vector", `plan:488`), and is **defined nowhere**. Both sides would
invent it independently; the client's `setDirection` would disagree with the server's `dir` and
avatars would face the wrong way with no test failing.

The plan already implies the mapping: the pathfinder's neighbor order is "N, NE, E, SE, S, SW, W,
NW" (`plan:307-308`), the door in the seed is `dir: 2` on the `x = 0` edge (`plan:342`) — facing
+X, into the room — and `place` rotates on "dir 2/6" (`plan:384`), the east/west axis. All three
are consistent with **neighbor index = dir**:

| dir | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| (dx, dy) | (0,−1) | (1,−1) | (1,0) | (1,1) | (0,1) | (−1,1) | (−1,0) | (−1,−1) |

Put `export function dirFromStep(dx: number, dy: number): number` in `@grand/shared` with that
table, have `room.ts` and `avatar.ts` both import it, and test it once — eight cases, one line.

**T-35 (major, Task 10).** The task promises "pure-logic tests only (interpolation math …
direction lookup)" but exports neither as a function: interpolation lives inside
`AvatarSprite.walk` (`plan:476`), whose constructor takes a `RoomScene`, which takes a
`pixi.Application`. Writing the promised test means booting PixiJS under vitest (no WebGL, no
canvas) — so in practice the test gets skipped and Task 10 ships with nothing.

Fix: create `packages/client/src/scene/walk.ts` exporting
`lerpScreen(a: Point, b: Point, t: number): Point` and re-exporting `dirFromStep`, have
`AvatarSprite` call them, and test those:

```ts
test("half-way through a tile step is the midpoint of the two screen points", () => {
  const a = worldToScreen(0, 0, 0, 64), b = worldToScreen(1, 0, 0, 64);
  expect(lerpScreen(a, b, 250 / 500)).toEqual({ sx: 16, sy: 8 });
});
```

(`worldToScreen(1,0,0,64)` is `{32,16}` by Task 2, so the midpoint is `{16,8}` — computable from
the plan, which is the standard the rest of the expected values should meet.)

**T-43 (minor, Task 2).** `plan:171` says "expect PASS (6 tests)". The block at `plan:131-151`
defines 4 + 1 + 3 = **8**. The arithmetic in the tests themselves checks out (I verified
`worldToScreen(3,2,1.5,64) = {32,32}`, the scale-32 case `= {0,0}`, and that the `screenToTile`
round-trip through tile centers floors correctly), so this is only the count.

---

## 4. The fake-timer tests in Task 7

**The `advanceTimersByTime(1500)` → 3 tiles expectation is correct**, and I want to be explicit
about why, because it is the one piece of timing in the plan that is fully consistent. `walk` is
emitted immediately and the occupant advances "one path tile every `MS_PER_TILE`" (`plan:393`), so
ticks land at 500, 1000, 1500. Sinon's fake clock (which vitest uses) fires timers due at exactly
`now + ms`, so `advanceTimersByTime(1500)` fires all three. The client's interpolation contract
(`plan:487-488` — midpoint at 250 ms of a 500 ms step) starts from the same t=0, so client and
server agree on arrival times. No off-by-one.

The pitfalls are elsewhere:

**T-32 (major).** The plan says "vitest fake timers" and never says where to install or uninstall
them. Required discipline, and the reason is the interval leak of T-04:

```ts
beforeEach(() => { vi.useFakeTimers(); db = openDb(tmpDb()); room = new Room(db, 1, emit); });
afterEach(()  => { room.dispose(); db.close(); vi.useRealTimers(); });
```

- Install *before* constructing the `Room`. Any interval created against the real clock is
  invisible to `advanceTimersByTime` and fires for real later, in another test.
- Without `useRealTimers()` in teardown, a leaked interval from test N is advanced by test N+1's
  `advanceTimersByTime` and mutates a room that test N+1 has never heard of. The symptom is a
  test that passes alone and fails in file order — the worst class of flake.
- Assert `expect(vi.getTimerCount()).toBe(0)` at the end of every walk test. It is the only
  cheap, direct evidence that intervals are being cleared.

**better-sqlite3 is not a hazard here, and I checked before assuming it was.** It is fully
synchronous, so no query is waiting on a timer and `advanceTimersByTime` never needs to flush a
promise. The one consequence worth writing down: **keep `Room` synchronous**. If any method
becomes `async`, `advanceTimersByTime` stops being sufficient (microtasks do not flush) and every
test in the file needs `await vi.advanceTimersByTimeAsync`. One sentence at `plan:362`.

Second interaction: `vi.useFakeTimers()` fakes `Date` by default, so any account registered inside
a fake-timer test gets `created_at = 0`. Harmless for these tests; it will not be harmless the
first time something reads a timestamp.

**T-31 (major).** Task 6 specifies "fresh temp-file db per test" (`plan:347`). Task 7, which
writes to SQLite and verifies rows (`plan:404`), specifies no fixture at all — and its tests need
the *seeded* room 1 to exist. Name it:

```ts
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "grand-"));
const db = openDb(path.join(dir, "t.db"));      // migrations + seed run here
afterEach(() => { db.close(); fs.rmSync(dir, { recursive: true, force: true }); });
```

Also specify the journal mode. If `openDb` sets WAL, each db leaves `-wal` and `-shm` siblings,
and the Task 12 restart test must close the first handle before the second opens or it reads a
stale snapshot. One line in Task 6 settles it: "`PRAGMA journal_mode = WAL`" (or explicitly not).

---

## 5. Integration tests (Tasks 8, 12, 13)

**T-30 (major) — the plan never says how a test waits for a message.** This is the single biggest
practical gap in the integration tasks. "second client joins, first receives `avatar_join`"
(`plan:425`) is not implementable with `ws.once("message")`, because the first client has already
received `room_state` and may receive `walk` or `chat` in between. Left unspecified, the engineer
writes `await sleep(100)` and the suite becomes flaky on a loaded machine.

Ship the helper as part of Task 8 (`packages/server/test/helpers.ts`):

```ts
import { WebSocket } from "ws";
import { ServerMsgSchema, type ServerMsg } from "@grand/shared";

export function bus(ws: WebSocket) {
  const seen: ServerMsg[] = [];
  const waiters: { t: string; resolve: (m: ServerMsg) => void }[] = [];
  ws.on("message", (raw) => {
    const msg = ServerMsgSchema.parse(JSON.parse(raw.toString()));   // pins outbound conformance
    seen.push(msg);
    for (let i = waiters.length - 1; i >= 0; i--)
      if (waiters[i]!.t === msg.t) waiters.splice(i, 1)[0]!.resolve(msg);
  });
  return {
    seen,
    /** Resolves with the first message of type `t`, already-received ones included. */
    waitFor<T extends ServerMsg["t"]>(t: T, ms = 1000) {
      const hit = seen.find((m) => m.t === t);
      if (hit) return Promise.resolve(hit as Extract<ServerMsg, { t: T }>);
      return new Promise<Extract<ServerMsg, { t: T }>>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error(
            `no "${t}" within ${ms}ms; received [${seen.map((m) => m.t).join(", ")}]. ` +
            `If the server emits it to a different account, check the Emit target.`)),
          ms);
        waiters.push({ t, resolve: (m) => { clearTimeout(timer); resolve(m as never); } });
      });
    },
    /** For "must NOT arrive" assertions: drain, then check. */
    never(t: ServerMsg["t"]) { return !seen.some((m) => m.t === t); },
  };
}
```

Three properties matter and none are optional: it buffers (no lost-race), it types the result off
the discriminant, and its timeout message names what *did* arrive. `never()` needs a drain
(`await sleep(50)`) before it means anything — say so, because "the far client did not receive the
whisper" is asserted in Task 13 and is otherwise vacuously true.

**T-53 (minor) — ephemeral ports.** `startServer` returns `port` (`plan:415`), which only makes
sense if `port: 0` binds an ephemeral one, but the plan never says it. An implementation that
echoes the input passes typecheck and every test then connects to port 0. One sentence: "`port: 0`
binds an ephemeral port; the resolved port is returned."

**Cross-test isolation.** Each socket test needs its own db path *and* its own server. Task 12's
restart test additionally needs the same path across two servers. Both patterns should be written
into the plan, because "restart the server on the same db" (`plan:533`) is one careless
`mkdtemp` away from testing nothing.

**T-11 (major) — the `bad_message` test does not test the contract.** `plan:421-422`: a parse
failure "emits `error{code:"bad_message"}` and drops the frame, **never the connection**". The
listed test (`plan:426`) asserts only that the error arrives. A server that emits the error and
then closes passes it. The frame-not-connection half — the actual contract — is untested:

```ts
test("a malformed frame drops the frame, not the connection", async () => {
  ws.send("{not json");
  expect(await bus.waitFor("error")).toMatchObject({ code: "bad_message" });
  expect(ws.readyState).toBe(WebSocket.OPEN);
  ws.send(JSON.stringify({ t: "chat", mode: "shout", text: "still here" }));
  expect(await bus.waitFor("chat")).toMatchObject({ text: "still here" });   // the socket still works
});
```

Cover all four malformed shapes while you are there, since they take different code paths: non-JSON
text, valid JSON failing the discriminated union (`{"t":"nope"}`), valid `t` with a bad field
(`{"t":"move","x":1.5,"y":0}`), and a binary frame. Only the last one is likely to throw
uncaught.

**T-29 (major), T-28 (major) — the HTTP surface.** `plan:417-418` specifies 400 responses and
CORS `*`; neither is tested. The CORS gap has a nasty shape: Node's `fetch` sends no preflight, so
a server with no `OPTIONS` handler passes every automated test and fails only in the browser, at
Task 10's manual step, where it looks like a client bug.

```ts
test("register rejects a duplicate with 400", async () => {
  await register("alice", "pw");
  const res = await fetch(url("/api/register"), { method: "POST", body: JSON.stringify({ username: "alice", password: "pw" }), headers: { "content-type": "application/json", connection: "close" } });
  expect(res.status).toBe(400);
  expect(await res.json()).toMatchObject({ error: expect.any(String) });
});

test("the browser preflight succeeds", async () => {
  const res = await fetch(url("/api/login"), { method: "OPTIONS", headers: { origin: "http://localhost:5173", "access-control-request-method": "POST", "access-control-request-headers": "content-type", connection: "close" } });
  expect(res.status).toBe(204);
  expect(res.headers.get("access-control-allow-origin")).toBe("*");
  expect(res.headers.get("access-control-allow-headers")).toMatch(/content-type/i);
});
```

**T-40 (major, Task 13) — "leave disposes the room" is unobservable.** `plan:550` asserts it
through sockets, but `startServer` returns only `close` and `port`. There is no way to see the
room map. Add `stats(): { rooms: number }` to the returned handle and assert `1 → 0`; without it
the smoke script's final clause is a comment, not a test.

**T-50/T-51 (minor, Task 13).** One `test()` covering the entire Phase-1 contract means the first
failure hides the other eight assertions, and its walk step needs a real 1.5 s wait
(3 × `MS_PER_TILE`) which is exactly the flake pattern. Split into ordered `test()`s sharing one
`beforeAll` server, and note that `vitest run` in the server package already picks up
`test/smoke.test.ts`, so the `smoke:` Makefile target duplicates it — either exclude the file from
the default run or drop the target.

Also worth pinning in the smoke script, since it is the only place the full path is exercised:
after the walk completes, a third client joins and

```ts
expect((await c.waitFor("room_state")).avatars.find((a) => a.username === "alice"))
  .toMatchObject({ x: 3, y: 6 });
```

which is the only end-to-end proof that server-side position actually advanced (and which fails
today for the reason in T-23).

---

## 6. Manual-only behavior that could be cheaply tested

Tasks 10 and 11 are explicitly manual, and rendering *should* be. But four things sitting behind
that "manual" label are pure logic, load-bearing, and will regress silently:

**T-42 (major) — `Net.onMessage` on a malformed server frame.** The global constraint says "the
client never trusts a malformed server" (`plan:26`) and `Net` "parses via `ServerMsgSchema`"
(`plan:464`). What happens on failure is undefined: an uncaught throw inside a `ws.onmessage`
handler takes down the client's message loop and the room silently stops updating. Define it
("drop the frame, log once, never throw") and test it with a fake socket — no PixiJS needed.

**T-34 (major, Task 12) — the client's placement mirror.** `plan:528-529` has the client
re-implement the fit/stack rules "for feedback only". Two implementations of the same rule, one of
them untested, guaranteed to drift the first time the server's rule changes — and the drift shows
up as a green highlight followed by a red error toast, which reads as a server bug.

Fix: put the predicate in `@grand/shared` and call it from both sides:

```ts
export type PlaceResult = { ok: true; z: number } | { ok: false; code: PlaceErrorCode };
export function canPlace(model: RoomModel, placed: FurniItem[], defs: Map<string, FurniDef>,
                         def: FurniDef, x: number, y: number, dir: number,
                         avatars: Tile[]): PlaceResult;
```

The server calls it and persists on `ok`; the client calls it for the highlight. One test file
covers both, and it is the natural home for the currently-untested rotation (T-19), footprint fit,
and `no_stack` cases.

**T-17 (major) — whisper is unreachable from the UI.** `ChatUi.onSend` emits only
`"say" | "shout"` (`plan:502`), yet the protocol, the server contract with its `whisper_target`
error (`plan:380`), and the Task 13 smoke assertion ("say/shout/whisper delivery matrix",
`plan:549`) all require whisper. Either add a `/whisper <name> <text>` command — parsed by a pure
`parseChatInput(raw): {mode, text, to?}` with its own test, which also covers `/shout` — or cut
whisper from v1 and from the smoke script. Right now the plan ships a server feature no client
can reach and a manual verification (`plan:509-510`) that does not mention it.

**Enter/Shift+Enter** (`plan:502`) is a one-line pure function (`modeFromKey(e)`) and a two-case
test. Leave it manual and the first refactor of the input handler silently makes Shift+Enter
insert a newline instead of shouting.

Finally, **nothing in the plan ever builds the client**. `vitest` only transpiles modules a test
imports, and no test imports `main.ts`, so a client that does not compile passes `make test`
green. Add `pnpm --filter @grand/client exec vite build` to the `test` target, or accept that the
manual demo is the only build check — but say which.

---

## 7. Two things that make the whole slice under-exercised

**T-41 (major, Task 6).** The seeded room is "12 rows × 12 cols of `0`" (`plan:341-342`) — a flat
floor with no void tiles. Consequences: the height-difference step rule (Task 5) is exercised only
in unit fixtures and never end-to-end; `z` stacking is only ever tested on floor height 0
(`plan:404`); the "equal floor height" footprint rule can never fail in the running product;
`screenToTile` ignores `z` entirely (`plan:164-169`), which is *correct* only while the floor is
flat, and the plan never records that limitation; and both manual verification passes (Tasks 10,
12) run on the one layout where all of it is invisible.

Fix: seed a layout with a two-tile-high platform reachable by a one-step ramp, and a void notch:

```
xx0000000000
x00000000000
000011110000
000012210000
000012210000
...
```

That single change puts the cliff rule, ramp climbing, void rejection, and raised-tile draw order
into every manual run and into the smoke test, at the cost of one string constant. Keep the door
at `(0,6)` and re-run the reachability check (Task 3's flood-fill ignores height, so the platform
stays "reachable" — see T-46).

**T-37 (major, Task 1).** The shown `package.json` (`plan:90-100`) gives `@grand/shared` a `test`
script; "server mirrors it"; the client is described only as adding deps and a `dev` script. If
`@grand/client` has no `test` script, `pnpm -r test` **skips it silently** — Task 9's draw-order
tests, the only automated client tests in the plan, never run and nobody notices. The client also
has no `vitest` devDependency in the shown JSON. Pin all three explicitly at Task 1 as
`"test": "vitest run --passWithNoTests"` (the flag is in the plan's prose at `plan:116` but not in
the JSON at `plan:95`, which is the copy the engineer will paste), and make Task 1's acceptance
step "three package headers in the output" so a silently-skipped package fails the step.

---

## 8. Remaining minor findings

**T-44** (Task 3, `plan:213-216`). The letters test asserts `tiles[0]` and `tiles[1]` — both from
the lowercase row. The uppercase row `"AZ"` is parsed and never checked, so the case-insensitive
half of the contract (`plan:190`) is untested. Add
`expect(m.tiles[2]).toBe(10); expect(m.tiles[3]).toBe(35);`.

**T-45** (Task 3, `plan:219`). "split on `\n`, enforce equal row length" makes any heightmap with
a trailing newline ragged and therefore a `HeightmapError`. Room docs are JSON blobs that will be
hand-edited. Decide and test: `test("tolerates one trailing newline", () => expect(() =>
parseHeightmap("00\n00\n", DOOR)).not.toThrow())`. Also pin the empty string
(`parseHeightmap("", DOOR)` must throw, not produce a 0×0 room).

**T-46** (Task 3, `plan:221`). The flood-fill treats "any height difference walkable for
reachability purposes", so a room can validate and still contain tiles the *pathfinder* cannot
reach (a 2-height cliff). That is a deliberate weakening of the guarantee and should be stated,
with a test that documents it:
`test("reachability ignores height — a cliff-locked tile still validates")`.

**T-47** (Task 6, `plan:341`). Seeding is described as "on first run" while the tables use
`CREATE TABLE IF NOT EXISTS`. If the seed is a bare `INSERT` with an explicit `id`, the *second*
`openDb` on the same file throws a constraint error — which is precisely what Task 12's restart
test does. Specify `INSERT OR IGNORE`, and test it directly:
`openDb(p).close(); openDb(p);` then
`expect(db.prepare("SELECT COUNT(*) c FROM rooms").get()).toEqual({ c: 1 })`.

**T-48** (Task 6, `plan:345-349`). The username regex `/^[a-z0-9_-]{3,20}$/i` is specified and
never tested. Four cases, one line each: `"ab"` (too short), 21 chars, `"bad name"`, `"héllo"` —
all `toThrow(AuthError)`. Also untested: `login` for a username that does not exist (must throw
`AuthError`, not return `undefined` or crash on a null row).

**T-49** (Task 4, `plan:277`). `error.code` is `z.string()`, so `"badposition"` and
`"bad_position"` are equally valid and a typo is caught by nothing. Make it a `z.enum` and
enumerate every code the plan uses — which forces the gaps in T-18 to be filled at protocol
definition time rather than discovered in the client.

**T-52** (Task 1, `plan:106-107`). `pnpm ... server dev & pnpm ... client dev` leaves the server
orphaned when the foreground client exits, so the next `make dev` hits `EADDRINUSE` — during the
manual verification steps that Tasks 10, 11 and 12 depend on. Use
`trap 'kill 0' EXIT; A & B & wait`.

**T-54** (Task 8, `plan:417`). The auth endpoints read a JSON body with no size cap. A 100 MB POST
is accumulated in memory. Cap at 1 KiB and reject with 413; one test with a large body.

**T-55** (Task 9, `plan:445,438`). `seq * 1e-7` is part of the key *and* the contract says "equal
keys keep insertion order", tested by "two items with identical keys keep insertion order"
(`plan:449-450`). With `seq` in the key, two distinct items can never have equal keys, so the test
is unconstructable. Also, `seq * 1e-7` collides with `z * 1e-3` past ~10,000 items. Drop `seq`
from the key (ES2019+ `Array#sort` is stable, and PixiJS's child sort is stabilized by
`_lastSortedIndex`), and test stability by sorting two same-key items and asserting the order.

---

## What I checked and found sound

Recorded so nobody re-derives it:

- Task 2's arithmetic. `worldToScreen(3,2,1.5,64)` is `{32,32}`; the scale-32 case is `{0,0}`;
  `screenToTile(worldToScreen(x+0.5,y+0.5,0,64))` floors back to `(x,y)` for all three sample
  tiles. Only the test *count* is wrong (T-43).
- `advanceTimersByTime(1500)` → 3 tiles at `MS_PER_TILE = 500`, given "emit `walk` immediately,
  then advance every `MS_PER_TILE`". Consistent with the client's interpolation contract too.
- The starter-grant check-then-insert is **not** racy in-process: `better-sqlite3` is synchronous,
  so two simultaneous joins cannot interleave between the `SELECT` and the `INSERT`. The real
  idempotency risk is rejoin (T-21), not concurrency.
- `plant-on-table → z = 1.0` follows from `table_basic` stackHeight 1.0 on floor height 0.
- `PROTOTYPE_CATALOG` has exactly 5 defs, so `inventory.length === 5` is the right first-join
  assertion.
- Session tokens live in a table, so they survive the Task 12 restart — the restart test can and
  should reuse the original token.

One claim I could not verify from here: the exact close semantics of `ws@8.18`'s
`WebSocketServer.close()` and whether it terminates tracked clients. My reading of ws 8 is that it
does not (it defers its `close` event until the client set empties), and Node's
`http.Server.close()` definitely waits for open connections. The fix in T-12 — terminate clients
and destroy sockets explicitly — is correct under either reading, so the finding stands, but the
engineer should confirm against the installed version rather than take my word for it.
