import {
  DIR_STEPS,
  FigureError,
  PROTOTYPE_CATALOG,
  ROOM_FURNI_CAP,
  WALL_CATALOG,
  WHEEL_MAX_STAKE,
  WHEEL_MIN_STAKE,
  WHEEL_SEGMENTS,
  checkPlacement,
  checkWallPlacement,
  climbOk,
  dirFromStep,
  footprintTiles,
  parseHeightmap,
  seatAt,
  stackTop,
  tileHeight,
  wheelDraw,
} from "@grand/shared";
import type {
  AvatarState,
  Door,
  ErrorCode,
  FurniDef,
  FurniItem,
  PlacementCtx,
  Posture,
  RoomDecor,
  RoomModel,
  ServerMsg,
  Tile,
  WallDef,
  WallItem,
  WallPlacementCtx,
  WallSide,
} from "@grand/shared";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { filterChat, loadRuleset } from "./filter.ts";
import { figureOf, saveFigure, staffFigure } from "./figure.ts";
import { balanceOf, settleSpend, settleWin } from "./ledger.ts";
import { findPath, reachable } from "./pathfind.ts";
import {
  getItem,
  listInventory,
  listRoomFurni,
  listRoomWallFurni,
  pickupItem,
  placeItem,
  placeWallItem,
  suiteOf,
  updateItemState,
  updateItemZ,
} from "./items.ts";

export const MS_PER_TILE = 500;

// The counters (#326, #347). What a counter hands over and what it charges are def parameters, so
// a new drink is a catalog row; only the two minutes it lasts are shared. A hand item is a prop,
// not a purchase — it evaporates rather than entering the item economy.
export const HAND_MS = 120_000;
const USE_COOLDOWN_MS = 700;
const WISH_COST = 1;

/** What the counter says as it hands one over, and what the Stars line calls it. Keyed by the
 *  `vend.item` the def names — use.test.ts checks every vending def is covered. */
const HAND_ITEMS: ReadonlyMap<string, { line: string; reason: string }> = new Map([
  ["drink_cola", { line: "The bartender slides you a cola.", reason: "drink" }],
  ["drink_coffee", { line: "The barista sets a coffee on the counter for you.", reason: "coffee" }],
  ["drink_cocktail", { line: "The bartender shakes you a cocktail.", reason: "cocktail" }],
  ["book", { line: "You take a book down off the shelf.", reason: "book" }],
]);

/** What the water tells you for your Star (#347). Nothing else comes back — that is the sink. */
export const FORTUNES: readonly string[] = [
  "The water settles. Tonight, the cards remember your name.",
  "A coin sinks. Somewhere upstairs, a door is left unlocked for you.",
  "The fountain says: quit while the room still likes you.",
  "Ripples, then nothing. The house is thinking it over.",
  "Your reflection winks first. Take the hint and take the corner table.",
  "The Grand keeps its promises slowly. Come back on a busier night.",
  "Luck is on the floor tonight, and it is looking for a partner.",
  "Spend it warm, the water says. Cold Stars buy nothing worth having.",
];

export interface Occupant {
  accountId: number;
  username: string;
  x: number;
  y: number;
  z: number;
  dir: number;
  posture: Posture;
  figure: string;
  staff?: boolean;
  /** In memory only: what you are carrying dies with the session, which is what a consumable
   *  priced at a Star or two is for. */
  hand?: { item: string; until: number };
}
export type Emit = (accountId: number, msg: ServerMsg) => void;

interface Step { x: number; y: number; z: number }
interface ChatConfig { speakRadius: number; shoutAllowed: boolean }
// A room seeded before #260 has no decor key at all, which is exactly the "chose neither" case.
interface RoomDoc { heightmap: string; door: Door; chat: ChatConfig; decor?: RoomDecor }
interface Walk {
  path: Step[];
  i: number;
  dest: Tile;                     // reserved until arrival or cancel
  sitOnArrival: boolean;          // a sit request walks first, then sits
  repathed: boolean;              // one retry per walk: re-routes once when a step is blocked
  timer: ReturnType<typeof setInterval>;
}

const DEFS: ReadonlyMap<string, FurniDef> = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
const WALL_DEFS: ReadonlyMap<string, WallDef> = new Map(WALL_CATALOG.map((d) => [d.id, d]));
const RULESET = loadRuleset(new URL("../filter-words.txt", import.meta.url).pathname);

const key = (x: number, y: number): string => `${x},${y}`;

function toAvatar(o: Occupant): AvatarState {
  return {
    id: o.accountId, username: o.username, x: o.x, y: o.y, z: o.z, dir: o.dir, posture: o.posture,
    figure: o.figure,
    ...(o.staff ? { staff: true } : {}),
    ...(o.hand ? { hand: { ...o.hand } } : {}),
  };
}

