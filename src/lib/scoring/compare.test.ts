import { test } from "node:test";
import assert from "node:assert/strict";
import { compareView, isPerfect } from "./compare.ts";
import type { Primitive, Segment } from "./primitives.ts";

const seg = (x1: number, y1: number, x2: number, y2: number,
             type: Segment["type"] = "visible"): Segment =>
  ({ kind: "segment", type, x1, y1, x2, y2 });

const square: Primitive[] = [
  seg(0, 0, 4, 0), seg(4, 0, 4, 4), seg(4, 4, 0, 4), seg(0, 4, 0, 0),
];

test("an identical view is perfect", () => {
  const d = compareView(square, square);
  assert.equal(d.correct.length, 4);
  assert.equal(isPerfect(d), true);
});

test("comparison ignores where the view was drawn", () => {
  const moved = square.map((p) => seg((p as Segment).x1 + 50, (p as Segment).y1 + 50,
                                      (p as Segment).x2 + 50, (p as Segment).y2 + 50));
  assert.equal(isPerfect(compareView(moved, square)), true);
});

test("a missing edge is reported as missing", () => {
  const d = compareView(square.slice(0, 3), square);
  assert.equal(d.missing.length, 1);
  assert.equal(d.extra.length, 0);
  assert.equal(isPerfect(d), false);
});

test("an invented edge is reported as extra", () => {
  const d = compareView([...square, seg(0, 0, 4, 4)], square);
  assert.equal(d.extra.length, 1);
  assert.equal(d.missing.length, 0);
});

// The classic error the whole model exists to catch.
test("a hidden edge drawn solid is wrongType, not missing plus extra", () => {
  const key = [seg(0, 0, 4, 0, "hidden")];
  const drawn = [seg(0, 0, 4, 0, "visible")];
  const d = compareView(drawn, key);
  assert.equal(d.wrongType.length, 1);
  assert.equal(d.missing.length, 0);
  assert.equal(d.extra.length, 0);
  assert.equal(d.wrongType[0].expected.type, "hidden");
  assert.equal(d.wrongType[0].drawn.type, "visible");
  assert.equal(isPerfect(d), false);
});

test("a circle matches a circle of the same centre and radius", () => {
  const key: Primitive[] = [{ kind: "circle", type: "visible", cx: 2, cy: 2, r: 2 }];
  assert.equal(isPerfect(compareView(key, key)), true);
});

test("a circle of the wrong radius is missing plus extra, not wrongType", () => {
  const key: Primitive[] = [{ kind: "circle", type: "visible", cx: 2, cy: 2, r: 2 }];
  const drawn: Primitive[] = [{ kind: "circle", type: "visible", cx: 2, cy: 2, r: 3 }];
  const d = compareView(drawn, key);
  assert.equal(d.wrongType.length, 0);
  assert.equal(d.missing.length, 1);
  assert.equal(d.extra.length, 1);
});

test("an empty attempt against a real key is all missing", () => {
  const d = compareView([], square);
  assert.equal(d.missing.length, 4);
  assert.equal(d.correct.length, 0);
});

// A centre line legitimately extends past the object it marks, so it sits in
// the view's bounding box. Anchoring the translation on it would mean a student
// who draws the part perfectly but picks a different centre-line length shifts
// the whole view, and EVERY primitive is reported wrong. Normalisation is
// therefore anchored on the object's own primitives.
test("a longer centre line does not shift the rest of the view", () => {
  const key: Primitive[] = [
    seg(0, 0, 8, 0), seg(8, 0, 8, 8), seg(8, 8, 0, 8), seg(0, 8, 0, 0),
    seg(0, 4, 8, 4, "centre"),
  ];
  const drawn: Primitive[] = [
    seg(0, 0, 8, 0), seg(8, 0, 8, 8), seg(8, 8, 0, 8), seg(0, 8, 0, 0),
    seg(-2, 4, 10, 4, "centre"), // same part, centre line drawn longer
  ];
  const d = compareView(drawn, key);
  assert.equal(d.correct.length, 4, "all four outline edges must still match");
  assert.equal(d.missing.length, 1, "only the centre line differs");
  assert.equal(d.extra.length, 1);
});

test("a view of nothing but centre lines still normalises", () => {
  const only: Primitive[] = [seg(0, 4, 8, 4, "centre")];
  assert.equal(isPerfect(compareView(only, only)), true);
});

test("the diff reports where the attempt was drawn, so feedback can be placed", () => {
  const key: Primitive[] = [
    { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 4, y2: 0 },
  ];
  // The same view, drawn 10 right and 7 down.
  const attempt: Primitive[] = [
    { kind: "segment", type: "visible", x1: 10, y1: 7, x2: 14, y2: 7 },
  ];
  const d = compareView(attempt, key);
  assert.deepEqual(d.anchor, { dx: 10, dy: 7 });
});

test("the anchor ignores centre-line overhang, matching the diff's own anchor rule", () => {
  const key: Primitive[] = [
    { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 4, y2: 0 },
  ];
  const attempt: Primitive[] = [
    { kind: "segment", type: "visible", x1: 10, y1: 7, x2: 14, y2: 7 },
    // A centre line running 2 units left of the object must not move the anchor.
    { kind: "segment", type: "centre", x1: 8, y1: 7, x2: 16, y2: 7 },
  ];
  assert.deepEqual(compareView(attempt, key).anchor, { dx: 10, dy: 7 });
});

test("a view with nothing in it reports a zero anchor rather than crashing", () => {
  assert.deepEqual(compareView([], []).anchor, { dx: 0, dy: 0 });
});
