# Plan: The Grand — Phase 1 vertical slice (walkable room + chat + furni)

**Goal:** a running prototype where two browsers join the same isometric room, walk avatars,
chat with the 5-tile speak rule, and place/pick up furniture that persists — proving the
projection constants, heightmap format, pathfinding, draw order, and server-authoritative
protocol from [GAME.md](../design/GAME.md) / [PIPELINES.md](../design/PIPELINES.md).

**Architecture:** pnpm monorepo, three packages. `@grand/shared` holds pure logic both sides
import (projection math, heightmap parser, protocol schemas, furni defs). `@grand/server` is one
Node process — WebSocket room server with SQLite persistence, module seams named after the
PIPELINES §5 services so the scale split stays possible. `@grand/client` is a PixiJS 8 + Vite
web client. Server is authoritative for movement, chat delivery, and furni state; the client
renders and requests.

**Phasing:** this plan is build-order steps 1–2 only. NPC staff, the generator pipeline,
trade + ledger, and the arcade game are later plans, written after this lands.

**Tech stack:** Node ≥ 22, pnpm ≥ 9, TypeScript ^5.5, PixiJS ^8, Vite ^6, Vitest ^3, zod ^3,
ws ^8, better-sqlite3 ^11. No other runtime dependencies.

**Global constraints:**
- Projection constants are law: 64×32 px tile diamond at zoom 1, 32 px per height unit, +X →
  (+32, +16) px, +Y → (−32, +16) px, +Z → (0, −32) px. Zoom 0.5 halves all six numbers.
- All world coordinates are integers. Tile origin (0,0) is the room's top corner.
- Every WebSocket message validates through the zod schemas in `@grand/shared` — the server
  never trusts a client field, the client never trusts a malformed server.
- The heightmap validator rejects; it never skips (audit F3).
- Package names: `@grand/shared`, `@grand/server`, `@grand/client`. Test files sit in
  `test/` beside `src/` in each package.
- Commit after every task's PASS step.

## File map

| File | Responsibility |
|---|---|
| `Makefile` | setup / dev / test / db-reset entry points |
| `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json` | workspace wiring |
| `packages/shared/src/projection.ts` | world↔screen math, the six constants |
| `packages/shared/src/heightmap.ts` | parse + validate the text heightmap |
| `packages/shared/src/protocol.ts` | zod schemas + TS types for every message |
| `packages/shared/src/furni.ts` | furni def type + the seeded prototype catalog |
| `packages/server/src/db.ts` | SQLite open/migrate/seed |
| `packages/server/src/auth.ts` | register/login (scrypt), session tokens |
| `packages/server/src/pathfind.ts` | A* on heightmap + furni blocking |
| `packages/server/src/filter.ts` | wordlist substitution ("blah") |
| `packages/server/src/room.ts` | Room class: occupants, movement ticks, chat, furni ops |
| `packages/server/src/server.ts` | HTTP (auth endpoints) + WebSocket wiring |
| `packages/server/filter-words.txt` | the wordlist, one word per line |
| `packages/client/index.html`, `vite.config.ts` | client shell |
| `packages/client/src/net.ts` | WebSocket client, typed send/receive |
| `packages/client/src/scene/sort.ts` | draw-order comparator |
| `packages/client/src/scene/room.ts` | tile rendering, click→tile |
| `packages/client/src/scene/avatar.ts` | avatar sprite + walk interpolation |
| `packages/client/src/scene/furni.ts` | furni sprites (placeholder boxes) |
| `packages/client/src/ui/chat.ts` | input box + speech bubbles |
| `packages/client/src/main.ts` | boot: login form, join, wire scene+net+ui |

---

### Task 1: Workspace scaffold

**Files:** Create `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`, `Makefile`,
and per-package `package.json` + `tsconfig.json` + empty `src/index.ts` for the three packages.

**Interfaces:** produces the build/test skeleton every later task runs inside.

