import { test } from "node:test";
import assert from "node:assert/strict";
import { CONVENTIONS, directionFrom, checkPlacement } from "./placement.ts";
import type { Assignment } from "./assign.ts";
import type { Primitive, Segment } from "./primitives.ts";

const box = (x: number, y: number): Primitive[] =>
  [{ kind: "segment", type: "visible", x1: x, y1: y, x2: x + 4, y2: y + 4 } as Segment];

const emptyDiff = { correct: [], missing: [], extra: [], wrongType: [] };

const at = (front: [number, number], top: [number, number], side: [number, number]): Assignment => ({
  byView: {
    front: { cluster: box(...front), diff: emptyDiff },
    top:   { cluster: box(...top),   diff: emptyDiff },
    side:  { cluster: box(...side),  diff: emptyDiff },
  },
});

test("the two conventions differ on where the top view goes", () => {
  assert.notEqual(CONVENTIONS.first_angle.top, CONVENTIONS.third_angle.top);
});

test("directionFrom reports the dominant axis of separation", () => {
  const front = { minX: 0, minY: 0, maxX: 4, maxY: 4 };
  assert.equal(directionFrom(front, { minX: 0, minY: 20, maxX: 4, maxY: 24 }), "below");
  assert.equal(directionFrom(front, { minX: 0, minY: -20, maxX: 4, maxY: -16 }), "above");
  assert.equal(directionFrom(front, { minX: 20, minY: 0, maxX: 24, maxY: 4 }), "right");
  assert.equal(directionFrom(front, { minX: -20, minY: 0, maxX: -16, maxY: 4 }), "left");
});

test("placement matching the requested convention is correct", () => {
  const c = CONVENTIONS.first_angle;
  const topY = c.top === "below" ? 20 : -20;
  const sideX = c.side === "right" ? 20 : -20;
  const v = checkPlacement(at([0, 0], [0, topY], [sideX, 0]), "first_angle");
  assert.equal(v.correct, true);
  assert.equal(v.matchesOtherConvention, null);
});

// The specific, teachable failure: correct drawing, wrong convention.
test("placing views by the other convention is reported as exactly that", () => {
  const other = CONVENTIONS.third_angle;
  const topY = other.top === "below" ? 20 : -20;
  const sideX = other.side === "right" ? 20 : -20;
  const v = checkPlacement(at([0, 0], [0, topY], [sideX, 0]), "first_angle");
  assert.equal(v.correct, false);
  assert.equal(v.matchesOtherConvention, "third_angle");
});

test("nonsense placement is wrong but matches no convention", () => {
  const v = checkPlacement(at([0, 0], [20, 0], [0, 20]), "first_angle");
  assert.equal(v.correct, false);
  assert.equal(v.matchesOtherConvention, null);
});
