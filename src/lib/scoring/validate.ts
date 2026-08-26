/**
 * Validate a primitive set arriving from the network.
 *
 * THIS IS A TRUST BOUNDARY. Everything here arrives as `unknown` from a POST
 * body and is assumed hostile until proven otherwise. The design spec §7 names
 * the specific hazards: an unbounded primitive count or unbounded coordinates
 * exhaust CPU inside the scorer's clustering pass, which is superlinear in the
 * number of primitives.
 *
 * VALIDATED PRIMITIVES ARE REBUILT FIELD BY FIELD, never passed through. A
 * caller must not be able to smuggle extra properties past this function into
 * the scorer or back out in a response.
 *
 * All-or-nothing: one bad primitive rejects the whole attempt. Silently
 * dropping it would score a drawing the student did not make.
 *
 * PURE. No I/O.
 */
import type { Primitive, PrimitiveType } from "./primitives.ts";

/**
 * Caps. Generous against any real drawing — the golden parts run to a few
 * dozen primitives — and small enough that the worst case stays cheap.
 */
export const MAX_PRIMITIVES = 400;
export const MAX_COORD = 200;
export const MAX_RADIUS = 100;

export type ValidationFailure =
  | "NOT_AN_ARRAY"
  | "TOO_MANY_PRIMITIVES"
  | "BAD_SHAPE"
  | "BAD_KIND"
  | "BAD_TYPE"
  | "NOT_A_NUMBER"
  | "NOT_ON_GRID"
  | "OUT_OF_BOUNDS"
  | "DEGENERATE"
  | "BAD_RADIUS";

export type ValidationResult =
  | { ok: true; primitives: Primitive[] }
  | { ok: false; reason: ValidationFailure };

const TYPES: readonly string[] = ["visible", "hidden", "centre"];

/** A coordinate must be a real integer inside the bound — the grid snaps. */
function badCoord(n: unknown): ValidationFailure | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return "NOT_A_NUMBER";
  if (!Number.isInteger(n)) return "NOT_ON_GRID";
  if (Math.abs(n) > MAX_COORD) return "OUT_OF_BOUNDS";
  return null;
}

function validateOne(raw: unknown): { ok: true; primitive: Primitive } | { ok: false; reason: ValidationFailure } {
  if (typeof raw !== "object" || raw === null) return { ok: false, reason: "BAD_SHAPE" };
  const o = raw as Record<string, unknown>;

  if (typeof o.type !== "string" || !TYPES.includes(o.type)) {
    return { ok: false, reason: "BAD_TYPE" };
  }
  const type = o.type as PrimitiveType;

  if (o.kind === "segment") {
    for (const k of ["x1", "y1", "x2", "y2"] as const) {
      const bad = badCoord(o[k]);
      if (bad !== null) return { ok: false, reason: bad };
    }
    const x1 = o.x1 as number, y1 = o.y1 as number;
    const x2 = o.x2 as number, y2 = o.y2 as number;
    if (x1 === x2 && y1 === y2) return { ok: false, reason: "DEGENERATE" };
    return { ok: true, primitive: { kind: "segment", type, x1, y1, x2, y2 } };
  }

  if (o.kind === "circle") {
    for (const k of ["cx", "cy"] as const) {
      const bad = badCoord(o[k]);
      if (bad !== null) return { ok: false, reason: bad };
    }
    const r = o.r;
    if (typeof r !== "number" || !Number.isFinite(r)) return { ok: false, reason: "NOT_A_NUMBER" };
    if (!Number.isInteger(r)) return { ok: false, reason: "NOT_ON_GRID" };
    if (r <= 0 || r > MAX_RADIUS) return { ok: false, reason: "BAD_RADIUS" };
    return { ok: true, primitive: { kind: "circle", type, cx: o.cx as number, cy: o.cy as number, r } };
  }

  return { ok: false, reason: "BAD_KIND" };
}

export function validateAttempt(input: unknown): ValidationResult {
  if (!Array.isArray(input)) return { ok: false, reason: "NOT_AN_ARRAY" };
  // Checked BEFORE the per-primitive loop: validating a million-entry array to
  // discover it is too long is the exhaustion this cap exists to prevent.
  if (input.length > MAX_PRIMITIVES) return { ok: false, reason: "TOO_MANY_PRIMITIVES" };

  const primitives: Primitive[] = [];
  for (const raw of input) {
    const r = validateOne(raw);
    if (!r.ok) return { ok: false, reason: r.reason };
    primitives.push(r.primitive);
  }
  return { ok: true, primitives };
}
