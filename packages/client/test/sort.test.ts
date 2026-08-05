import { expect, test } from "vitest";
import { depthKey } from "../src/scene/sort.ts";

test("tile keys are finite and ordered by depth", () => {
  const near = depthKey({ kind: "tile", x: 0, y: 0, z: 0 });
  const far = depthKey({ kind: "tile", x: 11, y: 11, z: 0 });
  expect(Number.isFinite(near)).toBe(true);
  expect(near).toBeLessThan(far);
});
test("every tile draws under every non-tile", () =>
  expect(depthKey({ kind: "tile", x: 11, y: 11, z: 0 }))
    .toBeLessThan(depthKey({ kind: "floor_furni", x: 0, y: 0, z: 0 })));
test("nearer furni draws over farther furni", () => {
  expect(depthKey({ kind: "furni", x: 2, y: 2, z: 0 }))
    .toBeGreaterThan(depthKey({ kind: "furni", x: 1, y: 2, z: 0 }));
  expect(depthKey({ kind: "furni", x: 2, y: 3, z: 0 }))
    .toBeGreaterThan(depthKey({ kind: "furni", x: 2, y: 2, z: 0 }));
});
test("stacked item draws over its base on the same tile", () =>
  expect(depthKey({ kind: "furni", x: 3, y: 3, z: 1 }))
    .toBeGreaterThan(depthKey({ kind: "furni", x: 3, y: 3, z: 0 })));
test("same tile: rug under avatar under table", () => {
  const rug = depthKey({ kind: "floor_furni", x: 3, y: 3, z: 0 });
  const avatar = depthKey({ kind: "avatar", x: 3, y: 3, z: 0 });
  const table = depthKey({ kind: "furni", x: 3, y: 3, z: 0 });
  expect(rug).toBeLessThan(avatar);
  expect(avatar).toBeLessThan(table);
});
test("avatar draws under furni one tile nearer", () =>
  expect(depthKey({ kind: "avatar", x: 3, y: 3, z: 0 }))
    .toBeLessThan(depthKey({ kind: "furni", x: 4, y: 3, z: 0 })));
test("equal keys are possible and identical (stable sort resolves them)", () =>
  expect(depthKey({ kind: "furni", x: 2, y: 3, z: 0 }))
    .toBe(depthKey({ kind: "furni", x: 3, y: 2, z: 0 })));
test("a sitter draws between the two halves of its own seat (#227)", () => {
  // The far half is behind the sitter, the near half in front — which is the whole point of the
  // split. Before it existed the sitter was lifted above the entire chair, so a near-side back
  // could never occlude them.
  const tile = { x: 3, y: 3 };
  const far = depthKey({ kind: "furni_far", ...tile, z: 0 });
  const sitter = depthKey({ kind: "avatar", ...tile, z: 0.65625 });
  const near = depthKey({ kind: "furni_near", ...tile, z: 0 });
  expect(sitter).toBeGreaterThan(far);
  expect(near).toBeGreaterThan(sitter);
});
test("the z tiebreaker never lifts an item into the next layer", () => {
  // z < 10 by contract; at the old 1e-3 coefficient a z=9.9 item landed exactly on the layer
  // above, which five layers no longer tolerate.
  const tall = depthKey({ kind: "furni_far", x: 3, y: 3, z: 9.9 });
  expect(tall).toBeLessThan(depthKey({ kind: "avatar", x: 3, y: 3, z: 0 }));
  expect(depthKey({ kind: "avatar", x: 3, y: 3, z: 9.9 }))
    .toBeLessThan(depthKey({ kind: "furni", x: 3, y: 3, z: 0 }));
});
test("a sitter still draws under furni one tile nearer", () =>
  expect(depthKey({ kind: "avatar", x: 3, y: 3, z: 0.65625 }))
    .toBeLessThan(depthKey({ kind: "furni", x: 4, y: 3, z: 0 })));
test("a near half never escapes its own tile band", () =>
  expect(depthKey({ kind: "furni_near", x: 3, y: 3, z: 2 }))
    .toBeLessThan(depthKey({ kind: "furni", x: 4, y: 3, z: 0 })));
