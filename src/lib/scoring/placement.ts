/**
 * Judge WHERE the views were placed, separately from what was drawn in them.
 *
 * A student can draw all three views perfectly and still place them by the
 * wrong convention. Scoring that as "your drawing is wrong" would be both
 * false and useless; it deserves its own verdict, and its own feedback.
 *
 * NEITHER CONVENTION IS CORRECT. First-angle dominates Europe and Asia,
 * third-angle the United States and Japan. The table below is data, not
 * branching logic, precisely so it can be corrected against a reference
 * without touching any algorithm. VERIFY IT BEFORE PUBLISHING DRILLS —
 * see AGENTS.md §4.
 *
 * Screen coordinates: y increases DOWNWARD. "above" means smaller y.
 *
 * PURE. No I/O.
 */
import { boundingBox, type BBox } from "./primitives.ts";
import type { Assignment } from "./assign.ts";
import type { Convention, Direction } from "./types.ts";

/**
 * `side` means THE RIGHT-SIDE VIEW — the view of the object seen from its
 * right. Both standards also admit a left-side view, which mirrors these
 * placements; a drill that wants one must say so, because "the side view" is
 * ambiguous on its own and the two conventions disagree about where it goes.
 *
 * The conventions are mirror images on BOTH axes. First-angle puts the object
 * between the observer and the plane, so every view lands on the far side from
 * the direction it was seen: top view below, right-side view LEFT. Third-angle
 * puts the plane between observer and object, so each view lands on its own
 * side: top view above, right-side view right.
 *
 * VERIFIED 2026-08-21 against four free references, which agree:
 *  - Engineering LibreTexts (Illinois Tech, Intro to Engineering Drawing §2.2):
 *    first-angle "right-side view is projected onto a vertical plane placed to
 *    the left of the object".
 *  - GD&T Basics, "First vs Third Angle - Orthographic Views": "This results in
 *    the right-side view of the object being located on the left side of the
 *    front view."
 *  - Xometry Pro and JLC CNC, both stating the view from the right is placed to
 *    the left of the front view in first-angle.
 * ISO 128 / ISO 5456 remain paywalled and were NOT consulted; if one is ever
 * obtained and contradicts the above, this table is the only thing to change.
 */
export const CONVENTIONS: Record<Convention, { top: Direction; side: Direction }> = {
  first_angle: { top: "below", side: "left" },
  third_angle: { top: "above", side: "right" },
};

export type PlacementVerdict = {
  correct: boolean;
  expected: { top: Direction; side: Direction };
  actual: { top: Direction; side: Direction };
  /** Set when the placement is a valid layout under the OTHER convention. */
  matchesOtherConvention: Convention | null;
};

/** Dominant axis of separation between two boxes. */
export function directionFrom(front: BBox, other: BBox): Direction {
  const frontCx = (front.minX + front.maxX) / 2;
  const frontCy = (front.minY + front.maxY) / 2;
  const otherCx = (other.minX + other.maxX) / 2;
  const otherCy = (other.minY + other.maxY) / 2;
  const dx = otherCx - frontCx;
  const dy = otherCy - frontCy;
  if (Math.abs(dy) >= Math.abs(dx)) return dy >= 0 ? "below" : "above";
  return dx >= 0 ? "right" : "left";
}

export function checkPlacement(a: Assignment, convention: Convention): PlacementVerdict {
  const front = boundingBox(a.byView.front.cluster)!;
  const actual = {
    top: directionFrom(front, boundingBox(a.byView.top.cluster)!),
    side: directionFrom(front, boundingBox(a.byView.side.cluster)!),
  };
  const expected = CONVENTIONS[convention];
  const correct = actual.top === expected.top && actual.side === expected.side;

  let matchesOtherConvention: Convention | null = null;
  if (!correct) {
    for (const [name, rule] of Object.entries(CONVENTIONS) as [Convention, typeof expected][]) {
      if (name !== convention && actual.top === rule.top && actual.side === rule.side) {
        matchesOtherConvention = name;
      }
    }
  }

  return { correct, expected, actual, matchesOtherConvention };
}
