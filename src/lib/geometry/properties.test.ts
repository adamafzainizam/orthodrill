import { test } from "node:test";
import assert from "node:assert/strict";
import { generateViews } from "./views.ts";
import { block, subtractBox, subtractCylinder, type Solid } from "./solid.ts";
import { boundingBox, type Primitive, type Segment } from "../scoring/primitives.ts";
import { buildOccupancy, sizeAlong } from "./occupancy.ts";
import { VIEW_SPECS } from "./viewspec.ts";
import { CENTRE_OVERSHOOT } from "./bore.ts";

/**
 * A pair of solids that isolate whether a notch cut across the line of
 * sight of a bore actually exposes it (fix-round Finding 4).
 *
 * The fix request specified `{ x: 2, y: 0, z: 0, w: 4, d: 3, h: 8 }` (and an
 * `x:0, w:2` control) on `subtractCylinder(block(8,8,8), "x", 6, 4, 2)`.
 * Those pass `validateSolid`, but produce a solid where the front view's
 * hidden-line output is BYTE IDENTICAL to the control — verified directly:
 * neither exposes anything. Root cause: the hole's near boundary (in the
 * front view's depth axis, y) sits at `u - r = 6 - 2 = 4`. `validateSolid`
 * forbids a box from reaching y=4 whenever its z-span overlaps the hole's
 * own z-footprint (z:2-6, since h:8 covers all of it) — the box is capped
 * at d:3, leaving the y=3 cell (the layer immediately bordering the hole)
 * always solid. That one cell alone is sufficient to keep the bore fully
 * occluded, regardless of x/w. This is a real interaction between
 * `validateSolid`'s tangency rule and `occludedAt`'s cell sampling, not a
 * generator bug: no box that overlaps the hole's z-footprint can legally
 * reach that boundary cell.
 *
 * The fix: narrow the box in z (h:3, spanning z:0-3) so it no longer
 * overlaps the hole's z-footprint (z:2-6) at all. That moves the clamped
 * point in `validateSolid`'s circle-vs-rectangle test off-axis, relaxing
 * the tangency bound enough that d:4 (reaching the boundary exactly)
 * becomes legal — see the arithmetic: clamped z becomes 3 (not 4), so the
 * allowed y reach is governed by `hypot(6 - y, 4 - 3) > 2`, satisfied at
 * y=4 (`hypot(2, 1) ≈ 2.236 > 2`). With that, the box fully clears the
 * "nearer than hole" region and a real difference appears.
 */
const notchOverBore = subtractBox(
  subtractCylinder(block(8, 8, 8), "x", 6, 4, 2),
  { x: 2, y: 0, z: 0, w: 4, d: 4, h: 3 },
);
const notchOffToSide = subtractBox(
  subtractCylinder(block(8, 8, 8), "x", 6, 4, 2),
  { x: 0, y: 0, z: 0, w: 2, d: 4, h: 3 },
);

/** Two through-holes on the same axis, well clear of each other and of validateSolid's overlap rule. */
const twoHolesSameAxis = subtractCylinder(
  subtractCylinder(block(12, 8, 4), "z", 3, 4, 1), "z", 9, 4, 1,
);

/** A box subtraction that sits above (not through) a separate through-hole. */
const boxAboveBore = subtractBox(
  subtractCylinder(block(8, 8, 4), "z", 4, 4, 2), { x: 0, y: 0, z: 2, w: 2, d: 2, h: 2 },
);

/** A small deterministic corpus. Deterministic so a failure is reproducible. */
function corpus(): Solid[] {
  const out: Solid[] = [block(6, 4, 2), block(4, 4, 4), block(8, 2, 6)];
  for (const [x, y, z] of [[0, 0, 2], [2, 0, 2], [0, 2, 0]]) {
    out.push(subtractBox(block(6, 6, 4), { x, y, z, w: 2, d: 2, h: 2 }));
  }
  out.push(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2));
  out.push(subtractCylinder(block(8, 8, 8), "y", 4, 4, 2));
  out.push(subtractCylinder(block(8, 8, 8), "x", 4, 4, 2));
  // Multi-feature solids, so the interaction logic bore.ts exists for is
  // actually exercised (fix-round Finding 4).
  out.push(notchOverBore, notchOffToSide, twoHolesSameAxis, boxAboveBore);
  return out;
}

