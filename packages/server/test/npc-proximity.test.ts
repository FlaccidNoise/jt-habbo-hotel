import { describe, expect, test, vi } from "vitest";
import { NpcService } from "../src/npc.ts";
import type { NpcDef } from "../src/npc.ts";

// Proximity now reads the room's speakRadius and each NPC's live occupant tile, not a hardcoded
// EARSHOT and the NPC's declared post — the foundation for NPC wandering (today the tile only
// differs from the post because a test mutates it; nothing moves an NPC yet).

const REX: NpcDef = {
  id: -99,
  roomId: 1,
  name: "Rex",
  post: { x: 0, y: 0 },
  dir: 2,
  persona: "a test-only NPC.",
  lines: ["…"],
};

function service() {
  const generate = vi.fn(async () => "line");
  const say = vi.fn();
  const svc = new NpcService({ generate, say, roster: [REX] });
  return { svc, generate, say };
}

describe("speakRadius replaces the hardcoded earshot", () => {
  test("Grounds (speakRadius 6): a player 6 tiles from the NPC, naming it, is heard", async () => {
    const { svc, generate } = service();
    // x offset 6, mentions "Rex" so hearing alone (not APPROACH) decides the outcome.
    svc.onPlayerChat(1, { accountId: 1, username: "ann", x: 6, y: 0 }, [], 6, "say", "hey Rex");
    await Promise.resolve();
    expect(generate).toHaveBeenCalledOnce();
  });

  test("Café (speakRadius 5): 5 tiles heard, 6 tiles not", async () => {
    const heard = service();
    heard.svc.onPlayerChat(1, { accountId: 1, username: "ann", x: 5, y: 0 }, [], 5, "say", "hey Rex");
    await Promise.resolve();
    expect(heard.generate).toHaveBeenCalledOnce();

    const notHeard = service();
    notHeard.svc.onPlayerChat(1, { accountId: 1, username: "ann", x: 6, y: 0 }, [], 5, "say", "hey Rex");
    await Promise.resolve();
    expect(notHeard.generate).not.toHaveBeenCalled();
  });
});

describe("live occupant tile overrides the declared post", () => {
  test("an NPC moved off its post replies based on its new tile", async () => {
    const { svc, generate } = service();
    // Rex's post is (0,0); the occupant snapshot has it moved to (20,20). A message near the new
    // tile — far outside speakRadius of the post — still triggers a reply because it doesn't
    // mention "Rex" by name, so only APPROACH proximity to the live tile can produce a candidate.
    const occupants = [{ accountId: REX.id, username: REX.name, x: 20, y: 20 }];
    svc.onPlayerChat(
      1, { accountId: 1, username: "ann", x: 21, y: 20 }, occupants, 6, "say", "nice view up here",
    );
    await Promise.resolve();
    expect(generate).toHaveBeenCalledOnce();
  });

  test("the same message beside the now-vacated post draws no reply", async () => {
    const { svc, generate } = service();
    const occupants = [{ accountId: REX.id, username: REX.name, x: 20, y: 20 }];
    svc.onPlayerChat(
      1, { accountId: 1, username: "ann", x: 1, y: 0 }, occupants, 6, "say", "nice view up here",
    );
    await Promise.resolve();
    expect(generate).not.toHaveBeenCalled();
  });
});
