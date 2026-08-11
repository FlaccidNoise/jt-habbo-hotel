import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { Action, Outcome, ServerMsg } from "@grand/shared";
import {
  BLACKJACK_STAKES, dealerShouldHit, handValue, insuranceBet, isBlackjack, legalActions, payout,
  resolve,
} from "@grand/shared";
import { DAY_MS, settleSpend, settleWin, stakedSince } from "./ledger.ts";
import { log } from "./log.ts";

// The card tables (#428, #431, GAME.md §The casino floor). House-banked like the wheel and
// server-authoritative like the arcade: the server holds the shoe, deals both hands, and keeps the
// hole card to itself until the hand resolves, so a client can send an action and nothing else.
// The rules themselves live in @grand/shared — the client draws totals with the same handValue the
// dealer settles by, and its buttons come from the same legalActions the dealer refuses by, which
// is why the state message carries ranks and no arithmetic.
//
// Every ledger operation of a seat hangs off one hand id, and every one of them is a distinct key,
// because settleSpend and settleWin are idempotent per key and a reused key is a silent no-op —
// which would make a push pay nothing and a split pay once:
//
//   <handId>              the opening stake      <handId>:win:<i>        hand i's return
//   <handId>:double:<i>   hand i's second stake  <handId>:insurance:win  the 2:1
//   <handId>:split        the second hand        <handId>:insurance      the side bet
//
// All of them go in under the "blackjack" op, so all of them count against the one 500/day stake
// cap the ledger enforces — a player cannot get around it by doubling.

export const BLACKJACK_OP = "blackjack";
const RANK_MAX = 13;
const ACE = 1;
const BUST = 21;

/** One player hand. A seat has two of these after a split and one otherwise. */
interface Hand {
  cards: number[];
  /** What this hand has on it — the opening stake, twice that once it doubles. */
  stake: number;
  split: boolean;
  done: boolean;
  outcome?: Outcome;
  paid?: number;
}

interface Seat {
  handId: string;
  /** The opening stake: what a double costs, what a split costs, what insurance is half of. */
  stake: number;
  hands: Hand[];
  active: number;
  dealer: number[];
  insurance: number;
  phase: "insurance" | "player";
}

export class BlackjackService {
  private seats = new Map<number, Seat>();
  private db: Database.Database;
  private emit: (accountId: number, msg: ServerMsg) => void;
  private announce?: (accountId: number, phrase: string) => void;
  private draw: () => number;

  constructor(opts: {
    db: Database.Database;
    emit: (accountId: number, msg: ServerMsg) => void;
    /** Tells the player's room what they just did, third person and without their name — the
     *  room owns the roster, so it is the room that knows what to call them. Absent in tests
     *  that build the service with no rooms around it. */
    announce?: (accountId: number, phrase: string) => void;
    /** Card source, 1..RANK_MAX. Tests inject a scripted deck. */
    draw?: () => number;
  }) {
    this.db = opts.db;
    this.emit = opts.emit;
    this.announce = opts.announce;
    this.draw = opts.draw ?? (() => 1 + Math.floor(Math.random() * RANK_MAX));
  }

  /** Using the table: the panel opens on whatever is already there. A hand survives the panel
   *  closing and the socket dropping, so this is the reconnect path as much as the first look. */
  open(accountId: number): void {
    const seat = this.seats.get(accountId);
    if (seat) {
      this.emit(accountId, this.table(accountId, seat));
      return;
    }
    this.emit(accountId, {
      t: "blackjack_state", phase: "idle", hands: [], active: 0, actions: [], dealer: [], stake: 0,
      stakedToday: this.stakedToday(accountId),
    });
  }

