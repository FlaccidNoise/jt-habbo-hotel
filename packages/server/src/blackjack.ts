import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ServerMsg } from "@grand/shared";
import {
  BLACKJACK_STAKES, dealerShouldHit, handValue, isBlackjack, payout, resolve,
} from "@grand/shared";
import { DAY_MS, settleSpend, settleWin, stakedSince } from "./ledger.ts";
import { log } from "./log.ts";

// The card tables (#428, GAME.md §The casino floor). House-banked like the wheel and
// server-authoritative like the arcade: the server holds the shoe, deals both hands, and keeps the
// hole card to itself until the hand resolves, so a client can send hit or stand and nothing else.
// The rules themselves live in @grand/shared — the client draws totals with the same handValue the
// dealer settles by, which is why the state message carries ranks and no arithmetic.
//
// Two idempotent ledger operations per hand, keyed off one hand id: the stake through settleSpend,
// which is where the daily 500 cap refuses, and the return through settleWin under a second key.
// One key for both would make a push a no-op and pay a winner nothing.

export const BLACKJACK_OP = "blackjack";
const RANK_MAX = 13;
const BUST = 21;

interface Hand {
  handId: string;
  stake: number;
  player: number[];
  dealer: number[];
}

export class BlackjackService {
  private hands = new Map<number, Hand>();
  private db: Database.Database;
  private emit: (accountId: number, msg: ServerMsg) => void;
  private draw: () => number;

  constructor(opts: {
    db: Database.Database;
    emit: (accountId: number, msg: ServerMsg) => void;
    /** Card source, 1..RANK_MAX. Tests inject a scripted deck. */
    draw?: () => number;
  }) {
    this.db = opts.db;
    this.emit = opts.emit;
    this.draw = opts.draw ?? (() => 1 + Math.floor(Math.random() * RANK_MAX));
  }

  /** Using the table: the panel opens on whatever is already there. A hand survives the panel
   *  closing and the socket dropping, so this is the reconnect path as much as the first look. */
  open(accountId: number): void {
    const hand = this.hands.get(accountId);
    if (hand) {
      this.emit(accountId, this.playing(accountId, hand));
      return;
    }
    this.emit(accountId, {
      t: "blackjack_state", phase: "idle", player: [], dealer: [], stake: 0,
      stakedToday: this.stakedToday(accountId),
    });
  }

  deal(accountId: number, stake: number): void {
    if (this.hands.has(accountId)) {
      this.fail(accountId, "finish your hand first");
      return;
    }
    if (!BLACKJACK_STAKES.some((s) => s === stake)) {
      this.fail(accountId, `this table takes ${BLACKJACK_STAKES.join(", ")} ★`);
      return;
    }
    // The refusal — no funds, or the day's stake cap — is the ledger's sentence, and the player
    // reads it verbatim. Nothing is dealt and no hand id is spent: a refused deal never happened.
    const handId = randomUUID();
    const spend = settleSpend(this.db, {
      opKey: handId, op: BLACKJACK_OP, accountId, price: stake,
    });
    if (!spend.ok) {
      this.fail(accountId, spend.reason);
      return;
    }
    this.emit(accountId, { t: "stars", balance: spend.balance, delta: -stake, reason: "blackjack" });

    const hand: Hand = {
      handId, stake,
      player: [this.draw(), this.draw()],
      dealer: [this.draw(), this.draw()],
    };
    this.hands.set(accountId, hand);
    // Either blackjack ends the hand where it stands: there is no decision left to offer, and the
    // dealer never draws to a natural.
    if (isBlackjack(hand.player) || isBlackjack(hand.dealer)) {
      this.finish(accountId, hand);
      return;
    }
    this.emit(accountId, this.playing(accountId, hand));
  }

  /** Any total may be hit, 20 included. It is the player's Star and their decision. */
  hit(accountId: number): void {
    const hand = this.hands.get(accountId);
    if (!hand) {
      this.fail(accountId, "no hand in play — deal first");
      return;
    }
    hand.player.push(this.draw());
    if (handValue(hand.player).total > BUST) {
      this.finish(accountId, hand);
      return;
    }
    this.emit(accountId, this.playing(accountId, hand));
  }

  stand(accountId: number): void {
    const hand = this.hands.get(accountId);
    if (!hand) {
      this.fail(accountId, "no hand in play — deal first");
      return;
    }
    while (dealerShouldHit(hand.dealer)) hand.dealer.push(this.draw());
    this.finish(accountId, hand);
  }

  /** Walking away stands the hand — it never voids one. A hand voided on disconnect would be a
   *  free look at the cards: see a bust coming, pull the plug, get the stake back. */
  onLeave(accountId: number): void {
    if (this.hands.has(accountId)) this.stand(accountId);
  }

  private finish(accountId: number, hand: Hand): void {
    this.hands.delete(accountId);
    const outcome = resolve(hand.player, hand.dealer);
    const returned = payout(hand.stake, outcome);
    if (returned > 0) {
      const { balance } = settleWin(this.db, {
        opKey: `${hand.handId}:win`, op: BLACKJACK_OP, accountId, amount: returned,
      });
      this.emit(accountId, { t: "stars", balance, delta: returned, reason: "blackjack" });
    }
    log("blackjack", {
      handId: hand.handId, accountId, stake: hand.stake, outcome, paid: returned,
      player: handValue(hand.player).total, dealer: handValue(hand.dealer).total,
    });
    this.emit(accountId, {
      t: "blackjack_state", phase: "resolved",
      player: [...hand.player], dealer: [...hand.dealer],
      stake: hand.stake, stakedToday: this.stakedToday(accountId),
      outcome, paid: returned,
    });
  }

  /** The upcard and nothing else — the hole card is in `hand` and stays there until finish. */
  private playing(accountId: number, hand: Hand): ServerMsg {
    return {
      t: "blackjack_state", phase: "player",
      player: [...hand.player], dealer: hand.dealer.slice(0, 1),
      stake: hand.stake, stakedToday: this.stakedToday(accountId),
    };
  }

  private stakedToday(accountId: number): number {
    return stakedSince(this.db, accountId, Date.now() - DAY_MS);
  }

  private fail(accountId: number, message: string): void {
    this.emit(accountId, { t: "error", code: "casino", message });
  }
}
