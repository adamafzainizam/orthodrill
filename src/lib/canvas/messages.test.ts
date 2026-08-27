import { test } from "node:test";
import assert from "node:assert/strict";
import { noticesFor } from "./messages.ts";
import type { ScoreResult } from "../scoring/score.ts";

const emptyDiff = { correct: [], missing: [], extra: [], wrongType: [], anchor: { dx: 0, dy: 0 } };
const line = { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 1, y2: 0 } as const;

const result = (over: Partial<Record<"front" | "top" | "side", object>>, perfect = false): ScoreResult => ({
  ok: true,
  perfect,
  placement: { correct: true, expected: { top: "below", side: "left" }, actual: { top: "below", side: "left" }, matchesOtherConvention: null },
  views: {
    front: { ...emptyDiff, ...over.front },
    top: { ...emptyDiff, ...over.top },
    side: { ...emptyDiff, ...over.side },
  },
} as ScoreResult);

test("a perfect attempt says so and says nothing else", () => {
  const n = noticesFor(result({}, true));
  assert.equal(n.length, 1);
  assert.equal(n[0].tone, "good");
});

test("a missing line names the view it is missing from", () => {
  const n = noticesFor(result({ top: { missing: [line] } }));
  assert.equal(n.length, 1);
  assert.match(n[0].text, /top/i);
  assert.match(n[0].text, /missing/i);
  assert.equal(n[0].tone, "bad");
});

test("counts are reported, not one notice per primitive", () => {
  const n = noticesFor(result({ front: { missing: [line, line, line] } }));
  assert.equal(n.length, 1, "three missing lines should be one notice, not three");
  assert.match(n[0].text, /3/);
});

test("a wrong line type is reported separately from a missing line", () => {
  const n = noticesFor(result({ side: { wrongType: [{ expected: line, drawn: { ...line, type: "hidden" } }] } }));
  assert.equal(n.length, 1);
  assert.match(n[0].text, /line type|style/i);
});

test("wrong placement is its own notice, distinct from view content", () => {
  const r = result({});
  r.ok && (r.placement = { correct: false, expected: { top: "below", side: "left" }, actual: { top: "above", side: "left" }, matchesOtherConvention: "third_angle" });
  const n = noticesFor(r);
  assert.ok(n.some((x) => /placement|convention|angle/i.test(x.text)));
});

test("a wrong view count explains itself rather than blaming the drawing", () => {
  const n = noticesFor({ ok: false, reason: "WRONG_VIEW_COUNT", found: 2 });
  assert.equal(n.length, 1);
  assert.match(n[0].text, /three views/i);
  assert.match(n[0].text, /2/);
});

test("every notice carries a stable unique id, so a list can key on it", () => {
  const n = noticesFor(result({ front: { missing: [line] }, top: { extra: [line] } }));
  assert.equal(new Set(n.map((x) => x.id)).size, n.length);
});
