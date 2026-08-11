// The Grand Furnishings Folio panel (docs/plans/2026-08-11-furniture-content-blitz-catalog.md,
// Task 3). The model lives in folio.ts; this class owns every element inside #folio. index.html
// owns the shell and the CSS; the class builds all child markup.

import type { CollectionSet, SetProgress } from "@grand/shared";
import {
  folioCardState, folioChapters, folioEntries, folioPage, folioSearch,
} from "./folio.ts";
import type { FolioCardContext, FolioEntry, FolioItem } from "./folio.ts";
import { themeLabel } from "./catalog.ts";

export interface FolioPanelInput {
  items: readonly FolioItem[];
  prices: ReadonlyMap<string, number>;
  collectionSets: readonly CollectionSet[];
  setProgress: readonly SetProgress[];
  prestigeDefs: ReadonlySet<string>;
  stars: number;
  ownedWearableSets: ReadonlySet<number>;
}

export interface FolioPanelDeps {
  buy(defId: string): void;
  buySet(setId: number): void;
  furniThumb(entry: FolioEntry, box: { w: number; h: number }, maxIntegerScale?: number): HTMLElement;
}

const PAGE_SIZE = 24;
const CARD_BOX = { w: 96, h: 84 };
const DETAIL_BOX = { w: 288, h: 160 };

interface MountedCard {
  el: HTMLButtonElement;
  priceEl: HTMLElement;
  entry: FolioEntry;
}

export class FolioPanel {
  private input: FolioPanelInput | null = null;
  private openState = false;

  private starsEl: HTMLElement;
  private searchEl: HTMLInputElement;
  private spineEl: HTMLElement;
  private panelEl: HTMLElement;
  private gridEl: HTMLElement;
  private detailEl: HTMLElement;
  private prevEl: HTMLButtonElement;
  private nextEl: HTMLButtonElement;
  private pageInfoEl: HTMLElement;
  private resultEl: HTMLElement;

  private chapterSig = "";
  private chapter = "";
  private query = "";
  private page = 0;
  private selectedId: string | null = null;
  private mountedSig = "";
  private mounted = new Map<string, MountedCard>();
  /** The purchase awaiting a server answer; every Buy disables until it resolves. */
  private pending: { kind: "buy" | "buy_set"; price: number } | null = null;

  constructor(private root: HTMLElement, private deps: FolioPanelDeps) {
    root.innerHTML = "";
    const frame = document.createElement("div");
    frame.className = "frame";

    const header = document.createElement("header");
    const title = document.createElement("h1");
    title.textContent = "The Grand Furnishings Folio";
    this.starsEl = document.createElement("div");
    this.starsEl.className = "stars";
    this.searchEl = document.createElement("input");
    this.searchEl.type = "search";
    this.searchEl.placeholder = "Search names and themes…";
    this.searchEl.setAttribute("aria-label", "Search the folio");
    const close = document.createElement("button");
    close.type = "button";
    close.className = "close";
    close.textContent = "Close";
    close.addEventListener("click", () => this.close());
    header.append(title, this.starsEl, this.searchEl, close);

    const body = document.createElement("div");
    body.className = "body";
    this.spineEl = document.createElement("nav");
    this.spineEl.className = "spine";
    this.spineEl.setAttribute("role", "tablist");
    this.spineEl.setAttribute("aria-label", "Folio chapters");
    this.panelEl = document.createElement("section");
    this.panelEl.className = "page";
    this.panelEl.setAttribute("role", "tabpanel");
    this.gridEl = document.createElement("div");
    this.gridEl.className = "grid";
    this.panelEl.append(this.gridEl);
    this.detailEl = document.createElement("aside");
    this.detailEl.className = "detail";
    this.detailEl.setAttribute("role", "dialog");
    this.detailEl.setAttribute("aria-modal", "false");
    this.detailEl.setAttribute("aria-label", "Item detail");
    this.detailEl.hidden = true;
    body.append(this.spineEl, this.panelEl, this.detailEl);

    const footer = document.createElement("footer");
    this.prevEl = document.createElement("button");
    this.prevEl.type = "button";
    this.prevEl.textContent = "◀ Previous";
    this.prevEl.setAttribute("aria-label", "Previous page");
    this.prevEl.addEventListener("click", () => this.turn(-1));
    this.pageInfoEl = document.createElement("span");
    this.pageInfoEl.className = "pageinfo";
    this.nextEl = document.createElement("button");
    this.nextEl.type = "button";
    this.nextEl.textContent = "Next ▶";
    this.nextEl.setAttribute("aria-label", "Next page");
    this.nextEl.addEventListener("click", () => this.turn(1));
    this.resultEl = document.createElement("span");
    this.resultEl.className = "result";
    this.resultEl.setAttribute("aria-live", "polite");
    footer.append(this.prevEl, this.pageInfoEl, this.nextEl, this.resultEl);

    frame.append(header, body, footer);
    root.append(frame);

    this.searchEl.addEventListener("input", () => {
      this.query = this.searchEl.value;
      this.page = 0;
      this.render();
    });
    this.gridEl.addEventListener("keydown", (e) => this.onGridKey(e));
    root.addEventListener("keydown", (e) => {
      if (!this.openState || e.key !== "Escape") return;
      e.stopPropagation();
      if (!this.detailEl.hidden) {
        this.closeDetail();
        this.focusCard(this.selectedId);
      } else {
        this.close();
      }
    });
  }

