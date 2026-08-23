import { test } from "node:test";
import assert from "node:assert/strict";
import { VIEW_SPECS } from "./viewspec.ts";

test("each view looks along a different axis", () => {
  const axes = [VIEW_SPECS.front.depth, VIEW_SPECS.top.depth, VIEW_SPECS.side.depth];
  assert.deepEqual([...new Set(axes)].sort(), ["x", "y", "z"]);
});

test("the front view maps model x to screen x and model z upward", () => {
  const s = VIEW_SPECS.front;
  assert.equal(s.depth, "y");
  assert.equal(s.nearIsLow, true);
  assert.deepEqual([s.su, s.suSign], ["x", 1]);
  assert.deepEqual([s.sv, s.svSign], ["z", -1]);
});

test("the top view is seen from above, so nearer means larger z", () => {
  const s = VIEW_SPECS.top;
  assert.equal(s.depth, "z");
  assert.equal(s.nearIsLow, false);
  assert.deepEqual([s.su, s.suSign], ["x", 1]);
  assert.deepEqual([s.sv, s.svSign], ["y", -1]);
});

test("the side view is the RIGHT-side view, so nearer means larger x", () => {
  const s = VIEW_SPECS.side;
  assert.equal(s.depth, "x");
  assert.equal(s.nearIsLow, false);
  assert.deepEqual([s.su, s.suSign], ["y", 1]);
  assert.deepEqual([s.sv, s.svSign], ["z", -1]);
});

// Both follow from the table and neither is obvious; see design §7.
test("front-of-object sits at the bottom of the top view", () => {
  const s = VIEW_SPECS.top;
  const front = s.svSign * 0;   // model y = 0
  const back = s.svSign * 10;   // model y = 10
  assert.ok(front > back, "smaller model y must map to LARGER screen y (lower)");
});

test("front-of-object sits at the left of the right-side view", () => {
  const s = VIEW_SPECS.side;
  const front = s.suSign * 0;
  const back = s.suSign * 10;
  assert.ok(front < back, "smaller model y must map to SMALLER screen x (further left)");
});

test("every view uses two distinct screen axes, neither of them the depth axis", () => {
  for (const s of Object.values(VIEW_SPECS)) {
    assert.notEqual(s.su, s.sv);
    assert.notEqual(s.su, s.depth);
    assert.notEqual(s.sv, s.depth);
  }
});
