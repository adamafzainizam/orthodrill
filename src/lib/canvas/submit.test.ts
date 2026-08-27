import { test } from "node:test";
import assert from "node:assert/strict";
import { submitAttempt } from "./submit.ts";

const ok = (body: unknown) => async () =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("a submission posts the drill id and the primitives", async () => {
  let seen: { url: string; body: string } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url: String(url), body: String(init.body) };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;

  await submitAttempt("step-block", [{ kind: "segment", type: "visible", x1: 0, y1: 0, x2: 1, y2: 0 }], fake);

  assert.match(seen!.url, /\/api\/score$/);
  assert.match(seen!.body, /"drillId":"step-block"/);
  assert.match(seen!.body, /"kind":"views"/);
});

test("a scored result is returned as-is", async () => {
  const result = await submitAttempt("step-block", [], ok({ ok: false, reason: "WRONG_VIEW_COUNT", found: 0 }) as unknown as typeof fetch);
  assert.deepEqual(result, { ok: false, reason: "WRONG_VIEW_COUNT", found: 0 });
});

test("a rate-limited response surfaces as a reason, not a crash", async () => {
  const limited = (async () => new Response(JSON.stringify({ ok: false, reason: "RATE_LIMITED", retryAfterMs: 5000 }), { status: 429 })) as unknown as typeof fetch;
  const result = await submitAttempt("step-block", [], limited);
  assert.equal(result.ok, false);
  assert.equal((result as { reason: string }).reason, "RATE_LIMITED");
});

test("a network failure surfaces as a reason rather than throwing", async () => {
  const broken = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const result = await submitAttempt("step-block", [], broken);
  assert.equal(result.ok, false);
  assert.equal((result as { reason: string }).reason, "NETWORK");
});
