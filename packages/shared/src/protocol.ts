import { z } from "zod";
import { RoomDecorSchema } from "./decor.ts";

export interface Tile { x: number; y: number }
export const DirSchema = z.number().int().min(0).max(7);
export const FurniDirSchema = z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(6)]);
// Note: with a fixed origin, dir 0/4 produce identical footprints, as do 2/6 — occupancy tests
// must not try to tell them apart. Rotation swaps w↔l at dir 2 and 6.

export const ErrorCodeSchema = z.enum([
  "bad_message", "internal", "no_room", "already_joined", "whisper_target",
  "not_owner", "bad_position", "occupied", "no_stack", "room_full", "no_path",
  "trade", "purchase", "arcade", "no_seat", "room_busy", "figure", "wheel",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const FurniDefSchema = z.object({
  id: z.string(), name: z.string(),
  /** Content-pack grouping the catalog UI sorts/filters by. Plain string, not a union — packs
   *  add new values as they ship. */
  theme: z.string(),
  w: z.number().int().min(1), l: z.number().int().min(1),
  stackHeights: z.array(z.number().min(0)).min(1),   // per state; prototype defs have one state
  canWalk: z.boolean(), canStackOn: z.boolean(),
  /** Height of the seat surface in height units, or null when you cannot sit on it. A seated
   *  avatar rests at item.z + seatHeight — always below the def's stack height, which is the
   *  silhouette top (a chair back is taller than its seat). */
  seatHeight: z.number().min(0).nullable(),
  color: z.number().int(),
  /** #326: what the "use" verb does to this item. Absent on furni you can only stand on or sit in.
   *  A "toggle" def must declare a height per state — placement reads stackHeights[state]. */
  interaction: z.enum(["vend", "wash", "toggle", "wish", "read", "wheel"]).optional(),
  /** #347: what a "vend" or "read" puts in the hand, and what it costs. Every def with one of
   *  those two interactions carries it (furni.test.ts) and nothing else does. A price of 0 is a
   *  prop rather than a sink — a book off a shelf moves no Stars and writes no ledger row. */
  vend: z.object({ item: z.string(), price: z.number().int().min(0) }).optional(),
});
export type FurniDef = z.infer<typeof FurniDefSchema>;

// Wall items are a parallel shape, not a variant of FurniDef: none of w, l, stackHeights,
// canWalk, canStackOn or seatHeight means anything for a poster, and every floor rule —
// footprintTiles, seatAt, stackTop — is floor-only by nature. See walls.ts for the coordinates.
export const WallSideSchema = z.enum(["left", "right"]);
export type WallSide = z.infer<typeof WallSideSchema>;

export const WallDefSchema = z.object({
  id: z.string(), name: z.string(),
  /** Content-pack grouping the catalog UI sorts/filters by. Same free-form string as FurniDef. */
  theme: z.string(),
  /** Wall segments the item covers, measured along the wall. */
  span: z.number().int().min(1),
  /** Drawn size in the wall plane, scale-64 px: w along the wall, h straight down. */
  plane: z.object({ w: z.number().int().min(1), h: z.number().int().min(1) }),
  /** Where the authored sprite's near-top corner sits in the plane — the offsets the mesh was
   *  modelled at. Moving the item draws it (u - mount.u) along the wall, so mount.u is even for
   *  the same reason u is; the wall-fit gate rejects an odd one. */
  mount: z.object({ u: z.number().int().min(0).multipleOf(2), v: z.number().int().min(0) }),
  color: z.number().int(),
});
export type WallDef = z.infer<typeof WallDefSchema>;

export const PostureSchema = z.enum(["stand", "sit"]);
export type Posture = z.infer<typeof PostureSchema>;

export const AvatarStateSchema = z.object({
  id: z.number().int(), username: z.string(),
  x: z.number().int(), y: z.number().int(), z: z.number(),
  dir: DirSchema, posture: PostureSchema,
  /** Figure string (#127). Broadcast with the avatar because everyone in the room has to draw it,
   *  and it is what the chat bubble colour derives from. */
  figure: z.string(),
  staff: z.boolean().optional(),   // NPC hotel staff — negative ids, visibly badged, never players
  /** What this avatar is carrying — a drink off a counter or a book off a shelf (#326, #347) —
   *  with the epoch ms it is finished. In the snapshot so a late joiner sees what everyone already
   *  holding one is holding. */
  hand: z.object({ item: z.string(), until: z.number().int() }).optional(),
});
export type AvatarState = z.infer<typeof AvatarStateSchema>;

// GAME.md §Rooms and social: one live instance per room, never mirrored — full rooms are
// refused at the door and shown as full in the Navigator.
export const ROOM_CAPACITY = 25;

// #210: `bound` items never change hands (the ledger refuses it), and `inscription` is the
// engraving — with no text renderer, an engraved plaque or trophy carries its deed as data the
// client shows on click. Both are absent on ordinary catalog furni.
export const InventoryItemSchema = z.object({
  id: z.number().int(), defId: z.string(),
  bound: z.boolean().optional(),
  /** #237: epoch ms this item leaves its 72-hour bind-on-purchase. Absent once it has cleared, so
   *  the client only ever sees it on an item it actually cannot trade yet. */
  bindUntil: z.number().int().optional(),
  /** Placed by the house and never taken down — a museum exhibit and its plaque. The client hides
   *  the move controls for one; the server refuses them either way. */
  locked: z.boolean().optional(),
  inscription: z.string().optional(),
});
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

// GAME.md §Trade: Coke Music's 6-item cap was its documented exploit surface — ours is explicit.
export const MAX_TRADE_ITEMS = 8;   // per side (tune)
export const FurniItemSchema = InventoryItemSchema.extend({
  x: z.number().int(), y: z.number().int(), z: z.number(),
  dir: FurniDirSchema, state: z.number().int(),
});
export type FurniItem = z.infer<typeof FurniItemSchema>;

// (x, y) is the segment tile the item hangs from — its first one when the item spans several.
export const WallItemSchema = InventoryItemSchema.extend({
  side: WallSideSchema,
  x: z.number().int(), y: z.number().int(),
  u: z.number().int().min(0).multipleOf(2), v: z.number().int().min(0),
  state: z.number().int(),
});
export type WallItem = z.infer<typeof WallItemSchema>;

const StepSchema = z.object({ x: z.number().int(), y: z.number().int(), z: z.number() });

export const ClientMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("join"), token: z.string(), roomId: z.number().int() }),
  z.object({ t: z.literal("move"), x: z.number().int(), y: z.number().int() }),
  z.object({ t: z.literal("chat"), mode: z.enum(["say", "shout"]), text: z.string().min(1).max(200) }),
  z.object({ t: z.literal("whisper"), to: z.string(), text: z.string().min(1).max(200) }),
  z.object({ t: z.literal("place"), itemId: z.number().int(), x: z.number().int(),
             y: z.number().int(), dir: FurniDirSchema }),
  z.object({ t: z.literal("place_wall"), itemId: z.number().int(), side: WallSideSchema,
             x: z.number().int(), y: z.number().int(),
             u: z.number().int().min(0).multipleOf(2), v: z.number().int().min(0) }),
  // One pickup for both surfaces: an item id says where it is without the client repeating it.
  z.object({ t: z.literal("pickup"), itemId: z.number().int() }),
  z.object({ t: z.literal("rotate"), itemId: z.number().int() }),
  // Seat, not item: a 2-tile sofa has a seat per tile, and the tile is what the player clicked.
  z.object({ t: z.literal("sit"), x: z.number().int(), y: z.number().int() }),
  z.object({ t: z.literal("stand") }),
  // One verb for every interactable (#326): the def says what using it does, so the client never
  // has to know which behaviour it is asking for.
  z.object({ t: z.literal("use"), itemId: z.number().int() }),
  // Wearing is one path, not two: the change has to reach everyone in the room anyway, and the
  // socket is already open and already authenticated.
  z.object({ t: z.literal("set_figure"), figure: z.string().max(400) }),
  z.object({ t: z.literal("wave") }),
  // Trades are items-for-items only — Stars never appear in a trade (GAME.md §Currency).
  z.object({ t: z.literal("trade_open"), to: z.string() }),
  z.object({ t: z.literal("trade_offer"),
             itemIds: z.array(z.number().int()).max(MAX_TRADE_ITEMS) }),
  z.object({ t: z.literal("trade_accept") }),
  z.object({ t: z.literal("trade_cancel") }),
  z.object({ t: z.literal("buy"), defId: z.string() }),
  // Buying a garment is not buying furni: a set is owned by the account, mints no item, and never
  // trades — so it is its own message rather than a defId the furni path would have to special-case.
  z.object({ t: z.literal("buy_set"), setId: z.number().int() }),
  z.object({ t: z.literal("nav_list") }),
  z.object({ t: z.literal("lever_pull") }),
  // The Grand Wheel (#429). Stake bounds stay off the schema like every other price: the server
  // refuses a bad one with a sentence the player can act on, which a schema rejection cannot say.
  z.object({ t: z.literal("wheel_bet"), itemId: z.number().int(), segment: z.string(),
             stake: z.number().int().min(1) }),
  // Donating is irreversible, so the client confirms before sending it (#210).
  z.object({ t: z.literal("donate"), itemId: z.number().int() }),
  z.object({ t: z.literal("arcade_start") }),
  z.object({ t: z.literal("arcade_move"), move: z.enum(["higher", "lower", "stop"]) }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

export const ServerMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("room_state"), roomId: z.number().int(), name: z.string(),
             heightmap: z.string(),
             // #260. Absent on a room that has chosen neither, which is every room until one is
             // decorated — the client then draws the default checker and plaster.
             decor: RoomDecorSchema,
             door: z.object({ x: z.number().int(), y: z.number().int(), dir: DirSchema }),
             chat: z.object({ speakRadius: z.number().int(), shoutAllowed: z.boolean() }),
             avatars: z.array(AvatarStateSchema), furni: z.array(FurniItemSchema),
             wallFurni: z.array(WallItemSchema),
             inventory: z.array(InventoryItemSchema), you: z.number().int(),
             stars: z.number().int(),
             myRoomId: z.number().int().optional() }),   // the player's own suite, when one exists
  z.object({ t: z.literal("avatar_join"), avatar: AvatarStateSchema }),
  z.object({ t: z.literal("avatar_leave"), id: z.number().int() }),
  z.object({ t: z.literal("walk"), id: z.number().int(), msPerTile: z.number().int(),
             from: StepSchema, startedAt: z.number().int(),   // server epoch ms
             path: z.array(StepSchema) }),
  z.object({ t: z.literal("chat"), from: z.number().int(), mode: z.enum(["say", "shout", "whisper"]),
             text: z.string(), faded: z.boolean() }),
  // Posture carries the whole pose: sitting moves the avatar onto the seat surface and turns it
  // to face the way the seat faces, so one message settles position, height, and facing together.
  z.object({ t: z.literal("posture"), id: z.number().int(), posture: PostureSchema,
             x: z.number().int(), y: z.number().int(), z: z.number(), dir: DirSchema }),
  z.object({ t: z.literal("figure_changed"), id: z.number().int(), figure: z.string() }),
  // Every set the account owns (#352), sent on join and after a wearable purchase. The wardrobe
  // used to infer this from the starter grant plus whatever the player had on, which could not see
  // a bought set that was not currently worn.
  z.object({ t: z.literal("wardrobe"), ownedSets: z.array(z.number().int()) }),
  // Transient: no posture, no server-held state. The client plays the two frames and drops back.
  z.object({ t: z.literal("wave"), id: z.number().int() }),
  // #326. `state` is the only thing that changes, so it travels alone rather than as a whole item.
  z.object({ t: z.literal("furni_state"), itemId: z.number().int(), state: z.number().int() }),
  // `item` null is the drink finishing. The timer is the server's; `until` only lets the client
  // draw a drink that started before it joined.
  z.object({ t: z.literal("handitem"), accountId: z.number().int(),
             item: z.string().nullable(), until: z.number().int().optional() }),
  // Transient like `wave`: no server-held state, the client plays it and drops back. `itemId` is
  // the fountain a wish was thrown into (#347), so the splash lands on the water rather than on
  // the avatar. A wash sends none — you scrub where you stand.
  z.object({ t: z.literal("action"), accountId: z.number().int(),
             action: z.enum(["wash", "wish"]), itemId: z.number().int().optional() }),
  z.object({ t: z.literal("furni_placed"), item: FurniItemSchema }),
  z.object({ t: z.literal("furni_moved"), item: FurniItemSchema }),   // z recomputed after a pickup
  z.object({ t: z.literal("wall_placed"), item: WallItemSchema }),
  // Removal is surface-blind: the client drops the id from whichever layer holds it.
  z.object({ t: z.literal("furni_removed"), itemId: z.number().int() }),
  z.object({ t: z.literal("inventory_add"), item: InventoryItemSchema }),
  z.object({ t: z.literal("stars"), balance: z.number().int(), delta: z.number().int(),
             reason: z.string() }),
  z.object({ t: z.literal("trade_invite"), from: z.string() }),
  z.object({ t: z.literal("trade_state"), partner: z.string(),
             yours: z.array(InventoryItemSchema), theirs: z.array(InventoryItemSchema),
             youAccepted: z.boolean(), theyAccepted: z.boolean(), countdown: z.boolean() }),
  z.object({ t: z.literal("trade_complete"), added: z.array(InventoryItemSchema),
             removed: z.array(z.number().int()) }),
  z.object({ t: z.literal("trade_cancelled"), reason: z.string() }),
  z.object({ t: z.literal("arcade_state"), card: z.number().int(), score: z.number().int(),
             scored: z.boolean(), over: z.boolean(),
             outcome: z.enum(["bust", "stopped"]).optional(), paid: z.number().int().optional() }),
  // The odds are shipped in the client bundle (lever.ts), so the result carries only what was
  // actually drawn. `defId` null is the blank — the common outcome and the reason it drains.
  z.object({ t: z.literal("lever_result"), defId: z.string().nullable(), label: z.string(),
             balance: z.number().int(), item: InventoryItemSchema.optional() }),
  // A spin, sent to the whole room — the wheel is a spectacle, and watching someone else's Grand
  // land is most of the point. The odds table ships in the client bundle (wheel.ts), so the result
  // carries only what was drawn. `slot` is the physical slot, not the colour: the client draws
  // WHEEL_LAYOUT and lands the animation on that slot, and two slots share a colour. The bettor's
  // new balance travels on the existing "stars" message rather than being repeated here.
  z.object({ t: z.literal("wheel_result"), itemId: z.number().int(),
             accountId: z.number().int(), name: z.string(),
             betSegment: z.string(), resultSegment: z.string(), slot: z.number().int().min(0).max(23),
             stake: z.number().int(), payout: z.number().int() }),
  // Collection sets (#210): progress on every join and after anything that can add a def, so the
  // player can see what a set still needs — the missing piece is the sink.
  z.object({ t: z.literal("sets"), sets: z.array(z.object({
             id: z.string(), name: z.string(),
             owned: z.array(z.string()), missing: z.array(z.string()),
             complete: z.boolean(), reward: z.string() })) }),
  z.object({ t: z.literal("set_complete"), setId: z.string(), name: z.string(),
             badge: z.string(), item: InventoryItemSchema }),
  z.object({ t: z.literal("donated"), itemId: z.number().int(), roomId: z.number().int(),
             inscription: z.string() }),
  z.object({ t: z.literal("nav_rooms"), rooms: z.array(z.object({
             roomId: z.number().int(), name: z.string(), players: z.number().int(),
             yours: z.boolean() })) }),
  z.object({ t: z.literal("notice"), text: z.string() }),   // onboarding and system prompts
  z.object({ t: z.literal("error"), code: ErrorCodeSchema, message: z.string() }),
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;
