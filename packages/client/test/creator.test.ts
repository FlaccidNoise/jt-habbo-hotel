import { describe, expect, test } from "vitest";
import {
  FIGURE_SETS, SELECTABLE_TYPES, STARTER_GRANT_SETS, WEARABLE_PRICES, paletteFor, parseFigure,
  resolveLayers, serializeFigure, setById,
} from "@grand/shared";
import {
  figureToLook, lockedPicks, lookToFigure, offersFor, randomLook, setsOfType,
} from "../src/ui/creator.ts";

// The creator's state is the panel's whole contract with the server: whatever the tabs put in it
// has to come back out as a figure string the server accepts. These are the DOM-free halves.

const OWNED: ReadonlySet<number> = new Set(STARTER_GRANT_SETS);
const STARTER = "v1|hd-2-skin_3.hr-3-charcoal.ch-6-crimson-ivory.lg-7-navy.sh-9-charcoal";
/** Both ends normalise to LAYER_ORDER, so that — not the order it was typed in — is the string a
 *  round trip has to reproduce. */
const canonical = (figure: string): string => serializeFigure(parseFigure(figure));

/** One legal part per selectable type, built from the registry rather than typed out, so a layer
 *  type that ships a set with no tab behind it fails here instead of being dropped on save. */
const ONE_OF_EACH = `v1|${SELECTABLE_TYPES.map((type) => {
  const set = FIGURE_SETS.find((s) => s.type === type && !s.retired)!;
  const colors = Array.from({ length: set.slots }, (_, i) =>
    paletteFor(set.slotFamilies?.[i] ?? set.family)[0]);
  return [type, set.id, ...colors].join("-");
}).join(".")}`;

describe("look ↔ figure", () => {
  test("a worn figure round-trips through the panel unchanged", () => {
    expect(serializeFigure(lookToFigure(figureToLook(STARTER)))).toBe(canonical(STARTER));
  });

  test("every look the panel can hold is a figure the server can parse", () => {
    const look = figureToLook(STARTER);
    for (const face of setsOfType("hd")) {
      const figure = serializeFigure(lookToFigure({ ...look, faceSetId: face.id }));
      expect(() => parseFigure(figure)).not.toThrow();
    }
  });

  test("a face set carries the iris in slot 1, the plain head carries only skin", () => {
    const look = figureToLook(STARTER);
    expect(serializeFigure(lookToFigure({ ...look, faceSetId: 19, iris: "teal" })))
      .toContain("hd-19-skin_3-teal");
    expect(serializeFigure(lookToFigure({ ...look, faceSetId: 2 }))).toContain("hd-2-skin_3");
  });

  test("every selectable layer survives a confirm — the panel drops nothing (#439)", () => {
    expect(serializeFigure(lookToFigure(figureToLook(ONE_OF_EACH)))).toBe(canonical(ONE_OF_EACH));
  });

  test("the coat, spectacles, pendant and belt come back with their own colours", () => {
    const worn = `${STARTER}.cc-11-plum-gold.ea-12-teal.ca-14-gold.wa-15-walnut`;
    expect(serializeFigure(lookToFigure(figureToLook(worn)))).toBe(canonical(worn));
  });

  test("a figure wearing none of the optional layers round-trips without gaining them", () => {
    const figure = serializeFigure(lookToFigure(figureToLook(STARTER)));
    for (const type of ["cc", "ea", "ca", "wa"]) expect(figure).not.toContain(`${type}-`);
  });

  // The preview bakes lookToFigure(look) through resolveLayers, so what the coat hides is decided
  // here rather than by anything the panel draws.
  test("wearing a coat takes the top out of the drawn stack, and taking it off puts it back", () => {
    const look = { ...figureToLook(STARTER), top: 6 };
    const drawn = (l: typeof look): string[] => resolveLayers(lookToFigure(l)).map((p) => p.type);
    expect(drawn({ ...look, coat: 11 })).toContain("cc");
    expect(drawn({ ...look, coat: 11 })).not.toContain("ch");
    expect(drawn({ ...look, coat: 0 })).toContain("ch");
  });

  test("clearing an optional layer drops the part rather than writing set 0", () => {
    const look = {
      ...figureToLook(ONE_OF_EACH),
      hair: 0, hat: 0, coat: 0, eyewear: 0, neck: 0, waist: 0,
    };
    const figure = serializeFigure(lookToFigure(look));
    for (const type of ["hr", "ha", "cc", "ea", "ca", "wa"]) {
      expect(figure).not.toContain(`${type}-`);
    }
    expect(() => parseFigure(figure)).not.toThrow();
  });
});