- [ ] `pnpm-workspace.yaml`:
  ```yaml
  packages:
    - "packages/*"
  ```
- [ ] Root `package.json`:
  ```json
  {
    "name": "grand",
    "private": true,
    "scripts": { "test": "pnpm -r test", "typecheck": "pnpm -r exec tsc --noEmit" }
  }
  ```
- [ ] `tsconfig.base.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
      "strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true,
      "types": []
    }
  }
  ```
- [ ] `packages/shared/package.json`:
  ```json
  {
    "name": "@grand/shared", "type": "module",
    "exports": { ".": "./src/index.ts" },
    "scripts": { "test": "vitest run" },
    "devDependencies": { "typescript": "^5.5.0", "vitest": "^3.0.0" },
    "dependencies": { "zod": "^3.23.0" }
  }
  ```
  `@grand/server` mirrors it adding `"dependencies": { "@grand/shared": "workspace:*", "ws": "^8.18.0", "better-sqlite3": "^11.0.0" }` and `"devDependencies"` adding `"@types/ws"`, `"@types/better-sqlite3"`, `"@types/node"`. `@grand/client` adds `"@grand/shared": "workspace:*", "pixi.js": "^8.0.0"` and dev `"vite": "^6.0.0"`, script `"dev": "vite"`.
- [ ] Each package `tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src", "test"] }` (server's adds `"types": ["node"]`).
- [ ] `Makefile`:
  ```make
  setup:
  	pnpm install
  dev:
  	pnpm --filter @grand/server dev & pnpm --filter @grand/client dev
  test:
  	pnpm test
  db-reset:
  	rm -f packages/server/grand.db
  ```
  (server `dev` script comes in Task 8: `"dev": "node --watch --experimental-strip-types src/server.ts"`.)
- [ ] Run `make setup` — expect pnpm lockfile created, exit 0.
- [ ] Run `pnpm test` — expect all three packages report "no test files found" without erroring
  (add `"passWithNoTests": true` via `vitest run --passWithNoTests` in each test script).
- [ ] Commit: `git add -A && git commit -m "Workspace scaffold"`.

### Task 2: Projection math (`@grand/shared`)

**Files:** Create `packages/shared/src/projection.ts`, `packages/shared/test/projection.test.ts`.
Modify `packages/shared/src/index.ts` to re-export.

**Interfaces (exact, used by every render and click-handling task):**
```ts
export type Scale = 64 | 32;
export function worldToScreen(x: number, y: number, z: number, scale: Scale): { sx: number; sy: number };
export function screenToTile(sx: number, sy: number, scale: Scale): { x: number; y: number };
```

- [ ] Write `test/projection.test.ts` first:
  ```ts
  import { describe, expect, test } from "vitest";
  import { worldToScreen, screenToTile } from "../src/projection.ts";

  describe("verified Habbo constants at scale 64", () => {
    test("+1 X is +32,+16", () => expect(worldToScreen(1, 0, 0, 64)).toEqual({ sx: 32, sy: 16 }));
    test("+1 Y is -32,+16", () => expect(worldToScreen(0, 1, 0, 64)).toEqual({ sx: -32, sy: 16 }));
    test("+1 Z is 0,-32", () => expect(worldToScreen(0, 0, 1, 64)).toEqual({ sx: 0, sy: -32 }));
    test("composite", () => expect(worldToScreen(3, 2, 1.5, 64)).toEqual({ sx: 32, sy: 32 }));
  });
  test("scale 32 halves everything", () =>
    expect(worldToScreen(1, 1, 1, 32)).toEqual({ sx: 0, sy: 0 - 16 + 16 }));
  describe("screenToTile inverts the floor plane", () => {
    for (const [x, y] of [[0, 0], [5, 3], [9, 9]] as const)
      test(`tile ${x},${y} round-trips through its center`, () => {
        const { sx, sy } = worldToScreen(x + 0.5, y + 0.5, 0, 64);
        expect(screenToTile(sx, sy, 64)).toEqual({ x, y });
      });
  });
  ```
- [ ] Run `pnpm --filter @grand/shared test` — expect FAIL (module missing).
- [ ] Implement:
  ```ts
  export type Scale = 64 | 32;

  export function worldToScreen(x: number, y: number, z: number, scale: Scale) {
    const h = scale / 2;        // 32 at zoom 1: horizontal step
    const v = scale / 4;        // 16 at zoom 1: vertical step
    const zu = scale / 2;       // 32 at zoom 1: height unit
    return { sx: (x - y) * h, sy: (x + y) * v - z * zu };
  }

  export function screenToTile(sx: number, sy: number, scale: Scale) {
    const h = scale / 2, v = scale / 4;
    const x = sx / h / 2 + sy / v / 2;
    const y = sy / v / 2 - sx / h / 2;
    return { x: Math.floor(x), y: Math.floor(y) };
  }
  ```
- [ ] Run `pnpm --filter @grand/shared test` — expect PASS (6 tests).
- [ ] Commit.

### Task 3: Heightmap parser (`@grand/shared`)

**Files:** Create `packages/shared/src/heightmap.ts`, `packages/shared/test/heightmap.test.ts`.

**Interfaces:**
```ts
export interface Door { x: number; y: number; dir: number }          // dir 0-7
export interface RoomModel {
  width: number; height: number;
  tiles: Int16Array;                    // width*height, row-major; -1 = void, else floor height
  door: Door;
}
export class HeightmapError extends Error {}
export function parseHeightmap(text: string, door: Door): RoomModel; // throws HeightmapError
export function tileHeight(m: RoomModel, x: number, y: number): number; // -1 if void/out of bounds
```
Format: rows separated by `\n`, `x` = void, `0-9` = heights 0–9, `a-z` = 10–35, case-insensitive.

- [ ] Write tests first:
  ```ts
  import { expect, test } from "vitest";
  import { parseHeightmap, HeightmapError } from "../src/heightmap.ts";

  const DOOR = { x: 0, y: 1, dir: 2 };
  test("parses a simple room", () => {
    const m = parseHeightmap("xx00\n0000\n0012", DOOR);
    expect([m.width, m.height]).toEqual([4, 3]);
    expect(m.tiles[0]).toBe(-1);
    expect(m.tiles[2 * 4 + 3]).toBe(2);
  });
  test("rejects ragged rows instead of skipping", () =>
    expect(() => parseHeightmap("000\n00\n000", DOOR)).toThrow(HeightmapError));
  test("rejects invalid characters", () =>
    expect(() => parseHeightmap("00\n0!", DOOR)).toThrow(HeightmapError));
  test("rejects a door on a void tile", () =>
    expect(() => parseHeightmap("x0\n00", { x: 0, y: 0, dir: 2 })).toThrow(HeightmapError));
  test("rejects tiles unreachable from the door", () =>
    // right column separated by a void wall — unreachable
    expect(() => parseHeightmap("0x0\n0x0", DOOR)).toThrow(HeightmapError));
  test("letters map to 10-35", () => {
    const m = parseHeightmap("az\nAZ", DOOR.x === 0 ? { x: 0, y: 0, dir: 2 } : DOOR);
    expect(m.tiles[0]).toBe(10); expect(m.tiles[1]).toBe(35);
  });
  ```
- [ ] Run — expect FAIL.
- [ ] Implement: split on `\n`, enforce equal row length (else throw), map chars
  (`x`→−1, digit→value, letter→`10 + code - 97` after lowercasing, anything else throws), then
  flood-fill (4-directional, any height difference walkable for reachability purposes) from the
  door tile and throw if any non-void tile is unreached. Door on void or out of bounds throws.
- [ ] Run — expect PASS. Commit.

### Task 4: Protocol schemas (`@grand/shared`)

**Files:** Create `packages/shared/src/protocol.ts`, `packages/shared/test/protocol.test.ts`,
`packages/shared/src/furni.ts`.

**Interfaces (the whole wire format — later tasks may not invent messages outside this file):**
```ts
import { z } from "zod";

export const FurniDefSchema = z.object({
  id: z.string(), name: z.string(),
  w: z.number().int().min(1), l: z.number().int().min(1),   // footprint
  stackHeight: z.number().min(0),                            // in height units (fractional ok)
  canWalk: z.boolean(), canSit: z.boolean(), canStackOn: z.boolean(),
  color: z.number().int(),                                   // placeholder-art tint
});
export type FurniDef = z.infer<typeof FurniDefSchema>;

export const AvatarStateSchema = z.object({
  id: z.number().int(), username: z.string(),
  x: z.number().int(), y: z.number().int(), dir: z.number().int().min(0).max(7),
});
export const FurniItemSchema = z.object({
  id: z.number().int(), defId: z.string(),
  x: z.number().int(), y: z.number().int(), z: z.number(), dir: z.number().int(),
});

export const ClientMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("join"), token: z.string(), roomId: z.number().int() }),
  z.object({ t: z.literal("move"), x: z.number().int(), y: z.number().int() }),
  z.object({ t: z.literal("chat"), mode: z.enum(["say", "shout", "whisper"]),
             text: z.string().min(1).max(200), to: z.string().optional() }),
  z.object({ t: z.literal("place"), itemId: z.number().int(), x: z.number().int(),
             y: z.number().int(), dir: z.number().int() }),
  z.object({ t: z.literal("pickup"), itemId: z.number().int() }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

export const ServerMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("room_state"), roomId: z.number().int(), heightmap: z.string(),
             door: z.object({ x: z.number().int(), y: z.number().int(), dir: z.number().int() }),
             avatars: z.array(AvatarStateSchema), furni: z.array(FurniItemSchema),
             inventory: z.array(FurniItemSchema), you: z.number().int() }),
  z.object({ t: z.literal("avatar_join"), avatar: AvatarStateSchema }),
  z.object({ t: z.literal("avatar_leave"), id: z.number().int() }),
  z.object({ t: z.literal("walk"), id: z.number().int(), msPerTile: z.number().int(),
             path: z.array(z.object({ x: z.number().int(), y: z.number().int() })) }),
  z.object({ t: z.literal("chat"), from: z.number().int(), mode: z.enum(["say", "shout", "whisper"]),
             text: z.string() }),   // server pre-fades: distant say arrives as "…"
  z.object({ t: z.literal("furni_placed"), item: FurniItemSchema }),
  z.object({ t: z.literal("furni_removed"), itemId: z.number().int() }),
  z.object({ t: z.literal("inventory_add"), item: FurniItemSchema }),
  z.object({ t: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;
```
`furni.ts` exports `PROTOTYPE_CATALOG: FurniDef[]` — exactly: `chair_basic` (1×1, stack 1.0, sit,
no-walk, no-stack-on, 0xB5651D), `table_basic` (2×1, stack 1.0, stack-on, 0x8B4513),
`sofa_basic` (2×1, stack 1.0, sit, 0x7A3E9D), `plant_basic` (1×1, stack 2.0, 0x2E8B57),
`rug_basic` (3×2, stack 0.05, walk, stack-on, 0xAA3333).

- [ ] Tests: one valid and one invalid example per message type through
  `ClientMsgSchema.safeParse` / `ServerMsgSchema.safeParse`; catalog validates against
  `z.array(FurniDefSchema)`. Run — FAIL, implement, run — PASS. Commit.

### Task 5: Pathfinding (`@grand/server`)

**Files:** Create `packages/server/src/pathfind.ts`, `packages/server/test/pathfind.test.ts`.

**Interfaces:**
```ts
import type { RoomModel } from "@grand/shared";
export interface Tile { x: number; y: number }
export function findPath(
  model: RoomModel,
  blocked: (x: number, y: number) => boolean,   // furni + avatar occupancy, caller supplies
  from: Tile, to: Tile,
): Tile[] | null;                               // excludes `from`, includes `to`; null = no path
```
Rules: 8-directional. A step is legal when the target tile is non-void, not blocked, and
`|height(to) − height(from)| ≤ 1`. Diagonals require both orthogonal neighbors passable (no
corner cutting). A* with Chebyshev heuristic, deterministic neighbor order (N, NE, E, SE, S,
SW, W, NW) so tests are stable.

- [ ] Tests first: straight line on flat 5×5; walks around a blocked column; `null` when the
  target is walled off; refuses a height-2 cliff but climbs a height-1 step; no corner cutting
  (diagonal denied when both orthogonals blocked). Run — FAIL.
- [ ] Implement A* exactly as specified. Run — PASS. Commit.

### Task 6: DB + auth (`@grand/server`)

**Files:** Create `packages/server/src/db.ts`, `packages/server/src/auth.ts`,
`packages/server/test/auth.test.ts`.

**Interfaces:**
```ts
// db.ts
export function openDb(path: string): Database;  // better-sqlite3, runs migrations + seed
// auth.ts
export function register(db: Database, username: string, password: string): { token: string };
export function login(db: Database, username: string, password: string): { token: string };
export function sessionAccount(db: Database, token: string): { id: number; username: string } | null;
export class AuthError extends Error {}
```

- [ ] Schema in `openDb` (idempotent `CREATE TABLE IF NOT EXISTS`):
  ```sql
  accounts(id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE NOT NULL,
           pw_hash BLOB NOT NULL, pw_salt BLOB NOT NULL, created_at INTEGER NOT NULL);
  sessions(token TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
           created_at INTEGER NOT NULL);
  rooms(id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES accounts(id), name TEXT NOT NULL,
        doc TEXT NOT NULL);          -- JSON {v:1, heightmap, door:{x,y,dir}}
  furni_items(id INTEGER PRIMARY KEY, def_id TEXT NOT NULL, owner_id INTEGER NOT NULL,
              room_id INTEGER, x INTEGER, y INTEGER, z REAL, dir INTEGER);
  ```
  Seed on first run: room 1 "The Casino Floor", owner NULL, doc heightmap =
  12 rows × 12 cols of `0` with door `{x:0, y:6, dir:2}`.
- [ ] Passwords: `crypto.scryptSync(password, salt, 64)` with 16-byte random salt,
  `timingSafeEqual` on verify. Tokens: `crypto.randomBytes(32).toString("hex")`.
  Registration rejects usernames not matching `/^[a-z0-9_-]{3,20}$/i` and duplicates
  (COLLATE NOCASE handles near-case dupes; exact homoglyph check is parked).
- [ ] Tests (fresh temp-file db per test): register→login round-trip returns a working token;
  wrong password throws `AuthError`; `sessionAccount` on a bad token returns null; duplicate
  username (case-insensitive) throws. Run — FAIL, implement, run — PASS. Commit.

### Task 7: Room logic (`@grand/server`)

**Files:** Create `packages/server/src/room.ts`, `packages/server/src/filter.ts`,
`packages/server/filter-words.txt`, `packages/server/test/room.test.ts`,
`packages/server/test/filter.test.ts`.

**Interfaces:**
```ts
// filter.ts
export function loadWordlist(path: string): Set<string>;
export function filterChat(words: Set<string>, text: string): string; // each hit → "blah"
// room.ts — pure logic, no ws: the server task wires transport
export interface Occupant { accountId: number; username: string; x: number; y: number; dir: number }
export type Emit = (accountId: number, msg: ServerMsg) => void;
export class Room {
  constructor(db: Database, roomId: number, emit: Emit);
  join(accountId: number, username: string): void;      // emits room_state to joiner, avatar_join to rest
  leave(accountId: number): void;
  requestMove(accountId: number, x: number, y: number): void;  // paths + emits walk + advances position on a timer
  chat(accountId: number, mode: "say" | "shout" | "whisper", text: string, to?: string): void;
  place(accountId: number, itemId: number, x: number, y: number, dir: number): void;
  pickup(accountId: number, itemId: number): void;
  occupantCount(): number;
}
export const MS_PER_TILE = 500;
export const SPEAK_RADIUS = 5;    // Chebyshev
```
Behavior contracts:
- `chat` say: recipients within `SPEAK_RADIUS` of the speaker get the filtered text, everyone
  else in the room gets `"…"`. Shout: filtered text to all. Whisper: filtered text to the named
  target only (error `whisper_target` if absent). Filtering happens before distance handling.
- `place`: item must be in the caller's inventory (`room_id IS NULL`, `owner_id = caller`).
  Footprint (rotated for dir 2/6: w↔l) must fit on non-void tiles at equal floor height, all
  tiles free of avatars, and every covered tile's current stack top must be `canStackOn` (or
  empty). Computed `z` = floor height + sum of stack heights under the footprint's origin tile.
  Persist, then emit `furni_placed`. Violations emit `error` with codes `not_owner`,
  `bad_position`, `occupied`, `no_stack`.
