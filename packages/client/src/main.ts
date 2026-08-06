import { Application } from "pixi.js";
import {
  CATALOG_PRICES,
  MAX_TRADE_ITEMS,
  PROTOTYPE_CATALOG,
  ROOM_CAPACITY,
  ROOM_FURNI_CAP,
  STARTER_GRANT_SETS,
  checkPlacement,
  footprintTiles,
  paletteFor,
  parseFigure,
  parseHeightmap,
  seatAt,
  serializeFigure,
  setById,
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
  WornPart,
} from "@grand/shared";
import { Net } from "./net.ts";
import { loadFurniAssets } from "./scene/assets.ts";
import { FigureBaker, loadFigureAtlas } from "./scene/figure.ts";
import type { FurniAssets } from "./scene/assets.ts";
import { AvatarSprite } from "./scene/avatar.ts";
import { FurniLayer } from "./scene/furni.ts";
import { RoomScene } from "./scene/room.ts";
import { DepthIndex } from "./scene/sort.ts";
import { ChatOverlay } from "./ui/chat.ts";
import { parseChatInput } from "./ui/parse.ts";

type RoomState = Extract<ServerMsg, { t: "room_state" }>;
type TradeState = Extract<ServerMsg, { t: "trade_state" }>;
type ArcadeState = Extract<ServerMsg, { t: "arcade_state" }>;
type NavRooms = Extract<ServerMsg, { t: "nav_rooms" }>["rooms"];

const DEFS: ReadonlyMap<string, FurniDef> = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
const DIRS: ReadonlyArray<0 | 2 | 4 | 6> = [0, 2, 4, 6];

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