test("each view's extent is bounded by the solid's own dimensions", () => {
  // The previous version of this test computed its bound FROM the same
  // primitives it was checking, so it held by construction for any finite
  // coordinates (fix-round Finding 2). Here the bound is derived
  // independently, from the occupancy grid and view spec, and both a lower
  // (>0) and upper bound are checked. A solid with no cylinder ops gets the
  // tight bound (`<= W`/`<= H`); one with cylinder ops gets a looser bound
  // that accounts for centre-line overshoot, since only centre lines are
  // allowed to extend past the block's own silhouette.
  for (const s of corpus()) {
    const views = generateViews(s);
    const occ = buildOccupancy(s);
    const hasCylinder = s.ops.some((op) => op.kind === "cylinder");
    for (const name of ["front", "top", "side"] as const) {
      const view = views[name];
      const spec = VIEW_SPECS[name];
      const w = sizeAlong(occ, spec.su);
      const h = sizeAlong(occ, spec.sv);
      const b = boundingBox(view);
      if (b === null) continue;
      const extentX = b.maxX - b.minX;
      const extentY = b.maxY - b.minY;
      assert.ok(extentX > 0, `${name}: zero-width view`);
      assert.ok(extentY > 0, `${name}: zero-height view`);
      const maxX = hasCylinder ? w + 2 * CENTRE_OVERSHOOT : w;
      const maxY = hasCylinder ? h + 2 * CENTRE_OVERSHOOT : h;
      assert.ok(extentX <= maxX, `${name}: width ${extentX} exceeds bound ${maxX}`);
      assert.ok(extentY <= maxY, `${name}: height ${extentY} exceeds bound ${maxY}`);
    }
  }
});

test("a solid with no internal features produces no hidden lines", () => {
  for (const s of [block(6, 4, 2), block(4, 4, 4), block(8, 2, 6)]) {
    const views = generateViews(s);
    for (const [name, view] of Object.entries(views)) {
      const hiddenCount = (view as Primitive[])
        .filter((p) => p.type === "hidden").length;
      assert.equal(hiddenCount, 0, `${name} of a plain block must have no hidden lines`);
    }
  }
});

test("hidden lines appear exactly where material buries them (positive control)", () => {
  // The negative test above passes trivially if hidden-line classification
  // is removed entirely, since a plain block emits zero hidden lines under
  // any implementation (fix-round Finding 1). This test fails under that
  // mutation: a buried through-hole's bore lines are known, exact counts.
  for (const [axis, circleView] of [["z", "top"], ["y", "front"], ["x", "side"]] as const) {
    const v = generateViews(subtractCylinder(block(8, 8, 8), axis, 4, 4, 2));
    for (const name of ["front", "top", "side"] as const) {
      if (name === circleView) continue;
      const hidden = v[name].filter((p) => p.type === "hidden").length;
      // The bore is fully buried (no other feature exposes it), so both
      // offset lines run the full length of the block: exactly 2 hidden
      // segments, not merely "at least one".
      assert.equal(hidden, 2, `${axis}-hole: ${name} must have exactly 2 hidden bore lines`);
    }
  }

  const notched = generateViews(
    subtractBox(block(6, 6, 4), { x: 0, y: 2, z: 0, w: 2, d: 2, h: 2 }),
  );
  const anyHidden = (["front", "top", "side"] as const)
    .some((name) => notched[name].some((p) => p.type === "hidden"));
  assert.ok(anyHidden, "a notch cut into a block must produce at least one hidden line somewhere");
});

