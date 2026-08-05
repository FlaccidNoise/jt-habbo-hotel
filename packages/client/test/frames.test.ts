import { describe, expect, test } from "vitest";
import { frameFor } from "../src/scene/frames.ts";
import type { FurniMeta } from "../src/scene/frames.ts";

// A 2×1 table sheet at scale 64: anchorX alternates with the footprint span per dir.
const META: FurniMeta = {
  sheet: "table_basic.png",
  frameW: 96,
  frameH: 80,
  dirs: [0, 2, 4, 6],
  anchorsX: [32, 64, 32, 64],
  anchorY: 48,
};

describe("frameFor", () => {
  test("selects the frame rect and anchor offset for each dir", () => {
    expect(frameFor(META, 0)).toEqual({ x: 0, y: 0, w: 96, h: 80, offsetX: -32, offsetY: -48 });
    expect(frameFor(META, 4)).toEqual({ x: 192, y: 0, w: 96, h: 80, offsetX: -32, offsetY: -48 });
    expect(frameFor(META, 6)).toEqual({ x: 288, y: 0, w: 96, h: 80, offsetX: -64, offsetY: -48 });
  });

  test("a dir the sheet does not carry renders nothing rather than the wrong frame", () => {
    expect(frameFor(META, 3)).toBeNull();
  });
});
