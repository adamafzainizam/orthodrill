/**
 * Compose the three orthographic views from a solid.
 *
 * Each view is emitted AT ITS OWN ORIGIN. The generator deliberately does not
 * lay the views out according to a projection convention: the scorer compares
 * translation-invariantly and judges placement separately, and placing the views
 * is the skill being tested. Laying them out would compute a fourth answer
 * nobody consumes.
 *
 * PURE. No I/O. Must never be imported into a client component: it produces
 * answer keys, which never reach the browser (AGENTS.md §5.1).
 */
import { buildOccupancy, type Occupancy } from "./occupancy.ts";
import { extractEdges } from "./project.ts";
import { mergeEdges } from "./merge.ts";
import { borePrimitives } from "./bore.ts";
import { VIEW_SPECS, type ViewSpec } from "./viewspec.ts";
import type { Axis, Box, CylinderOp, Solid } from "./solid.ts";
import { boundingBox, translate, type Primitive } from "../scoring/primitives.ts";
import type { KeyViews } from "../scoring/assign.ts";
import type { ViewName } from "../scoring/types.ts";

/** Axis-aligned span of a cylinder on one of its plane axes, or null on its own axis. */
function cylinderSpan(op: CylinderOp, axis: Axis): [number, number] | null {
  const all: Axis[] = ["x", "y", "z"];
  const [pu, pv] = all.filter((a) => a !== op.axis);
  if (axis === pu) return [op.u - op.r, op.u + op.r];
  if (axis === pv) return [op.v - op.r, op.v + op.r];
  return null; // the hole axis: spans the whole block
}

