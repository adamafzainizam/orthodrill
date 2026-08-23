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

test("a step at the top-right-back removes that back-right corner", () => {
  const o = buildOccupancy(step(block(6, 6, 6), "top-right-back", 2, 2, 2));
  assert.equal(o.isSolid(5, 5, 5), false, "the high-x, high-y, high-z corner is removed");
  assert.equal(o.isSolid(0, 0, 5), true, "the opposite top corner remains");
});

test("a step at the top-left-back removes that back-left corner", () => {
  const o = buildOccupancy(step(block(6, 6, 6), "top-left-back", 2, 2, 2));
  assert.equal(o.isSolid(0, 5, 5), false, "the low-x, high-y, high-z corner is removed");
  assert.equal(o.isSolid(5, 5, 5), true, "the far back-right corner remains");
});

test("a notch on the back edge cuts inward from y = base.d", () => {
  const o = buildOccupancy(notch(block(6, 6, 6), "back", 2, 2, 2));
  assert.equal(o.isSolid(2, 5, 5), false, "the high-y side is cut");
  assert.equal(o.isSolid(2, 0, 5), true, "the low-y side remains");
});

test("a notch on the left edge cuts inward from x = 0", () => {
  const o = buildOccupancy(notch(block(6, 6, 6), "left", 2, 2, 2));
  assert.equal(o.isSolid(0, 2, 5), false, "the low-x side is cut");
  assert.equal(o.isSolid(5, 2, 5), true, "the high-x side remains");
});

test("a notch on the right edge cuts inward from x = base.w", () => {
  const o = buildOccupancy(notch(block(6, 6, 6), "right", 2, 2, 2));
  assert.equal(o.isSolid(5, 2, 5), false, "the high-x side is cut");
  assert.equal(o.isSolid(0, 2, 5), true, "the low-x side remains");
});

test("left and right notches remove different cells", () => {
  const left = buildOccupancy(notch(block(6, 6, 6), "left", 2, 2, 2));
  const right = buildOccupancy(notch(block(6, 6, 6), "right", 2, 2, 2));
  assert.equal(left.isSolid(0, 2, 5), false, "left removes low-x");
  assert.equal(right.isSolid(0, 2, 5), true, "right leaves low-x intact");
  assert.equal(right.isSolid(5, 2, 5), false, "right removes high-x");
  assert.equal(left.isSolid(5, 2, 5), true, "left leaves high-x intact");
});

test("a slot on the y axis spans the full y extent", () => {
  const o = buildOccupancy(slot(block(6, 6, 6), "y", 2, 2, 2));
  assert.equal(o.isSolid(2, 0, 5), false, "reaches low-y");
  assert.equal(o.isSolid(2, 5, 5), false, "reaches high-y");
  assert.equal(o.isSolid(5, 2, 5), true, "different x remains untouched");
});

test("x and y slots remove different cells", () => {
  const xSlot = buildOccupancy(slot(block(6, 6, 6), "x", 2, 2, 2));
  const ySlot = buildOccupancy(slot(block(6, 6, 6), "y", 2, 2, 2));
  assert.equal(xSlot.isSolid(0, 2, 5), false, "x-slot spans x-extent");
  assert.equal(ySlot.isSolid(0, 2, 5), true, "y-slot does not");
  assert.equal(ySlot.isSolid(2, 0, 5), false, "y-slot spans y-extent");
  assert.equal(xSlot.isSolid(2, 0, 5), true, "x-slot does not");
});

test("an opening on the x axis passes through both x boundaries", () => {
  const o = buildOccupancy(opening(block(6, 6, 6), "x", 2, 2, 2, 2));
  assert.equal(o.isSolid(0, 2, 2), false, "reaches x = 0");
  assert.equal(o.isSolid(5, 2, 2), false, "reaches x = 5");
  assert.equal(o.isSolid(2, 0, 2), true, "outside cross-section remains");
});

test("an opening on the z axis passes through both z boundaries", () => {
  const o = buildOccupancy(opening(block(6, 6, 6), "z", 2, 2, 2, 2));
  assert.equal(o.isSolid(2, 2, 0), false, "reaches z = 0");
  assert.equal(o.isSolid(2, 2, 5), false, "reaches z = 5");
  assert.equal(o.isSolid(0, 2, 2), true, "outside cross-section remains");
});

test("x, y, z openings remove different cells", () => {
  const xOpening = buildOccupancy(opening(block(6, 6, 6), "x", 2, 2, 2, 2));
  const yOpening = buildOccupancy(opening(block(6, 6, 6), "y", 2, 2, 2, 2));
  const zOpening = buildOccupancy(opening(block(6, 6, 6), "z", 2, 2, 2, 2));
  assert.equal(xOpening.isSolid(0, 2, 2), false, "x-opening at cross-section");
  assert.equal(yOpening.isSolid(0, 2, 2), true, "y-opening does not include");
  assert.equal(yOpening.isSolid(2, 0, 2), false, "y-opening at cross-section");
  assert.equal(zOpening.isSolid(2, 0, 2), true, "z-opening does not include");
  assert.equal(zOpening.isSolid(2, 2, 0), false, "z-opening at cross-section");
  assert.equal(xOpening.isSolid(2, 2, 0), true, "x-opening does not include");
});
