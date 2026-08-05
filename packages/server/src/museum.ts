import {
  PROTOTYPE_CATALOG,
  ROOM_FURNI_CAP,
  WALL_CATALOG,
  checkPlacement,
  checkWallPlacement,
  parseHeightmap,
} from "@grand/shared";
import type { FurniDef, FurniItem, WallDef, WallItem } from "@grand/shared";
import type Database from "better-sqlite3";
import { listRoomFurni, listRoomWallFurni } from "./items.ts";
import { logItemGrants } from "./ledger.ts";

// The Museum wing (GAME.md §Sinks, #210): donate a rare for permanent public exhibition with an
// engraved donor plaque. It is an *item* sink rather than a Stars sink — the item leaves
// circulation forever — which drains Stars indirectly, because the donor buys another.
//
// A donation is bound (never traded again), locked (never picked up again), and keeps its owner:
// the donor's name is the point of the plaque, so ownership is the provenance record.

export const MUSEUM_ROOM_ID = 3;

/** The plinth row and the plaque above it. Exhibits fill left to right; the plaque hangs on the
 *  right wall directly behind its plinth, so a visitor reads the name with the piece. */
const PLINTHS: ReadonlyArray<{ x: number; y: number }> = Array.from({ length: 10 }, (_, i) => ({
  x: i + 1,
  y: 0,
}));
const PLAQUE_DEF = "record_trophy";
/** How far down its wall segment the plaque hangs. Above the tallest thing anyone can donate —
 *  the candelabra is 2.34 height units, 75 px — because an exhibit that hides its own donor
 *  plaque defeats the point of donating. The wall is WALL_TOP_PX tall. */
export const PLAQUE_V = 24;

const DEFS: ReadonlyMap<string, FurniDef> = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
const WALL_DEFS: ReadonlyMap<string, WallDef> = new Map(WALL_CATALOG.map((d) => [d.id, d]));

export type DonationResult =
  | {
      ok: true; itemId: number; plaqueId: number; spot: { x: number; y: number };
      inscription: string;
    }
  | { ok: false; reason: string };

function museumModel(db: Database.Database): ReturnType<typeof parseHeightmap> {
  const row = db.prepare("SELECT doc FROM rooms WHERE id = ?").get(MUSEUM_ROOM_ID) as
    | { doc: string }
    | undefined;
  if (!row) throw new Error("the museum room is missing");
  const doc = JSON.parse(row.doc) as { heightmap: string; door: { x: number; y: number; dir: number } };
  return parseHeightmap(doc.heightmap, doc.door);
}

/** How the plaque reads. No text renderer exists, so the engraving is data the client shows on
 *  click — the same field #206's trophies will carry. */
export function engraving(donor: string, defName: string, at: number): string {
  const date = new Date(at).toISOString().slice(0, 10);
  return `${defName} — donated by ${donor}, ${date}`;
}

export interface Exhibit {
  item: FurniItem;
  plaque: WallItem;
}

/** Everything on show, paired with its plaque by the plinth it stands on. */
export function exhibits(db: Database.Database): Exhibit[] {
  const floor = listRoomFurni(db, MUSEUM_ROOM_ID);
  const walls = listRoomWallFurni(db, MUSEUM_ROOM_ID);
  const out: Exhibit[] = [];
  for (const spot of PLINTHS) {
    const item = floor.find((f) => f.x === spot.x && f.y === spot.y);
    const plaque = walls.find((w) => w.side === "right" && w.x === spot.x);
    if (item && plaque) out.push({ item, plaque });
  }
  return out;
}

/** The first plinth this piece actually fits on, asked of the real placement checker rather than
 *  by tile equality — a 2x2 donation covers its neighbour's plinth, and a bare "is that tile
 *  taken" test would offer a spot that then refused the item. */
