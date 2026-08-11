import { describe, expect, test } from "vitest";
import {
  FIGURE_SETS, LAYER_ORDER, SELECTABLE_TYPES, STAFF_GRANT_SETS, STARTER_GRANT_SETS,
  UNPURCHASABLE_SETS, WEARABLE_PRICES, setById,
} from "../src/figuredata.ts";
import { CATALOG_PRICES } from "../src/furni.ts";
import type { FigureSet } from "../src/figuredata.ts";
import {
  checkHideDirection, parseFigure, resolveLayers, resolvedKey, serializeFigure,
} from "../src/figure.ts";

const DRESSED = "v1|hd-2-skin_3.lg-7-navy.sh-9-charcoal.ch-6-crimson-ivory.hr-3-walnut";

describe("figure string", () => {
  test("round-trips, normalised into LAYER_ORDER", () => {
    const f = parseFigure(DRESSED);
    expect(f.version).toBe(1);
    expect(f.parts.map((p) => p.type)).toEqual(["hd", "lg", "sh", "ch", "hr"]);
    // Input order was hd, lg, sh, ch, hr — already ordered, so re-serialising is byte-identical.
    expect(serializeFigure(f)).toBe(DRESSED);
  });

  test("input order does not matter", () => {
    const scrambled = "v1|hr-3-walnut.ch-6-crimson-ivory.sh-9-charcoal.lg-7-navy.hd-2-skin_3";
    expect(serializeFigure(parseFigure(scrambled))).toBe(DRESSED);
  });

  test("a set declaring two slots carries two colours", () => {
    const f = parseFigure(DRESSED);
    expect(f.parts.find((p) => p.type === "ch")?.colors).toEqual(["crimson", "ivory"]);
  });

  test("a per-slot family set round-trips each slot through its own palette", () => {
    // Face set 17 (Bright): slot 0 is skin, slot 1 is the curated iris family.
    const withFace = "v1|hd-17-skin_3-charcoal.lg-7-navy.sh-9-charcoal.hr-3-walnut";
    const f = parseFigure(withFace);
    expect(f.parts.find((p) => p.type === "hd")?.colors).toEqual(["skin_3", "charcoal"]);
    expect(serializeFigure(f)).toBe(withFace);
  });
});

describe("figure string rejections", () => {
  // Every branch that can refuse input, one case each. The parser rejects; it never skips.
  const cases: Array<[string, string, RegExp]> = [
    ["no version prefix", "hd-2-skin_3", /no version prefix/],
    ["malformed version prefix", "x1|hd-2-skin_3", /malformed version prefix/],
    ["unknown figuredata version", "v9|hd-2-skin_3", /unknown figuredata version/],
    ["no parts", "v1|", /no parts/],
    ["malformed part", "v1|hd", /malformed part/],
    ["unknown type", "v1|hd-2-skin_3.zz-3-walnut", /unknown type: zz/],
    ["bd worn explicitly", "v1|hd-2-skin_3.bd-1-skin_3", /bd is implicit/],
    ["duplicate type", "v1|hd-2-skin_3.hr-3-walnut.hr-4-navy", /duplicate type: hr/],
    ["malformed set id", "v1|hd-2-skin_3.hr-abc-walnut", /malformed set id/],
    ["unknown set", "v1|hd-2-skin_3.hr-999-walnut", /unknown set: 999/],
    ["set id belongs to another type", "v1|hd-2-skin_3.hr-9-walnut", /set 9 is sh, not hr/],
    ["too few colours", "v1|hd-2-skin_3.ch-6-crimson", /set 6 takes 2 colour\(s\), got 1/],
    ["too many colours", "v1|hd-2-skin_3.ch-5-crimson-ivory", /set 5 takes 1 colour\(s\), got 2/],
    ["unknown ramp", "v1|hd-2-skin_3.hr-3-vantablack", /set 3 cannot wear ramp vantablack/],
    ["skin ramp on a garment", "v1|hd-2-skin_3.hr-3-skin_1", /set 3 cannot wear ramp skin_1/],
    ["material ramp on the head", "v1|hd-2-walnut", /set 2 cannot wear ramp walnut/],
    // Set 17 (Bright) is skin+iris per-slot: crimson is a real material ramp, just not one of the
    // curated iris six, so it must fail on the iris slot even though slot 0 (skin) is fine.
    ["off-curated ramp on a per-slot iris slot", "v1|hd-17-skin_3-crimson", /set 17 cannot wear ramp crimson/],
    ["no head", "v1|hr-3-walnut", /hd is required/],
  ];

  for (const [name, input, message] of cases) {
    test(name, () => expect(() => parseFigure(input)).toThrow(message));
  }

  test("a retired set is refused", () => {
    // Staged registry: retirement flags a garment, never deletes it, so the ID stays taken and
    // stored strings that reference it stop parsing rather than silently rendering something else.
    const retired: FigureSet = { ...setById(3)!, retired: true };
    const staged = (id: number) => (id === 3 ? retired : setById(id));
    expect(() => parseFigure("v1|hd-2-skin_3.hr-3-walnut", staged)).toThrow(/set 3 is retired/);
    expect(() => parseFigure("v1|hd-2-skin_3.hr-3-walnut")).not.toThrow();
  });
});

