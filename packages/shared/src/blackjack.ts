// Blackjack at the card tables (GAME.md §The casino floor, #428). Hit and stand only — no double,
// no split, no insurance — so a hand is a short decision the room can watch, not a side-bet ledger.
//
// House rules, fixed here because both the server that deals and the client that shows the table
// read them from this one module: dealer stands on soft 17, blackjack pays 3:2, equal totals push
// (blackjack against blackjack included). The shoe is infinite — every card an independent uniform
// draw over the 13 ranks — so nothing is countable and the edge below is the edge forever.
//
// The edge is thin next to the wheel's 12.5–16.7%: about 2.3%, pinned by simulation in the tests.
// That is deliberate. The wheel drains; blackjack is the game a player can sit at for an hour.

export const BLACKJACK_STAKES = [10, 25, 50, 100] as const;

/** 1 is the ace, 11/12/13 the court cards. */
export type Rank = number;

/** The ace counts 1 here — `handValue` is what decides whether it may count 11. */
export function cardValue(rank: Rank): number {
  return Math.min(rank, 10);
}

/** Best total not over 21: one ace may count 11 when it fits, and only one ever can, since a second
 *  such ace would put the hand 10 over. `soft` marks that promotion — the hand cannot bust on a hit. */
export function handValue(cards: Rank[]): { total: number; soft: boolean } {
  let total = 0;
  let aces = 0;
  for (const card of cards) {
    total += cardValue(card);
    if (card === 1) aces++;
  }
  const soft = aces > 0 && total + 10 <= 21;
  return { total: soft ? total + 10 : total, soft };
}

/** An ace and a ten-value card dealt as the first two. Three cards to 21 is not a blackjack. */
export function isBlackjack(cards: Rank[]): boolean {
  return cards.length === 2 && handValue(cards).total === 21;
}

/** S17: the dealer stands on soft 17 as well as hard, so the rule is just the total. */
export function dealerShouldHit(cards: Rank[]): boolean {
  return handValue(cards).total < 17;
}

export type Outcome = "blackjack" | "win" | "push" | "loss";

/** From the player's side. A player bust loses even against a dealer who would have busted too —
 *  that is where most of the house edge lives, and the reason the player acts first. */
export function resolve(player: Rank[], dealer: Rank[]): Outcome {
  const p = handValue(player).total;
  if (p > 21) return "loss";
  const playerBJ = isBlackjack(player);
  const dealerBJ = isBlackjack(dealer);
  if (playerBJ) return dealerBJ ? "push" : "blackjack";
  if (dealerBJ) return "loss";
  const d = handValue(dealer).total;
  if (d > 21 || p > d) return "win";
  return p === d ? "push" : "loss";
}

/** Total returned to the player, stake included — a push returns the stake, a loss returns nothing.
 *  The 3:2 rounds up, so a 25 stake wins 38 rather than 37: the odd chip goes to the player. */
export function payout(stake: number, outcome: Outcome): number {
  switch (outcome) {
    case "blackjack":
      return stake + Math.ceil((stake * 3) / 2);
    case "win":
      return stake * 2;
    case "push":
      return stake;
    case "loss":
      return 0;
  }
}
