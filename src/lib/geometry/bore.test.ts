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
