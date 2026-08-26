/**
 * POST /api/score — the only place an answer key is ever read.
 *
 * Deliberately thin. Everything with behaviour worth testing lives in
 * `src/server/`, which is testable without a running server; what is left here
 * is wiring, so the security-relevant order of operations can be read in one
 * screen: size guard, parse, then the handler, which throttles before it
 * validates.
 */
import { handleScoreRequest } from "../../../server/score.ts";
import { bodyTooLarge, clientKeyFrom, parseJsonBody, MAX_BODY_BYTES } from "../../../server/http.ts";
import { createRateLimiter } from "../../../lib/ratelimit.ts";

/** Never cached: the same body from the same student must be scored again. */
export const dynamic = "force-dynamic";

/**
 * Module scope, so the counters survive between requests on a warm instance.
 * Per-instance only — see the honest limits in ratelimit.ts.
 *
 * 30 submissions a minute is far above deliberate practice and far below what
 * it takes to reconstruct a key by brute force.
 */
const limiter = createRateLimiter({ limit: 30, windowMs: 60_000 });

export async function POST(request: Request): Promise<Response> {
  if (bodyTooLarge(request.headers)) {
    return Response.json({ ok: false, reason: "BODY_TOO_LARGE" }, { status: 413 });
  }

  const text = await request.text();
  // The header can lie or be absent; this is the check that actually holds.
  if (text.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, reason: "BODY_TOO_LARGE" }, { status: 413 });
  }

  const parsed = parseJsonBody(text);
  if (!parsed.ok) {
    return Response.json({ ok: false, reason: "MALFORMED_JSON" }, { status: 400 });
  }

  const { status, body } = handleScoreRequest(
    parsed.value,
    clientKeyFrom(request.headers),
    Date.now(),
    limiter,
  );

  const headers: Record<string, string> = {};
  if (status === 429) {
    const retryAfterMs = (body as { retryAfterMs?: number }).retryAfterMs ?? 0;
    headers["retry-after"] = String(Math.ceil(retryAfterMs / 1000));
  }
  return Response.json(body, { status, headers });
}
