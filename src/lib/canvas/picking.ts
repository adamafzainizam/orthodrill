/**
 * Which face a click landed on.
 *
 * THE SCAN RUNS BACKWARDS, AND THAT IS THE WHOLE ALGORITHM. `isoPickList`
 * hands back faces ordered back to front — the same order the painter fills
 * them in, so a later face is drawn OVER an earlier one. The face a student
 * can actually see at a point is therefore the LAST one containing it, never
 * the first. Scanning forwards is the obvious implementation and picks the
 * farthest face: the one buried behind what is on screen.
 *
 * This is the same invariant AGENTS.md §6 protects for the paint program, seen
 * from the other side: order encodes occlusion, so picking has to read that
 * order rather than treat the list as a set.
 *
 * PURE. No I/O.
 */
import type { PickFace } from "../geometry/isopick.ts";

export type Point2 = readonly [number, number];

/**
 * Ray casting, counting crossings of a ray to +infinity in x.
 *
 * Handles non-convex polygons, which matters because nothing guarantees a
 * projected face stays convex once a caller composes shapes; a convex-only
 * test would silently accept points in a notch.
 */
export function pointInPolygon(p: Point2, poly: readonly Point2[]): boolean {
  const [x, y] = p;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    // Strict on one side and loose on the other, so a vertex is counted once
    // rather than twice — the classic double-count that makes a point beside a
    // vertex read as outside.
    const straddles = (yi > y) !== (yj > y);
    if (!straddles) continue;
    const xCross = xi + ((y - yi) / (yj - yi)) * (xj - xi);
    if (x < xCross) inside = !inside;
  }
  return inside;
}

/** The nearest face containing the point, or null. See the docblock: backwards. */
export function faceAt(faces: readonly PickFace[], p: Point2): PickFace | null {
  for (let i = faces.length - 1; i >= 0; i--) {
    if (pointInPolygon(p, faces[i].points)) return faces[i];
  }
  return null;
}