function freePlinth(
  db: Database.Database,
  def: FurniDef,
  model: ReturnType<typeof parseHeightmap>,
  floor: FurniItem[],
): { spot: { x: number; y: number }; z: number } | null {
  for (const spot of PLINTHS) {
    const result = checkPlacement(
      {
        model, furni: floor, defs: DEFS, avatars: [],
        doorTile: { x: model.door.x, y: model.door.y }, roomFurniCap: ROOM_FURNI_CAP,
      },
      def, spot.x, spot.y, 0,
    );
    if (result.ok) return { spot, z: result.z };
  }
  return null;
}

/** Donates one owned inventory item. One transaction: the piece is placed and locked, the plaque
 *  is minted and hung, and both are logged. A donation is irreversible by design — the refusal
 *  path is the only kindness the museum offers, so it fails closed on anything unclear. */
export function donate(
  db: Database.Database,
  opts: { accountId: number; donor: string; itemId: number; now?: number },
): DonationResult {
  const now = opts.now ?? Date.now();
  const plaqueDef = WALL_DEFS.get(PLAQUE_DEF);
  if (!plaqueDef) throw new Error(`the museum plaque def ${PLAQUE_DEF} is missing`);

  return db.transaction((): DonationResult => {
    const row = db
      .prepare(
        "SELECT def_id AS defId, owner_id AS ownerId, room_id AS roomId, bound FROM furni_items WHERE id = ?",
      )
      .get(opts.itemId) as
      | { defId: string; ownerId: number; roomId: number | null; bound: number }
      | undefined;
    if (!row || row.ownerId !== opts.accountId || row.roomId !== null) {
      return { ok: false, reason: "that item is not in your inventory" };
    }
    // A bound item is already out of circulation, so donating it would absorb nothing and the
    // donor would lose a fixture for no gain.
    if (row.bound) return { ok: false, reason: "an account-bound item cannot be donated" };
    const def = DEFS.get(row.defId);
    if (!def) return { ok: false, reason: "only floor furni can go on a plinth" };

    const model = museumModel(db);
    const floor = listRoomFurni(db, MUSEUM_ROOM_ID);
    const walls = listRoomWallFurni(db, MUSEUM_ROOM_ID);
    const free = freePlinth(db, def, model, floor);
    if (!free) return { ok: false, reason: "the museum is full — every plinth is taken" };
    const { spot, z } = free;

    const plaqueU = Math.max(0, Math.round((32 - plaqueDef.plane.w) / 4) * 2);
    const hanging = checkWallPlacement(
      {
        model, wallFurni: walls, defs: WALL_DEFS,
        furniCount: floor.length + walls.length, roomFurniCap: ROOM_FURNI_CAP,
      },
      plaqueDef, "right", spot.x, 0, plaqueU, PLAQUE_V,
    );
    if (!hanging.ok) return { ok: false, reason: `no wall for the plaque: ${hanging.code}` };

    const inscription = engraving(opts.donor, def.name, now);
    db.prepare(
      "UPDATE furni_items SET room_id = ?, x = ?, y = ?, z = ?, dir = 0, bound = 1, locked = 1," +
        " inscription = ? WHERE id = ?",
    ).run(MUSEUM_ROOM_ID, spot.x, spot.y, z, inscription, opts.itemId);

    const plaqueId = Number(
      db
        .prepare(
          "INSERT INTO furni_items (def_id, owner_id, room_id, x, y, wall_side, wall_u, wall_v," +
            " state, bound, locked, inscription) VALUES (?, ?, ?, ?, 0, 'right', ?, ?, 0, 1, 1, ?)",
        )
        .run(PLAQUE_DEF, opts.accountId, MUSEUM_ROOM_ID, spot.x, plaqueU, PLAQUE_V, inscription)
        .lastInsertRowid,
    );
    logItemGrants(db, {
      opKey: `donate:${opts.itemId}`, op: "museum", accountId: opts.accountId,
      itemIds: [opts.itemId, plaqueId], now,
    });
    return { ok: true, itemId: opts.itemId, plaqueId, spot, inscription };
  })();
}
