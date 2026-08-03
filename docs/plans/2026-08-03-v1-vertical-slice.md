# Plan: The Grand — build steps 1–2 vertical slice (walkable rooms + chat + furni)

**Revision 2**, integrating four adversarial plan audits ([plan-executability.md](../review/plan-executability.md),
[plan-correctness.md](../review/plan-correctness.md), [plan-spec-fidelity.md](../review/plan-spec-fidelity.md),
[plan-test-adequacy.md](../review/plan-test-adequacy.md)); disposition in
[PLAN-TRIAGE.md](../review/PLAN-TRIAGE.md).

**Goal:** a running prototype where two browsers join the same isometric room, walk avatars,
chat with the 5-tile speak rule, and place/pick up furniture that persists — proving the
projection constants, heightmap format, pathfinding, draw order, and server-authoritative
protocol from [GAME.md](../design/GAME.md) / [PIPELINES.md](../design/PIPELINES.md).

**Scope honesty:** this is PIPELINES §7 build-order **step 1 plus the placement mechanics of
step 2**. Included from step 2: the café and casino-floor public rooms and per-room chat config
(the focus-room substrate). Explicitly deferred to later plans: step 2's "authored as generator
parts" catalog clause (placeholder `Graphics` boxes here — nothing authored, so nothing thrown
away), focus props and the do-not-disturb bubble, rolling deploy and room drain (dispose +
reconnect-as-rejoin here; drain lands with the gateway), NPC staff, generator pipeline,
ledger + trade (and the Star trickle), arcade, music, figure-string avatars, ignore,
room-owner kick/ban/mute, idle sleep, room creation + caps + Navigator, room locked/password
states (schema column reserved).

**Architecture:** pnpm monorepo, three packages. `@grand/shared` holds pure logic both sides
import (projection, heightmap, protocol schemas, furni defs, **placement rules**, direction
table). `@grand/server` is one Node process — WebSocket rooms + SQLite. Module seams: `auth.ts`
(identity), `items.ts` (ownership operations — the ledger seam), `room.ts` (room server),
`filter.ts`, `server.ts` (transport), `log.ts` (observability seam). The gateway, presence, and
append-only-ledger seams are **not drawn yet** — deliberate. `@grand/client` is PixiJS 8 + Vite.

**Tech stack:** Node ≥ 22.6 (type stripping), pnpm 11 (pinned via `packageManager`),
TypeScript ^5.5, PixiJS ^8, Vite ^6, Vitest ^3, zod ^3, ws ^8, better-sqlite3 ^11.

**Global constraints:**
- Projection: 64×32 px tile diamond at zoom 1, 32 px per height unit, +X → (+32, +16) px,
  +Y → (−32, +16) px, +Z → (0, −32) px. Zoom 0.5 halves all six. **This slice ships scale 64
  only; the API accepts 32 and nothing renders at it** (closes TRIAGE C-45).
- Tile coordinates `x`, `y` are integers. `z` is a real height in tile units, and `z < 10`
  always (the draw-order epsilon budget depends on it).
- **Direction convention** (single source: `@grand/shared`): `0=N(0,−1) 1=NE(1,−1) 2=E(1,0)
  3=SE(1,1) 4=S(0,1) 5=SW(−1,1) 6=W(−1,0) 7=NW(−1,−1)`. Furni placement uses 0/2/4/6 only.
- Every WebSocket message validates through the shared zod schemas, both directions. The server
  wraps every message handler in try/catch — a handler throw emits `error{code:"internal"}` and
  never kills the process or the socket.
- Server code runs from source under Node type stripping: **every type-only import uses
  `import type`** (enforced by `verbatimModuleSyntax`), and **no parameter properties, enums, or
  namespaces** (strip-only mode rejects them at runtime).
- Server listens on 8080 (`PORT` env), Vite dev on 5173 proxying `/api` and `/ws` — the client
  is same-origin and the server sends no CORS headers.
- DB file: `packages/server/grand.db` (`DB_PATH` env). The heightmap validator rejects; it never
  skips. Commit after every task's PASS step.

## File map

| File | Responsibility |
|---|---|
| `Makefile`, `pnpm-workspace.yaml`, `package.json`, `tsconfig.base.json`, `.gitignore` | workspace wiring |
| `packages/shared/src/projection.ts` | world↔screen math, direction table |
| `packages/shared/src/heightmap.ts` | parse + validate heightmaps, `charToHeight`, `climbOk` |
| `packages/shared/src/protocol.ts` | zod schemas + types for every message, error-code enum, `Tile` |
| `packages/shared/src/furni.ts` | furni def type + prototype catalog (full literals) |
| `packages/shared/src/placement.ts` | `checkPlacement` — one implementation for server + client |
| `packages/shared/src/index.ts` | re-exports everything above |
| `packages/server/src/db.ts` | SQLite open/migrate/seed/close, pragmas |
| `packages/server/src/auth.ts` | register/login (async scrypt), sessions, username filter |
| `packages/server/src/items.ts` | ownership ops: starter grant, move to room/inventory, list |
| `packages/server/src/pathfind.ts` | A* (octile, √2 diagonals, total pop order) |
| `packages/server/src/filter.ts` | run-tolerant regex wordlist ("blah"), versioned ruleset |
| `packages/server/src/room.ts` | Room: occupants, walks, chat, furni ops, dispose |
| `packages/server/src/server.ts` + `src/main.ts` | HTTP + WS wiring; entrypoint |
| `packages/server/src/log.ts` | structured line logging (join/leave/place/errors) |
| `packages/server/filter-words.txt` | wordlist, `# version: 1` header |
| `packages/server/test/helpers.ts` | `bus()` message-waiting helper (schema-validating) |
| `packages/client/index.html`, `vite.config.ts` | shell + dev proxy |
| `packages/client/src/net.ts` | typed socket client, drops malformed frames |
| `packages/client/src/scene/sort.ts` | `depthKey` layered comparator |
| `packages/client/src/scene/walk.ts` | `lerpScreen` + step math (pure, tested) |
| `packages/client/src/scene/room.ts`, `avatar.ts`, `furni.ts` | rendering |
| `packages/client/src/ui/chat.ts` + `src/ui/parse.ts` | chat UI; pure input parsing |
| `packages/client/src/main.ts` | boot: login form, join, wiring |

---

### Task 1: Workspace scaffold

**Files:** Create `.gitignore`, `pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`,
`Makefile`, per-package `package.json` + `tsconfig.json`, `packages/shared/src/index.ts` (empty
export), `packages/server/src/main.ts` (placeholder logging "server: not yet implemented").

- [ ] `.gitignore` **first, before any install**:
  ```
  node_modules/
  dist/
  *.db
  *.db-journal
  *.db-wal
  *.db-shm
  ```
- [ ] `pnpm-workspace.yaml` — pnpm 11 requires the build allowlist or native deps never compile:
  ```yaml
  packages:
    - "packages/*"
  allowBuilds:
    better-sqlite3: true
    esbuild: true
  ```
- [ ] Root `package.json`:
  ```json
  {
    "name": "grand",
    "private": true,
    "packageManager": "pnpm@11.18.0",
    "engines": { "node": ">=22.6" },
    "scripts": { "test": "pnpm -r test", "typecheck": "pnpm -r exec tsc --noEmit" }
  }
  ```
- [ ] `tsconfig.base.json`:
  ```json
  {
    "compilerOptions": {
      "target": "ES2022", "module": "ESNext", "moduleResolution": "bundler",
      "strict": true, "noUncheckedIndexedAccess": true, "skipLibCheck": true,
      "allowImportingTsExtensions": true, "noEmit": true, "verbatimModuleSyntax": true,
      "lib": ["ES2022"], "types": []
    }
  }
  ```
- [ ] `packages/shared/package.json`:
  ```json
  {
    "name": "@grand/shared", "type": "module",
    "exports": { ".": "./src/index.ts" },
    "scripts": { "test": "vitest run --passWithNoTests" },
    "dependencies": { "zod": "^3.23.0" },
    "devDependencies": { "typescript": "^5.5.0", "vitest": "^3.0.0" }
  }
  ```
