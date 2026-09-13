import { test } from "node:test";
import assert from "node:assert/strict";
import { initBuilder, reduceBuilder, builderCells } from "./builder.ts";
import { isoPickList } from "../geometry/isopick.ts";
import { occupancyFromCells } from "../geometry/cells.ts";
import { rotatedOccupancy } from "../geometry/rotate3.ts";
import type { Cell } from "../geometry/rotate3.ts";
import type { PickFace } from "../geometry/isopick.ts";

const BASE = { w: 2, d: 3, h: 2 };
const key = (c: Cell) => c.join(",");
const has = (cells: readonly Cell[], c: Cell) => cells.some((o) => key(o) === key(c));

/** The face the builder would actually offer, at the CURRENT viewpoint. */
function faceOn(state: ReturnType<typeof initBuilder>, cell: Cell, dir: PickFace["dir"]): PickFace {
  const occ = occupancyFromCells(builderCells(state), BASE.w, BASE.d, BASE.h);
  const picks = isoPickList(rotatedOccupancy(occ, state.q));
  const f = picks.find((p) => p.dir === dir && key(p.cell) === key(cell));
  if (f === undefined) throw new Error(`no ${dir} face at ${key(cell)} for q=${state.q}`);
  return f;
}

test("a new builder starts as the full base block", () => {
  assert.equal(builderCells(initBuilder(BASE)).length, 2 * 3 * 2);
});

test("removing a face's owning block deletes exactly that cell", () => {
  const s0 = initBuilder(BASE);
  const f = faceOn(s0, [0, 0, 1], "+z");
  const s1 = reduceBuilder(s0, { kind: "remove", face: f });
  assert.equal(builderCells(s1).length, 11);
  assert.equal(has(builderCells(s1), [0, 0, 1]), false);
});

test("POSITIVE CONTROL: a removal at a ROTATED viewpoint hits the cell the student sees", () => {
  // The test that a rotation-blind reducer cannot pass. At q=1 the pick list's
  // coordinates are in ROTATED space, so acting on `face.cell` directly would
  // delete a different block from the one clicked. At q=0 the two agree, which
  // is exactly why q=0 cannot be the only case tested.
  const s0 = reduceBuilder(initBuilder(BASE), { kind: "rotate", delta: 1 });
  assert.equal(s0.q, 1);
  const f = faceOn(s0, [0, 0, 1], "+z");
  const s1 = reduceBuilder(s0, { kind: "remove", face: f });

  // Derived from the rotation rule, not from the reducer: for q=1 a rotated
  // (i,j,k) came from (j, d-1-i, k) = (0, 3-1-0, 1) = (0, 2, 1).
  assert.equal(has(builderCells(s1), [0, 2, 1]), false, "the clicked block survived");
  assert.equal(has(builderCells(s1), [0, 0, 1]), true, "a DIFFERENT block was removed");
});

test("adding against a face puts a block on the far side of it, in unrotated space", () => {
  // Carve a notch, then click the floor it exposed and put the block back.
  const s0 = initBuilder(BASE);
  const removed = reduceBuilder(s0, { kind: "remove", face: faceOn(s0, [0, 0, 1], "+z") });
  assert.equal(has(builderCells(removed), [0, 0, 1]), false);
  const floor = faceOn(removed, [0, 0, 0], "+z");
  const restored = reduceBuilder(removed, { kind: "add", face: floor });
  assert.equal(has(builderCells(restored), [0, 0, 1]), true, "the block did not come back");
  assert.equal(builderCells(restored).length, 12);
});

test("an add that would land outside the base block is refused", () => {
  // The student is CARVING, not building outward. Confining adds also keeps
  // every submission inside validateCells' bounds by construction.
  const s0 = initBuilder(BASE);
  const top = faceOn(s0, [0, 0, 1], "+z"); // the roof — adding here leaves the block
  const s1 = reduceBuilder(s0, { kind: "add", face: top });
  assert.equal(builderCells(s1).length, 12, "a cell was added outside the base block");
});

test("undo restores the previous build, and redo reapplies it", () => {
  const s0 = initBuilder(BASE);
  const s1 = reduceBuilder(s0, { kind: "remove", face: faceOn(s0, [0, 0, 1], "+z") });
  const undone = reduceBuilder(s1, { kind: "undo" });
  assert.equal(builderCells(undone).length, 12);
  const redone = reduceBuilder(undone, { kind: "redo" });
  assert.equal(builderCells(redone).length, 11);
});

test("rotating the viewpoint is NOT an edit and does not enter the undo stack", () => {
  // Undo should take back what a student BUILT, not where they were standing.
  const s0 = initBuilder(BASE);
  const s1 = reduceBuilder(s0, { kind: "remove", face: faceOn(s0, [0, 0, 1], "+z") });
  const turned = reduceBuilder(reduceBuilder(s1, { kind: "rotate", delta: 1 }), { kind: "rotate", delta: 1 });
  const undone = reduceBuilder(turned, { kind: "undo" });
  assert.equal(builderCells(undone).length, 12, "undo took back a rotation instead of the cut");
  assert.equal(undone.q, 2, "undo moved the viewpoint");
});

test("rotate wraps through all four stops in both directions", () => {
  let s = initBuilder(BASE);
  for (const expected of [1, 2, 3, 0]) {
    s = reduceBuilder(s, { kind: "rotate", delta: 1 });
    assert.equal(s.q, expected);
  }
  s = reduceBuilder(s, { kind: "rotate", delta: -1 });
  assert.equal(s.q, 3, "rotating back from 0 must wrap to 3, not to -1");
});

test("reset returns the full block and is itself undoable", () => {
  const s0 = initBuilder(BASE);
  const s1 = reduceBuilder(s0, { kind: "remove", face: faceOn(s0, [0, 0, 1], "+z") });
  const s2 = reduceBuilder(s1, { kind: "reset" });
  assert.equal(builderCells(s2).length, 12);
  assert.equal(builderCells(reduceBuilder(s2, { kind: "undo" })).length, 11);
});

test("a build carved to nothing is recoverable by undo", () => {
  // With no cells there are no faces, so there is nothing left to click. Undo
  // is the only way back, and it must work or the student is stuck.
  let s = initBuilder({ w: 1, d: 1, h: 1 });
  const occ = occupancyFromCells(builderCells(s), 1, 1, 1);
  const f = isoPickList(rotatedOccupancy(occ, 0))[0];
  s = reduceBuilder(s, { kind: "remove", face: f });
  assert.equal(builderCells(s).length, 0);
  assert.equal(builderCells(reduceBuilder(s, { kind: "undo" })).length, 1);
});
