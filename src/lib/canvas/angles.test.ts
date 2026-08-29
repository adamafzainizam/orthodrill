import { test } from "node:test";
import assert from "node:assert/strict";
import { headingOf, cornerAngle, isExactAngle, interactionsWith } from "./angles.ts";
import type { Primitive } from "../scoring/primitives.ts";

const seg = (x1: number, y1: number, x2: number, y2: number): Primitive =>
  ({ kind: "segment", type: "visible", x1, y1, x2, y2 });

test("heading reads as it LOOKS on screen, where grid y runs downward", () => {
  assert.equal(headingOf({ x: 0, y: 0 }, { x: 5, y: 0 }), 0);      // due right
  assert.equal(headingOf({ x: 0, y: 0 }, { x: 5, y: -5 }), 45);    // up and right
  assert.equal(headingOf({ x: 0, y: 0 }, { x: 0, y: -5 }), 90);    // straight up
  assert.equal(headingOf({ x: 0, y: 0 }, { x: -5, y: -5 }), 135);  // up and left
  // A line, not a ray: the reverse direction reads the same.
  assert.equal(headingOf({ x: 5, y: -5 }, { x: 0, y: 0 }), 45);
});

test("heading is null for a zero-length line, so nothing is shown before the cursor moves", () => {
  assert.equal(headingOf({ x: 3, y: 3 }, { x: 3, y: 3 }), null);
});

test("corner angle is the TRUE corner in [0,180], not the acute one", () => {
  assert.equal(cornerAngle({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 5 }), 90);
  assert.equal(cornerAngle({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }), 45);
  // POSITIVE CONTROL for the design decision: an obtuse corner must read 135,
  // not 45. This test FAILS under an "acute angle everywhere" implementation,
  // so it pins the choice and not merely the arithmetic.
  assert.equal(cornerAngle({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }), 135);
  assert.equal(cornerAngle({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }), 180);
});

test("exactness is decided in integer arithmetic, never by comparing floats", () => {
  assert.equal(isExactAngle(1, 0, 0, 1), true);    // 90
  assert.equal(isExactAngle(1, 0, 1, 1), true);    // 45
  assert.equal(isExactAngle(1, 0, -1, 1), true);   // 135
  assert.equal(isExactAngle(1, 0, 3, 0), true);    // 0
  assert.equal(isExactAngle(1, 0, 2, 1), false);   // 26.57
  assert.equal(isExactAngle(1, 0, 4, 7), false);   // 60.26 -- the near-60 case
});

test("a shared endpoint reports a corner, at that endpoint", () => {
  const ps = [seg(0, 0, 10, 0)];
  const got = interactionsWith({ x: 0, y: 0 }, { x: 0, y: -6 }, ps);
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, "corner");
  assert.deepEqual(got[0].at, { x: 0, y: 0 });
  assert.equal(got[0].degrees, 90);
  assert.equal(got[0].exact, true);
});

test("a proper crossing reports the acute angle, at the crossing point", () => {
  const ps = [seg(0, 0, 10, 0)];
  const got = interactionsWith({ x: 5, y: -5 }, { x: 5, y: 5 }, ps);
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, "crossing");
  assert.deepEqual(got[0].at, { x: 5, y: 0 });
  assert.equal(got[0].degrees, 90);
});

test("POSITIVE CONTROL: two disjoint segments report NO interaction", () => {
  const ps = [seg(0, 0, 4, 0)];
  assert.deepEqual(interactionsWith({ x: 20, y: 20 }, { x: 25, y: 25 }, ps), []);
});

test("POSITIVE CONTROL: a parallel line that never meets reports nothing", () => {
  const ps = [seg(0, 0, 10, 0)];
  assert.deepEqual(interactionsWith({ x: 0, y: 4 }, { x: 10, y: 4 }, ps), []);
});

test("circles are skipped entirely -- the angle to a circle is against its tangent", () => {
  const ps: Primitive[] = [{ kind: "circle", type: "visible", cx: 5, cy: 0, r: 3 }];
  assert.deepEqual(interactionsWith({ x: 5, y: -6 }, { x: 5, y: 6 }, ps), []);
});

test("construction lines DO count -- the mitre line is what a student measures against", () => {
  const ps: Primitive[] = [
    { kind: "segment", type: "construction", x1: 0, y1: 0, x2: 10, y2: 10 },
  ];
  const got = interactionsWith({ x: 0, y: 0 }, { x: 10, y: 0 }, ps);
  assert.equal(got.length, 1);
  assert.equal(got[0].degrees, 45);
  assert.equal(got[0].exact, true);
});

test("a T-junction -- an endpoint landing mid-line -- reports as a crossing", () => {
  const ps = [seg(0, 0, 10, 0)];
  const got = interactionsWith({ x: 5, y: 0 }, { x: 5, y: -6 }, ps);
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, "crossing");
  assert.equal(got[0].degrees, 90);
});
