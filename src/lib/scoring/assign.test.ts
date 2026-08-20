import { test } from "node:test";
import assert from "node:assert/strict";
import { assignClusters, type KeyViews } from "./assign.ts";
import { isPerfect } from "./compare.ts";
import type { Primitive, Segment } from "./primitives.ts";

const seg = (x1: number, y1: number, x2: number, y2: number): Segment =>
  ({ kind: "segment", type: "visible", x1, y1, x2, y2 });

// Three deliberately distinguishable views.
const frontKey: Primitive[] = [seg(0, 0, 4, 0), seg(0, 0, 0, 4)];
const topKey: Primitive[] = [seg(0, 0, 6, 0)];
const sideKey: Primitive[] = [seg(0, 0, 0, 8)];
const key: KeyViews = { front: frontKey, top: topKey, side: sideKey };

const move = (ps: Primitive[], dx: number, dy: number): Primitive[] =>
  ps.map((p) => {
    const s = p as Segment;
    return seg(s.x1 + dx, s.y1 + dy, s.x2 + dx, s.y2 + dy);
  });

test("assigns each cluster to the view it actually matches, regardless of input order", () => {
  const clusters = [move(sideKey, 100, 100), move(frontKey, 0, 0), move(topKey, 50, 0)];
  const a = assignClusters(clusters, key);
  assert.equal(isPerfect(a.byView.front.diff), true);
  assert.equal(isPerfect(a.byView.top.diff), true);
  assert.equal(isPerfect(a.byView.side.diff), true);
});

test("still assigns when one view is drawn imperfectly", () => {
  const brokenFront = [seg(0, 0, 4, 0)]; // missing one edge
  const clusters = [move(brokenFront, 0, 0), move(topKey, 50, 0), move(sideKey, 100, 0)];
  const a = assignClusters(clusters, key);
  assert.equal(a.byView.front.diff.missing.length, 1);
  assert.equal(isPerfect(a.byView.top.diff), true);
  assert.equal(isPerfect(a.byView.side.diff), true);
});

test("throws when not given exactly three clusters", () => {
  assert.throws(() => assignClusters([frontKey, topKey], key), /exactly three/);
});
