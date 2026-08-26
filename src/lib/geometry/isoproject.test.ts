import { test } from "node:test";
import assert from "node:assert/strict";
import { project, isVisible, VIEW_STEP } from "./isoproject.ts";
import { buildOccupancy } from "./occupancy.ts";
import { block, subtractBox } from "./solid.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("the origin projects to the origin", () => {
  const p = project(0, 0, 0);
  assert.ok(near(p.u, 0) && near(p.v, 0));
});

// Verified during design. A wrong sign here mirrors every prompt image.
test("the unit axes project to their known screen vectors", () => {
  const x = project(1, 0, 0), y = project(0, 1, 0), z = project(0, 0, 1);
  assert.ok(near(x.u, 0.7071067811865475) && near(x.v, 0.4082482904638631), "+x");
  assert.ok(near(y.u, 0.7071067811865475) && near(y.v, -0.4082482904638631), "+y");
  assert.ok(near(z.u, 0) && near(z.v, -0.816496580927726), "+z");
});

test("all three axes foreshorten equally, which is what makes it isometric", () => {
  const len = (p: { u: number; v: number }) => Math.hypot(p.u, p.v);
  const a = len(project(1, 0, 0)), b = len(project(0, 1, 0)), c = len(project(0, 0, 1));
  assert.ok(near(a, b) && near(b, c), `${a} ${b} ${c}`);
});

test("translating along the view step leaves the projection unchanged", () => {
  const [dx, dy, dz] = VIEW_STEP;
  for (const [x, y, z] of [[0, 0, 0], [3, 1, 2], [5, 5, 5]]) {
    const a = project(x, y, z), b = project(x + dx, y + dy, z + dz);
    assert.ok(near(a.u, b.u) && near(a.v, b.v), `${x},${y},${z}`);
  }
});

test("no other unit step is invariant, so the view diagonal is unique", () => {
  const steps = [[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,1,1],[1,-1,0],[0,-1,1]];
  const o = project(0, 0, 0);
  for (const [x, y, z] of steps) {
    const p = project(x, y, z);
    assert.ok(!(near(p.u, o.u) && near(p.v, o.v)), `${x},${y},${z} must not be invariant`);
  }
});

test("an empty cell is never visible", () => {
  assert.equal(isVisible(buildOccupancy(block(2, 2, 2)), 5, 5, 5), false);
});

test("a lone voxel is visible", () => {
  assert.equal(isVisible(buildOccupancy(block(1, 1, 1)), 0, 0, 0), true);
});

// The whole point of the diagonal: a voxel is hidden by one nearer along it.
test("a voxel is hidden by a solid voxel one step along the view diagonal", () => {
  const o = buildOccupancy(block(2, 2, 2));
  assert.equal(isVisible(o, 1, 0, 1), true, "the near one is visible");
  assert.equal(isVisible(o, 0, 1, 0), false, "the far one is hidden by it");
});

test("removing the blocker makes the far voxel visible again", () => {
  const o = buildOccupancy(subtractBox(block(2, 2, 2), { x: 1, y: 0, z: 1, w: 1, d: 1, h: 1 }));
  assert.equal(isVisible(o, 0, 1, 0), true);
});
