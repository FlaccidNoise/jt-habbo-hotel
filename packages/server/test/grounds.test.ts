import { createHash } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  PROTOTYPE_CATALOG, RoomDecorSchema, decorRegionsFault, footprintTiles, parseHeightmap, tileHeight,
} from "@grand/shared";
import type { FurniItem, RoomDecor, RoomModel } from "@grand/shared";
import type Database from "better-sqlite3";
import { openDb, closeDb } from "../src/db.ts";
import {
  GROUNDS, GROUNDS_DECOR, GROUNDS_DOOR, GROUNDS_HEIGHTMAP, GROUNDS_ROOM_ID, ZONES,
} from "../src/grounds.ts";
import { reachable } from "../src/pathfind.ts";

// The Resort Grounds (#406). The room is generated, so what these tests hold onto is what a
// generator can get wrong that a hand-written layout cannot: a hedge that seals a nook, a rhythm
// that walks two pieces onto the same tile, a counter nobody can reach, and — the regression that
// named the bug — a seed that never finishes because the open-tile check was per-tile A*.

let dir: string;
let dbPath: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "grand-grounds-"));
  dbPath = join(dir, "test.db");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const DEFS = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));

function defOf(defId: string): (typeof PROTOTYPE_CATALOG)[number] {
  const def = DEFS.get(defId);
  if (!def) throw new Error(`the layout names a def that is not in the catalog: ${defId}`);
  return def;
}

function floorOf(db: Database.Database): FurniItem[] {
  return db
    .prepare(
      "SELECT id, def_id AS defId, x, y, z, dir, state FROM furni_items" +
        " WHERE room_id = ? AND wall_side IS NULL",
    )
    .all(GROUNDS_ROOM_ID) as FurniItem[];
}

/** The room as a walker sees it: the parsed floor, and the tiles the seeded furniture closes. */
function walkable(db: Database.Database): {
  model: RoomModel;
  blocked: (x: number, y: number) => boolean;
} {
  const doc = JSON.parse(
    (db.prepare("SELECT doc FROM rooms WHERE id = ?").get(GROUNDS_ROOM_ID) as { doc: string }).doc,
  ) as { heightmap: string; door: typeof GROUNDS_DOOR };
  const solid = new Set<string>();
  for (const item of floorOf(db)) {
    const def = defOf(item.defId);
    if (def.canWalk) continue;
    for (const t of footprintTiles(def, item.x, item.y, item.dir)) solid.add(`${t.x},${t.y}`);
  }
  return {
    model: parseHeightmap(doc.heightmap, doc.door),
    blocked: (x, y) => solid.has(`${x},${y}`),
  };
}

describe("the Resort Grounds floor", () => {
  test("parses at 200x200 with a walkable door", () => {
    const model = parseHeightmap(GROUNDS_HEIGHTMAP, GROUNDS_DOOR);
    expect([model.width, model.height]).toEqual([200, 200]);
    expect(tileHeight(model, GROUNDS_DOOR.x, GROUNDS_DOOR.y)).toBe(0);
  });

  test("the heightmap is unchanged (WP3 ZONES refactor guard)", () => {
    // The ZONES rects replaced inline literals in the paint/rim calls that build this string.
    // A hash pin means a future edit to those calls that drifts the floor fails here instead of
    // silently shipping a moved terrace.
    expect(createHash("sha256").update(GROUNDS_HEIGHTMAP).digest("hex")).toBe(
      "3c0771a6b88b185cf14ce0456caf8227c8b9710ca89fdc8183d83899484292a7",
    );
  });

  test("the layout stays under the house's own cap", () => {
    expect(GROUNDS.floor.length + GROUNDS.walls.length).toBeLessThanOrEqual(300);
  });

  test("no two pieces stand on the same tile", () => {
    // Nothing in this layout is stacked on purpose, so a shared tile is a rhythm that overran its
    // neighbour. checkPlacement would let it through as a legal stack — a palm on a table.
    const taken = new Map<string, string>();
    const clashes: string[] = [];
    for (const spot of GROUNDS.floor) {
      for (const t of footprintTiles(defOf(spot.defId), spot.x, spot.y, spot.dir ?? 0)) {
        const key = `${t.x},${t.y}`;
        const other = taken.get(key);
        if (other) clashes.push(`${spot.defId} onto ${other} at ${key}`);
        else taken.set(key, spot.defId);
      }
    }
    expect(clashes).toEqual([]);
  });
});