  open(): void {
    if (this.openState) return;
    this.openState = true;
    this.root.hidden = false;
    this.root.classList.add("open");
    this.resultEl.textContent = "";
    this.render();
    this.focusCard(this.mounted.keys().next().value ?? null);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.root.classList.remove("open");
    this.root.hidden = true;
    this.closeDetail();
    document.getElementById("tab-catalog")?.focus();
  }

  isOpen(): boolean { return this.openState; }

  refresh(input: FolioPanelInput): void {
    this.input = input;
    this.starsEl.textContent = `${input.stars} ★`;
    if (this.openState) this.render();
  }

  /** The server answered a purchase. Success shows the green confirmation; failure shows inline
   *  red text. Either way the Buy controls re-arm — a refusal or a dropped connection must never
   *  leave the folio locked. */
  purchaseResolved(ok: boolean, message: string): void {
    this.pending = null;
    this.resultEl.classList.toggle("ok", ok);
    this.resultEl.classList.toggle("fail", !ok);
    this.resultEl.textContent = message;
    if (this.openState) this.render();
  }

  // ── render ────────────────────────────────────────────────────────────────────────────────

  private context(): FolioCardContext {
    const input = this.input!;
    return {
      stars: input.stars,
      ownedWearableSets: input.ownedWearableSets,
      completedCollectionSets: new Set(
        input.setProgress.filter((p) => p.complete).map((p) => p.id)),
    };
  }

  private render(): void {
    if (!this.input) return;
    const entries = folioEntries(this.input.items, this.input.prices, this.input.collectionSets);
    const found = folioSearch(entries, this.query);
    const chapters = folioChapters(found);

    const sig = chapters.map((c) => `${c.id}:${c.entries.length}`).join("|");
    if (sig !== this.chapterSig) {
      this.chapterSig = sig;
      if (!chapters.some((c) => c.id === this.chapter)) {
        this.chapter = chapters[0]?.id ?? "";
      }
      this.renderSpine(chapters);
    }
    const chapter = chapters.find((c) => c.id === this.chapter);
    const view = folioPage(chapter?.entries ?? [], this.page, PAGE_SIZE);
    this.page = view.page;

    this.panelEl.setAttribute("aria-label", `${chapter ? chapter.label : "Empty"} — page ${view.page + 1} of ${Math.max(view.pageCount, 1)}`);
    this.pageInfoEl.textContent = view.pageCount === 0
      ? "No entries"
      : `Page ${view.page + 1} of ${view.pageCount}`;
    this.prevEl.disabled = view.page <= 0 || this.pending !== null;
    this.nextEl.disabled = view.page >= view.pageCount - 1 || this.pending !== null;

    const mountedSig = view.entries.map((e) => e.item.id).join("|");
    if (mountedSig !== this.mountedSig) {
      this.mountedSig = mountedSig;
      this.mountCards(view.entries);
    } else {
      this.updateCards();
    }
    if (this.selectedId !== null) this.renderDetail();
  }

