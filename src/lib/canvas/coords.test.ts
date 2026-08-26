import { test } from "node:test";
import assert from "node:assert/strict";
import { gridToScreen, screenToGrid, radiusFrom } from "./coords.ts";

const v = { cell: 20, padding: 16 };

test("a grid point maps to its pixel position", () => {
  assert.deepEqual(gridToScreen({ x: 0, y: 0 }, v), { x: 16, y: 16 });
  assert.deepEqual(gridToScreen({ x: 3, y: 2 }, v), { x: 76, y: 56 });
});

test("a pixel position snaps to the nearest intersection", () => {
  assert.deepEqual(screenToGrid({ x: 76, y: 56 }, v), { x: 3, y: 2 });
  assert.deepEqual(screenToGrid({ x: 80, y: 59 }, v), { x: 3, y: 2 });
  assert.deepEqual(screenToGrid({ x: 87, y: 66 }, v), { x: 4, y: 3 });
});

test("snapping rounds to the nearer intersection at the halfway point", () => {
  assert.deepEqual(screenToGrid({ x: 16 + 10, y: 16 }, v), { x: 1, y: 0 });
});

test("screen and grid round-trip for every intersection", () => {
  for (let x = 0; x < 12; x++) {
    for (let y = 0; y < 12; y++) {
      assert.deepEqual(screenToGrid(gridToScreen({ x, y }, v), v), { x, y });
    }
  }
});

test("a radius is a whole number of grid units", () => {
  assert.equal(radiusFrom({ x: 0, y: 0 }, { x: 3, y: 0 }), 3);
  assert.equal(radiusFrom({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("a radius rounds to the nearest whole unit", () => {
  assert.equal(radiusFrom({ x: 0, y: 0 }, { x: 2, y: 2 }), 3); // 2.83 -> 3
});

test("a radius is never zero, so a click cannot make an invalid circle", () => {
  assert.equal(radiusFrom({ x: 5, y: 5 }, { x: 5, y: 5 }), 1);
});
