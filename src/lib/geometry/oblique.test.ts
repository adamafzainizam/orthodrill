import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEPTH_FACTOR, DEPTH_STEP, projectOblique, profileOf, obliqueBounds,
  validateObliqueSolid,
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
