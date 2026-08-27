/**
 * Turning a score into sentences a student can act on.
 *
 * ONE NOTICE PER FAULT KIND PER VIEW, never one per primitive: a student who
 * omits an entire view should get one sentence saying so, not fourteen toasts.
 *
 * There is deliberately no percentage anywhere. A number teaches nothing.
 *
 * PURE. The ScoreResult import is TYPE-ONLY and erased at build, so this does
 * not put the scorer in the client bundle.
 */
import type { ScoreResult } from "../scoring/score.ts";
import type { ViewName } from "../scoring/types.ts";

export type Notice = { id: string; tone: "good" | "warn" | "bad"; text: string };

const VIEW_LABEL: Record<ViewName, string> = {
  front: "Front view", top: "Top view", side: "Side view",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function noticesFor(result: ScoreResult): Notice[] {
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
    const d = result.views[view];
    const label = VIEW_LABEL[view];

    if (d.missing.length > 0) {
      notices.push({
        id: `${view}-missing`, tone: "bad",
        text: `${label}: ${plural(d.missing.length, "line is", "lines are")} missing.`,
      });
    }
    if (d.extra.length > 0) {
      notices.push({
        id: `${view}-extra`, tone: "bad",
        text: `${label}: ${plural(d.extra.length, "line", "lines")} drawn that should not be there.`,
      });
    }
    if (d.wrongType.length > 0) {
      notices.push({
        id: `${view}-type`, tone: "warn",
        text: `${label}: ${plural(d.wrongType.length, "line is", "lines are")} in the wrong line type `
          + `— check which edges are hidden.`,
      });
    }
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
