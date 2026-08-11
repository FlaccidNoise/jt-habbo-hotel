import {
  WHEEL_MAX_STAKE, WHEEL_MIN_STAKE, WHEEL_SEGMENTS, wheelOdds,
} from "@grand/shared";
import type { ClientMsg, ServerMsg } from "@grand/shared";
import { SEGMENT_COLOR } from "../scene/effects.ts";

// The Grand Wheel's bet panel (#429). It opens where the wheel is used and closes with the room —
// there is no HUD button, because a bet is only legal within reach of the machine. Everything the
// panel shows is derived in `wheelView` and painted by `render`, so what the player can and cannot
// press is testable without a DOM.

export type WheelResult = Extract<ServerMsg, { t: "wheel_result" }>;

const STAKE_STEP = 10;

export interface WheelHost {
  stars: () => number;
  bet: (msg: ClientMsg) => void;
}

export function segmentLabel(id: string): string {
  return WHEEL_SEGMENTS[id]?.label ?? id;
}

export function clampStake(stake: number): number {
  return Math.max(WHEEL_MIN_STAKE, Math.min(WHEEL_MAX_STAKE, Math.round(stake)));
}

/** The stake is clamped where the message is built, not only where the buttons move it: the panel
 *  must never send a stake the server would have to refuse. */
export function betMessage(itemId: number, segment: string, stake: number): ClientMsg {
  return { t: "wheel_bet", itemId, segment, stake: clampStake(stake) };
}

export interface SegmentRow {
  id: string;
  label: string;
  odds: string;
  color: number;
}

/** One button per segment, off the same published table the server draws from (shared/wheel.ts).
 *  Counting the wheel face is what produces the percentages, so a button cannot advertise odds the
 *  machine does not pay. */
export function segmentRows(): SegmentRow[] {
  return wheelOdds().map((row) => ({
    id: row.id,
    label: row.label,
    odds: `×${row.multiplier} · ${row.percent}`,
    color: SEGMENT_COLOR.get(row.id) ?? 0xffffff,
  }));
}

/** Third person, for the room: everyone in earshot of the wheel sees a win announced, which is
 *  most of the reason the machine is in a public room at all. */
export function revealText(result: WheelResult): string {
  const label = segmentLabel(result.resultSegment);
  return result.payout > 0
    ? `${result.name} wins ${result.payout} ★ on ${label}`
    : `${label} — no win`;
}

/** The same spin as the bettor reads it, in their own panel. */
export function outcomeText(result: WheelResult): string {
  const label = segmentLabel(result.resultSegment);
  return result.payout > 0
    ? `${label} — you win ${result.payout} ★`
    : `${label} — no win. Spin again?`;
}

export interface WheelState {
  itemId: number | null;
  pick: string | null;
  stake: number;
  /** A bet sent and not yet answered. SPIN stays disabled until a result or a refusal lands. */
  pending: boolean;
  /** Whatever the server last said, or the outcome of the last spin. Outlives a re-render, and is
   *  cleared by the next thing the player touches. */
  note: string;
}

export function emptyWheel(): WheelState {
  return { itemId: null, pick: null, stake: WHEEL_MIN_STAKE, pending: false, note: "" };
}

/** What the panel says when the server has said nothing: the reason SPIN is dark, or what the
 *  chosen colour pays. Too poor to play is the state the panel opens in for most new players, so
 *  it names the smallest stake rather than leaving a dead button. */
function hint(state: WheelState, stars: number): string {
  if (state.pending) return "Spinning…";
  if (stars < WHEEL_MIN_STAKE) {
    return `The smallest stake is ${WHEEL_MIN_STAKE} ★ — you have ${stars}.`;
  }
  if (stars < state.stake) return `That stake needs ${state.stake} ★ — you have ${stars}.`;
  if (!state.pick) return "Pick a colour to back.";
  return `${segmentLabel(state.pick)} pays ×${WHEEL_SEGMENTS[state.pick]?.multiplier ?? 0}.`;
}

