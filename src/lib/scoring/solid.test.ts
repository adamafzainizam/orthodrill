import { test } from "node:test";
import assert from "node:assert/strict";
import { groupRegions, describeWhere, scoreSolid } from "./solid.ts";
import { cellsOfSolid } from "../geometry/cells.ts";
import { block, subtractBox } from "../geometry/solid.ts";
import type { Cell } from "../geometry/rotate3.ts";

test("groupRegions puts face-touching cells in one region", () => {
  const r = groupRegions([[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.equal(r.length, 1);
  assert.equal(r[0].length, 3);
});

test("groupRegions separates cells that do not touch", () => {
  const r = groupRegions([[0, 0, 0], [5, 5, 5]]);
  assert.equal(r.length, 2);
});

test("groupRegions does NOT join cells that touch only at a corner", () => {
  // 6-connectivity, not 26. Two diagonal cells are two separate mistakes and
  // deserve two separate sentences.
  const r = groupRegions([[0, 0, 0], [1, 1, 0]]);
  assert.equal(r.length, 2, "diagonally adjacent cells were merged — that is 26-connectivity");
});

test("groupRegions joins across all three axes", () => {
  const r = groupRegions([[0, 0, 0], [0, 0, 1], [0, 1, 1]]);
  assert.equal(r.length, 1);
});

test("groupRegions on an empty set returns no regions", () => {
  assert.deepEqual(groupRegions([]), []);
});

test("describeWhere names the corner a region sits in", () => {
  // extent is the key's bounding-box size, so thirds of a 9x9x9 part are 3 wide.
  assert.equal(describeWhere([[0, 0, 0]], [9, 9, 9]), "at the bottom front left");
  assert.equal(describeWhere([[8, 8, 8]], [9, 9, 9]), "at the top back right");
});

test("describeWhere drops the axes a region is central on", () => {
  assert.equal(describeWhere([[4, 4, 8]], [9, 9, 9]), "at the top");
  assert.equal(describeWhere([[0, 4, 4]], [9, 9, 9]), "at the left");
});

test("describeWhere says 'in the middle' when a region is central on every axis", () => {
  assert.equal(describeWhere([[4, 4, 4]], [9, 9, 9]), "in the middle");
});

test("scoreSolid calls an identical build perfect", () => {
  const key = cellsOfSolid(subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }, "step"));
  const r = scoreSolid(key, key);
  assert.equal(r.perfect, true);
  assert.deepEqual(r.diff.missing, []);
  assert.deepEqual(r.diff.extra, []);
});

test("scoreSolid ignores where the part sits", () => {
  const key = cellsOfSolid(subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }, "step"));
  const moved: Cell[] = key.map(([x, y, z]) => [x + 7, y + 3, z + 11]);
  assert.equal(scoreSolid(moved, key).perfect, true, "a translated build must score the same");
});

test("scoreSolid reports material the student failed to leave in place", () => {
  const key = cellsOfSolid(block(3, 3, 3));
  const attempt = key.filter((c) => !(c[0] === 0 && c[1] === 0 && c[2] === 0));
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false);
  assert.equal(r.diff.missing.length, 1);
  assert.equal(r.diff.missing[0].cells.length, 1);
  assert.equal(r.diff.extra.length, 0);
});

test("scoreSolid reports material the student left that should be cut away", () => {
  const key = cellsOfSolid(subtractBox(block(3, 3, 3), { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, "nick"));
  const attempt = cellsOfSolid(block(3, 3, 3));
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false);
  assert.equal(r.diff.extra.length, 1);
  assert.equal(r.diff.missing.length, 0);
});

test("scoreSolid groups one contiguous mistake into ONE region, not many cells", () => {
  // The whole reason regions exist: "there is material at the back left" is a
  // sentence a student can act on. "cells (2,2,0), (2,2,1), (2,2,2) are wrong"
  // is a checksum.
  const key = cellsOfSolid(subtractBox(block(3, 3, 3), { x: 2, y: 2, z: 0, w: 1, d: 1, h: 3 }, "post"));
  const attempt = cellsOfSolid(block(3, 3, 3));
  const r = scoreSolid(attempt, key);
  assert.equal(r.diff.extra.length, 1, "three stacked cells are one mistake");
  assert.equal(r.diff.extra[0].cells.length, 3);
});
