import type Database from "better-sqlite3";
import {
  FigureError, STAFF_GRANT_SETS, STARTER_GRANT_SETS, parseFigure, paletteFor, serializeFigure,
  setById,
} from "@grand/shared";
import type { LayerType, WornPart } from "@grand/shared";

// Garment ownership and the registration grant (#127). Wearing is gated on owned_sets from day
// one: today the grant is the only writer, and when #118's ledger lands it takes the table over
// without saveFigure changing.

/** The types a default outfit dresses. Everything else is earned. */
const DRESSED: readonly LayerType[] = ["hd", "hr", "ch", "lg", "sh"];

/** Deterministic per (account, slot). A fixed default would make every new player identical, and
 *  since the chat bubble colour derives from the outfit (GAME.md), give them all the same bubble.
 *  Integer-only, so it cannot drift between machines. */
function pick<T>(list: readonly T[], accountId: number, slot: number): T {
  let h = (Math.imul(accountId, 0x9e3779b1) + Math.imul(slot + 1, 0x85ebca6b)) >>> 0;
  h ^= h >>> 15;
  h = Math.imul(h, 0x2545f491);
  h ^= h >>> 13;
  // `^=` yields a SIGNED int32, so this last shift is not optional: a negative h indexes off the
  // front of the list and silently hands back undefined.
  return list[(h >>> 0) % list.length]!;
}

function dress(accountId: number, grant: readonly number[]): string {
  const parts: WornPart[] = [];
  for (const [i, type] of DRESSED.entries()) {
    const options = grant.map(setById).filter((s) => s?.type === type);
    const set = pick(options, accountId, i);
    if (!set) continue;
    const palette = paletteFor(set.family);
    const colors = Array.from({ length: set.slots }, (_, slot) =>
      pick(palette, accountId, i * 8 + slot + 1),
    );
    parts.push({ type, set: set.id, colors });
  }
  const figure = serializeFigure({ version: 1, parts });
  // A grant that cannot dress a legal figure must fail the registration transaction, not store a
  // string that every later read chokes on.
  parseFigure(figure);
  return figure;
}

export function defaultFigure(accountId: number): string {
  return dress(accountId, STARTER_GRANT_SETS);
}

/** Runs inside the registration transaction — an account with garments but no figure, or a figure
 *  naming sets it does not own, must not be reachable. */
export function grantFigure(db: Database.Database, accountId: number): void {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO owned_sets (account_id, set_id, granted_at) VALUES (?, ?, ?)",
  );
  const now = Date.now();
  for (const id of STARTER_GRANT_SETS) insert.run(accountId, id, now);
  db.prepare("UPDATE accounts SET figure = ? WHERE id = ?").run(defaultFigure(accountId), accountId);
}

/** Staff wear a uniform nobody can buy. Their figure is derived, not stored — NPCs have no
 *  account row to store it on. */
export function staffFigure(npcId: number): string {
  return dress(npcId, STAFF_GRANT_SETS);
}

export function figureOf(db: Database.Database, accountId: number): string {
  const row = db.prepare("SELECT figure FROM accounts WHERE id = ?").get(accountId) as
    | { figure: string | null }
    | undefined;
  return row?.figure ?? defaultFigure(accountId);
}

export function ownsSet(db: Database.Database, accountId: number, setId: number): boolean {
  return (
    db
      .prepare("SELECT 1 FROM owned_sets WHERE account_id = ? AND set_id = ?")
      .get(accountId, setId) !== undefined
  );
}

/** Parses, then checks every named set against owned_sets. Any miss leaves the stored figure
 *  exactly as it was. */
export function saveFigure(db: Database.Database, accountId: number, input: string): string {
  const figure = parseFigure(input);
  for (const part of figure.parts) {
    if (!ownsSet(db, accountId, part.set)) {
      throw new FigureError(`you do not own set ${part.set}`);
    }
  }
  const normalized = serializeFigure(figure);
  db.prepare("UPDATE accounts SET figure = ? WHERE id = ?").run(normalized, accountId);
  return normalized;
}
