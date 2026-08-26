import { test } from "node:test";
import assert from "node:assert/strict";
import { isoBore } from "./isobore.ts";
import { buildOccupancy, type Occupancy } from "./occupancy.ts";
import { block, subtractCylinder, type Axis, type CylinderOp } from "./solid.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function setup(axis: Axis, u: number, v: number, r: number): {
  op: CylinderOp; o: Occupancy;
} {
  const s = subtractCylinder(block(8, 8, 8), axis, u, v, r);
  return { op: s.ops[0] as CylinderOp, o: buildOccupancy(s) };
}

test("a hole yields one ellipse, with the paint depth of its face", () => {
  const { op, o } = setup("z", 4, 4, 2);
  const r = isoBore(op, o);
  assert.ok(r !== null);
  assert.equal(r.ellipse.kind, "iso-ellipse");
  assert.ok(Number.isFinite(r.t), "must carry a paint depth");
});

// The textbook isometric ellipse ratio. Verified numerically during design.
test("the major radius is the true radius and the minor is r over root three", () => {
  const { op, o } = setup("z", 4, 4, 2);
  const e = isoBore(op, o)!.ellipse;
  assert.ok(near(e.rx, 2), `rx ${e.rx}`);
  assert.ok(near(e.ry, 2 / Math.sqrt(3)), `ry ${e.ry}`);
  assert.ok(near(e.rx / e.ry, Math.sqrt(3)), "ratio must be root three");
});

test("the major axis rotation depends on which face the hole emerges through", () => {
  const z = setup("z", 4, 4, 2);
  const y = setup("y", 4, 4, 2);
  const x = setup("x", 4, 4, 2);
  assert.ok(near(isoBore(z.op, z.o)!.ellipse.rotation, 0), "z hole");
  assert.ok(near(isoBore(y.op, y.o)!.ellipse.rotation, 60), "y hole");
  assert.ok(near(isoBore(x.op, x.o)!.ellipse.rotation, 120), "x hole");
});

test("the ellipse centre is finite", () => {
  const { op, o } = setup("z", 3, 5, 1);
  const e = isoBore(op, o)!.ellipse;
  assert.ok(Number.isFinite(e.cx) && Number.isFinite(e.cy));
});

test("moving the hole moves the ellipse", () => {
  const a = setup("z", 2, 2, 1);
  const b = setup("z", 6, 6, 1);
  const ea = isoBore(a.op, a.o)!.ellipse, eb = isoBore(b.op, b.o)!.ellipse;
  assert.ok(!near(ea.cx, eb.cx) || !near(ea.cy, eb.cy));
});
