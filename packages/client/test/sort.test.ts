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
test("a sitter draws over the seat it shares a tile with", () => {
  const chair = depthKey({ kind: "furni", x: 3, y: 3, z: 0 });
  const sitter = depthKey({ kind: "seated", x: 3, y: 3, z: 0.65625 });
  expect(sitter).toBeGreaterThan(chair);
});
test("a sitter still draws under furni one tile nearer", () =>
  expect(depthKey({ kind: "seated", x: 3, y: 3, z: 0.65625 }))
    .toBeLessThan(depthKey({ kind: "furni", x: 4, y: 3, z: 0 })));

// A wall stands half a tile behind the tiles it closes (#203). It takes that depth literally
// rather than sitting in a band, so an interior wall — the notch of an L-shaped room — sorts
// against the furni around it instead of always winning or always losing.
test("a wall draws under everything on the tile it borders", () => {
  const wall = depthKey({ kind: "wall", x: 3, y: 3, z: 0 });
  expect(wall).toBeLessThan(depthKey({ kind: "floor_furni", x: 3, y: 3, z: 0 }));
  expect(wall).toBeLessThan(depthKey({ kind: "avatar", x: 3, y: 3, z: 0 }));
  expect(wall).toBeLessThan(depthKey({ kind: "furni", x: 3, y: 3, z: 2 }));
});
test("a wall draws over furni on the tile behind it", () =>
  expect(depthKey({ kind: "wall", x: 3, y: 3, z: 0 }))
    .toBeGreaterThan(depthKey({ kind: "furni", x: 3, y: 2, z: 0 })));
test("a hung item draws over its own wall but under the room in front", () => {
  const hung = depthKey({ kind: "wall_furni", x: 3, y: 3, z: 0 });
  expect(hung).toBeGreaterThan(depthKey({ kind: "wall", x: 3, y: 3, z: 0 }));
  expect(hung).toBeLessThan(depthKey({ kind: "avatar", x: 3, y: 3, z: 0 }));
});
test("walls stay under the floor band's ceiling and above no tile", () =>
  expect(depthKey({ kind: "tile", x: 99, y: 99, z: 0 }))
    .toBeLessThan(depthKey({ kind: "wall", x: 0, y: 0, z: 0 })));
