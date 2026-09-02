import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEPTH_FACTOR, DEPTH_STEP, projectOblique, profileOf, obliqueBounds,
  validateObliqueSolid, obliqueKey,
  type ObliqueType,
} from "./oblique.ts";
import { block, subtractBox, subtractCylinder } from "./solid.ts";

const TYPES: ObliqueType[] = ["cavalier", "cabinet", "general"];

test("the three types are the three standard depth factors", () => {
  assert.equal(DEPTH_FACTOR.cavalier, 1);
  assert.equal(DEPTH_FACTOR.cabinet, 0.5);
  assert.equal(DEPTH_FACTOR.general, 2 / 3);
  // The depth STEP is the denominator: every y-coordinate must be a multiple.
  assert.deepEqual(DEPTH_STEP, { cavalier: 1, cabinet: 2, general: 3 });
});

test("POSITIVE CONTROL: one unit of depth steps one cell right and one cell UP", () => {
  // Grid y runs DOWNWARD, so "up" means the screen y DECREASES. A sign error
  // here gives a drawing that recedes toward the viewer instead of away, and
  // it is perfectly self-consistent, which is why this is pinned explicitly.
  const at0 = projectOblique(0, 0, 0, 1, 10, 30);
  const at1 = projectOblique(0, 1, 0, 1, 10, 30);
  assert.deepEqual(at0, { x: 10, y: 30 });
  assert.deepEqual(at1, { x: 11, y: 29 });
});

test("height goes UP the screen, so z increases as screen y decreases", () => {
  assert.deepEqual(projectOblique(0, 0, 4, 1, 10, 30), { x: 10, y: 26 });
});

test("every corner of a 6-deep unit prism lands on the lattice, in all three types", () => {
  for (const t of TYPES) {
    const k = DEPTH_FACTOR[t];
    const step = DEPTH_STEP[t];
    for (const y of [0, step, 2 * step, 6]) {
      if (y % step !== 0) continue;
      for (const x of [0, 3]) for (const z of [0, 4]) {
        const p = projectOblique(x, y, z, k, 20, 30);
        assert.equal(Number.isInteger(p.x), true, `${t} x at y=${y}`);
        assert.equal(Number.isInteger(p.y), true, `${t} y at y=${y}`);
      }
    }
  }
});

test("the profile is the occupancy slice, and for a prism every slice agrees", () => {
  // An L: a 6x4 block with a 2x4 corner removed through the FULL depth.
  const l = subtractBox(block(6, 6, 4), { x: 4, y: 0, z: 2, w: 2, d: 6, h: 2 }, "step");
  const p = profileOf(l);
  assert.equal(p.length, 4);      // h rows
  assert.equal(p[0].length, 6);   // w columns
  // Row z=0 (bottom) is solid across; row z=3 (top) is missing the last two.
  assert.deepEqual(p[0], [true, true, true, true, true, true]);
  assert.deepEqual(p[3], [true, true, true, true, false, false]);
});

test("bounds are (w + k*d) by (h + k*d)", () => {
  const s = block(8, 6, 4);
  assert.deepEqual(obliqueBounds({ solid: s, type: "cavalier", originX: 0, originY: 0 }),
    { width: 14, height: 10 });
  assert.deepEqual(obliqueBounds({ solid: s, type: "cabinet", originX: 0, originY: 0 }),
    { width: 11, height: 7 });
  assert.deepEqual(obliqueBounds({ solid: s, type: "general", originX: 0, originY: 0 }),
    { width: 12, height: 8 });
});

// A legal prism: depth 6 (a multiple of 1, 2 AND 3), and its one feature
// spans the whole depth, so it is an extrusion of a 2D profile.
const PRISM = subtractBox(block(6, 6, 4), { x: 4, y: 0, z: 2, w: 2, d: 6, h: 2 }, "step");

test("POSITIVE CONTROL: a legal prism passes in all three types", () => {
  for (const t of TYPES) {
    assert.equal(validateObliqueSolid(PRISM, t), null, `${t} rejected a legal prism`);
  }
});

