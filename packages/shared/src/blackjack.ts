// Blackjack at the card tables (GAME.md §The casino floor, #428, #431).
//
// The house rules in full, fixed here because the server that deals, the client that shows the
// table, and the simulation that measures the edge all read them from this one module:
//
//   · The shoe is infinite — every card an independent uniform draw over the 13 ranks — so nothing
//     is countable and the measured edge is the edge forever.
//   · The dealer stands on soft 17 (S17).
//   · Blackjack pays 3:2, rounded up. Equal totals push, blackjack against blackjack included.
//   · Double on the first two cards of any hand, split hands included (DAS), for the hand's stake
//     again. A doubled hand takes exactly one card and then stands.
//   · Split a pair — two cards of equal *value*, so K-Q is a pair of tens — once and once only. No
//     resplit, so a seat is never more than two hands. The second hand costs the opening stake.
//   · Split aces take one card each and stand there. 21 on a split hand is 21, not a natural: it
//     pays 1:1 and pushes against a dealer blackjack.
//   · Insurance is offered whenever the upcard is an ace, before the dealer peeks. It costs half
//     the stake, rounded up, and pays 2:1.
//
// The edge is thin next to the wheel's 12.5–16.7%: about 0.5% against basic strategy, pinned by
// simulation in the tests. That is deliberate. The wheel drains; blackjack is the game a player
// can sit at for an hour. Doubling and splitting are what made it thin — v1's hit-or-stand game
// took 2.3%, because a player who can only hit or stand cannot press a good hand.

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

/** Equal card *value*, so K-Q splits as a pair of tens. Only the opening two cards can be one. */
export function isPair(cards: Rank[]): boolean {
  return cards.length === 2 && cardValue(cards[0] as Rank) === cardValue(cards[1] as Rank);
}

export type Action = "hit" | "stand" | "double" | "split";

/** What the player may do with the hand in front of them. Double and split are first-two-cards
 *  offers, and `canSplit` is the seat's business rather than the hand's: it is false once the seat
 *  has already split, which is what makes the no-resplit rule true. A hand that has run out of
 *  decisions — a split ace, a doubled hand — is never asked, so it never reaches here. */
export function legalActions(cards: Rank[], canSplit: boolean): Action[] {
  const actions: Action[] = ["hit", "stand"];
  if (cards.length !== 2) return actions;
  actions.push("double");
  if (canSplit && isPair(cards)) actions.push("split");
  return actions;
}

/** Half the stake, rounded up so the odd chip lands on the player's side like the 3:2 does. At 25
 *  that is 13 against a 25 stake, and 2:1 returns 39 — a covered blackjack leaves the player a
 *  Star ahead rather than a Star short. */
export function insuranceBet(stake: number): number {
  return Math.ceil(stake / 2);
}

export type Outcome = "blackjack" | "win" | "push" | "loss";

/** From the player's side. A player bust loses even against a dealer who would have busted too —
 *  that is where most of the house edge lives, and the reason the player acts first.
 *  `split` marks a hand that came out of a split: it can reach 21 on two cards but that is a plain
 *  21, so it takes 1:1 and pushes the dealer's natural instead of beating it. */
export function resolve(player: Rank[], dealer: Rank[], split = false): Outcome {
  const p = handValue(player).total;
  if (p > 21) return "loss";
  const playerBJ = !split && isBlackjack(player);
  const dealerBJ = isBlackjack(dealer);
  if (playerBJ) return dealerBJ ? "push" : "blackjack";
  if (dealerBJ) return "loss";
  const d = handValue(dealer).total;
  if (d > 21 || p > d) return "win";
  return p === d ? "push" : "loss";
}

/** Total returned to the player, stake included — a push returns the stake, a loss returns nothing.
 *  The 3:2 rounds up, so a 25 stake wins 38 rather than 37: the odd chip goes to the player.
 *  A doubled hand hands its doubled stake in, so a doubled win returns four times the opening bet. */
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
