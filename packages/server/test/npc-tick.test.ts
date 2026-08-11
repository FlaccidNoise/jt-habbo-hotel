import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { NpcService, PERFORM_MS } from "../src/npc.ts";
import type { NpcDef, NpcRoom } from "../src/npc.ts";

// One 1 Hz decision clock replaces the per-room performer intervals. What is pinned here is the
// cadence NPCs keep, the stagger that stops two acts chorusing, and — the reason the tick is
// affordable at all — that an inactive room costs nothing.

const TICK_MS = 1000;

const act = (id: number, roomId: number): NpcDef => ({
  id,
  roomId,
  name: `Act${-id}`,
  post: { x: 0, y: 0 },
  dir: 2,
  persona: "a test-only performer.",
  performs: true,
  lines: [`${-id}-one`, `${-id}-two`],
});

function fakeRoom(players: number) {
  return {
    chatConfig: { speakRadius: 6 },
    occupants: vi.fn(() => []),
    occupantCount: vi.fn(() => players),
    requestMove: vi.fn(),
    requestSit: vi.fn(),
    requestStand: vi.fn(),
    isWalking: vi.fn(() => false),
    face: vi.fn(),
  };
}

let services: NpcService[];

function service(roster: NpcDef[], rooms: Map<number, NpcRoom>, inject = true) {
  const say = vi.fn();
  const lookup = vi.fn((roomId: number) => rooms.get(roomId) ?? null);
  const svc = new NpcService({
    generate: null,
    say,
    roster,
    ...(inject ? { room: lookup } : {}),
  });
  services.push(svc);
  return { svc, say, lookup };
}

/** Which NPC spoke, in order. */
const spoke = (say: ReturnType<typeof vi.fn>): number[] =>
  say.mock.calls.map((c) => c[1] as number);

beforeEach(() => {
  vi.useFakeTimers(); // BEFORE constructing the service — the tick starts in the constructor
  services = [];
});

afterEach(() => {
  for (const svc of services) svc.stop();
  vi.useRealTimers();
});

describe("npc tick: performances", () => {
  test("a lone act keeps the pre-tick cadence: one line per PERFORM_MS", () => {
    const room = fakeRoom(1);
    const { svc, say } = service([act(-3, 2)], new Map([[2, room]]));
    svc.onPlayerJoin(2, "alice");

    vi.advanceTimersByTime(PERFORM_MS - TICK_MS);
    expect(say).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TICK_MS);
    expect(say.mock.calls).toEqual([[2, -3, "3-one"]]);

    vi.advanceTimersByTime(PERFORM_MS);
    expect(say.mock.calls).toEqual([
      [2, -3, "3-one"],
      [2, -3, "3-two"],
    ]);
  });

  test("two acts in one room alternate instead of chorusing", () => {
    const room = fakeRoom(1);
    const { svc, say } = service([act(-3, 2), act(-4, 2)], new Map([[2, room]]));
    svc.onPlayerJoin(2, "alice");

    vi.advanceTimersByTime(PERFORM_MS / 2);
    expect(spoke(say)).toEqual([-3]);

    vi.advanceTimersByTime(PERFORM_MS / 2);
    expect(spoke(say)).toEqual([-3, -4]);

    vi.advanceTimersByTime(PERFORM_MS / 2);
    expect(spoke(say)).toEqual([-3, -4, -3]);
  });

  test("an empty room's act stays silent even while the room is loaded", () => {
    const room = fakeRoom(0);
    const { svc, say } = service([act(-3, 2)], new Map([[2, room]]));
    svc.onPlayerJoin(2, "alice");

    vi.advanceTimersByTime(PERFORM_MS * 2);
    expect(say).not.toHaveBeenCalled();
  });

  test("with no room accessor injected the tick drives nothing", () => {
    const { svc, say } = service([act(-3, 2)], new Map(), false);
    svc.onPlayerJoin(2, "alice");

    vi.advanceTimersByTime(PERFORM_MS * 2);
    expect(say).not.toHaveBeenCalled();
  });
});

describe("npc tick: cost", () => {
  test("a room nobody joined is never even looked up", () => {
    const room = fakeRoom(1);
    const { say, lookup } = service([act(-3, 2)], new Map([[2, room]]));

    vi.advanceTimersByTime(PERFORM_MS * 2);
    expect(lookup).not.toHaveBeenCalled();
    expect(room.occupantCount).not.toHaveBeenCalled();
    expect(room.occupants).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalled();
  });

  test("room-level reads are hoisted: one per room per tick, not one per NPC", () => {
    const room = fakeRoom(1);
    const { svc, lookup } = service(
      [act(-3, 2), act(-4, 2), act(-5, 2)],
      new Map([[2, room]]),
    );
    svc.onPlayerJoin(2, "alice");

    vi.advanceTimersByTime(TICK_MS * 5);
    expect(lookup).toHaveBeenCalledTimes(5);
    expect(room.occupantCount).toHaveBeenCalledTimes(5);
  });

  test("stop clears the one timer", () => {
    const { svc } = service([act(-3, 2)], new Map([[2, fakeRoom(1)]]));
    expect(vi.getTimerCount()).toBe(1);
    svc.stop();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("npc tick: room lifecycle", () => {
  test("an emptied room stops ticking and a re-join restarts the clock", () => {
    const room = fakeRoom(1);
    const { svc, say, lookup } = service([act(-3, 2)], new Map([[2, room]]));

    svc.onPlayerJoin(2, "alice");
    vi.advanceTimersByTime(PERFORM_MS - TICK_MS); // one tick short of the first line
    svc.onRoomEmpty(2);
    lookup.mockClear();

    vi.advanceTimersByTime(PERFORM_MS);
    expect(lookup).not.toHaveBeenCalled();
    expect(say).not.toHaveBeenCalled();

    // The old clock died with the room: the set starts over from the re-join, not from where it
    // was interrupted.
    svc.onPlayerJoin(2, "bob");
    vi.advanceTimersByTime(PERFORM_MS - TICK_MS);
    expect(say).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TICK_MS);
    expect(spoke(say)).toEqual([-3]);
  });
});
