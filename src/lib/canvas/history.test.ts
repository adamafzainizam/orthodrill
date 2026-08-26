import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initHistory, push, undo, redo, canUndo, canRedo, MAX_HISTORY,
} from "./history.ts";

test("a fresh history has nothing to undo or redo", () => {
  const h = initHistory("a");
  assert.equal(canUndo(h), false);
  assert.equal(canRedo(h), false);
});

test("undo returns the previous state", () => {
  const h = push(push(initHistory("a"), "b"), "c");
  assert.equal(undo(h).present, "b");
  assert.equal(undo(undo(h)).present, "a");
});

test("undoing past the beginning stays at the beginning", () => {
  const h = undo(undo(undo(push(initHistory("a"), "b"))));
  assert.equal(h.present, "a");
});

test("redo returns a state that was undone", () => {
  const h = undo(push(initHistory("a"), "b"));
  assert.equal(redo(h).present, "b");
});

test("a new edit after undo discards the redo branch", () => {
  const h = push(undo(push(initHistory("a"), "b")), "c");
  assert.equal(canRedo(h), false);
  assert.equal(h.present, "c");
});

test("the stack is capped, so a long session cannot grow it without bound", () => {
  let h = initHistory(0);
  for (let i = 1; i <= MAX_HISTORY + 10; i++) h = push(h, i);
  assert.equal(h.past.length, MAX_HISTORY);
});

test("capping drops the OLDEST state, not the newest", () => {
  let h = initHistory(0);
  for (let i = 1; i <= MAX_HISTORY + 10; i++) h = push(h, i);
  // Undoing all the way back reaches state 10, not state 0.
  while (canUndo(h)) h = undo(h);
  assert.equal(h.present, 10);
});

test("pushing does not mutate the history it was given", () => {
  const before = initHistory("a");
  push(before, "b");
  assert.equal(before.present, "a");
  assert.equal(before.past.length, 0);
});