- `pickup`: caller must own the item and be in the room; item returns to inventory
  (`room_id = NULL`), emits `furni_removed` + `inventory_add`. Items stacked on top of it drop
  by its stack height (keep it simple: recompute z for items above on the same origin tile).
- `requestMove` uses `findPath` with `blocked` = tiles under non-walkable furni + tiles under
  other avatars; emits `walk` immediately, then advances the occupant one path tile every
  `MS_PER_TILE` via `setInterval`, updating dir from the step vector (8-dir atan-free lookup).
  A new `requestMove` cancels the pending walk at the current tile.
- New occupants spawn at the door tile; on `join`, starter inventory is granted once per
  account: one of each `PROTOTYPE_CATALOG` def (INSERT only if the account owns zero items).
- [ ] `filter-words.txt`: seed with a dozen obvious words. Filter tests: hit replaces with
  "blah" case-insensitively on word boundaries, repeated-letter collapse ("shiiit" hits), clean
  text passes unchanged. Run — FAIL, implement, PASS.
- [ ] Room tests with a fake `emit` capturing `(accountId, msg)` pairs and vitest fake timers:
  join emits `room_state` with `you`, second join emits `avatar_join` to the first; say beyond 6
  tiles delivers "…" and within 5 delivers text; shout reaches both; whisper reaches only the
  target; place persists and broadcasts (verify row in SQLite); place on an avatar-occupied tile
  errors `occupied`; chair-on-chair errors `no_stack`; plant-on-table succeeds with z = 1.0;
  pickup returns to inventory; walk advances position after `vi.advanceTimersByTime(1500)` by 3
  tiles. Run — FAIL, implement `room.ts`, run — PASS. Commit.