test("a cylinder is rejected -- a bore is an ellipse in oblique", () => {
  const bored = subtractCylinder(block(6, 6, 4), "z", 3, 3, 1, "bore");
  assert.equal(validateObliqueSolid(bored, "cavalier"), "CYLINDER_IN_OBLIQUE");
});

test("the depth rule is per TYPE: the same solid can be legal in one and not another", () => {
  // Depth 4: fine for cavalier (step 1) and cabinet (step 2), not for
  // general (step 3). This is the whole reason DEPTH_STEP exists.
  const d4 = block(6, 4, 4);
  assert.equal(validateObliqueSolid(d4, "cavalier"), null);
  assert.equal(validateObliqueSolid(d4, "cabinet"), null);
  assert.equal(validateObliqueSolid(d4, "general"), "DEPTH_NOT_ON_STEP");
});

test("a FEATURE's y-coordinate is checked too, not just the overall depth", () => {
  // Depth 6 is legal for cabinet, but a feature starting at y=1 is not:
  // AGENTS.md §4 is explicit that the rule covers every feature box's y and d.
  const oddFeature = subtractBox(block(6, 6, 4), { x: 4, y: 1, z: 2, w: 2, d: 4, h: 2 }, "groove");
  assert.equal(validateObliqueSolid(oddFeature, "cabinet"), "DEPTH_NOT_ON_STEP");
});

test("a feature that does not span the full depth is not a prism", () => {
  // y=0..2 of a 6-deep block: every y is a multiple of 2, so the depth rule
  // passes and only the prism rule catches it.
  const notPrism = subtractBox(block(6, 6, 4), { x: 4, y: 0, z: 2, w: 2, d: 2, h: 2 }, "pocket");
  assert.equal(validateObliqueSolid(notPrism, "cabinet"), "NOT_A_PRISM");
});

test("a fully subtracted solid is rejected rather than drawn as nothing", () => {
  const gone = subtractBox(block(6, 6, 4), { x: 0, y: 0, z: 0, w: 6, d: 6, h: 4 }, "all");
  assert.equal(validateObliqueSolid(gone, "cavalier"), "EMPTY_SOLID");
});

const key = (ps: { kind: string }[]) =>
  ps.map((p) => {
    const q = p as unknown as { x1: number; y1: number; x2: number; y2: number };
    // Canonical endpoint order, so authorship order cannot affect comparison.
    const [a, b] = [[q.x1, q.y1], [q.x2, q.y2]].sort((m, n) => m[0] - n[0] || m[1] - n[1]);
    return `${a[0]},${a[1]}-${b[0]},${b[1]}`;
  }).sort();

test("a plain box in cavalier is exactly the nine segments drawn by hand", () => {
  // w=4 d=6 h=3, origin (0,20). Derived from the geometry, NOT recomputed from
  // the generator: front rectangle (4), two back edges whose faces are visible
  // (+x and +z), and three receding lines.
  const got = key(obliqueKey({
    solid: block(4, 6, 3), type: "cavalier", originX: 0, originY: 20,
  }));
  assert.deepEqual(got, [
    "0,17-0,20",     // front left
    "0,17-4,17",     // front top
    "0,17-6,11",     // receding from TOP-LEFT
    "0,20-4,20",     // front bottom
    "10,11-10,14",   // back right
    "4,17-10,11",    // receding from TOP-RIGHT -- the crease, see below
    "4,17-4,20",     // front right
    "4,20-10,14",    // receding from BOTTOM-RIGHT
    "6,11-10,11",    // back top
  ].sort());
});

test("POSITIVE CONTROL: the TOP-RIGHT receding crease is present", () => {
  // It is INTERIOR to the silhouette hexagon, so a generator that emits only
  // the union outline plus the front profile loses it and the drawing looks
  // subtly wrong. It is the crease between the visible top face and the
  // visible right face, and it is genuinely drawn.
  const got = key(obliqueKey({
    solid: block(4, 6, 3), type: "cavalier", originX: 0, originY: 20,
  }));
  assert.equal(got.includes("4,17-10,11"), true, "top-right receding crease missing");
});

