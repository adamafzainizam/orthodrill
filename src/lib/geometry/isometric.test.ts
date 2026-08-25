import { test } from "node:test";
import assert from "node:assert/strict";
import { isometricView } from "./isometric.ts";
import { isoEdges } from "./isoedges.ts";
import { buildOccupancy } from "./occupancy.ts";
import { block, subtractBox, subtractCylinder } from "./solid.ts";
import type { IsoPrimitive } from "./isotypes.ts";

const kinds = (ps: IsoPrimitive[], k: IsoPrimitive["kind"]) => ps.filter((p) => p.kind === k);

test("a plain block yields fills and strokes and no ellipse", () => {
  const v = isometricView(block(6, 4, 2));
  assert.ok(kinds(v, "iso-face").length > 0, "must emit fills");
  assert.ok(kinds(v, "iso-line").length > 0, "must emit strokes");
  assert.equal(kinds(v, "iso-ellipse").length, 0);
});

test("a through-hole adds exactly one ellipse", () => {
  const v = isometricView(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2));
  assert.equal(kinds(v, "iso-ellipse").length, 1);
});

test("two holes add two ellipses", () => {
  const v = isometricView(
    subtractCylinder(subtractCylinder(block(12, 8, 4), "z", 3, 4, 1), "z", 9, 4, 1),
  );
  assert.equal(kinds(v, "iso-ellipse").length, 2);
});

// The whole reason isoBore returns a depth. Appending ellipses at the end would
// draw a bore rim on top of whatever occludes its face. For a z-hole in a plain
// block the rim sits on the top face, whose depth is nowhere near the maximum,
// so fills MUST still follow it.
test("the ellipse is interleaved by depth, not appended at the end", () => {
  const v = isometricView(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2));
  const at = v.findIndex((p) => p.kind === "iso-ellipse");
  assert.ok(at >= 0, "the ellipse must be present");
  const facesAfter = v.slice(at + 1).filter((p) => p.kind === "iso-face").length;
  assert.ok(facesAfter > 0,
    `nearer fills must follow the ellipse; found ${facesAfter} after index ${at}`);
});

// Part 1's compatibility requirement, pinned so it cannot silently regress.
test("isoEdges with no extras is unchanged from its one-argument form", () => {
  const o = buildOccupancy(block(4, 3, 2));
  assert.deepEqual(isoEdges(o, []), isoEdges(o));
});

// Same rule the views generator applies: refuse what v1 cannot model rather
// than emit a confident picture of something wrong.
test("an invalid solid is rejected rather than drawn", () => {
  const bad = subtractCylinder(subtractCylinder(block(8, 8, 4), "z", 3, 4, 2), "z", 4, 4, 2);
  assert.throws(() => isometricView(bad), /overlap/i);
});

test("every primitive carries an isometric discriminant", () => {
  const v = isometricView(subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 }));
  for (const p of v) {
    assert.ok(p.kind === "iso-face" || p.kind === "iso-line" || p.kind === "iso-ellipse", p.kind);
  }
});

test("output is stable across runs", () => {
  const s = subtractCylinder(block(8, 8, 4), "z", 4, 4, 2);
  assert.deepEqual(isometricView(s), isometricView(s));
});