- [ ] `packages/server/package.json`: same shape, name `@grand/server`, no `exports`, plus
  `"dependencies": { "@grand/shared": "workspace:*", "ws": "^8.18.0", "better-sqlite3": "^11.0.0" }`,
  devDependencies adding `"@types/ws"`, `"@types/better-sqlite3"`, `"@types/node"`, and scripts
  `"dev": "node --watch --experimental-strip-types src/main.ts"`,
  `"test": "vitest run --passWithNoTests"`.
- [ ] `packages/client/package.json`: name `@grand/client`, **no `exports` field** (it is an app,
  not a library), `"dependencies": { "@grand/shared": "workspace:*", "pixi.js": "^8.0.0" }`,
  devDependencies `"vite": "^6.0.0"`, `"vitest": "^3.0.0"`, `"typescript": "^5.5.0"`, scripts
  `"dev": "vite"`, `"build": "vite build"`, `"test": "vitest run --passWithNoTests"`.
- [ ] Package `tsconfig.json`s extend the base; server adds `"types": ["node"]`; client adds
  `"lib": ["ES2022", "DOM"]`.
- [ ] `Makefile` (tabs, and the dev trap prevents orphaned servers holding port 8080):
  ```make
  setup:
  	pnpm install
  dev:
  	trap 'kill 0' EXIT INT; pnpm --filter @grand/server dev & pnpm --filter @grand/client dev & wait
  test:
  	pnpm typecheck && pnpm test && pnpm --filter @grand/client build
  db-reset:
  	rm -f packages/server/grand.db*
  ```
- [ ] Run `make setup` — expect exit 0, no `ERR_PNPM_IGNORED_BUILDS` warning.
- [ ] Run `make test` — expect exit 0 with three package headers: shared/server/client each
  reporting "no test files found", then a clean (near-empty) client build.
- [ ] Commit: `git add -A && git commit -m "Workspace scaffold"`.

### Task 2: Projection math + direction table (`@grand/shared`)

**Files:** Create `packages/shared/src/projection.ts`, `packages/shared/test/projection.test.ts`.
Modify `packages/shared/src/index.ts` to re-export.

**Interfaces:**
```ts
export type Scale = 64 | 32;
export function worldToScreen(x: number, y: number, z: number, scale: Scale): { sx: number; sy: number };
/** Inverse of worldToScreen on the z=0 plane ONLY. A point over a surface at height H resolves
 *  (H, H) tiles up-left of the visual tile — call it only for empty-floor hit-testing. */
export function screenToTile(sx: number, sy: number, scale: Scale): { x: number; y: number };
/** dir 0=N .. 7=NW per the global convention table. */
export const DIR_STEPS: ReadonlyArray<{ dx: number; dy: number }>;
export function dirFromStep(dx: number, dy: number): number;   // throws on (0,0) or |d|>1
```

- [ ] Write `test/projection.test.ts` first:
  ```ts
  import { describe, expect, test } from "vitest";
  import { worldToScreen, screenToTile, dirFromStep, DIR_STEPS } from "../src/projection.ts";

  describe("verified Habbo constants at scale 64", () => {
    test("+1 X is +32,+16", () => expect(worldToScreen(1, 0, 0, 64)).toEqual({ sx: 32, sy: 16 }));
    test("+1 Y is -32,+16", () => expect(worldToScreen(0, 1, 0, 64)).toEqual({ sx: -32, sy: 16 }));
    test("+1 Z is 0,-32", () => expect(worldToScreen(0, 0, 1, 64)).toEqual({ sx: 0, sy: -32 }));
    test("composite", () => expect(worldToScreen(3, 2, 1.5, 64)).toEqual({ sx: 32, sy: 32 }));
  });
  describe("scale 32 halves each step separately", () => {
    test("+1 X", () => expect(worldToScreen(1, 0, 0, 32)).toEqual({ sx: 16, sy: 8 }));
    test("+1 Y", () => expect(worldToScreen(0, 1, 0, 32)).toEqual({ sx: -16, sy: 8 }));
    test("+1 Z", () => expect(worldToScreen(0, 0, 1, 32)).toEqual({ sx: 0, sy: -16 }));
  });
  describe("screenToTile inverts the floor plane", () => {
    for (const [x, y] of [[0, 0], [5, 3], [9, 9], [-2, 4]] as const)
      test(`tile ${x},${y} round-trips through its center`, () => {
        const { sx, sy } = worldToScreen(x + 0.5, y + 0.5, 0, 64);
        expect(screenToTile(sx, sy, 64)).toEqual({ x, y });
      });
  });
  describe("direction table", () => {
    test("all eight", () => {
      const cases: Array<[number, number, number]> = [
        [0, -1, 0], [1, -1, 1], [1, 0, 2], [1, 1, 3], [0, 1, 4], [-1, 1, 5], [-1, 0, 6], [-1, -1, 7],
      ];
      for (const [dx, dy, dir] of cases) expect(dirFromStep(dx, dy)).toBe(dir);
    });
    test("table and function agree", () => {
      DIR_STEPS.forEach((s, dir) => expect(dirFromStep(s.dx, s.dy)).toBe(dir));
    });
  });
  ```
- [ ] Run `pnpm --filter @grand/shared test` — expect FAIL (module missing).
- [ ] Implement:
  ```ts
  export type Scale = 64 | 32;

  export function worldToScreen(x: number, y: number, z: number, scale: Scale) {
    const h = scale / 2, v = scale / 4, zu = scale / 2;
    return { sx: (x - y) * h, sy: (x + y) * v - z * zu };
  }

  export function screenToTile(sx: number, sy: number, scale: Scale) {
    const h = scale / 2, v = scale / 4;
    return { x: Math.floor(sx / h / 2 + sy / v / 2), y: Math.floor(sy / v / 2 - sx / h / 2) };
  }

  export const DIR_STEPS = [
    { dx: 0, dy: -1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 0 }, { dx: 1, dy: 1 },
    { dx: 0, dy: 1 }, { dx: -1, dy: 1 }, { dx: -1, dy: 0 }, { dx: -1, dy: -1 },
  ] as const;

  export function dirFromStep(dx: number, dy: number): number {
    const i = DIR_STEPS.findIndex((s) => s.dx === dx && s.dy === dy);
    if (i === -1) throw new Error(`not a unit step: ${dx},${dy}`);
    return i;
  }
  ```
- [ ] Run — expect PASS (**13 tests**). Commit.

### Task 3: Heightmap parser (`@grand/shared`)

**Files:** Create `packages/shared/src/heightmap.ts`, `packages/shared/test/heightmap.test.ts`.
Modify `packages/shared/src/index.ts` to re-export.

**Interfaces:**
```ts
export interface Door { x: number; y: number; dir: number }
export interface RoomModel { width: number; height: number; tiles: Int16Array; door: Door }
export class HeightmapError extends Error {}
export function charToHeight(ch: string): number;          // 'x'→-1, '0'-'9', 'a'-'z' (case-insensitive); throws otherwise
export function climbOk(hFrom: number, hTo: number): boolean; // both ≥ 0 and |Δ| ≤ 1 — shared with pathfinding
export function parseHeightmap(text: string, door: Door): RoomModel;
export function tileHeight(m: RoomModel, x: number, y: number): number; // -1 if void or out of bounds
```
Format: rows split on `\n` (one trailing newline tolerated, empty input throws), `x` = void,
`0-9` = 0–9, `a-z` = 10–35 case-insensitive. **Known quirk, kept for Habbo fidelity: `x` shadows
height 33, so 33 is unrepresentable.** Max 64 × 64. Validation walks the map from the door with
the **same movement rules the pathfinder uses** (8-directional, `climbOk`, no corner cutting) and
throws if any non-void tile is unreachable — the guarantee is *walkability*, not mere
connectivity.

