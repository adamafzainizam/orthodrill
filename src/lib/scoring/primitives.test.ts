import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalise, positionKey, translate, boundingBox,
  type Segment, type Circle,
} from "./primitives.ts";

const seg = (x1: number, y1: number, x2: number, y2: number): Segment =>
  ({ kind: "segment", type: "visible", x1, y1, x2, y2 });

const circ = (cx: number, cy: number, r: number): Circle =>
  ({ kind: "circle", type: "visible", cx, cy, r });

// A segment drawn right-to-left is the same segment as left-to-right.
test("normalise orders segment endpoints deterministically", () => {
  assert.deepEqual(normalise(seg(2, 0, 0, 0)), normalise(seg(0, 0, 2, 0)));
});

test("normalise breaks ties on x using y", () => {
  assert.deepEqual(normalise(seg(1, 5, 1, 2)), normalise(seg(1, 2, 1, 5)));
});

test("normalise leaves circles unchanged", () => {
  assert.deepEqual(normalise(circ(3, 3, 2)), circ(3, 3, 2));
});

// positionKey deliberately EXCLUDES type. This is what lets the scorer say
// "right line, wrong line style" instead of marking it missing plus extra.
test("positionKey ignores primitive type", () => {
  const a: Segment = { ...seg(0, 0, 2, 0), type: "visible" };
  const b: Segment = { ...seg(0, 0, 2, 0), type: "hidden" };
  assert.equal(positionKey(a), positionKey(b));
});

test("positionKey distinguishes segments from circles at the same place", () => {
  assert.notEqual(positionKey(seg(0, 0, 2, 0)), positionKey(circ(0, 0, 2)));
});

test("positionKey distinguishes different positions", () => {
  assert.notEqual(positionKey(seg(0, 0, 2, 0)), positionKey(seg(0, 1, 2, 1)));
});

test("translate moves segments and circles", () => {
  assert.deepEqual(translate(seg(0, 0, 2, 0), 3, 4), seg(3, 4, 5, 4));
  assert.deepEqual(translate(circ(1, 1, 2), 3, 4), circ(4, 5, 2));
});

test("boundingBox spans segments and circles", () => {
  const box = boundingBox([seg(0, 0, 2, 0), circ(6, 6, 2)]);
  assert.deepEqual(box, { minX: 0, minY: 0, maxX: 8, maxY: 8 });
});

test("boundingBox of nothing is null, not a zero box", () => {
  assert.equal(boundingBox([]), null);
});