const roomId = Number(new URLSearchParams(location.search).get("room")) || 1;
const wsUrl = `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
const net = new Net();
let session = "";
const avatars = new Map<number, AvatarSprite>();
const chat = new ChatOverlay(el("bubbles"));
let depth = new DepthIndex();
let app: Application | null = null;
let scene: RoomScene | null = null;
let furniLayer: FurniLayer | null = null;
let furniAssets: FurniAssets | null = null;
let figureBaker: FigureBaker | null = null;
let model: RoomModel | null = null;
let doorTile: Tile = { x: 0, y: 0 };
let furni: FurniItem[] = [];
let inventory: InventoryItem[] = [];
let armed: number | null = null;
let placeDir: 0 | 2 | 4 | 6 = 0;   // the armed item's facing; R turns it before it lands
let hoverTile: Tile | null = null;
let menuItem: number | null = null;   // placed item whose edit menu is open
let you: number | null = null;
let clockOffset: number | null = null;
let stars = 0;
let trade: TradeState | null = null;
let arcade: ArcadeState | null = null;
let myRoomId: number | null = null;
let myFigure: string | null = null;
let hereRoomId = roomId;

function toast(text: string, kind?: "notice"): void {
  const node = document.createElement("div");
  node.className = kind ? `toast ${kind}` : "toast";
  node.textContent = text;
  el("toasts").appendChild(node);
  setTimeout(() => node.remove(), kind === "notice" ? 10000 : 4000);
}

function addAvatar(state: AvatarState): void {
  if (!scene) return;
  avatars.get(state.id)?.destroy();
  const sprite = new AvatarSprite(state, depth, figureBaker);
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
    empty.textContent =
      "Inventory empty — right-click (or long-press) furni in the room to rotate or pick it up.";
    strip.appendChild(empty);
    return;
  }
  for (const item of inventory) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = DEFS.get(item.defId)?.name ?? item.defId;
    const offered = trade?.yours.some((i) => i.id === item.id) ?? false;
    if (item.id === armed || offered) button.classList.add("armed");
    button.addEventListener("click", () => {
      // While a trade window is open, inventory clicks edit the offer instead of arming.
      if (trade) {
        const ids = offered
          ? trade.yours.filter((i) => i.id !== item.id).map((i) => i.id)
          : [...trade.yours.map((i) => i.id), item.id];
        if (ids.length > MAX_TRADE_ITEMS) toast(`at most ${MAX_TRADE_ITEMS} items per side`);
        else net.send({ t: "trade_offer", itemIds: ids });
        return;
      }
      if (armed === item.id) {
        disarm();
        return;
      }
      armed = item.id;
      placeDir = 0;
      menuItem = null;
      scene?.clearHighlight();
      furniLayer?.clearGhost();
      // The chat box holds focus by default, so hand the keyboard to the room while placing.
      // Every path out of placing hands it back — see releaseKeyboard.
      el<HTMLInputElement>("chat-input").blur();
      renderInventory();
      renderFurniBar();
    });
    strip.appendChild(button);
  }
}

function renderStars(): void {
  el("stars").textContent = `★ ${stars}`;
  renderCatalog();
}

/** Swap one garment. Composition only — the player picks type-set-colour and nothing else, the
 *  same curated-parts rule badges and furni patterns already follow. Ownership is the server's
 *  call: an unowned set comes back as error{code:"figure"} and nothing changes here. */
function renderWardrobe(): void {
  const strip = el("wardrobe");
  strip.replaceChildren();
  if (myFigure === null) return;
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "Wardrobe:";
  strip.appendChild(label);

  const worn = new Map(parseFigure(myFigure).parts.map((part) => [part.type, part]));
  const wear = (parts: WornPart[]): void => {
    net.send({ t: "set_figure", figure: serializeFigure({ version: 1, parts }) });
  };

  for (const setId of STARTER_GRANT_SETS) {
    const set = setById(setId);
    if (!set || set.retired || set.type === "hd") continue;
    const current = worn.get(set.type);
    const button = document.createElement("button");
    button.type = "button";
    button.className = current?.set === set.id ? "worn" : "";
    button.textContent = set.name;
    button.addEventListener("click", () => {
      // Keep the colours already worn for this type where the slots line up, so clicking through
      // hair does not silently repaint it.
      const palette = paletteFor(set.family);
      const colors = Array.from({ length: set.slots }, (_, i) =>
        current?.colors[i] ?? palette[(setId + i) % palette.length]!);
      const next = [...worn.values()].filter((part) => part.type !== set.type);
      next.push({ type: set.type, set: set.id, colors });
      wear(next);
    });
    strip.appendChild(button);
  }

  const recolour = document.createElement("button");
  recolour.type = "button";
  recolour.textContent = "Recolour shirt";
  recolour.addEventListener("click", () => {
    const shirt = worn.get("ch");
    if (!shirt) return;
    const palette = paletteFor(setById(shirt.set)?.family ?? "material");
    const at = palette.indexOf(shirt.colors[0] ?? "");
    const colors = [...shirt.colors];
    colors[0] = palette[(at + 1) % palette.length]!;
    wear([...worn.values()].filter((part) => part.type !== "ch").concat({ ...shirt, colors }));
  });
  strip.appendChild(recolour);
}

function renderCatalog(): void {
  const strip = el("catalog");
  strip.replaceChildren();
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = "Catalog:";
  strip.appendChild(label);
  for (const def of PROTOTYPE_CATALOG) {
    const price = CATALOG_PRICES.get(def.id);
    if (price === undefined) continue;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${def.name} · ${price}★`;
    button.disabled = price > stars;
    button.addEventListener("click", () => net.send({ t: "buy", defId: def.id }));
    strip.appendChild(button);
  }
}

function renderTrade(): void {
  const panel = el("trade");
  panel.hidden = trade === null;
  if (!trade) return;
  el("trade-title").textContent = `Trading with ${trade.partner}`;
  const yours = el("trade-yours");
  yours.replaceChildren();
  for (const item of trade.yours) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = `${DEFS.get(item.defId)?.name ?? item.defId} ✕`;
    button.addEventListener("click", () => {
      if (!trade) return;
      net.send({
        t: "trade_offer",
        itemIds: trade.yours.filter((i) => i.id !== item.id).map((i) => i.id),
      });
    });
    yours.appendChild(button);
  }
  const theirs = el("trade-theirs");
  theirs.replaceChildren();
  for (const item of trade.theirs) {
    const row = document.createElement("div");
    row.textContent = DEFS.get(item.defId)?.name ?? item.defId;
    theirs.appendChild(row);
  }
  el("trade-warning").textContent =
    trade.yours.length > 0 && trade.theirs.length === 0
      ? "You are giving items and receiving nothing. Staff cannot recover items you give away."
      : "";
  el("trade-status").textContent = trade.countdown
    ? "Both accepted — trading in 3 seconds…"
    : trade.theyAccepted
      ? `${trade.partner} accepted.`
      : trade.youAccepted
        ? "Waiting for your partner…"
        : "";
  el<HTMLButtonElement>("trade-accept").disabled = trade.youAccepted;
}