- [ ] Tests first:
  ```ts
  import { expect, test } from "vitest";
  import { parseHeightmap, charToHeight, climbOk, tileHeight, HeightmapError } from "../src/heightmap.ts";

  const DOOR = { x: 0, y: 1, dir: 2 };
  test("parses a simple room", () => {
    const m = parseHeightmap("xx00\n0000\n0012", DOOR);
    expect([m.width, m.height]).toEqual([4, 3]);
    expect(m.tiles[0]).toBe(-1);
    expect(m.tiles[2 * 4 + 3]).toBe(2);
  });
  test("charToHeight maps the full alphabet, case-insensitively", () => {
    expect(charToHeight("0")).toBe(0); expect(charToHeight("9")).toBe(9);
    expect(charToHeight("a")).toBe(10); expect(charToHeight("A")).toBe(10);
    expect(charToHeight("z")).toBe(35); expect(charToHeight("Z")).toBe(35);
    expect(charToHeight("x")).toBe(-1); expect(charToHeight("X")).toBe(-1);
    expect(() => charToHeight("!")).toThrow(HeightmapError);
  });
  test("tolerates one trailing newline", () =>
    expect(() => parseHeightmap("00\n00\n", { x: 0, y: 0, dir: 2 })).not.toThrow());
  test("empty input throws", () => expect(() => parseHeightmap("", DOOR)).toThrow(HeightmapError));
  test("rejects ragged rows instead of skipping", () =>
    expect(() => parseHeightmap("000\n00\n000", DOOR)).toThrow(HeightmapError));
  test("rejects invalid characters", () =>
    expect(() => parseHeightmap("00\n0!", DOOR)).toThrow(HeightmapError));
  test("rejects a door on a void tile", () =>
    expect(() => parseHeightmap("x0\n00", { x: 0, y: 0, dir: 2 })).toThrow(HeightmapError));
  test("rejects over 64x64", () => {
    const row = "0".repeat(65);
    expect(() => parseHeightmap(Array(3).fill(row).join("\n"), DOOR)).toThrow(HeightmapError);
  });
  test("rejects tiles walled off by void", () =>
    expect(() => parseHeightmap("0x0\n0x0", DOOR)).toThrow(HeightmapError));
  test("rejects tiles walled off by height — a 2-step cliff is unwalkable", () =>
    // right column is height 3; door side is height 0-1: no climbOk step reaches it
    expect(() => parseHeightmap("03\n13", DOOR)).toThrow(HeightmapError));
  test("accepts a 1-step ramp", () =>
    expect(() => parseHeightmap("01\n01", DOOR)).not.toThrow());
  test("diagonal-only connectivity counts as reachable (8-dir walk)", () =>
    // (1,0) touches (0,1) only diagonally; both orthogonal corners are void → corner-cut denied → unreachable
    expect(() => parseHeightmap("x0\n0x", { x: 0, y: 1, dir: 2 })).toThrow(HeightmapError));
  test("tileHeight is -1 out of bounds", () => {
    const m = parseHeightmap("00\n00", { x: 0, y: 0, dir: 2 });
    expect(tileHeight(m, 5, 5)).toBe(-1);
    expect(tileHeight(m, -1, 0)).toBe(-1);
  });
  test("climbOk", () => {
    expect(climbOk(0, 1)).toBe(true); expect(climbOk(3, 2)).toBe(true);
    expect(climbOk(0, 2)).toBe(false); expect(climbOk(0, -1)).toBe(false);
  });
  ```
- [ ] Run — FAIL. Implement. `tileHeight` returns `m.tiles[y * m.width + x] ?? -1` (the `??` is
  required by `noUncheckedIndexedAccess` and is also the correct out-of-bounds value). The
  reachability walk reuses one internal `stepAllowed(m, from, to)` implementing: target non-void,
  `climbOk`, and for diagonals both orthogonal tiles non-void + `climbOk` from `from`. Export
  nothing extra — the pathfinder imports `climbOk` and reimplements the loop over its dynamic
  `blocked` set.
- [ ] Run — PASS. Commit.

### Task 4: Protocol, catalog, and placement rules (`@grand/shared`)

**Files:** Create `packages/shared/src/protocol.ts`, `packages/shared/src/furni.ts`,
`packages/shared/src/placement.ts`, tests for all three. Modify `index.ts` to re-export.

**Interfaces — the whole wire format. Later tasks may not invent messages outside this file.**
```ts
import { z } from "zod";

export interface Tile { x: number; y: number }
export const DirSchema = z.number().int().min(0).max(7);
export const FurniDirSchema = z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(6)]);
// Note: with a fixed origin, dir 0/4 produce identical footprints, as do 2/6 — occupancy tests
// must not try to tell them apart. Rotation swaps w↔l at dir 2 and 6.

export const ErrorCodeSchema = z.enum([
  "bad_message", "internal", "no_room", "already_joined", "whisper_target",
  "not_owner", "bad_position", "occupied", "no_stack", "room_full", "no_path",
]);

export const FurniDefSchema = z.object({
  id: z.string(), name: z.string(),
  w: z.number().int().min(1), l: z.number().int().min(1),
  stackHeights: z.array(z.number().min(0)).min(1),   // per state; prototype defs have one state
  canWalk: z.boolean(), canSit: z.boolean(), canStackOn: z.boolean(),
  color: z.number().int(),
});
export type FurniDef = z.infer<typeof FurniDefSchema>;

export const AvatarStateSchema = z.object({
  id: z.number().int(), username: z.string(),
  x: z.number().int(), y: z.number().int(), z: z.number(),
  dir: DirSchema, posture: z.enum(["stand", "sit"]),   // server always sends "stand" in this slice
});
export type AvatarState = z.infer<typeof AvatarStateSchema>;

export const InventoryItemSchema = z.object({ id: z.number().int(), defId: z.string() });
export type InventoryItem = z.infer<typeof InventoryItemSchema>;
export const FurniItemSchema = InventoryItemSchema.extend({
  x: z.number().int(), y: z.number().int(), z: z.number(),
  dir: FurniDirSchema, state: z.number().int(),
});
export type FurniItem = z.infer<typeof FurniItemSchema>;

const StepSchema = z.object({ x: z.number().int(), y: z.number().int(), z: z.number() });

export const ClientMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("join"), token: z.string(), roomId: z.number().int() }),
  z.object({ t: z.literal("move"), x: z.number().int(), y: z.number().int() }),
  z.object({ t: z.literal("chat"), mode: z.enum(["say", "shout"]), text: z.string().min(1).max(200) }),
  z.object({ t: z.literal("whisper"), to: z.string(), text: z.string().min(1).max(200) }),
  z.object({ t: z.literal("place"), itemId: z.number().int(), x: z.number().int(),
             y: z.number().int(), dir: FurniDirSchema }),
  z.object({ t: z.literal("pickup"), itemId: z.number().int() }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

export const ServerMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("room_state"), roomId: z.number().int(), name: z.string(),
             heightmap: z.string(),
             door: z.object({ x: z.number().int(), y: z.number().int(), dir: DirSchema }),
             chat: z.object({ speakRadius: z.number().int(), shoutAllowed: z.boolean() }),
             avatars: z.array(AvatarStateSchema), furni: z.array(FurniItemSchema),
             inventory: z.array(InventoryItemSchema), you: z.number().int() }),
  z.object({ t: z.literal("avatar_join"), avatar: AvatarStateSchema }),
  z.object({ t: z.literal("avatar_leave"), id: z.number().int() }),
  z.object({ t: z.literal("walk"), id: z.number().int(), msPerTile: z.number().int(),
             from: StepSchema, startedAt: z.number().int(),   // server epoch ms
             path: z.array(StepSchema) }),
  z.object({ t: z.literal("chat"), from: z.number().int(), mode: z.enum(["say", "shout", "whisper"]),
             text: z.string(), faded: z.boolean() }),
  z.object({ t: z.literal("furni_placed"), item: FurniItemSchema }),
  z.object({ t: z.literal("furni_moved"), item: FurniItemSchema }),   // z recomputed after a pickup
  z.object({ t: z.literal("furni_removed"), itemId: z.number().int() }),
  z.object({ t: z.literal("inventory_add"), item: InventoryItemSchema }),
  z.object({ t: z.literal("error"), code: ErrorCodeSchema, message: z.string() }),
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;
```
`furni.ts` — the catalog, complete literals (every field, no inference):
```ts
export const PROTOTYPE_CATALOG: FurniDef[] = [
  { id: "chair_basic", name: "Chair",  w: 1, l: 1, stackHeights: [1.0],  canWalk: false, canSit: true,  canStackOn: false, color: 0xb5651d },
  { id: "table_basic", name: "Table",  w: 2, l: 1, stackHeights: [1.0],  canWalk: false, canSit: false, canStackOn: true,  color: 0x8b4513 },
  { id: "sofa_basic",  name: "Sofa",   w: 2, l: 1, stackHeights: [1.0],  canWalk: false, canSit: true,  canStackOn: false, color: 0x7a3e9d },
  { id: "plant_basic", name: "Plant",  w: 1, l: 1, stackHeights: [2.0],  canWalk: false, canSit: false, canStackOn: false, color: 0x2e8b57 },
  { id: "rug_basic",   name: "Rug",    w: 3, l: 2, stackHeights: [0.05], canWalk: true,  canSit: false, canStackOn: true,  color: 0xaa3333 },
];
```
`placement.ts` — one implementation used by the server (authoritative) and the client (hover
highlight), closing the drift the audits flagged:
```ts
export interface PlacementCtx {
  model: RoomModel;
  furni: FurniItem[];                 // items currently placed in the room
  defs: ReadonlyMap<string, FurniDef>;
  avatars: Tile[];
  doorTile: Tile;                     // placement here is always bad_position
  roomFurniCap: number;               // room_full above this
}
export type PlacementResult =
  | { ok: true; z: number }
  | { ok: false; code: "bad_position" | "occupied" | "no_stack" | "room_full" };
export function footprintTiles(def: FurniDef, x: number, y: number, dir: 0 | 2 | 4 | 6): Tile[];
export function stackTop(ctx: PlacementCtx, t: Tile): number;  // floor height + max(item.z + stackHeight) on t
export function checkPlacement(ctx: PlacementCtx, def: FurniDef, x: number, y: number, dir: 0 | 2 | 4 | 6): PlacementResult;
```
Rules `checkPlacement` enforces, in order: room cap → every footprint tile in-bounds, non-void,
not the door tile (`bad_position`) → equal floor height across the footprint (`bad_position`) →
no avatar on any tile (`occupied`) → every covered tile's top item `canStackOn` or tile empty
(`no_stack`) → `z` = **max of `stackTop` over covered tiles**, and every covered tile must
report that same top (else `no_stack` — no clipping, no floating).

