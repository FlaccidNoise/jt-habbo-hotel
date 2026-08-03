import { expect, test } from "vitest";
import { ClientMsgSchema, ServerMsgSchema } from "../src/protocol.ts";

const AVATAR = { id: 1, username: "ann", x: 0, y: 0, z: 0, dir: 2, posture: "stand" };
const ITEM = { id: 5, defId: "chair_basic", x: 1, y: 2, z: 0, dir: 2, state: 0 };
const INV = { id: 9, defId: "plant_basic" };

const CLIENT_CASES: Array<[string, unknown, unknown]> = [
  ["join", { t: "join", token: "tok", roomId: 1 }, { t: "join", token: "tok" }],
  ["move", { t: "move", x: 3, y: 4 }, { t: "move", x: 3.5, y: 4 }],
  ["chat", { t: "chat", mode: "say", text: "hi" }, { t: "chat", mode: "yell", text: "hi" }],
  ["whisper", { t: "whisper", to: "bob", text: "hi" }, { t: "whisper", text: "hi" }],
  ["place", { t: "place", itemId: 5, x: 1, y: 2, dir: 2 }, { t: "place", itemId: 5, x: 1, y: 2, dir: 1 }],
  ["pickup", { t: "pickup", itemId: 5 }, { t: "pickup" }],
];

const ROOM_STATE = {
  t: "room_state", roomId: 1, name: "Cafe", heightmap: "000\n000",
  door: { x: 0, y: 0, dir: 2 }, chat: { speakRadius: 5, shoutAllowed: true },
  avatars: [AVATAR], furni: [ITEM], inventory: [INV], you: 1,
};
const WALK = {
  t: "walk", id: 1, msPerTile: 500, from: { x: 0, y: 0, z: 0 },
  startedAt: 1700000000000, path: [{ x: 1, y: 0, z: 0 }],
};

const SERVER_CASES: Array<[string, unknown, unknown]> = [
  ["room_state", ROOM_STATE, { ...ROOM_STATE, you: undefined }],
  ["avatar_join", { t: "avatar_join", avatar: AVATAR }, { t: "avatar_join", avatar: { ...AVATAR, dir: 8 } }],
  ["avatar_leave", { t: "avatar_leave", id: 1 }, { t: "avatar_leave", id: "1" }],
  ["walk", WALK, { ...WALK, startedAt: undefined }],
  ["chat", { t: "chat", from: 1, mode: "whisper", text: "hi", faded: false }, { t: "chat", from: 1, mode: "whisper", text: "hi" }],
  ["furni_placed", { t: "furni_placed", item: ITEM }, { t: "furni_placed", item: { ...ITEM, dir: 1 } }],
  ["furni_moved", { t: "furni_moved", item: ITEM }, { t: "furni_moved", item: { ...ITEM, z: undefined } }],
  ["furni_removed", { t: "furni_removed", itemId: 5 }, { t: "furni_removed" }],
  ["inventory_add", { t: "inventory_add", item: INV }, { t: "inventory_add", item: { id: 9 } }],
  ["error", { t: "error", code: "bad_position", message: "no" }, { t: "error", code: "badposition", message: "no" }],
];

for (const [name, ok, bad] of CLIENT_CASES) {
  test(`client ${name} accepts a valid message`, () =>
    expect(ClientMsgSchema.safeParse(ok).success).toBe(true));
  test(`client ${name} rejects a malformed message`, () =>
    expect(ClientMsgSchema.safeParse(bad).success).toBe(false));
}
for (const [name, ok, bad] of SERVER_CASES) {
  test(`server ${name} accepts a valid message`, () =>
    expect(ServerMsgSchema.safeParse(ok).success).toBe(true));
  test(`server ${name} rejects a malformed message`, () =>
    expect(ServerMsgSchema.safeParse(bad).success).toBe(false));
}

test("place rejects an absurd direction", () =>
  expect(ClientMsgSchema.safeParse({ t: "place", itemId: 5, x: 1, y: 2, dir: 1e9 }).success).toBe(false));
test("chat text is bounded to 1-200 characters", () => {
  expect(ClientMsgSchema.safeParse({ t: "chat", mode: "say", text: "" }).success).toBe(false);
  expect(ClientMsgSchema.safeParse({ t: "chat", mode: "say", text: "x".repeat(201) }).success).toBe(false);
});
test("an unknown message type is rejected in both directions", () => {
  expect(ClientMsgSchema.safeParse({ t: "teleport" }).success).toBe(false);
  expect(ServerMsgSchema.safeParse({ t: "teleport" }).success).toBe(false);
});
