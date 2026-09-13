import { test } from "node:test";
import assert from "node:assert/strict";
import { rotateCell, unrotateCell, rotatedOccupancy, type Cell, type QuarterTurn } from "./rotate3.ts";
import { buildOccupancy } from "./occupancy.ts";
import { block, subtractBox } from "./solid.ts";

const TURNS: QuarterTurn[] = [0, 1, 2, 3];

/** An L-shaped, deliberately asymmetric part. */
const L = subtractBox(block(4, 3, 2), { x: 2, y: 0, z: 1, w: 2, d: 3, h: 1 }, "step");

function cellsOf(o: ReturnType<typeof buildOccupancy>): Cell[] {
  const out: Cell[] = [];
  for (let k = 0; k < o.h; k++) for (let j = 0; j < o.d; j++) for (let i = 0; i < o.w; i++)
    if (o.isSolid(i, j, k)) out.push([i, j, k]);
  return out;
}
const key = (c: Cell) => c.join(",");
const setOf = (o: { w: number; d: number; h: number; isSolid(i: number, j: number, k: number): boolean }) => {
  const s = new Set<string>();
  for (let k = 0; k < o.h; k++) for (let j = 0; j < o.d; j++) for (let i = 0; i < o.w; i++)
    if (o.isSolid(i, j, k)) s.add(`${i},${j},${k}`);
  return s;
};

test("rotateCell and unrotateCell round-trip for every cell and every turn", () => {
  const o = buildOccupancy(L);
  let checked = 0;
  for (const q of TURNS) {
    for (const c of cellsOf(o)) {
      const there = rotateCell(c, q, o.w, o.d);
      const back = unrotateCell(there, q, o.w, o.d);
      assert.equal(key(back), key(c), `q=${q} failed to round-trip ${key(c)} (via ${key(there)})`);
      checked++;
    }
  }
  assert.ok(checked > 0, "no cells checked — this test is inert");
});

test("a rotated cell stays inside the rotated grid's bounds", () => {
  const o = buildOccupancy(L);
  for (const q of TURNS) {
    const rw = q % 2 === 1 ? o.d : o.w;
    const rd = q % 2 === 1 ? o.w : o.d;
    for (const [x, y, z] of cellsOf(o)) {
      const [i, j, k] = rotateCell([x, y, z], q, o.w, o.d);
      assert.ok(i >= 0 && i < rw, `q=${q}: i=${i} outside 0..${rw - 1}`);
      assert.ok(j >= 0 && j < rd, `q=${q}: j=${j} outside 0..${rd - 1}`);
      assert.equal(k, z, "a turn about z must not move z");
    }
  }
});

test("rotatedOccupancy at q equals applying the q=1 adapter q times", () => {
  const o = buildOccupancy(L);
  for (const q of TURNS) {
    let stepwise = o;
    for (let n = 0; n < q; n++) stepwise = rotatedOccupancy(stepwise, 1);
    const direct = rotatedOccupancy(o, q);
    assert.equal(direct.w, stepwise.w, `q=${q} width disagrees`);
    assert.equal(direct.d, stepwise.d, `q=${q} depth disagrees`);
    assert.equal(direct.h, stepwise.h, `q=${q} height disagrees`);
    assert.deepEqual(setOf(direct), setOf(stepwise), `q=${q} occupancy disagrees with stepwise rotation`);
  }
});

test("four quarter turns return the original occupancy", () => {
  const o = buildOccupancy(L);
  let r = o;
  for (let n = 0; n < 4; n++) r = rotatedOccupancy(r, 1);
  assert.equal(r.w, o.w);
  assert.equal(r.d, o.d);
  assert.deepEqual(setOf(r), setOf(o));
});

test("POSITIVE CONTROL: an asymmetric solid rotated once is NOT itself", () => {
  // Without this, every check above would pass on an adapter that returned its
  // input unchanged. AGENTS.md §6: a property test can pass while the property
  // is entirely absent from the code.
  const o = buildOccupancy(L);
  const r = rotatedOccupancy(o, 1);
  assert.notDeepEqual(setOf(r), setOf(o), "rotating an L by 90 degrees changed nothing — the adapter is a no-op");
});

test("the q=1 mapping is pinned by a hand-derived coordinate, not by the code", () => {
  // A 3-wide, 2-deep, 1-high grid with exactly one solid cell at the origin.
  // By the convention table: (x,y) -> (d-1-y, x), so (0,0) -> (2-1-0, 0) = (1,0).
  // Derived from the rule, never recomputed from the implementation — this is
  // the check that a mirrored adapter cannot survive.
  const oneCell = {
    w: 3, d: 2, h: 1,
    isSolid: (i: number, j: number, k: number) => i === 0 && j === 0 && k === 0,
  };
  const r = rotatedOccupancy(oneCell, 1);
  assert.equal(r.w, 2, "rotated width must be the original depth");
  assert.equal(r.d, 3, "rotated depth must be the original width");
  assert.equal(r.isSolid(1, 0, 0), true, "the cell must land at (1,0,0)");
  assert.deepEqual(setOf(r), new Set(["1,0,0"]), "exactly one cell, and it is at (1,0,0)");
});
