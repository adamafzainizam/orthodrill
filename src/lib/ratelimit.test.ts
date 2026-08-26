import { test } from "node:test";
import assert from "node:assert/strict";
import { createRateLimiter } from "./ratelimit.ts";

test("requests up to the limit are allowed", () => {
  const rl = createRateLimiter({ limit: 3, windowMs: 1000 });
  assert.equal(rl.check("a", 0).allowed, true);
  assert.equal(rl.check("a", 10).allowed, true);
  assert.equal(rl.check("a", 20).allowed, true);
});

test("the request past the limit is refused", () => {
  const rl = createRateLimiter({ limit: 2, windowMs: 1000 });
  rl.check("a", 0);
  rl.check("a", 1);
  assert.equal(rl.check("a", 2).allowed, false);
});

test("a refusal says how long to wait", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
  rl.check("a", 0);
  assert.equal(rl.check("a", 400).retryAfterMs, 600);
});

test("the allowance returns once the window has passed", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
  rl.check("a", 0);
  assert.equal(rl.check("a", 999).allowed, false);
  assert.equal(rl.check("a", 1000).allowed, true);
});

test("one caller exhausting its allowance does not affect another", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 1000 });
  rl.check("a", 0);
  assert.equal(rl.check("a", 1).allowed, false);
  assert.equal(rl.check("b", 1).allowed, true);
});

test("tracked callers are capped, so unique keys cannot exhaust memory", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
  rl.check("a", 0);
  rl.check("b", 1);
  rl.check("c", 2);
  assert.ok(rl.size() <= 2, `tracked ${rl.size()} keys, cap was 2`);
});

test("eviction under the key cap drops the least recently seen caller", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 10_000, maxKeys: 2 });
  rl.check("old", 0);
  rl.check("recent", 1);
  rl.check("recent", 2); // refused, but refreshes recency
  rl.check("new", 3);    // a third key under a cap of 2 forces an eviction

  // Assert on the SURVIVOR first. Checking an evicted key is itself a new key
  // under the cap and evicts again, so asserting in the other order would
  // destroy the state being asserted on.
  assert.equal(rl.check("recent", 4).allowed, false, "recent was the newest and should have survived");
  assert.equal(rl.check("old", 5).allowed, true, "old was least recently seen and should have been evicted");
});

test("expired entries are not retained once their window has passed", () => {
  const rl = createRateLimiter({ limit: 1, windowMs: 100 });
  rl.check("a", 0);
  rl.check("b", 500);
  assert.equal(rl.size(), 1, "the expired entry for 'a' should have been dropped");
});
