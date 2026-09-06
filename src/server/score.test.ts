import { test } from "node:test";
import assert from "node:assert/strict";
import { handleScoreRequest, type ScoringLookup } from "./score.ts";
import { createRateLimiter } from "../lib/ratelimit.ts";
import { getDrill, answerKey, DRILL_IDS } from "../drills/registry.ts";
import { MAX_PRIMITIVES } from "../lib/scoring/validate.ts";
import type { Primitive } from "../lib/scoring/primitives.ts";
import type { Cell } from "../lib/geometry/rotate3.ts";

const permissive = () => createRateLimiter({ limit: 1000, windowMs: 1000 });
const id = DRILL_IDS[0];

/** The correct answer, laid out so the three views cluster apart. Only ever
 *  called with a "views" drill id (DRILL_IDS[0], "step-block"). */
function correctAttempt(drillId: string) {
  const drill = getDrill(drillId)!;
  if (drill.mode !== "views") throw new Error(`${drillId} is not a 'views' drill`);
  const key = answerKey(drill);
  const shift = (ps: typeof key.front, dx: number, dy: number) =>
    ps.map((p) => p.kind === "circle"
      ? { ...p, cx: p.cx + dx, cy: p.cy + dy }
      : { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy });
  // First-angle: top below the front, side to the left of it.
  return [...shift(key.front, 40, 40), ...shift(key.top, 40, 90), ...shift(key.side, 0, 40)];
}

test("a well-formed submission is scored", () => {
  const r = handleScoreRequest({ drillId: id, kind: "views", primitives: correctAttempt(id) }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 200);
  const body = r.body as { ok: boolean };
  assert.equal(body.ok, true);
});

test("an unknown drill id is a 404, not a 500", () => {
  const r = handleScoreRequest({ drillId: "nope", kind: "views", primitives: [] }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 404);
});

test("a body that is not an object is rejected", () => {
  for (const bad of [null, "hello", 42, []]) {
    assert.equal(handleScoreRequest(bad, "1.2.3.4", 0, permissive()).status, 400);
  }
});

test("a missing drill id is rejected before any drill is looked up", () => {
  const r = handleScoreRequest({ kind: "views", primitives: [] }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 400);
});

test("a non-string drill id is rejected", () => {
  const r = handleScoreRequest({ drillId: { evil: true }, kind: "views", primitives: [] }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 400);
});

test("a submission without a kind is rejected", () => {
  const r = handleScoreRequest({ drillId: id, primitives: [] }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});

test("an oversized primitive set is refused before scoring", () => {
  const many = Array.from({ length: MAX_PRIMITIVES + 1 }, (_, i) => ({
    kind: "segment", type: "visible", x1: 0, y1: i % 100, x2: 1, y2: i % 100,
  }));
  const r = handleScoreRequest({ drillId: id, kind: "views", primitives: many }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "TOO_MANY_PRIMITIVES");
});

test("a rate-limited caller gets 429 and is told when to retry", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 5000 });
  const body = { drillId: id, kind: "views", primitives: correctAttempt(id) };
  assert.equal(handleScoreRequest(body, "9.9.9.9", 0, rl).status, 200);
  const second = handleScoreRequest(body, "9.9.9.9", 100, rl);
  assert.equal(second.status, 429);
  assert.equal((second.body as { retryAfterMs: number }).retryAfterMs, 4900);
});

test("the rate limit is per caller", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 5000 });
  const body = { drillId: id, kind: "views", primitives: correctAttempt(id) };
  handleScoreRequest(body, "1.1.1.1", 0, rl);
  assert.equal(handleScoreRequest(body, "2.2.2.2", 0, rl).status, 200);
});

test("rate limiting is checked BEFORE the payload is validated", () => {
  // Otherwise a flood of huge bodies still costs full validation per request.
  const rl = createRateLimiter({ limit: 1, windowMs: 5000 });
  handleScoreRequest({ drillId: id, kind: "views", primitives: [] }, "3.3.3.3", 0, rl);
  const huge = Array.from({ length: MAX_PRIMITIVES + 1 }, () => ({ kind: "bogus" }));
  const r = handleScoreRequest({ drillId: id, kind: "views", primitives: huge }, "3.3.3.3", 1, rl);
  assert.equal(r.status, 429, "a throttled caller should not reach validation");
});

test("a wrong number of views is a scored outcome, not an HTTP error", () => {
  const r = handleScoreRequest(
    { drillId: id, kind: "views", primitives: [{ kind: "segment", type: "visible", x1: 0, y1: 0, x2: 4, y2: 0 }] },
    "1.2.3.4", 0, permissive(),
  );
  assert.equal(r.status, 200);
  assert.equal((r.body as { ok: boolean }).ok, false);
  assert.equal((r.body as { reason: string }).reason, "WRONG_VIEW_COUNT");
});

// --- mode dispatch: a figure exercise scores through the same handler ---

/** A minimal figure key, independent of any real (Task 3) generator. */
const figureKey: Primitive[] = [
  { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 4, y2: 0 },
  { kind: "segment", type: "visible", x1: 4, y1: 0, x2: 4, y2: 4 },
];

/** Stands in for the registry until Task 3/4 add a real figure exercise. */
const figureLookup: ScoringLookup = (id) =>
  id === "the-figure-exercise"
    ? { found: true, mode: "figure", key: figureKey }
    : { found: false };

