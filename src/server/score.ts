/**
 * The scoring endpoint's logic, separated from its HTTP wrapper.
 *
 * SERVER ONLY. It reads answer keys.
 *
 * Everything the handler needs is passed in — the clock, the rate limiter, the
 * parsed body — so the whole thing is testable without a running server, and so
 * the order of the checks can be pinned by test. That order is a security
 * property, not a style choice: throttling happens BEFORE validation, or a
 * flood of oversized bodies still costs full validation per request.
 *
 * Returns a status and a body rather than a Response, so the Next-specific
 * adapter stays trivial. Next masks errors thrown out of a handler in
 * production builds (AGENTS.md §6), so nothing here throws for an expected
 * outcome.
 */
import { validateAttempt } from "../lib/scoring/validate.ts";
import { scoreAttempt } from "../lib/scoring/score.ts";
import { answerKey, getDrill } from "../drills/registry.ts";
import type { RateLimiter } from "../lib/ratelimit.ts";

export type ScoreResponse = { status: number; body: unknown };

function fail(status: number, reason: string, extra: Record<string, unknown> = {}): ScoreResponse {
  return { status, body: { ok: false, reason, ...extra } };
}

export function handleScoreRequest(
  body: unknown,
  clientKey: string,
  now: number,
  limiter: RateLimiter,
): ScoreResponse {
  // FIRST, before any work proportional to the payload.
  const decision = limiter.check(clientKey, now);
  if (!decision.allowed) {
    return fail(429, "RATE_LIMITED", { retryAfterMs: decision.retryAfterMs });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail(400, "BAD_REQUEST");
  }
  const { drillId, kind, primitives } = body as Record<string, unknown>;
  if (typeof drillId !== "string") return fail(400, "BAD_DRILL_ID");
  if (kind !== "views") return fail(400, "BAD_KIND");

  // Whitelist lookup. There is no path here, so there is no path to traverse.
  const drill = getDrill(drillId);
  if (drill === null) return fail(404, "NO_SUCH_DRILL");

  const validated = validateAttempt(primitives);
  if (!validated.ok) return fail(400, validated.reason);

  // A wrong view count is a legitimate scoring outcome and answers 200: the
  // request was fine, the drawing was not. Only the transport failed above.
  const result = scoreAttempt(validated.primitives, answerKey(drill), drill.convention);
  return { status: 200, body: result };
}
