import { test } from "node:test";
import assert from "node:assert/strict";
import { isometricView } from "./isometric.ts";
import {
  block, subtractBox, subtractCylinder, type Solid, type CylinderOp,
} from "./solid.ts";
import { project } from "./isoproject.ts";
import type { IsoFace, IsoLine, IsoEllipse } from "./isotypes.ts";

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

// This test asserts every ellipse keeps the isometric ratio, but is vacuous
// whenever a solid has no cylinder op - "ellipse count matches the number of
// cylinder operations" below is what makes its precondition real (dropping a
// bore entirely would otherwise survive both).
test("every ellipse keeps the isometric ratio", () => {
  for (const s of corpus()) {
    for (const p of isometricView(s)) {
      if (p.kind !== "iso-ellipse") continue;
      assert.ok(Math.abs(p.rx / p.ry - Math.sqrt(3)) < 1e-9, `ratio ${p.rx / p.ry}`);
    }
  }
});

// Dropping the bore ellipse entirely survives every other test in this file:
// "every ellipse keeps the isometric ratio" iterates an empty list and passes
// vacuously. An exact count, independent of the ellipse's own fields, closes
// that gap.
test("ellipse count matches the number of cylinder operations", () => {
  for (const s of corpus()) {
    const ellipses = isometricView(s).filter((p) => p.kind === "iso-ellipse").length;
    const cylOps = s.ops.filter((o) => o.kind === "cylinder").length;
    assert.equal(ellipses, cylOps, "a dropped or duplicated bore changes this count");
  }
});

/**
 * Join collinear touching strokes, for counting only. A local copy of the
 * helper isoedges.test.ts uses (kept local rather than imported, per the
 * brief: this file does not import from another test file). The generator
 * emits one unit segment per face edge on purpose - merging across faces
 * would let a nearer coplanar fill paint over part of an outline - so the
 * merge that makes a stroke-count invariant checkable belongs here.
 */
function mergedStrokeCount(ps: readonly (IsoFace | IsoLine | IsoEllipse)[]): number {
  const lines = ps.filter((p): p is IsoLine => p.kind === "iso-line");
  const segs = lines.map((l) => {
    const [a, b] = [[l.x1, l.y1], [l.x2, l.y2]].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    return { a, b };
  });
  // -0 and 0 must format identically, or one infinite line splits into two
  // groups and the run count comes out too high.
  const fix = (n: number) => (Math.abs(n) < 1e-9 ? 0 : Number(n.toFixed(6))).toFixed(6);
  const key = (p: number[]) => `${fix(p[0])},${fix(p[1])}`;
  const groups = new Map<string, { a: number[]; b: number[] }[]>();
  for (const sg of segs) {
    const dx = sg.b[0] - sg.a[0], dy = sg.b[1] - sg.a[1];
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len;
    const off = sg.a[0] * uy - sg.a[1] * ux;
    const gk = `${fix(ux)},${fix(uy)}|${fix(off)}`;
    const g = groups.get(gk);
    if (g) g.push(sg); else groups.set(gk, [sg]);
  }
  let total = 0;
  for (const g of groups.values()) {
    const pts = new Map<string, number>();
    for (const sg of g) {
      pts.set(key(sg.a), (pts.get(key(sg.a)) ?? 0) + 1);
      pts.set(key(sg.b), (pts.get(key(sg.b)) ?? 0) + 1);
    }
    // Each maximal run has exactly two endpoints touched once.
    let ends = 0;
    for (const n of pts.values()) if (n === 1) ends++;
    total += Math.max(1, ends / 2);
  }
  return total;
}

