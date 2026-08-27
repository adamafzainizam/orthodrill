import { test } from "node:test";
import assert from "node:assert/strict";
import { submitAttempt } from "./submit.ts";

const ok = (body: unknown) => async () =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("a submission posts the drill id, kind and the primitives", async () => {
  let seen: { url: string; body: string } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url: String(url), body: String(init.body) };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;

  await submitAttempt("step-block", "views", [{ kind: "segment", type: "visible", x1: 0, y1: 0, x2: 1, y2: 0 }], fake);

  assert.match(seen!.url, /\/api\/score$/);
  assert.match(seen!.body, /"drillId":"step-block"/);
  assert.match(seen!.body, /"kind":"views"/);
});

test("a figure submission posts kind: figure, not the views default", async () => {
  let seen: { body: string } | null = null;
  const fake = (async (_url: string, init: RequestInit) => {
    seen = { body: String(init.body) };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;

  await submitAttempt("parabola-rectangle-5", "figure", [
    { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 1, y2: 1 },
  ], fake);

  assert.match(seen!.body, /"drillId":"parabola-rectangle-5"/);
  assert.match(seen!.body, /"kind":"figure"/);
});

test("construction primitives are not present in the posted body", async () => {
  let seen: { body: string } | null = null;
  const fake = (async (_url: string, init: RequestInit) => {
    seen = { body: String(init.body) };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;

  await submitAttempt("step-block", "views", [
    { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 1, y2: 0 },
    { kind: "segment", type: "construction", x1: 0, y1: 0, x2: 9, y2: 9 },
  ], fake);

  assert.doesNotMatch(seen!.body, /construction/);
});

test("a scored result is returned as-is", async () => {
  const result = await submitAttempt("step-block", "views", [], ok({ ok: false, reason: "WRONG_VIEW_COUNT", found: 0 }) as unknown as typeof fetch);
  assert.deepEqual(result, { ok: false, reason: "WRONG_VIEW_COUNT", found: 0 });
});

test("a figure result (diff, not views) is returned as-is", async () => {
  const emptyDiff = { correct: [], missing: [], extra: [], wrongType: [], anchor: { dx: 0, dy: 0 } };
  const body = { ok: true, diff: emptyDiff, perfect: true };
  const result = await submitAttempt("parabola-rectangle-5", "figure", [], ok(body) as unknown as typeof fetch);
  assert.deepEqual(result, body);
});

test("a rate-limited response surfaces as a reason, not a crash", async () => {
  const limited = (async () => new Response(JSON.stringify({ ok: false, reason: "RATE_LIMITED", retryAfterMs: 5000 }), { status: 429 })) as unknown as typeof fetch;
  const result = await submitAttempt("step-block", "views", [], limited);
  assert.equal(result.ok, false);
  assert.equal((result as { reason: string }).reason, "RATE_LIMITED");
});

test("a network failure surfaces as a reason rather than throwing", async () => {
  const broken = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const result = await submitAttempt("step-block", "views", [], broken);
  assert.equal(result.ok, false);
  assert.equal((result as { reason: string }).reason, "NETWORK");
});
