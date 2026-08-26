# Type A Canvas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A student opens a drill, draws the front, top and side views on a snapping grid, submits, and sees exactly what is wrong — marked on their drawing and explained in words.

**Architecture:** All decision-making logic is pure and lives in `src/lib/canvas/`, tested under `node --test` with no browser. React components are thin: they render state and dispatch actions. The drawing is an immutable `Primitive[]`; every edit produces a new one; undo is a stack of whole-drawing snapshots. Feedback arrives from `POST /api/score` and is drawn over the sheet using a new per-view anchor offset.

**Tech Stack:** Next 16 App Router, React 19, TypeScript strict, Tailwind v4, `node --test` with `--experimental-strip-types`. No new dependencies.

## Global Constraints

- **No new npm dependencies.** Free tiers only; ask before anything billable. (AGENTS.md §2.1)
- **`src/lib/` stays pure — no framework imports, no I/O.** (AGENTS.md §2.3)
- **Never import `drills/registry`, `server/`, `geometry/views`, `scoring/score` or `scoring/assign` from a client component.** `src/drills/isolation.test.ts` fails the run if you do. Type-only imports of `scoring/types.ts`, `scoring/primitives.ts` and `geometry/isotypes.ts` are fine — types are erased.
- **Commits carry no AI attribution.** No `Co-Authored-By` trailer. (AGENTS.md §2.7)
- **One feature = one branch, PR per feature.** `GITHUB_TOKEN= gh pr create --fill` — the empty assignment is required. Never push straight to `main`. (AGENTS.md §2.5, §6)
- **After adding the first test file in a new directory, confirm the reported test count rose.** A test never seen to fail has not been shown to run. (AGENTS.md §6)
- **Coordinates are integers** in ±200; at most 400 primitives; radii 1–100 integer. `src/lib/scoring/validate.ts` rejects the whole attempt otherwise.
- **Run `npm test && npm run lint && npm run typecheck && npm run build` before every commit.**

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/scoring/compare.ts` (modify) | Gains the per-view anchor offset in its `ViewDiff` |
| `src/lib/scoring/types.ts` (modify) | `ViewDiff` gains `anchor` |
| `src/lib/canvas/coords.ts` | Grid ↔ screen transforms, snapping, radius rounding |
| `src/lib/canvas/history.ts` | Bounded undo/redo stack over drawing snapshots |
| `src/lib/canvas/editor.ts` | The editor reducer: every drawing operation, pure |
| `src/lib/canvas/messages.ts` | `ScoreResult` → notification list |
| `src/components/Sheet.tsx` | The SVG drawing surface, grid, selection, feedback overlay |
| `src/components/Toolbar.tsx` | Tool, line type, undo/redo, delete, submit |
| `src/components/Pictorial.tsx` | Renders the isometric paint program read-only |
| `src/components/Notifications.tsx` | Toasts and the expandable backlog |
| `src/components/Editor.tsx` | Client shell wiring the above to the reducer and the API |
| `src/app/drills/[id]/page.tsx` | Server component; fetches the public half |

---

### Task 1: The scorer returns where each view was drawn

`ViewDiff` primitives are origin-normalised, so the client cannot draw them over the student's work. This adds the offset that maps them back.

**Files:**
- Modify: `src/lib/scoring/types.ts`
- Modify: `src/lib/scoring/compare.ts`
- Test: `src/lib/scoring/compare.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ViewDiff.anchor: { dx: number; dy: number }` — add it to any primitive in this diff to place it in submitted coordinates.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/scoring/compare.test.ts`:

```typescript
test("the diff reports where the attempt was drawn, so feedback can be placed", () => {
  const key: Primitive[] = [
    { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 4, y2: 0 },
  ];
  // The same view, drawn 10 right and 7 down.
  const attempt: Primitive[] = [
    { kind: "segment", type: "visible", x1: 10, y1: 7, x2: 14, y2: 7 },
  ];
  const d = compareView(attempt, key);
  assert.deepEqual(d.anchor, { dx: 10, dy: 7 });
});

test("the anchor ignores centre-line overhang, matching the diff's own anchor rule", () => {
  const key: Primitive[] = [
    { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 4, y2: 0 },
  ];
  const attempt: Primitive[] = [
    { kind: "segment", type: "visible", x1: 10, y1: 7, x2: 14, y2: 7 },
    // A centre line running 2 units left of the object must not move the anchor.
    { kind: "segment", type: "centre", x1: 8, y1: 7, x2: 16, y2: 7 },
  ];
  assert.deepEqual(compareView(attempt, key).anchor, { dx: 10, dy: 7 });
});

test("a view with nothing in it reports a zero anchor rather than crashing", () => {
  assert.deepEqual(compareView([], []).anchor, { dx: 0, dy: 0 });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test 2>&1 | grep -A5 "reports where the attempt"`
Expected: FAIL — `anchor` is `undefined`, so `deepEqual` reports `undefined !== { dx: 10, dy: 7 }`.

- [ ] **Step 3: Add `anchor` to the type**

In `src/lib/scoring/types.ts`, change `ViewDiff`:

```typescript
export type ViewDiff = {
  correct: Primitive[];
  missing: Primitive[];
  extra: Primitive[];
  wrongType: WrongType[];
  /**
   * Where the attempt's view sat. Every primitive in this diff is
   * origin-normalised; add this offset to place one in the coordinates the
   * student actually submitted. Anchored on the object exactly as `toOrigin`
   * anchors, so the two can never disagree.
   */
  anchor: { dx: number; dy: number };
};
```

- [ ] **Step 4: Return it from `compareView`**

In `src/lib/scoring/compare.ts`, change `toOrigin` to hand back the offset it used, and thread it through. Replace the existing `toOrigin` and `compareView` with:

```typescript
/** The offset `toOrigin` removed, so a caller can put a primitive back. */
type Anchored = { primitives: Primitive[]; anchor: { dx: number; dy: number } };

function toOrigin(ps: Primitive[]): Anchored {
  const object = ps.filter((p) => p.type !== "centre");
  const box = boundingBox(object.length > 0 ? object : ps);
  if (box === null) return { primitives: [], anchor: { dx: 0, dy: 0 } };
  return {
    primitives: ps.map((p) => translate(p, -box.minX, -box.minY)),
    anchor: { dx: box.minX, dy: box.minY },
  };
}

export function compareView(attempt: Primitive[], key: Primitive[]): ViewDiff {
  const a = toOrigin(attempt);
  const k = toOrigin(key);

  const attemptByPos = new Map(a.primitives.map((p) => [positionKey(p), p]));
  const keyByPos = new Map(k.primitives.map((p) => [positionKey(p), p]));

  const correct: Primitive[] = [];
  const missing: Primitive[] = [];
  const extra: Primitive[] = [];
  const wrongType: WrongType[] = [];

  for (const [pos, expected] of keyByPos) {
    const drawn = attemptByPos.get(pos);
    if (drawn === undefined) missing.push(expected);
    else if (drawn.type === expected.type) correct.push(expected);
    else wrongType.push({ expected, drawn });
  }

  for (const [pos, drawn] of attemptByPos) {
    if (!keyByPos.has(pos)) extra.push(drawn);
  }

  return { correct, missing, extra, wrongType, anchor: a.anchor };
}
```