describe("the seeded Resort Grounds", () => {
  test("seeds and furnishes without throwing, well inside the boot budget", () => {
    // #406 itself: assertOpen used to run A* once per tile, which never returns at this room's
    // tile count — 90,000 when the bug was found, 40,000 since #409 took the side to 200.
    const started = Date.now();
    const db = openDb(dbPath);
    const elapsed = Date.now() - started;

    const rows = db
      .prepare("SELECT locked FROM furni_items WHERE room_id = ?")
      .all(GROUNDS_ROOM_ID) as Array<{ locked: number }>;
    expect(rows.length).toBe(GROUNDS.floor.length + GROUNDS.walls.length);
    expect(rows.every((r) => r.locked === 1)).toBe(true);
    expect(elapsed).toBeLessThan(10_000);
    closeDb(db);
  }, 20_000);

  test("every open tile is reachable from the door, in all five zones", () => {
    const db = openDb(dbPath);
    const { model, blocked } = walkable(db);

    const open = reachable(model, blocked, { x: model.door.x, y: model.door.y });
    let reached = 0;
    let expected = 0;
    for (let y = 0; y < model.height; y++) {
      for (let x = 0; x < model.width; x++) {
        if (open[y * model.width + x] === 1) reached++;
        if (tileHeight(model, x, y) >= 0 && !blocked(x, y)) expected++;
      }
    }
    expect(reached).toBe(expected);

    for (const [zone, x, y] of [
      ["plaza", 16, 102],
      ["pool", 65, 75],
      ["stage", 64, 115],
      ["gallery", 110, 84],
      ["café", 108, 118],
    ] as const) {
      expect(tileHeight(model, x, y), `${zone} at ${x},${y} is void`).toBeGreaterThanOrEqual(0);
      expect(blocked(x, y), `${zone} at ${x},${y} is under furniture`).toBe(false);
      expect(open[y * model.width + x], `${zone} at ${x},${y} is cut off from the door`).toBe(1);
    }
    closeDb(db);
  }, 20_000);

  test("every counter you can use has somewhere to stand while you use it", () => {
    const db = openDb(dbPath);
    const { model, blocked } = walkable(db);
    const open = reachable(model, blocked, { x: model.door.x, y: model.door.y });

    const stranded: string[] = [];
    for (const spot of GROUNDS.floor) {
      const def = defOf(spot.defId);
      if (!def.vend && def.interaction !== "wash") continue;
      const usable = footprintTiles(def, spot.x, spot.y, spot.dir ?? 0).some((t) =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
          const x = t.x + (dx ?? 0), y = t.y + (dy ?? 0);
          return tileHeight(model, x, y) >= 0 && !blocked(x, y) &&
            open[y * model.width + x] === 1;
        }),
      );
      if (!usable) stranded.push(`${spot.defId} at ${spot.x},${spot.y}`);
    }
    expect(stranded).toEqual([]);
    closeDb(db);
  }, 20_000);
});