export interface WheelView {
  rows: SegmentRow[];
  pick: string | null;
  stake: number;
  note: string;
  balance: string;
  spinLabel: string;
  canSpin: boolean;
  canRaise: boolean;
  canLower: boolean;
}

export function wheelView(state: WheelState, stars: number): WheelView {
  return {
    rows: segmentRows(),
    pick: state.pick,
    stake: state.stake,
    note: state.note || hint(state, stars),
    balance: `You have ${stars} ★`,
    spinLabel: `Spin · ${state.stake} ★`,
    canSpin: state.pick !== null && !state.pending && stars >= state.stake,
    canRaise: !state.pending && state.stake < WHEEL_MAX_STAKE,
    canLower: !state.pending && state.stake > WHEEL_MIN_STAKE,
  };
}

function button(text: string, run: () => void, disabled = false): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = text;
  el.disabled = disabled;
  el.addEventListener("click", run);
  return el;
}

export class WheelPanel {
  private state = emptyWheel();

  constructor(private root: HTMLElement, private host: WheelHost) {}

  get isOpen(): boolean {
    return this.state.itemId !== null;
  }

  /** Whether a bet of ours is still unanswered — what decides that a `purchase` refusal belongs
   *  here rather than on the toast rail, the way the creator claims its own buys. */
  get hasPendingBet(): boolean {
    return this.state.pending;
  }

  /** The wheel that was clicked. Re-opening a different wheel drops the old pick rather than
   *  carrying a stake across the room. */
  open(itemId: number): void {
    if (this.state.itemId !== itemId) this.state = { ...emptyWheel(), itemId };
    this.render();
  }

  close(): void {
    this.state = emptyWheel();
    this.root.hidden = true;
    this.root.replaceChildren();
  }

  /** The balance moved, so the affordable stakes did too. */
  refresh(): void {
    if (this.isOpen) this.render();
  }

  rejected(message: string): void {
    if (!this.isOpen) return;
    this.state.pending = false;
    this.state.note = message;
    this.render();
  }

  resolved(result: WheelResult): void {
    if (!this.isOpen || result.itemId !== this.state.itemId) return;
    this.state.pending = false;
    this.state.note = outcomeText(result);
    this.render();
  }

  private set(change: Partial<WheelState>): void {
    this.state = { ...this.state, ...change, note: "" };
    this.render();
  }

  private spin(): void {
    const { itemId, pick, stake } = this.state;
    if (itemId === null || pick === null) return;
    this.state = { ...this.state, pending: true, note: "" };
    this.host.bet(betMessage(itemId, pick, stake));
    this.render();
  }

  private render(): void {
    const view = wheelView(this.state, this.host.stars());
    const title = document.createElement("h2");
    title.textContent = "The Grand Wheel";

    const note = document.createElement("div");
    note.className = "note";
    note.textContent = view.note;

    const segs = document.createElement("div");
    segs.className = "segs";
    for (const row of view.rows) {
      const pick = button(row.label, () => this.set({ pick: row.id }));
      const odds = document.createElement("span");
      odds.textContent = row.odds;
      pick.appendChild(odds);
      pick.style.borderColor = `#${row.color.toString(16).padStart(6, "0")}`;
      if (row.id === view.pick) pick.classList.add("on");
      segs.appendChild(pick);
    }

    const stake = document.createElement("div");
    stake.className = "row stake";
    const amount = document.createElement("span");
    amount.className = "amount";
    amount.textContent = `${view.stake} ★`;
    stake.append(
      button("−", () => this.set({ stake: clampStake(view.stake - STAKE_STEP) }), !view.canLower),
      amount,
      button("+", () => this.set({ stake: clampStake(view.stake + STAKE_STEP) }), !view.canRaise),
    );

    const balance = document.createElement("div");
    balance.className = "bal";
    balance.textContent = view.balance;

    const actions = document.createElement("div");
    actions.className = "row";
    actions.append(
      button(view.spinLabel, () => this.spin(), !view.canSpin),
      button("Close", () => this.close()),
    );

    this.root.replaceChildren(title, note, segs, stake, balance, actions);
    this.root.hidden = false;
  }
}