### Task 8: WebSocket + HTTP server (`@grand/server`)

**Files:** Create `packages/server/src/server.ts`, `packages/server/test/server.test.ts`.
Modify `packages/server/package.json` (add `"dev": "node --watch --experimental-strip-types src/server.ts"`).

**Interfaces:**
```ts
export function startServer(opts: { port: number; dbPath: string }): Promise<{ close(): Promise<void>; port: number }>;
```
HTTP `POST /api/register` and `POST /api/login` (JSON `{username, password}` →
`{token}` or 400 `{error}`), CORS `*` for the Vite origin. WebSocket upgrade on the same port;
the first client message must be `join` with a valid session token or the socket closes with
code 4401. Every inbound frame parses through `ClientMsgSchema` — parse failure emits
`error{code:"bad_message"}` and drops the frame, never the connection. One `Room` instance per
roomId, created lazily, disposed when `occupantCount()` hits 0.

- [ ] Integration tests using real sockets on an ephemeral port (`ws` client): register via
  fetch, join via ws, expect `room_state`; second client joins, first receives `avatar_join`;
  `move` produces `walk` on both sockets; `chat` shout round-trips; malformed JSON produces
  `error bad_message`; bad token closes with 4401. Run — FAIL, implement, run — PASS.
- [ ] Commit.

