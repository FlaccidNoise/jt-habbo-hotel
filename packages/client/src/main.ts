import { Application } from "pixi.js";
import {
  PROTOTYPE_CATALOG,
  ROOM_FURNI_CAP,
  checkPlacement,
  footprintTiles,
  parseHeightmap,
  tileHeight,
} from "@grand/shared";
import type {
  AvatarState,
  FurniDef,
  FurniItem,
  InventoryItem,
  PlacementCtx,
  RoomModel,
  ServerMsg,
  Tile,
} from "@grand/shared";
import { Net } from "./net.ts";
import { AvatarSprite } from "./scene/avatar.ts";
import { FurniLayer } from "./scene/furni.ts";
import { RoomScene } from "./scene/room.ts";
import { ChatOverlay } from "./ui/chat.ts";
import { parseChatInput } from "./ui/parse.ts";

type RoomState = Extract<ServerMsg, { t: "room_state" }>;

const DEFS: ReadonlyMap<string, FurniDef> = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
const PLACE_DIR = 0;

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
let furniLayer: FurniLayer | null = null;
let model: RoomModel | null = null;
let doorTile: Tile = { x: 0, y: 0 };
let furni: FurniItem[] = [];
let inventory: InventoryItem[] = [];
let armed: number | null = null;
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

function armedDef(): FurniDef | null {
  const item = inventory.find((i) => i.id === armed);
  return (item && DEFS.get(item.defId)) ?? null;
}

/** The same inputs the server builds for `checkPlacement`, so the hover verdict and the server's
 *  answer come from one implementation. */
function placementCtx(current: RoomModel): PlacementCtx {
  return {
    model: current,
    furni,
    defs: DEFS,
    avatars: [...avatars.values()].map((a) => {
      const at = a.tile();
      return { x: at.x, y: at.y };
    }),
    doorTile,
    roomFurniCap: ROOM_FURNI_CAP,
  };
}

function renderInventory(): void {
  const strip = el("inventory");
  strip.replaceChildren();
  if (inventory.length === 0) {
    const empty = document.createElement("span");
    empty.className = "empty";
    empty.textContent = "Inventory empty — right-click (or long-press) furni in the room to pick it up.";
    strip.appendChild(empty);
    return;
  }
  for (const item of inventory) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = DEFS.get(item.defId)?.name ?? item.defId;
    if (item.id === armed) button.classList.add("armed");
    button.addEventListener("click", () => {
      armed = armed === item.id ? null : item.id;
      scene?.clearHighlight();
      renderInventory();
    });
    strip.appendChild(button);
  }
}

function itemsOn(x: number, y: number): FurniItem[] {
  return furni.filter((item) => {
    const def = DEFS.get(item.defId);
    return def
      ? footprintTiles(def, item.x, item.y, item.dir).some((t) => t.x === x && t.y === y)
      : false;
  });
}

function onTileClick(x: number, y: number, button: number): void {
  if (button === 2) {
    // Placed items carry no owner in the protocol, so pick up the topmost item here and let the
    // server answer `not_owner` when it is somebody else's.
    const top = itemsOn(x, y).sort((a, b) => a.z - b.z).pop();
    if (top) net.send({ t: "pickup", itemId: top.id });
    return;
  }
  if (button !== 0) return;
  if (armed !== null) {
    net.send({ t: "place", itemId: armed, x, y, dir: PLACE_DIR });
    return;
  }
  net.send({ t: "move", x, y });
}

function onTileHover(tile: Tile | null): void {
  if (!scene) return;
  const def = armedDef();
  if (!tile || !def || !model) {
    scene.clearHighlight();
    return;
  }
  const result = checkPlacement(placementCtx(model), def, tile.x, tile.y, PLACE_DIR);
  scene.highlight(
    footprintTiles(def, tile.x, tile.y, PLACE_DIR),
    result.ok,
    result.ok ? result.z : Math.max(0, tileHeight(model, tile.x, tile.y)),
  );
}

function buildRoom(msg: RoomState): void {
  if (!app) return;
  for (const sprite of avatars.values()) sprite.destroy();
  avatars.clear();
  chat.clear();
  scene?.destroy();

  model = parseHeightmap(msg.heightmap, msg.door);
  doorTile = { x: msg.door.x, y: msg.door.y };
  furni = msg.furni;
  inventory = msg.inventory;
  armed = null;

  scene = new RoomScene(app.stage, model, { click: onTileClick, hover: onTileHover });
  scene.center(app.screen.width, app.screen.height);
  furniLayer = new FurniLayer(scene.world, DEFS);
  for (const item of furni) furniLayer.apply(item);
  el("room-name").textContent = `${msg.name} (#${msg.roomId})`;
  for (const avatar of msg.avatars) addAvatar(avatar);
  renderInventory();
}

/** A placement or a move: replace the item if it is already in the room, add it otherwise. */
function upsertFurni(item: FurniItem): void {
  const i = furni.findIndex((f) => f.id === item.id);
  if (i < 0) furni.push(item);
  else furni[i] = item;
  furniLayer?.apply(item);

  // Only my own items are ever in my inventory, so an id leaving it means my placement landed.
  if (inventory.some((inv) => inv.id === item.id)) {
    inventory = inventory.filter((inv) => inv.id !== item.id);
    if (armed === item.id) armed = null;
    scene?.clearHighlight();
    renderInventory();
  }
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
    case "furni_placed":
    case "furni_moved":
      upsertFurni(msg.item);
      break;
    case "furni_removed":
      furni = furni.filter((f) => f.id !== msg.itemId);
      furniLayer?.remove(msg.itemId);
      break;
    case "inventory_add":
      inventory.push(msg.item);
      renderInventory();
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
  const wsScheme = location.protocol === "https:" ? "wss" : "ws";
  await net.connect(`${wsScheme}://${location.host}/ws`, token, roomId);
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
