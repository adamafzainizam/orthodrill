import { test } from "node:test";
import assert from "node:assert/strict";
import { groupRegions, describeWhere, scoreSolid } from "./solid.ts";
import { cellsOfSolid, normaliseCells, occupancyFromCells } from "../geometry/cells.ts";
import { block, subtractBox } from "../geometry/solid.ts";
import { generateViewsFromOccupancy } from "../geometry/views.ts";
import type { Cell } from "../geometry/rotate3.ts";

/** Recomputed from the public entry point, independently of solid.ts's internals. */
function viewsDifferingWhenRestored(attempt: readonly Cell[], key: readonly Cell[]): string[] {
  const a = normaliseCells(attempt);
  const k = normaliseCells(key);
  const dim = (cs: readonly Cell[], i: 0 | 1 | 2) => cs.reduce((m, c) => Math.max(m, c[i] + 1), 1);
  const w = Math.max(dim(a, 0), dim(k, 0));
  const d = Math.max(dim(a, 1), dim(k, 1));
  const h = Math.max(dim(a, 2), dim(k, 2));
  const va = generateViewsFromOccupancy(occupancyFromCells(a, w, d, h));
  const vk = generateViewsFromOccupancy(occupancyFromCells(k, w, d, h));
  return (["front", "top", "side"] as const)
    .filter((n) => JSON.stringify(va[n]) !== JSON.stringify(vk[n]));
}

test("groupRegions puts face-touching cells in one region", () => {
  const r = groupRegions([[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.equal(r.length, 1);
  assert.equal(r[0].length, 3);
});

test("groupRegions separates cells that do not touch", () => {
  const r = groupRegions([[0, 0, 0], [5, 5, 5]]);
  assert.equal(r.length, 2);
});

test("groupRegions does NOT join cells that touch only at a corner", () => {
  // 6-connectivity, not 26. Two diagonal cells are two separate mistakes and
  // deserve two separate sentences.
  const r = groupRegions([[0, 0, 0], [1, 1, 0]]);
  assert.equal(r.length, 2, "diagonally adjacent cells were merged — that is 26-connectivity");
});

test("groupRegions joins across all three axes", () => {
  const r = groupRegions([[0, 0, 0], [0, 0, 1], [0, 1, 1]]);
  assert.equal(r.length, 1);
});

test("groupRegions on an empty set returns no regions", () => {
  assert.deepEqual(groupRegions([]), []);
});

test("describeWhere names the corner a region sits in", () => {
  // extent is the key's bounding-box size, so thirds of a 9x9x9 part are 3 wide.
  assert.equal(describeWhere([[0, 0, 0]], [9, 9, 9]), "at the bottom front left");
  assert.equal(describeWhere([[8, 8, 8]], [9, 9, 9]), "at the top back right");
});

test("describeWhere drops the axes a region is central on", () => {
  assert.equal(describeWhere([[4, 4, 8]], [9, 9, 9]), "at the top");
  assert.equal(describeWhere([[0, 4, 4]], [9, 9, 9]), "at the left");
});

test("describeWhere says 'in the middle' when a region is central on every axis", () => {
  assert.equal(describeWhere([[4, 4, 4]], [9, 9, 9]), "in the middle");
});

test("scoreSolid calls an identical build perfect", () => {
  const key = cellsOfSolid(subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }, "step"));
  const r = scoreSolid(key, key);
  assert.equal(r.perfect, true);
  assert.deepEqual(r.diff.missing, []);
  assert.deepEqual(r.diff.extra, []);
});

test("scoreSolid ignores where the part sits", () => {
  const key = cellsOfSolid(subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }, "step"));
  const moved: Cell[] = key.map(([x, y, z]) => [x + 7, y + 3, z + 11]);
  assert.equal(scoreSolid(moved, key).perfect, true, "a translated build must score the same");
});

test("scoreSolid reports material the student failed to leave in place", () => {
  const key = cellsOfSolid(block(3, 3, 3));
  const attempt = key.filter((c) => !(c[0] === 0 && c[1] === 0 && c[2] === 0));
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false);
  assert.equal(r.diff.missing.length, 1);
  assert.equal(r.diff.missing[0].cells.length, 1);
  assert.equal(r.diff.extra.length, 0);
});