### Task 9: Draw-order comparator (`@grand/client`)

**Files:** Create `packages/client/src/scene/sort.ts`, `packages/client/test/sort.test.ts`.

**Interfaces:**
```ts
export interface Sortable { x: number; y: number; z: number; kind: "tile" | "furni" | "avatar"; seq: number }
export function depthKey(s: Sortable): number;
// sort ascending by depthKey; equal keys keep insertion order
```
Rules (the verified mechanism, simplified to prototype art): base depth `(x + y)`; plus
`z * 1e-3` so stacked items draw above their base; avatars subtract `1e-2` relative to furni on
the same tile-depth (`AVATAR_SPRITE_DEFAULT_DEPTH`'s sign, habbo §4 / audit B1); tiles pin to
`-Infinity + (x + y) * 1e-9` so floor always draws first; `seq * 1e-7` as the stable tiebreaker
epsilon. Multi-tile furni passes its **origin tile** as (x, y) — same limitation as the
reference client, resolved later by generator-computed layer offsets.

- [ ] Tests first: floor tile sorts under everything; furni at (2,2) draws over furni at (1,2)
  and under furni at (2,3); a plant at z=1 on a table at z=0, same tile, draws after the table;
  an avatar standing at (3,3) draws over a rug at (3,3) but under furni at (4,3); two items with
  identical keys keep insertion order. Run — FAIL, implement, run — PASS. Commit.

### Task 10: Client scene — tiles and avatars

**Files:** Create `packages/client/index.html`, `packages/client/vite.config.ts`,
`packages/client/src/scene/room.ts`, `packages/client/src/scene/avatar.ts`,
`packages/client/src/net.ts`, `packages/client/src/main.ts`.

**Interfaces:**
```ts
// net.ts
export class Net {
  connect(url: string, token: string, roomId: number): Promise<void>;
  send(msg: ClientMsg): void;
  onMessage(handler: (msg: ServerMsg) => void): void;   // parses via ServerMsgSchema
}
// scene/room.ts
export class RoomScene {
  constructor(app: pixi.Application);
  loadModel(heightmap: string, door: Door): void;        // draws tile diamonds via worldToScreen
  onTileClick(handler: (x: number, y: number) => void): void;  // screenToTile on pointerdown
  readonly world: pixi.Container;                        // sorted every frame by depthKey
}
// scene/avatar.ts
export class AvatarSprite {
  constructor(scene: RoomScene, state: AvatarState);
  walk(path: Tile[], msPerTile: number): void;  // interpolates worldToScreen positions per tile
  setDirection(dir: number): void;              // tints/flips the placeholder
  remove(): void;
}
```
Placeholder art: tiles are 64×32 `Graphics` diamonds (checkerboard two greens, casino-carpet
red for the door tile); avatars are a 24×48 rounded rectangle + name label, colored from
`hash(username) % palette`. `main.ts`: minimal login form (register/login buttons →
`/api/*`), then connect, then wire `room_state`/`avatar_join`/`walk`/`avatar_leave` to the
scene, and tile clicks to `send({t:"move",...})`.

- [ ] Pure-logic tests only (interpolation math: position at 250ms of a 500ms tile step is the
  midpoint of the two screen points; direction lookup from step vector). Rendering is verified
  manually: run `make dev`, open two browser windows, register `alice` and `bob`, both join —
  each sees the other, clicking a tile walks both views in sync at 2 tiles/second.
- [ ] Commit.

### Task 11: Client chat UI

**Files:** Create `packages/client/src/ui/chat.ts`. Modify `packages/client/src/main.ts`
(wire input + incoming chat to bubbles).

**Interfaces:**
```ts
export class ChatUi {
  constructor(root: HTMLElement, scene: RoomScene);
  onSend(handler: (mode: "say" | "shout", text: string) => void): void; // Enter = say, Shift+Enter = shout
  showBubble(avatarId: number, text: string, mode: "say" | "shout"): void; // above avatar, 5s fade
}
```
Bubbles are DOM elements positioned from `worldToScreen` of the avatar's tile (project the
container transform), bold for shout, gray italic for the "…" faded form.