export class Room {
  readonly roomId: number;
  readonly name: string;
  readonly model: RoomModel;
  readonly door: Door;
  readonly chatConfig: ChatConfig;
  readonly decor: RoomDecor;
  private db: Database.Database;
  private emit: Emit;
  private heightmap: string;
  private furni: FurniItem[];
  private wallFurni: WallItem[];
  private index: Map<string, FurniItem[]>;   // occupancy: tile → items covering it
  private occ: Map<number, Occupant>;
  private walks: Map<number, Walk>;
  private lastUse = new Map<number, number>();
  private hands = new Map<number, ReturnType<typeof setTimeout>>();
  private openMask: Uint8Array | null = null;   // built lazily by roamOk, dropped by reindex
  /** Opens the blackjack panel (#428). The table is a use verb like the fountain, but the game
   *  itself is per account and outlives the room, so the room forwards and holds nothing. Absent
   *  in tests that build a room with no server around it — the only caller that has a casino to
   *  open is server.ts. */
  private blackjack?: (accountId: number) => void;

  constructor(db: Database.Database, roomId: number, emit: Emit, blackjack?: (accountId: number) => void) {
    const row = db.prepare("SELECT name, doc FROM rooms WHERE id = ?").get(roomId) as
      | { name: string; doc: string }
      | undefined;
    if (!row) throw new Error(`no such room: ${roomId}`);
    const doc = JSON.parse(row.doc) as RoomDoc;

    this.db = db;
    this.emit = emit;
    this.blackjack = blackjack;
    this.roomId = roomId;
    this.name = row.name;
    this.heightmap = doc.heightmap;
    this.door = doc.door;
    this.chatConfig = doc.chat;
    this.decor = doc.decor ?? {};
    this.model = parseHeightmap(doc.heightmap, doc.door);
    this.furni = listRoomFurni(db, roomId);
    this.wallFurni = listRoomWallFurni(db, roomId);
    this.index = new Map();
    this.occ = new Map();
    this.walks = new Map();
    this.reindex();
  }

  /** Re-reads this room's furni from the database and shows anyone standing in it what arrived.
   *  Used when something outside the room changed its contents — a museum donation (#210). */
  reload(): void {
    const floorBefore = new Set(this.furni.map((f) => f.id));
    const wallBefore = new Set(this.wallFurni.map((f) => f.id));
    this.furni = listRoomFurni(this.db, this.roomId);
    this.wallFurni = listRoomWallFurni(this.db, this.roomId);
    this.reindex();
    for (const item of this.furni) {
      if (!floorBefore.has(item.id)) this.broadcast({ t: "furni_placed", item: { ...item } });
    }
    for (const item of this.wallFurni) {
      if (!wallBefore.has(item.id)) this.broadcast({ t: "wall_placed", item: { ...item } });
    }
  }

  occupants(): readonly Occupant[] {
    return [...this.occ.values()].map((o) => ({ ...o }));
  }

  /** Players only — staff NPCs never keep a room alive. */
  occupantCount(): number {
    return [...this.occ.values()].filter((o) => !o.staff).length;
  }

  /** Staff NPCs stand at a fixed post. No socket exists for their id, so emits to them no-op. */
  addNpc(def: { id: number; name: string; post: Tile; dir: number }): void {
    if (this.occ.has(def.id)) return;
    this.occ.set(def.id, {
      accountId: def.id,
      username: def.name,
      staff: true,
      x: def.post.x,
      y: def.post.y,
      z: this.tileZ(def.post.x, def.post.y),
      dir: def.dir,
      posture: "stand",
      figure: staffFigure(def.id),
    });
  }

  join(accountId: number, username: string): void {
    const spawn = this.spawnTile();
    const occupant: Occupant = {
      accountId,
      username,
      x: spawn.x,
      y: spawn.y,
      z: this.tileZ(spawn.x, spawn.y),
      dir: this.door.dir,
      posture: "stand",
      figure: figureOf(this.db, accountId),
    };
    this.occ.set(accountId, occupant);

    const myRoomId = suiteOf(this.db, accountId);
    this.emit(accountId, {
      t: "room_state",
      roomId: this.roomId,
      name: this.name,
      heightmap: this.heightmap,
      decor: this.decor,
      door: this.door,
      chat: this.chatConfig,
      avatars: [...this.occ.values()].map(toAvatar),
      furni: this.furni.map((f) => ({ ...f })),
      wallFurni: this.wallFurni.map((f) => ({ ...f })),
      inventory: listInventory(this.db, accountId),
      you: accountId,
      stars: balanceOf(this.db, accountId),
      ...(myRoomId !== null ? { myRoomId } : {}),
    });
    for (const id of this.occ.keys()) {
      if (id !== accountId) this.emit(id, { t: "avatar_join", avatar: toAvatar(occupant) });
    }
    // Late joiners see motion, not statues.
    for (const [id, walk] of this.walks) {
      const walker = this.occ.get(id);
      if (walker) this.emit(accountId, this.walkMsg(walker, walk.path.slice(walk.i)));
    }
  }

  leave(accountId: number): void {
    this.cancelWalk(accountId);
    this.cancelHand(accountId);
    this.lastUse.delete(accountId);
    if (!this.occ.delete(accountId)) return;
    this.broadcast({ t: "avatar_leave", id: accountId });
  }

