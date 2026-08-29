import { test } from "node:test";
import assert from "node:assert/strict";
import { initEditor, reduce, drawing, pendingPrimitive, type EditorState } from "./editor.ts";
import { initHistory } from "./history.ts";
import { MAX_PRIMITIVES, MAX_RADIUS } from "../scoring/validate.ts";
import type { Primitive } from "../scoring/primitives.ts";

const run = (actions: Parameters<typeof reduce>[1][]): EditorState =>
  actions.reduce((s, a) => reduce(s, a), initEditor());

test("two clicks with the line tool commit one segment", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 1, y: 1 }, additive: false },
    { type: "CLICK_GRID", at: { x: 5, y: 1 }, additive: false },
  ]);
  assert.deepEqual(drawing(s), [
    { kind: "segment", type: "visible", x1: 1, y1: 1, x2: 5, y2: 1 },
  ]);
});

test("one click alone draws nothing — the segment is not committed yet", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 1, y: 1 }, additive: false },
  ]);
  assert.deepEqual(drawing(s), []);
  assert.deepEqual(s.pending, { x: 1, y: 1 });
});

test("cancel abandons a half-drawn segment", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 1, y: 1 }, additive: false },
    { type: "CANCEL" },
  ]);
  assert.equal(s.pending, null);
  assert.deepEqual(drawing(s), []);
});

test("a zero-length segment is not committed", () => {
  // validate.ts rejects it server-side; it must never be drawable either.
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 2, y: 2 }, additive: false },
    { type: "CLICK_GRID", at: { x: 2, y: 2 }, additive: false },
  ]);
  assert.deepEqual(drawing(s), []);
});

test("the active line type is what gets drawn", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "SET_ACTIVE_TYPE", lineType: "hidden" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
  ]);
  assert.equal(drawing(s)[0].type, "hidden");
});

test("two clicks with the circle tool commit a circle with a whole radius", () => {
  const s = run([
    { type: "SET_TOOL", tool: "circle" },
    { type: "CLICK_GRID", at: { x: 5, y: 5 }, additive: false },
    { type: "CLICK_GRID", at: { x: 8, y: 9 }, additive: false },
  ]);
  assert.deepEqual(drawing(s), [
    { kind: "circle", type: "visible", cx: 5, cy: 5, r: 5 },
  ]);
});

test("selecting replaces the selection, ctrl-clicking extends it", () => {
  const drawn = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 0, y: 2 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 2 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
  ]);
  const one = reduce(drawn, { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false });
  assert.deepEqual(one.selection, [0]);
  const two = reduce(one, { type: "CLICK_GRID", at: { x: 0, y: 2 }, additive: true });
  assert.deepEqual(two.selection.sort(), [0, 1]);
  const back = reduce(two, { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false });
  assert.deepEqual(back.selection, [0]);
});

test("clicking empty space with the select tool clears the selection", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 50, y: 50 }, additive: false },
  ]);
  assert.deepEqual(s.selection, []);
});

test("retyping a selection changes it in place without moving it", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "RETYPE_SELECTION", lineType: "hidden" },
  ]);
  assert.deepEqual(drawing(s), [
    { kind: "segment", type: "hidden", x1: 0, y1: 0, x2: 4, y2: 0 },
  ]);
});

test("moving a selection shifts every one of its primitives by the same delta", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "MOVE_SELECTION", dx: 3, dy: -2 },
  ]);
  assert.deepEqual(drawing(s), [
    { kind: "segment", type: "visible", x1: 3, y1: -2, x2: 7, y2: -2 },
  ]);
});

test("deleting removes exactly the selection and clears it", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 0, y: 2 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 2 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "DELETE_SELECTION" },
  ]);
  assert.equal(drawing(s).length, 1);
  assert.deepEqual(drawing(s)[0], { kind: "segment", type: "visible", x1: 0, y1: 2, x2: 4, y2: 2 });
  assert.deepEqual(s.selection, []);
});

