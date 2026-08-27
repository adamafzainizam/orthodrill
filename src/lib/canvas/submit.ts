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
import type { ScoreResult } from "../scoring/score.ts";

export type SubmitFailure = { ok: false; reason: string };

export async function submitAttempt(
  drillId: string,
  primitives: Primitive[],
  fetchImpl: typeof fetch = fetch,
): Promise<ScoreResult | SubmitFailure> {
  try {
    const response = await fetchImpl("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drillId, kind: "views", primitives }),
    });
    return (await response.json()) as ScoreResult | SubmitFailure;
  } catch {
    return { ok: false, reason: "NETWORK" };
  }
}