function overlaps1D(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/** Axis-aligned span of a box on one axis. */
function boxSpan(box: Box, axis: Axis): [number, number] {
  return axis === "x" ? [box.x, box.x + box.w]
    : axis === "y" ? [box.y, box.y + box.d]
    : [box.z, box.z + box.h];
}

/**
 * Clip a box to the base block's extents.
 *
 * `buildOccupancy` already clips box operations that reach outside the block —
 * a subtracted box that pokes out has no effect beyond the block boundary. A box
 * entirely outside the block is therefore a no-op, not a feature, and must not
 * be compared against a hole as though it were one. Returns null when nothing of
 * the box survives clipping.
 */
function clampBoxToBlock(box: Box, base: { w: number; d: number; h: number }): Box | null {
  const x0 = Math.max(box.x, 0), x1 = Math.min(box.x + box.w, base.w);
  const y0 = Math.max(box.y, 0), y1 = Math.min(box.y + box.d, base.d);
  const z0 = Math.max(box.z, 0), z1 = Math.min(box.z + box.h, base.h);
  if (x1 <= x0 || y1 <= y0 || z1 <= z0) return null;
  return { x: x0, y: y0, z: z0, w: x1 - x0, d: y1 - y0, h: z1 - z0 };
}

/**
 * True circle-rectangle intersection in the plane perpendicular to the
 * cylinder's axis, tangency counting as intersection.
 *
 * The cylinder's own axis is deliberately not constrained here: a through-hole
 * spans the whole block along its axis, so a box overlaps it whenever the box
 * overlaps the circle in the plane, regardless of where the box sits along that
 * axis. Clamping the circle's centre to the box's rectangle and comparing the
 * clamped distance to the radius is exact — unlike comparing the circle's
 * bounding square, which over-rejects boxes that sit in a square corner outside
 * the circle itself.
 */
function circleIntersectsBoxOnPlane(cyl: CylinderOp, box: Box): boolean {
  const all: Axis[] = ["x", "y", "z"];
  const [pu, pv] = all.filter((a) => a !== cyl.axis);
  const [uLo, uHi] = boxSpan(box, pu);
  const [vLo, vHi] = boxSpan(box, pv);
  const cu = Math.max(uLo, Math.min(cyl.u, uHi));
  const cv = Math.max(vLo, Math.min(cyl.v, vHi));
  const dist = Math.hypot(cyl.u - cu, cyl.v - cv);
  return dist <= cyl.r;
}

/**
 * Reject solids whose features overlap.
 *
 * The approved spec excludes overlapping features from v1. Enforcing that here
 * turns an implicit assumption into a loud failure: a hole partially cut away by
 * a box, or two holes that intersect, has a bore silhouette this generator does
 * not model, and emitting a confident wrong key would be far worse than refusing
 * (AGENTS.md §5.2).
 */
export function validateSolid(s: Solid): void {
  const cylinders = s.ops.filter((o): o is CylinderOp => o.kind === "cylinder");

  for (let i = 0; i < cylinders.length; i++) {
    for (let j = i + 1; j < cylinders.length; j++) {
      const a = cylinders[i], b = cylinders[j];

      if (a.axis === b.axis) {
        // Tangency counts as overlap: two holes sharing a bore line would
        // otherwise silently emit that line twice.
        const dist = Math.hypot(a.u - b.u, a.v - b.v);
        if (dist <= a.r + b.r) {
          throw new Error("two cylindrical holes overlap, which v1 does not model");
        }
        continue;
      }

      // Different axes: the same three-axis span reduction used for
      // cylinder-vs-box, with the other cylinder's span standing in for the
      // box's. Each hole's own axis is unconstrained (spans the whole block),
      // so `cylinderSpan` returning null there counts as overlapping — this is
      // exact for perpendicular through-holes, which intersect iff their spans
      // on the one shared axis overlap.
      const all: Axis[] = ["x", "y", "z"];
      const hit = all.every((axis) => {
        const sa = cylinderSpan(a, axis);
        const sb = cylinderSpan(b, axis);
        if (sa === null || sb === null) return true;
        return overlaps1D(sa, sb);
      });
      if (hit) {
        throw new Error("two cylindrical holes overlap, which v1 does not model");
      }
    }
  }

  for (const cyl of cylinders) {
    for (const op of s.ops) {
      if (op.kind !== "box") continue;
      const clipped = clampBoxToBlock(op.box, s.base);
      if (clipped === null) continue; // outside the block: a no-op, not a feature
      if (circleIntersectsBoxOnPlane(cyl, clipped)) {
        throw new Error("a cylindrical hole overlaps a subtracted box, which v1 does not model");
      }
    }
  }
}

function buildView(s: Solid, occ: Occupancy, spec: ViewSpec): Primitive[] {
  const lattice = mergeEdges(extractEdges(occ, spec));

  const out: Primitive[] = lattice.map((l) => ({
    kind: "segment",
    type: l.hidden ? "hidden" : "visible",
    x1: spec.suSign * l.u1, y1: spec.svSign * l.v1,
    x2: spec.suSign * l.u2, y2: spec.svSign * l.v2,
  }));

  for (const op of s.ops) {
    if (op.kind !== "cylinder") continue;
    for (const p of borePrimitives(op, occ, spec)) {
      out.push(p.kind === "circle"
        ? { ...p, cx: spec.suSign * p.cx, cy: spec.svSign * p.cy }
        : {
            ...p,
            x1: spec.suSign * p.x1, y1: spec.svSign * p.y1,
            x2: spec.suSign * p.x2, y2: spec.svSign * p.y2,
          });
    }
  }

  const box = boundingBox(out);
  if (box === null) return [];
  return out.map((p) => translate(p, -box.minX, -box.minY));
}

export function generateViews(s: Solid): KeyViews {
  validateSolid(s);
  const occ = buildOccupancy(s); // rasterised once, shared by all three views
  const views = {} as Record<ViewName, Primitive[]>;
  for (const name of ["front", "top", "side"] as ViewName[]) {
    views[name] = buildView(s, occ, VIEW_SPECS[name]);
  }
  return { front: views.front, top: views.top, side: views.side };
}
