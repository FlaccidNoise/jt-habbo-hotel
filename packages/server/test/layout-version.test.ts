import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { LAYOUTS, LAYOUT_VERSION } from "../src/furnish.ts";

// #330 recurrence guard: seedRoom (db.ts) only re-lays a public room's furniture when the
// heightmap or LAYOUT_VERSION drifts from what a room was seeded with — an edit to CAFE or
// CASINO that forgets the bump is invisible to every hotel already booted, the same way #323's
// wall-clutter items silently missed every live room until #330 forced the first bump. Record the
// pair this test prints below whenever LAYOUT_VERSION is bumped on purpose.

function layoutsHash(): string {
  return createHash("sha256").update(JSON.stringify([...LAYOUTS])).digest("hex");
}

const RECORDED = {
  // #428: the casino's north-west card table became the blackjack table, so LAYOUT_VERSION went
  // 4 -> 5. The Grounds layout is built by grounds.ts rather than written out, so the hash also
  // covers the builder's output — a rhythm constant edited without a bump lands here the same way
  // a moved chair would.
  version: 5,
  hash: "719cdadc8a2cda9cf19c6309fcc0da3bce4177323bbb52874892619ea13e1684",
};

test("a LAYOUTS edit is accompanied by a LAYOUT_VERSION bump", () => {
  const hash = layoutsHash();
  if (LAYOUT_VERSION === RECORDED.version) {
    expect(
      hash,
      "LAYOUTS changed shape without a LAYOUT_VERSION bump (#330) — bump LAYOUT_VERSION in " +
        "furnish.ts, then update RECORDED in this test to the { version, hash } it prints",
    ).toBe(RECORDED.hash);
  } else {
    expect(
      { version: LAYOUT_VERSION, hash },
      "LAYOUT_VERSION was bumped — update RECORDED in this test to this file's own printed " +
        "{ version, hash } so the snapshot tracks the new layouts",
    ).toEqual(RECORDED);
  }
});