function endTrade(): void {
  trade = null;
  renderTrade();
  renderInventory();
}

function renderNav(rooms: NavRooms): void {
  const list = el("nav-list");
  list.replaceChildren();
  if (rooms.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No rooms are open.";
    list.appendChild(empty);
    return;
  }
  for (const room of rooms) {
    const button = document.createElement("button");
    button.type = "button";
    const here = room.roomId === hereRoomId;
    const full = room.players >= ROOM_CAPACITY;
    button.textContent = `${room.name}${room.yours ? " (yours)" : ""} — ${
      here ? "you are here" : full ? "full" : `${room.players}/${ROOM_CAPACITY}`
    }`;
    button.disabled = here || full;
    button.addEventListener("click", () => {
      el("nav").hidden = true;
      void net.connect(wsUrl, session, room.roomId);
    });
    list.appendChild(button);
  }
}

function renderArcade(): void {
  const running = arcade !== null && !arcade.over;
  el("arcade-card").textContent = arcade ? String(arcade.card) : "—";
  el("arcade-score").textContent = arcade
    ? `score ${arcade.score}${arcade.scored ? "" : " · practice (daily scored plays used)"}`
    : "";
  el("arcade-status").textContent =
    arcade?.over === true
      ? arcade.outcome === "bust"
        ? "Bust!"
        : `Cashed out — +${arcade.paid ?? 0} ★`
      : "";
  for (const id of ["arcade-higher", "arcade-lower", "arcade-stop"]) {
    el<HTMLButtonElement>(id).disabled = !running;
  }
  el<HTMLButtonElement>("arcade-deal").disabled = running;
}

/** Give the keyboard back to chat. Arming takes it so R can turn the held item; every way out of
 *  placing — cancelled, or the item landed — has to return it or typing silently stops working. */
function releaseKeyboard(): void {
  el<HTMLInputElement>("chat-input").focus();
}

function disarm(): void {
  armed = null;
  scene?.clearHighlight();
  furniLayer?.clearGhost();
  renderInventory();
  renderFurniBar();
  releaseKeyboard();
}

function itemsOn(x: number, y: number): FurniItem[] {
  return furni.filter((item) => {
    const def = DEFS.get(item.defId);
    return def
      ? footprintTiles(def, item.x, item.y, item.dir).some((t) => t.x === x && t.y === y)
      : false;
  });
}

/** The topmost item on a tile — what every per-tile action addresses. */
function topItemOn(x: number, y: number): FurniItem | undefined {
  return itemsOn(x, y).sort((a, b) => a.z - b.z).pop();
}

function onTileClick(x: number, y: number, button: number): void {
  closeMenu();
  if (button === 2) {
    // Placed items carry no owner in the protocol, so offer the menu on the topmost item here
    // and let the server answer `not_owner` when it is somebody else's.
    const top = topItemOn(x, y);
    if (top) openMenu(top);
    return;
  }
  if (button !== 0) return;
  if (armed !== null) {
    net.send({ t: "place", itemId: armed, x, y, dir: placeDir });
    return;
  }
  // Clicking a seat sits on it — the server walks you there first. Clicking the seat you are
  // sitting on stands you up, so one control both takes and leaves a chair. Standing on a seat
  // tile without sitting is possible (you can be stood up under one), so the toggle reads the
  // posture, not just the position.
  if (model && seatAt(placementCtx(model), { x, y })) {
    const me = you === null ? undefined : avatars.get(you);
    const sittingHere = me?.pose() === "sit" && me.tile().x === x && me.tile().y === y;
    net.send(sittingHere ? { t: "stand" } : { t: "sit", x, y });
    return;
  }
  net.send({ t: "move", x, y });
}

function onTileHover(tile: Tile | null): void {
  hoverTile = tile;
  if (!scene) return;
  const def = armedDef();
  if (!tile || !def || !model) {
    scene.clearHighlight();
    furniLayer?.clearGhost();
    return;
  }
  const result = checkPlacement(placementCtx(model), def, tile.x, tile.y, placeDir);
  const z = result.ok ? result.z : Math.max(0, tileHeight(model, tile.x, tile.y));
  scene.highlight(footprintTiles(def, tile.x, tile.y, placeDir), result.ok, z);
  furniLayer?.ghost(def, tile.x, tile.y, z, placeDir, result.ok);
}

