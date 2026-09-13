import { test } from "node:test";
import assert from "node:assert/strict";
import { noticesFor , noticesForBuild } from "./messages.ts";
import type { FigureScoreResult, ScoreResult } from "../scoring/score.ts";

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
  if (r.ok) {
    r.placement = {
      correct: false,
      expected: { top: "below", side: "left" },
      actual: { top: "above", side: "left" },
      matchesOtherConvention: "third_angle",
    };
  }
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

// --- figure results: one diff, no placement, no per-view labels ---

const figureResult = (over: object = {}, perfect = false): FigureScoreResult => ({
  ok: true,
  perfect,
  diff: { ...emptyDiff, ...over },
});

test("a perfect figure says so and says nothing else", () => {
  const n = noticesFor(figureResult({}, true));
  assert.equal(n.length, 1);
  assert.equal(n[0].tone, "good");
});

test("a figure's missing segments are reported without a view label", () => {
  const n = noticesFor(figureResult({ missing: [line, line] }));
  assert.equal(n.length, 1);
  assert.match(n[0].text, /missing/i);
  assert.match(n[0].text, /2/);
  assert.doesNotMatch(n[0].text, /front|top|side|view/i);
  assert.equal(n[0].tone, "bad");
});

test("a figure's extra segments and wrong-type segments are separate notices", () => {
  const n = noticesFor(figureResult({
    extra: [line],
    wrongType: [{ expected: line, drawn: { ...line, type: "hidden" } }],
  }));
  assert.equal(n.length, 2);
  assert.ok(n.some((x) => /drawn that should not be there/i.test(x.text)));
  assert.ok(n.some((x) => /line type/i.test(x.text)));
});

test("a figure never mentions placement or a convention", () => {
  const n = noticesFor(figureResult({ missing: [line] }));
  assert.ok(!n.some((x) => /placement|convention|angle/i.test(x.text)));
});

test("a figure's notices carry stable unique ids too", () => {
  const n = noticesFor(figureResult({ missing: [line], extra: [line] }));
  assert.equal(new Set(n.map((x) => x.id)).size, n.length);
});

const region = (cells: [number, number, number][], where: string) =>
  ({ cells, where, views: ["front", "top", "side"] as const });

test("a perfect build is told so plainly", () => {
  const n = noticesForBuild({ ok: true, perfect: true, matchesAllViews: false, diff: { missing: [], extra: [] } });
  assert.equal(n.length, 1);
  assert.equal(n[0].tone, "good");
});

test("a view-consistent build is NOT told it is simply wrong", () => {
  // The honest outcome. Three views do not always describe one unique solid,
  // so a student can build something the drawing really does describe.
  const n = noticesForBuild({
    ok: true, perfect: false, matchesAllViews: true,
    diff: { missing: [], extra: [] },
  });
  assert.equal(n.length, 1);
  assert.equal(n[0].tone, "warn", "a correct reading must not be marked 'bad'");
  assert.match(n[0].text, /matches all three views/);
});

test("a missing region is named by where it sits, and counted in blocks", () => {
  const n = noticesForBuild({
    ok: true, perfect: false, matchesAllViews: false,
    diff: { missing: [region([[0, 0, 0]], "at the bottom front left")], extra: [] },
  });
  assert.equal(n.length, 1);
  assert.match(n[0].text, /at the bottom front left/);
  assert.match(n[0].text, /one block/, "a single cell must not read as '1 blocks'");
});

test("plural blocks read as plural", () => {
  const n = noticesForBuild({
    ok: true, perfect: false, matchesAllViews: false,
    diff: { missing: [], extra: [region([[0, 0, 0], [1, 0, 0]], "at the right")] },
  });
  assert.match(n[0].text, /2 blocks remain at the right/);
});

test("no notice ever names a view, because naming all three every time teaches nothing", () => {
  // AGENTS.md §6: every change to an occupancy changes all three views, so the
  // per-region `views` list is correct and uninformative. If this test ever
  // needs relaxing, it is because a partial case was found — say so there too.
  const n = noticesForBuild({
    ok: true, perfect: false, matchesAllViews: false,
    diff: {
      missing: [region([[0, 0, 0]], "at the top")],
      extra: [region([[2, 2, 2]], "at the back right")],
    },
  });
  for (const notice of n) {
    assert.doesNotMatch(notice.text, /\bfront view\b|\btop view\b|\bside view\b/,
      `notice named a view: "${notice.text}"`);
  }
});

test("a nearly-empty build gets a sentence that is actually about that", () => {
  const n = noticesForBuild({
    ok: true, perfect: false, matchesAllViews: false,
    diff: { missing: [region([[0, 0, 0]], "across most of the part")], extra: [] },
  });
  assert.match(n[0].text, /across most of the part/);
  assert.doesNotMatch(n[0].text, /one block/, "a 43-cell hole must not be described as a block count");
});
