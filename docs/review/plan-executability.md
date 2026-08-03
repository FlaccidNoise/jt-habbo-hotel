# Executability review — 2026-08-03-v1-vertical-slice.md

Lens: an engineer with zero codebase context executes the plan task by task, in order, on a clean
machine. Findings are what stops them, forks them, or hands them a wrong artifact a later task
depends on.

Environment used for the experiments: macOS 25.5.0, Node v22.23.1, pnpm 11.18.0, GNU Make 3.81,
resolved TypeScript 5.9.3, Vite 6.4.3, Vitest 3.2.7, zod 3.25.76, better-sqlite3 11.10.0. The plan's
Task 1 scaffold was built verbatim in a scratch directory and the mechanics were run, not reasoned
about. Lines marked **[verified]** were executed.

Counts: 10 blocking, 14 major, 17 minor.

---

## Blocking

### X-01 — `make setup` exits non-zero and better-sqlite3 never builds
**Task 1, plan lines 67–71 and 114.** **[verified]**

pnpm 10 stopped running dependency install scripts unless the package is allow-listed. pnpm 11
changed the allow-list key again. The plan's `pnpm-workspace.yaml` has only `packages:`, so on the
installed pnpm 11.18.0 a clean `pnpm install` ends with:

```
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: better-sqlite3@11.10.0, esbuild@0.25.12
```

Task 1's step "Run `make setup` — expect pnpm lockfile created, exit 0" is false. Worse, the failure
is sticky: **every later `pnpm --filter … test` re-runs the deps check and dies the same way**, so
Task 2 onward cannot run at all. And when the check is bypassed, `better-sqlite3` throws
`Could not locate the bindings file` — Task 6 through Task 13 are dead.

`esbuild` being blocked kills Vitest and Vite too, so this is not a Task 6 problem, it is a Task 1
problem.

**[verified]** `onlyBuiltDependencies` (the pnpm 10 key) does **not** work on pnpm 11.18 — a clean
reinstall still reported ignored builds. The key that works is `allowBuilds`.

Fix — replace the `pnpm-workspace.yaml` block at lines 68–71 with:

```yaml
packages:
  - "packages/*"
allowBuilds:
  better-sqlite3: true
  esbuild: true
```

and add a `"packageManager": "pnpm@11.18.0"` field to the root `package.json` at lines 74–79, so the
key matches the pnpm major the plan is written against. The plan's stated floor of "pnpm ≥ 9" spans
three incompatible behaviours here (9 runs scripts freely, 10 wants `onlyBuiltDependencies`, 11 wants
`allowBuilds`) and must be narrowed to one.

### X-02 — Every `.ts`-extension import fails `tsc`; `pnpm typecheck` cannot pass
**Task 1, lines 80–89; symptoms from Task 2 line 134 onward.** **[verified]**

`tsconfig.base.json` omits `allowImportingTsExtensions`, but the plan's own test files import with
explicit `.ts` extensions (`from "../src/projection.ts"`, line 134; `from "../src/heightmap.ts"`,
line 195). Running the plan's own `typecheck` script against the plan's own Task 2 sources:

```
src/index.ts(1,15): error TS5097: An import path can only end with a '.ts' extension when 'allowImportingTsExtensions' is enabled.
test/projection.test.ts(2,31): error TS5097: ...
[ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL] Command failed with exit code 2: tsc --noEmit
```

The extensions are not optional decoration — the server runs from source under Node's ESM resolver
(line 113), which requires them. So the fix is to enable the flag, not to drop the extensions.

Fix — the `compilerOptions` block at lines 82–87 becomes:

```json
"target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
"strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true,
"allowImportingTsExtensions": true, "noEmit": true, "verbatimModuleSyntax": true,
"types": []
```

`noEmit` is required by `allowImportingTsExtensions` (TS5096) for any editor or `tsc -b` invocation
that does not pass `--noEmit` on the command line. `verbatimModuleSyntax` is X-12.

**[verified]** with those three options added, `pnpm -r exec tsc --noEmit` passes clean across all
three packages, including the server's `import type { RoomModel } from "@grand/shared"` resolving
through the `exports` field to raw `.ts`.

### X-03 — The avatar depth offset has the wrong sign, and Task 9's own test proves it
**Task 9, line 442 versus line 449.** **[verified]**

Line 442 says avatars "subtract `1e-2` relative to furni on the same tile-depth", citing
`AVATAR_SPRITE_DEFAULT_DEPTH`'s sign. Line 439 says "sort ascending by depthKey". Line 449 requires
"an avatar standing at (3,3) draws over a rug at (3,3)".

