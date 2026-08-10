import {
  FIGUREDATA_VERSION,
  FIGURE_SETS,
  STAFF_GRANT_SETS,
  STARTER_GRANT_SETS,
  paletteFor,
  parseFigure,
  serializeFigure,
  setById,
} from "@grand/shared";
import type { ColorFamily, Figure, FigureSet, LayerType, WornPart } from "@grand/shared";
import type { FigureBaker } from "../scene/figure.ts";

// Create-your-look and the wardrobe are ONE panel (#344): full screen after register, and again
// in-room from the HUD tab, where the only differences are the confirm button and the footer note.
// Every preview bakes at runtime through FigureBaker, so the panel ships no art of its own and the
// bake cache it shares with the room means a card and the avatar wearing it cost one bake, not two.

const TABS = ["Skin", "Face", "Hair", "Top", "Legs", "Shoes", "Hat"] as const;
export type Tab = (typeof TABS)[number];

interface Crop { x: number; y: number; w: number; h: number; scale: number }

/** Where each card looks inside the 64x112 bake cell, and how far it is blown up. */
const CROP = {
  preview: { x: 0, y: 8, w: 64, h: 102, scale: 5 },
  face: { x: 21, y: 26, w: 22, h: 20, scale: 6 },
  hair: { x: 14, y: 16, w: 36, h: 30, scale: 4 },
  top: { x: 14, y: 38, w: 36, h: 34, scale: 4 },
  legs: { x: 16, y: 60, w: 32, h: 40, scale: 4 },
  shoes: { x: 16, y: 84, w: 32, h: 22, scale: 5 },
  hat: { x: 14, y: 14, w: 36, h: 28, scale: 4 },
} satisfies Record<string, Crop>;

const SHOES_SET = 9;   // Loafers is the whole shipped sh library
const CARD_DIR = 3;    // cards always face front — only the big preview turns
const DIRS = 8;

/** The types the seven tabs own. Anything else the player wears — a coat, spectacles, a pendant —
 *  is carried through untouched, so confirming the panel never strips a cosmetic they earned. */
const MANAGED: readonly LayerType[] = ["hd", "fa", "hr", "ch", "lg", "sh", "ha"];

/** The staff uniform is granted to NPC accounts and can never be earned, so it is never offered.
 *  A staff player already wearing it keeps it: `lookToFigure` re-emits whatever the state holds. */
const STAFF_ONLY: ReadonlySet<number> = new Set(
  STAFF_GRANT_SETS.filter((id) => !STARTER_GRANT_SETS.includes(id)),
);

export function setsOfType(type: LayerType): FigureSet[] {
  return FIGURE_SETS.filter((s) => s.type === type && !s.retired && !STAFF_ONLY.has(s.id));
}

/** Slot 1 is an iris only on the curated face sets; the plain head has no second slot. */
function hasIris(setId: number): boolean {
  return setById(setId)?.slotFamilies?.[1] === "iris";
}

export interface Look {
  dir: number;
  tab: Tab;
  skin: string;
  faceSetId: number;
  iris: string;
  beardSetId: number;   // 0 = clean shaven
  hair: number;         // 0 = bare
  hairColor: string;
  top: number;
  topColors: [string, string];
  legs: number;
  legsColor: string;
  shoesColor: string;
  hat: number;          // 0 = bare-headed
  hatColor: string;
  extras: WornPart[];
}

export function figureToLook(input: string, tab: Tab = "Face", dir = 3): Look {
  const worn = new Map(parseFigure(input).parts.map((p) => [p.type, p]));
  const head = worn.get("hd");
  const of = (type: LayerType, slot: number, fallback: string): string =>
    worn.get(type)?.colors[slot] ?? fallback;
  return {
    dir,
    tab,
    skin: head?.colors[0] ?? "skin_3",
    faceSetId: head?.set ?? 2,
    iris: head?.colors[1] ?? "charcoal",
    beardSetId: worn.get("fa")?.set ?? 0,
    hair: worn.get("hr")?.set ?? 0,
    hairColor: of("hr", 0, "charcoal"),
    top: worn.get("ch")?.set ?? 0,
    topColors: [of("ch", 0, "crimson"), of("ch", 1, "ivory")],
    legs: worn.get("lg")?.set ?? 0,
    legsColor: of("lg", 0, "navy"),
    shoesColor: of("sh", 0, "charcoal"),
    hat: worn.get("ha")?.set ?? 0,
    hatColor: of("ha", 0, "navy"),
    extras: [...worn.values()].filter((p) => !MANAGED.includes(p.type)),
  };
}

