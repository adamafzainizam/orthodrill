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

test("construction lines joining the three views do not collapse them into one cluster", () => {
  // This is the reported bug: a mitre line and projection lines crossing the
  // whole sheet connect all three view-clusters into one, so the scorer used
  // to see one cluster instead of three. Construction lines must be stripped
  // before clustering, not merely tolerated by it.
  const attempt = laidOut("first_angle");
  const construction: Primitive[] = [
    // A long mitre-style line and projection lines that bridge the front,
    // top and side clusters — exactly what connects them under `near()`.
    seg(-50, -50, 90, 90, "construction"),
    seg(0, 0, 40, 0, "construction"),
    seg(0, 0, 0, 40, "construction"),
  ];
  const r = scoreAttempt([...attempt, ...construction], key, "first_angle");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.perfect, true);
});

test("construction lines never appear in any ViewDiff", () => {
  const attempt = laidOut("first_angle");
  const construction: Primitive[] = [
    seg(-50, -50, 90, 90, "construction"),
    seg(0, 0, 40, 0, "construction"),
  ];
  const r = scoreAttempt([...attempt, ...construction], key, "first_angle");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  for (const name of ["front", "top", "side"] as const) {
    const d = r.views[name];
    for (const bucket of [d.correct, d.missing, d.extra]) {
      assert.ok(bucket.every((p) => p.type !== "construction"));
    }
    assert.ok(d.wrongType.every((wt) => wt.expected.type !== "construction" && wt.drawn.type !== "construction"));
  }
});

test("a perfect attempt stays perfect when construction lines are added to it", () => {
  const attempt = laidOut("first_angle");
  const construction: Primitive[] = [
    seg(-50, -50, 90, 90, "construction"),
    seg(20, -20, 20, 60, "construction"),
  ];
  const r = scoreAttempt([...attempt, ...construction], key, "first_angle");
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.perfect, true);
  assert.equal(r.placement.correct, true);
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