- [ ] Manual verification: two windows 8 tiles apart — say shows "…" in the far window, text in
  a near third window; shout is bold everywhere; a filtered word arrives as "blah".
- [ ] Commit.

### Task 12: Furni placement end-to-end

**Files:** Create `packages/client/src/scene/furni.ts`. Modify `packages/client/src/main.ts`
(inventory strip UI), `packages/client/src/scene/room.ts` (hover highlight of target tiles).

**Interfaces:**
```ts
export class FurniSprite {
  constructor(scene: RoomScene, item: FurniItem, def: FurniDef);
  remove(): void;
}
```
Placeholder furni art: an extruded box — top face diamond `w×l` tiles, two side faces
`stackHeight` height-units tall, three shades of `def.color`, drawn with `Graphics` from
`worldToScreen` corners at the item's `z`. Inventory strip: bottom bar listing inventory items
by def name; click to arm, hover shows footprint highlight (green fits / red rejects, client
mirror of the placement rules for feedback only — server remains the authority), click sends
`place`, right-click a placed item you own sends `pickup`.

- [ ] Extend `packages/server/test/server.test.ts` with one end-to-end case: place from
  inventory → both sockets receive `furni_placed`; restart the server on the same db → rejoin →
  `room_state.furni` still contains the item (persistence proven).
  Run — FAIL until client+server wiring complete, then PASS.
