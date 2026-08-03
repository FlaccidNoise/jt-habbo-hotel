import { describe, expect, test } from "vitest";
import { loadRuleset, filterChat, hitsFilter } from "../src/filter.ts";

const WORDS_PATH = new URL("../filter-words.txt", import.meta.url).pathname;

describe("filter", () => {
  const rs = loadRuleset(WORDS_PATH);

  test("version parses", () => expect(rs.version).toBe("1"));

  test("run-tolerant match: shiiit filters to blah", () =>
    expect(filterChat(rs, "shiiit")).toBe("blah"));

  test("run-tolerant match: asss hits when ass is listed", () =>
    expect(filterChat(rs, "asss")).toBe("blah"));

  test("as never matches — too short to satisfy ass's run pattern", () =>
    expect(filterChat(rs, "as")).toBe("as"));

  test("class is unchanged — the a is preceded by a word char, so no leading \\b", () =>
    expect(filterChat(rs, "class")).toBe("class"));

  // Known limitation, pinned: \b only fires at a transition between a word char and a
  // non-word char (or string start/end). "assignment" is all letters, so the sole boundaries
  // are the string's start and end — the embedded "ass" has a word char ("i") on its right,
  // so the trailing \b never matches and the word passes through untouched. (The plan's draft
  // reasoning assumed this would replace to "blahignment"; it does not — verified against the
  // actual regex the spec pins: `\ba+s+s+\b`.)
  test("assignment is unchanged — no trailing boundary after the embedded run", () =>
    expect(filterChat(rs, "assignment")).toBe("assignment"));

  test("case-insensitive", () => expect(filterChat(rs, "SHIIIT")).toBe("blah"));

  test("hitsFilter is used for username checks", () => {
    expect(hitsFilter(rs, "shit")).toBe(true);
    expect(hitsFilter(rs, "sh1t")).toBe(false); // digit-for-letter normalization is parked
  });
});