Running the formula as written: rug at (3,3) keys 6.0000001, avatar at (3,3) keys 5.9900002. Under
an ascending sort the avatar is drawn first, so it is drawn **under** the rug. The test at line 449
fails against the specification at line 442.

The citation is real but was transferred without flipping the convention.
`docs/review/technical-audit.md:231` records the reference sort as `sort((a, b) => (b.z - a.z))` —
**descending** — and `technical-audit.md:299` states the consequence explicitly: "smaller z, drawn
later, on top". The plan inverts the sort direction and must therefore invert the sign.

Fix — line 442, replace "avatars subtract `1e-2`" with "avatars **add** `1e-2` relative to furni on
the same tile-depth (the sign of `AVATAR_SPRITE_DEFAULT_DEPTH = -0.01` inverted, because this sort
is ascending where the reference sort at technical-audit.md:231 is descending)".

The second half of the same test — "but under furni at (4,3)" — passes either way (6.01 < 7), so the
sign error is not caught by that half.

### X-04 — The tile depth rule collapses to a single value and makes the comparator return NaN
**Task 9, line 443.** **[verified]**

"tiles pin to `-Infinity + (x + y) * 1e-9`". In IEEE-754, `-Infinity + anything finite` is
`-Infinity`. Executed:

```
tile(0,0) key: -Infinity   tile(5,5) key: -Infinity   difference: NaN
```

