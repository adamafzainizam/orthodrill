/**
 * Turning a Request into the plain values the handler wants.
 *
 * SERVER ONLY.
 *
 * Kept apart from `route.ts` so it can be tested without a running Next server,
 * which leaves the route file thin enough to read at a glance.
 */

/** Longest client key stored. Bounds what a header can do to limiter memory. */
const MAX_KEY_LENGTH = 64;

/** Used when no forwarded address is present — local dev, or a direct call. */
const UNKNOWN_CLIENT = "unknown";

/**
 * The caller's address, for rate limiting.
 *
 * `x-forwarded-for` is client-controllable unless a trusted proxy overwrites
 * it. On Vercel the platform does, which is the deployment this assumes. Behind
 * anything else, an attacker rotating the header gets a fresh allowance every
 * request — so if the host ever changes, this is the line to revisit. It is a
 * soft bound either way; see the limits recorded in ratelimit.ts.
 */
export function clientKeyFrom(headers: Headers): string {
  const raw = headers.get("x-forwarded-for");
  if (raw === null) return UNKNOWN_CLIENT;
  const first = raw.split(",")[0].trim();
  if (first.length === 0) return UNKNOWN_CLIENT;
  return first.slice(0, MAX_KEY_LENGTH);
}

export type ParsedBody = { ok: true; value: unknown } | { ok: false };

/** Malformed JSON is an expected outcome of an open endpoint, not an error. */
export function parseJsonBody(text: string): ParsedBody {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false };
  }
}

/** Largest body the scoring endpoint will read. Far above any real attempt. */
export const MAX_BODY_BYTES = 262_144;

/**
 * Is the declared body larger than we are willing to read?
 *
 * An advisory check only: `content-length` is absent on a chunked request and
 * is client-supplied in any case. It cheaply rejects the honest oversized
 * request; the caller must still cap what it actually reads, because a lying
 * or absent header is exactly what an attacker sends.
 */
export function bodyTooLarge(headers: Headers, maxBytes: number = MAX_BODY_BYTES): boolean {
  const raw = headers.get("content-length");
  if (raw === null) return false;
  const declared = Number(raw);
  if (!Number.isFinite(declared)) return false;
  return declared > maxBytes;
}
