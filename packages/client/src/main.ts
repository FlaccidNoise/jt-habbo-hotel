import { Application, TextureSource } from "pixi.js";
import {
  BLACKJACK_STAKES,
  CATALOG_PRICES,
  COLLECTION_SETS,
  MAX_TRADE_ITEMS,
  PROTOTYPE_CATALOG,
  ROOM_CAPACITY,
  ROOM_FURNI_CAP,
  LEVER_COST,
  WALL_CATALOG,
  WEARABLE_SHELF,
  checkPlacement,
  checkWallPlacement,
  footprintTiles,
  handValue,
  insuranceBet,
  parseHeightmap,
  PRESTIGE_DEFS,
  screenToTile,
  leverOdds,
  seatAt,
  setById,
  tileHeight,
  wallOffsetLimits,
  worldToScreen,
} from "@grand/shared";
import type {
  AvatarState,
  ClientMsg,
  FurniDef,
  FurniItem,
  InventoryItem,
  PlacementCtx,
  RoomModel,
  ServerMsg,
  Tile,
  WallDef,
  WallItem,
  WallPlacementCtx,
  WallPos,
} from "@grand/shared";
import { Net } from "./net.ts";
import { loadFurniAssets } from "./scene/assets.ts";
import { FigureBaker, loadFigureAtlas } from "./scene/figure.ts";
import type { FurniAssets } from "./scene/assets.ts";
import { AvatarSprite } from "./scene/avatar.ts";
import { floorDecor, floorRegions, loadDecorAssets, wallDecor } from "./scene/decor.ts";
import type { DecorAssets } from "./scene/decor.ts";
import { Effects, WHEEL_SPIN_MS } from "./scene/effects.ts";
import { FurniLayer } from "./scene/furni.ts";
import { RoomScene, SCALE, ZOOM, loadZoom, setZoom } from "./scene/room.ts";
import { DepthIndex } from "./scene/sort.ts";
import { WallLayer } from "./scene/walls.ts";
import type { FolioItem } from "./ui/folio.ts";
import type { CatalogItem } from "./ui/catalog.ts";
import { ChatOverlay } from "./ui/chat.ts";
import { Creator, wearableThumb } from "./ui/creator.ts";
import { FolioPanel, furniThumb } from "./ui/folioPanel.ts";
import type { FolioPanelInput } from "./ui/folioPanel.ts";
import { parseChatInput } from "./ui/parse.ts";
import { WheelPanel, revealText } from "./ui/wheel.ts";

type RoomState = Extract<ServerMsg, { t: "room_state" }>;
type TradeState = Extract<ServerMsg, { t: "trade_state" }>;
type ArcadeState = Extract<ServerMsg, { t: "arcade_state" }>;
type NavRooms = Extract<ServerMsg, { t: "nav_rooms" }>["rooms"];
type SetRows = Extract<ServerMsg, { t: "sets" }>["sets"];
type BlackjackState = Extract<ServerMsg, { t: "blackjack_state" }>;

const DEFS: ReadonlyMap<string, FurniDef> = new Map(PROTOTYPE_CATALOG.map((d) => [d.id, d]));
const WALL_DEFS: ReadonlyMap<string, WallDef> = new Map(WALL_CATALOG.map((d) => [d.id, d]));

// Wearables share the shop with furni (#352). The grid is keyed by string ids, so a set enters it
// as `set:<id>`; `setId` is what tells a card to bake its thumbnail and buy with `buy_set`. Each
// row carries its own theme, so a garment pack's shelf appears here with no edit (#438).
const WEARABLE_ITEMS: CatalogItem[] = [];
const SHOP_PRICES = new Map(CATALOG_PRICES);
for (const { set: setId, price, theme } of WEARABLE_SHELF) {
  const set = setById(setId);
  if (!set) continue;
  const id = `set:${setId}`;
  WEARABLE_ITEMS.push({ id, name: set.name, theme, setId });
  SHOP_PRICES.set(id, price);
}
// The folio reads the same shelves the strip showed (blitz task 4): floor and wall definitions
// carry the geometry and interaction payloads the detail leaf prints, and wearables carry the
// setId that bakes their thumbnail and buys with buy_set.
const FOLIO_ITEMS: FolioItem[] = [
  ...PROTOTYPE_CATALOG.map((d) => ({
    id: d.id, name: d.name, theme: d.theme, w: d.w, l: d.l,
    interaction: d.interaction, vend: d.vend,
  })),
  ...WALL_CATALOG.map((d) => ({ id: d.id, name: d.name, theme: d.theme, span: d.span, plane: d.plane })),
  ...WEARABLE_ITEMS,
];
const DIRS: ReadonlyArray<0 | 2 | 4 | 6> = [0, 2, 4, 6];
/** Thumbnail box, in CSS px. The .thumb rule in index.html is the same size — the crop is
 *  computed against these numbers, so the two have to agree. */
const THUMB_BOX = { w: 72, h: 64 };
/** Rolling-24h stake cap for the blackjack tables (jtbug #428). The server is the authority; this
 *  only drives the headroom line and the buttons that a click past it would just get refused. */
const BJ_DAILY_CAP = 500;
const defName = (id: string): string => DEFS.get(id)?.name ?? WALL_DEFS.get(id)?.name ?? id;

function el<T extends HTMLElement>(id: string): T {
  const found = document.getElementById(id);
  if (!found) throw new Error(`missing element #${id}`);
  return found as T;
}

const roomId = Number(new URLSearchParams(location.search).get("room")) || 1;
// Where the server lives. Same-origin for `make dev`/`make serve`; the statically-hosted build
// (the /demos/grand/ deploy) bakes in VITE_GRAND_SERVER, and `?server=host` overrides at runtime
// (persisted) so the deployed client can be pointed at another backend without a rebuild.
const serverBase = (() => {
  const q = new URLSearchParams(location.search).get("server");
  if (q) localStorage.setItem("grand-server", q);
  const raw = q ?? localStorage.getItem("grand-server") ??
    (import.meta.env.VITE_GRAND_SERVER as string | undefined) ?? "";
  const withScheme = raw && !/^https?:\/\//.test(raw) ? `https://${raw}` : raw;
  return withScheme.replace(/\/+$/, "");
})();
const apiBase = serverBase;
const wsUrl = serverBase
  ? `${serverBase.replace(/^http/, "ws")}/ws`
  : `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws`;
