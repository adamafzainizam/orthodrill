import { test } from "node:test";
import assert from "node:assert/strict";
import { generateViews, validateSolid } from "./views.ts";
import { block, subtractBox, subtractCylinder } from "./solid.ts";
import { boundingBox } from "../scoring/primitives.ts";

test("a plain block gives three rectangular outlines", () => {
  const v = generateViews(block(6, 4, 2));
  assert.equal(v.front.length, 4);
  assert.equal(v.top.length, 4);
  assert.equal(v.side.length, 4);
});

test("each view starts at the origin", () => {
  const v = generateViews(block(6, 4, 2));
  for (const view of [v.front, v.top, v.side]) {
    const b = boundingBox(view)!;
    assert.equal(b.minX, 0);
    assert.equal(b.minY, 0);
  }
});

test("view extents match the block's dimensions", () => {
  const v = generateViews(block(6, 4, 2));
  const f = boundingBox(v.front)!;
  assert.deepEqual([f.maxX, f.maxY], [6, 2]); // width x height
  const t = boundingBox(v.top)!;
  assert.deepEqual([t.maxX, t.maxY], [6, 4]); // width x depth
  const s = boundingBox(v.side)!;
  assert.deepEqual([s.maxX, s.maxY], [4, 2]); // depth x height
});

// The orientation check property tests structurally cannot make. A notch at one
// named corner must appear on one named side.
test("a notch at the left end appears on the left of the front view", () => {
  const notched = subtractBox(block(8, 4, 4), { x: 0, y: 0, z: 2, w: 2, d: 4, h: 2 });
  const v = generateViews(notched);
  const b = boundingBox(v.front)!;
  // The removed corner is top-left: no primitive should occupy that corner.
  const topLeftOccupied = v.front.some((p) =>
    p.kind === "segment" && p.x1 < 2 && p.x2 <= 2 && p.y1 === b.minY && p.y2 === b.minY);
  assert.equal(topLeftOccupied, false, "the top-left corner was cut away");
});

test("a through-hole yields exactly one circle, in the view down its axis", () => {
  const v = generateViews(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2));
  assert.equal(v.top.filter((p) => p.kind === "circle").length, 1);
  assert.equal(v.front.filter((p) => p.kind === "circle").length, 0);
  assert.equal(v.side.filter((p) => p.kind === "circle").length, 0);
});

test("a hole overlapping a subtracted box is rejected rather than guessed at", () => {
  const bad = subtractBox(
    subtractCylinder(block(8, 8, 4), "z", 4, 4, 2),
    { x: 3, y: 3, z: 0, w: 2, d: 2, h: 4 },
  );
  assert.throws(() => validateSolid(bad), /overlap/i);
});

test("two overlapping holes are rejected", () => {
  const bad = subtractCylinder(
    subtractCylinder(block(8, 8, 4), "z", 3, 4, 2), "z", 4, 4, 2);
  assert.throws(() => validateSolid(bad), /overlap/i);
});

test("generateViews validates before generating", () => {
  const bad = subtractCylinder(
    subtractCylinder(block(8, 8, 4), "z", 3, 4, 2), "z", 4, 4, 2);
  assert.throws(() => generateViews(bad), /overlap/i);
});
