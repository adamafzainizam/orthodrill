/**
 * Sheet quadrants and the mitre line.
 *
 * PURE. No I/O, no DOM. `src/components/Sheet.tsx` only draws what this
 * module decides.
 *
 * A draughtsman lays a sheet out in four quadrants: three hold views, and the
 * fourth -- whichever is empty -- carries a 45 degree mitre line used to
 * project a measurement from the top view across into the side view (or back).
 *
 * INVARIANT (do not weaken this): quadrants are a VISUAL AID ONLY. Nothing
 * here decides which view a primitive belongs to, or whether a view is placed
 * correctly -- that is content-based, per design spec §4.3, precisely so the
 * app can tell a student they placed a view in the wrong quadrant. This
 * module may be used to find the empty quadrant to draw a line in, and for
 * nothing else.
 */
import type { Primitive } from "../scoring/primitives.ts";

export type Quadrant = "top-left" | "top-right" | "bottom-left" | "bottom-right";

export type Grid = { width: number; height: number };

export type Point = { x: number; y: number };

export type MitreLine = { x1: number; y1: number; x2: number; y2: number };

const ALL_QUADRANTS: readonly Quadrant[] = ["top-left", "top-right", "bottom-left", "bottom-right"];

/**
 * Which quadrant a point falls in. The sheet is split in half on each axis at
 * (width/2, height/2).
 *
 * Boundary rule, pinned by test rather than left to fall out of `<` vs `<=`
 * by accident: a point exactly ON the vertical midline belongs to the RIGHT
 * half, and a point exactly ON the horizontal midline belongs to the BOTTOM
 * half. So the sheet's exact centre point is "bottom-right". This is an
 * arbitrary choice -- there is no "correct" side for a boundary point -- but
 * it has to be some fixed choice, or which quadrant a straddling primitive
 * counts toward would depend on drawing order or floating point noise.
 */
export function quadrantOf(p: Point, grid: Grid): Quadrant {
  const midX = grid.width / 2;
  const midY = grid.height / 2;
  const left = p.x < midX;
  const top = p.y < midY;
  return `${top ? "top" : "bottom"}-${left ? "left" : "right"}`;
}

/** The point used to attribute a primitive to a quadrant: midpoint for a segment, centre for a circle. */
function anchorOf(p: Primitive): Point {
  return p.kind === "circle"
    ? { x: p.cx, y: p.cy }
    : { x: (p.x1 + p.x2) / 2, y: (p.y1 + p.y2) / 2 };
}

/**
 * Which quadrants are occupied by a drawing.
 *
 * A primitive straddling a quadrant boundary is attributed to the quadrant of
 * its midpoint (segment) or centre (circle) -- a single point per primitive,
 * so it always counts toward exactly one quadrant, never a fraction of two.
 *
 * `construction` primitives are excluded entirely. A construction line (the
 * mitre line itself, or a projection line between views) legitimately runs
 * across the whole sheet; if it counted, drawing one across the sheet would
 * mark every quadrant occupied and the empty quadrant could never be found
 * again once the student started using them.
 */
export function occupiedQuadrants(primitives: readonly Primitive[], grid: Grid): Set<Quadrant> {
  const occupied = new Set<Quadrant>();
  for (const p of primitives) {
    if (p.type === "construction") continue;
    occupied.add(quadrantOf(anchorOf(p), grid));
  }
  return occupied;
}

/** The quadrants NOT occupied by `primitives`, in a fixed (top-left, top-right, bottom-left, bottom-right) order. */
export function emptyQuadrants(primitives: readonly Primitive[], grid: Grid): Quadrant[] {
  const occupied = occupiedQuadrants(primitives, grid);
  return ALL_QUADRANTS.filter((q) => !occupied.has(q));
}

/**
 * The mitre line's endpoints for a given quadrant, regardless of whether it
 * is actually empty -- callers that already know which quadrant to draw in
 * (e.g. from `emptyQuadrants`) use this directly.
 *
 * The line starts at the sheet's centre (the corner of the quadrant nearest
 * the middle of the sheet) and runs outward at a TRUE 45 degrees -- equal
 * steps in x and y -- so that a horizontal ray projected from one view and a
 * vertical ray projected from another actually meet on it. Grids are not
 * always square (`registry.ts`'s `gridFor` sizes width and height
 * independently), so the line cannot always reach the quadrant's far corner
 * and stay at 45 degrees: it is stopped by whichever of the two half-extents
 * (to the centre, along each axis) is shorter, and terminates at that sheet
 * edge instead. On a square grid this shorter extent equals the longer one,
 * so the line does reach the far corner exactly, which is the everyday case.
 */
export function mitreLineEndpoints(quadrant: Quadrant, grid: Grid): MitreLine {
  const midX = grid.width / 2;
  const midY = grid.height / 2;
  const m = Math.min(midX, midY);
  const dx = quadrant.endsWith("left") ? -1 : 1;
  const dy = quadrant.startsWith("top") ? -1 : 1;
  return { x1: midX, y1: midY, x2: midX + dx * m, y2: midY + dy * m };
}

/**
 * The mitre line to draw for a drawing, or null.
 *
 * Only drawn when EXACTLY ONE quadrant is empty. With zero empty quadrants
 * there is nowhere to put it; with two or more, guessing which one the
 * student intends for it would be exactly the content-vs-position confusion
 * the module header warns against, so this returns null (a real "there is no
 * line" value) rather than picking one arbitrarily.
 */
export function mitreLine(primitives: readonly Primitive[], grid: Grid): MitreLine | null {
  const empty = emptyQuadrants(primitives, grid);
  return empty.length === 1 ? mitreLineEndpoints(empty[0], grid) : null;
}