test("undo reverses a draw, and redo restores it", () => {
  const drawn = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
  ]);
  const undone = reduce(drawn, { type: "UNDO" });
  assert.deepEqual(drawing(undone), []);
  assert.deepEqual(drawing(reduce(undone, { type: "REDO" })), drawing(drawn));
});

test("undo reverses a move", () => {
  const moved = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "MOVE_SELECTION", dx: 5, dy: 5 },
  ]);
  assert.deepEqual(drawing(reduce(moved, { type: "UNDO" })), [
    { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 4, y2: 0 },
  ]);
});

test("switching tools abandons a half-drawn primitive", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 1, y: 1 }, additive: false },
    { type: "SET_TOOL", tool: "circle" },
  ]);
  assert.equal(s.pending, null);
});

test("a drawing at MAX_PRIMITIVES refuses to grow, and clears the pending anchor", () => {
  // validate.ts rejects an attempt over MAX_PRIMITIVES server-side (400); the
  // reducer must not be able to produce what the server would refuse. Built
  // directly rather than by dispatching 400 pairs of clicks.
  const full: Primitive[] = Array.from({ length: MAX_PRIMITIVES }, (_, i) => ({
    kind: "segment", type: "visible", x1: 0, y1: i, x2: 1, y2: i,
  }));
  const atCap: EditorState = {
    ...initEditor(),
    history: initHistory(full),
    tool: "line",
    pending: { x: 0, y: 0 },
  };
  const after = reduce(atCap, { type: "CLICK_GRID", at: { x: 5, y: 5 }, additive: false });
  assert.equal(drawing(after).length, MAX_PRIMITIVES);
  assert.equal(after.pending, null);
});

test("the reducer never mutates the state it is given", () => {
  const before = initEditor();
  reduce(before, { type: "SET_TOOL", tool: "line" });
  assert.equal(before.tool, "select");
});

// --- rubber-band select (drag in "select" mode) ---------------------------

test("dragging a rectangle in select mode selects a primitive wholly inside it", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 2, y: 2 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 2 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "DRAG_BEGIN", at: { x: 0, y: 0 } },
    { type: "DRAG_UPDATE", at: { x: 10, y: 10 } },
    { type: "DRAG_COMMIT", additive: false },
  ]);
  assert.deepEqual(s.selection, [0]);
  assert.equal(s.drag, null);
});

test("a primitive wholly outside the rectangle is not selected", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 20, y: 20 }, additive: false },
    { type: "CLICK_GRID", at: { x: 24, y: 20 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "DRAG_BEGIN", at: { x: 0, y: 0 } },
    { type: "DRAG_UPDATE", at: { x: 10, y: 10 } },
    { type: "DRAG_COMMIT", additive: false },
  ]);
  assert.deepEqual(s.selection, []);
});

// PIN: a primitive only PARTLY inside the rectangle is NOT selected. Wholly
// enclosed is the rule — every endpoint (both ends of a segment, or the
// circle's full extent) must fall within the rectangle. This is the
// conventional choice (matches how most drawing tools rubber-band select)
// and is simpler to reason about and test than intersection, which would
// have to special-case tangencies and crossing lines. Deliberate, not
// incidental — see also the plan's Task 3 write-up.
test("a primitive only partly inside the rectangle is not selected", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 5, y: 5 }, additive: false },
    { type: "CLICK_GRID", at: { x: 15, y: 5 }, additive: false }, // crosses the rectangle's right edge
    { type: "SET_TOOL", tool: "select" },
    { type: "DRAG_BEGIN", at: { x: 0, y: 0 } },
    { type: "DRAG_UPDATE", at: { x: 10, y: 10 } },
    { type: "DRAG_COMMIT", additive: false },
  ]);
  assert.deepEqual(s.selection, []);
});

