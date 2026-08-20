import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreAttempt } from "./score.ts";
import { CONVENTIONS } from "./placement.ts";
import type { KeyViews } from "./assign.ts";
import type { Primitive, Segment } from "./primitives.ts";

const seg = (x1: number, y1: number, x2: number, y2: number,
             type: Segment["type"] = "visible"): Segment =>
  ({ kind: "segment", type, x1, y1, x2, y2 });

const key: KeyViews = {
  front: [seg(0, 0, 4, 0), seg(0, 0, 0, 4)],
  top: [seg(0, 0, 6, 0)],
  side: [seg(0, 0, 0, 8)],
};

const move = (ps: Primitive[], dx: number, dy: number): Primitive[] =>
  ps.map((p) => {
    const s = p as Segment;
    return seg(s.x1 + dx, s.y1 + dy, s.x2 + dx, s.y2 + dy, s.type);
  });

/** Lay the three views out correctly for a convention. */
function laidOut(conv: "first_angle" | "third_angle"): Primitive[] {
  const c = CONVENTIONS[conv];
  const topDy = c.top === "below" ? 40 : -40;
  const sideDx = c.side === "right" ? 40 : -40;
  return [
    ...move(key.front, 0, 0),
    ...move(key.top, 0, topDy),
    ...move(key.side, sideDx, 0),
  ];
}

test("a correct attempt scores perfect", () => {
  const r = scoreAttempt(laidOut("first_angle"), key, "first_angle");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.perfect, true);
  assert.equal(r.placement.correct, true);
});

test("too few views is reported as a view-count problem, not a wrong drawing", () => {
  const r = scoreAttempt(move(key.front, 0, 0), key, "first_angle");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "WRONG_VIEW_COUNT");
  assert.equal(r.found, 1);
});

test("an empty drawing is a view-count problem with zero views", () => {
  const r = scoreAttempt([], key, "first_angle");
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.found, 0);
});

test("correct views under the wrong convention are not perfect, but the views are clean", () => {
  const r = scoreAttempt(laidOut("third_angle"), key, "first_angle");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.perfect, false);
  assert.equal(r.placement.correct, false);
  assert.equal(r.placement.matchesOtherConvention, "third_angle");
  assert.equal(r.views.front.missing.length, 0);
  assert.equal(r.views.top.missing.length, 0);
  assert.equal(r.views.side.missing.length, 0);
});

test("a hidden edge drawn solid surfaces as wrongType on the right view", () => {
  const keyWithHidden: KeyViews = { ...key, top: [seg(0, 0, 6, 0, "hidden")] };
  const c = CONVENTIONS.first_angle;
  const topDy = c.top === "below" ? 40 : -40;
  const sideDx = c.side === "right" ? 40 : -40;
  const attempt = [
    ...move(keyWithHidden.front, 0, 0),
    ...move([seg(0, 0, 6, 0, "visible")], 0, topDy),
    ...move(keyWithHidden.side, sideDx, 0),
  ];
  const r = scoreAttempt(attempt, keyWithHidden, "first_angle");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.views.top.wrongType.length, 1);
  assert.equal(r.perfect, false);
});