describe("layer resolution", () => {
  test("the implicit body wears the head's skin ramp", () => {
    const layers = resolveLayers(parseFigure(DRESSED));
    expect(layers[0]).toEqual({ type: "bd", set: 1, colors: ["skin_3"] });
    expect(layers[0]?.colors).toEqual(layers.find((l) => l.type === "hd")?.colors);
  });

  test("layers come back in LAYER_ORDER", () => {
    const layers = resolveLayers(parseFigure(DRESSED));
    const indices = layers.map((l) => LAYER_ORDER.indexOf(l.type));
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });

  test("a hat hides hair", () => {
    const bare = resolveLayers(parseFigure(DRESSED)).map((l) => l.type);
    expect(bare).toContain("hr");
    const hatted = resolveLayers(parseFigure(`${DRESSED}.ha-10-gold`)).map((l) => l.type);
    expect(hatted).toContain("ha");
    expect(hatted).not.toContain("hr");
  });

  test("a coat hides the shirt", () => {
    const coated = resolveLayers(parseFigure(`${DRESSED}.cc-11-navy-gold`)).map((l) => l.type);
    expect(coated).toContain("cc");
    expect(coated).not.toContain("ch");
  });

  test("the bake key ignores a hidden layer", () => {
    // A hat that hides hair must not produce two GPU textures depending on which hair is under it.
    const a = resolvedKey(parseFigure(`${DRESSED}.ha-10-gold`));
    const withOtherHair = DRESSED.replace("hr-3-walnut", "hr-4-navy");
    const b = resolvedKey(parseFigure(`${withOtherHair}.ha-10-gold`));
    expect(a).toBe(b);
    // ...but it must still distinguish outfits that differ where it shows.
    expect(a).not.toBe(resolvedKey(parseFigure(`${DRESSED}.ha-10-teal`)));
  });
});