  dispose(): void {
    for (const id of [...this.walks.keys()]) this.cancelWalk(id);
    for (const id of [...this.hands.keys()]) this.cancelHand(id);
    this.occ.clear();
  }

  requestMove(accountId: number, x: number, y: number): void {
    this.travel(accountId, x, y, false);
  }

  /** Walk to the seat tile, then sit. The seat tile is furni-blocked for everyone else, so it is
   *  exempted for this path only — the walker may finish there, but nobody may cross it. */
  requestSit(accountId: number, x: number, y: number): void {
    const occupant = this.occ.get(accountId);
    if (!occupant) return;
    const seat = seatAt(this.ctx(this.furni), { x, y });
    if (!seat) {
      this.fail(accountId, "no_seat", "nothing to sit on there");
      return;
    }
    if (occupant.x === x && occupant.y === y) {
      this.seatOccupant(occupant, seat.z, seat.dir);
      return;
    }
    for (const o of this.occ.values()) {
      if (o.accountId !== accountId && o.x === x && o.y === y) {
        this.fail(accountId, "occupied", "that seat is taken");
        return;
      }
    }
    this.travel(accountId, x, y, true);
  }

  requestStand(accountId: number): void {
    const occupant = this.occ.get(accountId);
    if (!occupant || occupant.posture === "stand") return;
    this.standUp(occupant);
  }

  /** A walk is in flight. A driver that steers an occupant on a clock must not stack a second
   *  destination on one it already asked for. */
  isWalking(accountId: number): boolean {
    return this.walks.has(accountId);
  }

