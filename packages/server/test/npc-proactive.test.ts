import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NpcService, PERFORM_MS } from "../src/npc.ts";
import type { NpcDef, NpcOccupant, NpcRoom } from "../src/npc.ts";

// NPCs notice players who stop near them. Pinned here: the trigger (stopped, within 3, not
// recently noticed), the suppressions that stop a dogpile, and — the budget guarantee — that a
// proactive line never reaches the LLM.

const TICK_MS = 1000;
const REPLY_GAP_MS = 8000;
const NOTICE_COOLDOWN_MS = 10 * 60 * 1000;
const PROACTIVE_GAP_MS = 15_000;

const REX = -1;
const ALICE = 7;

const npc = (id: number, x: number, y: number, extra: Partial<NpcDef> = {}): NpcDef => ({
  id,
  roomId: 1,
  name: `Npc${-id}`,
  post: { x, y },
  dir: 2,
  persona: "a test-only NPC.",
  lines: [`${-id}-canned`],
  greetings: [`${-id}-hi {name}`, `${-id}-hello again`],
  ...extra,
});

const staff = (def: NpcDef): NpcOccupant => ({
  accountId: def.id,
  username: def.name,
  x: def.post.x,
  y: def.post.y,
  posture: "stand",
});

const player = (accountId: number, username: string, x: number, y: number): NpcOccupant => ({
  accountId,
  username,
  x,
  y,
  posture: "stand",
});

/** Occupants are held by reference: a test moves a player by mutating the entry it kept. */
function fakeRoom(occ: NpcOccupant[]) {
  const walking = new Set<number>();
  return {
    chatConfig: { speakRadius: 6 },
    occupants: vi.fn((): readonly NpcOccupant[] => occ),
    occupantCount: vi.fn(() => occ.filter((o) => o.accountId > 0).length),
    requestMove: vi.fn(),
    requestSit: vi.fn(),
    requestStand: vi.fn(),
    isWalking: vi.fn((id: number) => walking.has(id)),
    face: vi.fn(),
    walking,
  };
}

let services: NpcService[];

function service(roster: NpcDef[], room: NpcRoom) {
  const say = vi.fn();
  const generate = vi.fn(async () => "an LLM line");
  const svc = new NpcService({
    generate,
    say,
    roster,
    room: (roomId: number) => (roomId === 1 ? room : null),
  });
  services.push(svc);
  return { svc, say, generate };
}

/** What was said, as [npcId, text] pairs. */
const said = (say: ReturnType<typeof vi.fn>): [number, string][] =>
  say.mock.calls.map((c) => [c[1] as number, c[2] as string]);

beforeEach(() => {
  vi.useFakeTimers(); // BEFORE constructing the service — the tick starts in the constructor
  vi.setSystemTime(new Date("2026-08-10T12:00:00Z")); // the cold clocks all read 0; use a real one
  services = [];
});

afterEach(() => {
  for (const svc of services) svc.stop();
  vi.useRealTimers();
});

describe("proactive engagement: the trigger", () => {
  test("a player who stops within 3 draws exactly one line, and the NPC turns to them", () => {
    const rex = npc(REX, 10, 10);
    const room = fakeRoom([staff(rex), player(ALICE, "alice", 12, 10)]);
    const { svc, say } = service([rex], room);
    svc.onPlayerJoin(1, "alice");

    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([[REX, "1-hi alice"]]);
    expect(room.face.mock.calls).toEqual([[REX, { x: 12, y: 10 }]]);

    // Standing there is not a reason to say it again.
    vi.advanceTimersByTime(60_000);
    expect(said(say)).toEqual([[REX, "1-hi alice"]]);
  });

  test("a player walking past is ignored until they stop", () => {
    const rex = npc(REX, 10, 10);
    const room = fakeRoom([staff(rex), player(ALICE, "alice", 11, 10)]);
    const { svc, say } = service([rex], room);
    room.walking.add(ALICE);
    svc.onPlayerJoin(1, "alice");

    vi.advanceTimersByTime(60_000);
    expect(say).not.toHaveBeenCalled();
    expect(room.face).not.toHaveBeenCalled();

    room.walking.delete(ALICE);
    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([[REX, "1-hi alice"]]);
  });

  test("4 tiles is out of range, 3 is in", () => {
    const rex = npc(REX, 10, 10);
    const alice = player(ALICE, "alice", 14, 10);
    const room = fakeRoom([staff(rex), alice]);
    const { svc, say } = service([rex], room);
    svc.onPlayerJoin(1, "alice");

    vi.advanceTimersByTime(60_000);
    expect(say).not.toHaveBeenCalled();

    alice.x = 13;
    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([[REX, "1-hi alice"]]);
  });

  test("with no greetings the NPC falls back to its canned lines", () => {
    const rex = npc(REX, 10, 10, { greetings: undefined });
    const room = fakeRoom([staff(rex), player(ALICE, "alice", 10, 11)]);
    const { svc, say } = service([rex], room);
    svc.onPlayerJoin(1, "alice");

    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([[REX, "1-canned"]]);
  });
});

