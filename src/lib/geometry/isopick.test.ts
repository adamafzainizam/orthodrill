import { test } from "node:test";
import assert from "node:assert/strict";
import { isoEdges } from "./isoedges.ts";
import { isoPickList } from "./isopick.ts";
import { buildOccupancy } from "./occupancy.ts";
import { occupancyFromCells } from "./cells.ts";
import { block, subtractBox } from "./solid.ts";

const STEP = subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }, "step");

test("the pick list's polygons ARE the painted faces, in the same order", () => {
  // THE ANTI-DIVERGENCE GUARD, and the reason isoPickList is emitted from the
  // same ordered pass rather than computed beside it. If these two ever
  // disagree, a student's click lands on a face other than the one they can
  // see, and nothing else in the system would notice.
  for (const s of [block(3, 2, 2), STEP, block(1, 1, 1)]) {
    const occ = buildOccupancy(s);
    const painted = isoEdges(occ).filter((p) => p.kind === "iso-face");
    const picks = isoPickList(occ);
    assert.equal(picks.length, painted.length, "different number of faces");
    for (let i = 0; i < picks.length; i++) {
      assert.deepEqual(picks[i].points, painted[i].points, `face ${i} differs`);
    }
  }
});

test("every picked face belongs to a solid cell", () => {
  const occ = buildOccupancy(STEP);
  for (const f of isoPickList(occ)) {
    assert.equal(occ.isSolid(f.cell[0], f.cell[1], f.cell[2]), true,
      `picked face on empty cell ${f.cell.join(",")}`);
  }
});

test("a single cube offers exactly its three viewer-facing faces", () => {
  const picks = isoPickList(buildOccupancy(block(1, 1, 1)));
  assert.equal(picks.length, 3);
  assert.deepEqual([...picks.map((p) => p.dir)].sort(), ["+x", "+z", "-y"]);
});

test("a face is never offered where a neighbour covers it", () => {
  // Two cells stacked in z: the lower one's +z face is buried and must not be
  // pickable, or a click would add a block inside the solid.
  const occ = occupancyFromCells([[0, 0, 0], [0, 0, 1]], 1, 1, 2);
  const buried = isoPickList(occ).filter((f) => f.dir === "+z" && f.cell[2] === 0);
  assert.deepEqual(buried, [], "the covered +z face was offered as pickable");
});

test("the pick list is ordered back to front, like the paint program", () => {
  const picks = isoPickList(buildOccupancy(STEP));
  const depth = (c: readonly [number, number, number]) => c[0] - c[1] + c[2];
  for (let i = 1; i < picks.length; i++) {
    assert.ok(depth(picks[i].cell) >= depth(picks[i - 1].cell),
      `face ${i} is nearer than its successor — order is not back-to-front`);
  }
});
