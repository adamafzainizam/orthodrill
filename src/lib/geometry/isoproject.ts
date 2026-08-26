/**
 * The isometric projection, and visibility under it.
 *
 * The viewpoint is fixed: the viewer sits front-top-right, so the direction
 * from the object to the viewer is (+1, -1, +1) with +x right, +y back, +z up.
 * The three faces that can face the viewer are therefore +x, -y and +z.
 *
 * THE PROJECTION DIRECTION IS A LATTICE DIAGONAL: two voxels project to the
 * same point exactly when they differ by a multiple of (1, -1, 1), and no
 * other unit step is invariant. That part holds and is why VIEW_STEP is what
 * it is.
 *
 * WHAT DOES NOT HOLD: projected unit-cube hexagons do NOT tile the plane —
 * each has area sqrt(3) against a projected lattice cell of 1/sqrt(3), so
 * every hexagon overlaps six neighbours threefold. Partial occlusion between
 * voxels that do not share a diagonal is therefore routine, not an edge case.
 * `isVisible` below walks only along the shared diagonal, so it is sound as a
 * cull for voxels that are WHOLLY hidden — it is not a visibility criterion
 * and cannot decide partial occlusion. Actual hidden-line removal is done by
 * overdraw in isoedges.ts's painter's algorithm; see that file's module
 * docblock and the design document §6.
 *
 * A wrong sign in `project` produces a picture that is perfectly self-consistent
 * and perfectly MIRRORED. The constants below were verified numerically during
 * design and are pinned by tests.
 *
 * PURE. No I/O.
 */
import type { Occupancy } from "./occupancy.ts";

export type Point2 = { u: number; v: number };

/** The minimal invariant lattice step toward the viewer (length sqrt(3), not 1). */
export const VIEW_STEP = [1, -1, 1] as const;

export function project(x: number, y: number, z: number): Point2 {
  return {
    u: (x + y) / Math.SQRT2,
    v: -(-x + y + 2 * z) / Math.sqrt(6),
  };
}

/**
 * Is this cell solid AND unobstructed along the view diagonal?
 *
 * Walks toward the viewer one diagonal step at a time. Leaving the grid means
 * nothing further can obstruct it.
 */
export function isVisible(o: Occupancy, i: number, j: number, k: number): boolean {
  if (!o.isSolid(i, j, k)) return false;
  const [dx, dy, dz] = VIEW_STEP;
  for (let n = 1; ; n++) {
    const a = i + n * dx, b = j + n * dy, c = k + n * dz;
    if (a >= o.w || b < 0 || c >= o.h) return true;
    if (o.isSolid(a, b, c)) return false;
  }
}
