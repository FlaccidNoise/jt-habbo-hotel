import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { NPC_ROSTER, llmFromEnv } from "../src/npc.ts";

// llmFromEnv against a live OpenAI-compatible endpoint — the one seam a fake generate skips.

let received: { url?: string; auth?: string; body?: unknown } = {};
let status = 200;
let reply = "One espresso, on the house style — not the house tab.";
let server: ReturnType<typeof createServer>;
let base: string;

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      received = {
        url: req.url,
        auth: req.headers.authorization,
        body: JSON.parse(Buffer.concat(chunks).toString()),
      };
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify({ choices: [{ message: { content: reply } }] }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`;
});

afterAll(() => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))));

const MAYA = NPC_ROSTER.find((n) => n.name === "Maya")!;

describe("llmFromEnv", () => {
  test("unconfigured env yields no generator", () => {
    expect(llmFromEnv({})).toBeNull();
    expect(llmFromEnv({ NPC_LLM_URL: "http://x" })).toBeNull();
  });

  test("posts persona and transcript to chat/completions and returns the line", async () => {
    status = 200;
    const generate = llmFromEnv({ NPC_LLM_URL: base, NPC_LLM_MODEL: "test-model", NPC_LLM_KEY: "sk-x" });
    expect(generate).not.toBeNull();

    const line = await generate!(MAYA, ["alice: hi Maya"]);
    expect(line).toBe(reply);
    expect(received.url).toBe("/v1/chat/completions");
    expect(received.auth).toBe("Bearer sk-x");
    const body = received.body as {
      model: string;
      messages: Array<{ role: string; content: string }>;
    };
    expect(body.model).toBe("test-model");
    expect(body.messages[0]?.role).toBe("system");
    expect(body.messages[0]?.content).toContain("Maya");
    expect(body.messages[0]?.content).toContain("no authority over money");
    expect(body.messages[1]?.content).toContain("alice: hi Maya");
  });

  test("a non-2xx response yields null, not a throw", async () => {
    status = 500;
    const generate = llmFromEnv({ NPC_LLM_URL: base, NPC_LLM_MODEL: "test-model" });
    await expect(generate!(MAYA, [])).resolves.toBeNull();
    status = 200;
  });
});