- [ ] Protocol tests: one valid + one invalid parse per message type (include: `place` with
  `dir: 1` rejects, `dir: 1e9` rejects; `whisper` without `to` rejects; `error` with code
  `"badposition"` rejects; `chat` server message without `faded` rejects). Catalog validates
  against `z.array(FurniDefSchema)` and has exactly 5 entries.
- [ ] Placement tests (build a `PlacementCtx` from `parseHeightmap("000000\n000000\n000000", door)`
  plus literal item arrays):
  ```ts
  test("plant on table stacks at z=1", () => {
    const ctx = ctxWith([placed("table_basic", 1, 1, 0)]);
    expect(checkPlacement(ctx, def("plant_basic"), 1, 1, 0)).toEqual({ ok: true, z: 1 });
  });
  test("chair on chair is no_stack", () => {
    const ctx = ctxWith([placed("chair_basic", 1, 1, 0)]);
    expect(checkPlacement(ctx, def("chair_basic"), 1, 1, 0)).toEqual({ ok: false, code: "no_stack" });
  });
  test("rug overhanging a table is rejected, not floated or clipped", () => {
    const ctx = ctxWith([placed("table_basic", 2, 0, 0)]);   // covers (2,0),(3,0)
    // rug at (1,0) dir 0 covers x 1-3, y 0-1: tiles over the table top at 1.0, others at 0
    expect(checkPlacement(ctx, def("rug_basic"), 1, 0, 0)).toEqual({ ok: false, code: "no_stack" });
  });
  test("dir 2 rotates the footprint (w↔l)", () => {
    expect(footprintTiles(def("table_basic"), 1, 1, 2).sort(byXY))
      .toEqual([{ x: 1, y: 1 }, { x: 1, y: 2 }]);
  });
  test("door tile is bad_position", () =>
    expect(checkPlacement(ctxWith([]), def("plant_basic"), DOOR.x, DOOR.y, 0))
      .toEqual({ ok: false, code: "bad_position" }));
  test("avatar blocks placement", () =>
    expect(checkPlacement(ctxWith([], [{ x: 1, y: 1 }]), def("chair_basic"), 1, 1, 0))
      .toEqual({ ok: false, code: "occupied" }));
  test("room cap yields room_full", () => {
    const ctx = ctxWith(Array.from({ length: 100 }, (_, i) => placed("plant_basic", i % 6, (i / 6) | 0, 0)));
    expect(checkPlacement(ctx, def("plant_basic"), 5, 5, 0)).toEqual({ ok: false, code: "room_full" });
  });
  ```
- [ ] Run — FAIL, implement all three modules, re-export from `index.ts`, run — PASS. Commit.

### Task 5: Pathfinding (`@grand/server`)

**Files:** Create `packages/server/src/pathfind.ts`, `packages/server/test/pathfind.test.ts`.

**Interfaces:**
```ts
import type { RoomModel, Tile } from "@grand/shared";
export function findPath(
  model: RoomModel,
  blocked: (x: number, y: number) => boolean,
  from: Tile, to: Tile,
): Tile[] | null;    // excludes from, includes to; [] when from===to; null when unreachable/blocked target
```
Algorithm, fully pinned so expected paths are computable before implementation:
- 8-directional. Orthogonal step cost **1**, diagonal **√2**. Heuristic: **octile**
  `D·(dx+dy) + (√2−2D)·min(dx,dy)` with `D = 1` — a straight line is then *strictly* optimal
  over any zig-zag (4 < 2√2 + 2 ≈ 4.83), so straight-line tests have one answer.
- A step is legal when the target is non-void, not `blocked`, and `climbOk(h_from, h_to)`
  (imported from `@grand/shared`). A diagonal additionally requires **both** orthogonal
  neighbors to be non-void, not blocked, and `climbOk` from `from` — either one failing denies
  the diagonal.
- Open-set pop order is total: lowest `f`, then lowest `h`, then lowest insertion sequence.
  Neighbor push order N, NE, E, SE, S, SW, W, NW.
- The `from` tile is exempt from `blocked` (the mover stands on it).