describe("the wardrobe registry", () => {
  test("set IDs are unique", () => {
    const ids = FIGURE_SETS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("every type has a set, and only bd is unselectable", () => {
    expect(SELECTABLE_TYPES).not.toContain("bd");
    for (const type of LAYER_ORDER) {
      expect(FIGURE_SETS.some((s) => s.type === type), `no set for ${type}`).toBe(true);
    }
  });

  test("slotFamilies, when declared, names a family for every slot", () => {
    // A short array silently falls back to `family`, so hd-17-skin_3-skin_1 would validate and
    // paint the iris with a skin ramp.
    for (const s of FIGURE_SETS) {
      if (s.slotFamilies) {
        expect(s.slotFamilies.length, `set ${s.id} (${s.name})`).toBe(s.slots);
      }
    }
  });

  test("hides only ever points backwards, and never at the body", () => {
    expect(checkHideDirection()).toEqual([]);
  });

  test("a set hiding a type drawn later is rejected", () => {
    // Staged bad: a shirt (index 4) claiming to hide the hat (index 11). Forwards hiding is
    // incoherent — the hat is drawn on top of the shirt, so the shirt cannot remove it.
    const bad: FigureSet = { ...setById(5)!, hides: ["ha"] };
    expect(checkHideDirection([bad])).toEqual([
      "set 5 (ch) hides ha, drawn later",
    ]);
  });

  test("a set hiding the body is rejected", () => {
    const bad: FigureSet = { ...setById(10)!, hides: ["hd"] };
    expect(checkHideDirection([bad])).toEqual(["set 10 hides hd, which is the body"]);
  });

  test("grants name real, non-body sets", () => {
    for (const grant of [STARTER_GRANT_SETS, STAFF_GRANT_SETS]) {
      for (const id of grant) {
        const set = setById(id);
        expect(set, `set ${id} missing`).toBeDefined();
        expect(set?.type).not.toBe("bd");
        expect(set?.retired).toBe(false);
      }
    }
  });

  test("the starter grant dresses a legal figure and the staff blazer is not in it", () => {
    expect(STARTER_GRANT_SETS).toContain(2);          // head, required by the parser
    expect(STARTER_GRANT_SETS).toContain(10);         // the cap, so hides is exercised in play
    expect(STARTER_GRANT_SETS).toContain(17);         // an eyed face: a new player is not blank
    expect(STARTER_GRANT_SETS).not.toContain(16);     // staff blazer is never player-grantable
    expect(STARTER_GRANT_SETS).not.toContain(28);     // the hair expansion is earned (#352)
  });
});

// The wardrobe's half of the price ladder (#352), held to the same rule furni.test.ts holds
// CATALOG_PRICES to: a garment nobody can obtain is a bug, and an exemption has to be written down.
describe("the Stars shelf", () => {
  const grantable = (id: number): boolean =>
    STARTER_GRANT_SETS.includes(id) || STAFF_GRANT_SETS.includes(id);

  test("every set is grantable, priced, or explicitly unpurchasable with a reason", () =>
    expect(
      FIGURE_SETS.filter((s) => !grantable(s.id) && !WEARABLE_PRICES.has(s.id)
        && !UNPURCHASABLE_SETS.has(s.id)).map((s) => s.id),
      "price it into WEARABLE_PRICES or add the id to UNPURCHASABLE_SETS with a reason comment",
    ).toEqual([]));

  test("the hair expansion is the shelf: all ten, and only those", () =>
    expect([...WEARABLE_PRICES.keys()].sort((a, b) => a - b))
      .toEqual([28, 29, 30, 31, 32, 33, 34, 35, 36, 37]));

  test("nothing already granted is also for sale", () =>
    expect([...WEARABLE_PRICES.keys()].filter(grantable)).toEqual([]));

  test("no price names a set that left the registry, or one that retired", () => {
    for (const id of WEARABLE_PRICES.keys()) {
      const set = setById(id);
      expect(set, `set ${id} missing`).toBeDefined();
      expect(set?.retired, `set ${id} retired`).toBe(false);
    }
  });

  // A wearable priced above the furni band would read as a different currency, and one above the
  // 600 daily ceiling could not be bought in a day's play — hair is stock, not a prestige fixture.
  test("prices sit inside the furni band and under a day's earnings", () => {
    const furni = [...CATALOG_PRICES.values()];
    for (const [id, price] of WEARABLE_PRICES) {
      expect(price, `set ${id}`).toBeGreaterThanOrEqual(Math.min(...furni));
      expect(price, `set ${id}`).toBeLessThanOrEqual(600);
    }
  });

  test("the shelf is a ladder, cheapest first", () => {
    const prices = [...WEARABLE_PRICES.values()];
    expect(prices).toEqual([...prices].sort((a, b) => a - b));
  });
});