/** Turn the armed item before it lands. Nothing is sent until it is placed. */
function rotateArmed(): void {
  if (armed === null) return;
  placeDir = DIRS[(DIRS.indexOf(placeDir) + 1) % DIRS.length] ?? 0;
  onTileHover(hoverTile);
}

/** One bar for both edit contexts: the item you are holding, or the placed item you right-clicked.
 *  Every action is a button because the chat box owns the keyboard — R is only an accelerator for
 *  players who have clicked away from it. */
function renderFurniBar(): void {
  const bar = el("furni-menu");
  bar.replaceChildren();
  const item = menuItem === null ? undefined : furni.find((f) => f.id === menuItem);
  const held = armed === null ? undefined : inventory.find((i) => i.id === armed);
  if (!item && !held) {
    bar.hidden = true;
    return;
  }

  const defId = item?.defId ?? held?.defId ?? "";
  const title = document.createElement("span");
  title.className = "label";
  title.textContent = held
    ? `Holding ${DEFS.get(defId)?.name ?? defId} — click a tile to place`
    : (DEFS.get(defId)?.name ?? defId);
  bar.appendChild(title);

  const action = (text: string, run: () => void): void => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", run);
    bar.appendChild(button);
  };
  if (held) {
    action("Rotate (R)", rotateArmed);
    action("Cancel", disarm);
  } else if (item) {
    action("Rotate", () => {
      net.send({ t: "rotate", itemId: item.id });
    });
    action("Pick up", () => {
      net.send({ t: "pickup", itemId: item.id });
      closeMenu();
    });
    action("Close", closeMenu);
  }
  bar.hidden = false;
}

function openMenu(item: FurniItem): void {
  menuItem = item.id;
  renderFurniBar();
}

function closeMenu(): void {
  menuItem = null;
  renderFurniBar();
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
  placeDir = 0;
  you = msg.you;
  myFigure = msg.avatars.find((a) => a.id === msg.you)?.figure ?? null;
  closeMenu();
  stars = msg.stars;
  trade = null;
  arcade = null;
  renderStars();
  renderWardrobe();
  renderTrade();
  renderArcade();
  el("arcade").hidden = true;

  depth = new DepthIndex();   // the old room's views are gone with it
  hereRoomId = msg.roomId;
  myRoomId = msg.myRoomId ?? null;
  el("nav").hidden = true;
  const nav = el<HTMLButtonElement>("suite-nav");
  if (myRoomId === null) {
    nav.style.display = "none";
  } else {
    const home = msg.roomId === myRoomId;
    nav.textContent = home ? "☕ Café" : "🏠 My suite";
    nav.dataset["target"] = String(home ? 1 : myRoomId);
    nav.style.display = "block";
  }

  scene = new RoomScene(app.stage, model, { click: onTileClick, hover: onTileHover }, depth);
  scene.center(app.screen.width, app.screen.height);
  furniLayer = new FurniLayer(scene.world, DEFS, furniAssets, depth);
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
    if (armed === item.id) {
      armed = null;
      releaseKeyboard();
    }
    scene?.clearHighlight();
    furniLayer?.clearGhost();
    renderInventory();
  }
  renderFurniBar();
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
      chat.show(msg.from, msg, avatars.get(msg.from)?.tint());
      break;
    case "posture":
      avatars.get(msg.id)?.setPosture(msg.posture, { x: msg.x, y: msg.y, z: msg.z }, msg.dir);
      break;
    case "figure_changed":
      avatars.get(msg.id)?.setFigure(msg.figure);
      if (msg.id === you) {
        myFigure = msg.figure;
        renderWardrobe();
      }
      break;
    case "wave":
      avatars.get(msg.id)?.wave(Date.now());
      break;
    case "furni_placed":
    case "furni_moved":
      upsertFurni(msg.item);
      break;
    case "furni_removed":
      furni = furni.filter((f) => f.id !== msg.itemId);
      furniLayer?.remove(msg.itemId);
      if (menuItem === msg.itemId) closeMenu();
      break;
    case "inventory_add":
      inventory.push(msg.item);
      renderInventory();
      break;
    case "stars":
      stars = msg.balance;
      renderStars();
      toast(`${msg.delta > 0 ? "+" : ""}${msg.delta} ★ (${msg.reason})`);
      break;
    case "trade_invite":
      toast(`${msg.from} wants to trade — type /trade ${msg.from} to accept`);
      break;
    case "trade_state":
      trade = msg;
      renderTrade();
      renderInventory();
      break;
    case "trade_complete":
      inventory = inventory.filter((i) => !msg.removed.includes(i.id)).concat(msg.added);
      if (armed !== null && msg.removed.includes(armed)) armed = null;
      endTrade();
      toast("Trade complete");
      break;
    case "trade_cancelled":
      endTrade();
      toast(msg.reason);
      break;
    case "arcade_state":
      arcade = msg;
      el("arcade").hidden = false;
      renderArcade();
      break;
    case "nav_rooms":
      renderNav(msg.rooms);
      break;
    case "notice":
      toast(msg.text, "notice");
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
  furniAssets = await loadFurniAssets();
  const atlas = await loadFigureAtlas();
  figureBaker = atlas ? new FigureBaker(atlas) : null;
  await app.init({ background: 0x11131a, resizeTo: window, antialias: true });
  el("stage").appendChild(app.canvas);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  app.ticker.add(() => {
    const now = Date.now();
    for (const sprite of avatars.values()) sprite.update(now);
    depth.flush();
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
  // Keyboard belongs to the room only while the chat box does not have it.
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "r" || e.key === "R") {
      rotateArmed();
      e.preventDefault();
    } else if (e.key === "Escape") {
      if (armed !== null) disarm();
      closeMenu();
    }
  });

  net.onMessage(handle);
  net.onClose(() => toast("disconnected from the server — reload to rejoin"));
  session = token;
  await net.connect(wsUrl, token, roomId);
  el("login").style.display = "none";
  el("hud").style.display = "flex";
  el("nav-open").style.display = "block";
  el("arcade-open").style.display = "block";
  el<HTMLInputElement>("chat-input").focus();
}