  deal(accountId: number, stake: number): void {
    if (this.seats.has(accountId)) {
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

    const seat: Seat = {
      handId, stake,
      hands: [{ cards: [this.draw(), this.draw()], stake, split: false, done: false }],
      active: 0,
      dealer: [this.draw(), this.draw()],
      insurance: 0,
      phase: "player",
    };
    this.seats.set(accountId, seat);
    // An ace up: the insurance offer comes before the peek, because insurance is a bet on what the
    // peek is about to find. The hole card is not looked at — by the dealer or by this code —
    // until the player has answered.
    if (seat.dealer[0] === ACE) {
      seat.phase = "insurance";
      this.emit(accountId, this.table(accountId, seat));
      return;
    }
    this.peek(accountId, seat);
  }

  /** Take the side bet or wave it away. Either answer releases the peek. */
  insurance(accountId: number, take: boolean): void {
    const seat = this.seats.get(accountId);
    if (!seat || seat.phase !== "insurance") {
      this.fail(accountId, "there is no insurance on offer");
      return;
    }
    if (take) {
      const bet = insuranceBet(seat.stake);
      const spend = settleSpend(this.db, {
        opKey: `${seat.handId}:insurance`, op: BLACKJACK_OP, accountId, price: bet,
      });
      // A refused side bet leaves the offer standing rather than the hand stuck: the player can
      // read the reason and wave the insurance away.
      if (!spend.ok) {
        this.fail(accountId, spend.reason);
        return;
      }
      seat.insurance = bet;
      this.emit(accountId, { t: "stars", balance: spend.balance, delta: -bet, reason: "blackjack" });
    }
    seat.phase = "player";
    this.peek(accountId, seat);
  }

  /** Any total may be hit, 20 included. It is the player's Star and their decision. */
  hit(accountId: number): void {
    const seat = this.acting(accountId, "hit");
    if (!seat) return;
    const hand = seat.hands[seat.active] as Hand;
    hand.cards.push(this.draw());
    if (handValue(hand.cards).total > BUST) {
      hand.done = true;
      this.advance(accountId, seat);
      return;
    }
    this.emit(accountId, this.table(accountId, seat));
  }

  stand(accountId: number): void {
    const seat = this.acting(accountId, "stand");
    if (!seat) return;
    (seat.hands[seat.active] as Hand).done = true;
    this.advance(accountId, seat);
  }

  /** One more Star on the hand, exactly one more card, and the hand is over. */
  double(accountId: number): void {
    const seat = this.acting(accountId, "double");
    if (!seat) return;
    const hand = seat.hands[seat.active] as Hand;
    const spend = settleSpend(this.db, {
      opKey: `${seat.handId}:double:${seat.active}`, op: BLACKJACK_OP, accountId, price: seat.stake,
    });
    if (!spend.ok) {
      this.fail(accountId, spend.reason);
      return;
    }
    this.emit(accountId, {
      t: "stars", balance: spend.balance, delta: -seat.stake, reason: "blackjack",
    });
    hand.stake += seat.stake;
    hand.cards.push(this.draw());
    hand.done = true;
    this.advance(accountId, seat);
  }

  /** Two hands out of a pair, the second one paid for. Split aces take one card each and stand. */
  split(accountId: number): void {
    const seat = this.acting(accountId, "split");
    if (!seat) return;
    const [first, second] = (seat.hands[seat.active] as Hand).cards as [number, number];
    const spend = settleSpend(this.db, {
      opKey: `${seat.handId}:split`, op: BLACKJACK_OP, accountId, price: seat.stake,
    });
    if (!spend.ok) {
      this.fail(accountId, spend.reason);
      return;
    }
    this.emit(accountId, {
      t: "stars", balance: spend.balance, delta: -seat.stake, reason: "blackjack",
    });
    const aces = first === ACE;
    seat.hands = [first, second].map((card) => ({
      cards: [card, this.draw()], stake: seat.stake, split: true, done: aces,
    }));
    seat.active = 0;
    this.advance(accountId, seat);
  }

  /** Walking away stands the hand — it never voids one. A hand voided on disconnect would be a
   *  free look at the cards: see a bust coming, pull the plug, get the stake back. An unanswered
   *  insurance offer goes the same way, as a decline: the bet was never placed. */
  onLeave(accountId: number): void {
    const seat = this.seats.get(accountId);
    if (!seat) return;
    if (seat.phase === "insurance") {
      this.insurance(accountId, false);
      if (!this.seats.has(accountId)) return;
    }
    for (const hand of seat.hands) hand.done = true;
    this.advance(accountId, seat);
  }

  /** The dealer looks at the hole card. Either natural ends the hand where it stands: there is no
   *  decision left to offer, and the dealer never draws to a natural. */
  private peek(accountId: number, seat: Seat): void {
    if (isBlackjack((seat.hands[0] as Hand).cards) || isBlackjack(seat.dealer)) {
      this.finish(accountId, seat);
      return;
    }
    this.emit(accountId, this.table(accountId, seat));
  }

  /** On to the next unfinished hand, or — when there is none — to the dealer and the money. */
  private advance(accountId: number, seat: Seat): void {
    const next = seat.hands.findIndex((hand) => !hand.done);
    if (next >= 0) {
      seat.active = next;
      this.emit(accountId, this.table(accountId, seat));
      return;
    }
    // The dealer plays only against a hand that is still alive. Every hand busted is every hand
    // already lost, and the house does not draw cards for an audience.
    if (seat.hands.some((hand) => handValue(hand.cards).total <= BUST)) {
      while (dealerShouldHit(seat.dealer)) seat.dealer.push(this.draw());
    }
    this.finish(accountId, seat);
  }

  private finish(accountId: number, seat: Seat): void {
    this.seats.delete(accountId);
    let wagered = 0;
    let won = 0;
    for (const [i, hand] of seat.hands.entries()) {
      hand.outcome = resolve(hand.cards, seat.dealer, hand.split);
      hand.paid = payout(hand.stake, hand.outcome);
      wagered += hand.stake;
      won += hand.paid;
      if (hand.paid > 0) this.pay(accountId, `${seat.handId}:win:${i}`, hand.paid);
    }
    // The side bet is settled on its own key against the natural it was a bet on, and it is 2:1,
    // so the bet comes back with twice itself.
    const insured = seat.insurance > 0 && isBlackjack(seat.dealer) ? seat.insurance * 3 : 0;
    if (insured > 0) this.pay(accountId, `${seat.handId}:insurance:win`, insured);

    log("blackjack", {
      handId: seat.handId, accountId, stake: seat.stake, insurance: seat.insurance,
      wagered: wagered + seat.insurance, paid: won + insured,
      dealer: handValue(seat.dealer).total,
      hands: seat.hands.map((hand) => ({
        stake: hand.stake, split: hand.split, outcome: hand.outcome, paid: hand.paid,
        total: handValue(hand.cards).total,
      })),
    });
    this.emit(accountId, {
      t: "blackjack_state", phase: "resolved",
      hands: seat.hands.map((hand) => ({
        cards: [...hand.cards], stake: hand.stake, split: hand.split,
        outcome: hand.outcome, paid: hand.paid,
      })),
      active: 0, actions: [],
      dealer: [...seat.dealer],
      stake: seat.stake, stakedToday: this.stakedToday(accountId),
      insurance: seat.insurance || undefined,
      paid: won + insured,
    });
    // Wins only, the wheel's rule (#433): the room watches someone take the table, and nobody
    // else needs to be told a stranger lost or got their stake back. The figure is what the cards
    // paid, stake included and insurance left out — an insured natural is a player breaking even,
    // not a player winning, and the room has nothing to cheer.
    if (won > wagered) {
      const natural = seat.hands.length === 1 && seat.hands[0]?.outcome === "blackjack";
      this.announce?.(accountId, natural
        ? `takes blackjack — ${won} ★`
        : `wins ${won} ★ at the card table`);
    }
  }

  private pay(accountId: number, opKey: string, amount: number): void {
    const { balance } = settleWin(this.db, { opKey, op: BLACKJACK_OP, accountId, amount });
    this.emit(accountId, { t: "stars", balance, delta: amount, reason: "blackjack" });
  }

  /** The seat, if the action is one the player may take right now. Anything else is a refusal the
   *  player can read, since a client that sends an illegal action is a client with a stale panel. */
  private acting(accountId: number, action: Action): Seat | undefined {
    const seat = this.seats.get(accountId);
    if (!seat) {
      this.fail(accountId, "no hand in play — deal first");
      return undefined;
    }
    if (seat.phase === "insurance") {
      this.fail(accountId, "insurance first — take it or wave it away");
      return undefined;
    }
    // Hit and stand are always on the table, so this only ever refuses a double or a split.
    if (!this.legal(seat).includes(action)) {
      this.fail(accountId, action === "split"
        ? "you can only split a pair, and only once a hand"
        : "you can only double on the first two cards of a hand");
      return undefined;
    }
    return seat;
  }

  private legal(seat: Seat): Action[] {
    return legalActions((seat.hands[seat.active] as Hand).cards, seat.hands.length === 1);
  }

  /** The upcard and nothing else — the hole card is in `seat` and stays there until finish. */
  private table(accountId: number, seat: Seat): ServerMsg {
    return {
      t: "blackjack_state", phase: seat.phase,
      hands: seat.hands.map((hand) => ({
        cards: [...hand.cards], stake: hand.stake, split: hand.split,
      })),
      active: seat.active,
      actions: seat.phase === "player" ? this.legal(seat) : [],
      dealer: seat.dealer.slice(0, 1),
      stake: seat.stake, stakedToday: this.stakedToday(accountId),
      insurance: seat.insurance || undefined,
    };
  }

  private stakedToday(accountId: number): number {
    return stakedSince(this.db, accountId, Date.now() - DAY_MS);
  }

  private fail(accountId: number, message: string): void {
    this.emit(accountId, { t: "error", code: "casino", message });
  }
}