  /** May a driver send an occupant to wander onto this tile? Two gates, and they are deliberately
   *  different in kind. The mask is static — the heightmap plus non-walkable furni, swept once
   *  from the door — so a walkable but walled-off pocket is refused without asking the pathfinder,
   *  which would otherwise drain its whole open set to prove there is no route. Avatars are
   *  excluded from the mask on purpose, which is what makes it cacheable; live occupancy is the
   *  second check, and `findPath` refuses a blocked destination before it searches anyway. */
  roamOk(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= this.model.width || y >= this.model.height) return false;
    this.openMask ??= reachable(this.model, (bx, by) => this.furniBlocks(bx, by), this.door);
    if (this.openMask[y * this.model.width + x] !== 1) return false;
    for (const o of this.occ.values()) {
      if (o.x === x && o.y === y) return false;
    }
    return true;
  }

  /** Turn in place toward any tile — `toward` need not be adjacent, so the offset is reduced to
   *  its sign before `dirFromStep`, which only accepts unit steps. */
  face(accountId: number, toward: Tile): void {
    const occupant = this.occ.get(accountId);
    if (!occupant) return;
    const dx = Math.sign(toward.x - occupant.x);
    const dy = Math.sign(toward.y - occupant.y);
    if (dx === 0 && dy === 0) return;
    occupant.dir = dirFromStep(dx, dy);
    this.broadcastPosture(occupant);
  }

  private travel(accountId: number, x: number, y: number, sitOnArrival: boolean): void {
    const occupant = this.occ.get(accountId);
    if (!occupant) return;

    const path = findPath(
      this.model,
      this.blockedFor(accountId, sitOnArrival ? { x, y } : undefined),
      { x: occupant.x, y: occupant.y },
      { x, y },
    );
    if (!path) {
      this.fail(accountId, "no_path", "no route to that tile");
      return;
    }

    // Walking anywhere ends a sit, including the zero-step case of clicking your own tile.
    if (occupant.posture === "sit") this.standUp(occupant);

    this.cancelWalk(accountId);
    const steps = path.map((t) => ({ x: t.x, y: t.y, z: this.tileZ(t.x, t.y) }));
    this.broadcast(this.walkMsg(occupant, steps));
    if (steps.length === 0) {
      if (sitOnArrival) this.sitHere(accountId);
      return;
    }
    this.walks.set(accountId, {
      path: steps,
      i: 0,
      dest: { x, y },
      sitOnArrival,
      repathed: false,
      timer: setInterval(() => this.step(accountId), MS_PER_TILE),
    });
  }

  /** Seat the occupant on whatever sittable item is under it now — re-resolved on arrival,
   *  because the chair can be picked up or rotated while the walk is in flight. */
  private sitHere(accountId: number): void {
    const occupant = this.occ.get(accountId);
    if (!occupant) return;
    const seat = seatAt(this.ctx(this.furni), { x: occupant.x, y: occupant.y });
    if (!seat) {
      this.fail(accountId, "no_seat", "the seat is gone");
      return;
    }
    this.seatOccupant(occupant, seat.z, seat.dir);
  }

  private seatOccupant(occupant: Occupant, z: number, dir: 0 | 2 | 4 | 6): void {
    occupant.posture = "sit";
    occupant.z = z;
    occupant.dir = dir;
    this.broadcastPosture(occupant);
  }

  private standUp(occupant: Occupant): void {
    occupant.posture = "stand";
    occupant.z = this.tileZ(occupant.x, occupant.y);
    this.broadcastPosture(occupant);
  }

  private broadcastPosture(o: Occupant): void {
    this.broadcast({
      t: "posture", id: o.accountId, posture: o.posture, x: o.x, y: o.y, z: o.z, dir: o.dir,
    });
  }

  /** Ownership is checked before anything is stored, so a refused change leaves both the database
   *  and everyone else's view exactly as they were. */
  setFigure(accountId: number, input: string): void {
    const occupant = this.occ.get(accountId);
    if (!occupant) return;
    let figure: string;
    try {
      figure = saveFigure(this.db, accountId, input);
    } catch (e) {
      this.fail(accountId, "figure", e instanceof FigureError ? e.message : "bad figure");
      return;
    }
    occupant.figure = figure;
    this.broadcast({ t: "figure_changed", id: accountId, figure });
  }

  wave(accountId: number): void {
    if (!this.occ.has(accountId)) return;
    this.broadcast({ t: "wave", id: accountId });
  }

  /** The "use" verb (#326, #347). The def chooses the behaviour and carries its parameters — not
   *  owner-gated, because a bar nobody but its owner can buy from is not a bar. Reach is Chebyshev
   *  1 from any footprint tile, so a 2x1 counter is usable from either end. */
  useFurni(accountId: number, itemId: number): void {
    const occupant = this.occ.get(accountId);
    const item = this.furni.find((f) => f.id === itemId);
    if (!occupant || !item) return;
    const def = this.defOf(item);
    if (!def.interaction) return;

    const reachable = footprintTiles(def, item.x, item.y, item.dir).some(
      (t) => Math.max(Math.abs(t.x - occupant.x), Math.abs(t.y - occupant.y)) <= 1,
    );
    if (!reachable) {
      this.fail(accountId, "bad_position", "you are too far away to use that");
      return;
    }
    const now = Date.now();
    if (now - (this.lastUse.get(accountId) ?? 0) < USE_COOLDOWN_MS) return;
    this.lastUse.set(accountId, now);

    // "read" is vending at price 0 — the same hand, timer and broadcast — kept a separate value so
    // the client can tell a book from a drink without reading the price.
    switch (def.interaction) {
      case "vend":
      case "read":
        if (def.vend) this.vend(occupant, def.vend);
        break;
      case "wash":
        this.broadcast({ t: "action", accountId, action: "wash" });
        break;
      case "wish":
        this.wish(occupant, item.id);
        break;
      case "toggle":
        this.toggle(item);
        break;
      // Clicking the wheel opens the bet panel in the client and nothing more: the wager arrives
      // as its own message, because a spin needs a segment and a stake that "use" cannot carry.
      // The arm is here so the click lands on a no-op rather than falling through to an error.
      case "wheel":
        break;
      case "blackjack":
        this.blackjack?.(accountId);
        break;
    }
  }

  private toggle(item: FurniItem): void {
    item.state = item.state === 0 ? 1 : 0;
    updateItemState(this.db, item.id, item.state);
    this.broadcast({ t: "furni_state", itemId: item.id, state: item.state });
  }

  /** A hand item off a counter, held two minutes and then gone. No mint: nothing enters the item
   *  economy, so a priced one absorbs its Stars outright — the smallest repeatable sink there is.
   *  A free one moves no Stars and writes no ledger row at all. */
  private vend(occupant: Occupant, vend: { item: string; price: number }): void {
    const accountId = occupant.accountId;
    if (occupant.hand) {
      this.emit(accountId, { t: "notice", text: "you are already holding something" });
      return;
    }
    const flavour = HAND_ITEMS.get(vend.item);
    let balance: number | null = null;
    if (vend.price > 0) {
      const result = settleSpend(this.db, {
        opKey: randomUUID(), op: "vend", accountId, price: vend.price,
      });
      if (!result.ok) {
        this.fail(accountId, "purchase", result.reason);
        return;
      }
      balance = result.balance;
    }
    const until = Date.now() + HAND_MS;
    occupant.hand = { item: vend.item, until };
    if (balance !== null) {
      this.emit(accountId, {
        t: "stars", balance, delta: -vend.price, reason: flavour?.reason ?? "vend",
      });
    }
    this.broadcast({ t: "handitem", accountId, item: vend.item, until });
    if (flavour) {
      const tail = vend.price > 0 ? ` −${vend.price} Star${vend.price === 1 ? "" : "s"}.` : "";
      this.emit(accountId, { t: "notice", text: `${flavour.line}${tail}` });
    }
    this.hands.set(accountId, setTimeout(() => this.dropHand(accountId), HAND_MS));
  }

  /** A Star into the water for a fortune and nothing else (#347). The whole point of a wishing
   *  fountain is that the Star does not come back, so there is no mint and no item. */
  private wish(occupant: Occupant, itemId: number): void {
    const accountId = occupant.accountId;
    const result = settleSpend(this.db, {
      opKey: randomUUID(), op: "wish", accountId, price: WISH_COST,
    });
    if (!result.ok) {
      this.fail(accountId, "purchase", result.reason);
      return;
    }
    this.emit(accountId, {
      t: "stars", balance: result.balance, delta: -WISH_COST, reason: "wish",
    });
    this.broadcast({ t: "action", accountId, action: "wish", itemId });
    this.emit(accountId, {
      t: "notice", text: FORTUNES[Math.floor(Math.random() * FORTUNES.length)]!,
    });
  }

  /** A spin of the Grand Wheel (#429). Every refusal below happens before a Star moves, and each
   *  one says what to do about it — a wager that vanishes in silence is the one outcome a player
   *  cannot tell from a lost bet. `roll` is the server's source, handed in per call so a test can
   *  pin the slot the way `leverRoll` pins a prize. */
  wheelBet(
    accountId: number, itemId: number, segment: string, stake: number, roll: () => number,
  ): void {
    const occupant = this.occ.get(accountId);
    if (!occupant) return;
    const item = this.furni.find((f) => f.id === itemId);
    const def = item ? this.defOf(item) : null;
    // R-26 holds by construction: grand_wheel is a house fixture, so the only one in the building
    // is the one furnish.ts stood here, and there is no player-owned instance to find.
    if (!item || !def || def.interaction !== "wheel") {
      this.fail(accountId, "wheel", "there is no wheel there");
      return;
    }

    const inReach = footprintTiles(def, item.x, item.y, item.dir).some(
      (t) => Math.max(Math.abs(t.x - occupant.x), Math.abs(t.y - occupant.y)) <= 1,
    );
    if (!inReach) {
      this.fail(accountId, "wheel", "step up to the wheel first");
      return;
    }
    // The use verb's own cooldown, shared with it rather than counted separately: one spin per
    // window, and a bet the wheel refuses still costs the window, so a bad segment cannot be
    // hammered. `use` drops the second click in silence; a wager cannot, because a bet that
    // produces no message is one the player has to assume they lost.
    const now = Date.now();
    if (now - (this.lastUse.get(accountId) ?? 0) < USE_COOLDOWN_MS) {
      this.fail(accountId, "wheel", "the wheel is still spinning");
      return;
    }
    this.lastUse.set(accountId, now);

    const bet = WHEEL_SEGMENTS[segment];
    if (!bet) {
      this.fail(accountId, "wheel", "that's not a segment on the wheel");
      return;
    }
    if (stake < WHEEL_MIN_STAKE) {
      this.fail(accountId, "wheel", `the wheel takes no less than ${WHEEL_MIN_STAKE} ★`);
      return;
    }
    if (stake > WHEEL_MAX_STAKE) {
      this.fail(accountId, "wheel", `the wheel takes no more than ${WHEEL_MAX_STAKE} ★`);
      return;
    }

    // The stake settles before the draw, so a spin nobody paid for is never resolved. The daily
    // stake cap and an empty balance both come back here as a sentence the ledger wrote.
    const spinId = randomUUID();
    const spend = settleSpend(this.db, {
      opKey: `wheel:${spinId}`, op: "wheel", accountId, price: stake,
    });
    if (!spend.ok) {
      this.fail(accountId, "purchase", spend.reason);
      return;
    }
    this.emit(accountId, {
      t: "stars", balance: spend.balance, delta: -stake, reason: "Grand Wheel",
    });

    const { slot, segment: resultSegment } = wheelDraw(roll());
    const payout = resultSegment === segment ? stake * bet.multiplier : 0;
    if (payout > 0) {
      // A different op_key from the stake's, or the settled() check that makes a resent spin
      // harmless would read the payout as already settled and pay 0.
      const win = settleWin(this.db, {
        opKey: `wheel:${spinId}:win`, op: "wheel", accountId, amount: payout,
      });
      this.emit(accountId, {
        t: "stars", balance: win.balance, delta: payout, reason: "Grand Wheel",
      });
    }
    // The item's state stays 0 and no furni_state goes out: the four declared states render
    // byte-identical until #430 lands the multi-row sheet, so cycling them would be a broadcast
    // that changes nothing on screen. The client spins from `slot` alone.
    this.broadcast({
      t: "wheel_result", itemId: item.id, accountId, name: occupant.username,
      betSegment: segment, resultSegment, slot, stake, payout,
    });
  }

  private dropHand(accountId: number): void {
    this.hands.delete(accountId);
    const occupant = this.occ.get(accountId);
    if (!occupant?.hand) return;
    occupant.hand = undefined;
    this.broadcast({ t: "handitem", accountId, item: null });
  }

  private cancelHand(accountId: number): void {
    const timer = this.hands.get(accountId);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.hands.delete(accountId);
  }

  chat(accountId: number, mode: "say" | "shout", text: string): void {
    const speaker = this.occ.get(accountId);
    if (!speaker) return;
    if (mode === "shout" && !this.chatConfig.shoutAllowed) {
      this.fail(accountId, "bad_message", "shouting is not allowed in this room");
      return;
    }
    const filtered = filterChat(RULESET, text);
    for (const other of this.occ.values()) {
      const heard =
        mode === "shout" ||
        Math.max(Math.abs(other.x - speaker.x), Math.abs(other.y - speaker.y)) <=
          this.chatConfig.speakRadius;
      this.emit(other.accountId, {
        t: "chat",
        from: accountId,
        mode,
        text: heard ? filtered : "…",
        faded: !heard,
      });
    }
  }

  whisper(accountId: number, to: string, text: string): void {
    if (!this.occ.has(accountId)) return;
    const target = [...this.occ.values()].find(
      (o) => o.username.toLowerCase() === to.toLowerCase(),
    );
    if (!target) {
      this.fail(accountId, "whisper_target", `${to} is not in this room`);
      return;
    }
    const msg: ServerMsg = {
      t: "chat",
      from: accountId,
      mode: "whisper",
      text: filterChat(RULESET, text),
      faded: false,
    };
    this.emit(target.accountId, msg);
    if (target.accountId !== accountId) this.emit(accountId, msg);
  }

  place(accountId: number, itemId: number, x: number, y: number, dir: 0 | 2 | 4 | 6): boolean {
    const item = getItem(this.db, itemId);
    if (!item || item.ownerId !== accountId || item.roomId !== null) {
      this.fail(accountId, "not_owner", "that item is not in your inventory");
      return false;
    }
    if (WALL_DEFS.has(item.defId)) {
      this.fail(accountId, "bad_position", "that one hangs on a wall, not the floor");
      return false;
    }
    const result = checkPlacement(this.ctx(this.furni), this.defOf(item), x, y, dir);
    if (!result.ok) {
      this.fail(accountId, result.code, `cannot place there: ${result.code}`);
      return false;
    }

    placeItem(this.db, itemId, this.roomId, x, y, result.z, dir);
    const placed: FurniItem = {
      id: itemId, defId: item.defId, x, y, z: result.z, dir, state: item.state,
    };
    this.furni.push(placed);
    this.reindex();
    this.broadcast({ t: "furni_placed", item: { ...placed } });
    return true;
  }

  placeWall(
    accountId: number, itemId: number, side: WallSide, x: number, y: number, u: number, v: number,
  ): boolean {
    const item = getItem(this.db, itemId);
    if (!item || item.ownerId !== accountId || item.roomId !== null) {
      this.fail(accountId, "not_owner", "that item is not in your inventory");
      return false;
    }
    const def = WALL_DEFS.get(item.defId);
    if (!def) {
      this.fail(accountId, "bad_position", "that one stands on the floor, not a wall");
      return false;
    }
    const result = checkWallPlacement(this.wallCtx(this.wallFurni), def, side, x, y, u, v);
    if (!result.ok) {
      this.fail(accountId, result.code, `cannot hang it there: ${result.code}`);
      return false;
    }

    placeWallItem(this.db, itemId, this.roomId, side, x, y, u, v);
    const hung: WallItem = { id: itemId, defId: item.defId, side, x, y, u, v, state: item.state };
    this.wallFurni.push(hung);
    this.broadcast({ t: "wall_placed", item: { ...hung } });
    return true;
  }

  /** Quarter turn in place. Rotation can change the footprint (a 2x1 sofa sweeps a different two
   *  tiles), so it re-runs the full placement check against the room minus this item. */
  rotate(accountId: number, itemId: number): void {
    const item = getItem(this.db, itemId);
    if (!item || item.ownerId !== accountId || item.roomId !== this.roomId) {
      this.fail(accountId, "not_owner", "that item is not yours to rotate");
      return;
    }
    // On permanent exhibition means the house arranges it, not the donor (#210).
    if (item.locked) {
      this.fail(accountId, "not_owner", "that is on permanent exhibition and cannot be moved");
      return;
    }
    const def = this.defOf(item);
    const dir = ((item.dir + 2) % 8) as 0 | 2 | 4 | 6;
    const others = this.furni.filter((f) => f.id !== itemId);
    // Anyone already on the item turns with it — only a tile the turn newly sweeps into can be
    // blocked by an avatar. Without this, a 1x1 chair could never be turned while sat on.
    const covered = footprintTiles(def, item.x, item.y, item.dir);
    const ctx = this.ctx(others);
    const result = checkPlacement(
      { ...ctx, avatars: ctx.avatars.filter((a) => !covered.some((c) => c.x === a.x && c.y === a.y)) },
      def, item.x, item.y, dir,
    );
    if (!result.ok) {
      this.fail(accountId, result.code, `cannot turn it there: ${result.code}`);
      return;
    }

    placeItem(this.db, itemId, this.roomId, item.x, item.y, result.z, dir);
    const turned = this.furni.find((f) => f.id === itemId);
    if (!turned) return;
    turned.dir = dir;
    turned.z = result.z;
    this.reindex();
    this.broadcast({ t: "furni_moved", item: { ...turned } });

    // Anyone sitting on it turns with it, or is put down if the seat moved out from under them.
    for (const o of this.occ.values()) {
      if (o.posture !== "sit") continue;
      const seat = seatAt(this.ctx(this.furni), { x: o.x, y: o.y });
      if (seat) this.seatOccupant(o, seat.z, seat.dir);
      else this.standUp(o);
    }
  }

  pickup(accountId: number, itemId: number): void {
    const item = getItem(this.db, itemId);
    if (!item || item.ownerId !== accountId || item.roomId !== this.roomId) {
      this.fail(accountId, "not_owner", "that item is not yours to pick up");
      return;
    }
    // A museum donation stays donated (#210). The donor still owns it — their name is on the
    // plaque — but "permanent public exhibition" has to mean the house keeps it.
    if (item.locked) {
      this.fail(accountId, "not_owner", "that is on permanent exhibition and cannot be taken back");
      return;
    }
    // Nothing rests on a hanging item and nothing sits under it, so taking one down is the whole
    // job — no settle pass, no seat re-resolve.
    if (item.side !== null) {
      pickupItem(this.db, itemId);
      this.wallFurni = this.wallFurni.filter((f) => f.id !== itemId);
      this.broadcast({ t: "furni_removed", itemId });
      this.emit(accountId, { t: "inventory_add", item: { id: itemId, defId: item.defId } });
      return;
    }
    const def = this.defOf(item);
    const vacated = footprintTiles(def, item.x, item.y, item.dir);
    const removedTop = item.z + (def.stackHeights[item.state] ?? 0);

    pickupItem(this.db, itemId);
    this.furni = this.furni.filter((f) => f.id !== itemId);
    this.reindex();
    this.broadcast({ t: "furni_removed", itemId });
    this.emit(accountId, { t: "inventory_add", item: { id: itemId, defId: item.defId } });

    // Anything that was resting on the removed item settles onto what is left. Lowest first, so
    // a stack collapses from the bottom up.
    const resting = this.furni
      .filter(
        (f) =>
          f.z >= removedTop &&
          footprintTiles(this.defOf(f), f.x, f.y, f.dir).some((t) =>
            vacated.some((v) => v.x === t.x && v.y === t.y),
          ),
      )
      .sort((a, b) => a.z - b.z);
    for (const f of resting) {
      const below = this.ctx(this.furni.filter((o) => o.id !== f.id));
      const tiles = footprintTiles(this.defOf(f), f.x, f.y, f.dir);
      f.z = Math.max(...tiles.map((t) => stackTop(below, t)));
      updateItemZ(this.db, f.id, f.z);
      this.broadcast({ t: "furni_moved", item: { ...f } });
    }

    // Removing a chair out from under someone puts them on the floor rather than leaving them
    // floating. Runs after the settle so a sitter lands on whatever is left below.
    for (const o of this.occ.values()) {
      if (o.posture !== "sit") continue;
      if (!vacated.some((v) => v.x === o.x && v.y === o.y)) continue;
      const seat = seatAt(this.ctx(this.furni), { x: o.x, y: o.y });
      if (seat) this.seatOccupant(o, seat.z, seat.dir);
      else this.standUp(o);
    }
  }

  private step(accountId: number): void {
    const walk = this.walks.get(accountId);
    const occupant = this.occ.get(accountId);
    if (!walk || !occupant) return;

    const next = walk.path[walk.i];
    if (!next) {
      this.cancelWalk(accountId);
      return;
    }
    const exempt = walk.sitOnArrival ? walk.dest : undefined;
    if (this.blockedFor(accountId, exempt)(next.x, next.y)) {
      // One retry: re-route from here to the same destination before giving up. A second block
      // after the retry is spent cancels outright, so a walker can never thrash.
      if (!walk.repathed) {
        const path = findPath(
          this.model, this.blockedFor(accountId, exempt), { x: occupant.x, y: occupant.y }, walk.dest,
        );
        if (path) {
          walk.path = path.map((t) => ({ x: t.x, y: t.y, z: this.tileZ(t.x, t.y) }));
          walk.i = 0;
          walk.repathed = true;
          this.broadcast(this.walkMsg(occupant, walk.path));
          return;
        }
      }
      // No route around it, or the retry is already spent — stop here and tell the room where
      // the avatar actually is.
      this.cancelWalk(accountId);
      this.broadcast(this.walkMsg(occupant, []));
      return;
    }

    occupant.dir = dirFromStep(next.x - occupant.x, next.y - occupant.y);
    occupant.x = next.x;
    occupant.y = next.y;
    occupant.z = next.z;
    walk.i++;
    if (walk.i < walk.path.length) return;
    const sit = walk.sitOnArrival;
    this.cancelWalk(accountId);
    if (sit) this.sitHere(accountId);
  }

  private cancelWalk(accountId: number): void {
    const walk = this.walks.get(accountId);
    if (!walk) return;
    clearInterval(walk.timer);
    this.walks.delete(accountId);   // the destination reservation dies with the walk
  }

  private walkMsg(occupant: Occupant, path: Step[]): ServerMsg {
    return {
      t: "walk",
      id: occupant.accountId,
      msPerTile: MS_PER_TILE,
      from: { x: occupant.x, y: occupant.y, z: occupant.z },
      startedAt: Date.now(),
      path,
    };
  }

  /** Non-walkable furni, other avatars, and other walkers' reserved destinations. `exempt` is a
   *  seat tile this mover is allowed to finish on — its furni stops blocking, its occupants and
   *  reservations do not. */
  private blockedFor(accountId: number, exempt?: Tile): (x: number, y: number) => boolean {
    // The pathfinder probes this up to eight times per tile it expands, so the two scans this
    // used to do per probe were the search's own cost multiplied by the room's population. Both
    // sets are read-only for the life of the closure — a walk is planned in one synchronous pass,
    // and nothing moves inside it.
    const taken = new Set<string>();
    for (const o of this.occ.values()) {
      if (o.accountId !== accountId) taken.add(key(o.x, o.y));
    }
    for (const [id, walk] of this.walks) {
      if (id !== accountId) taken.add(key(walk.dest.x, walk.dest.y));
    }
    return (x, y) => {
      if (!(exempt && exempt.x === x && exempt.y === y) && this.furniBlocks(x, y)) return true;
      return taken.has(key(x, y));
    };
  }

  private furniBlocks(x: number, y: number): boolean {
    const items = this.index.get(key(x, y));
    return items !== undefined && items.some((it) => !this.defOf(it).canWalk);
  }

  private spawnTile(): Tile {
    const free = (x: number, y: number): boolean =>
      !this.furniBlocks(x, y) &&
      ![...this.occ.values()].some((o) => o.x === x && o.y === y);

    const door: Tile = { x: this.door.x, y: this.door.y };
    if (free(door.x, door.y)) return door;

    const seen = new Set([key(door.x, door.y)]);
    const queue: Tile[] = [door];
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head] ?? door;
      const h = tileHeight(this.model, cur.x, cur.y);
      for (const s of DIR_STEPS) {
        const t: Tile = { x: cur.x + s.dx, y: cur.y + s.dy };
        if (seen.has(key(t.x, t.y))) continue;
        if (!climbOk(h, tileHeight(this.model, t.x, t.y)) || this.furniBlocks(t.x, t.y)) continue;
        seen.add(key(t.x, t.y));
        if (free(t.x, t.y)) return t;
        queue.push(t);
      }
    }
    return door;   // every reachable tile is taken — stack on the door rather than refuse the join
  }

  private reindex(): void {
    this.index.clear();
    this.openMask = null;   // furni moved: what is reachable from the door moved with it
    for (const item of this.furni) {
      for (const t of footprintTiles(this.defOf(item), item.x, item.y, item.dir)) {
        const at = this.index.get(key(t.x, t.y));
        if (at) at.push(item);
        else this.index.set(key(t.x, t.y), [item]);
      }
    }
  }

  private ctx(furni: FurniItem[]): PlacementCtx {
    return {
      model: this.model,
      furni,
      defs: DEFS,
      avatars: [...this.occ.values()].map((o) => ({ x: o.x, y: o.y })),
      doorTile: { x: this.door.x, y: this.door.y },
      roomFurniCap: ROOM_FURNI_CAP,
    };
  }

  /** The cap counts both surfaces — a room full of posters is still a full room. */
  private wallCtx(wallFurni: WallItem[]): WallPlacementCtx {
    return {
      model: this.model,
      wallFurni,
      defs: WALL_DEFS,
      furniCount: this.furni.length + wallFurni.length,
      roomFurniCap: ROOM_FURNI_CAP,
    };
  }

  /** The height an avatar stands at: the floor plus anything walkable on it, like a rug. Solid
   *  furni is deliberately ignored — you stand on a rug, never on top of a chair, and the seat
   *  tile you can now finish a walk on must still report its floor. */
  private tileZ(x: number, y: number): number {
    return stackTop(this.ctx(this.furni.filter((f) => this.defOf(f).canWalk)), { x, y });
  }

  private defOf(item: { defId: string }): FurniDef {
    const def = DEFS.get(item.defId);
    if (!def) throw new Error(`unknown furni def: ${item.defId}`);
    return def;
  }

  /** A line the whole room reads, named for the occupant it is about (#433). The card table is
   *  private by construction — the hand lives in a per-account service — so a win only becomes
   *  the room's business through here. Silent for someone who has already left: the announcement
   *  belongs to the room they were standing in, not the one they walked into. */
  announce(accountId: number, phrase: string): void {
    const occupant = this.occ.get(accountId);
    if (!occupant) return;
    this.broadcast({ t: "notice", text: `${occupant.username} ${phrase}` });
  }

  private broadcast(msg: ServerMsg): void {
    for (const id of this.occ.keys()) this.emit(id, msg);
  }

  private fail(accountId: number, code: ErrorCode, message: string): void {
    this.emit(accountId, { t: "error", code, message });
  }
}
