/**
 * Straightedge-and-compass constructions, all lattice-exact.
 *
 * THE TOPIC THIS BELONGS TO WAS BROADENED ON PURPOSE. It began as "the
 * parabola" and could never reach AGENTS.md §2.9's floor of ten: that
 * construction's only real parameter is `n`, bounded at 6 by the sheet and
 * excluding 3 (the method diagram's), and apex position is erased by the
 * scorer's normalisation — so four distinct exercises was the ceiling. The
 * answer was to widen the topic rather than bend the count.
 *
 * EVERY FAMILY HERE WAS LATTICE-CHECKED BEFORE IT WAS WRITTEN (§1.1), and the
 * check ruled things out as well as in:
 *
 *   perpendicular bisector, axis-aligned or 45 degrees, EVEN span   exact
 *   equal division, when the count divides the length                exact
 *   perpendicular from a point to an axis-aligned line               exact
 *   parallel through a point, slope 0 or +-1                         exact
 *   square erected on an axis-aligned side                           exact
 *   angle bisector, GENERAL angle            1 of 179 whole degrees  NO
 *   regular hexagon                          0 of 30 radii           NEVER
 *
 * So the right angle is the ONLY angle whose bisector lands on the grid (45
 * degrees is a lattice direction; 22.5 is not), and the hexagon — the classic
 * compass exercise — is Tier 2 beside the tangents and ellipses, for the same
 * reason isometric DRAWING is: its answer is irrational and the model cannot
 * express it.
 *
 * WHAT IS SCORED, AND WHY THE GIVEN FIGURE IS PART OF THE KEY. The canvas
 * starts empty, so a student must draw the given elements before they can
 * construct anything from them. The key therefore contains BOTH — the given
 * line and the result — exactly as the parabola's key contains the curve the
 * student is told to place themselves. Construction lines (arcs, rays) are
 * drawn with the `construction` type and stripped before comparison, which is
 * what makes the graded answer a definite set of segments rather than a matter
 * of drafting style.
 *
 * AN ACCEPTED LIMITATION, stated plainly. Nothing here can tell whether a
 * student constructed the answer or estimated it by eye: the scorer sees the
 * result, not the method. The parabola has always had that property too. It is
 * the §7.2 limitation in a new place, and it is fine for a practice tool.
 *
 * PURE. No I/O.
 */
import type { Primitive } from "../scoring/primitives.ts";

export type ConstructionSpec =
  /** Bisect AB perpendicularly. AB is axis-aligned or at 45 degrees, even span. */
  | { shape: "perp-bisector"; x1: number; y1: number; x2: number; y2: number; reach: number }
  /** Divide a horizontal segment into `parts` equal pieces, ticking each division. */
  | { shape: "equal-division"; x: number; y: number; length: number; parts: number; tick: number }
  /** Drop a perpendicular from a point onto a horizontal line. */
  | { shape: "perp-from-point"; x: number; y: number; length: number; px: number; py: number }
  /** Draw the line through a point parallel to a given one of slope 0, +1 or -1. */
  | { shape: "parallel-through-point"; x: number; y: number; length: number; slope: -1 | 0 | 1; px: number; py: number }
  /** Erect a square on a given horizontal side. */
  | { shape: "square-on-side"; x: number; y: number; side: number }
  /** Bisect a right angle. The only angle whose bisector is lattice-exact. */
  | { shape: "bisect-right-angle"; x: number; y: number; arm: number };

const seg = (x1: number, y1: number, x2: number, y2: number): Primitive =>
  ({ kind: "segment", type: "visible", x1, y1, x2, y2 });

function requireInteger(label: string, ...values: number[]): void {
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`${label} must be an integer, got ${v}`);
  }
}

/**
 * The answer key, DERIVED (AGENTS.md §7 — never hand-written).
 *
 * Throws rather than drawing something off-grid: `validate.ts` rejects a
 * non-integer primitive outright, so an off-grid key would make the correct
 * answer literally undrawable. Failing loudly at registration is the only
 * honest option.
 */
