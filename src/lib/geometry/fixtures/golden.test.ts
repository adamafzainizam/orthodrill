/**
 * WHICH TESTS DO WHAT — read this before trusting any test below to catch a
 * mirror bug.
 *
 * Only "the L-block's front view matches its hand-derived coordinates"
 * actually pins orientation. It compares the generator's output against
 * coordinates worked out by hand from the model, independently of the
 * generator, so a mirrored `suSign` or `svSign` changes the coordinates and
 * the test fails.
 *
 * The other four tests are REGRESSION-ONLY. Each checks a property that is
 * invariant under a global mirror, so none of them can detect one:
 *   - asymmetry-exists survives mirroring (a mirrored asymmetric shape is
 *     still asymmetric, just the other way)
 *   - citation-presence doesn't depend on geometry at all
 *   - non-empty/non-throwing doesn't depend on which way things point
 *   - run-to-run stability compares the generator against itself, not
 *     against a known-correct answer, so a consistently mirrored generator
 *     is still "stable"
 * This was found the hard way: an earlier round of this task flipped
 * `front.suSign` in viewspec.ts and confirmed that none of the four
 * regression tests failed. They still earn their place — they pin behaviour
 * against accidental change and are a precondition for the human review of
 * verification-sheet.html to be meaningful — but they are not a substitute
 * for a coordinate-pinning test, and this file must not be read as if they
 * were.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLDEN_PARTS } from "./golden.ts";
import { generateViews } from "../views.ts";
import { boundingBox, normalise, type Primitive } from "../../scoring/primitives.ts";
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
//
// NOTE: this test, like the three below it, is REGRESSION-ONLY — see the
// file header. It cannot by itself detect a mirror; it only enforces the
// precondition that makes the coordinate-pinning test below meaningful.
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

/**
 * Canonicalise a primitive to a comparable string, endpoints sorted so that
 * a segment stored (x2,y2)-(x1,y1) compares equal to (x1,y1)-(x2,y2) — same
 * ordering convention as `positionKey` in primitives.ts, but with `type`
 * included so a visible/hidden regression is caught too.
 */
const segKey = (p: Primitive): string => {
  const n = normalise(p);
  return n.kind === "circle"
    ? `c:${n.cx},${n.cy},${n.r},${n.type}`
    : `s:${n.x1},${n.y1},${n.x2},${n.y2},${n.type}`;
};

/**
 * THE test that actually pins orientation, not just regression. Every other
 * test in this file is invariant under a global mirror (see the file
 * header); this one is not, by construction.
 *
 * These coordinates were hand-derived from the model, independently of the
 * generator, then cross-checked against the generator's actual output
 * before being pinned here — see task-10-report.md, fix round 2, for the
 * full derivation. They were NOT read out of the generator and copied in,
 * which would just pin whatever the generator currently does, mirrored or
 * not.
 *
 * L-block: `subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 })`
 * — a 6x4x4 block with the top-left quarter (in x-z) removed through the
 * full depth (d=4 = the whole block). Front view: su=x (suSign +1),
 * sv=z (svSign -1), screen = (x, -z), then translated so the bounding box
 * sits at the origin (shift y by +4, since z ranges 0..4).
 *
 * Silhouette in model (x, z): material at x in [0,3) only for z in [0,2)
 * (short, LEFT); material at x in [3,6) for the full z in [0,4) (tall,
 * RIGHT) — the necessary consequence of removing the TOP-LEFT corner.
 * Mapped to screen and translated, that becomes:
 *
 *   (0,4)-(6,4)   bottom edge, full width
 *   (0,2)-(3,2)   top of the short LEFT portion
 *   (3,0)-(6,0)   top of the tall RIGHT portion
 *   (0,4)-(0,2)   left edge, short
 *   (3,2)-(3,0)   the step's vertical riser
 *   (6,4)-(6,0)   right edge, full height
 *
 * A mirror on suSign moves the tall part to the left — different
 * coordinates, test fails. A mirror on svSign puts the step at the
 * bottom instead of the top — different coordinates, test fails. Both were
 * verified experimentally (see task-10-report.md).
 */
test("the L-block's front view matches its hand-derived coordinates, not just its shape", () => {
  const part = GOLDEN_PARTS.find((p) => p.id === "L-block");
  assert.ok(part, "L-block fixture must exist for this test to mean anything");

  const front = generateViews(part!.solid).front;

  const expected = [
    { kind: "segment" as const, type: "visible" as const, x1: 0, y1: 4, x2: 6, y2: 4 },
    { kind: "segment" as const, type: "visible" as const, x1: 0, y1: 2, x2: 3, y2: 2 },
    { kind: "segment" as const, type: "visible" as const, x1: 3, y1: 0, x2: 6, y2: 0 },
    { kind: "segment" as const, type: "visible" as const, x1: 0, y1: 4, x2: 0, y2: 2 },
    { kind: "segment" as const, type: "visible" as const, x1: 3, y1: 2, x2: 3, y2: 0 },
    { kind: "segment" as const, type: "visible" as const, x1: 6, y1: 4, x2: 6, y2: 0 },
  ];

  assert.deepEqual(
    front.map(segKey).sort(),
    expected.map(segKey).sort(),
  );
});