describe("proactive engagement: suppression", () => {
  test("re-approaching inside the cooldown is silent; after it expires the NPC greets again", () => {
    const rex = npc(REX, 10, 10);
    const alice = player(ALICE, "alice", 11, 10);
    const room = fakeRoom([staff(rex), alice]);
    const { svc, say } = service([rex], room);
    svc.onPlayerJoin(1, "alice");

    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([[REX, "1-hi alice"]]);

    alice.x = 30; // off across the room
    vi.advanceTimersByTime(60_000);
    alice.x = 11; // and back, well inside the 10 minutes
    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([[REX, "1-hi alice"]]);

    alice.x = 30;
    vi.advanceTimersByTime(NOTICE_COOLDOWN_MS);
    alice.x = 11;
    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([
      [REX, "1-hi alice"],
      [REX, "1-hello again"], // round-robin, same shape as the performance lines
    ]);
  });

  test("three NPCs around one player: the nearest speaks, one line per room per gap", () => {
    const near = npc(-1, 10, 11); // 1 from alice
    const mid = npc(-2, 10, 12); // 2
    const far = npc(-3, 10, 13); // 3
    const room = fakeRoom([staff(near), staff(mid), staff(far), player(ALICE, "alice", 10, 10)]);
    const { svc, say } = service([far, mid, near], room); // roster order is not distance order

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([[-1, "1-hi alice"]]);
    // All three turn to look — only one of them speaks.
    expect(room.face.mock.calls.map((c) => c[0]).sort((a, b) => a - b)).toEqual([-3, -2, -1]);

    vi.advanceTimersByTime(PROACTIVE_GAP_MS - TICK_MS); // the gap runs from the line, not the tick
    expect(said(say)).toEqual([[-1, "1-hi alice"]]);

    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([
      [-1, "1-hi alice"],
      [-2, "2-hi alice"], // next nearest, one gap later
    ]);
  });

  test("a performer adjacent to a stopped player never greets, and still plays its set", () => {
    const lola = npc(REX, 10, 10, { performs: true });
    const room = fakeRoom([staff(lola), player(ALICE, "alice", 11, 10)]);
    const { svc, say } = service([lola], room);
    svc.onPlayerJoin(1, "alice");

    vi.advanceTimersByTime(PERFORM_MS - TICK_MS);
    expect(say).not.toHaveBeenCalled();
    expect(room.face).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TICK_MS);
    expect(said(say)).toEqual([[REX, "1-canned"]]);
  });

  test("an NPC that just replied to chat holds its tongue for the reply gap", async () => {
    const rex = npc(REX, 10, 10);
    const alice = player(ALICE, "alice", 11, 10);
    const room = fakeRoom([staff(rex), alice]);
    const { svc, say, generate } = service([rex], room);
    svc.onPlayerJoin(1, "alice");

    svc.onPlayerChat(1, alice, [staff(rex), alice], 6, "say", "hello Npc1");
    await vi.advanceTimersByTimeAsync(REPLY_GAP_MS - TICK_MS);
    expect(said(say)).toEqual([[REX, "an LLM line"]]);
    expect(generate).toHaveBeenCalledOnce();

    await vi.advanceTimersByTimeAsync(TICK_MS);
    expect(said(say)).toEqual([
      [REX, "an LLM line"],
      [REX, "1-hi alice"],
    ]);
    expect(generate).toHaveBeenCalledOnce(); // the proactive line came from the canned set
  });
});

describe("proactive engagement: cost", () => {
  test("no proactive path ever calls the LLM", () => {
    const roster = [npc(-1, 10, 11), npc(-2, 10, 12), npc(-3, 10, 13)];
    const room = fakeRoom([
      ...roster.map(staff),
      player(ALICE, "alice", 10, 10),
      player(8, "bob", 11, 11),
    ]);
    const { svc, say, generate } = service(roster, room);
    svc.onPlayerJoin(1, "alice");
    svc.onPlayerJoin(1, "bob");

    vi.advanceTimersByTime(PROACTIVE_GAP_MS * 10);
    expect(say.mock.calls.length).toBeGreaterThan(0);
    expect(generate).not.toHaveBeenCalled();
  });

  test("the occupant snapshot is taken once per room per tick, not once per NPC", () => {
    const roster = [npc(-1, 10, 11), npc(-2, 10, 12), npc(-3, 10, 13)];
    const room = fakeRoom([...roster.map(staff), player(ALICE, "alice", 10, 10)]);
    const { svc } = service(roster, room);
    svc.onPlayerJoin(1, "alice");

    vi.advanceTimersByTime(TICK_MS * 5);
    expect(room.occupants).toHaveBeenCalledTimes(5);
  });

  test("staff are not players: an NPC never notices another NPC", () => {
    const rex = npc(REX, 10, 10);
    const mate = npc(-2, 11, 10);
    const room = fakeRoom([staff(rex), staff(mate)]); // no players at all
    const { svc, say } = service([rex, mate], room);
    svc.onPlayerJoin(1, "alice"); // joined, then left before the first tick

    vi.advanceTimersByTime(PROACTIVE_GAP_MS * 4);
    expect(say).not.toHaveBeenCalled();
    expect(room.face).not.toHaveBeenCalled();
  });
});