- [ ] Tests first (all expected arrays derivable from the spec above):
  ```ts
  const flat = parseHeightmap("00000\n00000\n00000\n00000\n00000", { x: 0, y: 0, dir: 2 });
  const open = () => false;

  test("straight line is unique-optimal", () =>
    expect(findPath(flat, open, { x: 0, y: 0 }, { x: 4, y: 0 }))
      .toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]));
  test("clear diagonal is unique-optimal", () =>
    expect(findPath(flat, open, { x: 0, y: 0 }, { x: 2, y: 2 }))
      .toEqual([{ x: 1, y: 1 }, { x: 2, y: 2 }]));
  test("from===to is the empty path", () =>
    expect(findPath(flat, open, { x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([]));
  test("blocked target is null", () =>
    expect(findPath(flat, (x, y) => x === 4 && y === 4, { x: 0, y: 0 }, { x: 4, y: 4 })).toBeNull());
  test("void target is null", () => {
    const m = parseHeightmap("00\n0x", { x: 0, y: 0, dir: 2 });
    expect(findPath(m, open, { x: 0, y: 0 }, { x: 1, y: 1 })).toBeNull();
  });
  test("climbs a 1-step, refuses a 2-step cliff", () => {
    const ramp = parseHeightmap("012", { x: 0, y: 0, dir: 2 });
    expect(findPath(ramp, open, { x: 0, y: 0 }, { x: 2, y: 0 }))
      .toEqual([{ x: 1, y: 0 }, { x: 2, y: 0 }]);
    const cliff = parseHeightmap("02", { x: 0, y: 0, dir: 2 });
    expect(findPath(cliff, open, { x: 0, y: 0 }, { x: 1, y: 0 })).toBeNull();
  });
  test("a diagonal is denied when EITHER orthogonal is blocked", () => {
    const oneOrtho = (x: number, y: number) => x === 1 && y === 0;   // only one corner blocked
    expect(findPath(flat, oneOrtho, { x: 0, y: 0 }, { x: 1, y: 1 }))
      .toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);                     // forced around
  });
  test("the corner rule also applies to void corners", () => {
    const m = parseHeightmap("0x\n00", { x: 0, y: 0, dir: 2 });       // (1,0) void
    expect(findPath(m, open, { x: 0, y: 0 }, { x: 1, y: 1 }))
      .toEqual([{ x: 0, y: 1 }, { x: 1, y: 1 }]);
  });
  test("a wall with one gap forces the long way round", () => {
    const wall = (x: number, y: number) => x === 2 && y <= 3;         // column, gap only at (2,4)
    const path = findPath(flat, wall, { x: 0, y: 0 }, { x: 4, y: 0 })!;
    expect(path.at(-1)).toEqual({ x: 4, y: 0 });
    expect(path.some((t) => wall(t.x, t.y))).toBe(false);
    // 10 is forced: (2,4) can only be entered from (1,4) and left to (3,4) (diagonals would cut
    // the blocked (2,3) corner); each free segment has max(dx,dy)=4 ⇒ 4 steps: 4+1+1+4 = 10.
    expect(path).toHaveLength(10);
  });
  ```
- [ ] Run — FAIL. Implement exactly as pinned. Run — PASS. Commit.

### Task 6: DB, auth, items (`@grand/server`)

**Files:** Create `packages/server/src/db.ts`, `packages/server/src/auth.ts`,
`packages/server/src/items.ts`, `packages/server/test/auth.test.ts`,
`packages/server/test/db.test.ts`.

**Interfaces:**
```ts
// db.ts
import Database from "better-sqlite3";
export function openDb(path: string): Database.Database;   // pragmas + migrations + seed, idempotent
export function closeDb(db: Database.Database): void;
// auth.ts
export const CredentialsSchema: z.ZodType<{ username: string; password: string }>;
export class AuthError extends Error {}
export function register(db: Database.Database, username: string, password: string): Promise<{ token: string }>;
export function login(db: Database.Database, username: string, password: string): Promise<{ token: string }>;
export function sessionAccount(db: Database.Database, token: string): { id: number; username: string } | null;
// items.ts — the ledger seam: room.ts never issues ownership SQL directly
export function grantStarter(db: Database.Database, accountId: number): void;  // once, guarded by accounts.starter_granted
export function listInventory(db: Database.Database, accountId: number): InventoryItem[];
export function listRoomFurni(db: Database.Database, roomId: number): FurniItem[];
export function placeItem(db: Database.Database, itemId: number, roomId: number, x: number, y: number, z: number, dir: number): void;
export function pickupItem(db: Database.Database, itemId: number): void;       // back to inventory (room_id NULL)
export function updateItemZ(db: Database.Database, itemId: number, z: number): void;
export function getItem(db: Database.Database, itemId: number): (FurniItem & { ownerId: number; roomId: number | null }) | null;
```

- [ ] `openDb`: `db.pragma("journal_mode = WAL")`, `db.pragma("foreign_keys = ON")`, then
  idempotent DDL:
  ```sql
  CREATE TABLE IF NOT EXISTS accounts(
    id INTEGER PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE NOT NULL,
    username_normalized TEXT UNIQUE NOT NULL,
    pw_hash BLOB NOT NULL, pw_salt BLOB NOT NULL, pw_params TEXT NOT NULL,
    starter_granted INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS sessions(
    token TEXT PRIMARY KEY, account_id INTEGER NOT NULL REFERENCES accounts(id),
    created_at INTEGER NOT NULL);                    -- no expiry: prototype decision, stated
  CREATE TABLE IF NOT EXISTS rooms(
    id INTEGER PRIMARY KEY, owner_id INTEGER REFERENCES accounts(id), name TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'open',              -- locked/password reserved, unused here
    doc TEXT NOT NULL);                              -- JSON {v:1, heightmap, door, chat:{speakRadius, shoutAllowed}}
  CREATE TABLE IF NOT EXISTS furni_items(
    id INTEGER PRIMARY KEY, def_id TEXT NOT NULL,
    owner_id INTEGER NOT NULL REFERENCES accounts(id),
    room_id INTEGER REFERENCES rooms(id),            -- NULL = inventory; positional cols NULL then too
    x INTEGER, y INTEGER, z REAL, dir INTEGER, state INTEGER NOT NULL DEFAULT 0);
  ```
- [ ] Seed with `INSERT OR IGNORE` (id-keyed, so reopening never throws):
  - Room 1 **"The Lobby Café"** — the default join room (resort-first, GAME.md First session):
    10×10 flat `0`s, door `{x:0,y:5,dir:2}`, chat `{speakRadius: 5, shoutAllowed: false}`.
  - Room 2 **"The Casino Floor"** — 12×12 with a raised stage and a void notch so height rules
    are exercised end-to-end, door `{x:0,y:6,dir:2}`, chat `{speakRadius: 5, shoutAllowed: true}`:
    ```
    xx0000000000
    x00000000000
    000011110000
    000012210000
    000012210000
    000011110000
    000000000000
    000000000000
    000000000000
    000000000000
    000000000000
    000000000000
    ```
    (Platform max height 2, ringed by height-1 ramps, reachable under `climbOk` — the Task 3
    validator proves it at seed time.)
- [ ] Auth: async `crypto.scrypt` (never `scryptSync` — 24 ms of blocked event loop per login),
  16-byte salt, `pw_params` stores `"scrypt:N=16384,r=8,p=1,len=64"`, `timingSafeEqual` verify.
  `CredentialsSchema`: username `/^[a-z0-9_-]{3,20}$/i`, password `min(8).max(200)`.
  Registration also rejects: wordlist hits in the username (Task 7's filter module, loaded here
  too), and normalized collisions — `username_normalized` = lowercase, strip `_`/`-`, fold
  `0→o 1→l 3→e 5→s`. `register` calls `grantStarter`.
- [ ] Tests (fresh `mkdtempSync` db per test, `closeDb` + rm in `afterEach`):
  register→login round-trip; wrong password → `AuthError`; unknown user login → `AuthError`;
  bad token → null; duplicates: exact, case (`Alice`/`alice`), normalized (`al1ce`/`alice`) all
  throw; regex rejections (`"ab"`, 21 chars, `"bad name"`, `"héllo"`) throw; password `"short"`
  throws; `grantStarter` grants exactly 5 inventory rows once — calling twice, or emptying the
  table and calling again, grants nothing (the `starter_granted` flag, not a count);
  `openDb` twice on one path → still exactly 2 rooms; WAL + foreign_keys pragmas active
  (`db.pragma("foreign_keys", { simple: true }) === 1`).
- [ ] Run — FAIL, implement, PASS. Commit.

### Task 7: Room logic (`@grand/server`)

**Files:** Create `packages/server/src/room.ts`, `packages/server/src/filter.ts`,
`packages/server/filter-words.txt`, `packages/server/test/room.test.ts`,
`packages/server/test/filter.test.ts`.