const net = new Net();
// sessionStorage, as on the metrics page: a reload keeps the session, closing the tab ends it.
// That is also why there is no log-out button — the tab is the log-out.
const TOKEN_KEY = "grand-token";
let session = "";
const avatars = new Map<number, AvatarSprite>();
const chat = new ChatOverlay(el("bubbles"));
let depth = new DepthIndex();
let app: Application | null = null;
let scene: RoomScene | null = null;
let furniLayer: FurniLayer | null = null;
let wallLayer: WallLayer | null = null;
let effects: Effects | null = null;
let furniAssets: FurniAssets | null = null;
let decorAssets: DecorAssets | null = null;
let figureBaker: FigureBaker | null = null;
let model: RoomModel | null = null;
let doorTile: Tile = { x: 0, y: 0 };
let furni: FurniItem[] = [];
let wallFurni: WallItem[] = [];
let inventory: InventoryItem[] = [];
let armed: number | null = null;
let placeDir: 0 | 2 | 4 | 6 = 0;   // the armed item's facing; R turns it before it lands
let hoverTile: Tile | null = null;
let menuItem: number | null = null;   // placed item whose edit menu is open
let you: number | null = null;
let clockOffset: number | null = null;
let stars = 0;
/** Every figure set the account owns (#352). The server sends it on join and after every wearable
 *  purchase, so both the shop shelf and the wardrobe read the same list. */
let ownedSets: ReadonlySet<number> = new Set();
let trade: TradeState | null = null;
let arcade: ArcadeState | null = null;
let blackjack: BlackjackState | null = null;
let myRoomId: number | null = null;
let myFigure: string | null = null;
let hereRoomId = roomId;
let sets: SetRows = [];
/** #326: the one interactable we walked off to reach. Any other click drops it. */
let pendingUse: { itemId: number; x: number; y: number; timer?: number } | null = null;
/** #347: when each pair of drinkers last toasted, so a crowded bar chimes once rather than on
 *  every step. Keyed by the two account ids in order, since a clink belongs to the pair. */
const clinkAt = new Map<string, number>();
const CLINK_DEBOUNCE_MS = 10000;
/** Where a fountain's water sits, as a fraction of the item's height — the basin, not the spout
 *  the def's stack height measures. */
const WATER_LEVEL = 0.55;
/** Set by registering, spent by the first room_state: a new account meets the creator before it
 *  sees the room. Returning players go straight in and open the same panel from the HUD. */
let pendingCreator = false;

function toast(text: string, kind?: "notice"): void {
  const node = document.createElement("div");
  node.className = kind ? `toast ${kind}` : "toast";
  node.textContent = text;
  el("toasts").appendChild(node);
  setTimeout(() => node.remove(), kind === "notice" ? 10000 : 4000);
}

/** Create-your-look and the wardrobe (#344). The baker is read through a closure because the atlas
 *  only exists after boot(), while the panel has to be wired before the first login. */
const creator = new Creator(el("creator"), {
  baker: () => figureBaker,
  send: (figure) => net.send({ t: "set_figure", figure }),
  stars: () => stars,
  buySet: (setId) => net.send({ t: "buy_set", setId }),
  onClose: () => {
    releaseKeyboard();
    el("tab-wardrobe").classList.remove("open");
  },
});

/** The Grand Wheel's bet panel (#429). It has no HUD button: clicking the machine is what opens
 *  it, since a bet is only legal within reach of the machine. */
const wheel = new WheelPanel(el("wheel"), {
  stars: () => stars,
  bet: (msg) => net.send(msg),
});
/** The reveal waits for the wheel to stop turning. Latest wins: the server's cooldown makes two
 *  spins inside one animation vanishingly rare, so a second result simply replaces the first
 *  rather than earning a queue. */
let wheelReveal: number | undefined;

/** The Furnishings Folio (blitz task 4): the full-screen binder that replaces the bottom catalog
 *  strip. Selection is not purchase — a card opens a detail leaf, and only its Buy button sends
 *  anything. The panel owns the ring-up state; main tracks the pending price so a `{t:"stars"}`
 *  resolves the purchase only when the reason and the debit both match. */
let pendingPurchase: { kind: "buy" | "buy_set"; price: number } | null = null;

function folioInput(): FolioPanelInput {
  return {
    items: FOLIO_ITEMS,
    prices: SHOP_PRICES,
    collectionSets: COLLECTION_SETS,
    setProgress: sets,
    prestigeDefs: PRESTIGE_DEFS,
    stars,
    ownedWearableSets: ownedSets,
  };
}

const folio = new FolioPanel(el("folio"), {
  buy: (defId) => {
    const price = SHOP_PRICES.get(defId);
    if (price === undefined) return;
    pendingPurchase = { kind: "buy", price };
    net.send({ t: "buy", defId });
  },
  buySet: (setId) => {
    const price = SHOP_PRICES.get(`set:${setId}`);
    if (price === undefined) return;
    pendingPurchase = { kind: "buy_set", price };
    net.send({ t: "buy_set", setId });
  },
  furniThumb: (entry, box, maxIntegerScale) => entry.item.setId !== undefined
    ? wearableThumb(figureBaker, entry.item.setId)
    : furniThumb(furniAssets?.get(entry.item.id)?.meta, WALL_DEFS.get(entry.item.id)?.plane,
      box, maxIntegerScale),
});
folio.onClose = () => el("tab-catalog").classList.remove("open");
/** A refusal, a dropped connection, or a reconnect all land here: the ring-up re-arms and the
 *  purchase is never silently counted. */
function failPendingPurchase(message: string): void {
  if (!pendingPurchase) return;
  pendingPurchase = null;
  folio.purchaseResolved(false, message);
}


