import { test } from "node:test";
import assert from "node:assert/strict";
import { handleScoreRequest } from "./score.ts";
import { createRateLimiter } from "../lib/ratelimit.ts";
import { getDrill, answerKey, DRILL_IDS } from "../drills/registry.ts";
import { MAX_PRIMITIVES } from "../lib/scoring/validate.ts";

const permissive = () => createRateLimiter({ limit: 1000, windowMs: 1000 });
const id = DRILL_IDS[0];

/** The correct answer, laid out so the three views cluster apart. */
function correctAttempt(drillId: string) {
  const key = answerKey(getDrill(drillId)!);
  const shift = (ps: typeof key.front, dx: number, dy: number) =>
    ps.map((p) => p.kind === "circle"
      ? { ...p, cx: p.cx + dx, cy: p.cy + dy }
      : { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy });
  // First-angle: top below the front, side to the left of it.
  return [...shift(key.front, 40, 40), ...shift(key.top, 40, 90), ...shift(key.side, 0, 40)];
}

test("a well-formed submission is scored", () => {
  const r = handleScoreRequest({ drillId: id, primitives: correctAttempt(id) }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 200);
  const body = r.body as { ok: boolean };
  assert.equal(body.ok, true);
});

test("an unknown drill id is a 404, not a 500", () => {
  const r = handleScoreRequest({ drillId: "nope", primitives: [] }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 404);
});

test("a body that is not an object is rejected", () => {
  for (const bad of [null, "hello", 42, []]) {
    assert.equal(handleScoreRequest(bad, "1.2.3.4", 0, permissive()).status, 400);
  }
});

test("a missing drill id is rejected before any drill is looked up", () => {
  const r = handleScoreRequest({ primitives: [] }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 400);
});

test("a non-string drill id is rejected", () => {
  const r = handleScoreRequest({ drillId: { evil: true }, primitives: [] }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 400);
});

test("an oversized primitive set is refused before scoring", () => {
  const many = Array.from({ length: MAX_PRIMITIVES + 1 }, (_, i) => ({
    kind: "segment", type: "visible", x1: 0, y1: i % 100, x2: 1, y2: i % 100,
  }));
  const r = handleScoreRequest({ drillId: id, primitives: many }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "TOO_MANY_PRIMITIVES");
});

test("a rate-limited caller gets 429 and is told when to retry", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 5000 });
  const body = { drillId: id, primitives: correctAttempt(id) };
  assert.equal(handleScoreRequest(body, "9.9.9.9", 0, rl).status, 200);
  const second = handleScoreRequest(body, "9.9.9.9", 100, rl);
  assert.equal(second.status, 429);
  assert.equal((second.body as { retryAfterMs: number }).retryAfterMs, 4900);
});

test("the rate limit is per caller", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 5000 });
  const body = { drillId: id, primitives: correctAttempt(id) };
  handleScoreRequest(body, "1.1.1.1", 0, rl);
  assert.equal(handleScoreRequest(body, "2.2.2.2", 0, rl).status, 200);
});

test("rate limiting is checked BEFORE the payload is validated", () => {
  // Otherwise a flood of huge bodies still costs full validation per request.
  const rl = createRateLimiter({ limit: 1, windowMs: 5000 });
  handleScoreRequest({ drillId: id, primitives: [] }, "3.3.3.3", 0, rl);
  const huge = Array.from({ length: MAX_PRIMITIVES + 1 }, () => ({ kind: "bogus" }));
  const r = handleScoreRequest({ drillId: id, primitives: huge }, "3.3.3.3", 1, rl);
  assert.equal(r.status, 429, "a throttled caller should not reach validation");
});

test("a wrong number of views is a scored outcome, not an HTTP error", () => {
  const r = handleScoreRequest(
    { drillId: id, primitives: [{ kind: "segment", type: "visible", x1: 0, y1: 0, x2: 4, y2: 0 }] },
    "1.2.3.4", 0, permissive(),
  );
  assert.equal(r.status, 200);
  assert.equal((r.body as { ok: boolean }).ok, false);
  assert.equal((r.body as { reason: string }).reason, "WRONG_VIEW_COUNT");
});

test("no response ever serialises the solid or the raw key", () => {
  const responses = [
    handleScoreRequest({ drillId: id, primitives: correctAttempt(id) }, "1.2.3.4", 0, permissive()),
    handleScoreRequest({ drillId: "nope", primitives: [] }, "1.2.3.4", 0, permissive()),
    handleScoreRequest({ drillId: id, primitives: [{ kind: "bad" }] }, "1.2.3.4", 0, permissive()),
  ];
  for (const r of responses) {
    const wire = JSON.stringify(r.body);
    assert.ok(!wire.includes('"solid"'), "a response serialised the solid");
    assert.ok(!wire.includes('"ops"'), "a response serialised the feature operations");
    assert.ok(!wire.includes('"base"'), "a response serialised the base block");
  }
});