**Interfaces:**
```ts
// filter.ts
export interface Ruleset { version: string; patterns: RegExp[] }
export function loadRuleset(path: string): Ruleset;   // "# version: N" header line, one word per line
export function filterChat(rs: Ruleset, text: string): string;
export function hitsFilter(rs: Ruleset, word: string): boolean;   // used by auth for usernames
// room.ts — pure logic + timers; no ws. Everything is synchronous (fake-timer tests depend on it).
export interface Occupant { accountId: number; username: string; x: number; y: number; z: number; dir: number }
export type Emit = (accountId: number, msg: ServerMsg) => void;
export class Room {
  constructor(db: Database.Database, roomId: number, emit: Emit);  // throws if no such room row
  join(accountId: number, username: string): void;
  leave(accountId: number): void;      // clears that occupant's walk timer
  dispose(): void;                     // clears every timer; room unusable afterwards
  requestMove(accountId: number, x: number, y: number): void;
  chat(accountId: number, mode: "say" | "shout", text: string): void;
  whisper(accountId: number, to: string, text: string): void;
  place(accountId: number, itemId: number, x: number, y: number, dir: 0 | 2 | 4 | 6): void;
  pickup(accountId: number, itemId: number): void;
  occupants(): readonly Occupant[];
  occupantCount(): number;
}
export const MS_PER_TILE = 500;
```
Behavior contracts:
- **Chat recipients, exhaustively.** `say`: everyone in the room *including the speaker*
  receives `chat` — within `speakRadius` (Chebyshev, from the room doc) `faded: false` with the
  filtered text, beyond it `faded: true` with text `"…"`. `shout` (only if the room's
  `shoutAllowed`; else `error bad_message`): filtered text, `faded: false`, to everyone.
  `whisper`: filtered text to the target **and echoed to the sender**; `error whisper_target`
  if the target is not in the room. Filtering always precedes fading.
- **Filter:** each wordlist entry compiles once to a run-tolerant regex —
  `new RegExp("\\b" + [...w].map(c => c + "+").join("") + "\\b", "gi")` — so `"shiiit"` and
  `"asss"` hit while `"as"` never does (no input collapsing, offsets preserved). Replacement is
  the literal lowercase `blah`.
