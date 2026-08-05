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
import { ClientMsgSchema } from "@grand/shared";
import type { ClientMsg, ErrorCode, ServerMsg } from "@grand/shared";
import { AuthError, login, register, sessionAccount } from "./auth.ts";
import { closeDb, openDb } from "./db.ts";
import { COFFEE_STARS, NPC_FAUCET_CAP, settleEarn } from "./ledger.ts";
import { log } from "./log.ts";
import { NpcService, llmFromEnv } from "./npc.ts";
import type { NpcGenerate } from "./npc.ts";
import { Room } from "./room.ts";
import type { Emit } from "./room.ts";
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
}): Promise<ServerHandle> {
  const db = openDb(opts.dbPath);
  const staticRoot = opts.staticDir ? resolve(opts.staticDir) : undefined;
  const handshakeMs = opts.handshakeMs ?? HANDSHAKE_MS;
  const disposeMs = opts.disposeMs ?? DISPOSE_MS;

  const conns = new Map<WebSocket, Conn>();
  const byAccount = new Map<number, WebSocket>();
  const rooms = new Map<number, RoomEntry>();
  const httpSockets = new Set<Socket>();
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
  });

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
    clearTimeout(conn.handshake);
    conn.handshake = undefined;

    const previous = byAccount.get(account.id);
    // Same room: the occupant moves to the new socket untouched. Different room: an ordinary
    // leave, so the old room's occupants are told.
    const silent = previous !== undefined && conns.get(previous)?.roomId === msg.roomId;
    if (previous) {
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
    if (silent) transferring = account.id;
    try {
      room.join(account.id, account.username);
    } finally {
      transferring = null;
    }
    log("join", { accountId: account.id, username: account.username, roomId: msg.roomId });
    npcService.onPlayerJoin(msg.roomId, account.username);
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
        room.place(accountId, msg.itemId, msg.x, msg.y, msg.dir);
        log("place", { accountId, roomId: conn.roomId, itemId: msg.itemId, x: msg.x, y: msg.y });
        break;
      case "pickup":
        room.pickup(accountId, msg.itemId);
        log("pickup", { accountId, roomId: conn.roomId, itemId: msg.itemId });
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

  async function handleHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const path = req.url ?? "";
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
