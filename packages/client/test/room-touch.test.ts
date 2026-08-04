import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { Container } from "pixi.js";
import type { FederatedPointerEvent } from "pixi.js";
import { parseHeightmap } from "@grand/shared";
import { RoomScene } from "../src/scene/room.ts";

/** The touch state machine drives real gameplay on phones; emit Pixi events by hand so it runs
 *  headless. A release emits on the tile first, then on the stage — the bubble order Pixi uses.
 *  That ordering itself is assumed here, not proven; proving it needs a device. */

const model = parseHeightmap("000\n000\n000", { x: 0, y: 0, dir: 0 });

let stage: Container;
let scene: RoomScene;
let clicks: Array<{ x: number; y: number; button: number }>;

function touchEvent(sx: number, sy: number): FederatedPointerEvent {
  return { pointerType: "touch", global: { x: sx, y: sy }, button: 0 } as unknown as FederatedPointerEvent;
}

function mouseEvent(button: number): FederatedPointerEvent {
  return { pointerType: "mouse", global: { x: 0, y: 0 }, button } as unknown as FederatedPointerEvent;
}

/** Tiles are added to the world row-major after the highlight marker, so child 1 + (y*3 + x)
 *  is the tile at (x, y). */
function tile(x: number, y: number): Container {
  const world = stage.children[0] as Container;
  return world.children[1 + y * 3 + x] as Container;
}

function release(x: number, y: number, e: FederatedPointerEvent): void {
  tile(x, y).emit("pointerup", e);
  stage.emit("pointerup", e);
}

beforeEach(() => {
  vi.useFakeTimers();
  stage = new Container();
  clicks = [];
  scene = new RoomScene(stage, model, {
    click: (x, y, button) => clicks.push({ x, y, button }),
    hover: () => {},
  });
});

afterEach(() => {
  scene.destroy();
  vi.useRealTimers();
});

test("touch tap clicks on release with the left-button path", () => {
  tile(1, 1).emit("pointerdown", touchEvent(10, 10));
  expect(clicks).toEqual([]);
  vi.advanceTimersByTime(200);
  release(1, 1, touchEvent(12, 11));
  expect(clicks).toEqual([{ x: 1, y: 1, button: 0 }]);
});

test("holding still for 500ms fires the pickup path once, and release adds nothing", () => {
  tile(2, 0).emit("pointerdown", touchEvent(10, 10));
  vi.advanceTimersByTime(500);
  expect(clicks).toEqual([{ x: 2, y: 0, button: 2 }]);
  release(2, 0, touchEvent(10, 10));
  expect(clicks).toHaveLength(1);
});

test("a drifting finger cancels both tap and long-press", () => {
  tile(1, 1).emit("pointerdown", touchEvent(10, 10));
  stage.emit("pointermove", touchEvent(30, 10));
  vi.advanceTimersByTime(500);
  release(1, 1, touchEvent(30, 10));
  expect(clicks).toEqual([]);
});

test("lifting over a different tile is a dead press, not a stray action", () => {
  tile(0, 0).emit("pointerdown", touchEvent(10, 10));
  release(1, 0, touchEvent(14, 10));
  vi.advanceTimersByTime(500);
  expect(clicks).toEqual([]);
});

test("a release outside the canvas cancels a pending press", () => {
  tile(1, 1).emit("pointerdown", touchEvent(10, 10));
  stage.emit("pointerupoutside", touchEvent(10, 10));
  vi.advanceTimersByTime(500);
  expect(clicks).toEqual([]);
});

test("mouse clicks keep firing on pointerdown, right button included", () => {
  tile(1, 2).emit("pointerdown", mouseEvent(0));
  tile(1, 2).emit("pointerdown", mouseEvent(2));
  expect(clicks).toEqual([
    { x: 1, y: 2, button: 0 },
    { x: 1, y: 2, button: 2 },
  ]);
});

test("destroy clears a pending long-press timer", () => {
  tile(1, 1).emit("pointerdown", touchEvent(10, 10));
  scene.destroy();
  vi.advanceTimersByTime(500);
  expect(clicks).toEqual([]);
  scene = new RoomScene(stage, model, { click: () => {}, hover: () => {} });
});