// Nothing above pins stroke counts, so dropping coplanar-stroke cancellation
// survives: every flat face would show its own four-edge outline instead of
// the true, cancelled silhouette. Box ops are the only ones that carve the
// occupancy grid (occupancy.ts: "cylinders never enter the grid"), so a
// cylinder-only solid still silhouettes as a plain box - nine strokes, same
// as isoedges.test.ts's "a through-hole does not change the merged stroke
// count". Only a box op can make the silhouette non-convex.
test("merged stroke count: nine for a plain-box silhouette, more for a non-convex one", () => {
  for (const s of corpus()) {
    const n = mergedStrokeCount(isometricView(s));
    const hasBoxOp = s.ops.some((o) => o.kind === "box");
    if (!hasBoxOp) {
      assert.equal(n, 9, `expected a plain-box silhouette to merge to nine strokes, got ${n}`);
    } else {
      assert.ok(n > 9, `expected a non-convex silhouette to merge to more than nine strokes, got ${n}`);
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

// ---- Paint-order ground truth, by face orientation -------------------
//
// Reversing the sort survives every other test above in substance: a
// bore-free solid still opens with an iso-face, and nothing pins WHICH face
// ends up nearest (last-painted) at a point genuinely covered by more than
// one fill - which, per isoedges.ts's own module doc, is routine ("every
// hexagon overlaps six neighbours"). This test does, by comparing the
// painter's answer against ray-marched ground truth built independently of
// isoedges.ts.
//
// The three viewer-facing orientations (+x, -y, +z) project to three
// distinguishable pairs of edge directions, so a fill's own projected
// corners are enough to classify it.
const AXIS_STEP_2D: Record<"x" | "y" | "z", [number, number]> = {
  x: [1 / Math.SQRT2, 1 / Math.sqrt(6)],
  y: [1 / Math.SQRT2, -1 / Math.sqrt(6)],
  z: [0, -2 / Math.sqrt(6)],
};

const FACE_ORIENTATION_AXES: Record<"+x" | "-y" | "+z", readonly ["x" | "y" | "z", "x" | "y" | "z"]> = {
  "+x": ["y", "z"],
  "-y": ["x", "z"],
  "+z": ["x", "y"],
};

function closestAxis(edge: readonly [number, number]): "x" | "y" | "z" {
  const len = Math.hypot(edge[0], edge[1]);
  const u: [number, number] = [edge[0] / len, edge[1] / len];
  let best: "x" | "y" | "z" = "x";
  let bestDot = -Infinity;
  for (const axis of ["x", "y", "z"] as const) {
    const r = AXIS_STEP_2D[axis];
    const rl = Math.hypot(r[0], r[1]);
    const dot = Math.abs((u[0] * r[0] + u[1] * r[1]) / rl);
    if (dot > bestDot) { bestDot = dot; best = axis; }
  }
  return best;
}

/** Classify a painted fill's orientation from its own projected corners. */
function classifyFillOrientation(points: readonly (readonly [number, number])[]): "+x" | "-y" | "+z" | null {
  const e0: [number, number] = [points[1][0] - points[0][0], points[1][1] - points[0][1]];
  const e1: [number, number] = [points[2][0] - points[1][0], points[2][1] - points[1][1]];
  const axes = [closestAxis(e0), closestAxis(e1)].sort().join("");
  for (const name of Object.keys(FACE_ORIENTATION_AXES) as ("+x" | "-y" | "+z")[]) {
    if ([...FACE_ORIENTATION_AXES[name]].sort().join("") === axes) return name;
  }
  return null;
}

function strictlyInsideQuad(pt: readonly [number, number], quad: readonly (readonly [number, number])[]): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = quad[i], b = quad[(i + 1) % 4];
    const cross = (b[0] - a[0]) * (pt[1] - a[1]) - (b[1] - a[1]) * (pt[0] - a[0]);
    if (Math.abs(cross) < 1e-9) return false; // on an edge: ambiguous, exclude
    const s = Math.sign(cross);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return true;
}

/**
 * Solidity built straight from the Solid's box ops - independent of
 * occupancy.ts and isoedges.ts - matching occupancy.ts's own "cylinders
 * never enter the grid" rule, so it stays consistent with what isoEdges
 * silhouettes.
 */
function isSolidAt(s: Solid, x: number, y: number, z: number): boolean {
  const { w, d, h } = s.base;
  if (x < 0 || y < 0 || z < 0 || x >= w || y >= d || z >= h) return false;
  for (const op of s.ops) {
    if (op.kind !== "box") continue;
    const b = op.box;
    if (x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.d && z >= b.z && z < b.z + b.h) return false;
  }
  return true;
}

/**
 * Ground truth for one screen point: march along the view ray (1,-1,1),
 * inverting project()'s formula, to find the nearest solid/empty boundary
 * and which axis it crosses. Returns null on an ambiguous (edge/corner) or
 * empty ray, which the caller skips rather than guesses at.
 */
function marchGroundTruth(s: Solid, u: number, v: number): "+x" | "-y" | "+z" | null {
  const { w, d, h } = s.base;
  const s2 = Math.SQRT2, s6 = Math.sqrt(6);
  // x(t) = t, y(t) = u*sqrt2 - t, z(t) = t - c: the inverse of project(),
  // parametrised along the view diagonal (1, -1, 1).
  const c = (u * s2 + v * s6) / 2;
  const tMin = -2, tMax = Math.max(w, d, h) + 2;
  const breaks = new Set<number>([tMin, tMax]);
  for (let i = Math.floor(tMin) - 1; i <= Math.ceil(tMax) + 1; i++) {
    breaks.add(i); breaks.add(u * s2 - i); breaks.add(i + c);
  }
  const sorted = [...breaks].filter((t) => t >= tMin && t <= tMax).sort((a, b) => a - b);
  let bestT1: number | null = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    const t0 = sorted[i], t1 = sorted[i + 1];
    if (t1 - t0 < 1e-9) continue;
    const tm = (t0 + t1) / 2;
    const x = tm, y = u * s2 - tm, z = tm - c;
    if (isSolidAt(s, Math.floor(x), Math.floor(y), Math.floor(z))) {
      if (bestT1 === null || t1 > bestT1) bestT1 = t1;
    }
  }
  if (bestT1 === null) return null;
  const eps = 1e-6;
  const x1 = bestT1, y1 = u * s2 - bestT1, z1 = bestT1 - c;
  const candidates: ("x" | "y" | "z")[] = [];
  if (Math.abs(x1 - Math.round(x1)) < eps) candidates.push("x");
  if (Math.abs(y1 - Math.round(y1)) < eps) candidates.push("y");
  if (Math.abs(z1 - Math.round(z1)) < eps) candidates.push("z");
  if (candidates.length !== 1) return null; // exact corner/edge: skip, not a bug
  const dir: Record<"x" | "y" | "z", "+x" | "-y" | "+z"> = { x: "+x", y: "-y", z: "+z" };
  return dir[candidates[0]];
}

test("the painted fill nearest a screen point matches ray-marched ground truth", () => {
  for (const s of [
    subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 }),
    subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 2, w: 2, d: 2, h: 2 }),
    subtractBox(subtractCylinder(block(8, 8, 8), "x", 6, 4, 2),
      { x: 2, y: 0, z: 0, w: 4, d: 3, h: 3 }),
  ]) {
    const fills = isometricView(s).filter((p): p is IsoFace => p.kind === "iso-face");
    const { w, d, h } = s.base;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const x of [0, w]) for (const y of [0, d]) for (const z of [0, h]) {
      const p = project(x, y, z);
      minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u);
      minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v);
    }
    // A grid with an irrational offset, not the lattice's own face
    // centroids: a face centroid sits exactly on the rhombus diagonal it
    // shares with an overlapping neighbour, which is a genuine ambiguity
    // (both faces' fills legitimately touch that single point), not a bug -
    // an early version of this test used centroids and hit exactly that.
    const NU = 25, NV = 20;
    let tested = 0;
    for (let i = 0; i < NU; i++) {
      for (let j = 0; j < NV; j++) {
        const u = minU + (maxU - minU) * ((i + 0.37) / NU);
        const v = minV + (maxV - minV) * ((j + 0.61) / NV);
        const truth = marchGroundTruth(s, u, v);
        if (truth === null) continue;
        let lastFace: IsoFace | null = null;
        for (const f of fills) if (strictlyInsideQuad([u, v], f.points)) lastFace = f;
        if (lastFace === null) continue;
        tested++;
        const painted = classifyFillOrientation(lastFace.points);
        assert.equal(painted, truth, `at (${u.toFixed(4)}, ${v.toFixed(4)})`);
      }
    }
    // A few hundred points is ample; this keeps the grid from silently
    // degrading into a near-empty (and therefore toothless) sample.
    assert.ok(tested > 50, `expected the sample grid to hit a useful number of points, got ${tested}`);
  }
});

