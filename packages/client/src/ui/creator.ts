import {
  FIGUREDATA_VERSION,
  FIGURE_SETS,
  STAFF_GRANT_SETS,
  STARTER_GRANT_SETS,
  WEARABLE_PRICES,
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

/** Where a garment of each type is cropped on its card. The shop sells exactly what the wardrobe
 *  wears (#352), so a shelf thumbnail is the same crop of the same bake. */
const TYPE_CROP: Partial<Record<LayerType, Crop>> = {
  hd: CROP.face, fa: CROP.face, hr: CROP.hair, ch: CROP.top, cc: CROP.top,
  lg: CROP.legs, wa: CROP.legs, sh: CROP.shoes, ha: CROP.hat, ea: CROP.face, ca: CROP.top,
};

/** A ramp every slot of `set` can legally wear — the house skin for a skin slot, charcoal for the
 *  rest, which is in both the material and the iris palettes. */
function plainColors(set: FigureSet): string[] {
  return Array.from({ length: set.slots }, (_, i) =>
    (set.slotFamilies?.[i] ?? set.family) === "skin" ? "skin_3" : "charcoal");
}

/** A shop thumbnail for one purchasable set: the garment on the house default head, cropped to
 *  where it sits. The catalog draws its wearable shelf with this rather than a furni sheet. */
export function wearableThumb(baker: FigureBaker | null, setId: number): HTMLElement {
  const set = setById(setId);
  if (!set) return thumbOf(null, { version: FIGUREDATA_VERSION, parts: [] }, CROP.hair, CARD_DIR);
  const head: WornPart = { type: "hd", set: 2, colors: ["skin_3"] };
  const worn: WornPart = { type: set.type, set: setId, colors: plainColors(set) };
  const parts = set.type === "hd" ? [worn] : [head, worn];
  return thumbOf(baker, { version: FIGUREDATA_VERSION, parts },
    TYPE_CROP[set.type] ?? CROP.hair, CARD_DIR);
}

/** One crop of a baked cell, at nearest-neighbour. A blank tile stands in when the bundles are
 *  missing or the stack drew nothing — never a plausible-looking stand-in. */
function thumbOf(
  baker: FigureBaker | null, figure: Figure, crop: Crop, dir: number,
): HTMLElement {
  const w = crop.w * crop.scale;
  const h = crop.h * crop.scale;
  const source = baker?.canvas(figure, "stand", dir);
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
  shoes: number;
  shoesColor: string;
  hat: number;          // 0 = bare-headed
  hatColor: string;
  extras: WornPart[];
}

export function figureToLook(input: string): Look {
  const worn = new Map(parseFigure(input).parts.map((p) => [p.type, p]));
  const head = worn.get("hd");
  const of = (type: LayerType, slot: number, fallback: string): string =>
    worn.get(type)?.colors[slot] ?? fallback;
  return {
    dir: 3,
    tab: "Face",
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
    shoes: worn.get("sh")?.set ?? SHOES_SET,
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
  wear("sh", look.shoes, [look.shoesColor]);
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

export interface Offer {
  set: FigureSet;
  price: number;
  /** Stars still needed, 0 once the account can afford it. */
  short: number;
}

/** The locked picks that are actually for sale, priced against a balance (#352). A locked piece
 *  with no price has no way in yet, so it is not an offer — a buy button that could only fail is
 *  worse than no button at all. */
export function offersFor(locked: readonly FigureSet[], stars: number): Offer[] {
  return locked.flatMap((set) => {
    const price = WEARABLE_PRICES.get(set.id);
    return price === undefined ? [] : [{ set, price, short: Math.max(0, price - stars) }];
  });
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
    shoes: ownedOf("sh") || look.shoes,
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
  /** Read at render time, so the buy buttons price against the balance as it stands. */
  stars: () => number;
  buySet: (setId: number) => void;
  onClose: () => void;
}

/** How long to wait for the server's verdict before telling the player it never came. A confirm
 *  that hangs silently is the one outcome worse than a refusal. */
const SAVE_TIMEOUT_MS = 5000;

export class Creator {
  private look: Look | null = null;
  private mode: "create" | "wardrobe" = "create";
  /** What the server says the account owns. The starter grant until the first `wardrobe` message
   *  lands, which is the same guess the panel made before it had one to read. */
  private granted: ReadonlySet<number> = new Set(STARTER_GRANT_SETS);
  /** The sets on the player's back when the panel opened — owned by definition, since the server
   *  accepted them, and the reason an old account is never told its own coat is locked. */
  private worn: readonly number[] = [];
  private owned: ReadonlySet<number> = new Set(STARTER_GRANT_SETS);
  private saving = false;
  private buying: number | null = null;
  private error: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private scroll = 0;

  constructor(private root: HTMLElement, private host: CreatorHost) {}

  get isOpen(): boolean {
    return this.look !== null;
  }

  /** `figure` is what the player is wearing right now, so the panel opens on their own look. */
  open(figure: string, mode: "create" | "wardrobe"): void {
    this.mode = mode;
    this.saving = false;
    this.buying = null;
    this.error = null;
    this.scroll = 0;
    try {
      this.look = figureToLook(figure);
      this.worn = parseFigure(figure).parts.map((p) => p.set);
    } catch {
      // An unreadable figure must not lock the player out of their own wardrobe.
      this.look = figureToLook(`v${FIGUREDATA_VERSION}|hd-2-skin_3`);
      this.worn = [];
      this.error = "We could not read your saved look, so this starts from the house default.";
    }
    this.recomputeOwned();
    this.render();
    // Take the keyboard: chat holds focus otherwise, which makes the window handler treat every
    // key as typing — Escape dead, keystrokes landing in the room behind the panel.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    this.root.tabIndex = -1;
    this.root.focus();
  }

  close(): void {
    this.clearTimer();
    this.look = null;
    this.saving = false;
    this.buying = null;
    this.error = null;
    this.root.classList.remove("open");
    this.root.replaceChildren();
    this.host.onClose();
  }

  /** The account's real wardrobe (#352): the grant plus everything it has bought. It arrives on
   *  join and again after every purchase, so a bought set unlocks its own card here. */
  setWardrobe(ids: Iterable<number>): void {
    this.granted = new Set(ids);
    if (this.buying !== null) {
      this.buying = null;
      this.clearTimer();
    }
    this.recomputeOwned();
    if (this.isOpen) this.render();
  }

  /** The balance moved, and with it what the buy buttons can afford. */
  refresh(): void {
    if (this.isOpen) this.render();
  }

  /** The server refused the outfit (error code `figure`) or the purchase (`purchase`). The panel
   *  keeps every pick and says what the problem is — a toast here would throw the answer away. */
  rejected(message: string): void {
    if (!this.isOpen) return;
    this.clearTimer();
    this.saving = false;
    this.buying = null;
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

  private recomputeOwned(): void {
    this.owned = new Set([...this.granted, ...this.worn]);
  }

  private update(patch: Partial<Look>): void {
    if (!this.look) return;
    if (patch.tab !== undefined && patch.tab !== this.look.tab) this.scroll = 0;
    this.look = { ...this.look, ...patch };
    this.render();
  }

  /** Buy one locked set. The verdict comes back as a `wardrobe` message that unlocks the card, or
   *  as a `purchase` error this panel shows in place — never as a toast behind it. */
  private buy(setId: number): void {
    if (!this.look || this.saving || this.buying !== null) return;
    this.buying = setId;
    this.error = null;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.buying = null;
      this.error = "The server did not answer. Nothing was bought — try again.";
      this.render();
    }, SAVE_TIMEOUT_MS);
    this.host.buySet(setId);
    this.render();
  }

  private confirm(): void {
    if (!this.look || this.saving || this.buying !== null) return;
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
    grant.textContent = "the starter grant, plus whatever you buy with Stars";
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
    stage.appendChild(thumbOf(this.host.baker(), lookToFigure(look), CROP.preview, look.dir));

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
    switch (look.tab) {
      case "Skin":
        return [group("Skin ramp — head and body inherit together",
          this.swatches("skin", look.skin, (skin) => this.update({ skin })),
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
            this.cards(faces, look.faceSetId, CROP.face, (faceSetId) => this.update({ faceSetId }))),
          ...(hasIris(look.faceSetId)
            ? [group("Iris — slot 1", this.swatches("iris", look.iris, (iris) => this.update({ iris })))]
            : []),
          // Every fa set shares the chin slot, so the mask is in this row too — one at a time.
          group("Facial hair — the fa slot, in your hair colour",
            this.cards(beards, look.beardSetId, CROP.face, (beardSetId) =>
              this.update({ beardSetId }))),
        ];
      }

      case "Hair": {
        const hairs = [{ id: 0, name: "Bare" }, ...setsOfType("hr")].map((s) => ({
          id: s.id, name: s.name,
          figure: figureOf({ ...look, hair: s.id, hat: 0 }, ["hr"]),
        }));
        return [
          group("Hair", this.cards(hairs, look.hair, CROP.hair, (hair) => this.update({ hair }))),
          group("Hair colour",
            this.swatches("material", look.hairColor, (hairColor) => this.update({ hairColor }))),
        ];
      }

      case "Top": {
        const tops = setsOfType("ch").map((s) => ({
          id: s.id, name: s.name, figure: figureOf({ ...look, top: s.id }, ["ch"]),
        }));
        const trim = setById(look.top)?.slots === 2;
        return [
          group("Top", this.cards(tops, look.top, CROP.top, (top) => this.update({ top }))),
          group("Colour — slot 0", this.swatches("material", look.topColors[0], (c) =>
            this.update({ topColors: [c, look.topColors[1]] }))),
          ...(trim
            ? [group("Trim — slot 1", this.swatches("material", look.topColors[1], (c) =>
              this.update({ topColors: [look.topColors[0], c] })))]
            : []),
        ];
      }

      case "Legs": {
        const legs = setsOfType("lg").map((s) => ({
          id: s.id, name: s.name, figure: figureOf({ ...look, legs: s.id }, ["lg"]),
        }));
        return [
          group("Legs", this.cards(legs, look.legs, CROP.legs, (id) => this.update({ legs: id }))),
          group("Colour",
            this.swatches("material", look.legsColor, (legsColor) => this.update({ legsColor }))),
        ];
      }

      case "Shoes": {
        const shoes = setsOfType("sh").map((s) => ({
          id: s.id, name: s.name, figure: figureOf({ ...look, shoes: s.id }, ["sh"]),
        }));
        return [
          group("Shoes", this.cards(shoes, look.shoes, CROP.shoes, (id) => this.update({ shoes: id }))),
          group("Colour",
            this.swatches("material", look.shoesColor, (shoesColor) => this.update({ shoesColor }))),
        ];
      }

      case "Hat": {
        const hats = [{ id: 0, name: "No hat" }, ...setsOfType("ha")].map((s) => ({
          id: s.id, name: s.name, figure: figureOf({ ...look, hat: s.id }, ["ha", "hr"]),
        }));
        return [
          group("Hat — hides hair while it is on",
            this.cards(hats, look.hat, CROP.hat, (hat) => this.update({ hat }))),
          group("Hat colour",
            this.swatches("material", look.hatColor, (hatColor) => this.update({ hatColor }))),
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
      // A locked set with a price is for sale (#352): the card still previews it on the avatar,
      // and the buy button lands below with the rest of the locked picks.
      const price = locked ? WEARABLE_PRICES.get(item.id) : undefined;
      const card = document.createElement("button");
      card.type = "button";
      card.className = item.id === current ? "on" : "";
      if (locked) {
        card.title = price === undefined
          ? "not yours yet — you can look, but The Grand will not let you wear it"
          : `${item.name} costs ${price} ★ — try it on, then buy it below`;
      }
      const name = document.createElement("span");
      name.className = locked ? "locked" : "";
      name.textContent = !locked ? item.name
        : price === undefined ? `🔒 ${item.name}` : `🔒 ${item.name} · ${price}★`;
      card.append(thumbOf(this.host.baker(), item.figure, crop, CARD_DIR), name);
      card.addEventListener("click", () => pick(item.id));
      row.appendChild(card);
    }
    return row;
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
        + "You can wear them once they are yours. Everything else is ready to go.";
      box.appendChild(list);
    }
    if (this.error !== null) {
      const why = document.createElement("span");
      why.className = "why";
      why.textContent = `server: ${this.error}`;
      box.appendChild(why);
    }
    for (const offer of offersFor(locked, this.host.stars())) {
      const label = this.buying === offer.set.id
        ? `Buying ${offer.set.name}…`
        : offer.short > 0
          ? `${offer.set.name} — ${offer.price} ★ (${offer.short} short)`
          : `Buy ${offer.set.name} — ${offer.price} ★`;
      const buy = button(label, () => this.buy(offer.set.id), "buy");
      buy.disabled = offer.short > 0 || this.buying !== null || this.saving;
      box.appendChild(buy);
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
