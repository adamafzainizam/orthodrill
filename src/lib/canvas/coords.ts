/**
 * Grid and screen coordinates.
 *
 * The drawing is stored in GRID units — integers, because the scorer compares
 * primitives by exact position and `validate.ts` rejects anything else. Pixels
 * exist only for drawing and pointer events, and never enter the drawing.
 *
 * PURE. No I/O, no DOM.
 */
export type Point = { x: number; y: number };

/** `cell` is pixels per grid unit; `padding` is the margin around the grid. */
export type Viewport = { cell: number; padding: number };

export function gridToScreen(p: Point, v: Viewport): Point {
  return { x: p.x * v.cell + v.padding, y: p.y * v.cell + v.padding };
}

/** Always snapped: there is no such thing as an off-grid drawing position. */
export function screenToGrid(p: Point, v: Viewport): Point {
  return {
    x: Math.round((p.x - v.padding) / v.cell),
    y: Math.round((p.y - v.padding) / v.cell),
  };
}

/**
 * Radius from a centre and a point on the circumference, in whole units.
 *
 * Never zero: `validate.ts` requires a positive integer radius, so a click that
 * lands on the centre yields the smallest legal circle rather than an invalid
 * one the server would reject.
 */
export function radiusFrom(centre: Point, edge: Point): number {
  const dx = edge.x - centre.x;
  const dy = edge.y - centre.y;
  return Math.max(1, Math.round(Math.hypot(dx, dy)));
}
