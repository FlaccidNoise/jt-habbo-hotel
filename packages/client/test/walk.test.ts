import { expect, test } from "vitest";
import { worldToScreen } from "@grand/shared";
import { dirFromStep, lerpScreen, stepAt } from "../src/scene/walk.ts";

test("lerpScreen halfway through a +X step", () => {
  const a = worldToScreen(0, 0, 0, 64);
  const b = worldToScreen(1, 0, 0, 64);
  expect(lerpScreen(a, b, 250 / 500)).toEqual({ sx: 16, sy: 8 });
});

test("lerpScreen clamps t to the step", () => {
  const a = worldToScreen(0, 0, 0, 64);
  const b = worldToScreen(1, 0, 0, 64);
  expect(lerpScreen(a, b, -1)).toEqual(a);
  expect(lerpScreen(a, b, 2)).toEqual(b);
});

test("dirFromStep is the shared direction table", () => {
  expect(dirFromStep(1, 0)).toBe(2);
  expect(dirFromStep(-1, -1)).toBe(7);
});

test("stepAt splits elapsed time into a step index and a fraction", () => {
  expect(stepAt(1000, 500, 1000)).toEqual({ index: 0, t: 0 });
  expect(stepAt(1000, 500, 1750)).toEqual({ index: 1, t: 0.5 });
  expect(stepAt(1000, 500, 2000)).toEqual({ index: 2, t: 0 });
});

test("stepAt never rewinds when the clock estimate runs ahead of the walk", () => {
  expect(stepAt(1000, 500, 400)).toEqual({ index: 0, t: 0 });
});