- [ ] Manual verification: place a table, stack a plant on it (z lands at 1.0), fail to stack a
  chair on the chair (`no_stack` error toast), pick everything back up, walk across the rug but
  not through the table (pathfinding blocks non-walk furni).
- [ ] Commit.

### Task 13: Integration smoke script + wrap

**Files:** Create `packages/server/test/smoke.test.ts`. Modify `Makefile` (add `smoke:` target
running it).

- [ ] One scripted scenario through real sockets, asserting the full Phase-1 contract in order:
  register two accounts → join → mutual visibility → walk (positions advance server-side) →
  say/shout/whisper delivery matrix → place/stack/pickup with persistence across a server
  restart → leave disposes the room. Expected output: `1 passed` from
  `pnpm --filter @grand/server exec vitest run test/smoke.test.ts`.
- [ ] `make test` green across all packages. `make dev` demo checklist passes in two browsers.
- [ ] Commit: `git add -A && git commit -m "Phase 1 vertical slice: walkable room, chat, furni"`.

## Self-review

- Every Phase-1 requirement (room render, heightmap, pathfinding, walk, chat+filter, furni
  place/stack/pickup, persistence, server authority) maps to tasks 2–13.
- No TBDs; the two manual-verification tasks (10, 11) are rendering, backed by pure-logic tests
  for their math.
- Names and signatures are consistent: `worldToScreen`/`screenToTile` (tasks 2, 10, 11, 12),
  `RoomModel`/`parseHeightmap` (3, 5, 7), `ClientMsg`/`ServerMsg` (4, 8, 10), `findPath` (5, 7),
  `Room`/`Emit` (7, 8), `depthKey` (9, 10, 12).
- Deliberately deferred to later phase plans: NPC staff, generator pipeline (real art replaces
  every placeholder here), ledger + trade, arcade game, music, avatars with figure strings.
