import { test } from "node:test";
import assert from "node:assert/strict";
import { isometricView } from "./isometric.ts";
import { block, subtractBox, subtractCylinder, type Solid } from "./solid.ts";
import { project } from "./isoproject.ts";
import type { IsoLine } from "./isotypes.ts";

function corpus(): Solid[] {
  return [
    block(4, 4, 4), block(6, 4, 2), block(8, 3, 5),
    subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 }),
    subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 2, w: 2, d: 2, h: 2 }),
    subtractCylinder(block(8, 8, 4), "z", 4, 4, 2),
    subtractCylinder(block(8, 8, 8), "y", 4, 4, 2),
    subtractBox(subtractCylinder(block(8, 8, 8), "x", 6, 4, 2),
      { x: 2, y: 0, z: 0, w: 4, d: 3, h: 3 }),
  ];
}

test("every coordinate is finite", () => {
  for (const s of corpus()) {
    for (const p of isometricView(s)) {
      const ns = p.kind === "iso-line" ? [p.x1, p.y1, p.x2, p.y2]
        : p.kind === "iso-ellipse" ? [p.cx, p.cy, p.rx, p.ry, p.rotation]
        : p.points.flat();
      for (const n of ns) assert.ok(Number.isFinite(n), p.kind);
    }
  }
});

// Fills are what make occlusion work; a view without them would render as a
// wireframe with every hidden line showing.
test("every solid emits fills, and each is a closed quadrilateral", () => {
  for (const s of corpus()) {
    const fills = isometricView(s).filter((p) => p.kind === "iso-face");
    assert.ok(fills.length > 0, "a solid must emit fills");
    for (const f of fills) assert.equal(f.points.length, 4);
  }
});

// The array is a paint program, so it must open with a fill - a stroke before
// any fill could never be covered.
test("no stroke precedes the first fill", () => {
  for (const s of corpus()) {
    const v = isometricView(s);
    assert.equal(v[0].kind, "iso-face");
  }
});

test("no line has zero length", () => {
  for (const s of corpus()) {
    for (const p of isometricView(s)) {
      if (p.kind !== "iso-line") continue;
      assert.ok(Math.hypot(p.x2 - p.x1, p.y2 - p.y1) > 1e-9);
    }
  }
});

test("every ellipse keeps the isometric ratio", () => {
  for (const s of corpus()) {
    for (const p of isometricView(s)) {
      if (p.kind !== "iso-ellipse") continue;
      assert.ok(Math.abs(p.rx / p.ry - Math.sqrt(3)) < 1e-9, `ratio ${p.rx / p.ry}`);
    }
  }
});

// The bound is derived from the block's own corners via the projection basis,
// NOT from the primitives under test, so it can actually fail.
test("every primitive lies within the projected bounds of the base block", () => {
  for (const s of corpus()) {
    const { w, d, h } = s.base;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const x of [0, w]) for (const y of [0, d]) for (const z of [0, h]) {
      const p = project(x, y, z);
      minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u);
      minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v);
    }
    const eps = 1e-9;
    // A rotated ellipse's axis-aligned half-extents. Using rx for both axes
    // would overstate them and produce a false failure on a hole that sits
    // tangent to a face, which validateSolid permits.
    const ellipseBox = (e: { cx: number; cy: number; rx: number; ry: number; rotation: number }) => {
      const rot = (e.rotation * Math.PI) / 180;
      const hu = Math.hypot(e.rx * Math.cos(rot), e.ry * Math.sin(rot));
      const hv = Math.hypot(e.rx * Math.sin(rot), e.ry * Math.cos(rot));
      return [[e.cx - hu, e.cy - hv], [e.cx + hu, e.cy + hv]];
    };
    for (const p of isometricView(s)) {
      const pts: number[][] = p.kind === "iso-line" ? [[p.x1, p.y1], [p.x2, p.y2]]
        : p.kind === "iso-face" ? p.points.map((q) => [q[0], q[1]])
        : ellipseBox(p);
      for (const [u, v] of pts) {
        assert.ok(u >= minU - eps && u <= maxU + eps, `${p.kind} u ${u} outside ${minU}..${maxU}`);
        assert.ok(v >= minV - eps && v <= maxV + eps, `${p.kind} v ${v} outside ${minV}..${maxV}`);
      }
    }
  }
});

// The one test that pins ORIENTATION. Every other test in this file is
// mirror-invariant: a mirrored picture still has finite coordinates, non-zero
// lines and correct ellipse ratios. This solid is asymmetric on both horizontal
// axes, and its extreme points are compared against the projection basis.
test("an asymmetric solid's extreme points match the projection basis", () => {
  const s = subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 });
  const ls = isometricView(s).filter((p): p is IsoLine => p.kind === "iso-line");
  const us = ls.flatMap((l) => [l.x1, l.x2]);
  const vs = ls.flatMap((l) => [l.y1, l.y2]);
  const eps = 1e-9;

  // Leftmost silhouette point is the front-left vertical edge at (0, 0);
  // rightmost is the back-right edge at (6, 4).
  assert.ok(Math.abs(Math.min(...us) - project(0, 0, 0).u) < eps, "leftmost");
  assert.ok(Math.abs(Math.max(...us) - project(6, 4, 0).u) < eps, "rightmost");

  // Topmost is the SMALLEST screen v, i.e. the largest (-x + y + 2z). Over this
  // solid that is 9, at (3, 4, 4) - the top-back-left corner of the tall part,
  // where the step's riser meets the top face. Not (6, 4, 4), which gives only 6.
  assert.ok(Math.abs(Math.min(...vs) - project(3, 4, 4).v) < eps, "topmost");
  assert.ok(Math.abs(Math.max(...vs) - project(6, 0, 0).v) < eps, "lowest");
});

test("generating the same solid twice gives identical output", () => {
  for (const s of corpus()) assert.deepEqual(isometricView(s), isometricView(s));
});