function addAvatar(state: AvatarState): void {
  if (!scene) return;
  avatars.get(state.id)?.destroy();
  const sprite = new AvatarSprite(state, depth, figureBaker, (x, y) => scene?.waterline(x, y) ?? 0);
  sprite.onStep = () => checkClink(state.id);
  avatars.set(state.id, sprite);
  scene.world.addChild(sprite.view);
}

/** #347: two avatars who both have a drink and end up side by side toast each other. Entirely
 *  client-side — nothing is sent, and nothing but the sparkle happens. It runs off the two things
 *  that can make a pair adjacent, a hand filling and a step landing, rather than off the ticker. */
function checkClink(id: number): void {
  const one = avatars.get(id);
  if (!one?.holding()) return;
  const here = one.tile();
  const now = Date.now();
  for (const [otherId, two] of avatars) {
    if (otherId === id || !two.holding()) continue;
    const there = two.tile();
    if (Math.max(Math.abs(here.x - there.x), Math.abs(here.y - there.y)) > 1) continue;
    const key = id < otherId ? `${id}:${otherId}` : `${otherId}:${id}`;
    if (now - (clinkAt.get(key) ?? -Infinity) < CLINK_DEBOUNCE_MS) continue;
    clinkAt.set(key, now);
    const a = one.hand();
    const b = two.hand();
    effects?.clink((a.sx + b.sx) / 2, (a.sy + b.sy) / 2, now);
  }
}

/** #347: the splash where the Star went in. The fountain's water when the client knows which
 *  fountain it was, and the wisher's own feet when the item is not in the room it can see. */
function wishSplash(accountId: number, itemId: number | undefined): void {
  const who = avatars.get(accountId);
  const item = itemId === undefined ? undefined : furni.find((f) => f.id === itemId);
  const def = item && DEFS.get(item.defId);
  const now = Date.now();
  if (!item || !def) {
    if (who) effects?.wish(null, { sx: who.view.x, sy: who.view.y }, now);
    return;
  }
  const rotated = item.dir === 2 || item.dir === 6;
  const water = worldToScreen(
    item.x + ((rotated ? def.l : def.w) - 1) / 2,
    item.y + ((rotated ? def.w : def.l) - 1) / 2,
    item.z + (def.stackHeights[item.state] ?? 0) * WATER_LEVEL,
    SCALE,
  );
  effects?.wish(who?.hand() ?? null, water, now);
}

function armedDef(): FurniDef | null {
  const item = inventory.find((i) => i.id === armed);
  return (item && DEFS.get(item.defId)) ?? null;
}

/** The armed item when it is a wall item — the two are mutually exclusive, so whichever returns
 *  non-null decides which surface the pointer is arming. */
function armedWallDef(): WallDef | null {
  const item = inventory.find((i) => i.id === armed);
  return (item && WALL_DEFS.get(item.defId)) ?? null;
}

function wallCtx(current: RoomModel): WallPlacementCtx {
  return {
    model: current,
    wallFurni,
    defs: WALL_DEFS,
    furniCount: furni.length + wallFurni.length,
    roomFurniCap: ROOM_FURNI_CAP,
  };
}

/** Where a wall item lands for a pointer at `pos`: centred on the cursor, snapped to the wall's
 *  2 px lattice, and clamped so it never overhangs its own span or the wall. */
function wallDrop(def: WallDef, pos: WallPos): WallPos {
  const { maxU, maxV } = wallOffsetLimits(def);
  const clamp = (n: number, hi: number): number => Math.max(0, Math.min(hi, n));
  return {
    ...pos,
    u: clamp(2 * Math.round((pos.u - def.plane.w / 2) / 2), maxU),
    v: clamp(Math.round(pos.v - def.plane.h / 2), maxV),
  };
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
  const grid = document.createElement("div");
  grid.className = "grid";
  strip.appendChild(grid);
  for (const item of inventory) {
    const button = document.createElement("button");
    button.type = "button";
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = defName(item.defId);
    button.append(inventoryThumb(item.defId), name);
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
    grid.appendChild(button);
  }
}

function renderStars(): void {
  el("stars").textContent = `★ ${stars}`;
  folio.refresh(folioInput());
  renderLever();
  wheel.refresh();
}

/** The inventory keeps its 72x64 crop; the thumbnail itself moved to folioPanel with the folio
 *  (blitz task 4), where the detail leaf may double it. */
