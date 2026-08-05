import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type { ServerMsg } from "@grand/shared";
import { DAY_MS, countOps, settleEarn } from "./ledger.ts";
import { log } from "./log.ts";

// First solo arcade game (build order step 6, GAME.md §Official minigames): Hi-Lo, a
// press-your-luck card run. Fully server-authoritative — the server deals, validates every move,
// and computes the score, so a client can only send higher/lower/stop and cannot fabricate a
// result. Settlement is one idempotent ledger operation per match id: score ÷ ratio, clamped by
// the arcade daily cap and the global ceiling. A bust settles zero but still consumes one of the
// day's scored plays. Plays past the daily scored count are practice: playable, never settled.

export const HILO_OP = "arcade_hilo";
export const CARD_MAX = 13;
export const POINTS_PER_GUESS = 10;
export const HILO_RATIO = 2;        // Stars = score ÷ ratio (tune, monthly rebalance later)
export const PLAY_STAR_CAP = 1000;  // GAME.md: 1,000/play cap
export const ARCADE_DAILY_CAP = 240;
export const SCORED_PLAYS_PER_DAY = 3;

interface Match {
  matchId: string;
  card: number;
  score: number;
  scored: boolean;
}

export class ArcadeService {
  private matches = new Map<number, Match>();
  private db: Database.Database;
  private emit: (accountId: number, msg: ServerMsg) => void;
  private draw: () => number;

  constructor(opts: {
    db: Database.Database;
    emit: (accountId: number, msg: ServerMsg) => void;
    /** Card source, 1..CARD_MAX. Tests inject a scripted deck. */
    draw?: () => number;
  }) {
    this.db = opts.db;
    this.emit = opts.emit;
    this.draw = opts.draw ?? (() => 1 + Math.floor(Math.random() * CARD_MAX));
  }

  start(accountId: number): void {
    if (this.matches.has(accountId)) {
      this.emit(accountId, { t: "error", code: "arcade", message: "finish your current run first" });
      return;
    }
    const scored =
      countOps(this.db, accountId, HILO_OP, Date.now() - DAY_MS) < SCORED_PLAYS_PER_DAY;
    const match: Match = { matchId: randomUUID(), card: this.draw(), score: 0, scored };
    this.matches.set(accountId, match);
    this.emit(accountId, {
      t: "arcade_state",
      card: match.card,
      score: match.score,
      scored: match.scored,
      over: false,
    });
  }

  move(accountId: number, move: "higher" | "lower" | "stop"): void {
    const match = this.matches.get(accountId);
    if (!match) {
      this.emit(accountId, { t: "error", code: "arcade", message: "no run in progress — deal first" });
      return;
    }
    if (move === "stop") {
      this.finish(accountId, match, "stopped");
      return;
    }
    const next = this.draw();
    const correct = move === "higher" ? next > match.card : next < match.card;
    match.card = next;
    if (!correct) {
      match.score = 0;
      this.finish(accountId, match, "bust");
      return;
    }
    match.score += POINTS_PER_GUESS;
    this.emit(accountId, {
      t: "arcade_state",
      card: match.card,
      score: match.score,
      scored: match.scored,
      over: false,
    });
  }

  /** Leaving mid-run settles as a stop — walking away never voids an earned score. */
  onLeave(accountId: number): void {
    const match = this.matches.get(accountId);
    if (match) this.finish(accountId, match, "stopped");
  }

  private finish(accountId: number, match: Match, outcome: "bust" | "stopped"): void {
    this.matches.delete(accountId);
    let paid = 0;
    if (match.scored) {
      const amount = Math.min(Math.floor(match.score / HILO_RATIO), PLAY_STAR_CAP);
      const { granted, balance } = settleEarn(this.db, {
        opKey: match.matchId,
        op: HILO_OP,
        accountId,
        amount,
        opCap: ARCADE_DAILY_CAP,
        recordZero: true,
      });
      paid = granted;
      if (granted > 0) {
        this.emit(accountId, { t: "stars", balance, delta: granted, reason: "arcade" });
      }
    }
    log("arcade", { matchId: match.matchId, accountId, outcome, score: match.score, paid, scored: match.scored });
    this.emit(accountId, {
      t: "arcade_state",
      card: match.card,
      score: match.score,
      scored: match.scored,
      over: true,
      outcome,
      paid,
    });
  }
}