function sendChat(input: HTMLInputElement, shiftEnter: boolean): void {
  const intent = parseChatInput(input.value, shiftEnter);
  input.value = "";
  if (!intent) return;
  if (intent.kind === "trade") {
    net.send({ t: "trade_open", to: intent.to });
    toast(`Trade offer sent to ${intent.to}`);
  } else if (intent.kind === "whisper") {
    net.send({ t: "whisper", to: intent.to, text: intent.text });
  } else {
    net.send({ t: "chat", mode: intent.kind, text: intent.text });
  }
}

el<HTMLInputElement>("chat-input").addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  sendChat(el<HTMLInputElement>("chat-input"), e.shiftKey);
});
el<HTMLFormElement>("chat-form").addEventListener("submit", (e) => e.preventDefault());
el("trade-accept").addEventListener("click", () => net.send({ t: "trade_accept" }));
el("trade-cancel").addEventListener("click", () => net.send({ t: "trade_cancel" }));
el("nav-open").addEventListener("click", () => {
  const panel = el("nav");
  panel.hidden = !panel.hidden;
  if (panel.hidden) return;
  el("nav-list").textContent = "Loading rooms…";
  net.send({ t: "nav_list" });
});
el("nav-close").addEventListener("click", () => (el("nav").hidden = true));
el("suite-nav").addEventListener("click", () => {
  const target = Number(el("suite-nav").dataset["target"]);
  if (target) void net.connect(wsUrl, session, target);
});
el("arcade-open").addEventListener("click", () => {
  el("arcade").hidden = false;
  renderArcade();
  if (arcade === null || arcade.over) net.send({ t: "arcade_start" });
});
el("arcade-deal").addEventListener("click", () => net.send({ t: "arcade_start" }));
el("arcade-close").addEventListener("click", () => (el("arcade").hidden = true));
for (const [id, move] of [
  ["arcade-higher", "higher"],
  ["arcade-lower", "lower"],
  ["arcade-stop", "stop"],
] as const) {
  el(id).addEventListener("click", () => net.send({ t: "arcade_move", move }));
}

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
