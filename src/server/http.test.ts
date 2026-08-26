import { test } from "node:test";
import assert from "node:assert/strict";
import { bodyTooLarge, clientKeyFrom, parseJsonBody } from "./http.ts";

test("the client key comes from the forwarded-for header", () => {
  const h = new Headers({ "x-forwarded-for": "203.0.113.5" });
  assert.equal(clientKeyFrom(h), "203.0.113.5");
});

test("only the leftmost forwarded address is used", () => {
  const h = new Headers({ "x-forwarded-for": "203.0.113.5, 70.41.3.18, 150.172.238.178" });
  assert.equal(clientKeyFrom(h), "203.0.113.5");
});

test("surrounding whitespace in the header does not create a separate bucket", () => {
  assert.equal(clientKeyFrom(new Headers({ "x-forwarded-for": "  203.0.113.5  " })), "203.0.113.5");
});

test("a missing header still yields a usable key rather than throwing", () => {
  assert.equal(typeof clientKeyFrom(new Headers()), "string");
  assert.ok(clientKeyFrom(new Headers()).length > 0);
});

test("an absurdly long header value cannot be used to bloat the limiter's keys", () => {
  const h = new Headers({ "x-forwarded-for": "a".repeat(5000) });
  assert.ok(clientKeyFrom(h).length <= 64);
});

test("valid JSON is parsed", () => {
  const r = parseJsonBody('{"drillId":"x"}');
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.value, { drillId: "x" });
});

test("malformed JSON is reported, never thrown", () => {
  assert.equal(parseJsonBody("{not json").ok, false);
  assert.equal(parseJsonBody("").ok, false);
});

test("a declared body larger than the cap is refused", () => {
  assert.equal(bodyTooLarge(new Headers({ "content-length": "300000" }), 262_144), true);
});

test("a body exactly at the cap is allowed — the limit is inclusive", () => {
  assert.equal(bodyTooLarge(new Headers({ "content-length": "262144" }), 262_144), false);
});

test("an absent or unparseable content-length is not treated as oversized", () => {
  // It cannot be trusted either way; the read itself is capped separately.
  assert.equal(bodyTooLarge(new Headers(), 262_144), false);
  assert.equal(bodyTooLarge(new Headers({ "content-length": "banana" }), 262_144), false);
});
