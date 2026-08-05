import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { extname, join, normalize, resolve, sep } from "node:path";
import { WebSocket, WebSocketServer } from "ws";
import type { RawData } from "ws";
import { z } from "zod";
import {
  CATALOG_PRICES, ClientMsgSchema, LEVER_COST, PRESTIGE_DEFS, ROOM_CAPACITY, leverDraw,
} from "@grand/shared";
import type { ClientMsg, ErrorCode, ServerMsg } from "@grand/shared";
import { ArcadeService } from "./arcade.ts";
import { AuthError, login, register, sessionAccount } from "./auth.ts";
import { closeDb, openDb } from "./db.ts";
import {
  COFFEE_STARS, NPC_FAUCET_CAP, settleEarn, settlePurchase, settleSpend, settleTrickle,
} from "./ledger.ts";
import { log } from "./log.ts";
import { flows, hourly, ledgerStats, startLagSampler, wsStats } from "./metrics.ts";
import { advanceOnboarding, onboardingHint } from "./onboarding.ts";
import type { OnboardingEvent } from "./onboarding.ts";
import { NpcService, llmFromEnv } from "./npc.ts";
import type { NpcGenerate } from "./npc.ts";
import { Room } from "./room.ts";
import type { Emit } from "./room.ts";
import { claimCompletedSets, progressFor } from "./sets.ts";
import { TradeService } from "./trade.ts";

const BODY_CAP = 1024;
const HANDSHAKE_MS = 5000;
const DISPOSE_MS = 5 * 60 * 1000;

