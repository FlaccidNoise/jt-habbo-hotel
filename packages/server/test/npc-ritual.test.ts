import { describe, expect, test, vi } from "vitest";
import { NPC_ROSTER, NpcService } from "../src/npc.ts";

// The coffee ritual is a deterministic server trigger: proximity + regex → payout callback.
// The LLM must never be consulted for a ritual message (GAME.md §Liveness: zero payout authority).

const MAYA = NPC_ROSTER.find((n) => n.name === "Maya")!;
const nearMaya = { accountId: 42, username: "ann", x: MAYA.post.x, y: MAYA.post.y + 1 };

function service(payout: (accountId: number, ritual: string) => number) {
  const generate = vi.fn(async () => "llm line");
  const say = vi.fn();
  const svc = new NpcService({ generate, say, payout });
  return { svc, generate, say };
}

describe("coffee ritual", () => {
  test("asking the barista for coffee pays out and replies without the LLM", async () => {
    const payout = vi.fn(() => 10);
    const { svc, generate, say } = service(payout);
    svc.onPlayerChat(1, nearMaya, "say", "one coffee please!");
    expect(payout).toHaveBeenCalledOnce();
    expect(payout).toHaveBeenCalledWith(42, "coffee");
    expect(say).toHaveBeenCalledOnce();
    expect(say.mock.calls[0]?.[2]).toContain("10 Stars");
    await Promise.resolve();
    expect(generate).not.toHaveBeenCalled();
  });

  test("a capped payout gets the come-back-tomorrow line, still no LLM", () => {
    const payout = vi.fn(() => 0);
    const { svc, say, generate } = service(payout);
    svc.onPlayerChat(1, nearMaya, "say", "coffee");
    expect(say.mock.calls[0]?.[2]).toMatch(/tomorrow/);
    expect(generate).not.toHaveBeenCalled();
  });

  test("no payout from across the room, even by mention or shout", () => {
    const payout = vi.fn(() => 10);
    const { svc } = service(payout);
    svc.onPlayerChat(1, { accountId: 42, username: "ann", x: 0, y: 5 }, "shout", "Maya coffee!");
    expect(payout).not.toHaveBeenCalled();
  });

  test("adjacent chat without the word coffee is not a ritual", () => {
    const payout = vi.fn(() => 10);
    const { svc } = service(payout);
    svc.onPlayerChat(1, nearMaya, "say", "nice espresso machine");
    expect(payout).not.toHaveBeenCalled();
  });

  test("only the barista serves — coffee at the bellhop pays nothing", () => {
    const payout = vi.fn(() => 10);
    const { svc } = service(payout);
    const pierre = NPC_ROSTER.find((n) => n.name === "Pierre")!;
    svc.onPlayerChat(1, { accountId: 42, username: "ann", x: pierre.post.x, y: pierre.post.y + 1 }, "say", "coffee");
    expect(payout).not.toHaveBeenCalled();
  });
});