test("no receding line from the BOTTOM-LEFT corner, where both faces are hidden", () => {
  const got = key(obliqueKey({
    solid: block(4, 6, 3), type: "cavalier", originX: 0, originY: 20,
  }));
  assert.equal(got.some((k) => k.startsWith("0,20-6,")), false);
});

test("OCCLUSION: a back edge covered by the sweep of nearer material is absent", () => {
  // Top-left 2x2 removed, so moving up-and-right from the low-left region
  // re-enters the solid -- which is exactly when a prism occludes itself.
  const notched = subtractBox(block(6, 6, 4), { x: 0, y: 0, z: 2, w: 2, d: 6, h: 2 }, "notch");
  const got = key(obliqueKey({
    solid: notched, type: "cavalier", originX: 0, originY: 20,
  }));
  // The back edge of the LOW-LEFT top face (z=2, x 0..2 at y=6) would project
  // to (6,12)-(8,12). The tall right part sweeps over it.
  assert.equal(got.includes("6,12-8,12"), false, "an occluded back edge was drawn");
  // ...while the back edge of the TALL part's top (z=4, x 2..6) is visible.
  assert.equal(got.includes("8,10-12,10"), true, "a visible back edge was dropped");
});

test("every coordinate is an integer, in all three types", () => {
  const prism = subtractBox(block(6, 6, 4), { x: 4, y: 0, z: 2, w: 2, d: 6, h: 2 }, "step");
  for (const t of TYPES) {
    for (const p of obliqueKey({ solid: prism, type: t, originX: 2, originY: 30 })) {
      assert.equal(p.kind, "segment");
      if (p.kind !== "segment") continue;
      for (const n of [p.x1, p.y1, p.x2, p.y2]) {
        assert.equal(Number.isInteger(n), true, `${t} produced ${n}`);
      }
    }
  }
});

test("hidden lines are OMITTED -- every primitive is visible", () => {
  const prism = subtractBox(block(6, 6, 4), { x: 4, y: 0, z: 2, w: 2, d: 6, h: 2 }, "step");
  for (const t of TYPES) {
    for (const p of obliqueKey({ solid: prism, type: t, originX: 2, originY: 30 })) {
      assert.equal(p.type, "visible");
    }
  }
});

test("collinear unit edges are merged -- a 4-wide front edge is ONE segment", () => {
  const got = key(obliqueKey({
    solid: block(4, 6, 3), type: "cavalier", originX: 0, originY: 20,
  }));
  assert.equal(got.includes("0,20-4,20"), true, "front bottom was not merged");
  assert.equal(got.includes("0,20-1,20"), false, "front bottom left as unit pieces");
});

test("two receding edges that project onto the SAME line and OVERLAP become one segment", () => {
  // The top-left-notched prism has receding edges rising from profile vertices
  // (0,2) and (2,4). Both land on x + y = 18, covering [0,6] and [2,8], so
  // they overlap. A merger that only chains end-to-start emits five fragments
  // where the drawing has one line; the key is the INK, and overlapping ink is
  // drawn once. Found by dumping the real output, not by any assertion here
  // before it existed.
  const notched = subtractBox(block(6, 6, 4), { x: 0, y: 0, z: 2, w: 2, d: 6, h: 2 }, "notch");
  const got = key(obliqueKey({ solid: notched, type: "cavalier", originX: 0, originY: 20 }));
  assert.deepEqual(got, [
    "0,18-0,20",    // front left
    "0,18-2,18",    // front top, low part
    "0,18-8,10",    // the UNIONED receding line -- two edges, one segment
    "0,20-6,20",    // front bottom
    "12,10-12,14",  // back right
    "2,16-2,18",    // front inner left
    "2,16-6,16",    // front top, tall part
    "6,16-12,10",   // receding, top-right
    "6,16-6,20",    // front right
    "6,20-12,14",   // receding, bottom-right
    "8,10-12,10",   // back top, tall part
  ].sort());
  // The concave vertex at (2,2) is buried under the tall part: its whole
  // receding edge is occluded, so nothing lies on x + y = 20.
  assert.equal(got.some((g) => g === "2,18-8,12"), false);
});
