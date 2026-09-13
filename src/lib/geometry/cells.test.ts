import { test } from "node:test";
import assert from "node:assert/strict";
import { cellsOfOccupancy, cellsOfSolid, occupancyFromCells, normaliseCells, cellKey } from "./cells.ts";
import { block, subtractBox } from "./solid.ts";
import type { Cell } from "./rotate3.ts";

test("cellsOfSolid returns every occupied cell of a plain block", () => {
  assert.equal(cellsOfSolid(block(2, 3, 4)).length, 24);
});

test("cellsOfSolid omits the cells a subtraction removed", () => {
  const s = subtractBox(block(4, 2, 2), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 1 }, "notch");
  assert.equal(cellsOfSolid(s).length, 16 - 4);
});

test("cells come back sorted by z, then y, then x", () => {
  const cells = cellsOfSolid(block(2, 2, 2));
  assert.deepEqual(cells, [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ]);
});

test("occupancyFromCells round-trips through cellsOfOccupancy", () => {
  const s = subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }, "step");
  const cells = cellsOfSolid(s);
  const o = occupancyFromCells(cells, 4, 3, 3);
  assert.deepEqual(cellsOfOccupancy(o), cells);
});

test("occupancyFromCells reports empty outside its bounds rather than throwing", () => {
  const o = occupancyFromCells([[0, 0, 0]], 1, 1, 1);
  assert.equal(o.isSolid(0, 0, 0), true);
  assert.equal(o.isSolid(-1, 0, 0), false);
  assert.equal(o.isSolid(0, 0, 5), false);
});

test("normaliseCells moves the bounding box to the origin", () => {
  const shifted: Cell[] = [[5, 7, 2], [6, 7, 2], [5, 8, 2]];
  assert.deepEqual(normaliseCells(shifted), [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
});

test("normaliseCells makes translation invisible — the whole point", () => {
  const a: Cell[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  const b: Cell[] = [[10, 20, 30], [11, 20, 30], [10, 21, 30]];
  assert.deepEqual(normaliseCells(a), normaliseCells(b));
});

test("POSITIVE CONTROL: normaliseCells does NOT make a different shape equal", () => {
  // Normalising is a translation, not a scrub. If this ever passes, the
  // scorer would call two different parts identical.
  const a: Cell[] = [[0, 0, 0], [1, 0, 0]];
  const b: Cell[] = [[0, 0, 0], [0, 1, 0]];
  assert.notDeepEqual(normaliseCells(a), normaliseCells(b));
});

test("normaliseCells on an empty set returns an empty set", () => {
  assert.deepEqual(normaliseCells([]), []);
});

test("cellKey distinguishes cells that differ on any one axis", () => {
  assert.notEqual(cellKey([1, 0, 0]), cellKey([0, 1, 0]));
  assert.equal(cellKey([1, 2, 3]), cellKey([1, 2, 3]));
});
