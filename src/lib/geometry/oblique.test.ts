import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEPTH_FACTOR, DEPTH_STEP, projectOblique, profileOf, obliqueBounds,
  type ObliqueType,
} from "./oblique.ts";
import { block, subtractBox } from "./solid.ts";

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
