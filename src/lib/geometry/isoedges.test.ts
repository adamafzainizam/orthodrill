import { test } from "node:test";
import assert from "node:assert/strict";
import { isoEdges, faceDepth } from "./isoedges.ts";
import { buildOccupancy } from "./occupancy.ts";
import { block, subtractBox, subtractCylinder, type Solid } from "./solid.ts";
import type { IsoFace, IsoLine } from "./isotypes.ts";

const run = (s: Solid) => isoEdges(buildOccupancy(s));
const faces = (ps: (IsoFace | IsoLine)[]) => ps.filter((p) => p.kind === "iso-face");
const lines = (ps: (IsoFace | IsoLine)[]) => ps.filter((p) => p.kind === "iso-line");

/**
 * Join collinear touching strokes, for counting only. The generator emits one
 * unit segment per face edge on purpose - merging across faces would let a
 * nearer coplanar fill paint over part of an outline - so the merge that makes
 * the nine-edge invariant checkable belongs here in the test.
 */
function mergedCount(ps: (IsoFace | IsoLine)[]): number {
  const segs = lines(ps).map((l) => {
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
    // direction, normalised and sign-canonical, plus the line's offset
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

// A rectangular box drawn isometrically shows exactly nine edges - the six of
// the hexagonal outline plus three meeting at the near corner - whatever its
// dimensions. Independently known. Fails if coplanar strokes are not cancelled.
test("every plain block's strokes merge to exactly nine lines, whatever its size", () => {
  for (const [w, d, h] of [[1,1,1],[2,1,1],[2,2,2],[6,4,2],[8,3,5]]) {
    assert.equal(mergedCount(run(block(w, d, h))), 9, `block(${w},${d},${h})`);
  }
});

test("a plain block emits one fill per exposed viewer-facing face", () => {
  assert.equal(faces(run(block(1, 1, 1))).length, 3);
  // 2x1x1: two +z, two -y, one +x.
  assert.equal(faces(run(block(2, 1, 1))).length, 5);
});

test("every fill is a quadrilateral with finite coordinates", () => {
  for (const p of faces(run(block(3, 2, 2)))) {
    assert.equal(p.points.length, 4);
    for (const [u, v] of p.points) assert.ok(Number.isFinite(u) && Number.isFinite(v));
  }
});

// The load-bearing ordering property: occlusion depends entirely on it. For a
// 2x1x1 block the voxel at x=1 is nearer the viewer than the one at x=0, and a
// nearer face projects further right, so its fill must be emitted LATER.
test("nearer fills are emitted later, so they paint over farther ones", () => {
  const ps = run(block(2, 1, 1));
  const fs = faces(ps);
  const centroidU = (f: IsoFace) => f.points.reduce((a, p) => a + p[0], 0) / f.points.length;
  let leftmost = 0, rightmost = 0;
  fs.forEach((f, i) => {
    if (centroidU(f) < centroidU(fs[leftmost])) leftmost = i;
    if (centroidU(f) > centroidU(fs[rightmost])) rightmost = i;
  });
  assert.ok(rightmost > leftmost,
    `nearer fill at index ${rightmost} must come after farther fill at ${leftmost}`);
});

test("no stroke is emitted before the first fill", () => {
  const ps = run(block(2, 2, 2));
  const firstFace = ps.findIndex((p) => p.kind === "iso-face");
  const firstLine = ps.findIndex((p) => p.kind === "iso-line");
  assert.equal(firstFace, 0);
  assert.ok(firstLine > firstFace);
});

test("a through-hole does not change the merged stroke count", () => {
  assert.equal(mergedCount(run(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2))), 9);
});

test("a stepped solid merges to more than the nine of a plain block", () => {
  const n = mergedCount(run(subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 })));
  assert.ok(n > 9, `expected more than nine, got ${n}`);
});

test("an empty solid yields nothing", () => {
  assert.deepEqual(run(subtractBox(block(2, 2, 2), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 2 })), []);
});

test("output is stable across runs", () => {
  const o = buildOccupancy(block(4, 3, 2));
  assert.deepEqual(isoEdges(o), isoEdges(o));
});

// Depth ordering is what makes occlusion work, and a wrong key here is
// invisible to every structural test above (e.g. x + y + z passes all of
// them while producing hundreds of spurious/missing pixels on real solids).
// +x and +z are toward the viewer; +y is away, into the page.
test("depth increases toward the viewer on each axis", () => {
  assert.ok(faceDepth(1, 0, 0) > faceDepth(0, 0, 0), "+x must be nearer");
  assert.ok(faceDepth(0, 1, 0) < faceDepth(0, 0, 0), "+y must be farther");
  assert.ok(faceDepth(0, 0, 1) > faceDepth(0, 0, 0), "+z must be nearer");
});
