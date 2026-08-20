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

export const CONVENTIONS: Record<Convention, { top: Direction; side: Direction }> = {
  // In first-angle projection the view seen from above is projected BELOW.
  first_angle: { top: "below", side: "right" },
  // In third-angle projection it is projected ABOVE.
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
