import { expect, test } from "vitest";
import { z } from "zod";
import { FurniDefSchema } from "../src/protocol.ts";
import { CATALOG_PRICES, PROTOTYPE_CATALOG } from "../src/furni.ts";

test("the catalog validates against the wire schema", () =>
  expect(z.array(FurniDefSchema).safeParse(PROTOTYPE_CATALOG).success).toBe(true));
test("catalog ids are unique", () =>
  expect(new Set(PROTOTYPE_CATALOG.map((d) => d.id)).size).toBe(PROTOTYPE_CATALOG.length));

// Both price lookups fail closed: the HUD hides the button, the server refuses the buy. A def
// without a price is therefore an item nobody can ever own, with no error anywhere.
test("every catalog def has a price", () =>
  expect(PROTOTYPE_CATALOG.filter((d) => !CATALOG_PRICES.has(d.id)).map((d) => d.id)).toEqual([]));
test("no price names a def that left the catalog", () =>
  expect([...CATALOG_PRICES.keys()].filter((id) => !PROTOTYPE_CATALOG.some((d) => d.id === id)))
    .toEqual([]));