export function lookToFigure(look: Look): Figure {
  const parts: WornPart[] = [...look.extras];
  const wear = (type: LayerType, id: number, colors: readonly string[]): void => {
    const set = setById(id);
    if (!set) return;   // 0 is "none", and a set the registry lost is not worn either
    parts.push({
      type,
      set: id,
      colors: Array.from({ length: set.slots }, (_, i) => colors[i] ?? colors[0] ?? "charcoal"),
    });
  };
  wear("hd", look.faceSetId, [look.skin, look.iris]);
  wear("hr", look.hair, [look.hairColor]);
  wear("fa", look.beardSetId, [look.hairColor]);
  wear("ch", look.top, look.topColors);
  wear("lg", look.legs, [look.legsColor]);
  wear("sh", SHOES_SET, [look.shoesColor]);
  wear("ha", look.hat, [look.hatColor]);
  return { version: FIGUREDATA_VERSION, parts };
}

/** The head plus the named types — a card shows one garment, not the whole outfit. */
function figureOf(look: Look, keep: readonly LayerType[]): Figure {
  const all = lookToFigure({ ...look, extras: [] });
  return {
    version: all.version,
    parts: all.parts.filter((p) => p.type === "hd" || keep.includes(p.type)),
  };
}

/** Pieces in this look the account cannot wear. The server decides for real — this is what lets
 *  the panel mark them before the player commits, and name them when the refusal comes back. */
export function lockedPicks(look: Look, owned: ReadonlySet<number>): FigureSet[] {
  return lookToFigure(look)
    .parts.filter((p) => !owned.has(p.set))
    .map((p) => setById(p.set))
    .filter((s): s is FigureSet => s !== undefined);
}

/** Randomize only ever produces a wearable outfit, so the dice can never walk the player into the
 *  refusal state. Colours come from the whole palette of each slot's family. */
export function randomLook(
  look: Look, owned: ReadonlySet<number>, rand: () => number = Math.random,
): Look {
  const pick = <T,>(list: readonly T[]): T | undefined => list[Math.floor(rand() * list.length)];
  const ownedOf = (type: LayerType): number =>
    pick(setsOfType(type).filter((s) => owned.has(s.id)))?.id ?? 0;
  const ramp = (family: ColorFamily): string => pick(paletteFor(family)) ?? "charcoal";
  return {
    ...look,
    skin: ramp("skin"),
    faceSetId: ownedOf("hd") || look.faceSetId,
    iris: ramp("iris"),
    beardSetId: rand() < 0.25 ? ownedOf("fa") : 0,
    hair: ownedOf("hr"),
    hairColor: ramp("material"),
    top: ownedOf("ch") || look.top,
    topColors: [ramp("material"), ramp("material")],
    legs: ownedOf("lg") || look.legs,
    legsColor: ramp("material"),
    shoesColor: ramp("material"),
    hat: rand() < 0.2 ? ownedOf("ha") : 0,
    hatColor: ramp("material"),
  };
}

interface Card { id: number; name: string; figure: Figure }

export interface CreatorHost {
  /** Read late: the atlas loads during boot, after this panel is constructed. */
  baker: () => FigureBaker | null;
  send: (figure: string) => void;
  onClose: () => void;
}

/** How long to wait for the server's verdict before telling the player it never came. A confirm
 *  that hangs silently is the one outcome worse than a refusal. */
const SAVE_TIMEOUT_MS = 5000;

export class Creator {
  private look: Look | null = null;
  private mode: "create" | "wardrobe" = "create";
  private owned: ReadonlySet<number> = new Set(STARTER_GRANT_SETS);
  private saving = false;
  private error: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scroll = 0;

  constructor(private root: HTMLElement, private host: CreatorHost) {}

  get isOpen(): boolean {
    return this.look !== null;
  }

  /** `figure` is what the player is wearing right now, so the panel opens on their own look. Its
   *  sets are owned by definition — the server accepted them — which is how an account that earned
   *  more than the starter grant avoids being told its own coat is locked. */
  open(figure: string, mode: "create" | "wardrobe"): void {
    this.mode = mode;
    this.saving = false;
    this.error = null;
    this.scroll = 0;
    try {
      this.look = figureToLook(figure);
      this.owned = new Set([
        ...STARTER_GRANT_SETS,
        ...parseFigure(figure).parts.map((p) => p.set),
      ]);
    } catch {
      // An unreadable figure must not lock the player out of their own wardrobe.
      this.look = figureToLook(`v${FIGUREDATA_VERSION}|hd-2-skin_3`);
      this.owned = new Set(STARTER_GRANT_SETS);
      this.error = "We could not read your saved look, so this starts from the house default.";
    }
    this.render();
  }

