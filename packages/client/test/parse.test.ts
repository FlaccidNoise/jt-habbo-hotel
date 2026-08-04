import { expect, test } from "vitest";
import { parseChatInput } from "../src/ui/parse.ts";

test("plain text says", () => {
  expect(parseChatInput("hello", false)).toEqual({ kind: "say", text: "hello" });
});

test("shift+enter shouts", () => {
  expect(parseChatInput("hello", true)).toEqual({ kind: "shout", text: "hello" });
});

test("/w name text whispers", () => {
  expect(parseChatInput("/w bob hi there", false)).toEqual({
    kind: "whisper",
    to: "bob",
    text: "hi there",
  });
});

test("blank input is nothing", () => {
  expect(parseChatInput("", false)).toBeNull();
  expect(parseChatInput("   ", true)).toBeNull();
});

test("/w with no message is nothing", () => {
  expect(parseChatInput("/w bob", false)).toBeNull();
  expect(parseChatInput("/w bob   ", false)).toBeNull();
});

test("/shout text shouts", () => {
  expect(parseChatInput("/shout hey all", false)).toEqual({ kind: "shout", text: "hey all" });
});

test("/shout with no message is nothing", () => {
  expect(parseChatInput("/shout", false)).toBeNull();
  expect(parseChatInput("/shout   ", false)).toBeNull();
});
