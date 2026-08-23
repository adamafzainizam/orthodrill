import { test } from "node:test";
import assert from "node:assert/strict";
import { generateViews, validateSolid } from "./views.ts";
import { block, subtractBox, subtractCylinder } from "./solid.ts";
import { boundingBox, type Primitive } from "../scoring/primitives.ts";

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
//
// This test exists specifically to catch a mirrored ViewSpec sign table. A
// bounding-box symmetry check cannot do that job: mirroring a view preserves
// its bounding box, so any assertion phrased only in terms of the box passes
// under every sign combination. Asserting the exact endpoints of a named edge
// is what makes a wrong sign fail.
test("a notch at the left end appears on the left of the front view", () => {
  const notched = subtractBox(block(8, 4, 4), { x: 0, y: 0, z: 2, w: 2, d: 4, h: 2 });
  const v = generateViews(notched);
  const b = boundingBox(v.front)!;
  // The notch removes the top-left corner, so the top edge should run only
  // from the notch's right edge (x=2) to the block's right edge (x=8) — not
  // the full width, and not starting anywhere else.
  const topEdge = v.front.find(
    (p): p is Extract<Primitive, { kind: "segment" }> =>
      p.kind === "segment" && p.type === "visible" && p.y1 === b.minY && p.y2 === b.minY,
  );
  assert.ok(topEdge, "expected a visible horizontal segment on the view's top edge");
  assert.equal(Math.min(topEdge.x1, topEdge.x2), 2);
  assert.equal(Math.max(topEdge.x1, topEdge.x2), 8);
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

test("two holes on different axes that physically intersect are rejected", () => {
  const bad = subtractCylinder(
    subtractCylinder(block(8, 8, 8), "z", 4, 4, 2), "x", 4, 4, 2);
  assert.throws(() => validateSolid(bad), /overlap/i);
});

test("two holes on different axes that do not intersect are accepted", () => {
  const ok = subtractCylinder(
    subtractCylinder(block(20, 20, 20), "z", 4, 4, 2), "x", 16, 10, 2);
  assert.doesNotThrow(() => validateSolid(ok));
});

test("tangent holes on the same axis are rejected, not silently duplicated", () => {
  // Centres 4 apart, radii 2 each: the bores touch at a single shared line,
  // which this generator cannot draw once instead of twice.
  const bad = subtractCylinder(
    subtractCylinder(block(12, 8, 4), "z", 3, 4, 2), "z", 7, 4, 2);
  assert.throws(() => validateSolid(bad), /overlap/i);
});

test("a box inside a hole's bounding square but outside its circle is accepted", () => {
  // The circle is centred at (10,10) with r=4, so its bounding square is
  // [6,14]x[6,14]. This 1x1 box sits in that square's corner, at [6,7]x[6,7]:
  // its nearest point to the centre is (7,7), distance sqrt(18) ≈ 4.24 > 4,
  // so it never touches the circle even though it is inside the square.
  const ok = subtractBox(
    subtractCylinder(block(20, 20, 5), "z", 10, 10, 4),
    { x: 6, y: 6, z: 0, w: 1, d: 1, h: 5 },
  );
  assert.doesNotThrow(() => validateSolid(ok));
});

test("a box entirely outside the block is accepted even if it would overlap unclipped", () => {
  // buildOccupancy clips a box reaching outside the block, so a box that
  // starts past the top face (z=10 on an h=4 block) is a no-op, not a
  // feature, even though its unclipped footprint would sit over the hole.
  const ok = subtractBox(
    subtractCylinder(block(8, 8, 4), "z", 4, 4, 2),
    { x: 2, y: 2, z: 10, w: 4, d: 4, h: 2 },
  );
  assert.doesNotThrow(() => validateSolid(ok));
});

test("generateViews validates before generating", () => {
  const bad = subtractCylinder(
    subtractCylinder(block(8, 8, 4), "z", 3, 4, 2), "z", 4, 4, 2);
  assert.throws(() => generateViews(bad), /overlap/i);
});
