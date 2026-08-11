import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, expect, test } from "vitest";
import Database from "better-sqlite3";
import {
  WHEEL_LAYOUT, WHEEL_MAX_STAKE, WHEEL_MIN_STAKE, WHEEL_SEGMENTS,
  footprintTiles, parseHeightmap, tileHeight,
} from "@grand/shared";
import type { FurniDef, FurniItem } from "@grand/shared";
import { PROTOTYPE_CATALOG } from "@grand/shared";
import { closeDb, openDb } from "../src/db.ts";
import { DAILY_STAKE_CAP } from "../src/ledger.ts";
import { startServer } from "../src/server.ts";
import type { ServerHandle } from "../src/server.ts";
import { connect } from "./helpers.ts";
import type { Bus } from "./helpers.ts";
import type { WebSocket } from "ws";

// The Grand Wheel (#429) end to end: the wager arrives as its own message, so everything the use
// verb guarantees — the item is here, you are standing at it, one go per cooldown — has to be
// guaranteed again, and a bet is refused with a sentence rather than dropped. The draw is seeded
// throughout: a test that spun for real would assert nothing about what the odds actually pay.

const CASINO_ROOM_ID = 2;
const WHEEL_AT = { x: 18, y: 9, dir: 0 } as const;
const PODIUM_AT = { x: 17, y: 10 } as const;
/** The wheel's own cooldown is the use verb's 700ms; the margin covers the round trip. */
const COOLDOWN_MS = 750;

let dir: string;
let dbPath: string;
let srv: ServerHandle | undefined;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-wheel-"));
  dbPath = join(dir, "test.db");
  srv = undefined;
});

afterEach(async () => {
  if (srv) await srv.close();
  srv = undefined;
  rmSync(dir, { recursive: true, force: true });
});

interface Player { ws: WebSocket; bus: Bus; id: number }

