import { test } from "node:test";
import assert from "node:assert/strict";
import { pointInPolygon, faceAt, clientToViewBox } from "./picking.ts";
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

const VIEW = { minX: 0, minY: 0, w: 10, h: 10 };

test("clientToViewBox maps a centre click to the viewBox centre when aspects match", () => {
  const box = { left: 0, top: 0, width: 200, height: 200 };
  assert.deepEqual(clientToViewBox(100, 100, box, VIEW), [5, 5]);
});

test("POSITIVE CONTROL: a LETTERBOXED element maps differently from the naive scaling", () => {
  // The bug this function exists to prevent. A 400x200 box holding a square
  // viewBox letterboxes: the drawing is 200x200, centred, with 100px bands
  // left and right. The naive mapping (clientX * view.w / box.width) would put
  // the left edge of the drawing at 0 and read x=100 as 2.5 — a click landing
  // a quarter of the way across a part it is nowhere near.
  const box = { left: 0, top: 0, width: 400, height: 200 };
  const naive = (100 - box.left) * (VIEW.w / box.width);
  const actual = clientToViewBox(100, 100, box, VIEW);
  assert.equal(actual[0], 0, "the left edge of the DRAWING sits at x=100 client");
  assert.notEqual(actual[0], naive, "letterboxing was ignored — clicks will miss");
  assert.equal(actual[1], 5, "the vertical axis fills the box and maps to the centre");
});

test("clientToViewBox honours a non-zero viewBox origin", () => {
  const box = { left: 0, top: 0, width: 100, height: 100 };
  const shifted = { minX: -4, minY: 6, w: 10, h: 10 };
  assert.deepEqual(clientToViewBox(50, 50, box, shifted), [1, 11]);
});

test("clientToViewBox accounts for the element's page offset", () => {
  const box = { left: 30, top: 70, width: 100, height: 100 };
  assert.deepEqual(clientToViewBox(80, 120, box, VIEW), [5, 5]);
});

test("a zero-sized box returns the viewBox origin rather than dividing by zero", () => {
  assert.deepEqual(clientToViewBox(10, 10, { left: 0, top: 0, width: 0, height: 0 }, VIEW), [0, 0]);
});
