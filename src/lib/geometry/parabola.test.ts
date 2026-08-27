/**
 * The parabola generator — the first topic that shares nothing with the solid
 * model. See AGENTS.md §5.2 and the design spec §2 for why this construction
 * was chosen: rectangle 2n wide by n^2 tall gives points (k, k^2) for
 * k = -n..n, which land on integer grid coordinates EXACTLY, for every n.
 *
 * The mirror guard (apex-is-lowest-on-screen) matters here exactly as it does
 * for the isometric generator: a vertically flipped parabola is internally
 * consistent and completely wrong, and no property test that only checks
 * shape (symmetry, point count) would catch it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { parabolaKey, parabolaBounds, type ParabolaSpec } from "./parabola.ts";
import type { Segment } from "../scoring/primitives.ts";

/** n values this topic intends to ship — see AGENTS.md-style sheet-fit note below. */
const SHIP_NS = [3, 4, 5, 6];

const SHEET = { width: 48, height: 40 };

function endpoints(ps: Segment[]): { x: number; y: number }[] {
  // Every consecutive-pair segment contributes its start point; the very
  // last segment's end point closes off the chain.
  const pts = ps.map((s) => ({ x: s.x1, y: s.y1 }));
  const last = ps[ps.length - 1];
  pts.push({ x: last.x2, y: last.y2 });
  return pts;
}

test("every coordinate of every primitive is an integer", () => {
  for (const n of SHIP_NS) {
    const spec: ParabolaSpec = { n, originX: 24, originY: 38 };
    const ps = parabolaKey(spec) as Segment[];
    assert.ok(ps.length > 0);
    for (const s of ps) {
      assert.equal(s.kind, "segment");
      for (const v of [s.x1, s.y1, s.x2, s.y2]) {
        assert.ok(Number.isInteger(v), `expected integer, got ${v}`);
      }
    }
  }
});

test("the curve passes through the expected (k, k^2) positions, derived independently", () => {
  const n = 4;
  const originX = 20;
  const originY = 30;
  const spec: ParabolaSpec = { n, originX, originY };
  const ps = parabolaKey(spec) as Segment[];
  const pts = endpoints(ps);

  // Independent derivation via ray/vertical intersection geometry — NOT the
  // closed-form loop the module runs, but the textbook construction itself.
  //
  // Rectangle-local coordinates: base AB along rect-y=0 from A=(0,0) to
  // B=(2n,0); apex/vertex V is the midpoint of the base, V=(n,0); side AD
  // (above A) rises to height n^2, divided into n equal parts labelled from
  // A: the m-th division sits at (0, n*m) for m=0..n (m=n is D itself).
  // Half-base AV is divided into n equal parts too, but labelled by distance
  // FROM THE APEX V (not from A) — division m sits at rect-x = n - m — which
  // is what pairs a base division with the height division of the SAME m:
  // the construction draws a ray from V to the m-th height division, and a
  // vertical through the m-th base division; their crossing is a curve
  // point.
  //
  // Ray V=(n,0) -> (0, n*m), parametrised t in [0,1]:
  // (x, y) = (n - t*n, t*n*m). Vertical: rect-x = n - m. Solving
  // n - t*n = n - m gives t = m/n, so rect-y = (m/n)*n*m = m^2.
  //
  // Sanity-checked at both ends before trusting it: m=0 gives rect-x=n=V,
  // rect-y=0 — the apex itself, height 0, as it must be. m=n gives
  // rect-x=0=A's x, rect-y=n^2 — exactly D's height, so the curve reaches
  // the rectangle's top corner at the construction's extreme division,
  // which is the other fixed point the construction is built to pass
  // through. Both match independently of the k^2 formula being tested.
  //
  // rect-y = m^2, with m the distance from the apex, is therefore exactly
  // k^2 for k = the signed offset from the apex (negative toward A,
  // positive toward B) — the fact under test, not assumed going in.
  for (let m = 0; m <= n; m++) {
    const rectY = m * m;
    for (const k of [-m, m]) {
      const expected = { x: originX + k, y: originY - rectY };
      assert.ok(
        pts.some((p) => p.x === expected.x && p.y === expected.y),
        `missing point for k=${k}: expected (${expected.x}, ${expected.y}), got ${JSON.stringify(pts)}`,
      );
    }
  }
});

test("the figure is symmetric about the apex's x", () => {
  const spec: ParabolaSpec = { n: 5, originX: 24, originY: 38 };
  const ps = parabolaKey(spec) as Segment[];
  const pts = endpoints(ps);
  for (const p of pts) {
    const mirroredX = 2 * spec.originX - p.x;
    assert.ok(
      pts.some((q) => q.x === mirroredX && q.y === p.y),
      `no mirror partner for (${p.x}, ${p.y})`,
    );
  }
});

test("the apex is the lowest point of the curve on screen (greatest y)", () => {
  const spec: ParabolaSpec = { n: 5, originX: 24, originY: 38 };
  const ps = parabolaKey(spec) as Segment[];
  const pts = endpoints(ps);
  const maxY = Math.max(...pts.map((p) => p.y));
  assert.equal(maxY, spec.originY);
  const apexPoints = pts.filter((p) => p.y === maxY);
  assert.ok(apexPoints.some((p) => p.x === spec.originX));
  // every other point must be strictly ABOVE the apex on screen (smaller y),
  // never below it -- this is the mirror guard.
  for (const p of pts) {
    if (p.x === spec.originX && p.y === spec.originY) continue;
    assert.ok(p.y < spec.originY, `point (${p.x}, ${p.y}) is not above the apex`);
  }
});

test("every shipped n fits inside the 48x40 sheet, apex near the bottom edge", () => {
  for (const n of SHIP_NS) {
    const originX = 24;
    const originY = SHEET.height - 1; // apex placed one unit above the bottom edge
    const spec: ParabolaSpec = { n, originX, originY };
    const bounds = parabolaBounds(spec);
    assert.ok(originX - bounds.width / 2 >= 0, `n=${n} runs off the left edge`);
    assert.ok(originX + bounds.width / 2 <= SHEET.width, `n=${n} runs off the right edge`);
    assert.ok(originY - bounds.height >= 0, `n=${n} runs off the top edge`);
    assert.ok(originY <= SHEET.height, `n=${n} apex runs off the bottom edge`);

    const ps = parabolaKey(spec) as Segment[];
    for (const s of ps) {
      for (const [x, y] of [[s.x1, s.y1], [s.x2, s.y2]]) {
        assert.ok(x >= 0 && x <= SHEET.width, `n=${n} point x=${x} outside sheet`);
        assert.ok(y >= 0 && y <= SHEET.height, `n=${n} point y=${y} outside sheet`);
      }
    }
  }
});

test("output is deterministic", () => {
  const spec: ParabolaSpec = { n: 4, originX: 24, originY: 38 };
  const a = parabolaKey(spec);
  const b = parabolaKey(spec);
  assert.deepEqual(a, b);
});

test("the key contains no construction-type primitives", () => {
  const spec: ParabolaSpec = { n: 4, originX: 24, originY: 38 };
  const ps = parabolaKey(spec) as Segment[];
  assert.ok(ps.length > 0);
  for (const s of ps) {
    assert.notEqual(s.type, "construction");
    assert.equal(s.type, "visible");
  }
});

test("parabolaBounds reports the exact rectangle dimensions: 2n wide, n^2 tall", () => {
  for (const n of SHIP_NS) {
    const bounds = parabolaBounds({ n, originX: 0, originY: 0 });
    assert.equal(bounds.width, 2 * n);
    assert.equal(bounds.height, n * n);
  }
});