test("scoreSolid reports material the student left that should be cut away", () => {
  const key = cellsOfSolid(subtractBox(block(3, 3, 3), { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, "nick"));
  const attempt = cellsOfSolid(block(3, 3, 3));
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false);
  assert.equal(r.diff.extra.length, 1);
  assert.equal(r.diff.missing.length, 0);
});

test("scoreSolid groups one contiguous mistake into ONE region, not many cells", () => {
  // The whole reason regions exist: "there is material at the back left" is a
  // sentence a student can act on. "cells (2,2,0), (2,2,1), (2,2,2) are wrong"
  // is a checksum.
  const key = cellsOfSolid(subtractBox(block(3, 3, 3), { x: 2, y: 2, z: 0, w: 1, d: 1, h: 3 }, "post"));
  const attempt = cellsOfSolid(block(3, 3, 3));
  const r = scoreSolid(attempt, key);
  assert.equal(r.diff.extra.length, 1, "three stacked cells are one mistake");
  assert.equal(r.diff.extra[0].cells.length, 3);
});

test("a missing region names the views it actually changes", () => {
  const key = cellsOfSolid(block(3, 3, 3));
  const attempt = key.filter((c) => !(c[0] === 0 && c[1] === 0 && c[2] === 2));
  const r = scoreSolid(attempt, key);
  assert.equal(r.diff.missing.length, 1);
  assert.ok(r.diff.missing[0].views.length > 0, "a missing corner cell must show in some view");
  for (const v of r.diff.missing[0].views) {
    assert.ok(["front", "top", "side"].includes(v), `unexpected view name ${v}`);
  }
});

test("a region's named views agree with an INDEPENDENT recomputation, over many cases", () => {
  // What this can and cannot guard, stated plainly, because the first draft of
  // this test could not tell the real derivation from `return ALL_THREE`.
  //
  // MEASURED 2026-09-06: on every solid and every removal tried — all single
  // cells of five solids, and all 816 three-cell removals from block(3,3,2) —
  // a change to the occupancy changes ALL THREE views. Any cell that moves
  // alters its column's profile in each of the three projections, so a hidden
  // line appears or moves in each. No partial case is currently known.
  //
  // So this test cannot discriminate the derivation from a hardcoded list. It
  // guards the thing that IS checkable: that the named set equals what an
  // independent recomputation through the public entry point says, for every
  // region of every case below. If a partial case is ever found, add it here —
  // it will make this test discriminating for the first time.
  const cases: { key: Cell[]; attempt: Cell[] }[] = [];
  const push = (s: Parameters<typeof cellsOfSolid>[0], drop: (c: Cell) => boolean) => {
    const key = cellsOfSolid(s);
    cases.push({ key, attempt: key.filter((c) => !drop(c)) });
  };
  push(block(3, 3, 3), (c) => c[0] === 1 && c[1] === 1 && c[2] === 1);
  push(block(3, 3, 3), (c) => c[0] === 0 && c[1] === 0 && c[2] === 2);
  push(block(4, 3, 3), (c) => c[0] >= 2 && c[2] === 2);
  push(subtractBox(block(5, 4, 3), { x: 3, y: 0, z: 1, w: 2, d: 4, h: 2 }, "step"), (c) => c[0] === 0);

  let regionsChecked = 0;
  for (const { key, attempt } of cases) {
    const r = scoreSolid(attempt, key);
    const expected = viewsDifferingWhenRestored(attempt, key).sort();
    for (const region of [...r.diff.missing, ...r.diff.extra]) {
      regionsChecked++;
      assert.deepEqual(
        [...region.views].sort(), expected,
        "a region named views that an independent recomputation does not agree with",
      );
    }
  }
  assert.ok(regionsChecked >= 4, `only ${regionsChecked} regions checked — this test is nearly inert`);
});

test("matchesAllViews is false for a perfect build", () => {
  const key = cellsOfSolid(block(3, 3, 3));
  assert.equal(scoreSolid(key, key).matchesAllViews, false);
});

test("POSITIVE CONTROL: a wrong build that changes a view is NOT called view-consistent", () => {
  const key = cellsOfSolid(block(3, 3, 3));
  const attempt = key.filter((c) => !(c[0] === 0 && c[1] === 0 && c[2] === 2));
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false);
  assert.equal(r.matchesAllViews, false, "a build whose views differ must not be excused");
});

