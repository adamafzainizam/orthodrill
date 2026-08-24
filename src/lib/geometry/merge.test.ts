import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeEdges } from "./merge.ts";
import type { UnitEdge } from "./project.ts";

const u = (uu: number, v: number, hidden = false): UnitEdge =>
  ({ u: uu, v, along: "u", hidden });
const v = (uu: number, vv: number, hidden = false): UnitEdge =>
  ({ u: uu, v: vv, along: "v", hidden });

test("adjacent unit edges on one line become a single segment", () => {
  const out = mergeEdges([u(0, 0), u(1, 0), u(2, 0)]);
  assert.deepEqual(out, [{ u1: 0, v1: 0, u2: 3, v2: 0, hidden: false }]);
});

test("input order does not matter", () => {
  const out = mergeEdges([u(2, 0), u(0, 0), u(1, 0)]);
  assert.deepEqual(out, [{ u1: 0, v1: 0, u2: 3, v2: 0, hidden: false }]);
});

test("a gap splits a line into two segments", () => {
  const out = mergeEdges([u(0, 0), u(1, 0), u(3, 0)]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { u1: 0, v1: 0, u2: 2, v2: 0, hidden: false });
  assert.deepEqual(out[1], { u1: 3, v1: 0, u2: 4, v2: 0, hidden: false });
});

// Different primitives; merging them would erase the distinction the scorer
// exists to report.
test("visible and hidden runs never merge with each other", () => {
  const out = mergeEdges([u(0, 0, false), u(1, 0, true)]);
  assert.equal(out.length, 2);
  assert.equal(out.find((s) => s.hidden === false)!.u2, 1);
  assert.equal(out.find((s) => s.hidden === true)!.u1, 1);
});

test("edges on different lines stay separate", () => {
  const out = mergeEdges([u(0, 0), u(0, 1)]);
  assert.equal(out.length, 2);
});

test("edges running along v merge along v", () => {
  const out = mergeEdges([v(0, 0), v(0, 1)]);
  assert.deepEqual(out, [{ u1: 0, v1: 0, u2: 0, v2: 2, hidden: false }]);
});

test("u-edges and v-edges crossing the same point do not merge", () => {
  const out = mergeEdges([u(0, 0), v(0, 0)]);
  assert.equal(out.length, 2);
});

test("no edges produce no segments", () => {
  assert.deepEqual(mergeEdges([]), []);
});
