import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { MAX_TRADE_ITEMS } from "@grand/shared";
import type { InventoryItem, ServerMsg } from "@grand/shared";
import { settleTrade } from "./ledger.ts";
import { log } from "./log.ts";

// GAME.md §Trade: items-for-items only, both sides preview, any change resets both accepts,
// 3-second delay after both accept, cancellable throughout. Settlement is one ACID ledger
// transaction that re-verifies every item — a vanished item cancels the trade, fail closed.

const COUNTDOWN_MS = 3000;

interface Side {
  accountId: number;
  username: string;
  offer: InventoryItem[];
  accepted: boolean;
}

interface Session {
  a: Side;
  b: Side;
  opKey: string;
  countdown?: ReturnType<typeof setTimeout>;
}

export class TradeService {
  private sessions = new Map<number, Session>();   // both parties point at the same session
  private invites = new Map<number, number>();     // inviter → invitee
  private db: Database.Database;
  private emit: (accountId: number, msg: ServerMsg) => void;
  private locate: (accountId: number) => { roomId: number; username: string } | null;
  private resolve: (
    roomId: number,
    username: string,
  ) => { accountId: number; staff?: boolean } | null;
  private countdownMs: number;

  constructor(opts: {
    db: Database.Database;
    emit: (accountId: number, msg: ServerMsg) => void;
    /** Where a connected account is, or null when it is not in a room. */
    locate: (accountId: number) => { roomId: number; username: string } | null;
    /** The named occupant of a room, staff included so they can be refused by name. */
    resolve: (roomId: number, username: string) => { accountId: number; staff?: boolean } | null;
    countdownMs?: number;
  }) {
    this.db = opts.db;
    this.emit = opts.emit;
    this.locate = opts.locate;
    this.resolve = opts.resolve;
    this.countdownMs = opts.countdownMs ?? COUNTDOWN_MS;
  }

  /** Invite, or start the trade when the named player already invited us. */
  open(accountId: number, toName: string): void {
    const me = this.locate(accountId);
    if (!me) return;
    if (this.sessions.has(accountId)) {
      this.fail(accountId, "you are already in a trade");
      return;
    }
    const target = this.resolve(me.roomId, toName);
    if (!target) {
      this.fail(accountId, `${toName} is not in this room`);
      return;
    }
    if (target.staff) {
      this.fail(accountId, "staff don't trade");
      return;
    }
    if (target.accountId === accountId) {
      this.fail(accountId, "you can't trade with yourself");
      return;
    }
    if (this.sessions.has(target.accountId)) {
      this.fail(accountId, `${toName} is already in a trade`);
      return;
    }
    if (this.invites.get(target.accountId) === accountId) {
      this.start(target.accountId, accountId);
      return;
    }
    this.invites.set(accountId, target.accountId);
    this.emit(target.accountId, { t: "trade_invite", from: me.username });
  }

  /** Replace the caller's whole offer. Any change resets both accepts. */
  offer(accountId: number, itemIds: number[]): void {
    const session = this.sessions.get(accountId);
    if (!session) {
      this.fail(accountId, "you are not in a trade");
      return;
    }
    const ids = [...new Set(itemIds)];
    if (ids.length > MAX_TRADE_ITEMS) {
      this.fail(accountId, `at most ${MAX_TRADE_ITEMS} items per side`);
      return;
    }
    const pick = this.db.prepare(
      "SELECT def_id AS defId, owner_id AS ownerId, room_id AS roomId, bound FROM furni_items WHERE id = ?",
    );
    const items: InventoryItem[] = [];
    for (const id of ids) {
      const row = pick.get(id) as
        | { defId: string; ownerId: number; roomId: number | null; bound: number }
        | undefined;
      if (!row || row.ownerId !== accountId || row.roomId !== null) {
        this.fail(accountId, "that item is not in your inventory");
        return;
      }
      // The ledger refuses this too, but silently cancelling a settled trade three seconds after
      // both sides accepted is a worse way to learn it (#210).
      if (row.bound) {
        this.fail(accountId, "that one is account-bound — it cannot be traded");
        return;
      }
      items.push({ id, defId: row.defId });
    }
    this.mySide(session, accountId).offer = items;
    this.resetAccepts(session);
    this.broadcast(session);
  }

