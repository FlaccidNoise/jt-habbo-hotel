import { ServerMsgSchema } from "@grand/shared";
import type { ClientMsg, ServerMsg } from "@grand/shared";

/** The slice of WebSocket the client uses — tests supply their own. */
export interface SocketLike {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
}

const browserSocket = (url: string): SocketLike => new WebSocket(url) as unknown as SocketLike;

export class Net {
  private open: (url: string) => SocketLike;
  private socket: SocketLike | null = null;
  private superseded: SocketLike | null = null;
  private handler: (msg: ServerMsg) => void = () => {};
  private closeHandler: () => void = () => {};
  private warned = false;

  constructor(open: (url: string) => SocketLike = browserSocket) {
    this.open = open;
  }

  /** Also the room switch. The old socket keeps running until the new one reports a room_state:
   *  a refused join (a full room) leaves the player where they were, and a successful one never
   *  reads as a disconnect. */
  connect(url: string, token: string, roomId: number): Promise<void> {
    return new Promise((resolve, reject) => {
      this.retireSuperseded();          // a switch started while one was pending
      this.superseded = this.socket;
      const socket = this.open(url);
      this.socket = socket;
      let opened = false;
      socket.onmessage = (ev) => this.receive(ev.data);
      socket.onopen = () => {
        opened = true;
        socket.send(JSON.stringify({ t: "join", token, roomId } satisfies ClientMsg));
        resolve();
      };
      socket.onerror = () => {
        if (!opened) reject(new Error(`socket error connecting to ${url}`));
      };
      socket.onclose = () => {
        if (opened) this.closeHandler();
        else reject(new Error(`socket closed before opening: ${url}`));
      };
    });
  }

  send(msg: ClientMsg): void {
    try {
      this.socket?.send(JSON.stringify(msg));
    } catch (e) {
      console.error("net: send failed", e);
    }
  }

  /** Drops the socket the switch replaced: silent close, no more frames from the old room. */
  private retireSuperseded(): void {
    const old = this.superseded;
    this.superseded = null;
    if (!old) return;
    old.onmessage = null;
    old.onclose = null;
    old.onerror = null;
    old.close();
  }

  onMessage(handler: (msg: ServerMsg) => void): void {
    this.handler = handler;
  }

  onClose(handler: () => void): void {
    this.closeHandler = handler;
  }

  /** A throw here would kill the message loop, so every bad frame is dropped instead. */
  private receive(data: unknown): void {
    let value: unknown;
    try {
      if (typeof data !== "string") throw new Error("frame is not text");
      value = JSON.parse(data);
    } catch {
      this.warnOnce("net: dropped an unreadable frame");
      return;
    }
    const parsed = ServerMsgSchema.safeParse(value);
    if (!parsed.success) {
      this.warnOnce("net: dropped a frame the schema rejected");
      return;
    }
    // room_state is the join confirmation: only now is the room the switch left behind finished.
    if (parsed.data.t === "room_state") this.retireSuperseded();
    try {
      this.handler(parsed.data);
    } catch (e) {
      console.error("net: message handler threw", e);
    }
  }

  private warnOnce(message: string): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(message);
  }
}