  close(): void {
    this.clearTimer();
    this.look = null;
    this.saving = false;
    this.error = null;
    this.root.classList.remove("open");
    this.root.replaceChildren();
    this.host.onClose();
  }

  /** The server refused the outfit (error code `figure`). The panel keeps every pick and says
   *  which pieces are the problem — a toast here would throw the answer away. */
  rejected(message: string): void {
    if (!this.isOpen) return;
    this.clearTimer();
    this.saving = false;
    this.error = message;
    this.render();
  }

  /** Our own set_figure came back applied. */
  confirmed(): void {
    if (!this.saving) return;
    this.close();
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private update(patch: Partial<Look>): void {
    if (!this.look) return;
    if (patch.tab !== undefined && patch.tab !== this.look.tab) this.scroll = 0;
    this.look = { ...this.look, ...patch };
    this.render();
  }

  private confirm(): void {
    if (!this.look || this.saving) return;
    this.saving = true;
    this.error = null;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.saving = false;
      this.error = "The server did not answer. Your look is unchanged — try again.";
      this.render();
    }, SAVE_TIMEOUT_MS);
    this.host.send(serializeFigure(lookToFigure(this.look)));
    this.render();
  }

  /** Swap every locked piece for one the account owns, keeping the rest of the look. Hair, hat and
   *  facial hair fall back to nothing; the head, top and legs fall back to the first owned set,
   *  because a figure with no head does not parse and a naked one is not what they asked for. */
  private dropLocked(): void {
    const look = this.look;
    if (!look) return;
    const first = (type: LayerType, current: number): number =>
      this.owned.has(current) ? current : setsOfType(type).find((s) => this.owned.has(s.id))?.id ?? 0;
    const optional = (current: number): number => (this.owned.has(current) ? current : 0);
    this.update({
      faceSetId: first("hd", look.faceSetId),
      beardSetId: optional(look.beardSetId),
      hair: optional(look.hair),
      top: first("ch", look.top),
      legs: first("lg", look.legs),
      hat: optional(look.hat),
    });
  }

  private render(): void {
    const look = this.look;
    if (!look) return;
    const locked = lockedPicks(look, this.owned);
    this.root.classList.add("open");
    this.root.replaceChildren(
      this.header(),
      this.body(look),
      ...(this.error === null && locked.length === 0 ? [] : [this.problem(locked)]),
      this.footer(),
    );
  }

  private header(): HTMLElement {
    const header = document.createElement("header");
    const brand = document.createElement("span");
    brand.className = "brand";
    brand.textContent = "The Grand";
    const sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = this.mode === "create" ? "Create your look" : "Wardrobe";
    const grant = document.createElement("span");
    grant.className = "grant";
    grant.textContent = "your wardrobe is the starter grant — earn the rest inside";
    header.append(brand, sub, grant);
    return header;
  }

  private body(look: Look): HTMLElement {
    const main = document.createElement("main");
    main.append(this.preview(look), this.picker(look));
    return main;
  }

  private preview(look: Look): HTMLElement {
    const card = document.createElement("section");
    card.className = "preview";

    const stage = document.createElement("div");
    stage.className = "stage";
    stage.appendChild(this.thumb(lookToFigure(look), CROP.preview, look.dir));

    const turn = document.createElement("div");
    turn.className = "turn";
    const dir = document.createElement("span");
    dir.className = "dir";
    dir.textContent = `dir ${look.dir}`;
    turn.append(
      button("⟲ turn", () => this.update({ dir: (look.dir + DIRS - 1) % DIRS })),
      dir,
      button("turn ⟳", () => this.update({ dir: (look.dir + 1) % DIRS })),
      button("🎲 Randomize", () => this.update(randomLook(look, this.owned)), "dice"),
    );

    const figure = document.createElement("code");
    figure.className = "figure";
    figure.textContent = serializeFigure(lookToFigure(look));

    card.append(stage, turn, figure);
    return card;
  }

  private picker(look: Look): HTMLElement {
    const picker = document.createElement("section");
    picker.className = "picker";

    const tabs = document.createElement("nav");
    tabs.className = "tabs";
    for (const tab of TABS) {
      tabs.appendChild(button(tab, () => this.update({ tab }), look.tab === tab ? "on" : ""));
    }

    const content = document.createElement("div");
    content.className = "content";
    content.addEventListener("scroll", () => (this.scroll = content.scrollTop));
    if (this.host.baker() === null) {
      const missing = document.createElement("div");
      missing.className = "note";
      missing.textContent =
        "The figure art did not load, so the previews are blank. Every pick still works.";
      content.appendChild(missing);
    }
    for (const group of this.groups(look)) content.appendChild(group);
    // A rebuild resets scrollTop, which would throw the player back to the top of the tab on
    // every colour click.
    queueMicrotask(() => (content.scrollTop = this.scroll));

    picker.append(tabs, content);
    return picker;
  }

  private groups(look: Look): HTMLElement[] {
    const cards = (items: Card[], current: number, crop: Crop, pick: (id: number) => void) =>
      this.cards(items, current, crop, pick);
    const swatches = (family: ColorFamily, current: string, pick: (ramp: string) => void) =>
      this.swatches(family, current, pick);

    switch (look.tab) {
      case "Skin":
        return [group("Skin ramp — head and body inherit together",
          swatches("skin", look.skin, (skin) => this.update({ skin })),
          "bd is implicit: it always wears hd's skin ramp, so the neck can never mismatch.")];

      case "Face": {
        const faces = setsOfType("hd").map((s) => ({
          id: s.id, name: s.name,
          figure: figureOf({ ...look, faceSetId: s.id, beardSetId: 0 }, []),
        }));
        const beards = [{ id: 0, name: "None" }, ...setsOfType("fa")].map((s) => ({
          id: s.id, name: s.name,
          figure: figureOf({ ...look, beardSetId: s.id }, ["fa"]),
        }));
        return [
          group("Face — curated hd sets",
            cards(faces, look.faceSetId, CROP.face, (faceSetId) => this.update({ faceSetId }))),
          ...(hasIris(look.faceSetId)
            ? [group("Iris — slot 1", swatches("iris", look.iris, (iris) => this.update({ iris })))]
            : []),
          // Every fa set shares the chin slot, so the mask is in this row too — one at a time.
          group("Facial hair — the fa slot, in your hair colour",
            cards(beards, look.beardSetId, CROP.face, (beardSetId) =>
              this.update({ beardSetId }))),
        ];
      }

      case "Hair": {
        const hairs = [{ id: 0, name: "Bare" }, ...setsOfType("hr")].map((s) => ({
          id: s.id, name: s.name,
          figure: figureOf({ ...look, hair: s.id, hat: 0 }, ["hr"]),
        }));
        return [
          group("Hair", cards(hairs, look.hair, CROP.hair, (hair) => this.update({ hair }))),
          group("Hair colour",
            swatches("material", look.hairColor, (hairColor) => this.update({ hairColor }))),
        ];
      }

      case "Top": {
        const tops = setsOfType("ch").map((s) => ({
          id: s.id, name: s.name, figure: figureOf({ ...look, top: s.id }, ["ch"]),
        }));
        const trim = setById(look.top)?.slots === 2;
        return [
          group("Top", cards(tops, look.top, CROP.top, (top) => this.update({ top }))),
          group("Colour — slot 0", swatches("material", look.topColors[0], (c) =>
            this.update({ topColors: [c, look.topColors[1]] }))),
          ...(trim
            ? [group("Trim — slot 1", swatches("material", look.topColors[1], (c) =>
              this.update({ topColors: [look.topColors[0], c] })))]
            : []),
        ];
      }

      case "Legs": {
        const legs = setsOfType("lg").map((s) => ({
          id: s.id, name: s.name, figure: figureOf({ ...look, legs: s.id }, ["lg"]),
        }));
        return [
          group("Legs", cards(legs, look.legs, CROP.legs, (id) => this.update({ legs: id }))),
          group("Colour",
            swatches("material", look.legsColor, (legsColor) => this.update({ legsColor }))),
        ];
      }

      case "Shoes": {
        // One shoe in the library, so the tab is a colour picker with the pair drawn above it.
        const shoes = { id: SHOES_SET, name: setById(SHOES_SET)?.name ?? "Shoes",
          figure: figureOf(look, ["sh"]) };
        return [
          group("Shoes", cards([shoes], SHOES_SET, CROP.shoes, () => {})),
          group("Colour",
            swatches("material", look.shoesColor, (shoesColor) => this.update({ shoesColor }))),
        ];
      }

      case "Hat": {
        const hats = [{ id: 0, name: "No hat" }, ...setsOfType("ha")].map((s) => ({
          id: s.id, name: s.name, figure: figureOf({ ...look, hat: s.id }, ["ha", "hr"]),
        }));
        return [
          group("Hat — hides hair while it is on",
            cards(hats, look.hat, CROP.hat, (hat) => this.update({ hat }))),
          group("Hat colour",
            swatches("material", look.hatColor, (hatColor) => this.update({ hatColor }))),
        ];
      }
    }
  }

  private swatches(
    family: ColorFamily, current: string, pick: (ramp: string) => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "swatches";
    const baker = this.host.baker();
    for (const ramp of paletteFor(family)) {
      const chip = button("", () => pick(ramp), current === ramp ? "on" : "");
      chip.title = ramp;
      const mid = baker?.rampColor(ramp);
      chip.style.background = mid === undefined ? "#10121a" : `#${mid.toString(16).padStart(6, "0")}`;
      row.appendChild(chip);
    }
    return row;
  }

  private cards(
    items: Card[], current: number, crop: Crop, pick: (id: number) => void,
  ): HTMLElement {
    const row = document.createElement("div");
    row.className = "cards";
    for (const item of items) {
      const locked = item.id !== 0 && !this.owned.has(item.id);
      const card = document.createElement("button");
      card.type = "button";
      card.className = item.id === current ? "on" : "";
      if (locked) card.title = "not yours yet — you can look, but The Grand will not let you wear it";
      const name = document.createElement("span");
      name.className = locked ? "locked" : "";
      name.textContent = locked ? `🔒 ${item.name}` : item.name;
      card.append(this.thumb(item.figure, crop, CARD_DIR), name);
      card.addEventListener("click", () => pick(item.id));
      row.appendChild(card);
    }
    return row;
  }

  /** One crop of a baked cell, at nearest-neighbour. A blank tile stands in when the bundles are
   *  missing or the stack drew nothing — never a plausible-looking stand-in. */
  private thumb(figure: Figure, crop: Crop, dir: number): HTMLElement {
    const w = crop.w * crop.scale;
    const h = crop.h * crop.scale;
    const source = this.host.baker()?.canvas(figure, "stand", dir);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!source || !ctx) {
      const blank = document.createElement("div");
      blank.className = "blank";
      blank.style.width = `${w}px`;
      blank.style.height = `${h}px`;
      blank.textContent = "no art";
      return blank;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, crop.x, crop.y, crop.w, crop.h, 0, 0, w, h);
    return canvas;
  }

  private problem(locked: FigureSet[]): HTMLElement {
    const box = document.createElement("div");
    box.className = "problem";
    const title = document.createElement("b");
    title.textContent = locked.length === 0
      ? "The Grand did not take that look"
      : "Some of these pieces are not yours yet";
    box.appendChild(title);

    if (locked.length > 0) {
      const list = document.createElement("span");
      list.textContent = `Locked: ${locked.map((s) => s.name).join(", ")}. `
        + "You can wear them once you earn them. Everything else is ready to go.";
      box.appendChild(list);
    }
    if (this.error !== null) {
      const why = document.createElement("span");
      why.className = "why";
      why.textContent = `server: ${this.error}`;
      box.appendChild(why);
    }
    if (locked.length > 0) {
      box.appendChild(button("Swap them for pieces you own", () => this.dropLocked()));
    }
    return box;
  }

  private footer(): HTMLElement {
    const footer = document.createElement("footer");
    const hint = document.createElement("span");
    hint.className = "hint";
    hint.textContent = this.mode === "create"
      ? "This same panel is your wardrobe — reopen it in-room from the 👕 tab."
      : "Changes apply the moment you press Wear it.";
    const back = button(this.mode === "create" ? "Not now" : "Close", () => this.close());
    const go = button(
      this.saving ? "Saving…" : this.mode === "create" ? "Enter The Grand →" : "Wear it",
      () => this.confirm(),
      "go",
    );
    go.disabled = this.saving;
    footer.append(hint, back, go);
    return footer;
  }
}

function button(text: string, run: () => void, className = ""): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.className = className;
  el.textContent = text;
  el.addEventListener("click", run);
  return el;
}

function group(name: string, body: HTMLElement, note?: string): HTMLElement {
  const box = document.createElement("div");
  box.className = "group";
  const heading = document.createElement("h3");
  heading.textContent = name;
  box.append(heading, body);
  if (note !== undefined) {
    const hint = document.createElement("span");
    hint.className = "note";
    hint.textContent = note;
    box.appendChild(hint);
  }
  return box;
}