function withDb<T>(fn: (db: Database.Database) => T): T {
  const db = new Database(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

/** A roll that lands squarely on `slot` — the midpoint of its arc, so rounding cannot slide it
 *  onto a neighbour when the wheel's layout is edited around it. */
const rollForSlot = (slot: number): number => (slot + 0.5) / WHEEL_LAYOUT.length;

const slotOf = (segment: string): number => {
  const slot = WHEEL_LAYOUT.indexOf(segment);
  if (slot < 0) throw new Error(`no ${segment} on the wheel`);
  return slot;
};

async function start(landsOn: string): Promise<number> {
  srv = await startServer({
    port: 0, dbPath, npcGenerate: null, wheelRoll: () => rollForSlot(slotOf(landsOn)),
  });
  return srv.port;
}

async function joinAs(port: number, username: string): Promise<Player> {
  const res = await fetch(`http://127.0.0.1:${port}/api/register`, {
    method: "POST",
    headers: { "content-type": "application/json", connection: "close" },
    body: JSON.stringify({ username, password: "password1" }),
  });
  const { token } = (await res.json()) as { token: string };
  const [ws, bus] = await connect(port);
  ws.send(JSON.stringify({ t: "join", token, roomId: CASINO_ROOM_ID }));
  const state = await bus.waitFor("room_state");
  await bus.waitFor("sets");
  return { ws, bus, id: state.you };
}

function fund(accountId: number, amount: number): void {
  withDb((db) =>
    db
      .prepare(
        `INSERT INTO star_balances (account_id, balance) VALUES (?, ?)
         ON CONFLICT(account_id) DO UPDATE SET balance = balance + excluded.balance`,
      )
      .run(accountId, amount),
  );
}

const balance = (accountId: number): number =>
  withDb((db) =>
    (db.prepare("SELECT balance FROM star_balances WHERE account_id = ?").get(accountId) as
      | { balance: number }
      | undefined)?.balance ?? 0);

/** The account's wheel rows in the order they were written — the stake, then the payout if there
 *  was one. Keyed, because the payout must not reuse the stake's op_key or settleWin reads it as
 *  already settled and pays nothing. */
const rows = (accountId: number): Array<{ opKey: string; stars: number }> =>
  withDb((db) =>
    db
      .prepare(
        "SELECT op_key AS opKey, stars FROM ledger_entries WHERE account_id = ? AND op = 'wheel'" +
          " ORDER BY id",
      )
      .all(accountId) as Array<{ opKey: string; stars: number }>);

const wheelId = (): number =>
  withDb((db) =>
    (db
      .prepare("SELECT id FROM furni_items WHERE room_id = ? AND def_id = 'grand_wheel'")
      .get(CASINO_ROOM_ID) as { id: number }).id);

/** Walks a player onto a tile and waits out the walk. The door is at (0,6) and the wheel is on the
 *  far side of the room, so every bet below has to get there first. */
async function walkTo(p: Player, x: number, y: number): Promise<void> {
  p.ws.send(JSON.stringify({ t: "move", x, y }));
  const walk = await p.bus.waitFor("walk");
  await new Promise((r) => setTimeout(r, walk.path.length * walk.msPerTile + 250));
}

const bet = (p: Player, itemId: number, segment: string, stake: number): void =>
  p.ws.send(JSON.stringify({ t: "wheel_bet", itemId, segment, stake }));

const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

test("a seeded spin on the winning colour pays its multiplier, once", async () => {
  const port = await start("gold");
  const alice = await joinAs(port, "alice");
  const itemId = wheelId();
  fund(alice.id, 100);
  await walkTo(alice, 17, 9);

  const gold = WHEEL_SEGMENTS.gold!;
  bet(alice, itemId, "gold", 20);
  expect(await alice.bus.waitFor("stars")).toMatchObject({ delta: -20, balance: 80 });
  expect(await alice.bus.waitFor("stars")).toMatchObject({
    delta: 20 * gold.multiplier, balance: 80 + 20 * gold.multiplier,
  });
  expect(await alice.bus.waitFor("wheel_result")).toMatchObject({
    itemId, accountId: alice.id, name: "alice",
    betSegment: "gold", resultSegment: "gold", slot: slotOf("gold"),
    stake: 20, payout: 20 * gold.multiplier,
  });
  expect(balance(alice.id)).toBe(100 - 20 + 20 * gold.multiplier);

  // Two rows, and the payout's key is the stake's with ":win" on it — the same key twice would
  // pass settleWin's already-settled check and pay the winner nothing.
  const ledger = rows(alice.id);
  expect(ledger.map((r) => r.stars)).toEqual([-20, 20 * gold.multiplier]);
  expect(ledger[1]?.opKey).toBe(`${ledger[0]?.opKey}:win`);
  expect(new Set(ledger.map((r) => r.opKey)).size).toBe(2);

  // A second bet inside the cooldown window is one spin too many, and says so.
  bet(alice, itemId, "gold", 20);
  expect(await alice.bus.waitFor("error")).toMatchObject({ code: "wheel" });
  expect(rows(alice.id)).toHaveLength(2);
}, 30_000);

test("a losing spin keeps the stake, and the whole room watches it land", async () => {
  const port = await start("crimson");
  const alice = await joinAs(port, "alice");
  const bob = await joinAs(port, "bob");
  const itemId = wheelId();
  fund(alice.id, 100);
  await walkTo(alice, 17, 9);

  bet(alice, itemId, "plum", 50);
  expect(await alice.bus.waitFor("stars")).toMatchObject({ delta: -50, balance: 50 });

  // Bob never left the door: the spin is a spectacle, so it reaches him exactly as it reaches the
  // player who paid for it.
  const landed = {
    itemId, accountId: alice.id, name: "alice",
    betSegment: "plum", resultSegment: "crimson", slot: slotOf("crimson"), stake: 50, payout: 0,
  };
  expect(await alice.bus.waitFor("wheel_result")).toMatchObject(landed);
  expect(await bob.bus.waitFor("wheel_result")).toMatchObject(landed);

  expect(balance(alice.id)).toBe(50);
  expect(rows(alice.id).map((r) => r.stars)).toEqual([-50]);
  await alice.bus.never("stars", 100);
}, 30_000);

test("betting from across the room is refused", async () => {
  const port = await start("crimson");
  const alice = await joinAs(port, "alice");
  fund(alice.id, 100);

  // Still on the door tile at (0,6), seventeen tiles short of the wheel.
  bet(alice, wheelId(), "crimson", 20);
  const refused = await alice.bus.waitFor("error");
  expect(refused.code).toBe("wheel");
  expect(refused.message).toMatch(/step up to the wheel/);
  expect(balance(alice.id)).toBe(100);
  expect(rows(alice.id)).toEqual([]);
}, 30_000);

test("a bet the wheel cannot honour is refused before a Star moves", async () => {
  const port = await start("crimson");
  const alice = await joinAs(port, "alice");
  const itemId = wheelId();
  fund(alice.id, 15);
  await walkTo(alice, 17, 9);

  const refusals: Array<[string, number, string, RegExp]> = [
    ["chartreuse", 20, "wheel", /not a segment on the wheel/],
    ["crimson", WHEEL_MIN_STAKE - 1, "wheel", new RegExp(`no less than ${WHEEL_MIN_STAKE}`)],
    ["crimson", WHEEL_MAX_STAKE + 1, "wheel", new RegExp(`no more than ${WHEEL_MAX_STAKE}`)],
    // In range and inside the cap, but the balance is 15: the ledger is the last word, and its
    // refusal reaches the player under the code every other spend refusal uses.
    ["crimson", 20, "purchase", /not enough Stars/],
  ];
  for (const [segment, stake, code, message] of refusals) {
    bet(alice, itemId, segment, stake);
    const refused = await alice.bus.waitFor("error");
    expect(refused.message, `${segment} @ ${stake}`).toMatch(message);
    expect(refused.code, `${segment} @ ${stake}`).toBe(code);
    await pause(COOLDOWN_MS);
  }

  expect(balance(alice.id)).toBe(15);
  expect(rows(alice.id)).toEqual([]);
}, 30_000);

test("the daily stake cap stops the bet and names what is left to stake", async () => {
  const port = await start("crimson");
  const alice = await joinAs(port, "alice");
  const itemId = wheelId();
  fund(alice.id, 1000);
  await walkTo(alice, 17, 9);

  // Five losing bets at the ceiling stake put the whole day's allowance through the wheel.
  const spins = DAILY_STAKE_CAP / WHEEL_MAX_STAKE;
  for (let i = 0; i < spins; i++) {
    bet(alice, itemId, "plum", WHEEL_MAX_STAKE);
    await alice.bus.waitFor("wheel_result");
    await pause(COOLDOWN_MS);
  }
  expect(balance(alice.id)).toBe(1000 - DAILY_STAKE_CAP);

  bet(alice, itemId, "plum", WHEEL_MIN_STAKE);
  const refused = await alice.bus.waitFor("error");
  expect(refused.code).toBe("purchase");
  expect(refused.message).toMatch(
    new RegExp(`daily stake cap — 0 ★ of ${DAILY_STAKE_CAP} left to stake today`),
  );
  expect(balance(alice.id)).toBe(1000 - DAILY_STAKE_CAP);
  expect(rows(alice.id)).toHaveLength(spins);
}, 60_000);

// The layout half of #429: a wheel the handler can find, on ground it can stand on, with somewhere
// to bet from. Read off the seeded room rather than the Layout constant, so what is checked is
// what a booted hotel actually has.
test("the casino stands the wheel and its odds board on flat ground you can walk up to", () => {
  const db = openDb(dbPath);
  try {
    const doc = JSON.parse(
      (db.prepare("SELECT doc FROM rooms WHERE id = ?").get(CASINO_ROOM_ID) as { doc: string }).doc,
    ) as { heightmap: string; door: { x: number; y: number; dir: number } };
    const model = parseHeightmap(doc.heightmap, doc.door);
    const floor = db
      .prepare(
        "SELECT id, def_id AS defId, x, y, z, dir, state FROM furni_items" +
          " WHERE room_id = ? AND wall_side IS NULL",
      )
      .all(CASINO_ROOM_ID) as FurniItem[];
    const defs = new Map<string, FurniDef>(PROTOTYPE_CATALOG.map((d) => [d.id, d]));

    const wheel = floor.find((f) => f.defId === "grand_wheel");
    expect(wheel).toMatchObject(WHEEL_AT);
    expect(floor.find((f) => f.defId === "wheel_podium")).toMatchObject(PODIUM_AT);
    expect(floor.filter((f) => f.defId === "grand_wheel")).toHaveLength(1);

    // A 2x1 cannot straddle a height change, and the wheel is the tallest thing in the game
    // standing two rows north of a terrace that is one unit up.
    const under = footprintTiles(defs.get("grand_wheel")!, wheel!.x, wheel!.y, wheel!.dir);
    expect(under).toEqual([{ x: 18, y: 9 }, { x: 19, y: 9 }]);
    expect(new Set(under.map((t) => tileHeight(model, t.x, t.y)))).toEqual(new Set([0]));

    // Reach is Chebyshev 1 off the footprint, so at least one neighbouring tile has to be floor
    // that nothing else is standing on — otherwise the wheel is scenery.
    const covered = new Set(
      floor.flatMap((f) =>
        footprintTiles(defs.get(f.defId)!, f.x, f.y, f.dir).map((t) => `${t.x},${t.y}`),
      ),
    );
    const open = under.flatMap((t) =>
      [-1, 0, 1].flatMap((dx) => [-1, 0, 1].map((dy) => ({ x: t.x + dx, y: t.y + dy }))),
    ).filter((t) =>
      t.x >= 0 && t.y >= 0 && t.x < model.width && t.y < model.height &&
      tileHeight(model, t.x, t.y) === 0 && !covered.has(`${t.x},${t.y}`)
    );
    expect(open.length).toBeGreaterThan(0);
  } finally {
    closeDb(db);
  }
});