test("a through-hole yields exactly one circle and exactly six bore-view segments", () => {
  for (const [axis, circleView] of [["z", "top"], ["y", "front"], ["x", "side"]] as const) {
    const v = generateViews(subtractCylinder(block(8, 8, 8), axis, 4, 4, 2));
    for (const name of ["front", "top", "side"] as const) {
      const circles = v[name].filter((p) => p.kind === "circle").length;
      assert.equal(circles, name === circleView ? 1 : 0,
        `${axis}-hole: ${name} circle count`);
      if (name === circleView) continue;
      const bore = v[name].filter(
        (p): p is Segment => p.kind === "segment" && p.type !== "centre",
      );
      // Exactly 4 outline edges + 2 buried bore lines. `>= 2` (the previous
      // assertion) let an extra symmetric bore pair through undetected
      // (fix-round Finding 3).
      assert.equal(bore.length, 6, `${axis}-hole: ${name} needs exactly 6 non-centre segments`);
    }
  }
});

test("every circular feature carries exactly the right number of centre lines", () => {
  for (const [axis, circleView] of [["z", "top"], ["y", "front"], ["x", "side"]] as const) {
    const v = generateViews(subtractCylinder(block(8, 8, 8), axis, 4, 4, 2));
    for (const name of ["front", "top", "side"] as const) {
      const centres = v[name].filter((p) => p.type === "centre").length;
      // The circle view carries both arms of the centre cross (2); each
      // bore view carries the one centre line running the bore's length
      // (1). `>= 1` (the previous assertion) let a dropped cross arm
      // through undetected (fix-round Finding 3).
      assert.equal(centres, name === circleView ? 2 : 1,
        `${axis}-hole: ${name} centre-line count`);
    }
  }
});

test("a solid symmetric left-to-right gives a symmetric front view", () => {
  // A centred hole in a centred block. NOTE: this cannot detect a MIRRORED
  // generator, which is precisely why golden fixtures exist. See design §8.
  const v = generateViews(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2));
  const b = boundingBox(v.front)!;
  const mirrored = v.front.map((p) => p.kind === "circle"
    ? { ...p, cx: b.maxX - (p.cx - b.minX) }
    : { ...p, x1: b.maxX - (p.x2 - b.minX), x2: b.maxX - (p.x1 - b.minX) });
  const key = (ps: Primitive[]) => ps
    .map((p) => p.kind === "circle"
      ? `c:${p.cx},${p.cy},${p.r},${p.type}`
      : `s:${p.x1},${p.y1},${p.x2},${p.y2},${p.type}`)
    .sort().join("|");
  assert.equal(key(mirrored as Primitive[]), key(v.front));
});

test("a notch cut in front of a bore exposes more of it than an equal notch off to the side", () => {
  // Segment COUNT is the wrong measure here: run-length merging in bore.ts
  // splits one long hidden run into a shorter hidden run either side of an
  // exposed (visible) gap when a notch exposes the middle of a bore line —
  // which INCREASES segment count even as exposure genuinely increases.
  // Total hidden LENGTH is translation-invariant and moves monotonically:
  // it strictly decreases as more of the bore becomes visible. (fix-round
  // Finding 4.)
  const hiddenLength = (view: Primitive[]) => view
    .filter((p): p is Segment => p.kind === "segment" && p.type === "hidden")
    .reduce((sum, s) => sum + Math.hypot(s.x2 - s.x1, s.y2 - s.y1), 0);

  const overBore = hiddenLength(generateViews(notchOverBore).front);
  const offToSide = hiddenLength(generateViews(notchOffToSide).front);
  assert.ok(overBore < offToSide,
    `a notch directly in front of the bore (hidden length ${overBore}) must expose more of it ` +
    `than an equally-sized notch off to the side (hidden length ${offToSide})`);
});

test("generating the same solid twice gives identical output", () => {
  for (const s of corpus()) {
    assert.deepEqual(generateViews(s), generateViews(s));
  }
});
