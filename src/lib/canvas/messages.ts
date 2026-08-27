/**
 * Turning a score into sentences a student can act on.
 *
 * ONE NOTICE PER FAULT KIND, never one per primitive: a student who omits an
 * entire view should get one sentence saying so, not fourteen toasts. Same
 * rule for a figure exercise's single diff — one notice per fault kind, not
 * one per view (there is only one).
 *
 * There is deliberately no percentage anywhere. A number teaches nothing.
 *
 * PURE. The ScoreResult/FigureScoreResult imports are TYPE-ONLY and erased at
 * build, so this does not put the scorer in the client bundle.
 */
import type { FigureScoreResult, ScoreResult } from "../scoring/score.ts";
import type { ViewDiff, ViewName } from "../scoring/types.ts";

export type Notice = { id: string; tone: "good" | "warn" | "bad"; text: string };

const VIEW_LABEL: Record<ViewName, string> = {
  front: "Front view", top: "Top view", side: "Side view",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * The missing/extra/wrongType notices for ONE diff, shared between a single
 * view (labelled, "Front view: ...") and a single figure (unlabelled, "..."
 * on its own — there is nothing else on the sheet to distinguish it from).
 * `idPrefix` keeps ids stable and unique whichever caller uses this; `label`
 * is the full prefix INCLUDING its own punctuation and trailing space, or ""
 * for a figure, so the caller decides presentation rather than this
 * function guessing at it from a view name that a figure does not have.
 * `wrongTypeHint` is the same story: orthographic's hidden-line hint does
 * not make sense for a construction with no hidden lines of its own.
 */
function diffNotices(idPrefix: string, label: string, d: ViewDiff, wrongTypeHint: string): Notice[] {
  const notices: Notice[] = [];

  if (d.missing.length > 0) {
    notices.push({
      id: `${idPrefix}-missing`, tone: "bad",
      text: `${label}${plural(d.missing.length, "line is", "lines are")} missing.`,
    });
  }
  if (d.extra.length > 0) {
    notices.push({
      id: `${idPrefix}-extra`, tone: "bad",
      text: `${label}${plural(d.extra.length, "line", "lines")} drawn that should not be there.`,
    });
  }
  if (d.wrongType.length > 0) {
    notices.push({
      id: `${idPrefix}-type`, tone: "warn",
      text: `${label}${plural(d.wrongType.length, "line is", "lines are")} in the wrong line type`
        + wrongTypeHint,
    });
  }

  return notices;
}

function noticesForFigure(result: FigureScoreResult): Notice[] {
  if (result.perfect) {
    return [{ id: "perfect", tone: "good", text: "The curve is exactly right." }];
  }
  return diffNotices("figure", "", result.diff, ".");
}

function noticesForViews(result: ScoreResult): Notice[] {
  if (!result.ok) {
    return [{
      id: "view-count",
      tone: "warn",
      text: `Your drawing was read as ${result.found} view${result.found === 1 ? "" : "s"}, `
        + `not three views. Draw the front, top and side views with a clear gap between them.`,
    }];
  }

  if (result.perfect) {
    return [{ id: "perfect", tone: "good", text: "Every view is correct, and they are placed correctly." }];
  }

  const notices: Notice[] = [];

  for (const view of ["front", "top", "side"] as ViewName[]) {
    notices.push(...diffNotices(view, `${VIEW_LABEL[view]}: `, result.views[view], " — check which edges are hidden."));
  }

  if (!result.placement.correct) {
    const alsoKnown = result.placement.matchesOtherConvention;
    notices.push({
      id: "placement", tone: "warn",
      text: alsoKnown === null
        ? "The views are not placed correctly for this convention."
        : `The views are placed as ${alsoKnown === "third_angle" ? "third" : "first"}-angle projection, `
          + `but this drill asks for the other convention.`,
    });
  }

  return notices;
}

/**
 * Dispatches on shape, not on a `mode` field neither result type carries:
 * `FigureScoreResult` has `diff`, `ScoreResult` never does (its `ok: false`
 * branch has neither `diff` nor `views`, only `reason`/`found` — handled by
 * `noticesForViews`'s own `!result.ok` check).
 */
export function noticesFor(result: ScoreResult | FigureScoreResult): Notice[] {
  return "diff" in result ? noticesForFigure(result) : noticesForViews(result);
}
