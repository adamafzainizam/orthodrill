import { test } from "node:test";
import assert from "node:assert/strict";
import { pointInPolygon, faceAt } from "./picking.ts";
import { isoPickList } from "../geometry/isopick.ts";
import { buildOccupancy } from "../geometry/occupancy.ts";
import { block } from "../geometry/solid.ts";
import type { PickFace } from "../geometry/isopick.ts";

const SQUARE: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];

test("pointInPolygon accepts an interior point and rejects an exterior one", () => {
  assert.equal(pointInPolygon([1, 1], SQUARE), true);
  assert.equal(pointInPolygon([3, 1], SQUARE), false);
  assert.equal(pointInPolygon([1, 5], SQUARE), false);
});

test("pointInPolygon handles a non-convex polygon", () => {
  // An L. The notch must read as OUTSIDE, which a convex-hull test would miss.
  const L: [number, number][] = [[0, 0], [4, 0], [4, 1], [1, 1], [1, 4], [0, 4]];
  assert.equal(pointInPolygon([0.5, 3], L), true, "inside the upright arm");
  assert.equal(pointInPolygon([3, 3], L), false, "the notch is outside");
});

/** A bare pick face; only `points` matters to these tests. */
const face = (pts: [number, number][]): PickFace => ({ cell: [0, 0, 0], dir: "+z", points: pts });

test("POSITIVE CONTROL: overlapping faces resolve to the LAST one, never the first", () => {
  // The whole reason faceAt scans backwards. Returning the first containing
  // polygon is the obvious implementation and is exactly wrong: the array is
  // back-to-front, so the first match is the FARTHEST face — the one buried
  // behind what the student can actually see. If this ever passes with a
  // forward scan, clicks land on hidden geometry.
  const far = face([[0, 0], [4, 0], [4, 4], [0, 4]]);
  const near = face([[1, 1], [3, 1], [3, 3], [1, 3]]);
  const hit = faceAt([far, near], [2, 2]);
  assert.notEqual(hit, null);
  assert.deepEqual(hit!.points, near.points, "faceAt returned the farther face");
});

test("faceAt returns the only containing face when there is no overlap", () => {
  const a = face([[0, 0], [1, 0], [1, 1], [0, 1]]);
  const b = face([[5, 5], [6, 5], [6, 6], [5, 6]]);
  assert.deepEqual(faceAt([a, b], [5.5, 5.5])!.points, b.points);
});

test("faceAt returns null when nothing contains the point", () => {
  assert.equal(faceAt([face(SQUARE)], [9, 9]), null);
});

test("faceAt on an empty list returns null rather than throwing", () => {
  assert.equal(faceAt([], [0, 0]), null);
});

test("every face of a real cube is hittable at its own centroid", () => {
  // End to end against real projected geometry rather than hand-made squares:
  // if projection, corner order or the scan direction were wrong, some face
  // would be unreachable and a student simply could not click it.
  const picks = isoPickList(buildOccupancy(block(2, 2, 2)));
  let reached = 0;
  for (const f of picks) {
    const cx = f.points.reduce((s, p) => s + p[0], 0) / f.points.length;
    const cy = f.points.reduce((s, p) => s + p[1], 0) / f.points.length;
    const hit = faceAt(picks, [cx, cy]);
    assert.notEqual(hit, null, `face on ${f.cell.join(",")} ${f.dir} is unreachable`);
    reached++;
  }
  assert.ok(reached > 0, "no faces tested — this test is inert");
});
