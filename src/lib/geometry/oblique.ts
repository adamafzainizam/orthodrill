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
import type { Solid } from "./solid.ts";

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