  accept(accountId: number): void {
    const session = this.sessions.get(accountId);
    if (!session) {
      this.fail(accountId, "you are not in a trade");
      return;
    }
    this.mySide(session, accountId).accepted = true;
    if (session.a.accepted && session.b.accepted && session.countdown === undefined) {
      session.countdown = setTimeout(() => this.settle(session), this.countdownMs);
    }
    this.broadcast(session);
  }

  cancel(accountId: number, reason = "trade cancelled"): void {
    this.invites.delete(accountId);
    const session = this.sessions.get(accountId);
    if (!session) return;
    this.close(session);
    for (const side of [session.a, session.b]) {
      this.emit(side.accountId, { t: "trade_cancelled", reason });
    }
  }

  /** Leaving the room — by door, disconnect, or reconnect — ends any trade. */
  onLeave(accountId: number): void {
    this.cancel(accountId, "trade cancelled — a trader left the room");
  }

  stop(): void {
    for (const session of new Set(this.sessions.values())) clearTimeout(session.countdown);
    this.sessions.clear();
    this.invites.clear();
  }

  private start(aId: number, bId: number): void {
    const a = this.locate(aId);
    const b = this.locate(bId);
    if (!a || !b) return;
    this.invites.delete(aId);
    this.invites.delete(bId);
    const session: Session = {
      a: { accountId: aId, username: a.username, offer: [], accepted: false },
      b: { accountId: bId, username: b.username, offer: [], accepted: false },
      opKey: randomUUID(),
    };
    this.sessions.set(aId, session);
    this.sessions.set(bId, session);
    this.broadcast(session);
  }

  // Runs from a timer, outside the dispatch try/catch — it must never throw.
  private settle(session: Session): void {
    this.close(session);
    let result: ReturnType<typeof settleTrade>;
    try {
      result = settleTrade(this.db, {
        opKey: session.opKey,
        a: { accountId: session.a.accountId, itemIds: session.a.offer.map((i) => i.id) },
        b: { accountId: session.b.accountId, itemIds: session.b.offer.map((i) => i.id) },
      });
    } catch (e) {
      log("trade_error", { opKey: session.opKey, message: String(e) });
      result = { ok: false, reason: "internal error — nothing was traded" };
    }
    if (!result.ok) {
      for (const side of [session.a, session.b]) {
        this.emit(side.accountId, { t: "trade_cancelled", reason: result.reason });
      }
      log("trade_failed", { opKey: session.opKey, reason: result.reason });
      return;
    }
    this.emit(session.a.accountId, {
      t: "trade_complete",
      added: result.aReceived,
      removed: session.a.offer.map((i) => i.id),
    });
    this.emit(session.b.accountId, {
      t: "trade_complete",
      added: result.bReceived,
      removed: session.b.offer.map((i) => i.id),
    });
    log("trade_settled", {
      opKey: session.opKey,
      a: session.a.accountId,
      b: session.b.accountId,
      aGave: session.a.offer.length,
      bGave: session.b.offer.length,
    });
  }

  private close(session: Session): void {
    clearTimeout(session.countdown);
    this.sessions.delete(session.a.accountId);
    this.sessions.delete(session.b.accountId);
  }

  private resetAccepts(session: Session): void {
    session.a.accepted = false;
    session.b.accepted = false;
    clearTimeout(session.countdown);
    session.countdown = undefined;
  }

  private broadcast(session: Session): void {
    for (const [side, other] of [
      [session.a, session.b],
      [session.b, session.a],
    ] as const) {
      this.emit(side.accountId, {
        t: "trade_state",
        partner: other.username,
        yours: side.offer,
        theirs: other.offer,
        youAccepted: side.accepted,
        theyAccepted: other.accepted,
        countdown: session.countdown !== undefined,
      });
    }
  }

  private mySide(session: Session, accountId: number): Side {
    return session.a.accountId === accountId ? session.a : session.b;
  }

  private fail(accountId: number, message: string): void {
    this.emit(accountId, { t: "error", code: "trade", message });
  }
}
