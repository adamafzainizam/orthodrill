/**
 * Oblique projection: the front face true shape, depth receding at 45 degrees.
 *
 * WHAT THE LATTICE DECIDED, measured 2026-08-29 and not to be re-litigated
 * (AGENTS.md §1.1, docs/decision-log.md):
 *
 * - All three types ship, as ONE projection parameterised by the depth factor
 *   k: cavalier 1, cabinet 1/2, general 2/3.
 * - Every y-coordinate in the solid must be a multiple of k's DENOMINATOR --
 *   1, 2, 3 respectively -- or the projection leaves the integer grid and the
 *   scorer cannot express the answer. Enforced by `validateObliqueSolid`, not
 *   left to authoring care.
 * - The receding angle is fixed at 45 degrees. Only tan 45 = 1 gives an
 *   integer step; 15, 30, 60 and 75 are all irrational.
 * - Depth is ONE GRID DIAGONAL PER UNIT, which is sqrt(2) longer than
 *   metrically true scale. The RATIOS between the three types are exact and
 *   are the teaching content; the sqrt(2) is uniform and invisible without a
 *   ruler. A hint must therefore never say "full size" -- see AGENTS.md §6 on
 *   authored prose that contradicts the key.
 * - Box-only, and in wave 1 PRISMS only: every feature spans the full depth.
 *   A bore is an ellipse in oblique and `circle` is the only curved primitive
 *   we have.
 *
 * WHY NOT REUSE isoedges.ts. That returns a PAINT PROGRAM whose occlusion is
 * overdraw -- correct for a prompt picture, useless as an answer key. A key
 * must be an explicit set of scoreable primitives, so visibility here is
 * computed rather than painted.
 *
 * PURE. No I/O, no DOM, no framework imports. See AGENTS.md §2 constraint 3.
 */
import { buildOccupancy } from "./occupancy.ts";
import type { Op, Solid } from "./solid.ts";

export type ObliqueType = "cavalier" | "cabinet" | "general";

/** The depth factor k applied along the receding axis. */
export const DEPTH_FACTOR: Readonly<Record<ObliqueType, number>> = Object.freeze({
  cavalier: 1,
  cabinet: 0.5,
  general: 2 / 3,
});

/**
 * The denominator of each k: every y-coordinate in the solid must be a
 * multiple of this, or k*y is not an integer and the vertex leaves the grid.
 */
export const DEPTH_STEP: Readonly<Record<ObliqueType, number>> = Object.freeze({
  cavalier: 1,
  cabinet: 2,
  general: 3,
});

export type ObliqueSpec = {
  solid: Solid;
  type: ObliqueType;
  /** Sheet coordinates of the front face's bottom-left corner. */
  originX: number;
  originY: number;
};

/**
 * Model space to sheet coordinates.
 *
 * Grid y runs DOWNWARD and the solid's z is height, so z is SUBTRACTED. The
 * receding axis goes UP AND TO THE RIGHT, the conventional direction, so one
 * unit of depth adds k to x and subtracts k from y. A sign error here yields a
 * drawing that recedes toward the viewer and is perfectly self-consistent
 * about it, which is why a positive control pins it.
 */
export function projectOblique(
  x: number, y: number, z: number, k: number, originX: number, originY: number,
): { x: number; y: number } {
  return { x: originX + x + k * y, y: originY - z - k * y };
}

/**
 * The solid's cross-section at y = 0, indexed [z][x].
 *
 * For a prism this is every slice, which is what makes wave 1 tractable:
 * visibility can be reasoned about from one 2D profile rather than from the
 * full lattice. `validateObliqueSolid` is what guarantees the solid IS a
 * prism, so this function is only correct downstream of that check.
 */
export function profileOf(s: Solid): boolean[][] {
  const o = buildOccupancy(s);
  const rows: boolean[][] = [];
  for (let z = 0; z < o.h; z++) {
    const row: boolean[] = [];
    for (let x = 0; x < o.w; x++) row.push(o.isSolid(x, 0, z));
    rows.push(row);
  }
  return rows;
}

/** The drawing's extent: (w + k*d) by (h + k*d). */
export function obliqueBounds(spec: ObliqueSpec): { width: number; height: number } {
  const k = DEPTH_FACTOR[spec.type];
  const { w, d, h } = spec.solid.base;
  return { width: w + k * d, height: h + k * d };
}

/**
 * Why a solid cannot be drawn in oblique, or null if it can.
 *
 * A SIBLING of `validateSolid` rather than a branch inside it: `validateSolid`
 * guards the orthographic path, and giving it a type parameter would make
 * every existing caller pass something meaningless.
 *
 * These are enforced here rather than left to authoring care, which is the
 * difference between a rule and a hope — AGENTS.md §4 is explicit that the
 * depth rule covers every feature box's y and d, not just the overall depth,
 * and that is exactly the part a careful author still gets wrong.
 */
export type ObliqueRejection =
  | "CYLINDER_IN_OBLIQUE"
  | "DEPTH_NOT_ON_STEP"
  | "NOT_A_PRISM"
  | "EMPTY_SOLID";

export function validateObliqueSolid(s: Solid, type: ObliqueType): ObliqueRejection | null {
  const step = DEPTH_STEP[type];
  const depth = s.base.d;

  for (const op of s.ops as Op[]) {
    // A bore on x or z projects to an ellipse at 2.618:1, and even on y its
    // silhouette tangents land at c ± r/√2. `circle` is our only curved
    // primitive, so neither is expressible. Tier 2.
    if (op.kind === "cylinder") return "CYLINDER_IN_OBLIQUE";
  }

  // The depth rule, over EVERY y-coordinate that can appear as a vertex.
  const ys = new Set<number>([0, depth]);
  for (const op of s.ops as Op[]) {
    if (op.kind !== "box") continue;
    ys.add(op.box.y);
    ys.add(op.box.y + op.box.d);
  }
  for (const y of ys) if (y % step !== 0) return "DEPTH_NOT_ON_STEP";

  // Wave 1 is prisms: every feature spans the full depth, so the solid is a
  // 2D profile extruded. That is what the depth rule already forces for a
  // solid usable in all three types, and it is the case where visibility is
  // exactly computable.
  for (const op of s.ops as Op[]) {
    if (op.kind !== "box") continue;
    const spansDepth = op.box.y <= 0 && op.box.y + op.box.d >= depth;
    if (!spansDepth) return "NOT_A_PRISM";
  }

  const o = buildOccupancy(s);
  let any = false;
  for (let z = 0; z < o.h && !any; z++)
    for (let x = 0; x < o.w && !any; x++) if (o.isSolid(x, 0, z)) any = true;
  if (!any) return "EMPTY_SOLID";

  return null;
}
