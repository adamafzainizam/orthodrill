/**
 * The scorer's two entry points: `scoreViews` (cluster into three views,
 * assign by content, diff each, judge placement — today's orthographic path)
 * and `scoreFigure` (one drawing against one key, diffed directly — for a
 * construction exercise, which has nothing to cluster and no placement to
 * judge). Both return a discriminated-enough result rather than throwing, so
 * a route handler can turn any outcome into a response without try/catch —
 * and because Next masks errors thrown out of server actions in production
 * builds (AGENTS.md §6).
 *
 * There is deliberately NO overall percentage. A number teaches nothing; the
 * caller renders the structured diff.
 *
 * PURE. No I/O. Must never be imported into a client component: it is used
 * alongside answer keys, which never reach the browser (AGENTS.md §5.1).
 */
import { clusterPrimitives } from "./cluster.ts";
import { assignClusters, type KeyViews } from "./assign.ts";
import { compareView, isPerfect } from "./compare.ts";
import { checkPlacement, type PlacementVerdict } from "./placement.ts";
import type { Primitive } from "./primitives.ts";
import type { Convention, ViewDiff, ViewName } from "./types.ts";

/**
 * Distance below which two primitives are treated as belonging to the same
 * view. Must be smaller than the space a student leaves between views and
 * larger than any gap inside one view.
 */
export const DEFAULT_CLUSTER_GAP = 8;

export type ScoreResult =
  | {
      ok: true;
      views: Record<ViewName, ViewDiff>;
      placement: PlacementVerdict;
      perfect: boolean;
    }
  | { ok: false; reason: "WRONG_VIEW_COUNT"; found: number };

export type FigureScoreResult = { ok: true; diff: ViewDiff; perfect: boolean };

/**
 * Construction lines (mitre line, projection lines, a rectangle-method
 * scaffold) are a draughtsman's working lines — never part of what is graded.
 * Both `scoreViews` and `scoreFigure` strip them through THIS function, so the
 * rule can never diverge between the two modes. `validate.ts` accepts the
 * type precisely so a construction line that reaches either scorer is
 * harmless rather than fatal; this is the load-bearing strip.
 */
function stripConstruction(attempt: Primitive[]): Primitive[] {
  return attempt.filter((p) => p.type !== "construction");
}

export function scoreViews(
  attempt: Primitive[],
  key: KeyViews,
  convention: Convention,
  gap: number = DEFAULT_CLUSTER_GAP,
): ScoreResult {
  // A real three-view drawing with construction lines crosses the whole
  // sheet and would otherwise cluster as one group instead of three, so this
  // must happen before clustering, not merely before diffing.
  const scoreable = stripConstruction(attempt);
  const clusters = clusterPrimitives(scoreable, gap);

  // Not "your drawing is wrong" — a different problem needing different words.
  if (clusters.length !== 3) {
    return { ok: false, reason: "WRONG_VIEW_COUNT", found: clusters.length };
  }

  const assignment = assignClusters(clusters, key);
  const placement = checkPlacement(assignment, convention);

  const views = {
    front: assignment.byView.front.diff,
    top: assignment.byView.top.diff,
    side: assignment.byView.side.diff,
  };

  const perfect =
    placement.correct &&
    isPerfect(views.front) && isPerfect(views.top) && isPerfect(views.side);

  return { ok: true, views, placement, perfect };
}

/**
 * One drawing against one key set, diffed directly. No clustering (there is
 * only one figure to find) and no placement verdict (there is nothing to
 * place relative to anything else). `compareView` does the actual set-diff
 * and needs no change to serve a figure instead of a view — it already
 * normalises both sides to the origin and returns the `anchor` offset that
 * lets a caller draw feedback back over the student's own drawing.
 */
export function scoreFigure(attempt: Primitive[], key: Primitive[]): FigureScoreResult {
  const scoreable = stripConstruction(attempt);
  const diff = compareView(scoreable, key);
  return { ok: true, diff, perfect: isPerfect(diff) };
}

export type { KeyViews } from "./assign.ts";
export type { PlacementVerdict } from "./placement.ts";
