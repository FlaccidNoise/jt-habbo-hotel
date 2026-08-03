import { WebSocket } from "ws";
import { ServerMsgSchema } from "@grand/shared";
import type { ServerMsg } from "@grand/shared";

type Of<T extends ServerMsg["t"]> = Extract<ServerMsg, { t: T }>;

export interface Bus {
  /** Resolves on the first unconsumed message of type `t`, including ones already received. */
  waitFor<T extends ServerMsg["t"]>(t: T, ms?: number): Promise<Of<T>>;
  /** Drains for `ms` first, then asserts nothing of type `t` is buffered. */
  never(t: ServerMsg["t"], ms?: number): Promise<void>;
  /** Resolves with the WebSocket close code. */
  closed(ms?: number): Promise<number>;
}

export function bus(ws: WebSocket): Bus {
  const buffer: ServerMsg[] = [];
  const seen: string[] = [];
  const waiters: Array<() => void> = [];
  let invalid: Error | undefined;
  let closeCode: number | undefined;

  const wake = (): void => {
    for (const w of waiters.splice(0)) w();
  };

  ws.on("message", (data) => {
    try {
      const msg = ServerMsgSchema.parse(JSON.parse(data.toString()));
      buffer.push(msg);
      seen.push(msg.t);
    } catch (e) {
      invalid = e instanceof Error ? e : new Error(String(e));
    }
    wake();
  });
  ws.on("close", (code) => {
    closeCode = code;
    wake();
  });

  function settled(): void {
    if (invalid) throw invalid;
  }

  function received(): string {
    return seen.length > 0 ? seen.join(", ") : "nothing";
  }

  function tick(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      waiters.push(() => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  async function waitFor<T extends ServerMsg["t"]>(t: T, ms = 1000): Promise<Of<T>> {
    const deadline = Date.now() + ms;
    for (;;) {
      settled();
      const i = buffer.findIndex((m) => m.t === t);
      const hit = i < 0 ? undefined : buffer.splice(i, 1)[0];
      if (hit) return hit as Of<T>;
      const left = deadline - Date.now();
      if (left <= 0) {
        const closed = closeCode === undefined ? "" : `; socket closed with ${closeCode}`;
        throw new Error(`waited ${ms}ms for "${t}"; received: ${received()}${closed}`);
      }
      await tick(left);
    }
  }

  async function never(t: ServerMsg["t"], ms = 50): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
    settled();
    const hit = buffer.find((m) => m.t === t);
    if (hit) throw new Error(`expected no "${t}" but received ${JSON.stringify(hit)}`);
  }

  async function closed(ms = 1000): Promise<number> {
    const deadline = Date.now() + ms;
    for (;;) {
      settled();
      if (closeCode !== undefined) return closeCode;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`waited ${ms}ms for close; received: ${received()}`);
      await tick(left);
    }
  }

  return { waitFor, never, closed };
}

export function connect(port: number): Promise<[WebSocket, Bus]> {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
  const b = bus(ws);
  return new Promise((resolve, reject) => {
    ws.once("open", () => resolve([ws, b]));
    ws.once("error", reject);
  });
}