- **Placement** calls the shared `checkPlacement` (ownership checked first: item must be in the
  caller's inventory → `not_owner`). On ok: `items.placeItem`, emit `furni_placed`. The room
  keeps an **occupancy index** (tile → item ids, expanded by `footprintTiles`) maintained on
  place/pickup — `blocked` for pathfinding and the ctx for `checkPlacement` both read it.
- **Pickup:** caller owns the item **and the item is placed in this room** (else `not_owner`).
  `items.pickupItem`, emit `furni_removed` + `inventory_add`. Then for every item whose
  footprint **intersects** the removed item's footprint and whose `z` ≥ the removed item's top:
  recompute `z` from the remaining stack (shared `stackTop`), persist via `updateItemZ`, emit
  **`furni_moved`** for each.
- **Movement:** `requestMove` paths via `findPath` with `blocked` = occupancy index non-walkable
  tiles + other avatars' tiles + **tiles reserved as another walker's destination** (reservation
  set at path time, cleared on arrival/cancel — two walkers can never arrive on one tile).
  `null` path → `error no_path`, no state change. Otherwise emit
  `walk {from: {x,y,z}, startedAt: Date.now(), path}` where every step carries `z` = floor
  height + walkable-furni height on that tile, then advance one tile per `MS_PER_TILE` via
  `setInterval`, updating `dir` via shared `dirFromStep`. A new `requestMove` cancels at the
  current tile (clear interval, clear reservation) and re-paths from there. A step onto a tile
  that became blocked since path time cancels the walk at the previous tile. Walk completion
  clears the interval (timer count returns to zero).
- **Join:** spawn at the door tile, or if occupied the nearest free tile by BFS from the door.
  Emits `room_state` (including per-room `chat` config and the joiner's inventory via
  `listInventory`) to the joiner and `avatar_join` to the rest — and then, for every occupant
  mid-walk, a `walk` to the joiner carrying the remaining path (late joiners see motion, not
  statues).

- [ ] `filter-words.txt`: `# version: 1` then twelve entries (include `shit` — the tests
  reference it). Filter tests: `"shiiit"` → `"blah"`; `"asss"` hits when `ass` is listed;
  `"as"` and `"class"`... `\b`-bounded `a+s+s+` matches inside "class"? No — `\b` before `a`:
  "class" has `a` preceded by `l` (word char) so no boundary → no match. Assert exactly that:
  `filterChat(rs, "class assignment")` → unchanged... "assignment" starts with `ass` at a word
  boundary → matches → known limitation, assert it as documented behavior
  (`"blah ignment"`? no — regex consumes `a+s+s+` = "ass", leaving "blah" + "ignment" →
  `"blahignment"`). Pin it: `expect(filterChat(rs, "assignment")).toBe("blahignment")` with a
  comment that scunthorpe-grade precision is parked. Case-insensitivity, version parsing
  (`rs.version === "1"`), `hitsFilter("sh1t")` → false (normalization is parked; username
  normalization in Task 6 is separate).
- [ ] Room tests — fixture discipline, verbatim:
  ```ts
  beforeEach(() => {
    vi.useFakeTimers();                                  // BEFORE constructing the Room
    db = openDb(tmpDbPath());
    emitted = [];
    emit = (id, msg) => { ServerMsgSchema.parse(msg); emitted.push([id, msg]); };  // pins outbound conformance
    room = new Room(db, 1, emit);
  });
  afterEach(() => { room.dispose(); closeDb(db); vi.useRealTimers(); });
  ```
  Cases (each with computable expectations — Chebyshev geometry uses café room 1, 10×10 flat,
  door (0,5); `stand(id,x,y)` walks then asserts arrival as in the audit's helper):
  - join emits `room_state` with `you`, 5 `InventoryItem`s (integer-free — schema-parse in
    `emit` already proves conformance), and the room's chat config; second join emits
    `avatar_join` to the first.
  - second joiner spawns on a free tile, not on the first joiner's tile.
  - walk advances 3 tiles after `advanceTimersByTime(1500)`, read through `occupants()`;
    `vi.getTimerCount() === 0` after the path completes.
  - re-path mid-walk: cancel at current tile, new `walk.from` equals that tile, timer count
    stays 1, final position is the new target (the T-03 test verbatim).
  - leave mid-walk and dispose mid-walk both zero the timer count; advancing afterwards throws
    nothing.
  - two occupants racing to one tile: exactly one arrives (reservation), the other gets
    `error no_path` or a different final tile — assert positions differ.
  - say at Chebyshev 5 (diagonal (5,5) from (0,0)) delivers text; (6,6) delivers `"…"` with
    `faded: true`; speaker receives their own message.
  - shout in the café → `error bad_message` (café is `shoutAllowed: false`); shout in room 2
    reaches all, filtered (`"shiiit"` → `"blah"`).
  - whisper reaches target + sender only; absent target → `error whisper_target`.
  - join mid-walk: joiner receives `walk` with exactly the remaining path (the T-23 test).
  - place: persists (SQLite row asserted), broadcasts; each error code produced once:
    `not_owner` (someone else's item), `bad_position` (door tile), `occupied` (avatar),
    `no_stack` (chair on chair), `no_path` (move onto reserved tile) — `room_full` is covered in
    Task 4's shared tests, skip the 100-item setup here.
  - stack: plant on table → z 1.0; **pickup the 2×1 table with the plant on its far tile** →
    plant gets `furni_moved` with z 0 and the row updates (the C-08 footprint-intersection
    case, not just same-origin).
  - walking respects furni: path around a placed table, straight across a placed rug, and the
    walk step onto the rug carries `z: 0.05`.
- [ ] Run — FAIL, implement, run — PASS. Commit.

### Task 8: WebSocket + HTTP server (`@grand/server`)

**Files:** Create `packages/server/src/server.ts`, `packages/server/src/log.ts`,
`packages/server/test/helpers.ts`, `packages/server/test/server.test.ts`. Rewrite
`packages/server/src/main.ts`:
```ts
import { startServer } from "./server.ts";
await startServer({
  port: Number(process.env.PORT ?? 8080),
  dbPath: process.env.DB_PATH ?? new URL("../grand.db", import.meta.url).pathname,
});
```

**Interfaces:**
```ts
export function startServer(opts: {
  port: number;                // 0 binds an ephemeral port; the resolved port is returned
  dbPath: string;
  handshakeMs?: number;        // default 5000; tests pass 50
}): Promise<{ close(): Promise<void>; port: number; stats(): { rooms: number } }>;
```
Transport rules, exhaustively:
- HTTP: `POST /api/register`, `POST /api/login` — body ≤ 1 KiB (413 above), parsed through
  `CredentialsSchema` (400 with `{error}` on any failure, including duplicates via `AuthError`).
  No CORS headers, no OPTIONS route — the Vite proxy makes the client same-origin.
- WS upgrade on path `/ws`. **Pre-join phase:** any frame that is not a schema-valid `join`
  with a valid token → close 4401 (this precedence beats the bad_message rule below). No valid
  `join` within `handshakeMs` → close 4401. `join` for a roomId with no row →
  `error no_room` on the socket (socket-layer emit, not `Room.emit` — no account is bound yet),
  socket stays open.
- **Post-join:** frames parse through `ClientMsgSchema`; a parse failure emits
  `error bad_message` and drops the frame, never the connection (all four malformed shapes:
  non-JSON, unknown `t`, bad field, binary frame). A second `join` → `error already_joined`. A
  `join` for an account with a live socket elsewhere closes the **older** socket with 4409 and
  transfers the occupant without a leave/join pair. Every handler is wrapped: a throw emits
  `error internal` and the process survives.
- Rooms: one instance per roomId, lazy, `room.dispose()` + drop **5 minutes** after
  `occupantCount()` hits 0 (timer cancelled by a join). Socket close → `room.leave` →
  `avatar_leave` broadcast. Reconnect = a fresh join (full `room_state` is the resync).
- `close()`: terminate all ws clients, `wss.close()`, destroy tracked HTTP sockets, close the
  HTTP server, dispose every room, `closeDb`. (Tests use `connection: close` fetch headers.)
- `log.ts`: one JSON line per join/leave/place/pickup/error-emitted/malformed-frame, to stdout.

- [ ] `helpers.ts` — the `bus()` message-waiter from the test-adequacy audit, verbatim: buffers
  all messages, validates each through `ServerMsgSchema.parse` (outbound conformance pinned in
  every test for free), `waitFor(t, ms)` resolves on first match including already-received,
  timeout message lists what did arrive, `never(t)` after an explicit 50 ms drain.
- [ ] Integration tests (ephemeral port per test via `port: 0`; `mkdtempSync` db per test;
  `await srv.close()` in `afterEach`):
  register → join → `room_state` (roomId 1, name "The Lobby Café"); second client `avatar_join`;
  move → `walk` on both sockets with `from` and `startedAt`; shout in room 2 round-trips
  filtered; whisper matrix (target + sender receive, third client's `bus.never("chat")` holds);
  malformed ×4 → `error bad_message` then a valid frame still works (connection survives);
  pre-join garbage → 4401; handshake timeout (`handshakeMs: 50`) → 4401; unknown room →
  `no_room`, socket usable after; double join → `already_joined`; same account second socket →
  older closes 4409, no duplicate `avatar_join`; socket close → `avatar_leave` for the other
  client; `stats().rooms` goes 1 → (advance fake timers 5 min) → 0 after both leave;
  duplicate register → 400; oversized body → 413; `close()` resolves with a socket open
  (`{ timeout: 2000 }`); **place/persist/restart**: place from inventory → both sockets get
  `furni_placed`; `close()`, `startServer` again on the same db and port, rejoin **with the
  original token** (proves session persistence) → `room_state.furni` contains the item with its
  exact `z`.
- [ ] Run — FAIL, implement, run — PASS. Commit.

### Task 9: Draw-order comparator (`@grand/client`)

**Files:** Create `packages/client/src/scene/sort.ts`, `packages/client/test/sort.test.ts`.

**Interfaces:**
```ts
export interface Sortable { x: number; y: number; z: number; kind: "tile" | "floor_furni" | "avatar" | "furni" }
export function depthKey(s: Sortable): number;
// Ascending: larger key draws later, on top. Ties resolve by insertion order (ES2019 stable
// sort / Pixi zIndex). NOTE the layer signs are inverted relative to the reference client's
// AVATAR_SPRITE_DEFAULT_DEPTH because the reference sorts DESCENDING — do not "fix" them back.
```
The scheme (finite everywhere — no infinities; requires `z < 10` per global constraints):
```ts
const TILE_BAND = -1e6;                                  // floor band, still ordered by depth
const LAYER = { floor_furni: -2e-2, avatar: -1e-2, furni: 0 } as const;
export function depthKey(s: Sortable): number {
  if (s.kind === "tile") return TILE_BAND + (s.x + s.y);
  return (s.x + s.y) + s.z * 1e-3 + LAYER[s.kind];
}
```
An item is `floor_furni` when its def has `canWalk: true` (the rug). Multi-tile furni passes its
origin tile — the reference client's own limitation, resolved later by generator-computed layer
offsets. Rendering applies keys via `sprite.zIndex = depthKey(...)` with
`container.sortableChildren = true` (PixiJS 8 has no comparator hook).

- [ ] Tests first:
  ```ts
  test("tile keys are finite and ordered by depth", () => {
    const near = depthKey({ kind: "tile", x: 0, y: 0, z: 0 });
    const far = depthKey({ kind: "tile", x: 11, y: 11, z: 0 });
    expect(Number.isFinite(near)).toBe(true);
    expect(near).toBeLessThan(far);
  });
  test("every tile draws under every non-tile", () =>
    expect(depthKey({ kind: "tile", x: 11, y: 11, z: 0 }))
      .toBeLessThan(depthKey({ kind: "floor_furni", x: 0, y: 0, z: 0 })));
  test("nearer furni draws over farther furni", () => {
    expect(depthKey({ kind: "furni", x: 2, y: 2, z: 0 }))
      .toBeGreaterThan(depthKey({ kind: "furni", x: 1, y: 2, z: 0 }));
    expect(depthKey({ kind: "furni", x: 2, y: 3, z: 0 }))
      .toBeGreaterThan(depthKey({ kind: "furni", x: 2, y: 2, z: 0 }));
  });
  test("stacked item draws over its base on the same tile", () =>
    expect(depthKey({ kind: "furni", x: 3, y: 3, z: 1 }))
      .toBeGreaterThan(depthKey({ kind: "furni", x: 3, y: 3, z: 0 })));
  test("same tile: rug under avatar under table", () => {
    const rug = depthKey({ kind: "floor_furni", x: 3, y: 3, z: 0 });
    const avatar = depthKey({ kind: "avatar", x: 3, y: 3, z: 0 });
    const table = depthKey({ kind: "furni", x: 3, y: 3, z: 0 });
    expect(rug).toBeLessThan(avatar);
    expect(avatar).toBeLessThan(table);
  });
  test("avatar draws under furni one tile nearer", () =>
    expect(depthKey({ kind: "avatar", x: 3, y: 3, z: 0 }))
      .toBeLessThan(depthKey({ kind: "furni", x: 4, y: 3, z: 0 })));
  test("equal keys are possible and identical (stable sort resolves them)", () =>
    expect(depthKey({ kind: "furni", x: 2, y: 3, z: 0 }))
      .toBe(depthKey({ kind: "furni", x: 3, y: 2, z: 0 })));
  ```
- [ ] Run — FAIL, implement, run — PASS. Commit.

### Task 10: Client scene — tiles, avatars, net

**Files:** Create `packages/client/index.html`, `packages/client/vite.config.ts`,
`packages/client/src/net.ts`, `packages/client/src/scene/room.ts`,
`packages/client/src/scene/walk.ts`, `packages/client/src/scene/avatar.ts`,
`packages/client/src/main.ts`, `packages/client/test/walk.test.ts`,
`packages/client/test/net.test.ts`.

- [ ] `vite.config.ts` (the whole cross-origin story — server stays CORS-free):
  ```ts
  import { defineConfig } from "vite";
  export default defineConfig({
    server: {
      proxy: {
        "/api": "http://localhost:8080",
        "/ws": { target: "ws://localhost:8080", ws: true },
      },
    },
  });
  ```
- [ ] `net.ts`:
  ```ts
  export class Net {
    connect(url: string, token: string, roomId: number): Promise<void>;  // sends join on open
    send(msg: ClientMsg): void;
    onMessage(handler: (msg: ServerMsg) => void): void;
  }
  ```
  Inbound frames parse through `ServerMsgSchema.safeParse`; a failure logs once and **drops the
  frame — never throws** (a throw in `onmessage` kills the message loop). Test with a fake
  socket object (no PixiJS, no network): valid frame reaches the handler, garbage frame does
  not and does not throw.
- [ ] `walk.ts` — the pure math `AvatarSprite` uses, exported for tests:
  ```ts
  export function lerpScreen(a: { sx: number; sy: number }, b: { sx: number; sy: number }, t: number): { sx: number; sy: number };
  export { dirFromStep } from "@grand/shared";
  ```
  Test: `lerpScreen(worldToScreen(0,0,0,64), worldToScreen(1,0,0,64), 250/500)` →
  `{ sx: 16, sy: 8 }` (computable from Task 2's constants).
- [ ] `scene/room.ts`: draws tile diamonds via `worldToScreen` (two greens checkerboard, red
  door tile). **Hit-testing: floor tiles are the only interactive objects**
  (`eventMode: "static"`; furni and avatars `"none"`) — the clicked tile comes from Pixi's hit
  test on the diamond, not from `screenToTile` on raw pointer coordinates, which is wrong by
  (H, H) tiles over any raised surface. `screenToTile` is only the empty-background fallback.
- [ ] `scene/avatar.ts`: placeholder 24×48 rounded rectangle + name label, color from username
  hash. `walk(msg)` snaps to `msg.from`, offsets its clock by `msg.startedAt` (client-server
  delta estimated once at join from `Date.now()`), interpolates per step via `lerpScreen` with
  each step's `z`, faces via `dirFromStep`.
- [ ] `main.ts`: login/register form → `/api/*` → `net.connect(`ws://${location.host}/ws`,
  token, 1)` → wire `room_state`/`avatar_join`/`walk`/`avatar_leave`/`furni_*` to the scene,
  tile clicks to `send({t:"move",...})`.
- [ ] Run `pnpm --filter @grand/client test` — walk + net tests PASS. Manual: `make dev`, two
  browsers, register `alice`/`bob`, both visible in the café, click-to-walk in sync, walking
  onto the casino floor's platform (room 2 via a temporary `?room=2` query param) renders
  avatars at raised height.
- [ ] Commit.

### Task 11: Chat UI

**Files:** Create `packages/client/src/ui/chat.ts`, `packages/client/src/ui/parse.ts`,
`packages/client/test/parse.test.ts`. Modify `main.ts` (wire input + bubbles).

- [ ] `parse.ts` — pure, tested:
  ```ts
  export type ChatIntent = { kind: "say" | "shout"; text: string } | { kind: "whisper"; to: string; text: string };
  export function parseChatInput(raw: string, shiftEnter: boolean): ChatIntent | null;
  // "/w bob hi" → whisper to bob; shiftEnter → shout; plain → say; empty/whitespace → null
  ```
  Tests: the four cases above plus `"/w bob"` (no text) → null.
- [ ] `chat.ts`: input box (Enter = say, Shift+Enter = shout, `/w name text` = whisper), bubbles
  positioned from the avatar's projected screen point, 5 s fade. Styling by message fields, not
  content: `mode: "shout"` bold, `mode: "whisper"` italic purple, `faded: true` gray italic
  (the server's `faded` flag — a player typing "…" renders normally).
- [ ] Manual verification: three windows — say at range shows faded dots on the far client and
  text near; café rejects shout with an error toast; whisper reaches exactly sender + target;
  a filtered word arrives as "blah".
- [ ] Commit.

### Task 12: Furni placement client

**Files:** Create `packages/client/src/scene/furni.ts`. Modify `main.ts` (inventory strip),
`scene/room.ts` (hover highlight).

- [ ] `FurniSprite`: extruded placeholder box — top diamond `w×l` tiles, sides
  `stackHeights[state]` height-units tall, three shades of `def.color`, drawn at the item's `z`,
  `kind` chosen by `canWalk`. Handles `furni_placed` (new id → create, known id → update),
  `furni_moved` (reposition), `furni_removed`.
- [ ] Inventory strip: bottom bar by def name, click to arm. Hover highlight calls the shared
  `checkPlacement` — the same function the server runs, so green/red never disagrees with the
  verdict — green tiles on ok, red on any error. Click sends `place`; right-click an owned item
  sends `pickup`.
- [ ] No new server test here (the end-to-end place/restart case lives in Task 8 where its code
  does). Client-side placement logic is already covered by Task 4's shared tests.
- [ ] Manual verification: place a table, stack a plant on its far tile, pick up the table —
  the plant visibly drops (the `furni_moved` path); chair-on-chair shows red hover and, if
  forced, an error toast; walk across the rug (avatar rises 0.05) but not through the table;
  hover highlight matches the server verdict in every case tried.
- [ ] Commit.

### Task 13: Smoke suite

**Files:** Create `packages/server/test/smoke.test.ts` (picked up by the normal vitest run — no
separate Makefile target).

- [ ] Ordered `test()` blocks sharing one `beforeAll` server + three registered accounts (real
  timers, generous per-test timeouts — this is the one file allowed to wait out a real walk):
  1. joins and mutual visibility (schema-validated via `bus()`).
  2. walk: alice moves 3 tiles; after arrival a **third client joins** and its `room_state`
     shows alice at the destination — the end-to-end proof that server-side position advanced.
  3. chat delivery matrix: say near/far (faded flag asserted), shout (casino room), whisper
     (sender + target + `never` on the third).
  4. place → stack → pickup with `furni_moved` observed by all clients; row `z` values asserted.
  5. restart on the same db with the same token; furni and position state re-served.
  6. all sockets closed → advance past the disposal grace → `stats().rooms === 0`.
- [ ] `make test` green across all packages (typecheck + unit + integration + smoke + client
  build). `make dev` demo checklist from Tasks 10–12 passes in two browsers.
- [ ] Commit: `git add -A && git commit -m "Build steps 1-2 vertical slice: rooms, chat, furni"`.

## Self-review

- Every included behavior maps to a task with a test or an explicit manual step; every excluded
  design element is named in the scope paragraph.
- All five blocking audit clusters are resolved in-text: pnpm 11 allowlist + tsconfig flags
  (Task 1), layered depth scheme with finite tile band (Task 9), split inventory schema +
  `furni_moved` + walk `from`/`startedAt`/`z` (Task 4), octile A* with total pop order (Task 5),
  `dispose()`/`close()` lifecycle with timer-count assertions (Tasks 7–8).
- Names and signatures consistent: `worldToScreen`/`screenToTile`/`dirFromStep` (2, 10),
  `RoomModel`/`climbOk`/`charToHeight` (3, 5, 6), `ClientMsg`/`ServerMsg`/`Tile`/error enum (4,
  7, 8, 10), `checkPlacement`/`footprintTiles`/`stackTop` (4, 7, 12), `findPath` (5, 7),
  `Room`/`Emit`/`dispose` (7, 8), `depthKey` (9, 10, 12), `bus()` (8, 13).
- Expected values are computable before implementation everywhere a test is specified — the two
  hand-derived ones (wall-gap length 10, lerp midpoint {16,8}) carry their derivations.