Two consequences. The `(x + y) * 1e-9` term is dead, so tiles have no relative order among
themselves. And an ascending comparator of the form `(a, b) => depthKey(a) - depthKey(b)` returns
`NaN` for any two tiles, which is an invalid comparator — the resulting array order is
implementation-defined. That directly breaks the test at line 450 ("two items with identical keys
keep insertion order") for the one kind that actually produces identical keys.

This also lands in Task 10: line 471 says `world` is "sorted every frame by depthKey", and PixiJS 8
sorts children by numeric `zIndex` using subtraction, so an `-Infinity` zIndex reproduces the same
NaN.

Fix — line 443, replace the tile rule with a finite floor below any reachable furni key:

```
tiles pin to `-1e6 + (x + y)` so the floor always draws first and tiles still order among themselves
```

With a 12×12 seed room the maximum furni key is about 24, so any constant below `-100` is safe;
`-1e6` leaves headroom for larger rooms without approaching float precision loss.

### X-05 — There is no server entrypoint; `make dev` starts nothing, and no port or db path exists
**Task 8, lines 411 and 415; Task 1, lines 106–107.**

`packages/server/src/server.ts` is specified to export exactly one thing:

```ts
export function startServer(opts: { port: number; dbPath: string }): Promise<{ close(): Promise<void>; port: number }>;
```

The dev script at line 411 is `node --watch --experimental-strip-types src/server.ts`. Executing a
module that only declares and exports a function does nothing: no socket is opened, `make dev` prints
nothing, and Task 10's manual verification ("run `make dev`, open two browser windows") cannot start.

Compounding it, **no port number appears anywhere in the plan**, and no `dbPath` value appears
outside the Makefile's `db-reset` line 111, which implies `packages/server/grand.db` without any task
saying so.

Fix — add to Task 8's file list: create `packages/server/src/main.ts` containing

```ts
import { startServer } from "./server.ts";
await startServer({
  port: Number(process.env.PORT ?? 8080),
  dbPath: process.env.DB_PATH ?? new URL("../grand.db", import.meta.url).pathname,
});
```

change the dev script at line 411 to `node --watch --experimental-strip-types src/main.ts`, and state
in the Global constraints block (lines 21–30) that the server listens on 8080 and the client dev
server on Vite's default 5173.

**[verified]** `node --watch --experimental-strip-types` itself works on Node 22.23.1 and correctly
loads a workspace `.ts` dependency through the pnpm symlink — the mechanism is sound, it is only the
missing entrypoint that breaks it. Note the flag requires Node ≥ 22.6.0; the plan says "Node ≥ 22"
(line 18), which is wrong by six minor versions (see X-28).

### X-06 — The client cannot reach the server: two contradictory origin models, neither specified
**Task 8 lines 417–418; Task 10 lines 455, 462, 483–484.**

Line 418 says "CORS `*` for the Vite origin", which means the client calls the server on an absolute
cross-origin URL. Line 484 says the login form's buttons go to `/api/*`, which is same-origin against
Vite's port and will 404 at the Vite dev server. The two readings produce different code:

- Reading A: absolute URLs (`http://localhost:8080/api/register`, `ws://localhost:8080`), server sends
  CORS headers. Requires a base-URL constant that no task defines.
- Reading B: a Vite `server.proxy` entry forwarding `/api` and the WebSocket upgrade to the server,
  no CORS needed at all. Requires `vite.config.ts` content, which Task 10 creates at line 455 and
  never specifies.

Separately, `Net.connect(url, token, roomId)` at line 462 takes a `url` and no task ever says what is
passed. There is no `.env`, no constant, no default.

Fix — pick Reading B and specify it. In Task 10, give `vite.config.ts` its contents:

```ts
import { defineConfig } from "vite";
export default defineConfig({
  server: { proxy: { "/api": "http://localhost:8080", "/ws": { target: "ws://localhost:8080", ws: true } } },
});
```

state that `main.ts` calls `net.connect(`ws://${location.host}/ws`, token, 1)`, and delete "CORS `*`
for the Vite origin" from line 418, replacing it with "the Vite dev server proxies `/api` and `/ws`,
so the server needs no CORS headers". If Reading A is preferred instead, X-15 becomes blocking too.

### X-07 — `openDb`'s declared return type does not compile
**Task 6, line 322.** **[verified]**

```ts
export function openDb(path: string): Database;  // better-sqlite3, runs migrations + seed
```

`@types/better-sqlite3` exports a namespace whose callable is the constructor; the instance type is
`Database.Database`. Compiling the signature exactly as written:

```
src/db.ts(2,39): error TS2709: Cannot use namespace 'Database' as a type.
```

This propagates: Task 6 lines 324–326 and Task 7 line 366 all take `db: Database`, so four signatures
are wrong, not one.

Fix — line 321 add the import, and change every `Database` in a type position to `Database.Database`:

```ts
// db.ts
import Database from "better-sqlite3";
export function openDb(path: string): Database.Database;  // runs migrations + seed
```

**[verified]** `Database.Database` compiles clean under the plan's tsconfig.

### X-08 — Types consumed by later tasks are never exported, and `@grand/shared`'s index never re-exports
**Tasks 4, 7, 10, 12 — lines 121–122, 176, 227, 243–250, 296, 364, 476, 521.**

Task 2 line 122 says "Modify `packages/shared/src/index.ts` to re-export". Task 3 (line 176) and
Task 4 (lines 227–228) create `heightmap.ts`, `protocol.ts`, and `furni.ts` and **never say to
re-export them**. Since `@grand/shared`'s only export entry is `./src/index.ts` (line 94), the
package's public surface after Task 4 contains projection math and nothing else. Task 5 line 296
(`import type { RoomModel } from "@grand/shared"`) is the first consumer to break.

Four named types are then consumed but never declared anywhere:

| Consumed at | Type | Where it should come from | Status |
|---|---|---|---|
| line 476 `constructor(scene, state: AvatarState)` | `AvatarState` | Task 4 | only `AvatarStateSchema` exists (line 243) |
| line 521 `constructor(scene, item: FurniItem, def)` | `FurniItem` | Task 4 | only `FurniItemSchema` exists (line 247) |
| line 477 `walk(path: Tile[], …)` | `Tile` | — | declared in `packages/server/src/pathfind.ts` (line 297); the client does not depend on `@grand/server` and must not |
| line 469 `loadModel(heightmap, door: Door)` | `Door` | Task 3 | exists (line 180) but is not reachable through the index |

Fix, three edits:

1. Task 3 and Task 4 file lists gain "Modify `packages/shared/src/index.ts` to re-export."
2. Task 4's protocol block gains the three missing type aliases after their schemas:
   `export type AvatarState = z.infer<typeof AvatarStateSchema>;` and
   `export type FurniItem = z.infer<typeof FurniItemSchema>;`
3. Move `Tile` out of the server. Add `export interface Tile { x: number; y: number }` to
   `packages/shared/src/protocol.ts` in Task 4, and change Task 5 line 297 from declaring it to
   importing it. The server keeps `findPath`, both sides get `Tile`.

### X-09 — Task 1 commits `node_modules`; no `.gitignore` is ever created
**Task 1, line 117.** **[verified]** — the repository at `<repos>/jt-habbo-hotel`
has three commits and no `.gitignore`.

The step order is `make setup` (line 114, installs 108 packages) → `pnpm test` (115) →
`git add -A && git commit -m "Workspace scaffold"` (117). No task in the plan creates a `.gitignore`,
so the first commit ingests `node_modules/`, and Task 6 onward adds `packages/server/grand.db` and
the Vite `dist/` output. The Global constraint at line 30 ("Commit after every task's PASS step")
repeats the mistake twelve more times.

Fix — insert as the first checkbox of Task 1, before `make setup`:

```
- [ ] `.gitignore`:
  ```
  node_modules/
  dist/
  *.db
  *.db-journal
  *.db-wal
  ```
```

### X-10 — `pickup` must move other items but the protocol has no message for it, and Task 4 forbids adding one
**Task 7 lines 388–390 versus Task 4 line 230.**

Line 230: "the whole wire format — later tasks may not invent messages outside this file."
Lines 388–390: on pickup, "Items stacked on top of it drop by its stack height (keep it simple:
recompute z for items above on the same origin tile)" and the emitted messages are `furni_removed`
plus `inventory_add`.

