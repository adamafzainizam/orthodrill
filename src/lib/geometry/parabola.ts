/**
 * The parabola by the rectangle method — the first topic that shares nothing
 * with the solid model. No occupancy grid, no views, no isometric; a
 * construction is drawn directly on the sheet.
 *
 * THE CONSTRUCTION. Enclose the curve in a rectangle 2n wide and n^2 tall.
 * Divide the half-width into n equal parts and the height into n equal
 * parts. Rays from the apex to the height divisions, verticals from the
 * width divisions, and their intersections are points on the parabola.
 * Worked out algebraically, that intersection sits at (k, k^2) for
 * k = -n..n, offset from the apex — which is why h = n^2 rather than any
 * other height was chosen for the rectangle.
 *
 * LATTICE-EXACT BY CONSTRUCTION. This is the property the whole topic rests
 * on and the reason it was chosen over tangents or ellipses (design spec
 * §2): with this specific rectangle shape, every one of those intersections
 * lands on an integer coordinate, for every n. Do NOT generalise this to an
 * arbitrary rectangle height without re-running that check — most heights
 * put the points off the grid, and `validate.ts` rejects a non-integer
 * primitive outright, so the correct answer would become literally
 * undrawable.
 *
 * SCREEN Y INCREASES DOWNWARD. A parabola opening upward (the classic cup
 * shape, apex at the bottom) therefore has its arms at DECREASING screen y
 * as they rise away from the apex — see `point()` below. Getting the sign
 * backwards here is the same failure class as a mirrored isometric view: the
 * figure stays internally consistent (still symmetric, still lattice-exact)
 * and is simply wrong. Pinned by a positive test in parabola.test.ts that
 * checks the apex is the curve's screen-lowest point.
 *
 * The key is the curve only — segments joining consecutive points, as
 * "visible". The construction lines (rays and verticals) that produce those
 * points are deliberately NOT emitted here: the student draws them as
 * "construction" type and the scorer already strips that type before
 * comparing, which is what makes the graded answer a definite set of curve
 * segments rather than a matter of drafting style.
 *
 * PURE. No I/O. See AGENTS.md §2 constraint 3.
 */
import type { Primitive } from "../scoring/primitives.ts";

export type ParabolaSpec = {
  /** Rays/verticals per half of the rectangle. Rectangle is 2n wide, n^2 tall. */
  n: number;
  /** Sheet coordinates of the apex (the curve's lowest point on screen). */
  originX: number;
  originY: number;
};

function requireInteger(label: string, ...values: number[]): void {
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`${label} must be an integer, got ${v}`);
  }
}

function validate(spec: ParabolaSpec): void {
  requireInteger("parabola n", spec.n);
  requireInteger("parabola origin", spec.originX, spec.originY);
  if (spec.n <= 0) throw new Error(`parabola n must be positive, got ${spec.n}`);
}

/**
 * The curve point at horizontal offset k from the apex (k = -n..n).
 *
 * x steps by 1 per division, unconditionally: y increases downward, so the
 * upward-opening curve subtracts k^2 from the apex's y rather than adding it.
 */
function point(spec: ParabolaSpec, k: number): { x: number; y: number } {
  return { x: spec.originX + k, y: spec.originY - k * k };
}

/** The curve only, as segments joining consecutive lattice points. */
export function parabolaKey(spec: ParabolaSpec): Primitive[] {
  validate(spec);
  const { n } = spec;
  const segments: Primitive[] = [];
  for (let k = -n; k < n; k++) {
    const a = point(spec, k);
    const b = point(spec, k + 1);
    segments.push({ kind: "segment", type: "visible", x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }
  return segments;
}

/** The enclosing rectangle's size: 2n wide, n^2 tall. Origin-independent. */
export function parabolaBounds(spec: ParabolaSpec): { width: number; height: number } {
  requireInteger("parabola n", spec.n);
  if (spec.n <= 0) throw new Error(`parabola n must be positive, got ${spec.n}`);
  return { width: 2 * spec.n, height: spec.n * spec.n };
}
