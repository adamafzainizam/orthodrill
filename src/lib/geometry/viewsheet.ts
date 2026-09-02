/**
 * The three orthographic views laid out as ONE figure, for use as a PROMPT.
 *
 * WHY THIS EXISTS. Two topics need to show a student three views and ask them
 * to produce something else: oblique wave 2 ("given the views, draw the
 * pictorial") and the Type B reverse drill ("given the views, build the
 * solid"). Both need the same picture, so it is built once.
 *
 * THE SECURITY RULE THIS CREATES, and it is AGENTS.md §5.1 in new clothes.
 * The three views of a solid ARE the answer key for a Type A orthographic
 * exercise on that same solid. So a drill that SHOWS the views of solid S
 * publishes the answer to any orthographic drill that ASKS for the views of S.
 * Any solid used as a views prompt must therefore be used by no Type A
 * exercise. That is enforced by test in `drills/registry.test.ts`, not left to
 * authoring care.
 *
 * ALIGNMENT IS THE CONTENT, not decoration. Front and top share a width and
 * must sit on the same vertical lines; front and side share a height and must
 * sit on the same horizontal lines. A figure that violates that is teaching
 * the wrong thing, so the placement is derived from each view's bounding box
 * rather than from a magic number.
 *
 * PURE. No I/O, no DOM, no framework imports. See AGENTS.md §2 constraint 3.
 */
import { generateViews } from "./views.ts";
import type { Solid } from "./solid.ts";
import { boundingBox, type Primitive } from "../scoring/primitives.ts";
import { CONVENTIONS } from "../scoring/placement.ts";
import type { Convention } from "../scoring/types.ts";

/** Blank space between adjacent views, in grid units. */
export const VIEW_GAP = 3;

function shift(ps: readonly Primitive[], dx: number, dy: number): Primitive[] {
  return ps.map((p) => (p.kind === "circle"
    ? { ...p, cx: p.cx + dx, cy: p.cy + dy }
    : { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }));
}

/**
 * Move a view so its bounding box starts at the origin.
 *
 * An EMPTY view cannot arise here — `validateSolid` rejects a fully subtracted
 * solid precisely so three empty "perfect" views are impossible — but
 * `boundingBox` is typed to admit it, so the case is handled rather than
 * asserted away.
 */
function normalise(ps: readonly Primitive[]): Primitive[] {
  const b = boundingBox([...ps]);
  if (b === null) return [];
  return shift(ps, -b.minX, -b.minY);
}

/**
 * The three views of `s`, arranged for `convention`, as one set of primitives.
 *
 * The front view sits at the origin. The top goes above or below it and the
 * side to its left or right, per `CONVENTIONS` — the same table the SCORER
 * judges placement with, so the figure a student is shown and the arrangement
 * they are marked against can never disagree.
 */
export function viewsFigure(s: Solid, convention: Convention): Primitive[] {
  const v = generateViews(s);
  const front = normalise(v.front);
  const top = normalise(v.top);
  const side = normalise(v.side);

  const fb = boundingBox(front);
  const tb = boundingBox(top);
  const sb = boundingBox(side);
  if (fb === null || tb === null || sb === null) {
    throw new Error("a view came back empty — validateSolid should have refused this solid");
  }
  const where = CONVENTIONS[convention];

  // Top shares the front's WIDTH, so it keeps the front's x and only moves in y.
  const topDy = where.top === "below"
    ? fb.maxY + VIEW_GAP
    : -(tb.maxY - tb.minY) - VIEW_GAP;

  // Side shares the front's HEIGHT, so it keeps the front's y and only moves in x.
  const sideDx = where.side === "right"
    ? fb.maxX + VIEW_GAP
    : -(sb.maxX - sb.minX) - VIEW_GAP;

  return [
    ...front,
    ...shift(top, 0, topDy),
    ...shift(side, sideDx, 0),
  ];
}
