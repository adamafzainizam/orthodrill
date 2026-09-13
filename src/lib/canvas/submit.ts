/**
 * Posting an attempt and getting a score back.
 *
 * NOTHING THROWS. A network failure and a rate limit are both ordinary
 * outcomes of a student pressing a button, and the UI has to render both the
 * same way it renders a bad drawing — as a message, not a crash.
 *
 * `fetchImpl` is injected so this is testable without a server or a browser.
 */
import type { Primitive } from "../scoring/primitives.ts";
import type { FigureScoreResult, ScoreResult } from "../scoring/score.ts";
import type { SolidScoreResult } from "../scoring/solid.ts";
import type { Cell } from "../geometry/rotate3.ts";

export type SubmitKind = "views" | "figure";

export type SubmitFailure = { ok: false; reason: string };

export async function submitAttempt(
  drillId: string,
  kind: SubmitKind,
  primitives: Primitive[],
  fetchImpl: typeof fetch = fetch,
): Promise<ScoreResult | FigureScoreResult | SubmitFailure> {
  try {
    // Belt and braces: the LOAD-BEARING strip is scoreViews's/scoreFigure's
    // shared helper, at the server's one entry point (score.ts). This one
    // just avoids posting scaffolding the server would discard anyway.
    const scoreable = primitives.filter((p) => p.type !== "construction");
    const response = await fetchImpl("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drillId, kind, primitives: scoreable }),
    });
    return (await response.json()) as ScoreResult | FigureScoreResult | SubmitFailure;
  } catch {
    return { ok: false, reason: "NETWORK" };
  }
}

/**
 * Submit a Type B build: the cells the student's part OCCUPIES.
 *
 * Occupied, not removed, so two students who carve the same part in a
 * different order submit the same thing (reverse-drill spec §6). The
 * submission's `kind` is "solid" while the drill's `mode` is "build" — the
 * drill says what the exercise asks for, the submission says what shape
 * arrived, and `server/score.ts` maps between them in one place.
 */
export async function submitBuild(
  drillId: string,
  cells: readonly Cell[],
  fetchImpl: typeof fetch = fetch,
): Promise<SolidScoreResult | SubmitFailure> {
  try {
    const response = await fetchImpl("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drillId, kind: "solid", cells }),
    });
    return (await response.json()) as SolidScoreResult | SubmitFailure;
  } catch {
    return { ok: false, reason: "NETWORK" };
  }
}
