import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOccupancy, sizeAlong } from "./occupancy.ts";
import { block, subtractBox, subtractCylinder } from "./solid.ts";

test("a plain block is solid everywhere inside and empty outside", () => {
  const o = buildOccupancy(block(2, 2, 2));
  assert.equal(o.isSolid(0, 0, 0), true);
  assert.equal(o.isSolid(1, 1, 1), true);
  assert.equal(o.isSolid(2, 0, 0), false);
  assert.equal(o.isSolid(-1, 0, 0), false);
});

test("sizeAlong reports the extent on each axis", () => {
  const o = buildOccupancy(block(6, 4, 2));
  assert.equal(sizeAlong(o, "x"), 6);
  assert.equal(sizeAlong(o, "y"), 4);
  assert.equal(sizeAlong(o, "z"), 2);
});

test("a subtracted box removes exactly its cells", () => {
  const o = buildOccupancy(
    subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 2, w: 2, d: 4, h: 2 }),
  );
  assert.equal(o.isSolid(0, 0, 2), false); // removed
  assert.equal(o.isSolid(1, 3, 3), false); // removed
  assert.equal(o.isSolid(2, 0, 2), true);  // outside the removed box
  assert.equal(o.isSolid(0, 0, 1), true);  // below the removed box
});

test("subtractions apply in order and overlap harmlessly", () => {
  const o = buildOccupancy(
    subtractBox(
      subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 2 }),
      { x: 1, y: 1, z: 1, w: 2, d: 2, h: 2 },
    ),
  );
  assert.equal(o.isSolid(0, 0, 0), false);
  assert.equal(o.isSolid(2, 2, 2), false);
  assert.equal(o.isSolid(3, 3, 3), true);
});

// This is the refinement in this plan's header, pinned by a test so nobody
// "fixes" it later: cylinders must NOT rasterise into the grid.
test("a cylinder does not affect the occupancy grid", () => {
  const withHole = subtractCylinder(block(6, 6, 2), "z", 3, 3, 2);
  const plain = buildOccupancy(block(6, 6, 2));
  const holed = buildOccupancy(withHole);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      assert.equal(holed.isSolid(i, j, 0), plain.isSolid(i, j, 0));
    }
  }
});

test("a box removed entirely outside the block changes nothing", () => {
  const o = buildOccupancy(
    subtractBox(block(2, 2, 2), { x: 10, y: 10, z: 10, w: 2, d: 2, h: 2 }),
  );
  assert.equal(o.isSolid(0, 0, 0), true);
  assert.equal(o.isSolid(1, 1, 1), true);
});
