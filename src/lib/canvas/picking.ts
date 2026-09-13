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

export type Box = { left: number; top: number; width: number; height: number };
export type ViewBox = { minX: number; minY: number; w: number; h: number };

/**
 * Map a client point into viewBox units, honouring LETTERBOXING.
 *
 * WHY THIS IS NOT `(clientX - box.left) * view.w / box.width`. An `<svg>`
 * defaults to `preserveAspectRatio="xMidYMid meet"`, so when the element's box
 * and its viewBox have different aspect ratios the drawing is scaled uniformly
 * and CENTRED, with empty bands on two sides. The naive mapping treats those
 * bands as part of the drawing and every hit lands in the wrong place.
 *
 * Found by driving the real page, not by looking at it: a screenshot of the
 * builder was pixel-perfect while every click silently did nothing, because a
 * `max-height` had made the element box wider in aspect than the viewBox. This
 * is the SECOND time this project has shipped a broken client-to-model mapping
 * (see Sheet.tsx's `clientToGrid` and the §9 entry for 2026-08-27), which is
 * why it now lives in a tested pure function instead of inline in a component.
 */
export function clientToViewBox(
  clientX: number, clientY: number, box: Box, view: ViewBox,
): Point2 {
  if (box.width === 0 || box.height === 0) return [view.minX, view.minY];
  const scale = Math.min(box.width / view.w, box.height / view.h);
  const drawnW = view.w * scale;
  const drawnH = view.h * scale;
  const originX = box.left + (box.width - drawnW) / 2;
  const originY = box.top + (box.height - drawnH) / 2;
  return [view.minX + (clientX - originX) / scale, view.minY + (clientY - originY) / scale];
}