The recomputed items are neither removed nor added — their `z` changed. `ServerMsgSchema` (lines
263–278) has no message that carries an updated `FurniItem`. The server writes the new `z` to SQLite
and every connected client keeps rendering the old one until it rejoins. Task 12's manual check
("pick everything back up") walks straight into it: pick up the table under a plant and the plant
hangs in the air for every client in the room.

Fix — add one variant to `ServerMsgSchema` at line 276:

```ts
z.object({ t: z.literal("furni_moved"), item: FurniItemSchema }),
```

and change line 390 to "…recompute z for items above on the same origin tile, emitting
`furni_moved` for each". Task 12's `FurniSprite` (line 521) gains a matching update path.

---

## Major

### X-11 — `@grand/client` has no Vitest, and no `test` script; Task 9 has nowhere to run
**Task 1 line 100, Task 9 line 432.** **[verified]**

Line 100 describes the client package as adding `"@grand/shared"`, `"pixi.js"`, dev `"vite"`, and a
`"dev": "vite"` script. Vitest is not in that list and neither is a `test` script. Task 9 then creates
`packages/client/test/sort.test.ts` and Task 13 line 551 expects "`make test` green across all
packages".

Executed with the client's `test` script removed, `pnpm -r test` **silently skips the package** —
no warning, exit 0. Task 1's step at line 115 ("expect all three packages report 'no test files
found' without erroring") is therefore wrong on its own terms (see X-20), and Task 9's tests would
never run in CI without anyone noticing.

Fix — line 100, the client sentence becomes: `@grand/client` adds
`"@grand/shared": "workspace:*", "pixi.js": "^8.0.0"`, dev `"vite": "^6.0.0"`, `"vitest": "^3.0.0"`,
`"typescript": "^5.5.0"`, and scripts `"dev": "vite"`, `"test": "vitest run --passWithNoTests"`.

### X-12 — A type-only import without the `type` keyword crashes the server at runtime, and `tsc` stays silent
**Task 7 line 364, Task 8; root cause in the tsconfig at lines 80–89.** **[verified]**

Node's type stripping erases annotations but does not do TypeScript's import elision. A plain
`import { RoomModel } from "@grand/shared"` compiles clean (tsc exit 0, verified) and then throws
`SyntaxError: The requested module … does not provide an export named 'RoomModel'` under
`node --experimental-strip-types` (verified). Task 7's `Emit` at line 364 references `ServerMsg`,
Task 5 line 296 references `RoomModel`, Task 8 references `ClientMsg` — every one is a type-only
import in a file the server executes from source, and the plan shows the `import type` form in only
one of them (line 296).

This is the failure mode most likely to eat an afternoon, because the typechecker reports success.

Fix — covered by adding `"verbatimModuleSyntax": true` to `tsconfig.base.json` in X-02, which makes
`tsc` reject the value-import form at build time. Also add to the Global constraints at line 21:
"Server code runs from source under Node type stripping — every type-only import must use
`import type`, enforced by `verbatimModuleSyntax`."

### X-13 — The `walk` message has no origin, so a cancelled walk desyncs the client permanently
**Task 4 lines 270–271, Task 7 lines 391–394.**

```ts
z.object({ t: z.literal("walk"), id: …, msPerTile: …, path: z.array({x, y}) })
```

`path` "excludes `from`, includes `to`" (line 302). Line 394: "A new `requestMove` cancels the pending
walk at the current tile." The client is mid-interpolation between two tiles when the new `walk`
arrives, and the message does not say which tile the server stopped at. The client must guess, and
its guess is wrong whenever the cancel lands mid-step — which is the common case, since a player
clicking a new destination clicks during a walk.

There is no resync message either: `room_state` is only sent on join (line 264).

Fix — line 270, add the origin to the message:

```ts
z.object({ t: z.literal("walk"), id: z.number().int(), msPerTile: z.number().int(),
           from: z.object({ x: z.number().int(), y: z.number().int() }),
           path: z.array(z.object({ x: z.number().int(), y: z.number().int() })) }),
```

and line 394 becomes "A new `requestMove` cancels the pending walk at the occupant's current tile and
emits a new `walk` whose `from` is that tile; the client snaps to `from` before interpolating."

