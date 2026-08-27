import { test } from "node:test";
import assert from "node:assert/strict";
import { isometricDimensions, type IsoDim } from "./isodims.ts";
import { block, subtractBox, subtractCylinder } from "./solid.ts";
import { isometricView } from "./isometric.ts";
import type { Solid } from "./solid.ts";
import type { IsoPrimitive } from "./isotypes.ts";
import { listDrillIds, getDrill } from "../../drills/registry.ts";

/**
 * POSITIVE CONTROL for the bounding-box check below: a dimension whose line
 * sits in the dead centre of the block must be REJECTED by the same
 * predicate the real assertion uses, or that assertion is checking nothing.
 */
function pointStrictlyInside(bbox: BBox, x: number, y: number): boolean {
  return x > bbox.minX && x < bbox.maxX && y > bbox.minY && y < bbox.maxY;
}

type BBox = { minX: number; maxX: number; minY: number; maxY: number };

/** The picture's real projected bounding box, computed the same way
 *  Pictorial.tsx does from isometricView's own output — independent of
 *  isodims.ts, which never calls isometricView at all. */
function pictureBBox(primitives: readonly IsoPrimitive[]): BBox {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of primitives) {
    if (p.kind === "iso-line") { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
    else if (p.kind === "iso-face") { for (const q of p.points) { xs.push(q[0]); ys.push(q[1]); } }
    else { xs.push(p.cx - p.rx, p.cx + p.rx); ys.push(p.cy - p.rx, p.cy + p.rx); }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

function dimPoints(d: IsoDim): [number, number][] {
  const pts: [number, number][] = [
    [d.line.x1, d.line.y1], [d.line.x2, d.line.y2],
    [d.labelAt.x, d.labelAt.y],
  ];
  for (const arr of d.arrows) for (const p of arr) pts.push(p);
  return pts;
}

/**
 * Perpendicular distance from a point to the INFINITE line through a
 * dimension line's two endpoints — computed fresh here with the standard
 * point-to-line formula, not by reusing anything from isodims.ts, so this
 * genuinely checks "does the label sit on the stroke" rather than restating
 * whatever offset the module happened to apply.
 */
function distanceToLine(px: number, py: number, seg: IsoDim["line"]): number {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len = Math.hypot(dx, dy) || 1;
  return Math.abs((py - seg.y1) * dx - (px - seg.x1) * dy) / len;
}

test("positive control: the interior-point predicate actually rejects an interior point", () => {
  const bbox: BBox = { minX: 0, maxX: 10, minY: 0, maxY: 10 };
  assert.ok(pointStrictlyInside(bbox, 5, 5), "a point in the dead centre must read as inside");
  assert.ok(!pointStrictlyInside(bbox, 0, 5), "a point exactly on the boundary must not read as inside");
  assert.ok(!pointStrictlyInside(bbox, -1, 5), "a point outside must not read as inside");
});

test("every drill's solid produces dimensions", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    const dims = isometricDimensions(drill.solid);
    assert.ok(dims.length > 0, `${id} produced no dimensions`);
  }
});

test("a base block of a known size yields exactly three overall dimensions with the expected figures", () => {
  const solid = block(6, 4, 9);
  const dims = isometricDimensions(solid);
  assert.equal(dims.length, 3);
  const labels = dims.map((d) => d.label).sort();
  // Figures derived independently from the block() call above, not from
  // isodims.ts's own arithmetic: 1 grid unit = 10 mm by convention.
  assert.deepEqual(labels, ["40", "60", "90"].sort());
});

test("a box op's cut is sized and located along every axis it does not fully span", () => {
  // Independently derived from the op's own numbers, not by recomputing what
  // isodims.ts computes: base 6x4x4, a step of w=2,d=4,h=2 starting at x=4,z=2.
  // The d axis is fully spanned (4 == base.d), so it needs no dimension at
  // all. The x and z axes are each partially spanned, and neither starts at
  // its axis's origin, so each contributes a position AND a size figure:
  //   overall:      60 mm (w), 40 mm (d), 40 mm (h)
  //   x: position   40 mm (0..4), size 20 mm (w=2)
  //   z: position   20 mm (0..2), size 20 mm (h=2)
  // -> one 60, three 40s, three 20s, seven dimensions total.
  const solid = subtractBox(block(6, 4, 4), { x: 4, y: 0, z: 2, w: 2, d: 4, h: 2 });
  const dims = isometricDimensions(solid);
  assert.equal(dims.length, 7);
  const labels = dims.map((d) => d.label);
  assert.equal(labels.filter((l) => l === "60").length, 1);
  assert.equal(labels.filter((l) => l === "40").length, 3);
  assert.equal(labels.filter((l) => l === "20").length, 3);
});

test("a flush box op needs no position figure, only a size figure per axis", () => {
  // corner-cut: base 8x4x4, notch w=2,d=2,h=4 at the origin. Both cut axes
  // start at 0 (flush with the block's own edge), so no position dimension
  // is needed on either — only their sizes. The h axis is fully spanned
  // (4 == base.h) so it is skipped entirely.
  const solid = subtractBox(block(8, 4, 4), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 4 });
  const dims = isometricDimensions(solid);
  // 3 overall + size-x + size-y = 5. No "0 mm" position figure anywhere.
  assert.equal(dims.length, 5);
  assert.ok(!dims.some((d) => d.label === "0"), "a flush cut must not carry a zero-length position figure");
  const sizeLabels = dims.map((d) => d.label).filter((l) => l === "20");
  assert.equal(sizeLabels.length, 2, "expected the notch's two 20 mm sizes (w=2 and d=2, both *10mm)");
});

