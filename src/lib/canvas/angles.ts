/**
 * Angles between the line being drawn and the lines already on the sheet.
 *
 * WHY THIS EXISTS. On this grid a segment can only make certain angles: the
 * multiples of 45 are exact and nothing else is. `tan 60 = sqrt 3`, so no pair
 * of lattice points sits at 60 degrees — the nearest within 12 units is
 * 60.2551. A readout is therefore not a convenience but the only way a student
 * learns their line is not the angle they intended.
 *
 * PURE. No I/O, no DOM, no framework imports. See AGENTS.md §8.
 */
import type { Point } from "./coords.ts";
import type { Primitive, Segment } from "../scoring/primitives.ts";

const DEG = 180 / Math.PI;

export type Interaction = {
  kind: "corner" | "crossing";
  /**
   * Where to draw the label. A crossing point is often NOT a lattice point;
   * that is fine, an Interaction is chrome and never enters the drawing.
   */
  at: Point;
  degrees: number;
  exact: boolean;
};

const same = (p: Point, q: Point): boolean => p.x === q.x && p.y === q.y;

/**
 * The pending line's own angle, in [0,180), measured as it LOOKS on screen.
 *
 * Grid y increases DOWNWARD, so dy is negated: a segment going up and to the
 * right reads 45, not -45. Reported for the LINE rather than the ray, because
 * a student thinks "that line is at 45", not "that ray is at 225".
 */
export function headingOf(from: Point, to: Point): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  let a = Math.atan2(-dy, dx) * DEG;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  // Negating a positive zero gives NEGATIVE zero, and atan2(-0, dx) carries it
  // through: a due-right line would render as "-0.0°". `-0 < 0` is false, so
  // the branch above never catches it. Normalise it away here rather than at
  // every call site.
  return a === 0 ? 0 : a;
}

/** The true corner at `vertex` between the rays to `a` and `b`, in [0,180]. */
export function cornerAngle(a: Point, vertex: Point, b: Point): number {
  const ux = a.x - vertex.x, uy = a.y - vertex.y;
  const vx = b.x - vertex.x, vy = b.y - vertex.y;
  return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * DEG);
}

/**
 * Is the angle between two integer vectors an exact multiple of 45?
 *
 * Decided in INTEGER arithmetic — never by comparing a float against 45.0.
 * The angle is a multiple of 90 iff dot or cross is zero, and an odd multiple
 * of 45 iff |dot| == |cross|. Both are exact tests on integers, so an angle
 * that only looks like 45 to six decimal places is correctly reported as not.
 */
export function isExactAngle(ux: number, uy: number, vx: number, vy: number): boolean {
  const dot = ux * vx + uy * vy;
  const cross = ux * vy - uy * vx;
  return dot === 0 || cross === 0 || Math.abs(dot) === Math.abs(cross);
}

/** The acute member of the four angles at a crossing, in [0,90]. */
function acuteBetween(ux: number, uy: number, vx: number, vy: number): number {
  const a = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * DEG);
  return a > 90 ? 180 - a : a;
}

/**
 * Where two segments meet, or null. Endpoints are INCLUDED, so a T-junction —
 * one line's endpoint landing on another's interior — counts. A shared
 * endpoint is handled as a corner before this is ever called, so it cannot
 * reach here.
 */
function meetingPoint(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (den === 0) return null; // parallel or collinear: no single meeting point
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

const isSegment = (p: Primitive): p is Segment => p.kind === "segment";

/**
 * Every interaction between the pending line and the segments already drawn.
 *
 * CIRCLES ARE SKIPPED. The angle between a line and a circle is against the
 * tangent at the intersection, which is a different calculation and was not
 * asked for. CONSTRUCTION LINES ARE INCLUDED: the mitre line and the
 * projection lines are exactly what a student measures against.
 */
export function interactionsWith(
  from: Point, to: Point, ps: readonly Primitive[],
): Interaction[] {
  if (same(from, to)) return [];
  const out: Interaction[] = [];

  for (const s of ps.filter(isSegment)) {
    const a: Point = { x: s.x1, y: s.y1 };
    const b: Point = { x: s.x2, y: s.y2 };

    // A shared endpoint is a real corner with one unambiguous angle.
    let vertex: Point | null = null;
    let pendOther: Point = to;
    let segOther: Point = b;
    if (same(from, a)) { vertex = a; pendOther = to; segOther = b; }
    else if (same(from, b)) { vertex = b; pendOther = to; segOther = a; }
    else if (same(to, a)) { vertex = a; pendOther = from; segOther = b; }
    else if (same(to, b)) { vertex = b; pendOther = from; segOther = a; }

    if (vertex !== null) {
      out.push({
        kind: "corner",
        at: vertex,
        degrees: cornerAngle(pendOther, vertex, segOther),
        exact: isExactAngle(
          pendOther.x - vertex.x, pendOther.y - vertex.y,
          segOther.x - vertex.x, segOther.y - vertex.y,
        ),
      });
      continue;
    }

    const at = meetingPoint(from, to, a, b);
    if (at === null) continue;
    const ux = to.x - from.x, uy = to.y - from.y;
    const vx = b.x - a.x, vy = b.y - a.y;
    out.push({
      kind: "crossing",
      at,
      degrees: acuteBetween(ux, uy, vx, vy),
      exact: isExactAngle(ux, uy, vx, vy),
    });
  }

  return out;
}