// Per-region floor decor (#407). The Grounds is the room the feature exists for: one deck floor
// across 40,000 tiles could only tell its zones apart by what stood on them.
describe("the Resort Grounds decor regions", () => {
  const storedDecor = (db: Database.Database): RoomDecor =>
    (
      JSON.parse(
        (db.prepare("SELECT doc FROM rooms WHERE id = ?").get(GROUNDS_ROOM_ID) as { doc: string })
          .doc,
      ) as { decor: RoomDecor }
    ).decor;

  const furniIds = (db: Database.Database): number[] =>
    (db.prepare("SELECT id FROM furni_items WHERE room_id = ? ORDER BY id").all(GROUNDS_ROOM_ID) as
      Array<{ id: number }>).map((r) => r.id);

  test("the constant is a legal decor selection for a 200x200 floor", () => {
    expect(RoomDecorSchema.safeParse(GROUNDS_DECOR).success).toBe(true);
    expect(decorRegionsFault(GROUNDS_DECOR, 200, 200)).toBeNull();
  });

  test("a fresh seed stores them", () => {
    const db = openDb(dbPath);
    expect(storedDecor(db)).toEqual(GROUNDS_DECOR);
    closeDb(db);
  }, 20_000);

  // The reseed path (#315/#330): a hotel booted before #407 has a stored doc with no regions in
  // it, and nothing re-reads the constants unless the doc drifts from them. The drift here is
  // decor-only, so the room keeps the furniture it is holding — a relay would mint new item ids
  // for 260 locked pieces.
  test("an existing hotel picks them up on the next boot, keeping its furniture", () => {
    const first = openDb(dbPath);
    const before = furniIds(first);
    const doc = JSON.parse(
      (first.prepare("SELECT doc FROM rooms WHERE id = ?").get(GROUNDS_ROOM_ID) as { doc: string })
        .doc,
    ) as { decor: RoomDecor };
    delete doc.decor.regions;
    first.prepare("UPDATE rooms SET doc = ? WHERE id = ?").run(
      JSON.stringify(doc), GROUNDS_ROOM_ID,
    );
    expect(storedDecor(first).regions).toBeUndefined();
    closeDb(first);

    const second = openDb(dbPath);
    expect(storedDecor(second).regions).toEqual(GROUNDS_DECOR.regions);
    expect(furniIds(second)).toEqual(before);
    closeDb(second);
  }, 30_000);

  // #362: room_state for this room is already ~103 KB, nearly all of it the heightmap. Rectangles
  // were chosen over a decor id per tile so that this number stays in the hundreds of bytes — a
  // per-tile map of 40,000 tiles would have doubled the message.
  test("they cost the room_state under a kilobyte", () => {
    const db = openDb(dbPath);
    const decor = storedDecor(db);
    const { regions, ...roomWide } = decor;
    const growth = JSON.stringify(decor).length - JSON.stringify(roomWide).length;
    expect(regions?.length).toBeGreaterThan(0);
    expect(growth).toBeGreaterThan(0);
    expect(growth).toBeLessThanOrEqual(1024);
    closeDb(db);
  }, 20_000);

  // The water goes inside the pool curb, not on ZONES.POOL — that rect is the whole screened
  // courtyard, so laying floor_pool there would put the cabanas, the loungers, the hot tubs and
  // the bar under water. Pin the distinction: every water tile is open ground, and the ring around
  // it is the raised curb.
  test("the water sits inside the curb rather than over the courtyard", () => {
    const model = parseHeightmap(GROUNDS_HEIGHTMAP, GROUNDS_DOOR);
    const water = GROUNDS_DECOR.regions?.find((r) => r.floor === "floor_pool");
    if (!water) throw new Error("the Grounds no longer lay floor_pool anywhere");

    for (let y = water.y0; y <= water.y1; y++) {
      for (let x = water.x0; x <= water.x1; x++) {
        expect(tileHeight(model, x, y), `water at ${x},${y}`).toBe(0);
      }
    }
    for (let x = water.x0 - 1; x <= water.x1 + 1; x++) {
      expect(tileHeight(model, x, water.y0 - 1), `curb at ${x},${water.y0 - 1}`).toBe(1);
      expect(tileHeight(model, x, water.y1 + 1), `curb at ${x},${water.y1 + 1}`).toBe(1);
    }
    // A lounger or a cabana inside the water rect would mean the rect had grown into the deck.
    for (const spot of GROUNDS.floor) {
      const inside = spot.x >= water.x0 && spot.x <= water.x1 &&
        spot.y >= water.y0 && spot.y <= water.y1;
      if (inside) expect(spot.defId, `${spot.defId} at ${spot.x},${spot.y}`).toBe("pool_ladder");
    }
  });
});

describe("ZONES", () => {
  test("every rect sits inside the 200x200 floor with x0<=x1 and y0<=y1", () => {
    for (const [name, rect] of Object.entries(ZONES)) {
      expect(rect.x0, `${name}.x0`).toBeGreaterThanOrEqual(0);
      expect(rect.y0, `${name}.y0`).toBeGreaterThanOrEqual(0);
      expect(rect.x1, `${name}.x1`).toBeLessThan(200);
      expect(rect.y1, `${name}.y1`).toBeLessThan(200);
      expect(rect.x0, `${name}: x0<=x1`).toBeLessThanOrEqual(rect.x1);
      expect(rect.y0, `${name}: y0<=y1`).toBeLessThanOrEqual(rect.y1);
    }
  });
});
