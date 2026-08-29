import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rotatePoint, rotatePrimitive, mirrorPrimitive, selectionBounds,
  defaultRotateBase, mirrorAxis, quarterTurnsFor,
} from "./transform.ts";
import type { Primitive } from "../scoring/primitives.ts";

const seg = (x1: number, y1: number, x2: number, y2: number): Primitive =>
  ({ kind: "segment", type: "visible", x1, y1, x2, y2 });

// An asymmetric L, so a mirror or a wrong sign cannot hide behind symmetry.
const L: Primitive[] = [
  seg(0, 0, 8, 0), seg(8, 0, 8, 3), seg(8, 3, 5, 3),
  seg(5, 3, 5, 7), seg(5, 7, 0, 7), seg(0, 7, 0, 0),
];
const ALL = L.map((_, i) => i);

test("SIGN CONTROL: positive is counter-clockwise AS SEEN ON SCREEN", () => {
  // Grid y runs DOWNWARD, so a screen-anticlockwise quarter turn sends a
  // point on the +x axis to the point ABOVE the base, which is -y.
  assert.deepEqual(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 1), { x: 0, y: -1 });
  assert.deepEqual(rotatePoint({ x: 0, y: -1 }, { x: 0, y: 0 }, 1), { x: -1, y: 0 });
  assert.deepEqual(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, -1), { x: 0, y: 1 });
});

test("four quarter turns return the drawing exactly", () => {
  const base = { x: 4, y: 3 };
  const once = L.map((p) => rotatePrimitive(p, base, 1));
  const four = L.map((p) => rotatePrimitive(p, base, 4));
  assert.deepEqual(four, L);
  assert.notDeepEqual(once, L); // positive control: it really did move
});

test("rotation is CONGRUENT -- every segment length preserved exactly", () => {
  for (const turns of [1, 2, 3]) {
    const out = L.map((p) => rotatePrimitive(p, { x: 4, y: 3 }, turns));
    for (let i = 0; i < L.length; i++) {
      const a = L[i], b = out[i];
      if (a.kind !== "segment" || b.kind !== "segment") continue;
      assert.equal(
        Math.hypot(a.x2 - a.x1, a.y2 - a.y1),
        Math.hypot(b.x2 - b.x1, b.y2 - b.y1),
        `length changed at ${turns} turns`,
      );
    }
  }
});

test("THE PARITY TRAP: every rotated coordinate is an integer, for every bbox parity", () => {
  // Rotating about a bounding-box CENTRE is off-lattice whenever the box's
  // width and height differ in parity. defaultRotateBase rounds to a lattice
  // point precisely so this cannot happen.
  for (const [w, h] of [[8, 6], [7, 6], [8, 5], [7, 5]]) {
    const box: Primitive[] = [seg(0, 0, w, 0), seg(w, 0, w, h), seg(w, h, 0, h), seg(0, h, 0, 0)];
    const base = defaultRotateBase(box, box.map((_, i) => i));
    assert.notEqual(base, null);
    if (base === null) continue;
    assert.equal(Number.isInteger(base.x) && Number.isInteger(base.y), true,
      `base point not integer for ${w}x${h}`);
    for (const turns of [1, 2, 3]) {
      const turned: Primitive[] = box.map((q) => rotatePrimitive(q, base, turns));
      for (const p of turned) {
        if (p.kind !== "segment") continue;
        for (const n of [p.x1, p.y1, p.x2, p.y2]) {
          assert.equal(Number.isInteger(n), true, `non-integer at ${w}x${h}, ${turns} turns`);
        }
      }
    }
  }
});

test("a circle rotates by its centre and keeps its radius", () => {
  const c: Primitive = { kind: "circle", type: "hidden", cx: 6, cy: 2, r: 3 };
  assert.deepEqual(rotatePrimitive(c, { x: 4, y: 4 }, 1),
    { kind: "circle", type: "hidden", cx: 2, cy: 2, r: 3 });
});

test("only whole quarter turns are accepted -- a decimal stop is not a stop", () => {
  assert.equal(quarterTurnsFor(90), 1);
  assert.equal(quarterTurnsFor(-90), -1);
  assert.equal(quarterTurnsFor(180), 2);
  assert.equal(quarterTurnsFor(-360), -4);
  assert.equal(quarterTurnsFor(0), 0);
  assert.equal(quarterTurnsFor(45), null);
  assert.equal(quarterTurnsFor(36.87), null);
  assert.equal(quarterTurnsFor(30), null);
  assert.equal(quarterTurnsFor(Number.NaN), null);
});

test("MIRROR needs no base point: the bbox centre is safe for EVERY bbox", () => {
  // A mirror maps x -> 2*cx - x and leaves y alone, so it is exact whenever
  // 2*cx is an integer. cx = (minX+maxX)/2, whose numerator is always an
  // integer, so this holds for every selection -- unlike rotation, which
  // couples x and y and fails on mixed parity.
  for (const [w, h] of [[8, 6], [7, 6], [8, 5], [7, 5]]) {
    const box: Primitive[] = [seg(0, 0, w, 0), seg(w, 0, w, h), seg(w, h, 0, h), seg(0, h, 0, 0)];
    const idx = box.map((_, i) => i);
    for (const horizontal of [true, false]) {
      const axis = mirrorAxis(box, idx, horizontal);
      assert.notEqual(axis, null);
      if (axis === null) continue;
      const flipped: Primitive[] = box.map((q) => mirrorPrimitive(q, axis, horizontal));
      for (const p of flipped) {
        if (p.kind !== "segment") continue;
        for (const n of [p.x1, p.y1, p.x2, p.y2]) {
          assert.equal(Number.isInteger(n), true, `non-integer mirroring ${w}x${h}`);
        }
      }
    }
  }
});

test("mirroring twice returns the original, and once does NOT", () => {
  const axis = mirrorAxis(L, ALL, true);
  assert.notEqual(axis, null);
  if (axis === null) return;
  const once = L.map((p) => mirrorPrimitive(p, axis, true));
  const twice = once.map((p) => mirrorPrimitive(p, axis, true));
  assert.deepEqual(twice, L);
  // POSITIVE CONTROL: without this, a mirror implemented as a no-op would
  // pass the involution test above.
  assert.notDeepEqual(once, L);
});

test("selectionBounds spans a circle's full extent, not just its centre", () => {
  const ps: Primitive[] = [{ kind: "circle", type: "visible", cx: 5, cy: 5, r: 3 }];
  assert.deepEqual(selectionBounds(ps, [0]), { minX: 2, minY: 2, maxX: 8, maxY: 8 });
});

test("an empty selection has no bounds, no base point and no mirror axis", () => {
  assert.equal(selectionBounds(L, []), null);
  assert.equal(defaultRotateBase(L, []), null);
  assert.equal(mirrorAxis(L, [], true), null);
});
