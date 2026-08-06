import type Database from "better-sqlite3";
import { CATALOG_PRICES } from "@grand/shared";

// GAME.md §Transfer limits, "the actual wall" (#237). Stars are earned-only and never move
// between players, so *goods* are the whole laundering surface: the classic funnel is a pod of
// alts farmed to the earn ceiling, spent on catalog furni, and handed to a main.
//
// Three mechanisms, all enforced here rather than in any UI. settleTrade is the only code that
// moves an owner_id today; the marketplace, stalls and gifts (#118) must settle through it or
// call these same checks, or they become the funnel instead.
//
// Imports nothing from ledger.ts on purpose: ledger.ts imports this, and the cycle would make
// the constants below undefined at module-init time depending on which side loaded first.

/** GAME.md: catalog furni is bind-on-purchase for 72 hours. Costs a real player nothing — they
 *  are furnishing a room, not reselling — and forces a pod to carry three days of inventory
 *  risk on every hop. */
export const BIND_MS = 72 * 60 * 60 * 1000;

export const TRANSFER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// The budget an account may hand out, net of receipts, in a rolling 7 days. All (tune).
//
// GAME.md wants it "low at creation, rising with tenure and non-farmable milestones". Tenure is
// the only term here: the milestones GAME.md §Alt strategy has in mind are vote-based
// first-trade qualification, which does not exist yet, and the one milestone that does exist —
// collection-set badges — is bought with Stars and so is farmable by exactly the pod this wall
// is for. A farmable milestone widening the wall would be worse than no milestone term.
//
// The cap is 7 × the 600/day global earn ceiling: the most value an account could have legitimately
// earned inside the window. Above that, outbound is necessarily someone else's Stars.
export const BUDGET_BASE = 150;      // one median furni on the day the account is made
export const BUDGET_PER_DAY = 100;   // per full day of tenure
export const BUDGET_MAX = 4200;

/** Catalog value. Items with no catalog price (nothing today) count as worthless rather than
 *  free-to-launder — a def missing from the price table must not become the hole in the wall. */
export const itemValue = (defId: string): number => CATALOG_PRICES.get(defId) ?? 0;

export function outboundBudget(db: Database.Database, accountId: number, now: number): number {
  const row = db.prepare("SELECT created_at AS createdAt FROM accounts WHERE id = ?").get(accountId) as
    | { createdAt: number }
    | undefined;
  if (!row) return 0;
  const tenureDays = Math.max(0, Math.floor((now - row.createdAt) / (24 * 60 * 60 * 1000)));
  return Math.min(BUDGET_MAX, BUDGET_BASE + BUDGET_PER_DAY * tenureDays);
}

interface TransferRow {
  defId: string;
  receiver: number;
  giver: number;
}

/** Every item that changed hands since `since`. One row per item per trade — the ledger writes
 *  the receiver as `account_id` and the giver as `counterparty_id`. Value is joined in JS so the
 *  catalog stays the single source of prices. */
function transfers(db: Database.Database, since: number, accountId?: number): TransferRow[] {
  const mine = accountId === undefined ? "" : " AND (e.account_id = ? OR e.counterparty_id = ?)";
  return db
    .prepare(
      `SELECT f.def_id AS defId, e.account_id AS receiver, e.counterparty_id AS giver
       FROM ledger_entries e JOIN furni_items f ON f.id = e.item_id
       WHERE e.op = 'trade' AND e.counterparty_id IS NOT NULL AND e.created_at > ?${mine}`,
    )
    .all(...(accountId === undefined ? [since] : [since, accountId, accountId])) as TransferRow[];
}

/** Catalog value handed out net of value received, in the window. Negative for a net receiver. */
export function netOutbound(db: Database.Database, accountId: number, since: number): number {
  let net = 0;
  for (const row of transfers(db, since, accountId)) {
    if (row.giver === accountId) net += itemValue(row.defId);
    if (row.receiver === accountId) net -= itemValue(row.defId);
  }
  return net;
}

/** What one side of a proposed trade would do to its own net outbound: value given less received. */
export const swingOf = (given: string[], received: string[]): number =>
  given.reduce((sum, defId) => sum + itemValue(defId), 0) -
  received.reduce((sum, defId) => sum + itemValue(defId), 0);

export interface BudgetCheck {
  ok: boolean;
  budget: number;
  used: number;
  swing: number;
}

/** Fail-closed budget test for one side. `ok` when the trade leaves the account at or under its
 *  budget — a swing that only reduces net outbound always passes, so a net *receiver* is never
 *  blocked by their counterparty's history. */
export function checkBudget(
  db: Database.Database,
  accountId: number,
  swing: number,
  now: number,
): BudgetCheck {
  const budget = outboundBudget(db, accountId, now);
  const used = netOutbound(db, accountId, now - TRANSFER_WINDOW_MS);
  return { ok: swing <= 0 || used + swing <= budget, budget, used, swing };
}

// ── Standing collusion queries (GAME.md §Transfer limits, audit R-02) ──────────────────────────
// Read-only, and staff-only by virtue of living behind /api/metrics (#226).