const MIME: Record<string, string> = {
  ".css": "text/css",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript",
  ".json": "application/json",
  ".map": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

export interface ServerHandle {
  close(): Promise<void>;
  port: number;
  stats(): { rooms: number };
}

interface Conn {
  ws: WebSocket;
  accountId?: number;
  username?: string;
  roomId?: number;
  handshake?: ReturnType<typeof setTimeout>;
}

interface RoomEntry {
  room: Room;
  dispose?: ReturnType<typeof setTimeout>;
}

export async function startServer(opts: {
  port: number;
  dbPath: string;
  staticDir?: string;
  handshakeMs?: number;
  disposeMs?: number;
  /** NPC line generator. Omit for the NPC_LLM_* env config; null for canned lines only. */
  npcGenerate?: NpcGenerate | null;
  tradeCountdownMs?: number;
  /** Hi-Lo card source, 1..13. Tests inject a scripted deck. */
  arcadeDraw?: () => number;
  /** Luck Lever roll source in [0, 1). Tests pin it to land on a chosen prize. */
  leverRoll?: () => number;
}): Promise<ServerHandle> {
  const db = openDb(opts.dbPath);
  const staticRoot = opts.staticDir ? resolve(opts.staticDir) : undefined;
  const handshakeMs = opts.handshakeMs ?? HANDSHAKE_MS;
  const disposeMs = opts.disposeMs ?? DISPOSE_MS;

  const conns = new Map<WebSocket, Conn>();
  const byAccount = new Map<number, WebSocket>();
  const rooms = new Map<number, RoomEntry>();
  const httpSockets = new Set<Socket>();
  const lagSampler = startLagSampler();
  // Set only while a displaced socket hands its occupant to a new one: observers see neither the
  // leave nor the re-join.
  let transferring: number | null = null;

  function send(ws: WebSocket, msg: ServerMsg): void {
    if (msg.t === "error") log("error_emitted", { code: msg.code, message: msg.message });
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function fail(ws: WebSocket, code: ErrorCode, message: string): void {
    send(ws, { t: "error", code, message });
  }

  const quest = (accountId: number, event: OnboardingEvent): void => {
    const text = advanceOnboarding(db, accountId, event);
    if (text) emit(accountId, { t: "notice", text });
  };

  const emit: Emit = (accountId, msg) => {
    if (transferring !== null) {
      if (msg.t === "avatar_join" && msg.avatar.id === transferring) return;
      if (msg.t === "avatar_leave" && msg.id === transferring) return;
    }
    const ws = byAccount.get(accountId);
    if (ws) send(ws, msg);
  };

  const npcService = new NpcService({
    generate: opts.npcGenerate !== undefined ? opts.npcGenerate : llmFromEnv(),
    say: (roomId, npcId, text) => rooms.get(roomId)?.room.chat(npcId, "say", text),
    // The one NPC payout path: a deterministic server trigger into the ledger, which clamps to
    // the NPC faucet cap and the global earn ceiling. The LLM is not in this code path.
    payout: (accountId, ritual) => {
      const op = `npc_${ritual}`;
      const { granted, balance } = settleEarn(db, {
        opKey: randomUUID(),
        op,
        accountId,
        amount: COFFEE_STARS,
        opCap: NPC_FAUCET_CAP,
      });
      log("faucet", { op, accountId, granted, balance });
      if (granted > 0) emit(accountId, { t: "stars", balance, delta: granted, reason: ritual });
      quest(accountId, "coffee");
      return granted;
    },
  });

  const tradeService = new TradeService({
    db,
    emit,
    locate: (accountId) => {
      const ws = byAccount.get(accountId);
      const conn = ws ? conns.get(ws) : undefined;
      if (!conn || conn.roomId === undefined || conn.username === undefined) return null;
      return { roomId: conn.roomId, username: conn.username };
    },
    resolve: (roomId, username) => {
      const found = rooms
        .get(roomId)
        ?.room.occupants()
        .find((o) => o.username.toLowerCase() === username.toLowerCase());
      return found ? { accountId: found.accountId, staff: found.staff } : null;
    },
    countdownMs: opts.tradeCountdownMs,
    onSettled: settleSets,
  });

  /** Collection sets (#210). Called after anything that can add a def to an account — a buy, a
   *  lever win, a trade — plus on join so the player sees where each set stands. */
  function settleSets(accountId: number): void {
    for (const done of claimCompletedSets(db, accountId)) {
      log("set_complete", { accountId, setId: done.setId, defId: done.defId });
      const item = { id: done.itemId, defId: done.defId, bound: true };
      emit(accountId, {
        t: "set_complete", setId: done.setId, name: done.name, badge: done.badge, item,
      });
      emit(accountId, { t: "inventory_add", item });
    }
    emit(accountId, { t: "sets", sets: progressFor(db, accountId) });
  }

  const arcadeService = new ArcadeService({ db, emit, draw: opts.arcadeDraw });
  const leverRoll = opts.leverRoll ?? Math.random;

  const NAV_LIMIT = 60;

  /** The Navigator listing: every open room, busiest first. Rooms with nobody in them are not
   *  loaded, so their live count is zero by construction. */
  function navRooms(accountId: number): Array<{
    roomId: number;
    name: string;
    players: number;
    yours: boolean;
  }> {
    const listed = db
      .prepare("SELECT id, name, owner_id AS ownerId FROM rooms WHERE state = 'open'")
      .all() as Array<{ id: number; name: string; ownerId: number | null }>;
    return listed
      .map((r) => ({
        roomId: r.id,
        name: r.name,
        players: rooms.get(r.id)?.room.occupantCount() ?? 0,
        yours: r.ownerId === accountId,
      }))
      .sort((a, b) => b.players - a.players || a.roomId - b.roomId)
      .slice(0, NAV_LIMIT);
  }

  function roomExists(roomId: number): boolean {
    if (rooms.has(roomId)) return true;
    return db.prepare("SELECT 1 FROM rooms WHERE id = ?").get(roomId) !== undefined;
  }

  function getRoom(roomId: number): Room {
    const entry = rooms.get(roomId);
    if (entry) {
      clearTimeout(entry.dispose);
      entry.dispose = undefined;
      return entry.room;
    }
    const room = new Room(db, roomId, emit);
    for (const def of npcService.npcsFor(roomId)) room.addNpc(def);
    rooms.set(roomId, { room });
    return room;
  }

  function leaveRoom(conn: Conn): void {
    const roomId = conn.roomId;
    if (roomId === undefined || conn.accountId === undefined) return;
    conn.roomId = undefined;
    tradeService.onLeave(conn.accountId);
    arcadeService.onLeave(conn.accountId);
    const entry = rooms.get(roomId);
    if (!entry) return;

    entry.room.leave(conn.accountId);
    log("leave", { accountId: conn.accountId, roomId });
    if (entry.room.occupantCount() > 0) return;
    npcService.onRoomEmpty(roomId);
    entry.dispose = setTimeout(() => {
      entry.room.dispose();
      rooms.delete(roomId);
    }, disposeMs);
  }

  function handleJoin(conn: Conn, msg: Extract<ClientMsg, { t: "join" }>): void {
    if (conn.accountId !== undefined) {
      fail(conn.ws, "already_joined", "this socket is already in a room");
      return;
    }
    const account = sessionAccount(db, msg.token);
    if (!account) {
      conn.ws.close(4401, "bad token");
      return;
    }
    if (!roomExists(msg.roomId)) {
      fail(conn.ws, "no_room", `no room ${msg.roomId}`);
      return;
    }
    // Capacity counts players, not staff. Someone already inside is not turned away by their own
    // presence — that would make a reconnect impossible in a full room.
    const live = rooms.get(msg.roomId)?.room;
    const inside = live?.occupants().some((o) => o.accountId === account.id) ?? false;
    if (!inside && (live?.occupantCount() ?? 0) >= ROOM_CAPACITY) {
      fail(conn.ws, "room_busy", `that room is full (${ROOM_CAPACITY} people)`);
      return;
    }
    clearTimeout(conn.handshake);
    conn.handshake = undefined;

    const previous = byAccount.get(account.id);
    // Same room: the occupant moves to the new socket untouched. Different room: an ordinary
    // leave, so the old room's occupants are told.
    const silent = previous !== undefined && conns.get(previous)?.roomId === msg.roomId;
    if (previous) {
      wsStats.reconnects++;
      byAccount.delete(account.id);
      const stale = conns.get(previous);
      if (silent) transferring = account.id;
      if (stale) leaveRoom(stale);
      transferring = null;
      previous.close(4409, "signed in elsewhere");
    }

    const room = getRoom(msg.roomId);
    conn.accountId = account.id;
    conn.username = account.username;
    conn.roomId = msg.roomId;
    byAccount.set(account.id, conn.ws);
    // Before the join, so room_state carries the balance the player is about to be told about.
    const trickle = settleTrickle(db, account.id);
    if (silent) transferring = account.id;
    try {
      room.join(account.id, account.username);
    } finally {
      transferring = null;
    }
    if (trickle.granted > 0) {
      log("faucet", { op: "trickle", accountId: account.id, granted: trickle.granted });
      emit(account.id, {
        t: "stars",
        balance: trickle.balance,
        delta: trickle.granted,
        reason: "welcome trickle",
      });
    }
    // Also claims: an account can complete a set through a path that predates this code, and a
    // reward owed is a reward paid the next time it joins.
    settleSets(account.id);
    log("join", { accountId: account.id, username: account.username, roomId: msg.roomId });
    npcService.onPlayerJoin(msg.roomId, account.username);
    const hint = onboardingHint(db, account.id);
    if (hint) send(conn.ws, { t: "notice", text: hint });
  }

  function dispatch(conn: Conn, msg: ClientMsg): void {
    if (msg.t === "join") {
      fail(conn.ws, "already_joined", "this socket is already in a room");
      return;
    }
    const accountId = conn.accountId;
    const entry = conn.roomId === undefined ? undefined : rooms.get(conn.roomId);
    if (accountId === undefined || !entry) throw new Error("message from a socket with no room");
    const room = entry.room;

    switch (msg.t) {
      case "move":
        room.requestMove(accountId, msg.x, msg.y);
        break;
      case "chat": {
        room.chat(accountId, msg.mode, msg.text);
        const speaker = room.occupants().find((o) => o.accountId === accountId);
        if (speaker) npcService.onPlayerChat(room.roomId, speaker, msg.mode, msg.text);
        break;
      }
      case "whisper":
        room.whisper(accountId, msg.to, msg.text);
        break;
      case "place":
        if (room.place(accountId, msg.itemId, msg.x, msg.y, msg.dir)) quest(accountId, "place");
        log("place", { accountId, roomId: conn.roomId, itemId: msg.itemId, x: msg.x, y: msg.y });
        break;
      case "place_wall":
        if (room.placeWall(accountId, msg.itemId, msg.side, msg.x, msg.y, msg.u, msg.v)) {
          quest(accountId, "place");
        }
        log("place_wall", {
          accountId, roomId: conn.roomId, itemId: msg.itemId, side: msg.side, x: msg.x, y: msg.y,
        });
        break;
      case "pickup":
        room.pickup(accountId, msg.itemId);
        log("pickup", { accountId, roomId: conn.roomId, itemId: msg.itemId });
        break;
      case "rotate":
        room.rotate(accountId, msg.itemId);
        log("rotate", { accountId, roomId: conn.roomId, itemId: msg.itemId });
        break;
      case "sit":
        room.requestSit(accountId, msg.x, msg.y);
        break;
      case "stand":
        room.requestStand(accountId);
        break;
      case "trade_open":
        tradeService.open(accountId, msg.to);
        break;
      case "trade_offer":
        tradeService.offer(accountId, msg.itemIds);
        break;
      case "trade_accept":
        tradeService.accept(accountId);
        break;
      case "trade_cancel":
        tradeService.cancel(accountId);
        break;
      case "buy": {
        const price = CATALOG_PRICES.get(msg.defId);
        if (price === undefined) {
          fail(conn.ws, "purchase", "that item is not in the catalog");
          break;
        }
        // Prestige fixtures mint account-bound under their own ledger op, so /api/metrics can
        // tell "the catalog absorbed 3,300" from "the deep sink absorbed 3,300" (#210).
        const prestige = PRESTIGE_DEFS.has(msg.defId);
        const result = prestige
          ? settleSpend(db, {
              opKey: randomUUID(), op: "prestige", accountId, price,
              mint: { defId: msg.defId, bound: true },
            })
          : settlePurchase(db, { opKey: randomUUID(), accountId, defId: msg.defId, price });
        log("purchase", { accountId, defId: msg.defId, price, prestige, ok: result.ok });
        if (!result.ok) {
          fail(conn.ws, "purchase", result.reason);
          break;
        }
        emit(accountId, {
          t: "stars", balance: result.balance, delta: -price,
          reason: prestige ? "prestige" : "purchase",
        });
        emit(accountId, {
          t: "inventory_add",
          item: { id: result.itemId ?? 0, defId: msg.defId, ...(prestige ? { bound: true } : {}) },
        });
        settleSets(accountId);
        quest(accountId, "purchase");
        break;
      }
      // The Luck Lever (#210): one message, one draw, no session — the only repeatable sink, so
      // it is the one that keeps absorbing after the catalog has been bought out.
      case "lever_pull": {
        const prize = leverDraw(leverRoll());
        const result = settleSpend(db, {
          opKey: randomUUID(), op: "lever", accountId, price: LEVER_COST,
          ...(prize.defId ? { mint: { defId: prize.defId } } : {}),
        });
        log("lever", { accountId, prize: prize.defId, ok: result.ok });
        if (!result.ok) {
          fail(conn.ws, "purchase", result.reason);
          break;
        }
        emit(accountId, {
          t: "stars", balance: result.balance, delta: -LEVER_COST, reason: "Luck Lever",
        });
        const won = prize.defId && result.itemId
          ? { id: result.itemId, defId: prize.defId }
          : undefined;
        emit(accountId, {
          t: "lever_result", defId: prize.defId, label: prize.label, balance: result.balance,
          ...(won ? { item: won } : {}),
        });
        if (won) {
          emit(accountId, { t: "inventory_add", item: won });
          settleSets(accountId);
        }
        break;
      }
      case "nav_list":
        send(conn.ws, { t: "nav_rooms", rooms: navRooms(accountId) });
        break;
      case "arcade_start":
        arcadeService.start(accountId);
        quest(accountId, "arcade");
        break;
      case "arcade_move":
        arcadeService.move(accountId, msg.move);
        break;
    }
  }

  function decode(data: RawData, isBinary: boolean): ClientMsg | null {
    if (isBinary) return null;
    try {
      const parsed = ClientMsgSchema.safeParse(JSON.parse(data.toString()));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  function onMessage(conn: Conn, data: RawData, isBinary: boolean): void {
    try {
      const msg = decode(data, isBinary);
      if (conn.accountId === undefined) {
        // Pre-join: anything but a valid join is a failed handshake, not a bad frame.
        if (!msg || msg.t !== "join") {
          conn.ws.close(4401, "join first");
          return;
        }
        handleJoin(conn, msg);
        return;
      }
      if (!msg) {
        log("malformed_frame", { accountId: conn.accountId, binary: isBinary });
        fail(conn.ws, "bad_message", "unreadable message");
        return;
      }
      dispatch(conn, msg);
    } catch (e) {
      log("handler_error", { accountId: conn.accountId, message: String(e) });
      fail(conn.ws, "internal", "internal error");
    }
  }

  function json(res: ServerResponse, status: number, body: unknown): void {
    const payload = JSON.stringify(body);
    res.writeHead(status, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(payload),
    });
    res.end(payload);
  }

  /** Resolves with the body, or null once the cap is passed (413 already sent). */
  function readBody(req: IncomingMessage, res: ServerResponse): Promise<string | null> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];
      let size = 0;
      let over = false;
      req.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > BODY_CAP) {
          if (!over) json(res, 413, { error: "body too large" });
          over = true;
          return;
        }
        chunks.push(chunk);
      });
      req.on("end", () => resolve(over ? null : Buffer.concat(chunks).toString("utf8")));
      req.on("error", () => resolve(null));
    });
  }

  /** Static files for `make serve`: the built client next to /api and /ws on one port. */
  async function serveStatic(req: IncomingMessage, res: ServerResponse, root: string): Promise<void> {
    req.resume();
    let pathname: string;
    try {
      pathname = decodeURIComponent((req.url ?? "/").split("?", 1)[0] ?? "/");
    } catch {
      json(res, 400, { error: "bad path" });
      return;
    }
    const file = normalize(join(root, pathname === "/" ? "index.html" : pathname));
    if (!file.startsWith(root + sep)) {
      json(res, 404, { error: "not found" });
      return;
    }
    let info;
    try {
      info = await stat(file);
    } catch {
      json(res, 404, { error: "not found" });
      return;
    }
    if (!info.isFile()) {
      json(res, 404, { error: "not found" });
      return;
    }
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "content-length": info.size,
      // Vite hashes filenames under /assets/; index.html must revalidate so a new build takes.
      "cache-control": pathname.startsWith("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    createReadStream(file)
      .on("error", () => res.destroy())
      .pipe(res);
  }

  function handleMetrics(req: IncomingMessage, res: ServerResponse): void {
    // Header only — a session token in the query string leaks through logs, history and
    // referrers. Any signed-in account may read this; there is no staff role to gate on yet (#226).
    const auth = req.headers.authorization;
    const token = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : "";
    if (!sessionAccount(db, token)) {
      json(res, 401, { error: "valid session token required" });
      return;
    }
    const now = Date.now();
    const day = now - 24 * 60 * 60 * 1000;
    json(res, 200, {
      now,
      day: flows(db, day),
      week: flows(db, now - 7 * 24 * 60 * 60 * 1000),
      hourly: hourly(db, day),
      ledger: { ...ledgerStats },
      ws: { ...wsStats, open: conns.size },
      lag: lagSampler.read(),
      rooms: [...rooms.entries()].map(([roomId, entry]) => ({
        roomId,
        players: entry.room.occupantCount(),
        occupants: entry.room.occupants().length,
      })),
    });
  }

  async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = req.url ?? "";
    if (req.method === "GET" && path.startsWith("/api/metrics")) {
      handleMetrics(req, res);
      return;
    }
    if (req.method !== "POST" || (path !== "/api/register" && path !== "/api/login")) {
      if (staticRoot && (req.method === "GET" || req.method === "HEAD") && !path.startsWith("/api")) {
        await serveStatic(req, res, staticRoot);
        return;
      }
      req.resume();
      json(res, 404, { error: "not found" });
      return;
    }
    const body = await readBody(req, res);
    if (body === null) return;

    let creds;
    try {
      // Shape check only — register/login produce the specific per-rule messages.
      creds = z.object({ username: z.string(), password: z.string() }).safeParse(JSON.parse(body));
    } catch {
      json(res, 400, { error: "invalid JSON" });
      return;
    }
    if (!creds.success) {
      json(res, 400, { error: "username and password are required" });
      return;
    }
    try {
      const result =
        path === "/api/register"
          ? await register(db, creds.data.username, creds.data.password)
          : await login(db, creds.data.username, creds.data.password);
      json(res, 200, result);
    } catch (e) {
      if (e instanceof AuthError) {
        json(res, 400, { error: e.message });
        return;
      }
      log("http_error", { path, message: String(e) });
      json(res, 500, { error: "internal error" });
    }
  }

  const http = createServer((req, res) => void handleHttp(req, res));
  http.on("connection", (socket) => {
    httpSockets.add(socket);
    socket.on("close", () => httpSockets.delete(socket));
  });

  const wss = new WebSocketServer({ server: http, path: "/ws" });
  wss.on("connection", (ws) => {
    wsStats.connects++;
    const conn: Conn = { ws };
    conn.handshake = setTimeout(() => ws.close(4401, "handshake timeout"), handshakeMs);
    conns.set(ws, conn);
    ws.on("message", (data, isBinary) => onMessage(conn, data, isBinary));
    ws.on("error", (e) => log("socket_error", { message: String(e) }));
    ws.on("close", () => {
      clearTimeout(conn.handshake);
      conns.delete(ws);
      if (conn.accountId !== undefined && byAccount.get(conn.accountId) === ws) {
        byAccount.delete(conn.accountId);
      }
      leaveRoom(conn);
    });
  });

  await new Promise<void>((resolve, reject) => {
    http.once("error", reject);
    http.listen(opts.port, () => {
      http.removeListener("error", reject);
      resolve();
    });
  });
  const port = (http.address() as AddressInfo).port;
  log("listening", { port, dbPath: opts.dbPath });

  async function close(): Promise<void> {
    lagSampler.stop();
    npcService.stop();
    tradeService.stop();
    for (const conn of conns.values()) clearTimeout(conn.handshake);
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve, reject) => wss.close((e) => (e ? reject(e) : resolve())));
    for (const socket of httpSockets) socket.destroy();
    await new Promise<void>((resolve, reject) => http.close((e) => (e ? reject(e) : resolve())));
    for (const entry of rooms.values()) {
      clearTimeout(entry.dispose);
      entry.room.dispose();
    }
    rooms.clear();
    conns.clear();
    byAccount.clear();
    closeDb(db);
  }

  return { close, port, stats: () => ({ rooms: rooms.size }) };
}
