import type Database from "better-sqlite3";

// PIPELINES §5 Observability (audit H4): the data exists before the exploit. Star flows come
// from the ledger itself; process counters cover what the ledger cannot see.

export const ledgerStats = { ops: 0, errors: 0, totalMs: 0, maxMs: 0 };

/** Wraps a ledger settlement so every call lands in `ledgerStats`. */
export function timed<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return (...args) => {
    const t0 = performance.now();
    try {
      return fn(...args);
    } catch (e) {
      ledgerStats.errors++;
      throw e;
    } finally {
      const ms = performance.now() - t0;
      ledgerStats.ops++;
      ledgerStats.totalMs += ms;
      if (ms > ledgerStats.maxMs) ledgerStats.maxMs = ms;
    }
  };
}

export const wsStats = { connects: 0, reconnects: 0 };

// Walk steps and NPC performances ride setInterval, so event-loop delay is tick health.
const LAG_SAMPLE_MS = 5000;

export interface LagSampler {
  read(): { lastMs: number; maxMs: number };
  stop(): void;
}

export function startLagSampler(): LagSampler {
  let last = 0;
  let max = 0;
  let expected = Date.now() + LAG_SAMPLE_MS;
  const timer = setInterval(() => {
    last = Math.max(0, Date.now() - expected);
    if (last > max) max = last;
    expected = Date.now() + LAG_SAMPLE_MS;
  }, LAG_SAMPLE_MS);
  timer.unref();
  return {
    read: () => ({ lastMs: last, maxMs: max }),
    stop: () => clearInterval(timer),
  };
}

export interface FlowRow {
  op: string;
  stars: number;
}

/** Per-op Stars issued and absorbed since `since`. Sinks report positive numbers. */
export function flows(
  db: Database.Database,
  since: number,
): { faucets: FlowRow[]; sinks: FlowRow[] } {
  const faucets = db
    .prepare(
      `SELECT op, SUM(stars) AS stars FROM ledger_entries
       WHERE stars > 0 AND created_at > ? GROUP BY op ORDER BY stars DESC`,
    )
    .all(since) as FlowRow[];
  const sinks = db
    .prepare(
      `SELECT op, -SUM(stars) AS stars FROM ledger_entries
       WHERE stars < 0 AND created_at > ? GROUP BY op ORDER BY stars DESC`,
    )
    .all(since) as FlowRow[];
  return { faucets, sinks };
}

export interface HourRow {
  hour: number;
  op: string;
  stars: number;
}

/** Net Stars per op per hour bucket since `since` — the issuance/absorption time series. */
export function hourly(db: Database.Database, since: number): HourRow[] {
  return db
    .prepare(
      `SELECT (created_at / 3600000) * 3600000 AS hour, op, SUM(stars) AS stars
       FROM ledger_entries WHERE created_at > ? AND stars != 0
       GROUP BY hour, op ORDER BY hour`,
    )
    .all(since) as HourRow[];
}