function inventoryThumb(defId: string): HTMLElement {
  return furniThumb(furniAssets?.get(defId)?.meta, WALL_DEFS.get(defId)?.plane, THUMB_BOX);
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
    button.textContent = `${defName(item.defId)} ✕`;
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
    row.textContent = defName(item.defId);
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

/** 1 is the ace, 11/12/13 the court cards — the same ranks blackjack.ts scores. */
function cardGlyph(rank: number): string {
  if (rank === 1) return "A";
  if (rank === 11) return "J";
  if (rank === 12) return "Q";
  if (rank === 13) return "K";
  return String(rank);
}

function totalLabel(hand: { total: number; soft: boolean }): string {
  return `Total: ${hand.soft ? "soft " : ""}${hand.total}`;
}

function outcomeLabel(hand: BlackjackState["hands"][number]): string {
  switch (hand.outcome) {
    case "blackjack":
      return `Blackjack! +${hand.paid ?? 0} ★`;
    case "win":
      return `+${hand.paid ?? 0} ★`;
    case "push":
      return "Push — stake returned";
    case "loss":
      return "House wins";
    default:
      return "";
  }
}

/** The card table (jtbug #428, #431). No local memory of the hand — everything here is read
 *  straight off `blackjack`, so a reconnect mid-play renders correctly from whatever the server
 *  re-emits. The buttons come from `actions`: the dealer decides what is legal, and a panel that
 *  guessed for itself could offer a split the table would refuse. */
function renderBlackjack(): void {
  const state = blackjack;
  const inHand = state?.phase === "player";
  const insuring = state?.phase === "insurance";
  const resolved = state?.phase === "resolved";
  const dealerCards = (state?.dealer ?? []).map(cardGlyph);
  el("bj-dealer").textContent = resolved
    ? `Dealer: ${dealerCards.join(" ") || "—"}`
    : dealerCards.length > 0
      ? `Dealer: ${[...dealerCards, "🂠"].join(" ")}`
      : "Dealer: —";
  el("bj-dealer-total").textContent = resolved && state ? totalLabel(handValue(state.dealer)) : "";

  // One line per hand, so a split reads as two hands rather than one impossible pile of cards.
  // The arrow marks the hand the buttons are pointed at.
  const rows = el("bj-hands");
  rows.replaceChildren();
  const hands = state?.hands ?? [];
  for (const [i, hand] of hands.entries()) {
    const line = document.createElement("div");
    line.className = "bj-cards";
    const mark = hands.length > 1 && inHand && i === state?.active ? "▸ " : "";
    const name = hands.length > 1 ? `Hand ${i + 1}` : "You";
    line.textContent = `${mark}${name}: ${hand.cards.map(cardGlyph).join(" ")}`;
    const total = document.createElement("div");
    total.className = "bj-total";
    const stake = hand.stake > (state?.stake ?? 0) ? ` · doubled to ${hand.stake} ★` : "";
    total.textContent = `${totalLabel(handValue(hand.cards))}${stake}` +
      (resolved ? ` · ${outcomeLabel(hand)}` : "");
    rows.append(line, total);
  }
  if (hands.length === 0) el("bj-hands").textContent = "You: —";

  el("bj-status").textContent = resolved && state
    ? `Paid ${state.paid ?? 0} ★${state.insurance ? ` (insurance ${state.insurance} ★)` : ""}`
    : insuring && state
      ? `Dealer shows an ace. Insurance costs ${insuranceBet(state.stake)} ★ and pays 2:1.`
      : "";
  const stakedToday = state?.stakedToday ?? 0;
  const capReached = stakedToday >= BJ_DAILY_CAP;
  el("bj-headroom").textContent = capReached
    ? `daily stake cap reached — ${BJ_DAILY_CAP} ★ used`
    : `${BJ_DAILY_CAP - stakedToday} ★ of ${BJ_DAILY_CAP} left to stake today`;
  const stakesOpen = !inHand && !insuring;
  for (const stake of BLACKJACK_STAKES) {
    el<HTMLButtonElement>(`bj-stake-${stake}`).disabled = !stakesOpen || capReached;
  }
  const actions = state?.actions ?? [];
  for (const action of ["hit", "stand", "double", "split"] as const) {
    el<HTMLButtonElement>(`bj-${action}`).disabled = !actions.includes(action);
  }
  el("bj-insurance").hidden = !insuring;
}

/** The Luck Lever's odds are the same table the server draws from (shared/lever.ts), rendered
 *  straight from it — a published number cannot drift from the real one if there is only one. */
function renderLever(): void {
  const odds = el("lever-odds");
  odds.replaceChildren();
  for (const row of leverOdds()) {
    const line = document.createElement("div");
    const label = document.createElement("span");
    label.textContent = row.label;
    const percent = document.createElement("span");
    percent.textContent = row.percent;
    line.append(label, percent);
    odds.appendChild(line);
  }
  const pull = el<HTMLButtonElement>("lever-pull");
  pull.textContent = `Pull · ${LEVER_COST}★`;
  pull.disabled = stars < LEVER_COST;
}

/** Collection sets (#210). The missing piece is the point — naming it is what turns a set into a
 *  reason to buy the catalog item you skipped. */
function renderSets(): void {
  const list = el("sets-list");
  list.replaceChildren();
  if (sets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "No collections yet.";
    list.appendChild(empty);
    return;
  }
  for (const set of sets) {
    const row = document.createElement("div");
    row.className = set.complete ? "set done" : "set";
    const title = document.createElement("b");
    title.textContent = set.name;
    const bar = document.createElement("div");
    bar.className = "bar";
    const total = set.owned.length + set.missing.length;
    bar.textContent = set.complete
      ? `Complete — ${defName(set.reward)} claimed`
      : `${set.owned.length} / ${total}`;
    row.append(title, bar);
    if (!set.complete) {
      const need = document.createElement("div");
      need.className = "need";
      need.textContent = `Needs: ${set.missing.map(defName).join(", ")}`;
      row.appendChild(need);
    }
    list.appendChild(row);
  }
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
  wallLayer?.clearGhost();
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

function cancelPendingUse(): void {
  if (pendingUse?.timer !== undefined) clearTimeout(pendingUse.timer);
  pendingUse = null;
}

/** Whether my avatar is standing within reach of an item — the same Chebyshev-1 test the server
 *  applies in Room.useFurni, so the client never sends a `use` it knows will be refused. */
function withinReach(def: FurniDef, item: FurniItem): boolean {
  const me = you === null ? undefined : avatars.get(you)?.tile();
  if (!me) return false;
  return footprintTiles(def, item.x, item.y, item.dir).some(
    (t) => Math.max(Math.abs(t.x - me.x), Math.abs(t.y - me.y)) <= 1,
  );
}

/** The walkable tile nearest to me that touches the item, or null when it is walled in. */
function approachTile(def: FurniDef, item: FurniItem): Tile | null {
  const me = you === null ? undefined : avatars.get(you)?.tile();
  if (!me || !model) return null;
  const covered = footprintTiles(def, item.x, item.y, item.dir);
  const candidates: Tile[] = [];
  for (const t of covered) {
    for (const step of [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]]) {
      const at = { x: t.x + (step[0] ?? 0), y: t.y + (step[1] ?? 0) };
      if (covered.some((c) => c.x === at.x && c.y === at.y)) continue;
      if (candidates.some((c) => c.x === at.x && c.y === at.y)) continue;
      if (tileHeight(model, at.x, at.y) < 0) continue;
      if (!itemsOn(at.x, at.y).every((f) => DEFS.get(f.defId)?.canWalk)) continue;
      candidates.push(at);
    }
  }
  candidates.sort((a, b) =>
    Math.max(Math.abs(a.x - me.x), Math.abs(a.y - me.y)) -
    Math.max(Math.abs(b.x - me.x), Math.abs(b.y - me.y)));
  return candidates[0] ?? null;
}

/** Use it if I can reach it; otherwise walk over and use it on arrival. */
function useFurni(def: FurniDef, item: FurniItem): void {
  if (withinReach(def, item)) {
    net.send({ t: "use", itemId: item.id });
    return;
  }
  const approach = approachTile(def, item);
  if (!approach) {
    toast("you cannot get to that");
    return;
  }
  pendingUse = { itemId: item.id, x: approach.x, y: approach.y };
  net.send({ t: "move", x: approach.x, y: approach.y });
}

function onTileClick(x: number, y: number, button: number): void {
  closeMenu();
  cancelPendingUse();
  if (button === 2) {
    // Placed items carry no owner in the protocol, so offer the menu on the topmost item here
    // and let the server answer `not_owner` when it is somebody else's.
    const top = topItemOn(x, y);
    if (top) openMenu(top.id);
    return;
  }
  if (button !== 0) return;
  if (armed !== null) {
    // A wall item ignores the floor — it only lands when the click reaches a wall segment.
    if (armedWallDef()) return;
    net.send({ t: "place", itemId: armed, x, y, dir: placeDir });
    return;
  }
  // An interactable answers the click itself (#326) — a bar counter is there to be used, and
  // nothing you can use is also something you can sit on.
  const top = topItemOn(x, y);
  const topDef = top && DEFS.get(top.defId);
  if (top && topDef?.interaction) {
    // The wheel's panel is local (#429): the server no-ops `use` on it, and the walk `useFurni`
    // starts is what puts me inside the reach the bet itself needs.
    if (topDef.interaction === "wheel") wheel.open(top.id);
    useFurni(topDef, top);
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

/** A click on a wall. With a wall item held it hangs; otherwise it offers the item under the
 *  pointer, or falls through to the floor so the wall never swallows a walk command. */
function onWallClick(
  pos: WallPos, itemId: number | null, button: number, local: { x: number; y: number },
): void {
  closeMenu();
  if (button === 2) {
    if (itemId !== null) openMenu(itemId);
    return;
  }
  if (button !== 0) return;
  const def = armedWallDef();
  if (def && armed !== null) {
    const drop = wallDrop(def, pos);
    net.send({ t: "place_wall", itemId: armed, side: drop.side, x: drop.x, y: drop.y, u: drop.u, v: drop.v });
    return;
  }
  const t = screenToTile(local.x, local.y, SCALE);
  onTileClick(t.x, t.y, button);
}

function onWallHover(pos: WallPos | null): void {
  const def = armedWallDef();
  if (!pos || !def || !model) {
    wallLayer?.clearGhost();
    return;
  }
  const drop = wallDrop(def, pos);
  const result = checkWallPlacement(wallCtx(model), def, drop.side, drop.x, drop.y, drop.u, drop.v);
  wallLayer?.ghost(def, drop, result.ok);
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
  const hung = menuItem === null ? undefined : wallFurni.find((f) => f.id === menuItem);
  const held = armed === null ? undefined : inventory.find((i) => i.id === armed);
  if (!item && !hung && !held) {
    bar.hidden = true;
    return;
  }

  const defId = item?.defId ?? hung?.defId ?? held?.defId ?? "";
  const onWall = held ? WALL_DEFS.has(defId) : hung !== undefined;
  const shown = item ?? hung ?? held;
  const title = document.createElement("span");
  title.className = "label";
  title.textContent = held
    ? `Holding ${defName(defId)} — click a ${onWall ? "wall" : "tile"} to place`
    : (defName(defId));
  bar.appendChild(title);
  // The engraving (#210): no text renderer exists, so a plaque or trophy shows its deed here.
  if (shown?.inscription) {
    const engraved = document.createElement("span");
    engraved.className = "label engraved";
    engraved.textContent = `“${shown.inscription}”`;
    bar.appendChild(engraved);
  } else if (shown?.bound) {
    const mark = document.createElement("span");
    mark.className = "label";
    mark.textContent = "account-bound — cannot be traded";
    bar.appendChild(mark);
  } else if (shown?.bindUntil !== undefined && shown.bindUntil > Date.now()) {
    // Bind-on-purchase (#237). The server only sends the timestamp while it is still running,
    // so anything here is genuinely untradeable right now.
    const hours = Math.ceil((shown.bindUntil - Date.now()) / (60 * 60 * 1000));
    const mark = document.createElement("span");
    mark.className = "label";
    mark.textContent = `new — tradeable in ${hours}h`;
    bar.appendChild(mark);
  }

  const action = (text: string, run: () => void): void => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.addEventListener("click", run);
    bar.appendChild(button);
  };
  if (held) {
    // A hanging item has no facing — the wall it lands on decides which way it looks.
    if (!onWall) action("Rotate (R)", rotateArmed);
    // Donating is irreversible, so it asks — and only floor furni goes on a plinth.
    if (!onWall && !held.bound) {
      action("Donate to Museum", () => {
        const name = defName(held.defId);
        if (!confirm(`Donate ${name} to the Museum?\n\nIt goes on permanent public exhibition with your name on the plaque. You cannot take it back.`)) return;
        net.send({ t: "donate", itemId: held.id });
        disarm();
      });
    }
    action("Cancel", disarm);
  } else if (item ?? hung) {
    const placed = (item ?? hung)!;
    // A museum exhibit is arranged by the house: the server refuses both, so offering them would
    // only hand the player two buttons that error (#210).
    if (!placed.locked) {
      if (item) {
        action("Rotate", () => {
          net.send({ t: "rotate", itemId: placed.id });
        });
      }
      action("Pick up", () => {
        net.send({ t: "pickup", itemId: placed.id });
        closeMenu();
      });
    }
    action("Close", closeMenu);
  }
  bar.hidden = false;
}

function openMenu(itemId: number): void {
  menuItem = itemId;
  renderFurniBar();
}

function closeMenu(): void {
  menuItem = null;
  renderFurniBar();
}

function buildRoom(msg: RoomState): void {
  if (!app) return;
  failPendingPurchase("reconnected — the purchase was not confirmed, try again");
  for (const sprite of avatars.values()) sprite.destroy();
  avatars.clear();
  chat.clear();
  scene?.destroy();

  model = parseHeightmap(msg.heightmap, msg.door);
  doorTile = { x: msg.door.x, y: msg.door.y };
  furni = msg.furni;
  wallFurni = msg.wallFurni;
  inventory = msg.inventory;
  armed = null;
  placeDir = 0;
  cancelPendingUse();
  you = msg.you;
  myFigure = msg.avatars.find((a) => a.id === msg.you)?.figure ?? null;
  closeMenu();
  stars = msg.stars;
  trade = null;
  arcade = null;
  renderStars();
  renderTrade();
  renderArcade();
  el("arcade").hidden = true;
  blackjack = null;
  renderBlackjack();
  el("blackjack").hidden = true;
  el("lever").hidden = true;
  el("lever-result").textContent = "";
  el("sets").hidden = true;
  // The wheel we were betting at is in the room we just left, and so is any reveal it owed us.
  wheel.close();
  if (wheelReveal !== undefined) clearTimeout(wheelReveal);
  wheelReveal = undefined;

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

  scene = new RoomScene(app.stage, model, { click: onTileClick, hover: onTileHover }, depth,
    floorDecor(decorAssets, msg.decor.floor),
    { width: app.screen.width, height: app.screen.height },
    floorRegions(decorAssets, msg.decor));
  scene.center(app.screen.width, app.screen.height);
  furniLayer = new FurniLayer(scene.world, DEFS, furniAssets, depth, scene.visible);
  for (const item of furni) furniLayer.apply(item);
  effects = new Effects(scene.world);
  clinkAt.clear();   // the pairs in the old room are gone with it
  // No explicit teardown: scene.destroy() above took the old world and every layer's children
  // with it, the same way furniLayer is simply replaced.
  wallLayer = new WallLayer(scene.world, model, WALL_DEFS, furniAssets,
    { click: onWallClick, hover: onWallHover }, depth, wallDecor(decorAssets, msg.decor.wall),
    scene.visible);
  // The walls and the furniture cull against the floor's window, so a camera move rebuilds all
  // three or none.
  scene.onWindow = (window) => {
    wallLayer?.cull(window);
    furniLayer?.cull(window);
  };
  for (const item of wallFurni) wallLayer.apply(item);
  el("room-name").textContent = `${msg.name} (#${msg.roomId})`;
  for (const avatar of msg.avatars) addAvatar(avatar);
  renderInventory();

  // The creator opens over the room it will reveal: set_figure only works for an occupant, so the
  // join happens first and the panel covers it until the new player presses Enter (or Not now).
  if (pendingCreator && myFigure !== null) {
    pendingCreator = false;
    creator.open(myFigure, "create");
  }
}

/** Only my own items are ever in my inventory, so an id leaving it means my placement landed —
 *  true on either surface. */
function claimPlaced(itemId: number): void {
  if (inventory.some((inv) => inv.id === itemId)) {
    inventory = inventory.filter((inv) => inv.id !== itemId);
    if (armed === itemId) {
      armed = null;
      releaseKeyboard();
    }
    scene?.clearHighlight();
    furniLayer?.clearGhost();
    wallLayer?.clearGhost();
    renderInventory();
  }
  renderFurniBar();
}

/** A placement or a move: replace the item if it is already in the room, add it otherwise. */
function upsertFurni(item: FurniItem): void {
  const i = furni.findIndex((f) => f.id === item.id);
  if (i < 0) furni.push(item);
  else furni[i] = item;
  furniLayer?.apply(item);
  claimPlaced(item.id);
}

/** My own walk decides the armed use: it fires when the walk lands on the tile it was armed for,
 *  and is dropped when the server routes me somewhere else or stops me short. There is no arrival
 *  message, so the walk's own length is the clock. */
function armPendingUse(msg: Extract<ServerMsg, { t: "walk" }>): void {
  if (!pendingUse) return;
  const last = msg.path[msg.path.length - 1];
  if (!last || last.x !== pendingUse.x || last.y !== pendingUse.y) {
    cancelPendingUse();
    return;
  }
  const armed = pendingUse;
  if (armed.timer !== undefined) clearTimeout(armed.timer);
  armed.timer = window.setTimeout(() => {
    pendingUse = null;
    net.send({ t: "use", itemId: armed.itemId });
  }, msg.path.length * msg.msPerTile + 60);
}

function handle(msg: ServerMsg): void {
  switch (msg.t) {
    case "blackjack_state":
      blackjack = msg;
      el("blackjack").hidden = false;
      renderBlackjack();
      break;
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
      if (msg.id === you) armPendingUse(msg);
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
        creator.confirmed();
      }
      break;
    case "wave":
      avatars.get(msg.id)?.wave(Date.now());
      break;
    case "action":
      if (msg.action === "wash") avatars.get(msg.accountId)?.washing(Date.now());
      else wishSplash(msg.accountId, msg.itemId);
      break;
    case "handitem":
      avatars.get(msg.accountId)?.setHand(
        msg.item === null ? null : { item: msg.item, until: msg.until ?? 0 },
      );
      if (msg.item !== null) checkClink(msg.accountId);
      break;
    case "furni_state": {
      const item = furni.find((f) => f.id === msg.itemId);
      if (!item) break;
      item.state = msg.state;
      furniLayer?.apply(item);
      break;
    }
    case "furni_placed":
    case "furni_moved":
      upsertFurni(msg.item);
      break;
    case "wall_placed":
      wallFurni = wallFurni.filter((f) => f.id !== msg.item.id).concat(msg.item);
      wallLayer?.apply(msg.item);
      claimPlaced(msg.item.id);
      break;
    case "furni_removed":
      furni = furni.filter((f) => f.id !== msg.itemId);
      wallFurni = wallFurni.filter((f) => f.id !== msg.itemId);
      furniLayer?.remove(msg.itemId);
      wallLayer?.remove(msg.itemId);
      if (menuItem === msg.itemId) closeMenu();
      break;
    case "inventory_add":
      inventory.push(msg.item);
      renderInventory();
      break;
    case "stars": {
      stars = msg.balance;
      renderStars();
      creator.refresh();
      // A purchase resolves only on its own Stars line: the matching reason and the exact debit.
      // Any other movement — a coffee, a vote, a trade — leaves the ring-up waiting, and a
      // mismatched delta never counts as confirmation.
      if (pendingPurchase !== null
        && (msg.reason === "purchase" || msg.reason === "prestige" || msg.reason === "wardrobe")
        && -msg.delta === pendingPurchase.price) {
        pendingPurchase = null;
        folio.purchaseResolved(true, "Purchased — it is on its way to your inventory.");
      }
      toast(`${msg.delta > 0 ? "+" : ""}${msg.delta} ★ (${msg.reason})`);
      break;
    }
    case "wardrobe":
      ownedSets = new Set(msg.ownedSets);
      creator.setWardrobe(msg.ownedSets);
      folio.refresh(folioInput());
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
    case "lever_result":
      el("lever-result").textContent = msg.defId
        ? `${msg.label} — won!`
        : "No win. Pull again?";
      renderLever();
      break;
    case "wheel_result": {
      // Every occupant gets this, bettor or not — the spin is the room's spectacle, and the reveal
      // is held back until the wheel has actually stopped on the slot the server drew.
      const item = furni.find((f) => f.id === msg.itemId);
      const spun = Date.now();
      // Two halves of one spin: the face turns in the sprite (#430) and the sweep runs over it.
      furniLayer?.spin(msg.itemId, spun);
      if (item) {
        const at = worldToScreen(item.x, item.y, item.z, SCALE);
        effects?.wheelSpin(at, item.dir === 2 || item.dir === 6, msg.slot, msg.payout > 0, spun);
      }
      if (wheelReveal !== undefined) clearTimeout(wheelReveal);
      wheelReveal = window.setTimeout(() => {
        wheelReveal = undefined;
        // A win is announced to the room; a loss is only the quiet beat at the wheel itself and a
        // line in the bettor's own panel. Nobody else needs to be told a stranger lost.
        if (msg.payout > 0) toast(revealText(msg), "notice");
        if (msg.accountId === you) wheel.resolved(msg);
      }, WHEEL_SPIN_MS);
      break;
    }
    case "donated":
      inventory = inventory.filter((i) => i.id !== msg.itemId);
      renderInventory();
      renderFurniBar();
      toast(`Donated — “${msg.inscription}”`, "notice");
      break;
    case "sets":
      sets = msg.sets;
      renderSets();
      folio.refresh(folioInput());
      break;
    case "set_complete":
      toast(`${msg.name} complete — ${defName(msg.item.defId)} is yours`, "notice");
      break;
    case "nav_rooms":
      renderNav(msg.rooms);
      break;
    case "notice":
      toast(msg.text, "notice");
      break;
    case "error":
      // A refused outfit — or a refused wardrobe buy — is answered inside the panel that proposed
      // it, where the picks still are. A toast behind the panel would go unread. `purchase` is
      // shared with furni buys and the lever, so the panel only claims it mid-buy. A refused deal
      // or hit follows the same rule for the blackjack table (jtbug #428).
      if (
        (msg.code === "figure" || (msg.code === "purchase" && creator.hasPendingBuy)) &&
        creator.isOpen
      ) {
        creator.rejected(msg.message);
      } else if (msg.code === "purchase" && pendingPurchase !== null) {
        failPendingPurchase(msg.message);
      } else if (msg.code === "casino" && !el("blackjack").hidden) {
        el("bj-status").textContent = msg.message;
      } else if (wheel.isOpen && (msg.code === "wheel" || wheel.hasPendingBet)) {
        // Anything refused while a bet of ours is in flight answers in the panel: it is the only
        // place that can un-stick SPIN, so routing it to a toast would leave the panel waiting for
        // a spin that is never coming.
        wheel.rejected(msg.message);
      } else toast(msg.message);
      break;
    default:
      break;
  }
}

/** The renderer, the input wiring and the socket handlers — set up once, before the first join. */
async function boot(): Promise<void> {
  // Pixel art at 2x: every texture samples nearest, before the first one loads.
  TextureSource.defaultOptions.scaleMode = "nearest";
  app = new Application();
  furniAssets = await loadFurniAssets();
  decorAssets = await loadDecorAssets();
  const atlas = await loadFigureAtlas();
  figureBaker = atlas ? new FigureBaker(atlas) : null;
  await app.init({ background: 0x11131a, resizeTo: window, antialias: false });
  el("stage").appendChild(app.canvas);
  app.stage.eventMode = "static";
  app.stage.hitArea = app.screen;
  app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  app.ticker.add(() => {
    const now = Date.now();
    for (const sprite of avatars.values()) sprite.update(now);
    furniLayer?.update(now);
    effects?.update(now);
    // The camera tracks my avatar through its walk lerp, so it runs after updates, before layout.
    // Called on every frame whether or not there is an avatar to follow, because the floor builds
    // itself over several frames after a jump (#408) and needs the frames to do it in.
    const me = you === null ? undefined : avatars.get(you);
    if (scene && app) {
      scene.follow(me ? { sx: me.view.x, sy: me.view.y } : null, app.screen.width, app.screen.height);
    }
    depth.flush();
    chat.layout((id) => {
      const sprite = avatars.get(id);
      if (!sprite || !scene) return null;
      const head = sprite.head();
      return { sx: head.sx * ZOOM + scene.world.x, sy: head.sy * ZOOM + scene.world.y };
    });
  });
  window.addEventListener("resize", () => {
    if (app && scene) scene.center(app.screen.width, app.screen.height);
  });
  // Keyboard belongs to the room only while the chat box does not have it.
  window.addEventListener("keydown", (e) => {
    if (e.target instanceof HTMLInputElement || e.ctrlKey || e.metaKey || e.altKey) return;
    // The creator covers the room, so the room's keys are not the player's keys while it is up.
    if (creator.isOpen) {
      if (e.key === "Escape") creator.close();
      return;
    }
    // The folio covers the room like the creator does: its cards, search and Escape are the
    // player's keys while it is up, and the canvas underneath gets none of them.
    if (folio.isOpen()) return;
    if (e.key === "r" || e.key === "R") {
      rotateArmed();
      e.preventDefault();
    } else if (e.key === "z" || e.key === "Z") {
      toggleZoom();
      e.preventDefault();
    } else if (e.key === "Escape") {
      if (armed !== null) disarm();
      closeMenu();
    }
  });

  net.onMessage(handle);
  net.onClose((code) => {
    failPendingPurchase("connection lost — the purchase was not confirmed, try again");
    // 4401 is the server refusing the token — the only close a fresh login can fix.
    if (code === 4401) signedOut("that session is no longer valid — log in again");
    else toast("disconnected from the server — reload to rejoin");
  });
}

async function start(token: string): Promise<void> {
  if (!app) await boot();
  session = token;
  await net.connect(wsUrl, token, roomId);
  el("login").style.display = "none";
  el("hud").style.display = "flex";
  el("nav-open").style.display = "block";
  el("arcade-open").style.display = "block";
  el("lever-open").style.display = "block";
  el("sets-open").style.display = "block";
  el("zoom-open").style.display = "block";
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
// #321 collapsed the strips behind tabs; the blitz (task 4) replaced the catalog strip with
// the full-screen folio, so the catalog tab opens it and only the inventory keeps the accordion.
el("tab-inventory").addEventListener("click", () => {
  const opening = !el("inventory").classList.contains("open");
  el("inventory").classList.toggle("open", opening);
  el("tab-inventory").classList.toggle("open", opening);
});
el("tab-catalog").addEventListener("click", () => {
  if (folio.isOpen()) folio.close();
  else folio.open();
  el("tab-catalog").classList.toggle("open", folio.isOpen());
});
// The wardrobe is a panel, not a strip: the tab opens the creator on the look you are wearing.
el("tab-wardrobe").addEventListener("click", () => {
  if (myFigure === null) return;
  if (creator.isOpen) creator.close();
  else {
    creator.open(myFigure, "wardrobe");
    el("tab-wardrobe").classList.add("open");
  }
});
/** The one path both the button and the Z key take: the scene rebuilds its floor to the new
 *  window, and every name already on screen is counter-scaled again. */
function toggleZoom(): void {
  setZoom(ZOOM === 2 ? 1 : 2);
  showZoom();
}

function showZoom(): void {
  el("zoom-open").textContent = `🔍 Zoom ${ZOOM}×`;
  scene?.applyZoom();
  for (const sprite of avatars.values()) sprite.applyZoom();
}

// The stored choice is taken up before the first room arrives, so a player who zoomed out never
// sees a frame of the other magnification.
loadZoom();
showZoom();
el("zoom-open").addEventListener("click", toggleZoom);
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
for (const stake of BLACKJACK_STAKES) {
  el(`bj-stake-${stake}`).addEventListener("click", () => net.send({ t: "bj_deal", stake }));
}
el("bj-hit").addEventListener("click", () => net.send({ t: "bj_hit" }));
el("bj-stand").addEventListener("click", () => net.send({ t: "bj_stand" }));
el("bj-double").addEventListener("click", () => net.send({ t: "bj_double" }));
el("bj-split").addEventListener("click", () => net.send({ t: "bj_split" }));
el("bj-insure").addEventListener("click", () => net.send({ t: "bj_insurance", take: true }));
el("bj-decline").addEventListener("click", () => net.send({ t: "bj_insurance", take: false }));
el("bj-close").addEventListener("click", () => (el("blackjack").hidden = true));
el("lever-open").addEventListener("click", () => {
  const panel = el("lever");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) renderLever();
});
el("lever-close").addEventListener("click", () => (el("lever").hidden = true));
el("lever-pull").addEventListener("click", () => net.send({ t: "lever_pull" }));
el("sets-open").addEventListener("click", () => {
  const panel = el("sets");
  panel.hidden = !panel.hidden;
  if (!panel.hidden) renderSets();
});
el("sets-close").addEventListener("click", () => (el("sets").hidden = true));
for (const [id, move] of [
  ["arcade-higher", "higher"],
  ["arcade-lower", "lower"],
  ["arcade-stop", "stop"],
] as const) {
  el(id).addEventListener("click", () => net.send({ t: "arcade_move", move }));
}

/** Back to the login overlay: the token we held is dead, so drop it. */
function signedOut(message: string): void {
  sessionStorage.removeItem(TOKEN_KEY);
  session = "";
  el("hud").style.display = "none";
  el("blackjack").hidden = true;
  wheel.close();
  folio.close();
  for (const id of ["nav-open", "suite-nav", "arcade-open", "lever-open", "sets-open", "zoom-open"]) {
    el(id).style.display = "none";
  }
  el("login").style.display = "";
  el("login-error").textContent = message;
}

async function authenticate(path: string, username: string, password: string): Promise<string> {
  const res = await fetch(apiBase + path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = (await res.json().catch(() => ({}))) as { token?: string; error?: string };
  if (!res.ok || !body.token) throw new Error(body.error ?? `request failed (${res.status})`);
  return body.token;
}

async function submit(path: string, isRegister = false): Promise<void> {
  const error = el("login-error");
  error.textContent = "";
  try {
    const token = await authenticate(
      path,
      el<HTMLInputElement>("username").value.trim(),
      el<HTMLInputElement>("password").value,
    );
    sessionStorage.setItem(TOKEN_KEY, token);
    // Only a registration that actually succeeded earns the creator step.
    pendingCreator = isRegister;
    await start(token);
  } catch (e) {
    error.textContent = e instanceof Error ? e.message : String(e);
  }
}

el<HTMLFormElement>("login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void submit("/api/login");
});
el("register").addEventListener("click", () => void submit("/api/register", true));

// Sessions never expire server-side, so a reload resumes the one we already have. The overlay
// stays hidden while we try: it comes back only if the join is refused (4401) or never connects.
const stored = sessionStorage.getItem(TOKEN_KEY);
if (stored) {
  el("login").style.display = "none";
  start(stored).catch((e) => {
    el("login").style.display = "";
    el("login-error").textContent = e instanceof Error ? e.message : String(e);
  });
}