export function constructionKey(spec: ConstructionSpec): Primitive[] {
  switch (spec.shape) {
    case "perp-bisector": {
      const { x1, y1, x2, y2, reach } = spec;
      requireInteger("perp-bisector", x1, y1, x2, y2, reach);
      const dx = x2 - x1, dy = y2 - y1;
      const axisAligned = dx === 0 || dy === 0;
      const diagonal = Math.abs(dx) === Math.abs(dy);
      if (!axisAligned && !diagonal) {
        throw new Error("perp-bisector: only axis-aligned or 45-degree segments are lattice-exact");
      }
      if (dx % 2 !== 0 || dy % 2 !== 0) {
        throw new Error("perp-bisector: the span must be EVEN on both axes, or the midpoint leaves the grid");
      }
      const mx = x1 + dx / 2, my = y1 + dy / 2;
      // The perpendicular direction. For an axis-aligned segment that is the
      // other axis; for a 45-degree one it is the other diagonal. Both are
      // lattice directions, which is exactly what the check established.
      const [ux, uy] = axisAligned ? [dy === 0 ? 0 : 1, dy === 0 ? 1 : 0] : [dx / Math.abs(dx), -dy / Math.abs(dy)];
      return [
        seg(x1, y1, x2, y2),
        seg(mx - ux * reach, my - uy * reach, mx + ux * reach, my + uy * reach),
      ];
    }
    case "equal-division": {
      const { x, y, length, parts, tick } = spec;
      requireInteger("equal-division", x, y, length, parts, tick);
      if (parts < 2) throw new Error("equal-division: needs at least two parts");
      if (length % parts !== 0) {
        throw new Error(`equal-division: ${parts} does not divide ${length}, so the marks leave the grid`);
      }
      const step = length / parts;
      const out: Primitive[] = [seg(x, y, x + length, y)];
      for (let i = 1; i < parts; i++) {
        const px = x + i * step;
        out.push(seg(px, y - tick, px, y + tick));
      }
      return out;
    }
    case "perp-from-point": {
      const { x, y, length, px, py } = spec;
      requireInteger("perp-from-point", x, y, length, px, py);
      if (py === y) throw new Error("perp-from-point: the point is ON the line");
      if (px < x || px > x + length) {
        throw new Error("perp-from-point: the foot would fall outside the given line");
      }
      return [seg(x, y, x + length, y), seg(px, py, px, y)];
    }
    case "parallel-through-point": {
      const { x, y, length, slope, px, py } = spec;
      requireInteger("parallel-through-point", x, y, length, px, py);
      if (py - slope * px === y - slope * x) {
        throw new Error("parallel-through-point: the point lies ON the given line");
      }
      return [
        seg(x, y, x + length, y + slope * length),
        seg(px, py, px + length, py + slope * length),
      ];
    }
    case "square-on-side": {
      const { x, y, side } = spec;
      requireInteger("square-on-side", x, y, side);
      if (side <= 0) throw new Error("square-on-side: the side must be positive");
      return [
        seg(x, y, x + side, y),
        seg(x + side, y, x + side, y - side),
        seg(x + side, y - side, x, y - side),
        seg(x, y - side, x, y),
      ];
    }
    case "bisect-right-angle": {
      const { x, y, arm } = spec;
      requireInteger("bisect-right-angle", x, y, arm);
      if (arm <= 0) throw new Error("bisect-right-angle: the arms must be positive");
      // Arms along +x and UP the screen (screen y increases downward, so up is
      // -y). The bisector is the 45-degree diagonal between them, which is a
      // lattice direction — the only angle bisection that is.
      return [
        seg(x, y, x + arm, y),
        seg(x, y, x, y - arm),
        seg(x, y, x + arm, y - arm),
      ];
    }
  }
}
