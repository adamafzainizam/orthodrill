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
import { validateAttempt, validateCells } from "../lib/scoring/validate.ts";
import { scoreFigure, scoreViews } from "../lib/scoring/score.ts";
import { scoreSolid } from "../lib/scoring/solid.ts";
import { answerKey, getDrill } from "../drills/registry.ts";
import type { RateLimiter } from "../lib/ratelimit.ts";
import type { KeyViews } from "../lib/scoring/assign.ts";
import type { Convention } from "../lib/scoring/types.ts";
import type { Primitive } from "../lib/scoring/primitives.ts";
import type { Cell } from "../lib/geometry/rotate3.ts";

export type ScoreResponse = { status: number; body: unknown };

/**
 * What the handler needs to know about an exercise in order to score it —
 * independent of how that exercise happens to be stored. `defaultLookup`
 * below wraps the drill registry, which holds "views", "figure" and "build"
 * exercises. Tests still inject their own lookup to exercise a branch without
 * depending on real registry content — a hand-rolled test fixture, not
 * shipped content (AGENTS.md §7 is about what ships).
 *
 * A build exercise's key is its occupied-cell set, not a drawing: reading three
 * views and producing a SOLID is the one drill direction whose answer is not
 * made of primitives at all.
 */
export type ScoringLookup = (id: string) =>
  | { found: false }
  | { found: true; mode: "views"; convention: Convention; key: KeyViews }
  | { found: true; mode: "figure"; key: Primitive[] }
  | { found: true; mode: "build"; key: Cell[] };

function defaultLookup(id: string): ReturnType<ScoringLookup> {
  // Whitelist lookup. There is no path here, so there is no path to traverse.
  const drill = getDrill(id);
  if (drill === null) return { found: false };
  if (drill.mode === "figure") {
    return { found: true, mode: "figure", key: answerKey(drill) };
  }
  if (drill.mode === "build") {
    return { found: true, mode: "build", key: answerKey(drill) };
  }
  return { found: true, mode: "views", convention: drill.convention, key: answerKey(drill) };
}

function fail(status: number, reason: string, extra: Record<string, unknown> = {}): ScoreResponse {
  return { status, body: { ok: false, reason, ...extra } };
}

export function handleScoreRequest(
  body: unknown,
  clientKey: string,
  now: number,
  limiter: RateLimiter,
  lookup: ScoringLookup = defaultLookup,
): ScoreResponse {
  // FIRST, before any work proportional to the payload.
  const decision = limiter.check(clientKey, now);
  if (!decision.allowed) {
    return fail(429, "RATE_LIMITED", { retryAfterMs: decision.retryAfterMs });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return fail(400, "BAD_REQUEST");
  }
  const { drillId, kind, primitives, cells } = body as Record<string, unknown>;
  if (typeof drillId !== "string") return fail(400, "BAD_DRILL_ID");
  if (kind !== "views" && kind !== "figure" && kind !== "solid") return fail(400, "BAD_KIND");

  const found = lookup(drillId);
  if (!found.found) return fail(404, "NO_SUCH_DRILL");

  // Submitting a figure to an orthographic exercise (or vice versa) is a
  // client bug, not a wrong drawing, so it is refused the same way an
  // unrecognised `kind` is — before any scoring work happens.
  //
  // A drill's MODE says what the exercise asks for; a submission's KIND says
  // what shape arrived. They are deliberately different words, and "solid" is
  // the submission shape for a "build" exercise — a set of occupied cells, not
  // a drawing.
  const expectedKind = found.mode === "build" ? "solid" : found.mode;
  if (expectedKind !== kind) return fail(400, "BAD_KIND");

  if (found.mode === "build") {
    const validatedCells = validateCells(cells);
    if (!validatedCells.ok) return fail(400, validatedCells.reason);
    return { status: 200, body: scoreSolid(validatedCells.cells, found.key) };
  }

  const validated = validateAttempt(primitives);
  if (!validated.ok) return fail(400, validated.reason);

  // A wrong view count (or, in figure mode, a mismatched drawing) is a
  // legitimate scoring outcome and answers 200: the request was fine, the
  // drawing was not. Only the transport failed above.
  const result = found.mode === "views"
    ? scoreViews(validated.primitives, found.key, found.convention)
    : scoreFigure(validated.primitives, found.key);
  return { status: 200, body: result };
}