test("a solid with a cylinder yields a diameter dimension carrying the diameter symbol and figure", () => {
  // r=2 grid units -> diameter 4 units -> 40 mm, independent of how
  // isodims.ts phrases it internally.
  const solid = subtractCylinder(block(8, 6, 3), "z", 3, 3, 2);
  const dims = isometricDimensions(solid);
  const diameterDims = dims.filter((d) => d.label.startsWith("⌀"));
  assert.equal(diameterDims.length, 1);
  assert.equal(diameterDims[0].label, "⌀40");
});

test("a cylinder's centre is located from the origin along both axes perpendicular to its own", () => {
  // axis z -> perpendicular axes are x and y (solid.ts's own u/v convention).
  // u=3 -> 30mm, v=3 -> 30mm. Height is 5 (-> 50mm) specifically so the
  // overall-height figure cannot coincidentally collide with these two.
  const solid = subtractCylinder(block(8, 6, 5), "z", 3, 3, 2);
  const dims = isometricDimensions(solid);
  const thirty = dims.filter((d) => d.label === "30");
  assert.equal(thirty.length, 2, "expected two 30 mm locating figures, one per plane axis");
});

test("no dimension's line, arrows or label falls inside the picture's own projected silhouette", () => {
  const drills: Solid[] = [
    block(6, 4, 4),
    subtractBox(block(6, 4, 4), { x: 4, y: 0, z: 2, w: 2, d: 4, h: 2 }),
    subtractBox(block(8, 4, 4), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 4 }),
    subtractCylinder(block(8, 6, 3), "z", 3, 3, 2),
    subtractCylinder(subtractBox(block(8, 6, 4), { x: 0, y: 4, z: 3, w: 8, d: 2, h: 1 }), "y", 2, 1, 1),
  ];
  for (const solid of drills) {
    const bbox = pictureBBox(isometricView(solid));
    const dims = isometricDimensions(solid);
    for (const d of dims) {
      for (const [x, y] of dimPoints(d)) {
        assert.ok(
          !pointStrictlyInside(bbox, x, y),
          `a dimension's line/arrow/label point (${x}, ${y}) falls inside the silhouette's `
          + `bounding box [${bbox.minX}, ${bbox.maxX}] x [${bbox.minY}, ${bbox.maxY}]`,
        );
      }
    }
  }
});

test("REGRESSION: no label sits on its own dimension line", () => {
  // The bug a real render caught: labelAt was centred exactly on the line,
  // so the stroke ran through the glyphs. A label centred on its own line
  // has distance 0 from it; anything clearly off the line is a real fix.
  const drills: Solid[] = [
    block(6, 4, 4),
    subtractBox(block(6, 4, 4), { x: 4, y: 0, z: 2, w: 2, d: 4, h: 2 }),
    subtractCylinder(subtractBox(block(8, 6, 4), { x: 0, y: 4, z: 3, w: 8, d: 2, h: 1 }), "y", 2, 1, 1),
  ];
  for (const solid of drills) {
    for (const d of isometricDimensions(solid)) {
      const dist = distanceToLine(d.labelAt.x, d.labelAt.y, d.line);
      assert.ok(dist > 0.05, `label "${d.label}" sits only ${dist} from its own dimension line`);
    }
  }
});

test("REGRESSION: successive dimensions sharing an axis are staggered far enough apart to read", () => {
  // stepped-plate-bore's solid has four z-family dimensions (overall height,
  // the step's position and size, and the bore's z-locating figure) — the
  // exact case a real render showed running together. Identify the z-family
  // by its anchor (only z produces "end") and check the pushed coordinate
  // (line.x1, since z's family pushes projected u) is spread out enough that
  // two ~11px-tall labels at adjacent offsets cannot overlap. 0.5 projection
  // units is a generic floor, not the module's own stagger constant restated.
  const solid = subtractCylinder(
    subtractBox(block(8, 6, 4), { x: 0, y: 4, z: 3, w: 8, d: 2, h: 1 }), "y", 2, 1, 1,
  );
  const zFamily = isometricDimensions(solid).filter((d) => d.labelAnchor === "end");
  assert.equal(zFamily.length, 4, "expected all four z-family dimensions for this solid");
  const offsets = zFamily.map((d) => d.line.x1).sort((a, b) => a - b);
  for (let i = 1; i < offsets.length; i++) {
    assert.ok(
      offsets[i] - offsets[i - 1] >= 0.5,
      `z-family dimensions at ${offsets[i - 1]} and ${offsets[i]} are only ${offsets[i] - offsets[i - 1]} apart`,
    );
  }
});

test("output is deterministic: the same solid twice gives an identical result", () => {
  const a = subtractCylinder(
    subtractBox(block(8, 6, 4), { x: 0, y: 4, z: 3, w: 8, d: 2, h: 1 }),
    "y", 2, 1, 1,
  );
  const b = subtractCylinder(
    subtractBox(block(8, 6, 4), { x: 0, y: 4, z: 3, w: 8, d: 2, h: 1 }),
    "y", 2, 1, 1,
  );
  assert.deepEqual(isometricDimensions(a), isometricDimensions(b));
});

test("every drill's dimensions are deterministic run to run", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    assert.deepEqual(isometricDimensions(drill.solid), isometricDimensions(drill.solid));
  }
});
