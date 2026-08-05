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

test("connect rejects when the socket closes before opening", async () => {
  const socket = new FakeSocket();
  const net = new Net(() => socket);
  const opened = net.connect("ws://localhost/ws", "tok", 1);
  socket.onclose?.();
  await expect(opened).rejects.toThrow();
});