test("an additive rectangle drag adds to the existing selection instead of replacing it", () => {
  const drawn = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 1, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 20, y: 20 }, additive: false },
    { type: "CLICK_GRID", at: { x: 21, y: 20 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
  ]);
  assert.deepEqual(drawn.selection, [0]);
  const after = reduce(reduce(reduce(drawn,
    { type: "DRAG_BEGIN", at: { x: 19, y: 19 } }),
    { type: "DRAG_UPDATE", at: { x: 22, y: 21 } }),
    { type: "DRAG_COMMIT", additive: true });
  assert.deepEqual(after.selection.sort(), [0, 1]);
});

test("a rectangle that encloses nothing clears the selection (non-additive)", () => {
  const drawn = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 1, y: 0 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
  ]);
  assert.deepEqual(drawn.selection, [0]);
  const after = reduce(reduce(reduce(drawn,
    { type: "DRAG_BEGIN", at: { x: 50, y: 50 } }),
    { type: "DRAG_UPDATE", at: { x: 60, y: 60 } }),
    { type: "DRAG_COMMIT", additive: false });
  assert.deepEqual(after.selection, []);
});

test("a rectangle that encloses nothing leaves the selection alone (additive)", () => {
  const drawn = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 1, y: 0 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
  ]);
  assert.deepEqual(drawn.selection, [0]);
  const after = reduce(reduce(reduce(drawn,
    { type: "DRAG_BEGIN", at: { x: 50, y: 50 } }),
    { type: "DRAG_UPDATE", at: { x: 60, y: 60 } }),
    { type: "DRAG_COMMIT", additive: true });
  assert.deepEqual(after.selection, [0]);
});

// --- move tool drag ---------------------------------------------------

test("a move drag commits exactly one history entry", () => {
  const drawn = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
  ]);
  const depthBefore = drawn.history.past.length;
  const s = reduce(drawn, { type: "SET_TOOL", tool: "move" });
  const dragged = reduce(reduce(reduce(reduce(reduce(s,
    { type: "DRAG_BEGIN", at: { x: 0, y: 0 } }),
    { type: "DRAG_UPDATE", at: { x: 1, y: 0 } }),
    { type: "DRAG_UPDATE", at: { x: 2, y: 0 } }),
    { type: "DRAG_UPDATE", at: { x: 3, y: 0 } }),
    { type: "DRAG_COMMIT", additive: false });
  assert.equal(dragged.history.past.length, depthBefore + 1);
  assert.deepEqual(drawing(dragged), [
    { kind: "segment", type: "visible", x1: 3, y1: 0, x2: 7, y2: 0 },
  ]);
  const undone = reduce(dragged, { type: "UNDO" });
  assert.deepEqual(drawing(undone), [
    { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 4, y2: 0 },
  ]);
});

test("a move drag with an empty selection changes nothing", () => {
  const s = run([
    { type: "SET_TOOL", tool: "line" },
    { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false },
    { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false },
    { type: "SET_TOOL", tool: "move" },
  ]);
  const depthBefore = s.history.past.length;
  const dragged = reduce(reduce(reduce(s,
    { type: "DRAG_BEGIN", at: { x: 0, y: 0 } }),
    { type: "DRAG_UPDATE", at: { x: 5, y: 5 } }),
    { type: "DRAG_COMMIT", additive: false });
  assert.equal(dragged.history.past.length, depthBefore);
  assert.deepEqual(drawing(dragged), drawing(s));
});

test("switching tools mid-drag abandons the drag rather than leaving stale drag state", () => {
  const s = run([
    { type: "SET_TOOL", tool: "select" },
    { type: "DRAG_BEGIN", at: { x: 0, y: 0 } },
    { type: "DRAG_UPDATE", at: { x: 5, y: 5 } },
    { type: "SET_TOOL", tool: "line" },
  ]);
  assert.equal(s.drag, null);
  // And a stray commit after the tool switch must not act on the abandoned drag.
  const after = reduce(s, { type: "DRAG_COMMIT", additive: false });
  assert.deepEqual(after, s);
});

