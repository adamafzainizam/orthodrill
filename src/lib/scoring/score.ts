/**
 * The scorer's entry point. Composes clustering, assignment, comparison and
 * placement into one structured result.
 *
 * Returns a discriminated union rather than throwing, so a route handler can
 * turn any outcome into a response without try/catch — and because Next masks
 * errors thrown out of server actions in production builds (AGENTS.md §6).
 *
 * There is deliberately NO overall percentage. A number teaches nothing; the
 * caller renders the structured diff.
 *
 * PURE. No I/O. Must never be imported into a client component: it is used
 * alongside answer keys, which never reach the browser (AGENTS.md §5.1).
 */
import { clusterPrimitives } from "./cluster.ts";
import { assignClusters, type KeyViews } from "./assign.ts";
import { isPerfect } from "./compare.ts";
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

export function scoreAttempt(
  attempt: Primitive[],
  key: KeyViews,
  convention: Convention,
  gap: number = DEFAULT_CLUSTER_GAP,
): ScoreResult {
  // Construction lines (mitre line, projection lines) are working lines a
  // draughtsman draws to lay the sheet out — a real three-view drawing with
  // them crosses the whole sheet and would otherwise cluster as one group
  // instead of three. Stripped HERE, at the scorer's one entry point, so no
  // caller — canvas or otherwise — can forget to do it. validate.ts accepts
  // the type precisely so a construction line that reaches this point is
  // harmless rather than fatal.
  const scoreable = attempt.filter((p) => p.type !== "construction");
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

export type { KeyViews } from "./assign.ts";
export type { PlacementVerdict } from "./placement.ts";
