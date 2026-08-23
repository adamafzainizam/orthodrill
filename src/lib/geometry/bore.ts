/**
 * Project a cylindrical through-hole.
 *
 * Holes never enter the occupancy grid, because rasterising one would staircase
 * it and make the exact Circle primitive unemittable. They are projected
 * analytically here instead, and consult the grid only to ask what lies in front
 * of them.
 *
 * Down the axis: one circle and a centre cross. In the other two views: two bore
 * lines spanning the block, plus a centre line along the axis. Bore-line
 * visibility is asked of the grid rather than reasoned about, because a notch
 * cut in front of a bore exposes it and no per-feature rule would know that.
 *
 * Output is in MODEL LATTICE coordinates. views.ts applies the screen mapping.
 *
 * PURE. No I/O.
 */
import { sizeAlong, type Occupancy } from "./occupancy.ts";
import type { ViewSpec } from "./viewspec.ts";
import type { Axis, CylinderOp } from "./solid.ts";
import type { Primitive } from "../scoring/primitives.ts";

/** How far a centre line extends past the feature it marks. */
export const CENTRE_OVERSHOOT = 2;

/** The two axes perpendicular to `axis`, in x -> y -> z order. */
function planeAxes(axis: Axis): [Axis, Axis] {
  const all: Axis[] = ["x", "y", "z"];
  const [a, b] = all.filter((x) => x !== axis);
  return [a, b];
}

/** The hole's centre expressed as a full model coordinate on the two plane axes. */
function centreOn(op: CylinderOp, axis: Axis): number {
  const [pu, pv] = planeAxes(op.axis);
  if (axis === pu) return op.u;
  if (axis === pv) return op.v;
  throw new Error(`axis ${axis} is the hole axis, not a plane axis`);
}

const seg = (
  x1: number, y1: number, x2: number, y2: number, type: "visible" | "hidden" | "centre",
): Primitive => ({ kind: "segment", type, x1, y1, x2, y2 });

export function borePrimitives(
  op: CylinderOp, o: Occupancy, spec: ViewSpec,
): Primitive[] {
  // Looking straight down the hole: a circle plus a centre cross.
  if (spec.depth === op.axis) {
    const cu = centreOn(op, spec.su);
    const cv = centreOn(op, spec.sv);
    const reach = op.r + CENTRE_OVERSHOOT;
    return [
      { kind: "circle", type: "visible", cx: cu, cy: cv, r: op.r },
      seg(cu - reach, cv, cu + reach, cv, "centre"),
      seg(cu, cv - reach, cu, cv + reach, "centre"),
    ];
  }

  // Otherwise the hole axis lies in the plane of the view. One screen axis runs
  // ALONG the bore; the other is the one the bore lines are offset on.
  const alongScreen: "u" | "v" = spec.su === op.axis ? "u" : "v";
  const acrossAxis: Axis = alongScreen === "u" ? spec.sv : spec.su;
  const cAcross = centreOn(op, acrossAxis);
  const lengthAlong = sizeAlong(o, op.axis);

  const depthSize = sizeAlong(o, spec.depth);
  const acrossSize = sizeAlong(o, acrossAxis);
  const cDepth = centreOn(op, spec.depth);

  /**
   * Is there material between the viewer and the bore, `t` along its length?
   * Asked of the grid rather than reasoned about: a notch cut in front of a
   * bore exposes it, and no per-feature rule would know that.
   */
  const occludedAt = (t: number, across: number): boolean => {
    for (let depthIndex = 0; depthIndex < depthSize; depthIndex++) {
      const nearerThanHole = spec.nearIsLow
        ? depthIndex < cDepth - op.r
        : depthIndex >= cDepth + op.r;
      if (!nearerThanHole) continue;
      const coord: Record<Axis, number> = { x: 0, y: 0, z: 0 };
      coord[op.axis] = t;
      coord[acrossAxis] = Math.max(0, Math.min(acrossSize - 1, across));
      coord[spec.depth] = depthIndex;
      if (o.isSolid(coord.x, coord.y, coord.z)) return true;
    }
    return false;
  };

  const makeSeg = (
    a: number, b: number, acrossPos: number, isHidden: boolean,
  ): Primitive => {
    const type = isHidden ? "hidden" : "visible";
    return alongScreen === "u"
      ? seg(a, acrossPos, b, acrossPos, type)
      : seg(acrossPos, a, acrossPos, b, type);
  };

  const out: Primitive[] = [];

  for (const offset of [-op.r, op.r]) {
    const across = cAcross + offset;
    // Walk the bore's length and merge runs of equal visibility into segments.
    let runStart = 0;
    let runHidden = occludedAt(0, across);
    for (let t = 1; t <= lengthAlong; t++) {
      const h = t < lengthAlong ? occludedAt(t, across) : !runHidden; // force a flush
      if (h === runHidden) continue;
      out.push(makeSeg(runStart, t, across, runHidden));
      runStart = t;
      runHidden = h;
    }
  }

  // One centre line running the length of the bore.
  const reach = CENTRE_OVERSHOOT;
  out.push(alongScreen === "u"
    ? seg(-reach, cAcross, lengthAlong + reach, cAcross, "centre")
    : seg(cAcross, -reach, cAcross, lengthAlong + reach, "centre"));

  return out;
}
