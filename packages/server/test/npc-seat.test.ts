import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { Tile } from "@grand/shared";
import { NpcService } from "../src/npc.ts";
import type { NpcDef, NpcOccupant, NpcRoom } from "../src/npc.ts";

// Sitting and standing on the existing wander cycle. What is pinned here: a landed sit reads back
// as posture "sit" and the NPC stops wandering until its next due cycle, when it stands and
// resumes; a sit that never lands (seat gone, seat taken) is read back too and the NPC wanders
// normally at its next cycle rather than getting stuck; engagement still works while seated and
// the hold blocks standing exactly like it blocks a floor waypoint; and an NPC with no `seats`
// never calls requestSit at all.

const TICK_MS = 1000;
const IDLE_MS = 20_000;

const REX = -1;
const ALICE = 7;

const npc = (id: number, post: Tile, extra: Partial<NpcDef> = {}): NpcDef => ({
  id,
  roomId: 1,
  name: `Npc${-id}`,
  post,
  dir: 2,
  persona: "a test-only NPC.",
  lines: [`${-id}-canned`],
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

/** A room with no players does no tick work, so every test needs one parked far enough away to
 *  never trigger the engagement hold on its own. */
const far = (): NpcOccupant => player(ALICE, "alice", 99, 99);

/** requestSit lands synchronously (no walk in between) unless `sitSucceeds` is false, in which
 *  case it is called but the occupant is left exactly where it stood, still posture "stand" — the
 *  silent-refusal path (seat picked up, seat claimed) that npc.ts must read back rather than trust. */
function fakeRoom(occ: NpcOccupant[], opts: { sitSucceeds?: boolean } = {}) {
  const { sitSucceeds = true } = opts;
  const moves: Tile[] = [];
  const sits: Tile[] = [];
  const stands: number[] = [];
  const walking = new Set<number>();
  return {
    chatConfig: { speakRadius: 6 },
    occupants: vi.fn((): readonly NpcOccupant[] => occ),
    occupantCount: vi.fn(() => occ.filter((o) => o.accountId > 0).length),
    requestMove: vi.fn((id: number, x: number, y: number) => {
      const o = occ.find((c) => c.accountId === id);
      if (!o) return;
      moves.push({ x, y });
      o.x = x;
      o.y = y;
    }),
    requestSit: vi.fn((id: number, x: number, y: number) => {
      sits.push({ x, y });
      const o = occ.find((c) => c.accountId === id);
      if (!o || !sitSucceeds) return;
      o.x = x;
      o.y = y;
      o.posture = "sit";
    }),
    requestStand: vi.fn((id: number) => {
      stands.push(id);
      const o = occ.find((c) => c.accountId === id);
      if (o) o.posture = "stand";
    }),
    isWalking: vi.fn((id: number) => walking.has(id)),
    roamOk: vi.fn((x: number, y: number) => !occ.some((o) => o.x === x && o.y === y)),
    face: vi.fn(),
    moves,
    sits,
    stands,
    walking,
  };
}

let services: NpcService[];
let random: ReturnType<typeof vi.spyOn> | null;

function service(roster: NpcDef[], rooms: Map<number, NpcRoom>) {
  const say = vi.fn();
  const svc = new NpcService({
    generate: null,
    say,
    roster,
    room: (roomId: number) => rooms.get(roomId) ?? null,
  });
  services.push(svc);
  return { svc, say };
}

/** A linear congruential generator, for the one test that needs varied-but-deterministic draws
 *  rather than a single pinned value. */
function seedRandom(seed: number): void {
  let s = seed;
  random = vi.spyOn(Math, "random").mockImplementation(() => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  });
}

beforeEach(() => {
  vi.useFakeTimers(); // BEFORE constructing the service — the tick starts in the constructor
  vi.setSystemTime(new Date("2026-08-10T12:00:00Z"));
  services = [];
  random = null;
});

afterEach(() => {
  for (const svc of services) svc.stop();
  random?.mockRestore();
  vi.useRealTimers();
});

describe("sitting", () => {
  test("a landed sit reads back as posture sit, and the NPC holds it until its next due cycle", () => {
    const seat = { x: 2, y: 2 };
    const rex = npc(REX, { x: 0, y: 0 }, { home: { x0: 0, y0: 0, x1: 8, y1: 8 }, seats: [seat] });
    const room = fakeRoom([staff(rex), far()]);
    const { svc } = service([rex], new Map([[1, room]]));
    random = vi.spyOn(Math, "random").mockReturnValue(0); // always tries the seat, always picks it

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(IDLE_MS); // first cycle: sits

    expect(room.requestSit).toHaveBeenCalledTimes(1);
    expect(room.requestSit).toHaveBeenCalledWith(REX, seat.x, seat.y);
    expect(room.occupants().find((o) => o.accountId === REX)?.posture).toBe("sit");

    vi.advanceTimersByTime(IDLE_MS - TICK_MS); // right up to, not through, the next cycle
    expect(room.requestMove).not.toHaveBeenCalled();
    expect(room.requestStand).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TICK_MS); // the due cycle: stands
    expect(room.requestStand).toHaveBeenCalledTimes(1);
  });

  test("after standing, the NPC resumes picking floor waypoints too, not only the seat", () => {
    const seat = { x: 2, y: 2 };
    const home = { x0: 0, y0: 0, x1: 8, y1: 8 };
    const rex = npc(REX, { x: 0, y: 0 }, { home, seats: [seat] });
    const room = fakeRoom([staff(rex), far()]);
    const { svc } = service([rex], new Map([[1, room]]));
    random = vi.spyOn(Math, "random").mockReturnValue(0);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(IDLE_MS); // sits
    vi.advanceTimersByTime(IDLE_MS); // stands
    expect(room.requestSit).toHaveBeenCalledTimes(1);
    expect(room.requestStand).toHaveBeenCalledTimes(1);

    random.mockReturnValue(0.9); // misses the seat chance and the post bias: a genuine floor draw
    vi.advanceTimersByTime(IDLE_MS);

    expect(room.requestMove).toHaveBeenCalledTimes(1);
    expect(room.requestSit).toHaveBeenCalledTimes(1); // unchanged — it picked the floor, not the seat
  });

  test("a seat that never lands leaves the NPC standing, and it wanders again next cycle", () => {
    const seat = { x: 2, y: 2 };
    const rex = npc(REX, { x: 0, y: 0 }, { home: { x0: 0, y0: 0, x1: 8, y1: 8 }, seats: [seat] });
    const room = fakeRoom([staff(rex), far()], { sitSucceeds: false });
    const { svc } = service([rex], new Map([[1, room]]));
    random = vi.spyOn(Math, "random").mockReturnValue(0);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(IDLE_MS);

    expect(room.requestSit).toHaveBeenCalledTimes(1);
    expect(room.occupants().find((o) => o.accountId === REX)?.posture).toBe("stand");
    expect(room.requestStand).not.toHaveBeenCalled(); // never actually sat, nothing to stand from

    // the next cycle reads the correction and tries again normally — not stuck, not standing from
    // a seat it never had
    vi.advanceTimersByTime(IDLE_MS);
    expect(room.requestSit).toHaveBeenCalledTimes(2);
    expect(room.requestStand).not.toHaveBeenCalled();
  });

  test("no seats field: requestSit is never called, matching plain wandering exactly", () => {
    const rex = npc(REX, { x: 4, y: 4 }, { home: { x0: 0, y0: 0, x1: 20, y1: 20 } });
    const room = fakeRoom([staff(rex), far()]);
    const { svc } = service([rex], new Map([[1, room]]));
    seedRandom(21);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(IDLE_MS * 50);

    expect(room.requestSit).not.toHaveBeenCalled();
    expect(room.requestMove.mock.calls.length).toBeGreaterThan(5);
  });
});

