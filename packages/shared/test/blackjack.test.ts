import { expect, test } from "vitest";
import {
  BLACKJACK_STAKES,
  cardValue,
  dealerShouldHit,
  handValue,
  insuranceBet,
  isBlackjack,
  isPair,
  legalActions,
  payout,
  resolve,
  type Rank,
} from "../src/blackjack.ts";

const A = 1, J = 11, Q = 12, K = 13;

test("court cards are worth ten and the ace is worth one until a hand promotes it", () => {
  expect([J, Q, K].map(cardValue)).toEqual([10, 10, 10]);
  expect(cardValue(A)).toBe(1);
  for (let rank = 2; rank <= 10; rank++) expect(cardValue(rank)).toBe(rank);
});

test("an ace counts eleven whenever it fits, and only ever one of them", () => {
  expect(handValue([A, 6])).toEqual({ total: 17, soft: true });
  expect(handValue([A, 6, 10])).toEqual({ total: 17, soft: false });
  expect(handValue([A, A])).toEqual({ total: 12, soft: true });
  expect(handValue([A, A, 9])).toEqual({ total: 21, soft: true });
  expect(handValue([A, A, A, A])).toEqual({ total: 14, soft: true });
  // The promotion is given back the moment it would bust, so a soft hand cannot bust on one hit.
  expect(handValue([A, 5, 9])).toEqual({ total: 15, soft: false });
});

test("hard totals, twenty-one, and busts", () => {
  expect(handValue([])).toEqual({ total: 0, soft: false });
  expect(handValue([K, Q])).toEqual({ total: 20, soft: false });
  expect(handValue([7, 7, 7])).toEqual({ total: 21, soft: false });
  expect(handValue([A, K])).toEqual({ total: 21, soft: true });
  expect(handValue([K, Q, 2])).toEqual({ total: 22, soft: false });
  expect(handValue([9, 9, 9])).toEqual({ total: 27, soft: false });
});

test("blackjack is an ace and a ten-card in the first two, either order and no more cards", () => {
  expect(isBlackjack([A, K])).toBe(true);
  expect(isBlackjack([K, A])).toBe(true);
  expect(isBlackjack([A, 10])).toBe(true);
  expect(isBlackjack([J, A])).toBe(true);
  expect(isBlackjack([7, 7, 7])).toBe(false);
  expect(isBlackjack([A, 9, A])).toBe(false);
  expect(isBlackjack([A, 5, 5])).toBe(false);
  expect(isBlackjack([A, 9])).toBe(false);
});

// S17 is the whole dealer strategy, so this is the whole rule: soft 17 stands like hard 17 does.
test("the dealer hits to seventeen and stands there, soft or hard", () => {
  expect(dealerShouldHit([K, 6])).toBe(true);
  expect(dealerShouldHit([A, 6])).toBe(false);
  expect(dealerShouldHit([K, 7])).toBe(false);
  expect(dealerShouldHit([A, 5])).toBe(true);
  expect(dealerShouldHit([A, A])).toBe(true);
  expect(dealerShouldHit([K, Q])).toBe(false);
  expect(dealerShouldHit([5, 6])).toBe(true);
});

test("the player acts first, so a bust loses even to a dealer who would have busted too", () => {
  expect(resolve([K, Q, 5], [K, Q, 5])).toBe("loss");
  expect(resolve([K, Q, 5], [K, 6])).toBe("loss");
});

test("blackjack beats three cards to twenty-one, and ties only against blackjack", () => {
  expect(resolve([A, K], [7, 7, 7])).toBe("blackjack");
  expect(resolve([A, K], [A, Q])).toBe("push");
  expect(resolve([7, 7, 7], [A, K])).toBe("loss");
  expect(resolve([A, K], [K, 9])).toBe("blackjack");
});

test("equal totals push, a dealer bust wins, and the higher total takes it otherwise", () => {
  expect(resolve([K, Q], [J, 10])).toBe("push");
  expect(resolve([10, 2], [K, 6, K])).toBe("win");
  expect(resolve([K, 9], [K, 8])).toBe("win");
  expect(resolve([K, 8], [K, 9])).toBe("loss");
  expect(resolve([A, 7], [K, 7])).toBe("win");
  expect(resolve([A, 6], [K, 7])).toBe("push");
});

// The odd chip goes to the player, at every stake the tables offer.
test("blackjack pays three to two, rounded up, on every stake tier", () => {
  expect(BLACKJACK_STAKES).toEqual([10, 25, 50, 100]);
  expect(BLACKJACK_STAKES.map((s) => payout(s, "blackjack"))).toEqual([25, 63, 125, 250]);
  expect(payout(25, "blackjack") - 25).toBe(38);
  expect(payout(5, "blackjack")).toBe(13);
});

