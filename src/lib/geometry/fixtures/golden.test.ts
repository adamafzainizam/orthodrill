import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLDEN_PARTS } from "./golden.ts";
import { generateViews } from "../views.ts";
import { boundingBox, type Primitive } from "../../scoring/primitives.ts";
import type { KeyViews } from "../../scoring/assign.ts";

/**
 * Mirror a view's primitives across a vertical line through the bounding
 * box's horizontal centre — i.e. flip LEFT-RIGHT. Endpoint order is swapped
 * (x2 before x1) because mirroring reverses which endpoint sits leftmost.
 */
const hMirrorKey = (ps: Primitive[]) => {
  const b = boundingBox(ps);
  if (b === null) return "";
  return ps
    .map((p) =>
      p.kind === "circle"
        ? `c:${b.maxX - (p.cx - b.minX)},${p.cy},${p.r},${p.type}`
        : `s:${b.maxX - (p.x2 - b.minX)},${p.y2},${b.maxX - (p.x1 - b.minX)},${p.y1},${p.type}`,
    )
    .sort()
    .join("|");
};

/**
 * Mirror a view's primitives across a horizontal line through the bounding
 * box's vertical centre — i.e. flip TOP-BOTTOM. The companion to hMirrorKey:
 * a fixture that is asymmetric left-right can still be symmetric top-bottom,
 * and a mirror bug on that axis would sail through if only hMirrorKey were
 * checked. Endpoint order is swapped for the same reason as hMirrorKey.
 */
const vMirrorKey = (ps: Primitive[]) => {
  const b = boundingBox(ps);
  if (b === null) return "";
  return ps
    .map((p) =>
      p.kind === "circle"
        ? `c:${p.cx},${b.maxY - (p.cy - b.minY)},${p.r},${p.type}`
        : `s:${p.x2},${b.maxY - (p.y2 - b.minY)},${p.x1},${b.maxY - (p.y1 - b.minY)},${p.type}`,
    )
    .sort()
    .join("|");
};

const plainKey = (ps: Primitive[]) =>
  ps
    .map((p) =>
      p.kind === "circle"
        ? `c:${p.cx},${p.cy},${p.r},${p.type}`
        : `s:${p.x1},${p.y1},${p.x2},${p.y2},${p.type}`,
    )
    .sort()
    .join("|");

const VIEW_NAMES = ["front", "top", "side"] as const;

// The single most important test in this file. A fixture that is symmetric in
// any view, on either axis, cannot detect the mirror error these fixtures
// exist to catch — a mirror bug on the OTHER axis or in the OTHER view would
// pass every property test and sail through an under-checked fixture too.
//
// AMENDMENT (reviewer-flagged): the original version of this test checked
// only left-right asymmetry of the front view. That is not enough — a part
// symmetric in, say, the top view's vertical axis would let a mirror bug on
// that axis survive undetected. Every view, both directions, no exceptions.
test("every golden part is asymmetric in every view, in both directions", () => {
  for (const part of GOLDEN_PARTS) {
    const views: KeyViews = generateViews(part.solid);
    for (const viewName of VIEW_NAMES) {
      const ps = views[viewName];
      const plain = plainKey(ps);
      assert.notEqual(
        hMirrorKey(ps),
        plain,
        `${part.id} ${viewName} view is left-right symmetric and therefore verifies nothing`,
      );
      assert.notEqual(
        vMirrorKey(ps),
        plain,
        `${part.id} ${viewName} view is top-bottom symmetric and therefore verifies nothing`,
      );
    }
  }
});

test("every golden part cites a source", () => {
  for (const part of GOLDEN_PARTS) {
    assert.ok(part.source.length > 10, `${part.id} has no usable source`);
  }
});

test("every golden part generates without throwing", () => {
  for (const part of GOLDEN_PARTS) {
    const v = generateViews(part.solid);
    assert.ok(v.front.length > 0, `${part.id} front view is empty`);
    assert.ok(v.top.length > 0, `${part.id} top view is empty`);
    assert.ok(v.side.length > 0, `${part.id} side view is empty`);
  }
});

test("golden output is stable across runs", () => {
  for (const part of GOLDEN_PARTS) {
    assert.deepEqual(generateViews(part.solid), generateViews(part.solid));
  }
});
