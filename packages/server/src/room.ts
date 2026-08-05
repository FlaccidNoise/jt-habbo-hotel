import {
  DIR_STEPS,
  PROTOTYPE_CATALOG,
  ROOM_FURNI_CAP,
  checkPlacement,
  climbOk,
  dirFromStep,
  footprintTiles,
  parseHeightmap,
  stackTop,
  tileHeight,
} from "@grand/shared";
import type {
  AvatarState,
  Door,
  ErrorCode,
  FurniDef,
  FurniItem,
  PlacementCtx,
  RoomModel,
  ServerMsg,
  Tile,
} from "@grand/shared";
import type Database from "better-sqlite3";
import { filterChat, loadRuleset } from "./filter.ts";
import { balanceOf } from "./ledger.ts";
import { findPath } from "./pathfind.ts";
import {
  getItem,
  listInventory,
  listRoomFurni,
  pickupItem,
  placeItem,
  updateItemZ,
} from "./items.ts";

export const MS_PER_TILE = 500;

export interface Occupant {
  accountId: number;
  username: string;
  x: number;
  y: number;
  z: number;
  dir: number;
  staff?: boolean;
}
export type Emit = (accountId: number, msg: ServerMsg) => void;

interface Step { x: number; y: number; z: number }
interface ChatConfig { speakRadius: number; shoutAllowed: boolean }
interface RoomDoc { heightmap: string; door: Door; chat: ChatConfig }
interface Walk {
  path: Step[];
  i: number;
  dest: Tile;                     // reserved until arrival or cancel
  timer: ReturnType<typeof setInterval>;
}

const DEFS: ReadonlyMap<string, FurniDef> = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
const RULESET = loadRuleset(new URL("../filter-words.txt", import.meta.url).pathname);

const key = (x: number, y: number): string => `${x},${y}`;

function toAvatar(o: Occupant): AvatarState {
  return {
    id: o.accountId, username: o.username, x: o.x, y: o.y, z: o.z, dir: o.dir, posture: "stand",
    ...(o.staff ? { staff: true } : {}),
  };
}

export class Room {
  readonly roomId: number;
  readonly name: string;
  readonly model: RoomModel;
  readonly door: Door;
  readonly chatConfig: ChatConfig;
  private db: Database.Database;
  private emit: Emit;
  private heightmap: string;
  private furni: FurniItem[];
  private index: Map<string, FurniItem[]>;   // occupancy: tile → items covering it
  private occ: Map<number, Occupant>;
  private walks: Map<number, Walk>;

  constructor(db: Database.Database, roomId: number, emit: Emit) {
    const row = db.prepare("SELECT name, doc FROM rooms WHERE id = ?").get(roomId) as
      | { name: string; doc: string }
      | undefined;
    if (!row) throw new Error(`no such room: ${roomId}`);
    const doc = JSON.parse(row.doc) as RoomDoc;

    this.db = db;
    this.emit = emit;
    this.roomId = roomId;
    this.name = row.name;
    this.heightmap = doc.heightmap;
    this.door = doc.door;
    this.chatConfig = doc.chat;
    this.model = parseHeightmap(doc.heightmap, doc.door);
    this.furni = listRoomFurni(db, roomId);
    this.index = new Map();
    this.occ = new Map();
    this.walks = new Map();
    this.reindex();
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
    };
    this.occ.set(accountId, occupant);

    this.emit(accountId, {
      t: "room_state",
      roomId: this.roomId,
      name: this.name,
      heightmap: this.heightmap,
      door: this.door,
      chat: this.chatConfig,
      avatars: [...this.occ.values()].map(toAvatar),
      furni: this.furni.map((f) => ({ ...f })),
      inventory: listInventory(this.db, accountId),
      you: accountId,
      stars: balanceOf(this.db, accountId),
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
    if (!this.occ.delete(accountId)) return;
    this.broadcast({ t: "avatar_leave", id: accountId });
  }

  dispose(): void {
    for (const id of [...this.walks.keys()]) this.cancelWalk(id);
    this.occ.clear();
  }

  requestMove(accountId: number, x: number, y: number): void {
    const occupant = this.occ.get(accountId);
    if (!occupant) return;

    const path = findPath(
      this.model,
      this.blockedFor(accountId),
      { x: occupant.x, y: occupant.y },
      { x, y },
    );
    if (!path) {
      this.fail(accountId, "no_path", "no route to that tile");
      return;
    }

    this.cancelWalk(accountId);
    const steps = path.map((t) => ({ x: t.x, y: t.y, z: this.tileZ(t.x, t.y) }));
    this.broadcast(this.walkMsg(occupant, steps));
    if (steps.length === 0) return;
    this.walks.set(accountId, {
      path: steps,
      i: 0,
      dest: { x, y },
      timer: setInterval(() => this.step(accountId), MS_PER_TILE),
    });
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

  place(accountId: number, itemId: number, x: number, y: number, dir: 0 | 2 | 4 | 6): void {
    const item = getItem(this.db, itemId);
    if (!item || item.ownerId !== accountId || item.roomId !== null) {
      this.fail(accountId, "not_owner", "that item is not in your inventory");
      return;
    }
    const result = checkPlacement(this.ctx(this.furni), this.defOf(item), x, y, dir);
    if (!result.ok) {
      this.fail(accountId, result.code, `cannot place there: ${result.code}`);
      return;
    }

    placeItem(this.db, itemId, this.roomId, x, y, result.z, dir);
    const placed: FurniItem = {
      id: itemId, defId: item.defId, x, y, z: result.z, dir, state: item.state,
    };
    this.furni.push(placed);
    this.reindex();
    this.broadcast({ t: "furni_placed", item: { ...placed } });
  }

  pickup(accountId: number, itemId: number): void {
    const item = getItem(this.db, itemId);
    if (!item || item.ownerId !== accountId || item.roomId !== this.roomId) {
      this.fail(accountId, "not_owner", "that item is not yours to pick up");
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
    if (this.blockedFor(accountId)(next.x, next.y)) {
      // Blocked since path time — stop here and tell the room where the avatar actually is.
      this.cancelWalk(accountId);
      this.broadcast(this.walkMsg(occupant, []));
      return;
    }

    occupant.dir = dirFromStep(next.x - occupant.x, next.y - occupant.y);
    occupant.x = next.x;
    occupant.y = next.y;
    occupant.z = next.z;
    walk.i++;
    if (walk.i >= walk.path.length) this.cancelWalk(accountId);
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

  /** Non-walkable furni, other avatars, and other walkers' reserved destinations. */
  private blockedFor(accountId: number): (x: number, y: number) => boolean {
    return (x, y) => {
      if (this.furniBlocks(x, y)) return true;
      for (const o of this.occ.values()) {
        if (o.accountId !== accountId && o.x === x && o.y === y) return true;
      }
      for (const [id, walk] of this.walks) {
        if (id !== accountId && walk.dest.x === x && walk.dest.y === y) return true;
      }
      return false;
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

  private tileZ(x: number, y: number): number {
    return stackTop(this.ctx(this.furni), { x, y });
  }

  private defOf(item: { defId: string }): FurniDef {
    const def = DEFS.get(item.defId);
    if (!def) throw new Error(`unknown furni def: ${item.defId}`);
    return def;
  }

  private broadcast(msg: ServerMsg): void {
    for (const id of this.occ.keys()) this.emit(id, msg);
  }

  private fail(accountId: number, code: ErrorCode, message: string): void {
    this.emit(accountId, { t: "error", code, message });
  }
}