export interface PairFlow {
  a: number;
  b: number;
  /** Catalog value that moved from `a` to `b` net of the other direction — always positive, with
   *  `a` the net giver. */
  net: number;
  /** Value moved in both directions. A pair with high volume and near-zero net is two players
   *  swapping; high volume and high net is a funnel. */
  volume: number;
}

/** (1) Net value flow per account pair. Ordered by net, biggest funnel first. */
export function pairFlows(db: Database.Database, since: number, limit = 20): PairFlow[] {
  const pairs = new Map<string, { a: number; b: number; net: number; volume: number }>();
  for (const row of transfers(db, since)) {
    const [lo, hi] = row.giver < row.receiver ? [row.giver, row.receiver] : [row.receiver, row.giver];
    const key = `${lo}:${hi}`;
    const entry = pairs.get(key) ?? { a: lo, b: hi, net: 0, volume: 0 };
    const value = itemValue(row.defId);
    entry.net += row.giver === lo ? value : -value;
    entry.volume += value;
    pairs.set(key, entry);
  }
  return [...pairs.values()]
    .map((p) => (p.net < 0 ? { a: p.b, b: p.a, net: -p.net, volume: p.volume } : p))
    .filter((p) => p.net > 0)
    .sort((x, y) => y.net - x.net)
    .slice(0, limit);
}

export interface OverEarner {
  accountId: number;
  outbound: number;
  inbound: number;
  earned: number;
}

/** (2) Accounts whose outbound value exceeds inbound plus their own earnings. Such an account
 *  handed out more than it could have paid for, so the goods came from somewhere else. */
export function overEarners(db: Database.Database, since: number, limit = 20): OverEarner[] {
  const totals = new Map<number, { outbound: number; inbound: number }>();
  const at = (id: number) => {
    const e = totals.get(id) ?? { outbound: 0, inbound: 0 };
    totals.set(id, e);
    return e;
  };
  for (const row of transfers(db, since)) {
    const value = itemValue(row.defId);
    at(row.giver).outbound += value;
    at(row.receiver).inbound += value;
  }
  const earnedStmt = db.prepare(
    "SELECT COALESCE(SUM(stars), 0) AS s FROM ledger_entries WHERE account_id = ? AND stars > 0 AND created_at > ?",
  );
  return [...totals.entries()]
    .map(([accountId, t]) => ({
      accountId,
      ...t,
      earned: (earnedStmt.get(accountId, since) as { s: number }).s,
    }))
    .filter((r) => r.outbound > r.inbound + r.earned)
    .sort((x, y) => y.outbound - y.inbound - (x.outbound - x.inbound))
    .slice(0, limit);
}

/** A pair must move at least this much in the window before it counts as a pod edge (tune). One
 *  median furni — below that, every casual swap in the hotel would form a component. */
export const POD_EDGE_MIN = 150;

export interface Pod {
  members: number[];
  /** Value moved on edges inside the group. */
  internal: number;
  /** Value moved between a member and anyone outside it, over the whole graph rather than only
   *  the strong edges — an insular group trades with the hotel barely or not at all. */
  external: number;
}

/** (3) Trade-graph components whose internal volume exceeds external.
 *
 *  Components are built from *strong* edges only. Maximal components of the whole graph would be
 *  useless here: by definition nothing leaves them, so external is always zero and every group
 *  reports as a pod. Clustering on heavy pairs and then measuring external volume across all
 *  edges is what separates an insular pod from a well-connected trader. */
export function pods(db: Database.Database, since: number, limit = 10): Pod[] {
  const rows = transfers(db, since);
  const edges = pairFlows(db, since, Number.MAX_SAFE_INTEGER);

  const parent = new Map<number, number>();
  const find = (x: number): number => {
    const p = parent.get(x) ?? x;
    if (p === x) return x;
    const root = find(p);
    parent.set(x, root);
    return root;
  };
  const union = (x: number, y: number): void => {
    const [rx, ry] = [find(x), find(y)];
    if (rx !== ry) parent.set(rx, ry);
  };
  for (const edge of edges) {
    if (edge.volume >= POD_EDGE_MIN) union(edge.a, edge.b);
  }

  const groups = new Map<number, Set<number>>();
  for (const edge of edges) {
    if (edge.volume < POD_EDGE_MIN) continue;
    const root = find(edge.a);
    const set = groups.get(root) ?? new Set<number>();
    set.add(edge.a).add(edge.b);
    groups.set(root, set);
  }

  return [...groups.values()]
    .filter((members) => members.size >= 2)
    .map((members): Pod => {
      let internal = 0;
      let external = 0;
      for (const row of rows) {
        const inGiver = members.has(row.giver);
        const inReceiver = members.has(row.receiver);
        if (inGiver && inReceiver) internal += itemValue(row.defId);
        else if (inGiver || inReceiver) external += itemValue(row.defId);
      }
      return { members: [...members].sort((a, b) => a - b), internal, external };
    })
    .filter((p) => p.internal > p.external)
    .sort((x, y) => y.internal - x.internal)
    .slice(0, limit);
}
