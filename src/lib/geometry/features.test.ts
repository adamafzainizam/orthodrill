import { test } from "node:test";
import assert from "node:assert/strict";
import { step, notch, slot, opening } from "./features.ts";
import { block } from "./solid.ts";
import { buildOccupancy } from "./occupancy.ts";

test("a step at the top-left-front removes that corner and nothing else", () => {
  const s = step(block(6, 6, 6), "top-left-front", 2, 2, 2);
  const o = buildOccupancy(s);
  assert.equal(o.isSolid(0, 0, 5), false, "the corner is gone");
  assert.equal(o.isSolid(5, 5, 5), true, "the far top corner remains");
  assert.equal(o.isSolid(0, 0, 0), true, "the bottom is untouched");
});

test("a step at the top-right-front removes the opposite corner", () => {
  const o = buildOccupancy(step(block(6, 6, 6), "top-right-front", 2, 2, 2));
  assert.equal(o.isSolid(5, 0, 5), false);
  assert.equal(o.isSolid(0, 0, 5), true);
});

test("helpers record their own name as metadata", () => {
  assert.equal(step(block(6, 6, 6), "top-left-front", 2, 2, 2).ops[0].name, "step");
  assert.equal(notch(block(6, 6, 6), "front", 2, 2, 2).ops[0].name, "notch");
  assert.equal(slot(block(6, 6, 6), "x", 2, 2, 2).ops[0].name, "slot");
  assert.equal(opening(block(6, 6, 6), "y", 2, 2, 2, 2).ops[0].name, "opening");
});

test("a notch on the front edge cuts inward from y = 0", () => {
  const o = buildOccupancy(notch(block(6, 6, 6), "front", 2, 2, 2));
  assert.equal(o.isSolid(2, 0, 5), false);
  assert.equal(o.isSolid(2, 3, 5), true, "the notch does not reach the back");
});

test("a slot runs the full length of its axis", () => {
  const o = buildOccupancy(slot(block(6, 6, 6), "x", 2, 2, 2));
  assert.equal(o.isSolid(0, 2, 5), false);
  assert.equal(o.isSolid(5, 2, 5), false, "the slot spans the whole x extent");
});

test("an opening passes all the way through its axis", () => {
  const o = buildOccupancy(opening(block(6, 6, 6), "y", 2, 2, 2, 2));
  assert.equal(o.isSolid(2, 0, 2), false);
  assert.equal(o.isSolid(2, 5, 2), false, "it goes right through");
});

test("every helper produces exactly one box operation", () => {
  for (const s of [
    step(block(6, 6, 6), "top-left-front", 2, 2, 2),
    notch(block(6, 6, 6), "front", 2, 2, 2),
    slot(block(6, 6, 6), "x", 2, 2, 2),
    opening(block(6, 6, 6), "y", 2, 2, 2, 2),
  ]) {
    assert.equal(s.ops.length, 1);
    assert.equal(s.ops[0].kind, "box");
  }
});
