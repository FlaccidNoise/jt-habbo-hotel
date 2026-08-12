import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { DECOR_CATALOG, PROTOTYPE_CATALOG, WALL_CATALOG } from "@grand/shared";
import { DECOR_FROZEN_DIR, FROZEN_DIR, frozenBundle } from "../src/catalog.ts";
import { STARTER_RECIPES } from "../src/starter.ts";

// #423: `make art` / `make decor` freeze into tools/artgen/frozen and tools/decor/frozen, but the
// client serves packages/client/public/{furni,figure,decor} — a separate committed tree that only
// `make gen` refreshes. A freeze without a `make gen` ships stale art with nothing catching it
// (028641f re-froze figure/ha10.png but public/figure/ha10.png stayed stale until 2ae0080). These
// tests byte-compare the published files against their frozen source, which the pixelHash checks
// elsewhere in this package do not: a recorded hash can agree with a stale published PNG as long
// as neither one changed.

const PUBLIC_FURNI = new URL("../../client/public/furni", import.meta.url).pathname;
const PUBLIC_FIGURE = new URL("../../client/public/figure", import.meta.url).pathname;
const PUBLIC_DECOR = new URL("../../client/public/decor", import.meta.url).pathname;

const REMEDY = "run `make gen` and commit packages/client/public";

/** Byte-compare a frozen source file against its published copy, failing with the file name and
 *  the fix rather than a bare buffer diff. */
function expectPublishedMatchesFrozen(frozenPath: string, publishedPath: string) {
  expect(existsSync(publishedPath), `${publishedPath} is missing — ${REMEDY}`).toBe(true);
  const frozen = readFileSync(frozenPath);
  const published = readFileSync(publishedPath);
  expect(published.equals(frozen), `${publishedPath} does not match its frozen source — ${REMEDY}`).toBe(true);
}

describe("publish sync (#423)", () => {
  test("every frozen-sourced furni sheet is published byte-identical", () => {
    for (const def of PROTOTYPE_CATALOG) {
      if (STARTER_RECIPES.has(def.id)) continue; // box path renders fresh, no frozen source to sync
      const { bundle } = frozenBundle(def.id);
      expectPublishedMatchesFrozen(join(FROZEN_DIR, bundle.meta.sheet), join(PUBLIC_FURNI, bundle.meta.sheet));
      if (bundle.meta.nearSheet) {
        expectPublishedMatchesFrozen(
          join(FROZEN_DIR, bundle.meta.nearSheet),
          join(PUBLIC_FURNI, bundle.meta.nearSheet),
        );
      }
    }
  });

  test("every wall sheet is published byte-identical", () => {
    // Wall bundles are always 3D-assisted (catalog.ts) — every one is frozen-sourced.
    for (const def of WALL_CATALOG) {
      const { bundle } = frozenBundle(def.id);
      expectPublishedMatchesFrozen(join(FROZEN_DIR, bundle.meta.sheet), join(PUBLIC_FURNI, bundle.meta.sheet));
    }
  });

  test("every figure layer and figures.json is published byte-identical", () => {
    const figuresPath = join(FROZEN_DIR, "figure", "figures.json");
    expectPublishedMatchesFrozen(figuresPath, join(PUBLIC_FIGURE, "figures.json"));
    const doc = JSON.parse(readFileSync(figuresPath, "utf8")) as { layers: Array<{ sheet: string }> };
    for (const layer of doc.layers) {
      expectPublishedMatchesFrozen(
        join(FROZEN_DIR, "figure", layer.sheet),
        join(PUBLIC_FIGURE, layer.sheet),
      );
    }
  });

  // #451: the same document written two ways. A scoped freeze (`--freeze --only <part>`) merges one
  // layer into the frozen document, an unscoped one rewrites it from this run's build order, and
  // while those paths ordered the array differently a layer's position recorded which kind of
  // freeze last touched it. Any cross-session mix of the two reordered figures.json without moving
  // a pixel, and the byte-compare above then failed on a tree that had tested green. figurepass
  // sorts every write by setId, so the committed document is its own canonical order.
  test("figures.json is ordered by setId, whichever freeze wrote it", () => {
    const doc = JSON.parse(readFileSync(join(FROZEN_DIR, "figure", "figures.json"), "utf8")) as {
      layers: Array<{ partId: string; setId: number }>;
    };
    const ids = doc.layers.map((l) => l.setId);
    expect(new Set(ids).size, "two layers share a setId, so setId cannot order them").toBe(ids.length);
    expect(
      doc.layers.map((l) => l.partId),
      "figures.json is out of setId order — a freeze appended instead of sorting",
    ).toEqual([...doc.layers].sort((a, b) => a.setId - b.setId).map((l) => l.partId));
  });

  test("every decor tile is published byte-identical", () => {
    const doc = JSON.parse(readFileSync(join(DECOR_FROZEN_DIR, "decor.json"), "utf8")) as {
      decor: Array<{ id: string; sheet: string }>;
    };
    for (const def of DECOR_CATALOG) {
      const frozen = doc.decor.find((d) => d.id === def.id);
      expect(frozen, `${def.id}: in DECOR_CATALOG but never frozen — run make decor`).toBeDefined();
      expectPublishedMatchesFrozen(
        join(DECOR_FROZEN_DIR, frozen!.sheet),
        join(PUBLIC_DECOR, `${def.id}.png`),
      );
    }
  });
});