// ---- Bore rims tied to project(), not just to op.r ---------------------
//
// rx is set from op.r directly (isobore.ts), so nothing ties the emitted
// ellipse to project() itself: a scaled or shifted projection would leave
// the rim the wrong size or place relative to everything else, unnoticed.
// This samples the TRUE 3D rim circle, projects every sample with
// project(), and checks each one lands on the emitted ellipse.
function sizeAlongAxis(base: { w: number; d: number; h: number }, axis: "x" | "y" | "z"): number {
  return axis === "x" ? base.w : axis === "y" ? base.d : base.h;
}

function planeAxes(axis: "x" | "y" | "z"): ["x" | "y" | "z", "x" | "y" | "z"] {
  const all: ("x" | "y" | "z")[] = ["x", "y", "z"];
  const [a, b] = all.filter((x) => x !== axis);
  return [a, b];
}

test("every bore rim's ellipse agrees with sampling the true 3D circle through project()", () => {
  for (const s of [
    subtractCylinder(block(8, 8, 4), "z", 4, 4, 2),
    subtractCylinder(block(8, 8, 8), "y", 4, 4, 2),
    subtractBox(subtractCylinder(block(8, 8, 8), "x", 6, 4, 2),
      { x: 2, y: 0, z: 0, w: 4, d: 3, h: 3 }),
  ]) {
    const cylOps = s.ops.filter((o): o is CylinderOp => o.kind === "cylinder");
    const ellipses = isometricView(s).filter((p): p is IsoEllipse => p.kind === "iso-ellipse");
    assert.equal(ellipses.length, cylOps.length);
    // The corpus here never has more than one cylinder op per solid, so
    // pairing the sole ellipse with the sole op is unambiguous.
    assert.equal(cylOps.length, 1, "this test assumes exactly one cylinder op per solid");
    const op = cylOps[0];
    const e = ellipses[0];
    const [pu, pv] = planeAxes(op.axis);
    const faceCoord = op.axis === "y" ? 0 : sizeAlongAxis(s.base, op.axis);
    const rot = (-e.rotation * Math.PI) / 180;
    for (let k = 0; k < 24; k++) {
      const theta = (k / 24) * 2 * Math.PI;
      const point = { x: 0, y: 0, z: 0 };
      point[op.axis] = faceCoord;
      point[pu] = op.u + op.r * Math.cos(theta);
      point[pv] = op.v + op.r * Math.sin(theta);
      const p = project(point.x, point.y, point.z);
      const dx = p.u - e.cx, dy = p.v - e.cy;
      // (p - c) rotated by -rotation should satisfy (x/rx)^2 + (y/ry)^2 = 1.
      const a = dx * Math.cos(rot) - dy * Math.sin(rot);
      const b = dx * Math.sin(rot) + dy * Math.cos(rot);
      const onEllipse = (a / e.rx) ** 2 + (b / e.ry) ** 2;
      assert.ok(Math.abs(onEllipse - 1) < 1e-6, `sample ${k}: (a/rx)^2+(b/ry)^2 = ${onEllipse}`);
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
