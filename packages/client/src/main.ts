import { Application } from "pixi.js";
import { parseHeightmap } from "@grand/shared";
import type { AvatarState, ServerMsg, Tile } from "@grand/shared";
import { Net } from "./net.ts";
import { AvatarSprite } from "./scene/avatar.ts";
import { RoomScene } from "./scene/room.ts";
import { ChatOverlay } from "./ui/chat.ts";
import { parseChatInput } from "./ui/parse.ts";

type RoomState = Extract<ServerMsg, { t: "room_state" }>;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

const roomId = Number(new URLSearchParams(location.search).get("room")) || 1;
const net = new Net();
const avatars = new Map<number, AvatarSprite>();
const chat = new ChatOverlay(el("bubbles"));
let app: Application | null = null;
let scene: RoomScene | null = null;
let you = 0;
let clockOffset: number | null = null;

function toast(text: string): void {
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = text;
  el("toasts").appendChild(node);
  setTimeout(() => node.remove(), 4000);
}

function addAvatar(state: AvatarState): void {
  if (!scene) return;
  avatars.get(state.id)?.destroy();
  const sprite = new AvatarSprite(state);
  avatars.set(state.id, sprite);
  scene.world.addChild(sprite.view);
}

function onTileClick(x: number, y: number, button: number): void {
  if (button === 0) net.send({ t: "move", x, y });
}

function onTileHover(_tile: Tile | null): void {
  // Task 12 hangs the placement highlight here.
}

function buildRoom(msg: RoomState): void {
  if (!app) return;
  you = msg.you;
  for (const sprite of avatars.values()) sprite.destroy();
  avatars.clear();
  chat.clear();
  scene?.destroy();

  scene = new RoomScene(app.stage, parseHeightmap(msg.heightmap, msg.door), {
    click: onTileClick,
    hover: onTileHover,
  });
  scene.center(app.screen.width, app.screen.height);
  el("room-name").textContent = `${msg.name} (#${msg.roomId})`;
  for (const avatar of msg.avatars) addAvatar(avatar);
}

function handle(msg: ServerMsg): void {
  switch (msg.t) {
    case "room_state":
      buildRoom(msg);
      break;
    case "avatar_join":
      addAvatar(msg.avatar);
      break;
    case "avatar_leave":
      avatars.get(msg.id)?.destroy();
      avatars.delete(msg.id);
      break;
    case "walk":
      // The server stamps walks with its own clock; one sample at the first walk is enough to
      // line the two up for the rest of the session.
      if (clockOffset === null) clockOffset = Date.now() - msg.startedAt;
      avatars.get(msg.id)?.walk(msg, msg.startedAt + clockOffset);
      break;
    case "chat":
      chat.show(msg.from, msg);
      break;
    case "error":
      toast(msg.message);
      break;
    default:
      break;
  }
}

async function start(token: string): Promise<void> {
  app = new Application();
  await app.init({ background: 0x11131a, resizeTo: window, antialias: true });
  el("stage").appendChild(app.canvas);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  app.ticker.add(() => {
    const now = Date.now();
    for (const sprite of avatars.values()) sprite.update(now);
    chat.layout((id) => {
      const sprite = avatars.get(id);
      if (!sprite || !scene) return null;
      const head = sprite.head();
      return { sx: head.sx + scene.world.x, sy: head.sy + scene.world.y };
    });
  });
  window.addEventListener("resize", () => {
    if (app && scene) scene.center(app.screen.width, app.screen.height);
  });

  net.onMessage(handle);
  net.onClose(() => toast("disconnected from the server — reload to rejoin"));
  await net.connect(`ws://${location.host}/ws`, token, roomId);
  el("login").style.display = "none";
  el("hud").style.display = "flex";
  el<HTMLInputElement>("chat-input").focus();
}

function sendChat(input: HTMLInputElement, shiftEnter: boolean): void {
  const intent = parseChatInput(input.value, shiftEnter);
  input.value = "";
  if (!intent) return;
  if (intent.kind === "whisper") net.send({ t: "whisper", to: intent.to, text: intent.text });
  else net.send({ t: "chat", mode: intent.kind, text: intent.text });
}

el<HTMLInputElement>("chat-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  sendChat(el<HTMLInputElement>("chat-input"), e.shiftKey);
});
el<HTMLFormElement>("chat-form").addEventListener("submit", (e) => e.preventDefault());

async function authenticate(path: string, username: string, password: string): Promise<string> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error ?? `request failed (${res.status})`);
  return body.token;
}

async function submit(path: string): Promise<void> {
  const error = el("login-error");
  error.textContent = "";
  try {
    const token = await authenticate(
      path,
      el<HTMLInputElement>("username").value.trim(),
      el<HTMLInputElement>("password").value,
    );
    await start(token);
  } catch (e) {
    error.textContent = e instanceof Error ? e.message : String(e);
  }
}

el<HTMLFormElement>("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void submit("/api/login");
});
el("register").addEventListener("click", () => void submit("/api/register"));
