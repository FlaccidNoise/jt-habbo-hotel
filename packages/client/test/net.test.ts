import { expect, test, vi } from "vitest";
import { Net } from "../src/net.ts";
import type { SocketLike } from "../src/net.ts";
import type { ServerMsg } from "@grand/shared";

class FakeSocket implements SocketLike {
  sent: string[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  deliver(data: unknown): void {
    this.onmessage?.({ data });
  }
}

async function connected(): Promise<{ net: Net; socket: FakeSocket; seen: ServerMsg[] }> {
  const socket = new FakeSocket();
  const net = new Net(() => socket);
  const seen: ServerMsg[] = [];
  net.onMessage((msg) => seen.push(msg));
  const opened = net.connect("ws://localhost/ws", "tok", 1);
  socket.onopen?.();
  await opened;
  return { net, socket, seen };
}

const ROOM_STATE: ServerMsg = {
  t: "room_state",
  roomId: 1,
  name: "The Lobby Café",
  heightmap: "00\n00",
  door: { x: 0, y: 0, dir: 2 },
  chat: { speakRadius: 5, shoutAllowed: false },
  avatars: [],
  furni: [],
  wallFurni: [],
  inventory: [],
  you: 7,
  stars: 0,
};

test("connect sends join once the socket opens", async () => {
  const { socket } = await connected();
  expect(socket.sent.map((s) => JSON.parse(s))).toEqual([{ t: "join", token: "tok", roomId: 1 }]);
});

test("a valid frame reaches the handler", async () => {
  const { socket, seen } = await connected();
  socket.deliver(JSON.stringify(ROOM_STATE));
  expect(seen).toEqual([ROOM_STATE]);
});

test("unparseable frames are dropped, never thrown", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { socket, seen } = await connected();
  expect(() => socket.deliver("{not json")).not.toThrow();
  expect(() => socket.deliver(JSON.stringify({ t: "walk" }))).not.toThrow();
  expect(() => socket.deliver(JSON.stringify({ t: "no_such_message" }))).not.toThrow();
  expect(() => socket.deliver(new ArrayBuffer(4))).not.toThrow();
  expect(seen).toEqual([]);
  warn.mockRestore();
});

test("a good frame after a bad one still arrives", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  const { socket, seen } = await connected();
  socket.deliver("{not json");
  socket.deliver(JSON.stringify(ROOM_STATE));
  expect(seen).toEqual([ROOM_STATE]);
  warn.mockRestore();
});

test("send serializes a client message", async () => {
  const { net, socket } = await connected();
  net.send({ t: "move", x: 3, y: 4 });
  expect(JSON.parse(socket.sent[1] ?? "null")).toEqual({ t: "move", x: 3, y: 4 });
});

async function switching(): Promise<{
  first: FakeSocket;
  second: FakeSocket;
  seen: ServerMsg[];
  disconnects: ReturnType<typeof vi.fn>;
}> {
  const first = new FakeSocket();
  const second = new FakeSocket();
  let next = first;
  const net = new Net(() => next);
  const seen: ServerMsg[] = [];
  const disconnects = vi.fn();
  net.onMessage((msg) => seen.push(msg));
  net.onClose(disconnects);
  const opened = net.connect("ws://localhost/ws", "tok", 1);
  first.onopen?.();
  await opened;

  next = second;
  const switched = net.connect("ws://localhost/ws", "tok", 3);
  second.onopen?.();
  await switched;
  expect(JSON.parse(second.sent[0] ?? "null")).toEqual({ t: "join", token: "tok", roomId: 3 });
  return { first, second, seen, disconnects };
}

test("a confirmed room switch retires the old socket without reporting a disconnect", async () => {
  const { first, second, seen, disconnects } = await switching();
  expect(first.closed).toBe(false); // still live until the new room confirms

  second.deliver(JSON.stringify({ ...ROOM_STATE, roomId: 3 }));
  expect(first.closed).toBe(true);
  expect(seen).toEqual([{ ...ROOM_STATE, roomId: 3 }]);

  first.onclose?.(); // the retired socket's close is not a disconnect
  expect(disconnects).not.toHaveBeenCalled();
  first.deliver(JSON.stringify(ROOM_STATE)); // nor does its traffic still reach the handler
  expect(seen).toHaveLength(1);
});

test("a refused room switch leaves the player in the room they were in", async () => {
  const { first, second, seen } = await switching();

  second.deliver(JSON.stringify({ t: "error", code: "room_busy", message: "that room is full" }));
  expect(first.closed).toBe(false);
  expect(seen).toEqual([{ t: "error", code: "room_busy", message: "that room is full" }]);

  first.deliver(JSON.stringify(ROOM_STATE)); // the old room still talks to us
  expect(seen).toHaveLength(2);
});

test("connect rejects when the socket closes before opening", async () => {
  const socket = new FakeSocket();
  const net = new Net(() => socket);
  const opened = net.connect("ws://localhost/ws", "tok", 1);
  socket.onclose?.();
  await expect(opened).rejects.toThrow();
});
