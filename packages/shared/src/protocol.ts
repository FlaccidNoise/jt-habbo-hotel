import { z } from "zod";

export interface Tile { x: number; y: number }
export const DirSchema = z.number().int().min(0).max(7);
export const FurniDirSchema = z.union([z.literal(0), z.literal(2), z.literal(4), z.literal(6)]);
// Note: with a fixed origin, dir 0/4 produce identical footprints, as do 2/6 — occupancy tests
// must not try to tell them apart. Rotation swaps w↔l at dir 2 and 6.

export const ErrorCodeSchema = z.enum([
  "bad_message", "internal", "no_room", "already_joined", "whisper_target",
  "not_owner", "bad_position", "occupied", "no_stack", "room_full", "no_path",
  "trade", "purchase", "arcade",
]);
export type ErrorCode = z.infer<typeof ErrorCodeSchema>;

export const FurniDefSchema = z.object({
  id: z.string(), name: z.string(),
  w: z.number().int().min(1), l: z.number().int().min(1),
  stackHeights: z.array(z.number().min(0)).min(1),   // per state; prototype defs have one state
  canWalk: z.boolean(), canSit: z.boolean(), canStackOn: z.boolean(),
  color: z.number().int(),
});
export type FurniDef = z.infer<typeof FurniDefSchema>;

export const AvatarStateSchema = z.object({
  id: z.number().int(), username: z.string(),
  x: z.number().int(), y: z.number().int(), z: z.number(),
  dir: DirSchema, posture: z.enum(["stand", "sit"]),   // server always sends "stand" in this slice
  staff: z.boolean().optional(),   // NPC hotel staff — negative ids, visibly badged, never players
});
export type AvatarState = z.infer<typeof AvatarStateSchema>;

export const InventoryItemSchema = z.object({ id: z.number().int(), defId: z.string() });
export type InventoryItem = z.infer<typeof InventoryItemSchema>;

// GAME.md §Trade: Coke Music's 6-item cap was its documented exploit surface — ours is explicit.
export const MAX_TRADE_ITEMS = 8;   // per side (tune)
export const FurniItemSchema = InventoryItemSchema.extend({
  x: z.number().int(), y: z.number().int(), z: z.number(),
  dir: FurniDirSchema, state: z.number().int(),
});
export type FurniItem = z.infer<typeof FurniItemSchema>;

const StepSchema = z.object({ x: z.number().int(), y: z.number().int(), z: z.number() });

export const ClientMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("join"), token: z.string(), roomId: z.number().int() }),
  z.object({ t: z.literal("move"), x: z.number().int(), y: z.number().int() }),
  z.object({ t: z.literal("chat"), mode: z.enum(["say", "shout"]), text: z.string().min(1).max(200) }),
  z.object({ t: z.literal("whisper"), to: z.string(), text: z.string().min(1).max(200) }),
  z.object({ t: z.literal("place"), itemId: z.number().int(), x: z.number().int(),
             y: z.number().int(), dir: FurniDirSchema }),
  z.object({ t: z.literal("pickup"), itemId: z.number().int() }),
  // Trades are items-for-items only — Stars never appear in a trade (GAME.md §Currency).
  z.object({ t: z.literal("trade_open"), to: z.string() }),
  z.object({ t: z.literal("trade_offer"),
             itemIds: z.array(z.number().int()).max(MAX_TRADE_ITEMS) }),
  z.object({ t: z.literal("trade_accept") }),
  z.object({ t: z.literal("trade_cancel") }),
  z.object({ t: z.literal("buy"), defId: z.string() }),
  z.object({ t: z.literal("arcade_start") }),
  z.object({ t: z.literal("arcade_move"), move: z.enum(["higher", "lower", "stop"]) }),
]);
export type ClientMsg = z.infer<typeof ClientMsgSchema>;

export const ServerMsgSchema = z.discriminatedUnion("t", [
  z.object({ t: z.literal("room_state"), roomId: z.number().int(), name: z.string(),
             heightmap: z.string(),
             door: z.object({ x: z.number().int(), y: z.number().int(), dir: DirSchema }),
             chat: z.object({ speakRadius: z.number().int(), shoutAllowed: z.boolean() }),
             avatars: z.array(AvatarStateSchema), furni: z.array(FurniItemSchema),
             inventory: z.array(InventoryItemSchema), you: z.number().int(),
             stars: z.number().int() }),
  z.object({ t: z.literal("avatar_join"), avatar: AvatarStateSchema }),
  z.object({ t: z.literal("avatar_leave"), id: z.number().int() }),
  z.object({ t: z.literal("walk"), id: z.number().int(), msPerTile: z.number().int(),
             from: StepSchema, startedAt: z.number().int(),   // server epoch ms
             path: z.array(StepSchema) }),
  z.object({ t: z.literal("chat"), from: z.number().int(), mode: z.enum(["say", "shout", "whisper"]),
             text: z.string(), faded: z.boolean() }),
  z.object({ t: z.literal("furni_placed"), item: FurniItemSchema }),
  z.object({ t: z.literal("furni_moved"), item: FurniItemSchema }),   // z recomputed after a pickup
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
  z.object({ t: z.literal("error"), code: ErrorCodeSchema, message: z.string() }),
]);
export type ServerMsg = z.infer<typeof ServerMsgSchema>;
