import { expect, test } from "vitest";
import {
  BLACKJACK_STAKES,
  cardValue,
  dealerShouldHit,
  handValue,
  isBlackjack,
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

/** Basic strategy for a hit-or-stand game against S17: the best a player can actually play here. */
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

test("the house edge is about 2.3% — measured, not assumed", () => {
  const random = mulberry32(0x5eed_1234);
  const draw = (): Rank => 1 + Math.floor(random() * 13);
  const HANDS = 1_000_000;
  const STAKE = 25; // The odd tier, so the 3:2 rounding is part of the measurement.

  let staked = 0;
  let returned = 0;
  for (let hand = 0; hand < HANDS; hand++) {
    const player = [draw(), draw()];
    const dealer = [draw(), draw()];
    const upcard = cardValue(dealer[0] as Rank);

    if (!isBlackjack(player)) {
      while (playerHits(player, upcard)) player.push(draw());
      // A dealt blackjack ends the hand, so the dealer only draws against a standing player.
      if (handValue(player).total <= 21 && !isBlackjack(dealer)) {
        while (dealerShouldHit(dealer)) dealer.push(draw());
      }
    }

    staked += STAKE;
    returned += payout(STAKE, resolve(player, dealer));
  }

  const edge = (staked - returned) / staked;
  // Measured 0.02330 over 1,000,000 hands at seed 0x5eed1234. The run is single-seed
  // deterministic, so the band hugs the measurement: ±0.002 catches S17→H17 (+0.00275), which
  // ±0.004 let through. A draw-order refactor shifts the seeded number — re-measure, don't widen.
  expect(edge).toBeGreaterThan(0.0233 - 0.002);
  expect(edge).toBeLessThan(0.0233 + 0.002);
  // Thin enough to sit at for an hour, wide enough that the tables are never a faucet.
  expect(edge).toBeGreaterThan(0.005);
  expect(edge).toBeLessThan(0.04);
}, 30_000);