- [ ] **Step 5: Run the whole suite**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass. Existing `compare.test.ts` assertions on `correct`/`missing`/`extra` are unaffected — only a field was added. If `assert.deepEqual` on a whole `ViewDiff` fails somewhere, add `anchor` to that expectation.

- [ ] **Step 6: Commit**

```bash
git add src/lib/scoring/types.ts src/lib/scoring/compare.ts src/lib/scoring/compare.test.ts
git commit -m "feat(scoring): report where each view was drawn

ViewDiff primitives are origin-normalised, which is what makes a correct
view drawn ten units right still correct. It also made them impossible to
draw over the student's work. The diff now carries the offset toOrigin
removed, anchored on the object exactly as toOrigin anchors so the two
cannot drift apart."
```

---

### Task 2: Grid and screen coordinates

**Files:**
- Create: `src/lib/canvas/coords.ts`
- Test: `src/lib/canvas/coords.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Point = { x: number; y: number }`
  - `type Viewport = { cell: number; padding: number }`
  - `gridToScreen(p: Point, v: Viewport): Point`
  - `screenToGrid(p: Point, v: Viewport): Point` — returns the nearest grid intersection, already snapped
  - `radiusFrom(centre: Point, edge: Point): number` — whole units, minimum 1

- [ ] **Step 1: Write the failing test**

Create `src/lib/canvas/coords.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { gridToScreen, screenToGrid, radiusFrom } from "./coords.ts";

const v = { cell: 20, padding: 16 };

test("a grid point maps to its pixel position", () => {
  assert.deepEqual(gridToScreen({ x: 0, y: 0 }, v), { x: 16, y: 16 });
  assert.deepEqual(gridToScreen({ x: 3, y: 2 }, v), { x: 76, y: 56 });
});

test("a pixel position snaps to the nearest intersection", () => {
  assert.deepEqual(screenToGrid({ x: 76, y: 56 }, v), { x: 3, y: 2 });
  assert.deepEqual(screenToGrid({ x: 80, y: 59 }, v), { x: 3, y: 2 });
  assert.deepEqual(screenToGrid({ x: 87, y: 66 }, v), { x: 4, y: 3 });
});

test("snapping rounds to the nearer intersection at the halfway point", () => {
  assert.deepEqual(screenToGrid({ x: 16 + 10, y: 16 }, v), { x: 1, y: 0 });
});

test("screen and grid round-trip for every intersection", () => {
  for (let x = 0; x < 12; x++) {
    for (let y = 0; y < 12; y++) {
      assert.deepEqual(screenToGrid(gridToScreen({ x, y }, v), v), { x, y });
    }
  }
});

test("a radius is a whole number of grid units", () => {
  assert.equal(radiusFrom({ x: 0, y: 0 }, { x: 3, y: 0 }), 3);
  assert.equal(radiusFrom({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("a radius rounds to the nearest whole unit", () => {
  assert.equal(radiusFrom({ x: 0, y: 0 }, { x: 2, y: 2 }), 3); // 2.83 -> 3
});

test("a radius is never zero, so a click cannot make an invalid circle", () => {
  assert.equal(radiusFrom({ x: 5, y: 5 }, { x: 5, y: 5 }), 1);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test 2>&1 | grep -E "Cannot find module|^. (tests|pass|fail)"`
Expected: `Cannot find module '.../src/lib/canvas/coords.ts'`, and the test count RISES (proving the new directory is picked up by the glob).

- [ ] **Step 3: Implement**

Create `src/lib/canvas/coords.ts`:

```typescript
/**
 * Grid and screen coordinates.
 *
 * The drawing is stored in GRID units — integers, because the scorer compares
 * primitives by exact position and `validate.ts` rejects anything else. Pixels
 * exist only for drawing and pointer events, and never enter the drawing.
 *
 * PURE. No I/O, no DOM.
 */
export type Point = { x: number; y: number };

/** `cell` is pixels per grid unit; `padding` is the margin around the grid. */
export type Viewport = { cell: number; padding: number };

export function gridToScreen(p: Point, v: Viewport): Point {
  return { x: p.x * v.cell + v.padding, y: p.y * v.cell + v.padding };
}

/** Always snapped: there is no such thing as an off-grid drawing position. */
export function screenToGrid(p: Point, v: Viewport): Point {
  return {
    x: Math.round((p.x - v.padding) / v.cell),
    y: Math.round((p.y - v.padding) / v.cell),
  };
}

/**
 * Radius from a centre and a point on the circumference, in whole units.
 *
 * Never zero: `validate.ts` requires a positive integer radius, so a click that
 * lands on the centre yields the smallest legal circle rather than an invalid
 * one the server would reject.
 */
export function radiusFrom(centre: Point, edge: Point): number {
  const dx = edge.x - centre.x;
  const dy = edge.y - centre.y;
  return Math.max(1, Math.round(Math.hypot(dx, dy)));
}
```

- [ ] **Step 4: Run and confirm green**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass; test count risen by 7.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/coords.ts src/lib/canvas/coords.test.ts
git commit -m "feat(canvas): grid and screen coordinate transforms

Pixels exist for pointer events and rendering only. The drawing itself is
always whole grid units, because the scorer compares primitives by exact
position and validate.ts rejects anything off-grid. radiusFrom never
returns zero, so a stray click cannot build a circle the server refuses."
```

---

### Task 3: The undo stack

**Files:**
- Create: `src/lib/canvas/history.ts`
- Test: `src/lib/canvas/history.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type History<T> = { past: T[]; present: T; future: T[] }`
  - `initHistory<T>(present: T): History<T>`
  - `push<T>(h: History<T>, next: T, maxDepth?: number): History<T>`
  - `undo<T>(h: History<T>): History<T>`
  - `redo<T>(h: History<T>): History<T>`
  - `canUndo/canRedo(h): boolean`
  - `const MAX_HISTORY = 50`

- [ ] **Step 1: Write the failing test**

Create `src/lib/canvas/history.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test 2>&1 | grep -E "Cannot find module"`
Expected: `Cannot find module '.../history.ts'`.

- [ ] **Step 3: Implement**

Create `src/lib/canvas/history.ts`:

```typescript
/**
 * Undo/redo over whole-state snapshots.
 *
 * SNAPSHOTS, NOT DIFFS. A drawing is capped at 400 primitives, so a snapshot is
 * a few kilobytes and copying it is free — while a diff-based stack has to be
 * correct for every operation, including drag and retype. Correctness is worth
 * more than the memory here.
 *
 * PURE. Every function returns a new history and mutates nothing.
 */