test("EXHAUSTIVE: on a 2x2x2 grid, do two different parts ever share all three views?", () => {
  // This is a MEASUREMENT as much as a test, and it is the only honest way to
  // exercise §5.3. Enumerate all 256 subsets of a 2x2x2 grid, bucket them by
  // their three generated views, and look for a bucket holding two distinct
  // normalised cell sets. Such a pair is a genuine ambiguity: a student could
  // build either and be right.
  //
  // An earlier draft of this test faked a pair by adding a cell outside the
  // block, which changes the bounding box and therefore the views — it passed
  // through its own else-branch without ever reaching the code it named. Do
  // not replace this with a hand-made pair unless you have verified the views
  // really are identical.
  const buckets = new Map<string, Cell[][]>();
  for (let mask = 1; mask < 256; mask++) {
    const cells: Cell[] = [];
    for (let b = 0; b < 8; b++) {
      if (mask & (1 << b)) cells.push([b & 1, (b >> 1) & 1, (b >> 2) & 1]);
    }
    const norm = normaliseCells(cells);
    const dim = (i: 0 | 1 | 2) => norm.reduce((m, c) => Math.max(m, c[i] + 1), 1);
    const v = generateViewsFromOccupancy(occupancyFromCells(norm, dim(0), dim(1), dim(2)));
    const sig = JSON.stringify([v.front, v.top, v.side]);
    const seen = buckets.get(sig) ?? [];
    if (!seen.some((other) => JSON.stringify(other) === JSON.stringify(norm))) seen.push(norm);
    buckets.set(sig, seen);
  }

  const ambiguous = [...buckets.values()].find((sets) => sets.length > 1);
  if (ambiguous === undefined) {
    assert.ok(buckets.size > 0, "no subsets were enumerated — this test is inert");
    return;
  }

  const [key, attempt] = ambiguous;
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false, "the two sets differ, so this is not a perfect build");
  assert.equal(
    r.matchesAllViews, true,
    "these two parts share all three views, so the verdict must say so rather than mark the student wrong",
  );
});

test("matchesAllViews is exactly 'not perfect, and no view differs'", () => {
  // Pins the predicate itself, so §5.3 is covered even on grids where no
  // ambiguous pair exists. Driven through the public entry point on both
  // sides, never recomputed from solid.ts's internals.
  const key = cellsOfSolid(subtractBox(block(3, 3, 2), { x: 0, y: 0, z: 1, w: 1, d: 1, h: 1 }, "nick"));
  const cases: Cell[][] = [
    key,
    key.filter((c) => !(c[0] === 2 && c[1] === 2 && c[2] === 0)),
    cellsOfSolid(block(3, 3, 2)),
  ];
  for (const attempt of cases) {
    const r = scoreSolid(attempt, key);
    const viewsDiffer = viewsDifferingWhenRestored(attempt, key).length > 0;
    assert.equal(
      r.matchesAllViews, !r.perfect && !viewsDiffer,
      `matchesAllViews disagreed with the views for attempt of ${attempt.length} cells`,
    );
  }
});

test("a region covering most of the part is NOT described by a corner", () => {
  // Found by reading a real verdict: a student who had built one cell of a
  // 44-cell part was told material was missing "at the bottom left". That is
  // the true centroid and useless as teaching — the part is simply absent.
  const key = cellsOfSolid(subtractBox(block(5, 4, 3), { x: 3, y: 0, z: 1, w: 2, d: 4, h: 2 }, "step"));
  const r = scoreSolid([[0, 0, 0]], key);
  assert.equal(r.diff.missing.length, 1);
  assert.equal(r.diff.missing[0].where, "across most of the part");
});

test("a SMALL region is still described by where it sits", () => {
  // The positive control for the rule above: it must not swallow the ordinary
  // case it was added beside.
  const key = cellsOfSolid(block(3, 3, 3));
  const attempt = key.filter((c) => !(c[0] === 0 && c[1] === 0 && c[2] === 0));
  const r = scoreSolid(attempt, key);
  assert.equal(r.diff.missing[0].where, "at the bottom front left");
});

test("describeWhere without a total still names a corner — the parameter is optional", () => {
  assert.equal(describeWhere([[0, 0, 0]], [9, 9, 9]), "at the bottom front left");
});