test("submitting kind: figure to a views exercise is refused with BAD_KIND", () => {
  const r = handleScoreRequest(
    { drillId: id, kind: "figure", primitives: [] }, "1.2.3.4", 0, permissive(),
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});

test("submitting kind: views to a figure exercise is refused with BAD_KIND", () => {
  const r = handleScoreRequest(
    { drillId: "the-figure-exercise", kind: "views", primitives: [] },
    "1.2.3.4", 0, permissive(), figureLookup,
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});

test("a well-formed figure submission to a figure exercise scores", () => {
  const r = handleScoreRequest(
    { drillId: "the-figure-exercise", kind: "figure", primitives: figureKey },
    "1.2.3.4", 0, permissive(), figureLookup,
  );
  assert.equal(r.status, 200);
  const body = r.body as { ok: boolean; perfect: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.perfect, true);
});

// --- the real registry, no injected lookup: the default figure dispatch ---

test("a well-formed figure submission to the real parabola drill scores through the default lookup", () => {
  const figureId = DRILL_IDS.find((d) => getDrill(d)!.mode === "figure");
  assert.notEqual(figureId, undefined, "no figure drill in the catalogue to test against");
  const drill = getDrill(figureId!)!;
  if (drill.mode !== "figure") throw new Error(`${figureId} is not a 'figure' drill`);
  const key = answerKey(drill);

  const r = handleScoreRequest(
    { drillId: figureId, kind: "figure", primitives: key }, "1.2.3.4", 0, permissive(),
  );
  assert.equal(r.status, 200);
  const body = r.body as { ok: boolean; perfect: boolean };
  assert.equal(body.ok, true);
  assert.equal(body.perfect, true);
});

test("submitting kind: views to the real parabola drill is refused with BAD_KIND", () => {
  const figureId = DRILL_IDS.find((d) => getDrill(d)!.mode === "figure")!;
  const r = handleScoreRequest(
    { drillId: figureId, kind: "views", primitives: [] }, "1.2.3.4", 0, permissive(),
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});

test("no response ever serialises the solid or the raw key", () => {
  const responses = [
    handleScoreRequest({ drillId: id, kind: "views", primitives: correctAttempt(id) }, "1.2.3.4", 0, permissive()),
    handleScoreRequest({ drillId: "nope", kind: "views", primitives: [] }, "1.2.3.4", 0, permissive()),
    handleScoreRequest({ drillId: id, kind: "views", primitives: [{ kind: "bad" }] }, "1.2.3.4", 0, permissive()),
  ];
  for (const r of responses) {
    const wire = JSON.stringify(r.body);
    assert.ok(!wire.includes('"solid"'), "a response serialised the solid");
    assert.ok(!wire.includes('"ops"'), "a response serialised the feature operations");
    assert.ok(!wire.includes('"base"'), "a response serialised the base block");
  }
});

/** A two-cell key, enough to exercise every branch without real content. */
const buildLookup: ScoringLookup = () => ({ found: true, mode: "build", key: [[0, 0, 0], [1, 0, 0]] as Cell[] });

test("a correct cell submission scores perfect", () => {
  const r = handleScoreRequest(
    { drillId: "x", kind: "solid", cells: [[0, 0, 0], [1, 0, 0]] },
    "1.2.3.4", 0, permissive(), buildLookup,
  );
  assert.equal(r.status, 200);
  assert.equal((r.body as { perfect: boolean }).perfect, true);
});

test("a wrong cell submission answers 200 with a diff, not an error", () => {
  const r = handleScoreRequest(
    { drillId: "x", kind: "solid", cells: [[0, 0, 0]] },
    "1.2.3.4", 0, permissive(), buildLookup,
  );
  assert.equal(r.status, 200, "a wrong build is a scoring outcome, not a transport failure");
  assert.equal((r.body as { perfect: boolean }).perfect, false);
  assert.equal((r.body as { diff: { missing: unknown[] } }).diff.missing.length, 1);
});

test("submitting cells to a views exercise is refused before any scoring", () => {
  const r = handleScoreRequest(
    { drillId: id, kind: "solid", cells: [[0, 0, 0]] },
    "1.2.3.4", 0, permissive(),
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});

test("submitting primitives to a build exercise is refused", () => {
  const r = handleScoreRequest(
    { drillId: "x", kind: "views", primitives: [] },
    "1.2.3.4", 0, permissive(), buildLookup,
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});

test("a malformed cell set is rejected with its validation reason", () => {
  const r = handleScoreRequest(
    { drillId: "x", kind: "solid", cells: [[0, 0, 0.5]] },
    "1.2.3.4", 0, permissive(), buildLookup,
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "NOT_ON_GRID");
});

test("rate limiting still happens BEFORE validation for a cell submission", () => {
  // The order is a security property, not a style choice: a flood of oversized
  // bodies must not cost full validation per request.
  const rl = createRateLimiter({ limit: 1, windowMs: 5000 });
  handleScoreRequest({ drillId: "x", kind: "solid", cells: [] }, "9.9.9.9", 0, rl, buildLookup);
  const r = handleScoreRequest(
    { drillId: "x", kind: "solid", cells: "not even an array" },
    "9.9.9.9", 1, rl, buildLookup,
  );
  assert.equal(r.status, 429, "throttling must precede validation");
});

test("an unknown kind is refused", () => {
  const r = handleScoreRequest(
    { drillId: "x", kind: "cells", cells: [] },
    "1.2.3.4", 0, permissive(), buildLookup,
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});

test("a real build drill scores its own derived key as perfect, end to end", () => {
  // Through the DEFAULT lookup and real registry content, so the key really is
  // the one a student would be marked against.
  const drill = getDrill("build-corner-step")!;
  if (drill.mode !== "build") throw new Error("build-corner-step is not a build drill");
  const r = handleScoreRequest(
    { drillId: "build-corner-step", kind: "solid", cells: answerKey(drill) },
    "1.2.3.4", 0, permissive(),
  );
  assert.equal(r.status, 200);
  assert.equal((r.body as { perfect: boolean }).perfect, true);
});