### X-14 — Nothing disposes a `Room`'s walk timers; the test suite will hang
**Task 7 lines 365–374 and 393, Task 8 line 422, Task 12 line 533.**

Line 393 advances occupants "via `setInterval`". Line 422 says a Room is "disposed when
`occupantCount()` hits 0". The `Room` class interface at lines 365–374 has no `dispose`, `close`, or
`stop` method, so there is no way to clear those intervals. A player who leaves mid-walk leaves a
live interval referencing a dead occupant, and — because unref'd timers are not specified — the Node
process never exits, so `startServer(…).close()` never resolves and Vitest hangs at the end of
Task 8's integration run.

The same gap hits `openDb`: Task 12 line 533 requires "restart the server on the same db", and
neither `openDb` (line 322) nor the `Room` holds a way to close the SQLite handle. better-sqlite3
keeps the file and any `-wal` sidecar open.

Fix — add to the `Room` interface at line 373: `dispose(): void;  // clears pending walk timers`.
Add to Task 6's db interface at line 322: `export function closeDb(db: Database.Database): void;`.
State at line 422: "Room disposal calls `room.dispose()` before dropping the instance, and
`close()` disposes every live room then calls `closeDb`."

### X-15 — Under the CORS reading, the browser's preflight is unhandled and registration fails
**Task 8 lines 417–418.**