export type History<T> = { past: T[]; present: T; future: T[] };

/** Bounded so a long session cannot grow the stack without limit. */
export const MAX_HISTORY = 50;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function push<T>(h: History<T>, next: T, maxDepth: number = MAX_HISTORY): History<T> {
  const past = [...h.past, h.present];
  // Drop from the FRONT: the oldest state is the one worth losing.
  return {
    past: past.length > maxDepth ? past.slice(past.length - maxDepth) : past,
    present: next,
    // A new edit invalidates the branch that was undone away.
    future: [],
  };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;
```

- [ ] **Step 4: Run and confirm green**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/history.ts src/lib/canvas/history.test.ts
git commit -m "feat(canvas): bounded undo/redo over drawing snapshots

Snapshots rather than diffs: at a 400-primitive cap a snapshot costs
nothing to copy, while a diff stack has to be correct for every
operation including drag and retype. Capped at 50 so a long session
cannot grow it without bound, dropping oldest first."
```

---

### Task 4: The editor reducer

Every drawing operation, as one pure function. This is the task that makes the React layer thin.

**Files:**
- Create: `src/lib/canvas/editor.ts`
- Test: `src/lib/canvas/editor.test.ts`

**Interfaces:**
- Consumes: `Point` from `./coords.ts`; `History`, `initHistory`, `push`, `undo`, `redo` from `./history.ts`; `type Primitive`, `type PrimitiveType` from `../scoring/primitives.ts`
- Produces:
  - `type Tool = "line" | "circle" | "select"`
  - `type EditorState = { history: History<Primitive[]>; tool: Tool; activeType: PrimitiveType; selection: number[]; pending: Point | null }`
  - `type Action` (the union below)
  - `initEditor(): EditorState`
  - `reduce(state: EditorState, action: Action): EditorState`
  - `drawing(state: EditorState): Primitive[]`

The `Action` union, exactly:

```typescript
export type Action =
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "SET_ACTIVE_TYPE"; lineType: PrimitiveType }
  | { type: "CLICK_GRID"; at: Point; additive: boolean }
  | { type: "CANCEL" }
  | { type: "MOVE_SELECTION"; dx: number; dy: number }
  | { type: "RETYPE_SELECTION"; lineType: PrimitiveType }
  | { type: "DELETE_SELECTION" }
  | { type: "UNDO" }
  | { type: "REDO" };
```

- [ ] **Step 1: Write the failing test**

Create `src/lib/canvas/editor.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { initEditor, reduce, drawing, type EditorState } from "./editor.ts";

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

test("the reducer never mutates the state it is given", () => {
  const before = initEditor();
  reduce(before, { type: "SET_TOOL", tool: "line" });
  assert.equal(before.tool, "select");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test 2>&1 | grep -E "Cannot find module"`
Expected: `Cannot find module '.../editor.ts'`.

- [ ] **Step 3: Implement**

Create `src/lib/canvas/editor.ts`:

```typescript
/**
 * Every drawing operation, as one pure reducer.
 *
 * This exists so the React layer holds no logic worth testing: components
 * dispatch actions and render state, and everything that could be WRONG lives
 * here, under `node --test`, with no browser involved.
 *
 * PURE. No I/O, no DOM, no framework imports.
 */
import { radiusFrom, type Point } from "./coords.ts";
import {
  initHistory, push, redo as redoHistory, undo as undoHistory, type History,
} from "./history.ts";
import type { Primitive, PrimitiveType } from "../scoring/primitives.ts";

export type Tool = "line" | "circle" | "select";

export type EditorState = {
  history: History<Primitive[]>;
  tool: Tool;
  activeType: PrimitiveType;
  /** Indices into the current drawing. */
  selection: number[];
  /** The first click of a two-click draw, if one is in progress. */
  pending: Point | null;
};

export type Action =
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "SET_ACTIVE_TYPE"; lineType: PrimitiveType }
  | { type: "CLICK_GRID"; at: Point; additive: boolean }
  | { type: "CANCEL" }
  | { type: "MOVE_SELECTION"; dx: number; dy: number }
  | { type: "RETYPE_SELECTION"; lineType: PrimitiveType }
  | { type: "DELETE_SELECTION" }
  | { type: "UNDO" }
  | { type: "REDO" };

export function initEditor(): EditorState {
  return {
    history: initHistory<Primitive[]>([]),
    tool: "select",
    activeType: "visible",
    selection: [],
    pending: null,
  };
}

export const drawing = (s: EditorState): Primitive[] => s.history.present;

/** Distance within which a click counts as hitting a primitive. */
const HIT_RADIUS = 0.6;

function distanceToSegment(p: Point, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - x1, p.y - y1);
  let t = ((p.x - x1) * dx + (p.y - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}

/** Index of the primitive under a point, or -1. Nearest wins, not first. */
function hitTest(ps: Primitive[], at: Point): number {
  let best = -1;
  let bestDistance = HIT_RADIUS;
  ps.forEach((p, i) => {
    const d = p.kind === "segment"
      ? distanceToSegment(at, p.x1, p.y1, p.x2, p.y2)
      : Math.abs(Math.hypot(at.x - p.cx, at.y - p.cy) - p.r);
    if (d <= bestDistance) { bestDistance = d; best = i; }
  });
  return best;
}

function commit(s: EditorState, next: Primitive[]): EditorState {
  return { ...s, history: push(s.history, next) };
}

function mapSelected(s: EditorState, f: (p: Primitive) => Primitive): Primitive[] {
  const chosen = new Set(s.selection);
  return drawing(s).map((p, i) => (chosen.has(i) ? f(p) : p));
}

function shift(p: Primitive, dx: number, dy: number): Primitive {
  return p.kind === "segment"
    ? { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
    : { ...p, cx: p.cx + dx, cy: p.cy + dy };
}

function clickWhileDrawing(s: EditorState, at: Point): EditorState {
  const from = s.pending;
  if (from === null) return { ...s, pending: at };

  if (s.tool === "line") {
    // A zero-length segment is not a line; validate.ts refuses it, so it must
    // never become drawable here either.
    if (from.x === at.x && from.y === at.y) return { ...s, pending: null };
    const segment: Primitive = {
      kind: "segment", type: s.activeType,
      x1: from.x, y1: from.y, x2: at.x, y2: at.y,
    };
    return { ...commit(s, [...drawing(s), segment]), pending: null };
  }

  const circle: Primitive = {
    kind: "circle", type: s.activeType,
    cx: from.x, cy: from.y, r: radiusFrom(from, at),
  };
  return { ...commit(s, [...drawing(s), circle]), pending: null };
}

function clickWhileSelecting(s: EditorState, at: Point, additive: boolean): EditorState {
  const hit = hitTest(drawing(s), at);
  if (hit === -1) return { ...s, selection: [] };
  if (!additive) return { ...s, selection: [hit] };
  return {
    ...s,
    selection: s.selection.includes(hit)
      ? s.selection.filter((i) => i !== hit)
      : [...s.selection, hit],
  };
}

export function reduce(s: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "SET_TOOL":
      // Changing tools abandons a half-drawn primitive rather than leaving an
      // anchor that would attach itself to the next click of a different tool.
      return { ...s, tool: action.tool, pending: null };

    case "SET_ACTIVE_TYPE":
      return { ...s, activeType: action.lineType };

    case "CLICK_GRID":
      return s.tool === "select"
        ? clickWhileSelecting(s, action.at, action.additive)
        : clickWhileDrawing(s, action.at);

    case "CANCEL":
      return { ...s, pending: null };

    case "MOVE_SELECTION":
      if (s.selection.length === 0) return s;
      return commit(s, mapSelected(s, (p) => shift(p, action.dx, action.dy)));

    case "RETYPE_SELECTION":
      if (s.selection.length === 0) return s;
      return commit(s, mapSelected(s, (p) => ({ ...p, type: action.lineType })));

    case "DELETE_SELECTION": {
      if (s.selection.length === 0) return s;
      const doomed = new Set(s.selection);
      return {
        ...commit(s, drawing(s).filter((_, i) => !doomed.has(i))),
        selection: [],
      };
    }

    case "UNDO":
      // Indices refer to a drawing that is about to change underneath them.
      return { ...s, history: undoHistory(s.history), selection: [], pending: null };

    case "REDO":
      return { ...s, history: redoHistory(s.history), selection: [], pending: null };
  }
}
```

- [ ] **Step 4: Run and confirm green**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/editor.ts src/lib/canvas/editor.test.ts
git commit -m "feat(canvas): the editor reducer

Every drawing operation as one pure function, so the React layer holds
no logic worth testing. Click-click drawing, nearest-wins hit testing,
additive selection, move, retype, delete, undo and redo.

Two rules are enforced here because the server enforces them too and the
UI must never be able to produce what it would reject: a zero-length
segment is never committed, and a circle radius is always a positive
whole number."
```

---

### Task 5: Turning a score into words

**Files:**
- Create: `src/lib/canvas/messages.ts`
- Test: `src/lib/canvas/messages.test.ts`

**Interfaces:**
- Consumes: `type ScoreResult` from `../scoring/score.ts` (TYPE-ONLY import — erased at build, so the isolation rule is satisfied)
- Produces:
  - `type Notice = { id: string; tone: "good" | "warn" | "bad"; text: string }`
  - `noticesFor(result: ScoreResult): Notice[]`

- [ ] **Step 1: Write the failing test**

Create `src/lib/canvas/messages.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test 2>&1 | grep -E "Cannot find module"`
Expected: `Cannot find module '.../messages.ts'`.

- [ ] **Step 3: Implement**

Create `src/lib/canvas/messages.ts`:

```typescript
/**
 * Turning a score into sentences a student can act on.
 *
 * ONE NOTICE PER FAULT KIND PER VIEW, never one per primitive: a student who
 * omits an entire view should get one sentence saying so, not fourteen toasts.
 *
 * There is deliberately no percentage anywhere. A number teaches nothing.
 *
 * PURE. The ScoreResult import is TYPE-ONLY and erased at build, so this does
 * not put the scorer in the client bundle.
 */
import type { ScoreResult } from "../scoring/score.ts";
import type { ViewName } from "../scoring/types.ts";

export type Notice = { id: string; tone: "good" | "warn" | "bad"; text: string };

const VIEW_LABEL: Record<ViewName, string> = {
  front: "Front view", top: "Top view", side: "Side view",
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function noticesFor(result: ScoreResult): Notice[] {
  if (!result.ok) {
    return [{
      id: "view-count",
      tone: "warn",
      text: `Your drawing was read as ${result.found} view${result.found === 1 ? "" : "s"}, `
        + `not three views. Draw the front, top and side views with a clear gap between them.`,
    }];
  }

  if (result.perfect) {
    return [{ id: "perfect", tone: "good", text: "Every view is correct, and they are placed correctly." }];
  }

  const notices: Notice[] = [];

  for (const view of ["front", "top", "side"] as ViewName[]) {
    const d = result.views[view];
    const label = VIEW_LABEL[view];

    if (d.missing.length > 0) {
      notices.push({
        id: `${view}-missing`, tone: "bad",
        text: `${label}: ${plural(d.missing.length, "line is", "lines are")} missing.`,
      });
    }
    if (d.extra.length > 0) {
      notices.push({
        id: `${view}-extra`, tone: "bad",
        text: `${label}: ${plural(d.extra.length, "line", "lines")} drawn that should not be there.`,
      });
    }
    if (d.wrongType.length > 0) {
      notices.push({
        id: `${view}-type`, tone: "warn",
        text: `${label}: ${plural(d.wrongType.length, "line is", "lines are")} in the wrong line type `
          + `— check which edges are hidden.`,
      });
    }
  }

  if (!result.placement.correct) {
    const alsoKnown = result.placement.matchesOtherConvention;
    notices.push({
      id: "placement", tone: "warn",
      text: alsoKnown === null
        ? "The views are not placed correctly for this convention."
        : `The views are placed as ${alsoKnown === "third_angle" ? "third" : "first"}-angle projection, `
          + `but this drill asks for the other convention.`,
    });
  }

  return notices;
}
```

- [ ] **Step 4: Run and confirm green**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/messages.ts src/lib/canvas/messages.test.ts
git commit -m "feat(canvas): turn a score into sentences

One notice per fault kind per view rather than one per primitive: a
student who omits a whole view needs one sentence, not fourteen toasts.
Placement gets its own notice and names the convention the drawing
actually matches, because placing views wrongly is a distinct failure
from drawing them wrongly."
```

---

### Task 6: The sheet

**Files:**
- Create: `src/components/Sheet.tsx`
- Modify: none

**Interfaces:**
- Consumes: `gridToScreen`, `screenToGrid`, `type Point`, `type Viewport` from `@/lib/canvas/coords`; `type Primitive` from `@/lib/scoring/primitives`; `type ViewDiff` from `@/lib/scoring/types`
- Produces: `<Sheet grid={{width,height}} drawing={Primitive[]} selection={number[]} pending={Point|null} cursor={Point|null} feedback={FeedbackOverlay|null} onGridClick={(p: Point, additive: boolean) => void} onGridMove={(p: Point) => void} />`
- Produces: `export type FeedbackOverlay = { views: ViewDiff[] }` — each diff already carries its own `anchor`.

- [ ] **Step 1: Write the component**

Create `src/components/Sheet.tsx`:

```tsx
"use client";

import { gridToScreen, screenToGrid, type Point, type Viewport } from "@/lib/canvas/coords";
import type { Primitive } from "@/lib/scoring/primitives";
import type { ViewDiff } from "@/lib/scoring/types";

export type FeedbackOverlay = { views: ViewDiff[] };

const VIEWPORT: Viewport = { cell: 20, padding: 16 };

const DASH: Record<string, string | undefined> = {
  visible: undefined,
  hidden: "6 4",
  centre: "12 3 3 3",
};

/** Ink colours. Feedback tones are separate so they never collide with them. */
const INK = { visible: "var(--ink)", hidden: "var(--ink)", centre: "var(--centre)" };

function primitivePath(p: Primitive, v: Viewport, extra: Record<string, unknown>) {
  const dash = DASH[p.type];
  if (p.kind === "circle") {
    const c = gridToScreen({ x: p.cx, y: p.cy }, v);
    return <circle cx={c.x} cy={c.y} r={p.r * v.cell} fill="none" strokeDasharray={dash} {...extra} />;
  }
  const a = gridToScreen({ x: p.x1, y: p.y1 }, v);
  const b = gridToScreen({ x: p.x2, y: p.y2 }, v);
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={dash} {...extra} />;
}

/** Put an origin-normalised feedback primitive back where the student drew. */
function place(p: Primitive, anchor: { dx: number; dy: number }): Primitive {
  return p.kind === "circle"
    ? { ...p, cx: p.cx + anchor.dx, cy: p.cy + anchor.dy }
    : { ...p, x1: p.x1 + anchor.dx, y1: p.y1 + anchor.dy, x2: p.x2 + anchor.dx, y2: p.y2 + anchor.dy };
}

export function Sheet({
  grid, drawing, selection, pending, cursor, feedback, onGridClick, onGridMove,
}: {
  grid: { width: number; height: number };
  drawing: Primitive[];
  selection: number[];
  pending: Point | null;
  cursor: Point | null;
  feedback: FeedbackOverlay | null;
  onGridClick: (p: Point, additive: boolean) => void;
  onGridMove: (p: Point) => void;
}) {
  const v = VIEWPORT;
  const w = grid.width * v.cell + v.padding * 2;
  const h = grid.height * v.cell + v.padding * 2;
  const chosen = new Set(selection);

  const toGrid = (e: React.MouseEvent<SVGSVGElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect();
    return screenToGrid({ x: e.clientX - box.left, y: e.clientY - box.top }, v);
  };

  const gridLines = [];
  for (let x = 0; x <= grid.width; x++) {
    const a = gridToScreen({ x, y: 0 }, v);
    const b = gridToScreen({ x, y: grid.height }, v);
    gridLines.push(<line key={`v${x}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-[var(--grid)]" strokeWidth={1} />);
  }
  for (let y = 0; y <= grid.height; y++) {
    const a = gridToScreen({ x: 0, y }, v);
    const b = gridToScreen({ x: grid.width, y }, v);
    gridLines.push(<line key={`h${y}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-[var(--grid)]" strokeWidth={1} />);
  }

  return (
    <svg
      width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      className="max-w-full h-auto touch-none select-none bg-[var(--paper)]"
      onClick={(e) => onGridClick(toGrid(e), e.ctrlKey || e.metaKey)}
      onMouseMove={(e) => onGridMove(toGrid(e))}
      role="application"
      aria-label="Drawing sheet"
    >
      <g>{gridLines}</g>

      {/* Feedback sits UNDER the student's ink, so their own drawing stays readable. */}
      {feedback?.views.map((d, vi) => (
        <g key={vi}>
          {d.missing.map((p, i) => (
            <g key={`m${i}`}>{primitivePath(place(p, d.anchor), v, { stroke: "var(--miss)", strokeWidth: 3, opacity: 0.55 })}</g>
          ))}
          {d.extra.map((p, i) => (
            <g key={`x${i}`}>{primitivePath(place(p, d.anchor), v, { stroke: "var(--bad)", strokeWidth: 6, opacity: 0.3 })}</g>
          ))}
          {d.wrongType.map((wt, i) => (
            <g key={`t${i}`}>{primitivePath(place(wt.expected, d.anchor), v, { stroke: "var(--warn)", strokeWidth: 6, opacity: 0.35 })}</g>
          ))}
        </g>
      ))}

      {drawing.map((p, i) => (
        <g key={i}>
          {/* A wide transparent stroke makes a thin line easy to hit. */}
          {primitivePath(p, v, { stroke: "transparent", strokeWidth: 14, fill: "none" })}
          {primitivePath(p, v, {
            stroke: chosen.has(i) ? "var(--select)" : INK[p.type],
            strokeWidth: chosen.has(i) ? 3 : 2,
            fill: "none",
          })}
        </g>
      ))}

      {pending !== null && cursor !== null && (
        <line
          x1={gridToScreen(pending, v).x} y1={gridToScreen(pending, v).y}
          x2={gridToScreen(cursor, v).x} y2={gridToScreen(cursor, v).y}
          stroke="var(--select)" strokeWidth={2} strokeDasharray="4 4" opacity={0.7}
        />
      )}
    </svg>
  );
}
```

- [ ] **Step 2: Add the feedback and ink colour tokens**

In `src/app/globals.css`, inside the existing `:root` block, add:

```css
  --paper: #ffffff;
  --grid: #e6eae3;
  --ink: #15191a;
  --centre: #b0261c;
  --select: #1f6feb;
  --miss: #b8860b;
  --bad: #c02626;
  --warn: #c2740a;
```

And in the dark block (create `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { … } }` if the file has none), redefine only these:

```css
  --paper: #ffffff;
  --grid: #e6eae3;
  --ink: #15191a;
  --centre: #b0261c;
  --select: #4c8dff;
  --miss: #d9a520;
  --bad: #e05252;
  --warn: #e0921f;
```

The sheet stays white ink-on-paper in both themes: technical drawings are black on white, and keeping the paper fixed means the ink tokens never need to flip.

- [ ] **Step 3: Verify it renders**

Run: `npm run build && npm run typecheck && npm run lint`
Expected: build succeeds, no type or lint errors. There is nothing to unit-test here — all the logic this component could get wrong lives in `coords.ts` and `editor.ts`, which are already covered.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sheet.tsx src/app/globals.css
git commit -m "feat(canvas): the drawing sheet

SVG rather than Canvas 2D: per-element hit-testing makes selection and
hover ordinary DOM work, and the primitive cap of 400 puts node count
out of scope. Each primitive carries a wide transparent stroke beneath
it so a 2px line can be hit without precision.

Feedback renders UNDER the student's ink so their own drawing stays
readable, and each ViewDiff is placed using the anchor the scorer now
returns. The sheet is white in both themes because a technical drawing
is black on white."
```

---

### Task 7: Toolbar, notifications, and the pictorial

**Files:**
- Create: `src/components/Toolbar.tsx`
- Create: `src/components/Notifications.tsx`
- Create: `src/components/Pictorial.tsx`

**Interfaces:**
- Consumes: `type Tool`, `type Action` from `@/lib/canvas/editor`; `type Notice` from `@/lib/canvas/messages`; `type IsoPrimitive` from `@/lib/geometry/isotypes`
- Produces:
  - `<Toolbar tool activeType canUndo canRedo hasSelection onAction submitting onSubmit />`
  - `<Notifications notices={Notice[]} />`
  - `<Pictorial primitives={readonly IsoPrimitive[]} />`

- [ ] **Step 1: Write the toolbar**

Create `src/components/Toolbar.tsx`:

```tsx
"use client";

import type { Action, Tool } from "@/lib/canvas/editor";
import type { PrimitiveType } from "@/lib/scoring/primitives";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "line", label: "Line" },
  { id: "circle", label: "Circle" },
];

const TYPES: { id: PrimitiveType; label: string }[] = [
  { id: "visible", label: "Visible edge" },
  { id: "hidden", label: "Hidden edge" },
  { id: "centre", label: "Centre line" },
];

export function Toolbar({
  tool, activeType, canUndo, canRedo, hasSelection, submitting, onAction, onSubmit,
}: {
  tool: Tool;
  activeType: PrimitiveType;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  submitting: boolean;
  onAction: (a: Action) => void;
  onSubmit: () => void;
}) {
  const button = "px-3 py-1.5 text-sm border border-[var(--rule)] rounded disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--select)]";

  return (
    <div className="flex flex-wrap items-center gap-2 p-2 border border-[var(--rule)] rounded">
      <div className="flex gap-1" role="group" aria-label="Tool">
        {TOOLS.map((t) => (
          <button
            key={t.id} type="button" className={button}
            aria-pressed={tool === t.id}
            style={tool === t.id ? { background: "var(--select)", color: "#fff" } : undefined}
            onClick={() => onAction({ type: "SET_TOOL", tool: t.id })}
          >{t.label}</button>
        ))}
      </div>

      <label className="text-sm flex items-center gap-1.5">
        Line type
        <select
          className={button}
          value={activeType}
          onChange={(e) => {
            const lineType = e.target.value as PrimitiveType;
            // With a selection, this RETYPES it; otherwise it sets what comes next.
            onAction(hasSelection
              ? { type: "RETYPE_SELECTION", lineType }
              : { type: "SET_ACTIVE_TYPE", lineType });
          }}
        >
          {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </label>

      <button type="button" className={button} disabled={!canUndo}
        onClick={() => onAction({ type: "UNDO" })}>Undo</button>
      <button type="button" className={button} disabled={!canRedo}
        onClick={() => onAction({ type: "REDO" })}>Redo</button>
      <button type="button" className={button} disabled={!hasSelection}
        onClick={() => onAction({ type: "DELETE_SELECTION" })}>Delete</button>

      <button type="button" className={`${button} ml-auto`} disabled={submitting} onClick={onSubmit}>
        {submitting ? "Checking…" : "Check my drawing"}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Write the notifications**

Create `src/components/Notifications.tsx`:

```tsx
"use client";

import { useEffect, useState } from "react";
import type { Notice } from "@/lib/canvas/messages";

const TONE: Record<Notice["tone"], string> = {
  good: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)",
};

/** How long a toast stays before falling into the backlog. */
const DWELL_MS = 6000;

export function Notifications({ notices }: { notices: Notice[] }) {
  const [visible, setVisible] = useState<Notice[]>([]);
  const [backlog, setBacklog] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (notices.length === 0) return;
    setVisible(notices);
    const timer = setTimeout(() => {
      setVisible([]);
      setBacklog((b) => [...notices, ...b]);
    }, DWELL_MS);
    return () => clearTimeout(timer);
  }, [notices]);

  const dismiss = (n: Notice) => {
    setVisible((v) => v.filter((x) => x.id !== n.id));
    setBacklog((b) => [n, ...b]);
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 max-w-sm z-50" aria-live="polite">
        {visible.map((n) => (
          <button
            key={n.id} type="button" onClick={() => dismiss(n)}
            className="text-left text-sm p-3 rounded border bg-[var(--card)] shadow-lg"
            style={{ borderColor: TONE[n.tone] }}
          >{n.text}</button>
        ))}
      </div>

      {backlog.length > 0 && (
        <div className="mt-4">
          <button type="button" className="text-sm underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Show"} previous feedback ({backlog.length})
          </button>
          {open && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {backlog.map((n, i) => (
                <li key={`${n.id}-${i}`} className="text-sm p-2 border-l-2 pl-3"
                  style={{ borderColor: TONE[n.tone] }}>{n.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 3: Write the pictorial**

Create `src/components/Pictorial.tsx`:

```tsx
import type { IsoPrimitive } from "@/lib/geometry/isotypes";

/**
 * THE ARRAY IS A PAINT PROGRAM, NOT A SET. Render it in order: each face is an
 * opaque fill in the PAPER colour, stroked in that same colour to seal its own
 * boundary, and later fills paint over earlier strokes — that overdraw is the
 * entire hidden-line mechanism. Never sort, filter or deduplicate it.
 * See src/lib/geometry/isoedges.ts and AGENTS.md §6.
 */
const PAPER = "#ffffff";
const SCALE = 22;
const PAD = 16;

export function Pictorial({ primitives }: { primitives: readonly IsoPrimitive[] }) {
  if (primitives.length === 0) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of primitives) {
    if (p.kind === "iso-line") { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
    else if (p.kind === "iso-face") { for (const q of p.points) { xs.push(q[0]); ys.push(q[1]); } }
    else { xs.push(p.cx - p.rx, p.cx + p.rx); ys.push(p.cy - p.rx, p.cy + p.rx); }
  }
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const px = (n: number) => (n - minX) * SCALE + PAD;
  const py = (n: number) => (n - minY) * SCALE + PAD;
  const w = (maxX - minX) * SCALE + PAD * 2;
  const h = (maxY - minY) * SCALE + PAD * 2;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      className="max-w-full h-auto border border-[var(--rule)]"
      style={{ background: PAPER }} role="img" aria-label="Isometric view of the part">
      {primitives.map((p, i) => {
        if (p.kind === "iso-face") {
          return <polygon key={i} points={p.points.map((q) => `${px(q[0])},${py(q[1])}`).join(" ")}
            fill={PAPER} stroke={PAPER} strokeWidth={0.3} />;
        }
        if (p.kind === "iso-line") {
          return <line key={i} x1={px(p.x1)} y1={py(p.y1)} x2={px(p.x2)} y2={py(p.y2)}
            stroke="#111" strokeWidth={2} />;
        }
        return <ellipse key={i} cx={px(p.cx)} cy={py(p.cy)} rx={p.rx * SCALE} ry={p.ry * SCALE}
          fill="none" stroke="#111" strokeWidth={2}
          transform={`rotate(${p.rotation} ${px(p.cx)} ${py(p.cy)})`} />;
      })}
    </svg>
  );
}
```

- [ ] **Step 4: Verify**

Run: `npm run build && npm run typecheck && npm run lint`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbar.tsx src/components/Notifications.tsx src/components/Pictorial.tsx
git commit -m "feat(canvas): toolbar, notifications and the pictorial

The line-type control does double duty: with a selection it retypes it,
otherwise it sets what gets drawn next. That is the operation the drill
teaches most, so it must not require deleting and redrawing.

Toasts fall into an expandable backlog rather than vanishing, so
feedback is not lost by looking away.

The pictorial renders the paint program in array order, fills stroked in
the paper colour. Order is load-bearing and must never be sorted or
deduplicated."
```

---

### Task 8: Wiring, the drill page, and the round trip

**Files:**
- Create: `src/components/Editor.tsx`
- Create: `src/app/drills/[id]/page.tsx`
- Create: `src/app/drills/page.tsx`
- Test: `src/lib/canvas/submit.test.ts`
- Create: `src/lib/canvas/submit.ts`

**Interfaces:**
- Consumes: everything above
- Produces: `submitAttempt(drillId: string, primitives: Primitive[], fetchImpl?: typeof fetch): Promise<ScoreResult | { ok: false; reason: string }>`

- [ ] **Step 1: Write the failing test for the submit helper**

Create `src/lib/canvas/submit.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { submitAttempt } from "./submit.ts";

const ok = (body: unknown) => async () =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });

test("a submission posts the drill id and the primitives", async () => {
  let seen: { url: string; body: string } | null = null;
  const fake = (async (url: string, init: RequestInit) => {
    seen = { url: String(url), body: String(init.body) };
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }) as unknown as typeof fetch;

  await submitAttempt("step-block", [{ kind: "segment", type: "visible", x1: 0, y1: 0, x2: 1, y2: 0 }], fake);

  assert.match(seen!.url, /\/api\/score$/);
  assert.match(seen!.body, /"drillId":"step-block"/);
  assert.match(seen!.body, /"kind":"views"/);
});

test("a scored result is returned as-is", async () => {
  const result = await submitAttempt("step-block", [], ok({ ok: false, reason: "WRONG_VIEW_COUNT", found: 0 }) as unknown as typeof fetch);
  assert.deepEqual(result, { ok: false, reason: "WRONG_VIEW_COUNT", found: 0 });
});

test("a rate-limited response surfaces as a reason, not a crash", async () => {
  const limited = (async () => new Response(JSON.stringify({ ok: false, reason: "RATE_LIMITED", retryAfterMs: 5000 }), { status: 429 })) as unknown as typeof fetch;
  const result = await submitAttempt("step-block", [], limited);
  assert.equal(result.ok, false);
  assert.equal((result as { reason: string }).reason, "RATE_LIMITED");
});

test("a network failure surfaces as a reason rather than throwing", async () => {
  const broken = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  const result = await submitAttempt("step-block", [], broken);
  assert.equal(result.ok, false);
  assert.equal((result as { reason: string }).reason, "NETWORK");
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npm test 2>&1 | grep "Cannot find module"`
Expected: `Cannot find module '.../submit.ts'`.

- [ ] **Step 3: Implement the submit helper**

Create `src/lib/canvas/submit.ts`:

```typescript
/**
 * Posting an attempt and getting a score back.
 *
 * NOTHING THROWS. A network failure and a rate limit are both ordinary
 * outcomes of a student pressing a button, and the UI has to render both the
 * same way it renders a bad drawing — as a message, not a crash.
 *
 * `fetchImpl` is injected so this is testable without a server or a browser.
 */
import type { Primitive } from "../scoring/primitives.ts";
import type { ScoreResult } from "../scoring/score.ts";

export type SubmitFailure = { ok: false; reason: string };

export async function submitAttempt(
  drillId: string,
  primitives: Primitive[],
  fetchImpl: typeof fetch = fetch,
): Promise<ScoreResult | SubmitFailure> {
  try {
    const response = await fetchImpl("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ drillId, kind: "views", primitives }),
    });
    return (await response.json()) as ScoreResult | SubmitFailure;
  } catch {
    return { ok: false, reason: "NETWORK" };
  }
}
```

- [ ] **Step 4: Confirm green**

Run: `npm test && npm run typecheck && npm run lint`
Expected: all pass.

- [ ] **Step 5: Accept `kind` on the score route**

`submit.ts` sends `kind: "views"`, which the handler does not yet read. In `src/server/score.ts`, after the `drillId` check, add:

```typescript
  const { kind } = body as Record<string, unknown>;
  if (kind !== "views") return fail(400, "BAD_KIND");
```

And in `src/server/score.test.ts`, add `kind: "views"` to every existing request body, plus:

```typescript
test("a submission without a kind is rejected", () => {
  const r = handleScoreRequest({ drillId: id, primitives: [] }, "1.2.3.4", 0, permissive());
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});
```

Run: `npm test` — expected green, with the new test failing first if you add it before the handler change.

- [ ] **Step 6: Write the editor shell**

Create `src/components/Editor.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { Sheet, type FeedbackOverlay } from "./Sheet";
import { Toolbar } from "./Toolbar";
import { Notifications } from "./Notifications";
import { Pictorial } from "./Pictorial";
import { drawing, initEditor, reduce, type Action } from "@/lib/canvas/editor";
import { canRedo, canUndo } from "@/lib/canvas/history";
import { noticesFor, type Notice } from "@/lib/canvas/messages";
import { submitAttempt } from "@/lib/canvas/submit";
import type { Point } from "@/lib/canvas/coords";
import type { IsoPrimitive } from "@/lib/geometry/isotypes";

export type PublicDrill = {
  id: string;
  title: string;
  prompt: string;
  convention: "first_angle" | "third_angle";
  grid: { width: number; height: number };
  isometric: readonly IsoPrimitive[];
};

export function Editor({ drill }: { drill: PublicDrill }) {
  const [state, dispatch] = useReducer(reduce, undefined, initEditor);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [feedback, setFeedback] = useState<FeedbackOverlay | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dispatch({ type: "CANCEL" });
      else if (e.key === "Delete" || e.key === "Backspace") dispatch({ type: "DELETE_SELECTION" });
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "REDO" : "UNDO" });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "REDO" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onAction = useCallback((a: Action) => dispatch(a), []);

  const onSubmit = useCallback(async () => {
    setSubmitting(true);
    // Any edit invalidates the last overlay; clear before asking again.
    setFeedback(null);
    const result = await submitAttempt(drill.id, drawing(state));
    setSubmitting(false);

    if ("views" in result && result.ok) {
      setFeedback({ views: [result.views.front, result.views.top, result.views.side] });
      setNotices(noticesFor(result));
      return;
    }
    if ("found" in result) { setNotices(noticesFor(result)); return; }
    setNotices([{
      id: "transport", tone: "warn",
      text: (result as { reason: string }).reason === "RATE_LIMITED"
        ? "You are checking very quickly — wait a moment and try again."
        : "Could not reach the marker. Check your connection and try again.",
    }]);
  }, [drill.id, state]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{drill.title}</h1>
        <p className="max-w-[65ch] mt-1">{drill.prompt}</p>
        <p className="text-sm mt-1 opacity-70">
          Convention: {drill.convention === "first_angle" ? "first angle" : "third angle"}
        </p>
      </header>

      <div className="flex flex-wrap gap-6 items-start">
        <figure className="m-0">
          <figcaption className="text-xs uppercase tracking-wider opacity-70 mb-1">The part</figcaption>
          <Pictorial primitives={drill.isometric} />
        </figure>

        <div className="flex flex-col gap-2 flex-1 min-w-[320px]">
          <Toolbar
            tool={state.tool}
            activeType={state.activeType}
            canUndo={canUndo(state.history)}
            canRedo={canRedo(state.history)}
            hasSelection={state.selection.length > 0}
            submitting={submitting}
            onAction={onAction}
            onSubmit={onSubmit}
          />
          <div className="overflow-x-auto">
            <Sheet
              grid={drill.grid}
              drawing={drawing(state)}
              selection={state.selection}
              pending={state.pending}
              cursor={cursor}
              feedback={feedback}
              onGridClick={(p, additive) => dispatch({ type: "CLICK_GRID", at: p, additive })}
              onGridMove={setCursor}
            />
          </div>
        </div>
      </div>

      <Notifications notices={notices} />
    </div>
  );
}
```

- [ ] **Step 7: Write the pages**

Create `src/app/drills/[id]/page.tsx`:

```tsx
import { notFound } from "next/navigation";
import { Editor, type PublicDrill } from "@/components/Editor";
import { getDrill, publicHalf } from "@/drills/registry";

export default async function DrillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drill = getDrill(id);
  if (drill === null) notFound();

  // Only the public half crosses into the client component. The solid — which
  // IS the answer key, since generateViews turns it into the views — stays here.
  const pub = publicHalf(drill) as PublicDrill;

  return <main className="p-6 max-w-6xl mx-auto"><Editor drill={pub} /></main>;
}
```

Create `src/app/drills/page.tsx`:

```tsx
import Link from "next/link";
import { getDrill, listDrillIds } from "@/drills/registry";

export default function DrillsPage() {
  const drills = listDrillIds().map((id) => getDrill(id)!);

  return (
    <main className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Choose a drill</h1>
      <ul className="flex flex-col gap-2">
        {drills.map((d) => (
          <li key={d.id}>
            <Link href={`/drills/${d.id}`} className="underline">
              {d.title}
            </Link>
            <span className="text-sm opacity-70">
              {" "}— {d.convention === "first_angle" ? "first angle" : "third angle"}
            </span>
          </li>
        ))}
      </ul>
      {/* Reserved ad slot. Menus and the landing page only, never a drill page. */}
      <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
    </main>
  );
}
```

- [ ] **Step 8: Verify the isolation rule still holds**

Run: `npm test 2>&1 | grep -A3 "no client component"`
Expected: PASS. `page.tsx` files are server components importing the registry, which the rule allows under `app/`. If it fails, the message names the offending file — do not relax the rule to make it pass; move the import instead.

**Note:** `app/drills/[id]/page.tsx` imports the registry but is not under `app/api/`. The current `ALLOWED` regex permits `app/api/`, `lib/`, `drills/` and `server/`. Widen it to `app/` — server components are exactly as safe as route handlers, and the `"use client"` check is what actually guards the boundary. Add a positive control proving a `"use client"` page is still caught:

```typescript
test("a client-marked page under app/ is still caught", () => {
  const offending = `"use client";\nimport { getDrill } from "@/drills/registry";\n`;
  assert.notEqual(violation("app/drills/[id]/page.tsx", offending), null);
});
```

- [ ] **Step 9: Full verification, then run it for real**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Then: `PORT=3111 npm start &` and open `http://localhost:3111/drills`.

Check by hand: draw three views, press "Check my drawing", confirm a toast appears and the overlay marks the sheet; press Ctrl+Z and confirm the last primitive disappears; select a line and change its type; confirm the pictorial renders with no stray lines across faces.

- [ ] **Step 10: Commit and open the PR**

```bash
git add -A
git commit -m "feat(canvas): wire the editor, the drill page and the menu

The client holds the public half only. The solid stays on the server,
because generateViews turns a solid into the answer.

Submission failures - offline, rate limited - render as messages rather
than crashes: pressing a button and losing your work to an exception is
worse feedback than any wrong drawing.

Widens the isolation rule from app/api to app/: a server component is
exactly as safe as a route handler, and the 'use client' check is what
actually guards the boundary. A positive control pins that."

git push -u origin feat/type-a-canvas
GITHUB_TOKEN= gh pr create --fill
```

---

## Self-review notes

**Spec coverage.** §3.1 rendering → Task 6. §3.2 structure → Tasks 6–8. §3.3 state → Tasks 3–4. §3.4 interaction → Task 4 (logic) and Tasks 6–8 (input). §3.5 feedback and the anchor → Tasks 1, 5, 6. §5 ads → Task 8. §8 testing → every task. §6's `kind` discriminator → Task 8 Step 5.

**Deferred to the Type B plan, deliberately:** §4 in full, §7.1's relaxation of the isolation rule for `isometric.ts`/`isoedges.ts`/`isoproject.ts` (Type A needs no client-side projection — the pictorial arrives as data), and the four-viewpoint work.

**Left open by the spec and settled here:** feedback colours (§11) are the tokens added in Task 6 Step 2, chosen to sit clear of the centre-line red. The pictorial sits beside the sheet, wrapping below it on narrow screens (Task 8).