  private renderSpine(chapters: { id: string; label: string; entries: FolioEntry[] }[]): void {
    this.spineEl.innerHTML = "";
    for (const chapter of chapters) {
      const tab = document.createElement("button");
      tab.type = "button";
      tab.id = `folio-tab-${chapter.id}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-selected", String(chapter.id === this.chapter));
      tab.textContent = `${chapter.label} · ${chapter.entries.length}`;
      tab.addEventListener("click", () => {
        this.chapter = chapter.id;
        this.page = 0;
        this.render();
        tab.focus();
      });
      this.spineEl.append(tab);
    }
    this.panelEl.setAttribute("aria-labelledby", `folio-tab-${this.chapter}`);
  }

  private mountCards(entries: FolioEntry[]): void {
    this.gridEl.innerHTML = "";
    this.mounted.clear();
    for (const [i, entry] of entries.entries()) {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "card";
      card.dataset.id = entry.item.id;
      card.tabIndex = i === 0 ? 0 : -1;

      card.append(this.deps.furniThumb(entry, CARD_BOX));
      const name = document.createElement("span");
      name.className = "name";
      name.textContent = entry.item.name;
      const priceEl = document.createElement("span");
      priceEl.className = "price";
      const tags = document.createElement("span");
      tags.className = "tags";
      if (this.input!.prestigeDefs.has(entry.item.id)) tags.append(this.tag("Prestige"));
      if (this.setIdOf(entry.item.id) !== null) tags.append(this.tag("Set"));
      card.append(name, priceEl, tags);

      card.addEventListener("click", () => this.select(entry.item.id));
      this.gridEl.append(card);
      this.mounted.set(entry.item.id, { el: card, priceEl, entry });
    }
    this.updateCards();
  }

  private tag(text: string): HTMLElement {
    const el = document.createElement("span");
    el.className = "tag";
    el.textContent = text;
    return el;
  }

  /** Balance changes land here: toggle the mounted cards' states, never rebuild the thumbnails. */
  private updateCards(): void {
    const context = this.context();
    for (const { el, priceEl, entry } of this.mounted.values()) {
      const state = folioCardState(entry, context);
      el.classList.toggle("unaffordable", state === "unaffordable");
      el.classList.toggle("selected", entry.item.id === this.selectedId);
      el.setAttribute("aria-pressed", String(entry.item.id === this.selectedId));
      if (entry.acquisition.kind === "set_reward") {
        priceEl.className = "ribbon";
        priceEl.textContent = state === "reward_earned" ? "Set reward · earned" : "Set reward";
      } else if (state === "owned") {
        priceEl.className = "ribbon";
        priceEl.textContent = "Owned";
      } else {
        priceEl.className = "price";
        priceEl.textContent = `${entry.acquisition.price} ★`;
      }
    }
  }

  // ── detail ────────────────────────────────────────────────────────────────────────────────

  private select(id: string): void {
    this.selectedId = id;
    this.updateCards();
    this.renderDetail();
  }

  private renderDetail(): void {
    const card = this.mounted.get(this.selectedId ?? "");
    this.detailEl.innerHTML = "";
    if (!card) {
      this.detailEl.hidden = true;
      return;
    }
    const { entry } = card;
    const item = entry.item;
    const context = this.context();
    const state = folioCardState(entry, context);

    // 2x nearest-neighbour preview — the only place art upscales.
    this.detailEl.append(this.deps.furniThumb(entry, DETAIL_BOX, 2));

    const title = document.createElement("h2");
    title.textContent = item.name;
    this.detailEl.append(title);

    const meta = document.createElement("div");
    meta.className = "meta";
    meta.append(this.metaRow(`Theme: ${themeLabel(item.theme)}`));
    if (item.w !== undefined && item.l !== undefined) {
      meta.append(this.metaRow(`Footprint: ${item.w} × ${item.l}`));
    }
    if (item.span !== undefined) {
      meta.append(this.metaRow(`Wall span: ${item.span} · plane ${item.plane?.w ?? "?"} × ${item.plane?.h ?? "?"}`));
    }
    if (item.interaction) {
      meta.append(this.metaRow(`Interaction: ${item.interaction}` +
        (item.vend ? ` — serves ${item.vend.item} at ${item.vend.price} ★` : "")));
    }
    this.detailEl.append(meta);

    const setId = this.setIdOf(item.id);
    if (setId !== null) {
      const progress = this.input!.setProgress.find((p) => p.id === setId);
      if (progress) {
        const note = document.createElement("div");
        note.className = "note";
        note.textContent = `${progress.name}: ${progress.owned.length} of ` +
          `${progress.owned.length + progress.missing.length} owned` +
          (progress.complete ? " — complete!" : "");
        this.detailEl.append(note);
      }
    }
    if (this.input!.prestigeDefs.has(item.id)) {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = "Prestige fixture — minted account-bound, never tradeable.";
      this.detailEl.append(note);
    }

    if (entry.acquisition.kind === "set_reward") {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = `Earned by completing ${entry.acquisition.setName}. Not for sale.`;
      this.detailEl.append(note);
    } else if (state === "owned") {
      const note = document.createElement("div");
      note.className = "note";
      note.textContent = "Already in your wardrobe.";
      this.detailEl.append(note);
    } else {
      const price = entry.acquisition.price;
      const buy = document.createElement("button");
      buy.type = "button";
      buy.className = "buy";
      buy.textContent = this.pending !== null ? "Ringing up…" : `Buy · ${price} ★`;
      buy.disabled = this.pending !== null || state === "unaffordable";
      buy.addEventListener("click", () => this.startPurchase(entry));
      this.detailEl.append(buy);
      if (state === "unaffordable") {
        const shortfall = document.createElement("div");
        shortfall.className = "note";
        shortfall.textContent = `Needs ${price - this.input!.stars} more ★.`;
        this.detailEl.append(shortfall);
      }
    }

    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "dismiss";
    dismiss.textContent = "Back to the page";
    dismiss.addEventListener("click", () => {
      this.closeDetail();
      this.focusCard(item.id);
    });
    this.detailEl.append(dismiss);
    this.detailEl.hidden = false;
  }

  private metaRow(text: string): HTMLElement {
    const row = document.createElement("div");
    row.textContent = text;
    return row;
  }

  private closeDetail(): void {
    this.selectedId = null;
    this.detailEl.hidden = true;
    this.detailEl.innerHTML = "";
    if (this.mounted.size > 0) this.updateCards();
  }

  private startPurchase(entry: FolioEntry): void {
    if (this.pending !== null || entry.acquisition.kind !== "buy") return;
    this.pending = { kind: "buy", price: entry.acquisition.price };
    this.resultEl.textContent = "";
    this.render();
    if (entry.item.setId !== undefined) this.deps.buySet(entry.item.setId);
    else this.deps.buy(entry.item.id);
  }

  // ── keyboard ──────────────────────────────────────────────────────────────────────────────

  private setIdOf(defId: string): string | null {
    for (const set of this.input?.collectionSets ?? []) {
      if (set.members.includes(defId)) return set.id;
    }
    return null;
  }

  private columns(): number {
    const cards = Array.from(this.gridEl.children);
    if (cards.length === 0) return 1;
    const top = (cards[0] as HTMLElement).offsetTop;
    return Math.max(1, cards.filter((c) => (c as HTMLElement).offsetTop === top).length);
  }

  private onGridKey(e: KeyboardEvent): void {
    const cards = Array.from(this.gridEl.querySelectorAll<HTMLButtonElement>(".card"));
    if (cards.length === 0) return;
    const current = cards.findIndex((c) => c === document.activeElement);
    if (current < 0) return;
    const cols = this.columns();
    const moves: Record<string, number> = {
      ArrowLeft: -1, ArrowRight: 1, ArrowUp: -cols, ArrowDown: cols,
      Home: -current, End: cards.length - 1 - current,
    };
    const delta = moves[e.key];
    if (delta === undefined) return;
    e.preventDefault();
    const next = Math.max(0, Math.min(cards.length - 1, current + delta));
    cards[current]!.tabIndex = -1;
    cards[next]!.tabIndex = 0;
    cards[next]!.focus();
  }

  private focusCard(id: string | null): void {
    const card = id !== null ? this.mounted.get(id) : undefined;
    const target = card?.el ?? this.gridEl.querySelector<HTMLButtonElement>(".card");
    if (!target) {
      this.searchEl.focus();
      return;
    }
    for (const { el } of this.mounted.values()) el.tabIndex = -1;
    target.tabIndex = 0;
    target.focus();
  }

  private turn(delta: number): void {
    this.page += delta;
    this.render();
  }
}