test("the circle preview is EXACTLY the circle that commits, including at both radius clamps", () => {
  const cases: Array<[{ x: number; y: number }, { x: number; y: number }]> = [
    [{ x: 10, y: 10 }, { x: 10, y: 10 }],   // zero drag -> clamps up to r = 1
    [{ x: 10, y: 10 }, { x: 13, y: 10 }],   // ordinary
    [{ x: 10, y: 10 }, { x: 14, y: 13 }],   // 3-4-5, rounds to exactly 5
    [{ x: 10, y: 10 }, { x: 12, y: 13 }],   // hypot 3.606 -> rounds to 4
    [{ x: 0, y: 0 }, { x: 180, y: 0 }],     // beyond MAX_RADIUS -> clamps down
  ];
  for (const [from, to] of cases) {
    const preview = pendingPrimitive("circle", "visible", from, to);
    const s = run([
      { type: "SET_TOOL", tool: "circle" },
      { type: "CLICK_GRID", at: from, additive: false },
      { type: "CLICK_GRID", at: to, additive: false },
    ]);
    assert.deepEqual([preview], drawing(s), `preview diverged for ${JSON.stringify([from, to])}`);
  }
  const clamped = pendingPrimitive("circle", "visible", { x: 0, y: 0 }, { x: 180, y: 0 });
  assert.equal(clamped?.kind === "circle" ? clamped.r : -1, MAX_RADIUS);
});

test("the line preview is null exactly when the click would commit nothing", () => {
  assert.equal(pendingPrimitive("line", "visible", { x: 4, y: 4 }, { x: 4, y: 4 }), null);
  assert.deepEqual(pendingPrimitive("line", "hidden", { x: 4, y: 4 }, { x: 9, y: 4 }), {
    kind: "segment", type: "hidden", x1: 4, y1: 4, x2: 9, y2: 4,
  });
  assert.equal(pendingPrimitive("select", "visible", { x: 0, y: 0 }, { x: 3, y: 3 }), null);
  assert.equal(pendingPrimitive("move", "visible", { x: 0, y: 0 }, { x: 3, y: 3 }), null);
});

const twoLines = [
  { type: "SET_TOOL", tool: "line" } as const,
  { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false } as const,
  { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false } as const,
  { type: "CLICK_GRID", at: { x: 0, y: 2 }, additive: false } as const,
  { type: "CLICK_GRID", at: { x: 4, y: 2 }, additive: false } as const,
];

const selectAll = [
  { type: "SET_TOOL", tool: "select" } as const,
  { type: "DRAG_BEGIN", at: { x: -1, y: -1 } } as const,
  { type: "DRAG_UPDATE", at: { x: 6, y: 4 } } as const,
  { type: "DRAG_COMMIT", additive: false } as const,
];

test("paste appends the copied primitives and selects exactly them", () => {
  const s = run([
    ...twoLines,
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 2, y: 0 }, additive: false },
    { type: "COPY_SELECTION" },
    { type: "PASTE" },
  ]);
  assert.equal(drawing(s).length, 3);
  assert.deepEqual(s.selection, [2]);
  assert.deepEqual(drawing(s)[2], {
    kind: "segment", type: "visible", x1: 1, y1: 1, x2: 5, y2: 1,
  });
});

test("a repeated paste steps further out, so copies never hide under each other", () => {
  const s = run([
    ...twoLines,
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 2, y: 0 }, additive: false },
    { type: "COPY_SELECTION" },
    { type: "PASTE" },
    { type: "PASTE" },
  ]);
  assert.equal(drawing(s).length, 4);
  assert.deepEqual(drawing(s)[2], { kind: "segment", type: "visible", x1: 1, y1: 1, x2: 5, y2: 1 });
  assert.deepEqual(drawing(s)[3], { kind: "segment", type: "visible", x1: 2, y1: 2, x2: 6, y2: 2 });
  assert.deepEqual(s.selection, [3]);
});