`POST /api/register` with `Content-Type: application/json` from a different origin is not a simple
request — the browser sends `OPTIONS` first. The plan specifies only the two `POST` routes and the
bare phrase "CORS `*`". Without an `OPTIONS` handler returning `Access-Control-Allow-Headers:
content-type`, the login form at line 484 fails in the browser while working perfectly in Task 8's
`fetch`-based integration tests (Node's fetch does not preflight). Manual verification in Task 10
would be the first place it surfaces.

Fix — if X-06 is resolved via the Vite proxy this finding disappears. If the absolute-URL reading is
kept, line 418 must read: "CORS: respond to `OPTIONS /api/*` with 204 and
`Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: POST, OPTIONS`,
`Access-Control-Allow-Headers: content-type`; send the same `Allow-Origin` header on the POST
responses."

### X-16 — Pre-join errors cannot be sent: `Emit` is keyed by an account that does not exist yet
**Task 7 line 364, Task 8 lines 419–421.**

```ts
export type Emit = (accountId: number, msg: ServerMsg) => void;
```

Line 420: "Every inbound frame parses through `ClientMsgSchema` — parse failure emits
`error{code:"bad_message"}`". Before `join` succeeds there is no account id, so the two frames that
most need an error reply — malformed JSON sent first, and a `join` with a bad token — have no
addressee. Task 8's test list at line 426 requires exactly this: "malformed JSON produces `error
bad_message`".

The bad-token case is separately specified to close with 4401 (line 420), so only the pre-join
malformed case is undefined, but it is a required test.

Fix — line 420 becomes: "Frame validation happens at the socket layer, which replies on the socket
directly (not through `Room.emit`); `Emit` is only used after `join` binds an account to the socket.
A malformed frame received before `join` still replies `error{code:"bad_message"}` on that socket."

### X-17 — `dir` is unbounded on the wire, contradicting the plan's own trust rule
**Task 4 lines 249 and 258 versus line 25.**

Line 25: "the server never trusts a client field". But:

- `FurniItemSchema.dir: z.number().int()` (line 249) — no range
- `ClientMsg place.dir: z.number().int()` (line 258) — no range

while `AvatarStateSchema.dir` two lines above (line 245) correctly has `.min(0).max(7)`. A client can
send `dir: 2147483647`, it validates, and Task 7's footprint-rotation rule ("rotated for dir 2/6",
line 383) has no defined behaviour for it. The value is then persisted to SQLite and re-broadcast to
every other client.

Fix — lines 249 and 258, change both to `dir: z.number().int().min(0).max(7)`. Then resolve what
dirs 1/3/5/7 mean for a footprint: line 383 defines rotation for 2/6 only. State either "furni dir is
restricted to 0, 2, 4, 6" (and use `z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(6)])`)
or give the odd dirs a footprint rule.

### X-18 — Task 12's stated FAIL condition is wrong; the test passes as soon as it is written
**Task 12, lines 532–535.**

"Extend `packages/server/test/server.test.ts` with one end-to-end case: place from inventory → both
sockets receive `furni_placed`; restart the server on the same db → rejoin → `room_state.furni` still
contains the item… **Run — FAIL until client+server wiring complete, then PASS.**"

The test drives two `ws` clients against `startServer` directly. It does not load the client bundle,
PixiJS, or `main.ts`. Every capability it exercises — inventory, `place`, `furni_placed`,
persistence, `room_state.furni` — was completed in Tasks 7 and 8. The engineer writes it, it passes,
and the plan told them to expect a failure, so they will hunt for a missing dependency that does not
exist.

Fix — line 535 becomes: "Run — FAIL (test not yet written), implement nothing new server-side, run —
PASS. This case verifies Task 7/8 work; the client wiring in this task is verified manually below."

### X-19 — `requestMove` has no defined behaviour when no path exists
**Task 7 lines 369 and 391–392; Task 5 line 302.**

`findPath` returns `null` for "no path" (line 302), and `blocked` includes "tiles under other
avatars" (line 392). Clicking a tile another player is standing on — routine in a two-player demo —
returns `null`. Line 369 says `requestMove` "paths + emits walk + advances position on a timer" and
says nothing about the null branch. The error code list at line 387 covers `place` only
(`not_owner`, `bad_position`, `occupied`, `no_stack`); there is no movement error code.

Two engineers build: (a) silent no-op, (b) `error{code:"no_path"}`. The client-side difference is
visible — one shows nothing when you misclick, the other shows a toast.

Fix — line 369 becomes: `requestMove(accountId, x, y): void;  // paths, emits walk; emits
error{code:"no_path"} and does nothing if findPath returns null`. Add `no_path` to the error-code
list at line 387.

### X-20 — Task 1's two verification steps do not describe what actually happens
**Task 1, lines 114–116.** **[verified]**

Both stated expectations are false on a clean machine:

- Line 114 "Run `make setup` — expect pnpm lockfile created, exit 0" → exits non-zero with
  `ERR_PNPM_IGNORED_BUILDS` (X-01).
- Line 115 "Run `pnpm test` — expect all three packages report 'no test files found'" → the client
  has no `test` script (X-11), so pnpm skips it silently and only two packages report.

An engineer following the plan cannot tell whether they have made a mistake or whether the plan is
wrong, at the very first checkpoint. Every downstream task inherits the doubt.

Fix — after X-01 and X-11 are applied, line 115's expectation becomes "expect `shared` and `server`
to report 'no test files found' and `client` likewise, all exit 0 — three `Done` lines".

### X-21 — The chat filter's matching rules are three separate unspecified algorithms
**Task 7, lines 397–399.**

"hit replaces with 'blah' case-insensitively on word boundaries, repeated-letter collapse ('shiiit'
hits), clean text passes unchanged", against `filterChat(words: Set<string>, text: string): string`.

Undefined, and each fork gives different output:

1. Does the replacement preserve the original casing or always emit lowercase `blah`? "SHIT" → "blah"
   or "BLAH"?
2. Repeated-letter collapse: is it applied to the *input* before matching (which loses the original
   spans, so you cannot substitute back into the original string), or is each wordlist entry expanded
   to a regex `s+h+i+t+`? The second also matches "shiiiiit" and "sshit"; the first does not match
   "s h i t".
3. Does collapse mean "≥2 identical adjacent letters collapse to 1" (so "book" → "bok" and a wordlist
   entry "boo" now matches "book")? False positives on clean text are the failure the third test
   ("clean text passes unchanged") is supposed to catch, and it will catch them non-deterministically
   depending on the seeded wordlist at line 397, whose contents are also unspecified ("a dozen
   obvious words").

Fix — line 398 becomes: "`filterChat` builds one case-insensitive regex per wordlist entry by
expanding each character `c` to `c+`, joined and anchored with `\b`, and replaces every match with
the literal lowercase `blah`. Collapse is expressed in the pattern, never applied to the input, so
the surrounding text is returned unchanged. `filter-words.txt` ships with exactly these twelve
entries: …" and list them, so the test at line 398 is reproducible.

### X-22 — "identical keys keep insertion order" is unreachable while `seq` is in the key
**Task 9, lines 438 and 444 versus 450.**

Line 444 makes `seq * 1e-7` part of `depthKey`. Line 438's comment says "equal keys keep insertion
order". Line 450 tests "two items with identical keys keep insertion order". If `seq` is unique per
sortable — which is the only reading under which it functions as a "stable tiebreaker epsilon"
(line 444) — then no two items ever have identical keys and the test cannot be constructed except by
deliberately assigning duplicate `seq` values, which contradicts the field's purpose.

The one case that does produce identical keys is tiles, and that case is broken by X-04.

Fix — line 450, replace the case with one that tests what the epsilon is for: "two furni at the same
tile and z with `seq` 4 and 7 sort in seq order regardless of insertion order". Delete the "equal
keys keep insertion order" comment at line 438 and replace with "`seq` must be unique per sortable;
it makes the key total so the sort is deterministic."

### X-23 — Multi-tile `z` is computed from one tile while the stack check runs on all of them
**Task 7, lines 383–385.**

"Footprint … must fit on non-void tiles at equal floor height, all tiles free of avatars, and every
covered tile's current stack top must be `canStackOn` (or empty). Computed `z` = floor height + sum
of stack heights under the footprint's **origin tile**."

The validation is per-tile; the placement is single-tile. Place the 3×2 `rug_basic` so that its
origin tile is bare and one covered tile holds a `table_basic` (stack 1.0, `canStackOn: true`): every
covered tile passes the check, and `z` computes to 0. The rug renders through the table.

Two engineers resolve this differently — max over covered tiles, or origin only as written — and the
divergence is silent until someone places a rug next to a table.

Fix — line 385 becomes: "Computed `z` = floor height + the **maximum**, over every covered tile, of
the summed stack heights on that tile. All covered tiles must agree on floor height (already
required), so the item sits level."

### X-24 — Placement rules are specified once, on the server, then required again on the client
**Task 12, lines 528–529 versus Task 7, lines 382–386.**

"hover shows footprint highlight (green fits / red rejects, client mirror of the placement rules for
feedback only — server remains the authority)". The rules live in `packages/server/src/room.ts`
(line 46), which the client does not and must not import. So the engineer reimplements footprint
rotation, floor-height equality, avatar occupancy, and `canStackOn` traversal a second time, in a
second language of the same codebase, with no shared test.

The plan's own architecture statement (lines 8–9) says `@grand/shared` "holds pure logic both sides
import". Placement validity is exactly that.

Fix — add to Task 4's file list: `packages/shared/src/placement.ts`, exporting

```ts
export interface PlacementCtx { model: RoomModel; furni: FurniItem[]; defs: Map<string, FurniDef>;
                                avatars: { x: number; y: number }[] }
