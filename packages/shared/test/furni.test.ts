import { expect, test } from "vitest";
import { z } from "zod";
import { FurniDefSchema } from "../src/protocol.ts";
import { PROTOTYPE_CATALOG } from "../src/furni.ts";

test("the catalog validates against the wire schema", () =>
  expect(z.array(FurniDefSchema).safeParse(PROTOTYPE_CATALOG).success).toBe(true));
test("the catalog has exactly 5 entries", () => expect(PROTOTYPE_CATALOG).toHaveLength(5));
test("catalog ids are unique", () =>
  expect(new Set(PROTOTYPE_CATALOG.map((d) => d.id)).size).toBe(PROTOTYPE_CATALOG.length));
