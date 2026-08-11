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
  // #427: the Grounds' pool got a deep end, so LAYOUT_VERSION went 6 -> 7 with the hash unmoved —
  // the first entry here where that is the whole point. The deep end is decor (a second rect in
  // GROUNDS_DECOR), and decor is not a Layout, so nothing this test hashes changed. seedRoom
  // compares the stored decor as well as the stamp, so the water would have reached a live room
  // without the bump; it was taken anyway because the pool now sinks the people standing in it.
  // An identical hash beside a new version is therefore a reading, not a failure: it says the
  // furniture is where it was.
  // Before it, #429 moved the Grand Wheel onto the casino's east strip for 5 -> 6. The Grounds
  // layout is built by grounds.ts rather than written out, so the hash also covers the builder's
  // output — a rhythm constant edited without a bump lands here the same way a moved chair would.
  version: 7,
  hash: "2be18333962b106e684deba934efcdce2292e553d3ceaba75effc05d1a6cc1b0",
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