describe("what the account may wear", () => {
  test("the starter grant wears its own default look", () => {
    expect(lockedPicks(figureToLook(STARTER), OWNED)).toEqual([]);
  });

  test("every face is wearable: they are in the starter grant (#346)", () => {
    expect(lockedPicks({ ...figureToLook(STARTER), faceSetId: 19 }, OWNED)).toEqual([]);
  });

  test("an earned set is named as locked, by name, before the server has to say so", () => {
    const locked = lockedPicks({ ...figureToLook(STARTER), hair: 30 }, OWNED);
    expect(locked.map((s) => s.name)).toEqual(["Curls"]);
  });

  // Named as a rule rather than a list: a garment pack adds ch sets (#440 took it from two to
  // nine), and what has to hold is the same however many there are — every ch set except the
  // staff blazer 16 is on offer, and 16 never is.
  test("the staff uniform is not offered at all", () => {
    const offered = setsOfType("ch").map((s) => s.id);
    expect(offered).not.toContain(16);
    expect(offered).toEqual(
      FIGURE_SETS.filter((s) => s.type === "ch" && !s.retired && s.id !== 16).map((s) => s.id),
    );
  });
});

// Buying a locked piece (#352). The panel turns a lock into a price and a button; what it must
// never do is offer a button that could only fail.
describe("what a locked piece costs", () => {
  const CURLS = setById(30)!;    // 350 ★
  const BUZZ = setById(32)!;     // 150 ★
  const COAT = setById(11)!;     // earned, unpriced — no acquisition path yet (#425)

  test("a locked hair is offered at its shelf price", () => {
    expect(offersFor([CURLS], 1000)).toEqual([{ set: CURLS, price: 350, short: 0 }]);
  });

  test("a locked piece with no price is not offered at all", () => {
    expect(offersFor([COAT], 1000)).toEqual([]);
    expect(offersFor([COAT, BUZZ], 1000).map((o) => o.set.id)).toEqual([32]);
  });

  test("too few Stars still offers the piece, and says how short you are", () => {
    expect(offersFor([CURLS], 100)[0]).toEqual({ set: CURLS, price: 350, short: 250 });
  });

  test("exactly the price is not short", () => {
    expect(offersFor([CURLS], 350)[0]?.short).toBe(0);
    expect(offersFor([CURLS], 349)[0]?.short).toBe(1);
  });

  test("an empty balance offers the whole shelf, none of it affordable", () => {
    const hair = [...WEARABLE_PRICES.keys()].map((id) => setById(id)!);
    const offers = offersFor(hair, 0);
    expect(offers.length).toBe(WEARABLE_PRICES.size);
    expect(offers.every((o) => o.short === o.price)).toBe(true);
  });

  // Owning it is what ends the offer: a bought set stops being a locked pick, so nothing has to
  // filter the shelf a second time.
  test("a set the account owns is never locked, so it is never offered again", () => {
    const wearing = { ...figureToLook(STARTER), hair: 30 };
    const bought: ReadonlySet<number> = new Set([...STARTER_GRANT_SETS, 30]);
    expect(lockedPicks(wearing, bought)).toEqual([]);
    expect(offersFor(lockedPicks(wearing, bought), 1000)).toEqual([]);
  });
});

describe("randomize", () => {
  test("only ever picks sets the account owns", () => {
    const look = figureToLook(STARTER);
    // Walk the whole unit interval: every branch of every pick, including the hat and beard rolls.
    for (let i = 0; i < 100; i++) {
      const rolled = randomLook(look, OWNED, () => i / 100);
      expect(lockedPicks(rolled, OWNED)).toEqual([]);
      expect(() => parseFigure(serializeFigure(lookToFigure(rolled)))).not.toThrow();
    }
  });

  // The optional layers are the only picks that can already be locked when the dice are rolled:
  // nothing in the starter grant is a coat, so a coat on the avatar came from a card the panel let
  // the player try on.
  test("a locked coat is rolled away, not carried through", () => {
    const wearing = { ...figureToLook(STARTER), coat: 11 };
    expect(lockedPicks(wearing, OWNED).map((s) => s.name)).toEqual(["Overcoat"]);
    for (let i = 0; i < 100; i++) {
      expect(lockedPicks(randomLook(wearing, OWNED, () => i / 100), OWNED)).toEqual([]);
    }
  });

  test("colours come from the palette of each slot's own family", () => {
    const look = randomLook(figureToLook(STARTER), OWNED, () => 0.99);
    expect(look.skin).toBe("skin_6");
    expect(look.iris).toBe("navy");
    expect(look.hairColor).toBe("charcoal");
  });
});
