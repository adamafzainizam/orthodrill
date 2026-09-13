import { test } from "node:test";
import assert from "node:assert/strict";
import { latestBatch, isFresh } from "./ribbon.ts";

test("latestBatch returns null for an empty registry", () => {
  assert.equal(latestBatch([]), null);
});

test("a single date becomes the whole batch", () => {
  const entries = [
    { addedOn: "2026-09-06", topicId: "reading-views" },
    { addedOn: "2026-09-06", topicId: "reading-views" },
  ];
  assert.deepEqual(latestBatch(entries), { date: "2026-09-06", count: 2, topicId: "reading-views" });
});

test("only the maximum date is counted; older entries do not inflate it", () => {
  const entries = [
    { addedOn: "2026-08-26", topicId: "orthographic" },
    { addedOn: "2026-08-26", topicId: "orthographic" },
    { addedOn: "2026-09-14", topicId: "orthographic" },
  ];
  const batch = latestBatch(entries)!;
  assert.equal(batch.date, "2026-09-14");
  assert.equal(batch.count, 1);
});

test("a batch whose entries share one topic reports that topic", () => {
  const entries = [
    { addedOn: "2026-09-13", topicId: "reading-views" },
    { addedOn: "2026-09-13", topicId: "reading-views" },
    { addedOn: "2026-09-13", topicId: "reading-views" },
  ];
  assert.equal(latestBatch(entries)!.topicId, "reading-views");
});

// POSITIVE CONTROL. getUpdateRibbon() (registry.ts) only ever calls
// latestBatch over the WHOLE registry, whose newest batch happens to span
// three topics today — so the single-topic case above is the only branch a
// real-registry-only suite could ever reach, and it alone cannot catch a
// hardcoded href. This is the case that can. See design spec §8 and
// AGENTS.md §6's recorded "views" field that always said all three, for the
// same failure class: a property test that passes with the property gone.
test("a batch spanning two topics reports no single topic, and sums the count", () => {
  const entries = [
    { addedOn: "2026-09-14", topicId: "orthographic" },
    { addedOn: "2026-09-14", topicId: "constructions" },
    { addedOn: "2026-09-14", topicId: "oblique" },
  ];
  const batch = latestBatch(entries)!;
  assert.equal(batch.topicId, null);
  assert.equal(batch.count, 3);
});

test("isFresh is true well inside the window", () => {
  assert.equal(isFresh("2026-09-14", new Date(2026, 8, 15)), true); // 1 day later
});

test("isFresh is false well outside the window", () => {
  assert.equal(isFresh("2026-09-14", new Date(2026, 10, 1)), false); // 48 days later
});

test("isFresh treats exactly windowDays as stale, one day short as fresh", () => {
  const date = "2026-09-14";
  const exactlyAtWindow = new Date(2026, 9, 14); // 30 days after Sep 14
  const oneDayShort = new Date(2026, 9, 13); // 29 days after
  assert.equal(isFresh(date, exactlyAtWindow, 30), false);
  assert.equal(isFresh(date, oneDayShort, 30), true);
});
