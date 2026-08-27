import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateAttempt,
  MAX_PRIMITIVES,
  MAX_COORD,
  MAX_RADIUS,
} from "./validate.ts";

const seg = (x1: number, y1: number, x2: number, y2: number) =>
  ({ kind: "segment", type: "visible", x1, y1, x2, y2 });

test("a well-formed attempt is accepted", () => {
  const r = validateAttempt([seg(0, 0, 4, 0)]);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.primitives.length, 1);
});

test("input that is not an array is rejected", () => {
  assert.equal(validateAttempt({ 0: seg(0, 0, 1, 0) }).ok, false);
  assert.equal(validateAttempt("[]").ok, false);
  assert.equal(validateAttempt(null).ok, false);
});

test("more primitives than the cap is rejected", () => {
  const many = Array.from({ length: MAX_PRIMITIVES + 1 }, (_, i) => seg(0, i, 1, i));
  const r = validateAttempt(many);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "TOO_MANY_PRIMITIVES");
});

test("exactly the cap is accepted — the limit is inclusive", () => {
  const many = Array.from({ length: MAX_PRIMITIVES }, (_, i) => seg(0, i % 50, 1, i % 50));
  assert.equal(validateAttempt(many).ok, true);
});

test("a coordinate beyond the bound is rejected", () => {
  assert.equal(validateAttempt([seg(0, 0, MAX_COORD + 1, 0)]).ok, false);
  assert.equal(validateAttempt([seg(-MAX_COORD - 1, 0, 0, 0)]).ok, false);
});

test("a non-finite coordinate is rejected", () => {
  assert.equal(validateAttempt([seg(0, 0, Number.NaN, 0)]).ok, false);
  assert.equal(validateAttempt([seg(0, 0, Number.POSITIVE_INFINITY, 0)]).ok, false);
});

test("a non-integer coordinate is rejected — the grid snaps", () => {
  const r = validateAttempt([seg(0, 0, 1.5, 0)]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "NOT_ON_GRID");
});

test("a construction-type primitive is accepted", () => {
  const r = validateAttempt([{ kind: "segment", type: "construction", x1: 0, y1: 0, x2: 4, y2: 0 }]);
  assert.equal(r.ok, true);
  assert.equal(r.ok && r.primitives[0].type, "construction");
});

test("an unknown line type is rejected", () => {
  const r = validateAttempt([{ kind: "segment", type: "dotted", x1: 0, y1: 0, x2: 1, y2: 0 }]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "BAD_TYPE");
});

test("an unknown primitive kind is rejected", () => {
  assert.equal(validateAttempt([{ kind: "arc", type: "visible", x1: 0, y1: 0, x2: 1, y2: 0 }]).ok, false);
});

test("a zero-length segment is rejected — it is not a line", () => {
  const r = validateAttempt([seg(3, 3, 3, 3)]);
  assert.equal(r.ok, false);
  assert.equal(r.ok === false && r.reason, "DEGENERATE");
});

test("a circle with a non-positive radius is rejected", () => {
  const circle = (r: number) => ({ kind: "circle", type: "visible", cx: 0, cy: 0, r });
  assert.equal(validateAttempt([circle(0)]).ok, false);
  assert.equal(validateAttempt([circle(-2)]).ok, false);
});

test("a circle radius beyond the bound is rejected", () => {
  assert.equal(
    validateAttempt([{ kind: "circle", type: "visible", cx: 0, cy: 0, r: MAX_RADIUS + 1 }]).ok,
    false,
  );
});

test("a valid circle is accepted", () => {
  const r = validateAttempt([{ kind: "circle", type: "hidden", cx: 2, cy: 3, r: 4 }]);
  assert.equal(r.ok, true);
});

test("validated primitives are rebuilt, so unknown properties cannot ride along", () => {
  const r = validateAttempt([
    { ...seg(0, 0, 1, 0), evil: "payload", __proto__: { polluted: true } },
  ]);
  assert.equal(r.ok, true);
  const p = r.ok ? r.primitives[0] : null;
  assert.deepEqual(Object.keys(p as object).sort(), ["kind", "type", "x1", "x2", "y1", "y2"]);
});

test("one bad primitive rejects the whole attempt, rather than being dropped", () => {
  const r = validateAttempt([seg(0, 0, 1, 0), seg(0, 0, Number.NaN, 0)]);
  assert.equal(r.ok, false);
});