test("a win doubles the stake, a push returns it, a loss returns nothing", () => {
  for (const stake of BLACKJACK_STAKES) {
    expect(payout(stake, "win")).toBe(stake * 2);
    expect(payout(stake, "push")).toBe(stake);
    expect(payout(stake, "loss")).toBe(0);
    expect(payout(stake, "blackjack")).toBeGreaterThan(payout(stake, "win"));
  }
});

// ── Double, split, insurance (#431) ───────────────────────────────────────────────────────────

test("a pair is two cards of equal value, so the court cards pair with the tens", () => {
  expect(isPair([8, 8])).toBe(true);
  expect(isPair([A, A])).toBe(true);
  expect(isPair([K, Q])).toBe(true);
  expect(isPair([10, J])).toBe(true);
  expect(isPair([8, 9])).toBe(false);
  expect(isPair([A, K])).toBe(false);
  expect(isPair([8, 8, 8])).toBe(false);   // a third card ends the offer
  expect(isPair([8])).toBe(false);
});

test("double and split are first-two-card offers, and a split is offered once", () => {
  expect(legalActions([8, 8], true)).toEqual(["hit", "stand", "double", "split"]);
  expect(legalActions([8, 8], false)).toEqual(["hit", "stand", "double"]);   // no resplit
  expect(legalActions([9, 2], true)).toEqual(["hit", "stand", "double"]);
  expect(legalActions([9, 2, 3], true)).toEqual(["hit", "stand"]);
  expect(legalActions([8, 8, 5], true)).toEqual(["hit", "stand"]);
  // Even a hard 20 may be hit. It is the player's Star.
  expect(legalActions([K, Q, 5, A], false)).toEqual(["hit", "stand"]);
});

test("insurance costs half the stake with the odd Star on the player's side", () => {
  expect(BLACKJACK_STAKES.map(insuranceBet)).toEqual([5, 13, 25, 50]);
  // 2:1 on 13 returns 39 against a 25 stake lost to the natural: the player ends a Star up.
  expect(insuranceBet(25) * 3 - 25 - insuranceBet(25)).toBe(1);
  expect(insuranceBet(50) * 3 - 50 - insuranceBet(50)).toBe(0);
});

// The rule with money on it: 21 on a split hand is 21. Paid as a natural it would be 3:2 on half
// the aces in the shoe, and it would push against a dealer natural instead of losing.
test("a split hand's twenty-one is a plain twenty-one", () => {
  expect(resolve([A, K], [9, 9], true)).toBe("win");
  expect(resolve([A, K], [K, Q], true)).toBe("win");
  expect(resolve([A, K], [A, Q], true)).toBe("loss");
  expect(resolve([A, K], [7, 7, 7], true)).toBe("push");
  expect(payout(25, resolve([A, K], [9, 9], true))).toBe(50);
  // The same cards off a plain deal are still a natural.
  expect(resolve([A, K], [9, 9])).toBe("blackjack");
});

// ── House edge ────────────────────────────────────────────────────────────────────────────────
// The tables are house-banked, so the edge is the only thing that makes them safe to run. It is not
// written down anywhere in the rules — it falls out of "the player acts first" — so the only honest
// way to state it is to measure it. A rule edit that flips the game in the player's favour, or that
// widens the edge into wheel territory, moves this number and fails here.

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const between = (upcard: number, lo: number, hi: number): boolean => upcard >= lo && upcard <= hi;

// Basic strategy for exactly the rules this module states: infinite deck, S17, double on any first
// two cards, double after split, split a pair once. Upcards are card *values* here, so 1 is the
// ace and 10 covers every court card.
//
// Insurance is not in the table because basic strategy never takes it: the bet pays 2:1 on a hole
// card that is a ten less than a third of the time, so it loses money at every count an infinite
// shoe can have. The sim is never offered it, which is the honest way to measure a side bet a good
// player declines.

/** Hit-or-stand, for hands past the first decision — three cards in, or a two-card hand that basic
 *  strategy would neither double nor split. */
const playerHits = (cards: Rank[], upcard: number): boolean => {
  const { total, soft } = handValue(cards);
  if (soft) {
    if (total <= 17) return true;
    if (total === 18) return upcard === 1 || upcard >= 9;
    return false;
  }
  if (total <= 11) return true;
  if (total === 12) return upcard < 4 || upcard > 6;
  if (total <= 16) return upcard < 2 || upcard > 6;
  return false;
};

