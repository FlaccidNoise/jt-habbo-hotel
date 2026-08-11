import { describe, expect, test } from "vitest";
import {
  STARTER_GRANT_SETS, WEARABLE_PRICES, parseFigure, serializeFigure, setById,
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

  test("cosmetics no tab owns survive a confirm", () => {
    // A coat is earned, and the panel has no Coat tab. Dropping it on save would delete it.
    const worn = `${STARTER}.cc-11-plum-gold`;
    expect(serializeFigure(lookToFigure(figureToLook(worn)))).toBe(canonical(worn));
  });

  test("clearing hair and hat drops those parts rather than writing set 0", () => {
    const look = { ...figureToLook(STARTER), hair: 0, hat: 0 };
    const figure = serializeFigure(lookToFigure(look));
    expect(figure).not.toContain("hr-");
    expect(figure).not.toContain("ha-");
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

  test("the staff uniform is not offered at all", () => {
    expect(setsOfType("ch").map((s) => s.id)).toEqual([5, 6]);
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

  test("colours come from the palette of each slot's own family", () => {
    const look = randomLook(figureToLook(STARTER), OWNED, () => 0.99);
    expect(look.skin).toBe("skin_6");
    expect(look.iris).toBe("navy");
    expect(look.hairColor).toBe("charcoal");
  });
});