describe("sitting and engagement", () => {
  test("a seated NPC still notices and greets, and the hold blocks standing at its due cycle", () => {
    const seat = { x: 2, y: 2 };
    const home = { x0: 0, y0: 0, x1: 8, y1: 8 };
    const rex = npc(REX, { x: 0, y: 0 }, { home, seats: [seat], greetings: ["hi {name}"] });
    const alice = player(ALICE, "alice", 99, 99);
    const room = fakeRoom([staff(rex), alice]);
    const { svc, say } = service([rex], new Map([[1, room]]));
    random = vi.spyOn(Math, "random").mockReturnValue(0);

    svc.onPlayerJoin(1, "alice");
    vi.advanceTimersByTime(IDLE_MS); // sits at t=20000; next due cycle at t=40000

    alice.x = seat.x + 1;
    alice.y = seat.y;
    vi.advanceTimersByTime(IDLE_MS - TICK_MS); // she stops beside it just before the next cycle

    expect(room.face).toHaveBeenCalledWith(REX, { x: alice.x, y: alice.y });
    expect(say).toHaveBeenCalledTimes(1);
    expect(room.requestStand).not.toHaveBeenCalled();

    vi.advanceTimersByTime(TICK_MS); // the stand is due now, but the hold she just re-armed covers it
    expect(room.requestStand).not.toHaveBeenCalled();
  });
});