/** Aces and eights always, tens and fives never, the rest by upcard. */
const shouldSplit = (card: Rank, upcard: number): boolean => {
  if (card === A) return true;
  switch (cardValue(card)) {
    case 8:
      return true;
    case 9:
      return between(upcard, 2, 6) || upcard === 8 || upcard === 9;
    case 7:
    case 3:
    case 2:
      return between(upcard, 2, 7);
    case 6:
      return between(upcard, 2, 6);
    case 4:
      return between(upcard, 5, 6);
    default:
      return false;
  }
};

/** First two cards only — the caller checks that. Eleven doubles against everything under S17. */
const shouldDouble = (cards: Rank[], upcard: number): boolean => {
  const { total, soft } = handValue(cards);
  if (soft) {
    if (total === 13 || total === 14) return between(upcard, 5, 6);
    if (total === 15 || total === 16) return between(upcard, 4, 6);
    if (total === 17 || total === 18) return between(upcard, 3, 6);
    return false;
  }
  if (total === 9) return between(upcard, 3, 6);
  if (total === 10) return between(upcard, 2, 9);
  return total === 11;
};

interface SimHand { cards: Rank[]; stake: number; split: boolean }

/** One hand played to its end: doubled and closed, or hit until basic strategy stands it. */
const playHand = (hand: SimHand, upcard: number, draw: () => Rank): SimHand => {
  if (hand.cards.length === 2 && shouldDouble(hand.cards, upcard)) {
    hand.stake *= 2;
    hand.cards.push(draw());
    return hand;
  }
  while (playerHits(hand.cards, upcard)) hand.cards.push(draw());
  return hand;
};

/** The seat: one hand, or the two a split makes of it. No resplit, and split aces take one card. */
const playSeat = (cards: Rank[], upcard: number, stake: number, draw: () => Rank): SimHand[] => {
  const [first, second] = cards as [Rank, Rank];
  if (isPair(cards) && shouldSplit(first, upcard)) {
    const hands = [first, second].map((card) => ({
      cards: [card, draw()], stake, split: true,
    }));
    return first === A ? hands : hands.map((hand) => playHand(hand, upcard, draw));
  }
  return [playHand({ cards, stake, split: false }, upcard, draw)];
};

test("the house edge is about 0.5% — measured, not assumed", () => {
  const random = mulberry32(0x5eed_1234);
  const draw = (): Rank => 1 + Math.floor(random() * 13);
  const HANDS = 1_000_000;
  const STAKE = 25; // The odd tier, so the 3:2 rounding is part of the measurement.

  let opening = 0;    // one stake per round: the denominator, as it was in v1
  let wagered = 0;    // every Star that reached the felt, doubles and splits included
  let returned = 0;
  for (let round = 0; round < HANDS; round++) {
    const first = [draw(), draw()];
    const dealer = [draw(), draw()];
    const upcard = cardValue(dealer[0] as Rank);
    opening += STAKE;

    // The peek comes before any decision the player makes, so a natural on either side takes the
    // opening stake and no more: nothing is ever doubled or split into a hand already over.
    if (isBlackjack(first) || isBlackjack(dealer)) {
      wagered += STAKE;
      returned += payout(STAKE, resolve(first, dealer));
      continue;
    }

    const hands = playSeat(first, upcard, STAKE, draw);
    // The dealer draws only against a hand still alive — every hand busted is every hand lost.
    if (hands.some((hand) => handValue(hand.cards).total <= 21)) {
      while (dealerShouldHit(dealer)) dealer.push(draw());
    }
    for (const hand of hands) {
      wagered += hand.stake;
      returned += payout(hand.stake, resolve(hand.cards, dealer, hand.split));
    }
  }

  // Measured 0.00503 over 1,000,000 rounds at seed 0x5eed1234 — the house keeps half a Star in
  // every hundred a player opens with. Doubling and splitting are what took it there from v1's
  // 0.0233: the money goes on when the player is ahead, which is most of what basic strategy is.
  //
  // The denominator is the opening stake, one per round, the way v1 measured it — so the two
  // numbers are the same measurement of two rule sets. Per Star actually wagered it is 0.00445,
  // because doubles and splits push about 13% more money onto the felt than the deals do.
  //
  // The run is single-seed deterministic, so the band hugs the measurement rather than covering
  // seed noise: over five seeds the same rules measure 0.0028–0.0050, and a re-seed would need a
  // re-pin. ±0.0015 catches S17→H17, which measures 0.00784 on this seed. A draw-order refactor
  // shifts the seeded number too — re-measure, don't widen.
  const edge = (wagered - returned) / opening;
  expect(edge).toBeGreaterThan(0.0050 - 0.0015);
  expect(edge).toBeLessThan(0.0050 + 0.0015);
  // Thin enough to sit at for an hour, wide enough that the tables are never a faucet.
  expect(edge).toBeGreaterThan(0.001);
  expect(edge).toBeLessThan(0.02);
}, 60_000);
