import { test } from "node:test";
import assert from "node:assert/strict";
import { borePrimitives, CENTRE_OVERSHOOT } from "./bore.ts";
import { buildOccupancy } from "./occupancy.ts";
import { VIEW_SPECS } from "./viewspec.ts";
import { block, subtractBox, subtractCylinder, type CylinderOp } from "./solid.ts";
import type { Circle, Segment } from "../scoring/primitives.ts";

const holed = subtractCylinder(block(8, 8, 4), "z", 4, 4, 2);
const op = holed.ops[0] as CylinderOp;
const occ = buildOccupancy(holed);

const circles = (ps: { kind: string }[]) => ps.filter((p) => p.kind === "circle");
const segments = (ps: { kind: string }[]) => ps.filter((p) => p.kind === "segment");

test("looking down the axis gives exactly one circle", () => {
  const ps = borePrimitives(op, occ, VIEW_SPECS.top);
  assert.equal(circles(ps).length, 1);
  const c = circles(ps)[0] as Circle;
  assert.equal(c.r, 2);
  assert.equal(c.type, "visible");
});

test("the circle carries a centre cross of two centre-type segments", () => {
  const ps = borePrimitives(op, occ, VIEW_SPECS.top);
  const centres = segments(ps).filter((s) => (s as Segment).type === "centre");
  assert.equal(centres.length, 2);
});

test("the centre cross overshoots the circle, as convention requires", () => {
  const ps = borePrimitives(op, occ, VIEW_SPECS.top);
  const centres = segments(ps).filter((s) => (s as Segment).type === "centre") as Segment[];
  const span = Math.max(...centres.map((s) => Math.max(
    Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1))));
  assert.equal(span, 2 * (2 + CENTRE_OVERSHOOT));
});

test("the other two views each get exactly two bore lines", () => {
  for (const spec of [VIEW_SPECS.front, VIEW_SPECS.side]) {
    const ps = borePrimitives(op, occ, spec);
    const bore = segments(ps).filter((s) => (s as Segment).type !== "centre");
    assert.equal(bore.length, 2, `${spec.name} should have two bore lines`);
    assert.equal(circles(ps).length, 0, `${spec.name} should have no circle`);
  }
});

test("bore lines are hidden when the hole is buried in material", () => {
  const ps = borePrimitives(op, occ, VIEW_SPECS.front);
  const bore = segments(ps).filter((s) => (s as Segment).type !== "centre") as Segment[];
  assert.ok(bore.every((s) => s.type === "hidden"));
});

// The case that makes visibility a global property rather than a per-feature one.
test("bore lines become visible where a notch removes the material in front", () => {
  const notched = subtractBox(holed, { x: 0, y: 0, z: 0, w: 8, d: 2, h: 4 }, "notch");
  const ps = borePrimitives(op, buildOccupancy(notched), VIEW_SPECS.front);
  const bore = segments(ps).filter((s) => (s as Segment).type !== "centre") as Segment[];
  assert.ok(bore.some((s) => s.type === "visible"),
    "removing the material in front of a bore must expose it");
});

test("every view carries a centre line for the hole", () => {
  for (const spec of Object.values(VIEW_SPECS)) {
    const ps = borePrimitives(op, occ, spec);
    const centres = segments(ps).filter((s) => (s as Segment).type === "centre");
    assert.ok(centres.length >= 1, `${spec.name} must carry a centre line`);
  }
});

test("a hole on the x axis puts its circle in the side view", () => {
  const xHoled = subtractCylinder(block(4, 8, 8), "x", 4, 4, 2);
  const xOp = xHoled.ops[0] as CylinderOp;
  const xOcc = buildOccupancy(xHoled);
  assert.equal(circles(borePrimitives(xOp, xOcc, VIEW_SPECS.side)).length, 1);
  assert.equal(circles(borePrimitives(xOp, xOcc, VIEW_SPECS.front)).length, 0);
  assert.equal(circles(borePrimitives(xOp, xOcc, VIEW_SPECS.top)).length, 0);
});

// A symmetric hole under a symmetric notch must expose both bore lines
// alike. The earlier bug sampled one lattice column inside the hole
// footprint and the other outside it, so one line stayed buried while its
// mirror image was exposed — this is the reproduction that caught it.
test("a notch spanning exactly the hole's footprint exposes both bore lines symmetrically", () => {
  const notched = subtractBox(holed, { x: 2, y: 0, z: 0, w: 4, d: 2, h: 4 }, "notch");
  const ps = borePrimitives(op, buildOccupancy(notched), VIEW_SPECS.front);
  const bore = segments(ps).filter((s) => (s as Segment).type !== "centre") as Segment[];
  assert.equal(bore.length, 2, "each bore line should stay a single unbroken run");
  assert.ok(bore.every((s) => s.type === "visible"),
    "a symmetric notch must expose both bore lines, not just one");
});

// A hole tangent to a face has one bore line sitting on the block's own
// silhouette edge, with nothing beyond it. Clamping that lattice column
// back onto the block (the earlier bug) reported it hidden; unclamped,
// isSolid's own out-of-bounds handling correctly reports no material there.
test("a hole tangent to a face keeps its outer bore line visible", () => {
  const tangent = subtractCylinder(block(8, 8, 4), "z", 6, 4, 2);
  const tOp = tangent.ops[0] as CylinderOp;
  const tOcc = buildOccupancy(tangent);
  const ps = borePrimitives(tOp, tOcc, VIEW_SPECS.front);
  const bore = segments(ps).filter((s) => (s as Segment).type !== "centre") as Segment[];
  assert.ok(bore.some((s) => s.type === "visible"),
    "the bore line coincident with the block's silhouette edge must not be hidden");
});

// The two existing notch-exposure tests both use the front view
// (nearIsLow: true). Exercise the same exposure behaviour under
// nearIsLow: false, so the occlusion walk is proven in both directions.
test("a notch in front of a bore exposes it in the side view too", () => {
  const notched = subtractBox(holed, { x: 6, y: 0, z: 0, w: 2, d: 8, h: 4 }, "notch");
  const ps = borePrimitives(op, buildOccupancy(notched), VIEW_SPECS.side);
  const bore = segments(ps).filter((s) => (s as Segment).type !== "centre") as Segment[];
  assert.ok(bore.some((s) => s.type === "visible"),
    "removing material in front of the bore, as seen from the side, must expose it");
});