test("one undo removes a whole paste, however many primitives it held", () => {
  const s = run([...twoLines, ...selectAll, { type: "COPY_SELECTION" }, { type: "PASTE" }, { type: "UNDO" }]);
  assert.equal(drawing(s).length, 2);
});

test("paste refuses WHOLLY at the cap rather than pasting part of the clipboard", () => {
  const near: Primitive[] = Array.from({ length: MAX_PRIMITIVES - 1 }, (_, i) => ({
    kind: "segment", type: "visible", x1: 0, y1: i, x2: 1, y2: i,
  }));
  const s: EditorState = {
    ...initEditor(),
    history: initHistory(near),
    clipboard: [
      { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 1, y2: 0 },
      { kind: "segment", type: "visible", x1: 0, y1: 1, x2: 1, y2: 1 },
    ],
  };
  assert.equal(drawing(reduce(s, { type: "PASTE" })).length, MAX_PRIMITIVES - 1);
});

test("copying nothing, and pasting nothing, are both no-ops that keep what is held", () => {
  const copied = run([
    ...twoLines,
    { type: "SET_TOOL", tool: "select" },
    { type: "CLICK_GRID", at: { x: 2, y: 0 }, additive: false },
    { type: "COPY_SELECTION" },
  ]);
  // An empty selection must not wipe the clipboard.
  const after = reduce({ ...copied, selection: [] }, { type: "COPY_SELECTION" });
  assert.equal(after.clipboard.length, 1);
  // An empty clipboard makes PASTE a no-op.
  assert.deepEqual(drawing(reduce(initEditor(), { type: "PASTE" })), []);
});

test("rotate turns the selection about the default base and commits one entry", () => {
  const s = run([
    ...twoLines, ...selectAll,
    { type: "ROTATE_SELECTION", quarterTurns: 1 },
  ]);
  for (const p of drawing(s)) {
    if (p.kind !== "segment") continue;
    for (const n of [p.x1, p.y1, p.x2, p.y2]) assert.equal(Number.isInteger(n), true);
  }
  assert.deepEqual(drawing(reduce(s, { type: "UNDO" })), drawing(run(twoLines)));
});

test("a clicked base point overrides the default, and changing tools clears it", () => {
  const s = run([
    ...twoLines,
    { type: "SET_TOOL", tool: "rotate" },
    { type: "CLICK_GRID", at: { x: 2, y: 2 }, additive: false },
  ]);
  assert.deepEqual(s.rotateBase, { x: 2, y: 2 });
  assert.equal(reduce(s, { type: "SET_TOOL", tool: "line" }).rotateBase, null);
});

test("rotate with no selection does nothing at all", () => {
  const before = run(twoLines);
  const after = reduce(before, { type: "ROTATE_SELECTION", quarterTurns: 1 });
  assert.equal(after, before);
});

test("a whole turn is a no-op and never reaches the history", () => {
  const s = run([...twoLines, ...selectAll]);
  const depth = s.history.past.length;
  const after = reduce(s, { type: "ROTATE_SELECTION", quarterTurns: 4 });
  assert.equal(after.history.past.length, depth);
});

test("mirror flips the selection and one repeat restores it", () => {
  const once = run([...twoLines, ...selectAll, { type: "MIRROR_SELECTION", axis: "h" }]);
  const twice = reduce(once, { type: "MIRROR_SELECTION", axis: "h" });
  assert.deepEqual(drawing(twice), drawing(run(twoLines)));
  // POSITIVE CONTROL: the first flip must actually have changed something.
  assert.notDeepEqual(drawing(once), drawing(run(twoLines)));
});

test("mirror with no selection does nothing at all", () => {
  const before = run(twoLines);
  assert.equal(reduce(before, { type: "MIRROR_SELECTION", axis: "v" }), before);
});
