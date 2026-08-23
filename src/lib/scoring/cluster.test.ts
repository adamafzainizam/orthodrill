import { test } from "node:test";
import assert from "node:assert/strict";
import { clusterPrimitives } from "./cluster.ts";
import type { Segment } from "./primitives.ts";

const seg = (x1: number, y1: number, x2: number, y2: number): Segment =>
  ({ kind: "segment", type: "visible", x1, y1, x2, y2 });

test("primitives that touch form one cluster", () => {
  const out = clusterPrimitives([seg(0, 0, 2, 0), seg(2, 0, 2, 2)], 3);
  assert.equal(out.length, 1);
  assert.equal(out[0].length, 2);
});

test("primitives separated by more than the gap form separate clusters", () => {
  const out = clusterPrimitives([seg(0, 0, 2, 0), seg(20, 0, 22, 0)], 3);
  assert.equal(out.length, 2);
});

test("a gap exactly equal to the threshold still joins", () => {
  // Boxes at x 0..2 and x 5..7 are 3 apart; gap 3 must NOT split them.
  const out = clusterPrimitives([seg(0, 0, 2, 0), seg(5, 0, 7, 0)], 3);
  assert.equal(out.length, 1);
});

test("three separated groups produce three clusters", () => {
  const out = clusterPrimitives(
    [seg(0, 0, 2, 0), seg(20, 0, 22, 0), seg(0, 20, 2, 20)], 3,
  );
  assert.equal(out.length, 3);
});

test("clusters come back in a deterministic order: top-to-bottom, then left-to-right", () => {
  const out = clusterPrimitives(
    [seg(20, 20, 22, 20), seg(0, 0, 2, 0), seg(20, 0, 22, 0)], 3,
  );
  const boxes = out.map((c) => [c[0]] as Segment[]).map((c) => [c[0].x1, c[0].y1]);
  assert.deepEqual(boxes, [[0, 0], [20, 0], [20, 20]]);
});

test("an empty drawing produces no clusters", () => {
  assert.deepEqual(clusterPrimitives([], 3), []);
});