export type PlacementResult = { ok: true; z: number } | { ok: false; code: "bad_position" | "occupied" | "no_stack" };
export function checkPlacement(ctx: PlacementCtx, def: FurniDef, x: number, y: number, dir: number): PlacementResult;
```

Task 7's `place` calls it and adds only the ownership check (`not_owner`); Task 12's hover highlight
calls the same function. One implementation, one set of tests.

---

## Minor

- **X-25** — Task 2 line 171 says "expect PASS (6 tests)". **[verified]** the test file as written at
  lines 132–150 produces **8** tests (4 in the first `describe`, 1 standalone, 3 from the loop). Change
  "6" to "8".
- **X-26** — Task 4 lines 281–284 say the catalog is "exactly" five defs but leave required booleans
  unstated: `table_basic` has no `canWalk`/`canSit`, `sofa_basic` no `canWalk`/`canStackOn`,
  `plant_basic` none of the three, `rug_basic` no `canSit`. `FurniDefSchema` requires all three, and
  `name` values are never given though Task 12 line 528 lists inventory "by def name". Write the five
  defs out as a literal TS array in the plan.
- **X-27** — Task 3 line 221 validates reachability with a flood fill that is "4-directional, any
  height difference walkable", while Task 5 line 304 pathfinds 8-directionally with `|Δheight| ≤ 1`.
  A room can pass validation and still contain tiles no player can walk to. State the divergence is
  deliberate, or make the validator use the pathfinding rule.
- **X-28** — Line 18 says "Node ≥ 22". `--experimental-strip-types` landed in **22.6.0**; on
  22.0–22.5 the dev script dies with an unknown-option error. Change to "Node ≥ 22.6" and add
  `"engines": { "node": ">=22.6" }` to the root `package.json` at lines 74–79.
- **X-29** — `loadWordlist(path: string)` (line 360) is never called with a stated path.
  `filter-words.txt` sits at `packages/server/filter-words.txt` (line 48), so any relative path works
  under both `pnpm --filter @grand/server` and the dev script by coincidence of cwd, and breaks the
  moment either is run from the repo root. Specify
  `loadWordlist(new URL("../filter-words.txt", import.meta.url).pathname)`.
- **X-30** — The db path appears only as `packages/server/grand.db` inside the `db-reset` target
  (line 111). No task states it. See X-05's fix.
- **X-31** — `make dev` (lines 106–107) backgrounds the server with `&` and runs Vite in the
  foreground; Ctrl-C kills Vite and orphans the server, which then holds port 8080 and makes the next
  `make dev` fail confusingly. Use `trap 'kill 0' INT; pnpm --filter @grand/server dev & pnpm --filter @grand/client dev`
  in a single recipe line.
- **X-32** — `ChatUi.onSend` and `showBubble` (lines 502–503) accept `"say" | "shout"` only, but the
  protocol (line 255) and `Room.chat` (line 370) support `whisper`, and Task 13 line 548 asserts a
  "say/shout/whisper delivery matrix". Whisper is reachable from the smoke test and unreachable from
  the UI. Either add it to `ChatUi` or state that whisper is protocol-only in Phase 1.
- **X-33** — Line 395: "New occupants spawn at the door tile." Two occupants therefore stand on the
  same tile, and the second one's own tile is `blocked` by the first (line 392). Specify whether the
  mover's own tile is exempt from `blocked` (it must be, or `findPath` fails from the start tile),
  and whether spawn should search outward for a free tile.
- **X-34** — Task 1 line 63 creates `packages/client/src/index.ts` and the client `exports` field
  points at it (line 100), but the client is an application consumed through `index.html` →
  `/src/main.ts` (line 454). The file stays empty forever and the `exports` field is meaningless.
  Drop both for `@grand/client`.
- **X-35** — Line 341 "Seed on first run" gives no idempotency mechanism, while the schema above it
  is explicitly `CREATE TABLE IF NOT EXISTS`. Specify
  `INSERT OR IGNORE INTO rooms (id, owner_id, name, doc) VALUES (1, NULL, 'The Casino Floor', ?)`.
- **X-36** — Task 13 line 549 asserts "leave disposes the room". Nothing observable through a
  WebSocket reports disposal. Either export a `roomCount()` from `startServer`'s return value or drop
  the assertion.
- **X-37** — Task 3 line 214 writes `DOOR.x === 0 ? { x: 0, y: 0, dir: 2 } : DOOR`, where `DOOR` is
  the const `{ x: 0, y: 1, dir: 2 }` declared at line 197. The condition is always true, so the
  ternary is dead. Write the door literal directly.
- **X-38** — Task 6 line 345 constrains usernames but says nothing about passwords — the empty string
  registers successfully. Add a minimum length to the rejection rule at line 345.
- **X-39** — Line 471 says `RoomScene.world` is "sorted every frame by depthKey", but PixiJS 8 has no
  comparator hook: `sortableChildren` sorts by the numeric `zIndex` property only. State the
  mechanism — "set `sprite.zIndex = depthKey(sortable)` on every change and set
  `world.sortableChildren = true`" — and note it interacts with X-04.
- **X-40** — Task 10's pure-logic tests (line 487) test "position at 250ms of a 500ms tile step is the
  midpoint", but `AvatarSprite.walk` (line 477) is a PixiJS-bound method with no return value. The
  interface block declares no testable pure function. Add
  `export function lerpStep(a: {sx,sy}, b: {sx,sy}, t: number): {sx,sy}` and
  `export function dirFromStep(dx: number, dy: number): number` to `scene/avatar.ts`'s interface.
- **X-41** — `sessions` (lines 334–335) has no expiry column and nothing ever deletes rows. Fine for a
  prototype, but say so, because "session tokens" (line 43) implies otherwise.

---

## Mechanisms that were checked and do work

Recorded so the same ground is not re-covered. All **[verified]** by execution in a scratch
workspace, not by reading documentation.

- pnpm workspace `exports: { ".": "./src/index.ts" }` pointing at raw TypeScript resolves correctly
  from Node, tsc, Vitest, and Vite alike.
- `node --watch --experimental-strip-types` runs the server from source on Node 22.23.1, including
  importing `@grand/shared`'s `.ts` through the pnpm symlink — Node's `node_modules` type-stripping
  restriction does not bite, because it resolves the symlink to a real path outside `node_modules`.
- pnpm's strict isolation does not break transitive deps: `zod` declared only on `@grand/shared`
  resolves fine when shared's code is loaded by the server process.
- Vitest 3.2.7 runs `.ts` tests in every package and resolves the cross-package workspace import.
- Vite 6.4.3 builds a client importing both the workspace TS package and `pixi.js` (720 modules,
  clean).
- better-sqlite3 11.10.0 loads and runs on Node 22.23.1 once builds are allowed — the prebuild
  downloads, no compiler needed.
- `moduleResolution: "bundler"` typechecks the server package correctly; and because the plan omits
  `lib`, `target: "ES2022"` pulls the *full* ES2022 lib including DOM, so the client's `document` and
  `HTMLElement` resolve without an explicit `lib` entry.
- `make` recipes work with the plan's targets, and the `pnpm --filter <pkg> <script>` shorthand
  resolves scripts correctly, as does `pnpm --filter @grand/server exec vitest run test/smoke.test.ts`
  (Task 13, line 550).
- The projection math in Task 2 is arithmetically correct — all 8 tests pass against the
  implementation at lines 154–169, including the `screenToTile` round trip.
