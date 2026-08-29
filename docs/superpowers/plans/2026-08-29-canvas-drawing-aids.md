# Canvas Drawing Aids Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add five aids to the Type A canvas — a true circle preview, an angle readout at line interactions, copy/paste, a rotate tool at four stops, and mirror/flip.

**Architecture:** All logic lands in `src/lib/canvas/`, which is PURE (no DOM, no framework, no I/O) and tested under `node --test`. Two new pure modules — `angles.ts` for the readout and `transform.ts` for rotate and mirror — keep `editor.ts` from growing into a grab-bag. Components stay thin: they dispatch actions and render state.

**Tech Stack:** TypeScript, Next 16 App Router, React, `node --test` with `--experimental-strip-types`, Tailwind v4 CSS variables.

## Global Constraints

- **`src/lib/` is pure.** No DOM, no framework imports, no network, no filesystem. AGENTS.md §2 constraint 3. (`submit.ts` is a recorded exception; do not add another.)
- **The canvas must never produce a drawing the server rejects.** `validate.ts` caps: `MAX_PRIMITIVES = 400`, `MAX_COORD = 200`, `MAX_RADIUS = 100`, integer coordinates only, no zero-length segments.
- **Every coordinate this plan writes must be an integer.** No rounding of a rotated or mirrored result anywhere — exactness is by construction, not by cleanup.
- **Commits carry the builder's name only.** No `Co-Authored-By` trailer, no AI attribution. AGENTS.md §2.7.
- **Rotation sign: positive is counter-clockwise AS SEEN ON SCREEN.** Grid `y` increases downward, so `+90°` maps `(1,0)` to `(0,-1)`.
- **Verification gate before any PR:** `npm test && npm run lint && npm run typecheck && npm run build`, all clean.
- Baseline at the start of this plan: **390 tests passing.**

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/canvas/editor.ts` (modify) | The reducer. Gains `pendingPrimitive`, clipboard state, and the rotate/mirror actions. |
| `src/lib/canvas/angles.ts` (create) | Pure angle maths: heading, corner angle, interactions between a pending line and existing segments. |
| `src/lib/canvas/transform.ts` (create) | Pure rigid transforms: quarter-turn rotation, mirror, selection bounding box, base-point defaults. |
| `src/lib/canvas/angles.test.ts` (create) | Tests for `angles.ts`, including positive controls. |
| `src/lib/canvas/transform.test.ts` (create) | Tests for `transform.ts`: sign control, congruence, integrality, involution. |
| `src/lib/canvas/editor.test.ts` (modify) | Reducer tests for preview-equals-commit, copy/paste, rotate, mirror. |
| `src/components/Sheet.tsx` (modify) | Renders the circle preview, the angle readout, the rotate preview and base point. |
| `src/components/Toolbar.tsx` (modify) | The Rotate tool button, the typed-angle field, the two mirror buttons. |
| `src/components/Editor.tsx` (modify) | Keyboard: `Ctrl/Cmd+C`, `Ctrl/Cmd+V`, `r`, `Shift+H`, `Shift+V`. |

---

## Task 1: `pendingPrimitive` — one source for the preview and the commit

**Files:**
- Modify: `src/lib/canvas/editor.ts`
- Modify: `src/components/Sheet.tsx`
- Test: `src/lib/canvas/editor.test.ts`

**Interfaces:**
- Consumes: `radiusFrom` from `./coords.ts`; `Primitive`, `PrimitiveType` from `../scoring/primitives.ts`.
- Produces: `export function pendingPrimitive(tool: Tool, type: PrimitiveType, from: Point, to: Point): Primitive | null` — used by `Sheet.tsx` in Task 1 and by nothing else.

**Why this exists.** The preview line is currently drawn from raw `pending`/`cursor` while the committed circle comes from `radiusFrom()`, which rounds and clamps to `[1, MAX_RADIUS]`. A preview drawn from `Math.hypot` would lie near both clamps. One function, two callers, so the preview *is* what commits.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/canvas/editor.test.ts`:

```ts
import { initEditor, reduce, drawing, pendingPrimitive, type EditorState } from "./editor.ts";
import { MAX_RADIUS } from "../scoring/validate.ts";

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
    const s = [
      { type: "SET_TOOL", tool: "circle" } as const,
      { type: "CLICK_GRID", at: from, additive: false } as const,
      { type: "CLICK_GRID", at: to, additive: false } as const,
    ].reduce((acc: EditorState, a) => reduce(acc, a), initEditor());
    assert.deepEqual([preview], drawing(s), `preview diverged for ${JSON.stringify([from, to])}`);
  }
  assert.equal(pendingPrimitive("circle", "visible", { x: 0, y: 0 }, { x: 180, y: 0 })?.kind === "circle"
    ? (pendingPrimitive("circle", "visible", { x: 0, y: 0 }, { x: 180, y: 0 }) as { r: number }).r
    : -1, MAX_RADIUS);
});

test("the line preview is null exactly when the click would commit nothing", () => {
  assert.equal(pendingPrimitive("line", "visible", { x: 4, y: 4 }, { x: 4, y: 4 }), null);
  assert.deepEqual(pendingPrimitive("line", "hidden", { x: 4, y: 4 }, { x: 9, y: 4 }), {
    kind: "segment", type: "hidden", x1: 4, y1: 4, x2: 9, y2: 4,
  });
  assert.equal(pendingPrimitive("select", "visible", { x: 0, y: 0 }, { x: 3, y: 3 }), null);
  assert.equal(pendingPrimitive("move", "visible", { x: 0, y: 0 }, { x: 3, y: 3 }), null);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test 2>&1 | grep -A3 "preview"`
Expected: FAIL — `pendingPrimitive` is not exported from `editor.ts`.

- [ ] **Step 3: Add `pendingPrimitive` and route `clickWhileDrawing` through it**

In `src/lib/canvas/editor.ts`, add above `clickWhileDrawing`:

```ts
/**
 * The primitive a second click would commit, or null if it would commit
 * nothing.
 *
 * THE POINT OF THIS FUNCTION IS THAT IT HAS TWO CALLERS. `clickWhileDrawing`
 * commits its result and `Sheet` previews it, so the preview cannot drift from
 * what lands — `radiusFrom` rounds AND clamps to [1, MAX_RADIUS], so a preview
 * computed independently would lie at both ends of that range.
 */
export function pendingPrimitive(
  tool: Tool, type: PrimitiveType, from: Point, to: Point,
): Primitive | null {
  if (tool === "line") {
    // A zero-length segment is not a line; validate.ts refuses it.
    if (from.x === to.x && from.y === to.y) return null;
    return { kind: "segment", type, x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  }
  if (tool === "circle") {
    return { kind: "circle", type, cx: from.x, cy: from.y, r: radiusFrom(from, to) };
  }
  return null;
}
```

Replace the body of `clickWhileDrawing` after the `MAX_PRIMITIVES` guard with:

```ts
  const primitive = pendingPrimitive(s.tool, s.activeType, from, at);
  if (primitive === null) return { ...s, pending: null };
  return { ...commit(s, [...drawing(s), primitive]), pending: null };
```

- [ ] **Step 4: Run the tests**

Run: `npm test 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: PASS, count risen from 390 to 392.

- [ ] **Step 5: Render the circle preview in `Sheet.tsx`**

Add `pendingPrimitive` to the import from `@/lib/canvas/editor`. Replace the final `pending !== null && cursor !== null` block with:

```tsx
      {pending !== null && cursor !== null && (() => {
        const ghost = pendingPrimitive(tool, activeType, pending, cursor);
        const a = gridToScreen(pending, v);
        const b = gridToScreen(cursor, v);
        return (
          <g>
            {/* The radius line stays for the circle tool: it is how you see
                WHERE the edge point is, which the circle alone does not show. */}
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="var(--select)" strokeWidth={2} strokeDasharray="4 4" opacity={0.7}
            />
            {/* The circle itself, from the SAME function that will commit it. */}
            {ghost?.kind === "circle" && (
              <circle
                cx={a.x} cy={a.y} r={ghost.r * v.cell}
                fill="none" stroke="var(--select)" strokeWidth={2}
                strokeDasharray="4 4" opacity={0.7}
              />
            )}
          </g>
        );
      })()}
```

`Sheet` already receives `tool`. Add `activeType: PrimitiveType` to its props and pass `state.activeType` from `Editor.tsx` — `Sheet` needs it to build the ghost.

- [ ] **Step 6: Verify the gate**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all clean, 392 tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/canvas/editor.ts src/lib/canvas/editor.test.ts src/components/Sheet.tsx src/components/Editor.tsx
git commit -m "feat(canvas): preview the circle that will actually commit

The preview line came from the raw cursor while the committed circle came
from radiusFrom, which rounds and clamps to [1, MAX_RADIUS]. Drawing a
preview circle independently would have lied at both clamps.

pendingPrimitive now has two callers -- the reducer commits its result and
the sheet previews it -- so the preview cannot drift from what lands. Pinned
by a test that sweeps both clamps."
```

---

## Task 2: `angles.ts` — the pure angle maths

**Files:**
- Create: `src/lib/canvas/angles.ts`
- Test: `src/lib/canvas/angles.test.ts`

**Interfaces:**
- Consumes: `Point` from `./coords.ts`; `Primitive`, `Segment` from `../scoring/primitives.ts`.
- Produces:
  - `export type Interaction = { kind: "corner" | "crossing"; at: Point; degrees: number; exact: boolean }`
  - `export function headingOf(from: Point, to: Point): number | null`
  - `export function cornerAngle(a: Point, vertex: Point, b: Point): number`
  - `export function isExactAngle(ux: number, uy: number, vx: number, vy: number): boolean`
  - `export function interactionsWith(from: Point, to: Point, ps: readonly Primitive[]): Interaction[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/canvas/angles.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { headingOf, cornerAngle, isExactAngle, interactionsWith } from "./angles.ts";
import type { Primitive } from "../scoring/primitives.ts";

const seg = (x1: number, y1: number, x2: number, y2: number): Primitive =>
  ({ kind: "segment", type: "visible", x1, y1, x2, y2 });

test("heading reads as it LOOKS on screen, where grid y runs downward", () => {
  assert.equal(headingOf({ x: 0, y: 0 }, { x: 5, y: 0 }), 0);      // due right
  assert.equal(headingOf({ x: 0, y: 0 }, { x: 5, y: -5 }), 45);    // up and right
  assert.equal(headingOf({ x: 0, y: 0 }, { x: 0, y: -5 }), 90);    // straight up
  assert.equal(headingOf({ x: 0, y: 0 }, { x: -5, y: -5 }), 135);  // up and left
  // A line, not a ray: the reverse direction reads the same.
  assert.equal(headingOf({ x: 5, y: -5 }, { x: 0, y: 0 }), 45);
});

test("heading is null for a zero-length line, so nothing is shown before the cursor moves", () => {
  assert.equal(headingOf({ x: 3, y: 3 }, { x: 3, y: 3 }), null);
});

test("corner angle is the TRUE corner in [0,180], not the acute one", () => {
  // Right angle.
  assert.equal(cornerAngle({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 5 }), 90);
  // 45 degrees.
  assert.equal(cornerAngle({ x: 5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }), 45);
  // POSITIVE CONTROL for the design decision: an obtuse corner must read 135,
  // not 45. This test FAILS under an "acute angle everywhere" implementation,
  // so it pins the choice and not merely the arithmetic.
  assert.equal(cornerAngle({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 5 }), 135);
  // Straight through.
  assert.equal(cornerAngle({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 5, y: 0 }), 180);
});

test("exactness is decided in integer arithmetic, never by comparing floats", () => {
  assert.equal(isExactAngle(1, 0, 0, 1), true);    // 90
  assert.equal(isExactAngle(1, 0, 1, 1), true);    // 45
  assert.equal(isExactAngle(1, 0, -1, 1), true);   // 135
  assert.equal(isExactAngle(1, 0, 3, 0), true);    // 0
  assert.equal(isExactAngle(1, 0, 2, 1), false);   // 26.57
  assert.equal(isExactAngle(1, 0, 4, 7), false);   // 60.26 -- the near-60 case
});

test("a shared endpoint reports a corner, at that endpoint", () => {
  const ps = [seg(0, 0, 10, 0)];
  const got = interactionsWith({ x: 0, y: 0 }, { x: 0, y: -6 }, ps);
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, "corner");
  assert.deepEqual(got[0].at, { x: 0, y: 0 });
  assert.equal(got[0].degrees, 90);
  assert.equal(got[0].exact, true);
});

test("a proper crossing reports the acute angle, at the crossing point", () => {
  const ps = [seg(0, 0, 10, 0)];
  const got = interactionsWith({ x: 5, y: -5 }, { x: 5, y: 5 }, ps);
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, "crossing");
  assert.deepEqual(got[0].at, { x: 5, y: 0 });
  assert.equal(got[0].degrees, 90);
});

test("POSITIVE CONTROL: two disjoint segments report NO interaction", () => {
  const ps = [seg(0, 0, 4, 0)];
  assert.deepEqual(interactionsWith({ x: 20, y: 20 }, { x: 25, y: 25 }, ps), []);
});

test("POSITIVE CONTROL: a parallel line that never meets reports nothing", () => {
  const ps = [seg(0, 0, 10, 0)];
  assert.deepEqual(interactionsWith({ x: 0, y: 4 }, { x: 10, y: 4 }, ps), []);
});

test("circles are skipped entirely -- the angle to a circle is against its tangent", () => {
  const ps: Primitive[] = [{ kind: "circle", type: "visible", cx: 5, cy: 0, r: 3 }];
  assert.deepEqual(interactionsWith({ x: 5, y: -6 }, { x: 5, y: 6 }, ps), []);
});

test("construction lines DO count -- the mitre line is what a student measures against", () => {
  const ps: Primitive[] = [
    { kind: "segment", type: "construction", x1: 0, y1: 0, x2: 10, y2: 10 },
  ];
  const got = interactionsWith({ x: 0, y: 0 }, { x: 10, y: 0 }, ps);
  assert.equal(got.length, 1);
  assert.equal(got[0].degrees, 45);
  assert.equal(got[0].exact, true);
});

test("a T-junction -- an endpoint landing mid-line -- reports as a crossing", () => {
  const ps = [seg(0, 0, 10, 0)];
  const got = interactionsWith({ x: 5, y: 0 }, { x: 5, y: -6 }, ps);
  assert.equal(got.length, 1);
  assert.equal(got[0].kind, "crossing");
  assert.equal(got[0].degrees, 90);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './angles.ts'`.

- [ ] **Step 3: Write `angles.ts`**

```ts
/**
 * Angles between the line being drawn and the lines already on the sheet.
 *
 * WHY THIS EXISTS. On this grid a segment can only make certain angles: the
 * multiples of 45 are exact and nothing else is. `tan 60 = sqrt 3`, so no pair
 * of lattice points sits at 60 degrees — the nearest within 12 units is
 * 60.2551. A readout is therefore not a convenience but the only way a student
 * learns their line is not the angle they intended.
 *
 * PURE. No I/O, no DOM, no framework imports. See AGENTS.md §8.
 */
import type { Point } from "./coords.ts";
import type { Primitive, Segment } from "../scoring/primitives.ts";

const DEG = 180 / Math.PI;

export type Interaction = {
  kind: "corner" | "crossing";
  /** Where to draw the label. A crossing point is often NOT a lattice point;
   *  that is fine, an Interaction is chrome and never enters the drawing. */
  at: Point;
  degrees: number;
  exact: boolean;
};

const same = (p: Point, q: Point): boolean => p.x === q.x && p.y === q.y;

/**
 * The pending line's own angle, in [0,180), measured as it LOOKS on screen.
 *
 * Grid y increases DOWNWARD, so dy is negated: a segment going up and to the
 * right reads 45, not -45. Reported for the LINE rather than the ray, because
 * a student thinks "that line is at 45", not "that ray is at 225".
 */
export function headingOf(from: Point, to: Point): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 0 && dy === 0) return null;
  let a = Math.atan2(-dy, dx) * DEG;
  if (a < 0) a += 180;
  if (a >= 180) a -= 180;
  return a;
}

/** The true corner at `vertex` between the rays to `a` and `b`, in [0,180]. */
export function cornerAngle(a: Point, vertex: Point, b: Point): number {
  const ux = a.x - vertex.x, uy = a.y - vertex.y;
  const vx = b.x - vertex.x, vy = b.y - vertex.y;
  return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * DEG);
}

/**
 * Is the angle between two integer vectors an exact multiple of 45?
 *
 * Decided in INTEGER arithmetic — never by comparing a float against 45.0.
 * The angle is a multiple of 90 iff dot or cross is zero, and an odd multiple
 * of 45 iff |dot| == |cross|. Both are exact tests on integers, so an angle
 * that only looks like 45 to six decimal places is correctly reported as not.
 */
export function isExactAngle(ux: number, uy: number, vx: number, vy: number): boolean {
  const dot = ux * vx + uy * vy;
  const cross = ux * vy - uy * vx;
  return dot === 0 || cross === 0 || Math.abs(dot) === Math.abs(cross);
}

/** The acute member of the four angles at a crossing, in [0,90]. */
function acuteBetween(ux: number, uy: number, vx: number, vy: number): number {
  const a = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy) * DEG);
  return a > 90 ? 180 - a : a;
}

/**
 * Where two segments meet, or null. Endpoints are INCLUDED, so a T-junction —
 * one line's endpoint landing on another's interior — counts. A shared
 * endpoint is handled as a corner before this is ever called, so it cannot
 * reach here.
 */
function meetingPoint(p1: Point, p2: Point, p3: Point, p4: Point): Point | null {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (den === 0) return null; // parallel or collinear: no single meeting point
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

const isSegment = (p: Primitive): p is Segment => p.kind === "segment";

/**
 * Every interaction between the pending line and the segments already drawn.
 *
 * CIRCLES ARE SKIPPED. The angle between a line and a circle is against the
 * tangent at the intersection, which is a different calculation and was not
 * asked for. CONSTRUCTION LINES ARE INCLUDED: the mitre line and the
 * projection lines are exactly what a student measures against.
 */
export function interactionsWith(
  from: Point, to: Point, ps: readonly Primitive[],
): Interaction[] {
  if (same(from, to)) return [];
  const out: Interaction[] = [];

  for (const s of ps.filter(isSegment)) {
    const a: Point = { x: s.x1, y: s.y1 };
    const b: Point = { x: s.x2, y: s.y2 };

    // A shared endpoint is a real corner with one unambiguous angle.
    let vertex: Point | null = null;
    let pendOther: Point = to;
    let segOther: Point = b;
    if (same(from, a)) { vertex = a; pendOther = to; segOther = b; }
    else if (same(from, b)) { vertex = b; pendOther = to; segOther = a; }
    else if (same(to, a)) { vertex = a; pendOther = from; segOther = b; }
    else if (same(to, b)) { vertex = b; pendOther = from; segOther = a; }

    if (vertex !== null) {
      out.push({
        kind: "corner",
        at: vertex,
        degrees: cornerAngle(pendOther, vertex, segOther),
        exact: isExactAngle(
          pendOther.x - vertex.x, pendOther.y - vertex.y,
          segOther.x - vertex.x, segOther.y - vertex.y,
        ),
      });
      continue;
    }

    const at = meetingPoint(from, to, a, b);
    if (at === null) continue;
    const ux = to.x - from.x, uy = to.y - from.y;
    const vx = b.x - a.x, vy = b.y - a.y;
    out.push({
      kind: "crossing",
      at,
      degrees: acuteBetween(ux, uy, vx, vy),
      exact: isExactAngle(ux, uy, vx, vy),
    });
  }

  return out;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: PASS, count risen to 403.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/angles.ts src/lib/canvas/angles.test.ts
git commit -m "feat(canvas): pure angle maths for the readout

Heading of the pending line, the true corner angle at a shared endpoint, and
the acute angle at a crossing or T-junction.

Exactness is decided in INTEGER arithmetic -- dot == 0, cross == 0, or
|dot| == |cross| -- never by comparing a float to 45.0, so a line at 60.2551
is correctly reported as not exact rather than rounding into a lie.

Two positive controls: an obtuse corner must read 135 and not 45, which
fails under the acute-everywhere design that was rejected; and disjoint or
parallel segments must report nothing at all."
```

---

## Task 3: render the angle readout

**Files:**
- Modify: `src/components/Sheet.tsx`

**Interfaces:**
- Consumes: `headingOf`, `interactionsWith`, `Interaction` from `@/lib/canvas/angles` (Task 2); `pendingPrimitive` (Task 1).
- Produces: nothing importable — rendering only.

- [ ] **Step 1: Add the readout to `Sheet.tsx`**

Import at the top:

```tsx
import { headingOf, interactionsWith, isExactAngle } from "@/lib/canvas/angles";
```

Inside the component, above the `return`:

```tsx
  // The angle readout. Rendering only: an Interaction never enters `drawing`,
  // so its frequently-fractional crossing point cannot reach validate.ts.
  const showAngles = pending !== null && cursor !== null && tool === "line";
  const interactions = showAngles ? interactionsWith(pending, cursor, drawing) : [];
  // The heading is for LINES only -- a circle has no heading, and the angle of
  // its radius drag means nothing to the student.
  const heading = showAngles ? headingOf(pending, cursor) : null;
```

Add before the closing `</svg>`, after the pending-preview block:

```tsx
      {interactions.map((it, i) => {
        const p = gridToScreen(it.at, v);
        const tone = it.exact ? "var(--select)" : "var(--warn)";
        return (
          <g key={`ang${i}`} pointerEvents="none">
            <circle cx={p.x} cy={p.y} r={9} fill="none" stroke={tone} strokeWidth={1.5} opacity={0.85} />
            <rect
              x={p.x + 12} y={p.y - 20} width={54} height={17} rx={3}
              fill="var(--bg-raised)" stroke={tone} strokeWidth={1} opacity={0.95}
            />
            <text
              x={p.x + 39} y={p.y - 8} textAnchor="middle"
              fontSize={11} fill={tone} style={{ fontVariantNumeric: "tabular-nums" }}
            >{it.degrees.toFixed(1)}°</text>
          </g>
        );
      })}

      {heading !== null && cursor !== null && pending !== null && (() => {
        const p = gridToScreen(cursor, v);
        // The INTEGER rule, not `heading % 45 === 0`. A float comparison
        // happens to give the right answer for every case swept, but the
        // spec's principle is that exactness is decided on integers, and a
        // rule that holds by luck is one a reader cannot check at a glance.
        const exact = isExactAngle(cursor.x - pending.x, cursor.y - pending.y, 1, 0);
        const tone = exact ? "var(--select)" : "var(--text-tertiary)";
        return (
          <g pointerEvents="none">
            <rect
              x={p.x + 14} y={p.y + 8} width={54} height={17} rx={3}
              fill="var(--bg-raised)" stroke={tone} strokeWidth={1} opacity={0.95}
            />
            <text
              x={p.x + 41} y={p.y + 20} textAnchor="middle"
              fontSize={11} fill={tone} style={{ fontVariantNumeric: "tabular-nums" }}
            >{heading.toFixed(1)}°</text>
          </g>
        );
      })()}
```

- [ ] **Step 2: Verify the gate**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all clean, 403 tests.

- [ ] **Step 3: Read it in a browser — this step is NOT optional**

Run `npm run dev`, open an orthographic drill, and check all four:
1. Draw a line from an existing line's endpoint at 90° — the corner label reads `90.0°` in the exact tone.
2. Draw one at `(1,2)` — it reads `63.4°` in the warn tone, NOT snapped to 60.
3. Draw a line crossing two existing lines — two labels appear and do not overlap each other or bury the drawing.
4. Switch to the circle tool — **no heading chip appears**.

AGENTS.md §6 records that authored content and rendered layout are the two things a green suite cannot see. A label sitting on top of the student's ink is exactly that class of defect.

- [ ] **Step 4: Commit**

```bash
git add src/components/Sheet.tsx
git commit -m "feat(canvas): show the angle a line is about to make

A corner angle at a shared endpoint, the acute angle at a crossing, and a
live heading chip while a line is pending. Exact multiples of 45 render in a
distinct tone from everything else, because on this grid they are the only
angles that exist exactly -- a line at 63.4 should not look like a success.

Lines only: a circle has no heading and its radius drag's angle would mean
nothing."
```

---

## Task 4: copy and paste

**Files:**
- Modify: `src/lib/canvas/editor.ts`
- Modify: `src/components/Editor.tsx`
- Test: `src/lib/canvas/editor.test.ts`

**Interfaces:**
- Consumes: `shift` (already private in `editor.ts`), `MAX_PRIMITIVES`.
- Produces: `EditorState.clipboard: Primitive[]`, `EditorState.pasteSerial: number`; actions `{ type: "COPY_SELECTION" }` and `{ type: "PASTE" }`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/canvas/editor.test.ts`:

```ts
const twoLines = [
  { type: "SET_TOOL", tool: "line" } as const,
  { type: "CLICK_GRID", at: { x: 0, y: 0 }, additive: false } as const,
  { type: "CLICK_GRID", at: { x: 4, y: 0 }, additive: false } as const,
  { type: "CLICK_GRID", at: { x: 0, y: 2 }, additive: false } as const,
  { type: "CLICK_GRID", at: { x: 4, y: 2 }, additive: false } as const,
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
  const s = run([
    ...twoLines,
    { type: "SET_TOOL", tool: "select" },
    { type: "DRAG_BEGIN", at: { x: -1, y: -1 } },
    { type: "DRAG_UPDATE", at: { x: 6, y: 4 } },
    { type: "DRAG_COMMIT", additive: false },
    { type: "COPY_SELECTION" },
    { type: "PASTE" },
    { type: "UNDO" },
  ]);
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
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test 2>&1 | tail -15`
Expected: FAIL — `clipboard` is not a property of `EditorState`.

- [ ] **Step 3: Implement**

In `editor.ts`, add to `EditorState`:

```ts
  /** Copied primitives, held INSIDE the editor rather than in the system
   *  clipboard: pure, testable without a browser, and no permission prompt.
   *  Cross-tab copy is not a need here. */
  clipboard: Primitive[];
  /** How many times the current clipboard has been pasted, so each paste
   *  steps one unit further out and copies never hide under each other. */
  pasteSerial: number;
```

Add to `initEditor()`: `clipboard: [], pasteSerial: 0,`.

Add to `Action`:

```ts
  | { type: "COPY_SELECTION" }
  | { type: "PASTE" }
```

Add the two cases to `reduce`:

```ts
    case "COPY_SELECTION": {
      // An empty selection must not WIPE what is already held — that would
      // lose a copy to a stray click on blank paper.
      if (s.selection.length === 0) return s;
      const chosen = new Set(s.selection);
      return {
        ...s,
        clipboard: drawing(s).filter((_, i) => chosen.has(i)),
        pasteSerial: 0,
      };
    }

    case "PASTE": {
      if (s.clipboard.length === 0) return s;
      // Refuse WHOLLY, never partially: validate.ts rejects an attempt over
      // MAX_PRIMITIVES, so a half-pasted clipboard would be both surprising
      // and unsubmittable.
      if (drawing(s).length + s.clipboard.length > MAX_PRIMITIVES) return s;
      const step = s.pasteSerial + 1;
      const pasted = s.clipboard.map((p) => shift(p, step, step));
      const base = drawing(s).length;
      return {
        ...commit(s, [...drawing(s), ...pasted]),
        selection: pasted.map((_, i) => base + i),
        pasteSerial: step,
      };
    }
```

- [ ] **Step 4: Run the tests**

Run: `npm test 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: PASS, count risen to 408.

- [ ] **Step 5: Wire the keyboard, and fix the comment it invalidates**

In `src/components/Editor.tsx`, add before the `z`/`y` branches:

```tsx
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        dispatch({ type: "COPY_SELECTION" });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        dispatch({ type: "PASTE" });
      }
```

The existing comment on the single-key branch claims `Ctrl+C` is deliberately left untouched. That is no longer true. Replace that sentence with:

```tsx
        // Single-key tool shortcuts. Deliberately excluded from firing under
        // any modifier — "no modifier" per the plan. Ctrl+C and Ctrl+V are
        // now CLAIMED above for copy and paste; this branch never sees them
        // because it requires no modifier held. The form-control guard above
        // already stops these firing while a <select> or input has focus.
```

- [ ] **Step 6: Verify the gate and commit**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

```bash
git add src/lib/canvas/editor.ts src/lib/canvas/editor.test.ts src/components/Editor.tsx
git commit -m "feat(canvas): copy and paste, with the pasted copy selected

An internal clipboard rather than the system one: pure, testable without a
browser, and no permission prompt. Each paste steps one unit further out, so
a repeated paste does not hide under the previous copy, and the new
primitives are selected immediately so Move and the arrow keys act on them.

Paste refuses WHOLLY at MAX_PRIMITIVES rather than pasting part of the
clipboard, matching how a click already refuses at the same cap. An empty
selection does not wipe the clipboard.

Updates the keyboard comment that claimed Ctrl+C was left free -- it is not
free any more, and a comment contradicting the code is how the next session
learns the wrong rule."
```

---

## Task 5: `transform.ts` — rotate and mirror geometry

**Files:**
- Create: `src/lib/canvas/transform.ts`
- Test: `src/lib/canvas/transform.test.ts`

**Interfaces:**
- Consumes: `Point` from `./coords.ts`; `Primitive` from `../scoring/primitives.ts`.
- Produces:
  - `export function rotatePoint(p: Point, base: Point, quarterTurns: number): Point`
  - `export function rotatePrimitive(p: Primitive, base: Point, quarterTurns: number): Primitive`
  - `export function mirrorPrimitive(p: Primitive, axis: number, horizontal: boolean): Primitive`
  - `export function selectionBounds(ps: readonly Primitive[], indices: readonly number[]): { minX: number; minY: number; maxX: number; maxY: number } | null`
  - `export function defaultRotateBase(ps: readonly Primitive[], indices: readonly number[]): Point | null`
  - `export function mirrorAxis(ps: readonly Primitive[], indices: readonly number[], horizontal: boolean): number | null`
  - `export function quarterTurnsFor(degrees: number): number | null`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/canvas/transform.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  rotatePoint, rotatePrimitive, mirrorPrimitive, selectionBounds,
  defaultRotateBase, mirrorAxis, quarterTurnsFor,
} from "./transform.ts";
import type { Primitive } from "../scoring/primitives.ts";

const seg = (x1: number, y1: number, x2: number, y2: number): Primitive =>
  ({ kind: "segment", type: "visible", x1, y1, x2, y2 });

// An asymmetric L, so a mirror or a wrong sign cannot hide behind symmetry.
const L: Primitive[] = [
  seg(0, 0, 8, 0), seg(8, 0, 8, 3), seg(8, 3, 5, 3),
  seg(5, 3, 5, 7), seg(5, 7, 0, 7), seg(0, 7, 0, 0),
];
const ALL = L.map((_, i) => i);

test("SIGN CONTROL: positive is counter-clockwise AS SEEN ON SCREEN", () => {
  // Grid y runs DOWNWARD, so a screen-anticlockwise quarter turn sends a
  // point on the +x axis to the point ABOVE the base, which is -y.
  assert.deepEqual(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, 1), { x: 0, y: -1 });
  assert.deepEqual(rotatePoint({ x: 0, y: -1 }, { x: 0, y: 0 }, 1), { x: -1, y: 0 });
  assert.deepEqual(rotatePoint({ x: 1, y: 0 }, { x: 0, y: 0 }, -1), { x: 0, y: 1 });
});

test("four quarter turns return the drawing exactly", () => {
  const base = { x: 4, y: 3 };
  const once = L.map((p) => rotatePrimitive(p, base, 1));
  const four = L.map((p) => rotatePrimitive(p, base, 4));
  assert.deepEqual(four, L);
  assert.notDeepEqual(once, L); // positive control: it really did move
});

test("rotation is CONGRUENT -- every pairwise distance preserved exactly", () => {
  for (const turns of [1, 2, 3]) {
    const out = L.map((p) => rotatePrimitive(p, { x: 4, y: 3 }, turns));
    for (let i = 0; i < L.length; i++) {
      const a = L[i], b = out[i];
      assert.equal(a.kind, "segment"); assert.equal(b.kind, "segment");
      if (a.kind !== "segment" || b.kind !== "segment") continue;
      assert.equal(
        Math.hypot(a.x2 - a.x1, a.y2 - a.y1),
        Math.hypot(b.x2 - b.x1, b.y2 - b.y1),
        `length changed at ${turns} turns`,
      );
    }
  }
});

test("THE PARITY TRAP: every rotated coordinate is an integer, for every bbox parity", () => {
  // Rotating about a bounding-box CENTRE is off-lattice whenever the box's
  // width and height differ in parity. defaultRotateBase rounds to a lattice
  // point precisely so this cannot happen.
  for (const [w, h] of [[8, 6], [7, 6], [8, 5], [7, 5]]) {
    const box: Primitive[] = [seg(0, 0, w, 0), seg(w, 0, w, h), seg(w, h, 0, h), seg(0, h, 0, 0)];
    const base = defaultRotateBase(box, box.map((_, i) => i));
    assert.notEqual(base, null);
    if (base === null) continue;
    assert.equal(Number.isInteger(base.x) && Number.isInteger(base.y), true,
      `base point not integer for ${w}x${h}`);
    for (const turns of [1, 2, 3]) {
      for (const p of box.map((q) => rotatePrimitive(q, base, turns))) {
        if (p.kind !== "segment") continue;
        for (const n of [p.x1, p.y1, p.x2, p.y2]) {
          assert.equal(Number.isInteger(n), true, `non-integer at ${w}x${h}, ${turns} turns`);
        }
      }
    }
  }
});

test("a circle rotates by its centre and keeps its radius", () => {
  const c: Primitive = { kind: "circle", type: "hidden", cx: 6, cy: 2, r: 3 };
  assert.deepEqual(rotatePrimitive(c, { x: 4, y: 4 }, 1),
    { kind: "circle", type: "hidden", cx: 2, cy: 2, r: 3 });
});

test("only whole quarter turns are accepted -- a decimal stop is not a stop", () => {
  assert.equal(quarterTurnsFor(90), 1);
  assert.equal(quarterTurnsFor(-90), -1);
  assert.equal(quarterTurnsFor(180), 2);
  assert.equal(quarterTurnsFor(-360), -4);
  assert.equal(quarterTurnsFor(0), 0);
  assert.equal(quarterTurnsFor(45), null);
  assert.equal(quarterTurnsFor(36.87), null);
  assert.equal(quarterTurnsFor(30), null);
});

test("MIRROR needs no base point: the bbox centre is safe for EVERY bbox", () => {
  // A mirror maps x -> 2*cx - x and leaves y alone, so it is exact whenever
  // 2*cx is an integer. cx = (minX+maxX)/2, whose numerator is always an
  // integer, so this holds for every selection -- unlike rotation, which
  // couples x and y and fails on mixed parity.
  for (const [w, h] of [[8, 6], [7, 6], [8, 5], [7, 5]]) {
    const box: Primitive[] = [seg(0, 0, w, 0), seg(w, 0, w, h), seg(w, h, 0, h), seg(0, h, 0, 0)];
    const idx = box.map((_, i) => i);
    for (const horizontal of [true, false]) {
      const axis = mirrorAxis(box, idx, horizontal);
      assert.notEqual(axis, null);
      if (axis === null) continue;
      for (const p of box.map((q) => mirrorPrimitive(q, axis, horizontal))) {
        if (p.kind !== "segment") continue;
        for (const n of [p.x1, p.y1, p.x2, p.y2]) {
          assert.equal(Number.isInteger(n), true, `non-integer mirroring ${w}x${h}`);
        }
      }
    }
  }
});

test("mirroring twice returns the original, and once does NOT", () => {
  const axis = mirrorAxis(L, ALL, true);
  assert.notEqual(axis, null);
  if (axis === null) return;
  const once = L.map((p) => mirrorPrimitive(p, axis, true));
  const twice = once.map((p) => mirrorPrimitive(p, axis, true));
  assert.deepEqual(twice, L);
  // POSITIVE CONTROL: without this, a mirror implemented as a no-op would
  // pass the involution test above.
  assert.notDeepEqual(once, L);
});

test("selectionBounds spans a circle's full extent, not just its centre", () => {
  const ps: Primitive[] = [{ kind: "circle", type: "visible", cx: 5, cy: 5, r: 3 }];
  assert.deepEqual(selectionBounds(ps, [0]), { minX: 2, minY: 2, maxX: 8, maxY: 8 });
});

test("an empty selection has no bounds, no base point and no mirror axis", () => {
  assert.equal(selectionBounds(L, []), null);
  assert.equal(defaultRotateBase(L, []), null);
  assert.equal(mirrorAxis(L, [], true), null);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test 2>&1 | tail -15`
Expected: FAIL — `Cannot find module './transform.ts'`.

- [ ] **Step 3: Write `transform.ts`**

```ts
/**
 * Rigid transforms of a selection: quarter-turn rotation, and mirroring.
 *
 * WHY ONLY QUARTER TURNS. Only 0, 90, 180 and 270 degrees map the integer
 * lattice to itself — 4 of 360 whole degrees, measured. No finer grid ever
 * adds more: 0 of 6560 lattice points survive a 45 degree rotation, because
 * (x-y)/sqrt2 is an integer only if x-y is a multiple of sqrt2. Rotating and
 * ROUNDING is not a near miss either: a 4-unit edge becomes 2.828 and a right
 * angle becomes 78.7. See the 2026-08-29 spec §2.2.
 *
 * WHY ROTATE TAKES A BASE POINT AND MIRROR DOES NOT. Rotation couples the two
 * coordinates — it is exact only when cx and cy are both integer or both
 * half-integer, so a bounding-box centre fails for mixed-parity boxes, about
 * half of all selections. A mirror touches one coordinate at a time and needs
 * only 2*cx to be an integer, which a bounding-box centre always satisfies.
 *
 * PURE. No I/O, no DOM, no framework imports. See AGENTS.md §8.
 */
import type { Point } from "./coords.ts";
import type { Primitive } from "../scoring/primitives.ts";

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Rotate about `base` by whole quarter turns.
 *
 * POSITIVE IS COUNTER-CLOCKWISE AS SEEN ON SCREEN. Grid y increases downward,
 * so this is NOT the textbook matrix: one positive quarter turn sends (dx,dy)
 * to (dy,-dx), and (1,0) to (0,-1). A sign error here yields a drawing that is
 * perfectly self-consistent and perfectly mirrored — the failure class the
 * golden set exists to catch — so it is pinned by a positive control test.
 */
export function rotatePoint(p: Point, base: Point, quarterTurns: number): Point {
  const k = ((quarterTurns % 4) + 4) % 4;
  let x = p.x - base.x;
  let y = p.y - base.y;
  for (let i = 0; i < k; i++) {
    const nx = y;
    const ny = -x;
    x = nx; y = ny;
  }
  return { x: base.x + x, y: base.y + y };
}

export function rotatePrimitive(p: Primitive, base: Point, quarterTurns: number): Primitive {
  if (p.kind === "circle") {
    const c = rotatePoint({ x: p.cx, y: p.cy }, base, quarterTurns);
    return { ...p, cx: c.x, cy: c.y };
  }
  const a = rotatePoint({ x: p.x1, y: p.y1 }, base, quarterTurns);
  const b = rotatePoint({ x: p.x2, y: p.y2 }, base, quarterTurns);
  return { ...p, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** Mirror across `x = axis` when `horizontal`, otherwise across `y = axis`. */
export function mirrorPrimitive(p: Primitive, axis: number, horizontal: boolean): Primitive {
  const fx = (x: number) => (horizontal ? 2 * axis - x : x);
  const fy = (y: number) => (horizontal ? y : 2 * axis - y);
  if (p.kind === "circle") return { ...p, cx: fx(p.cx), cy: fy(p.cy) };
  return { ...p, x1: fx(p.x1), y1: fy(p.y1), x2: fx(p.x2), y2: fy(p.y2) };
}

/** A circle contributes its FULL extent, not just its centre. */
export function selectionBounds(
  ps: readonly Primitive[], indices: readonly number[],
): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let seen = false;
  for (const i of indices) {
    const p = ps[i];
    if (p === undefined) continue;
    seen = true;
    if (p.kind === "circle") {
      minX = Math.min(minX, p.cx - p.r); maxX = Math.max(maxX, p.cx + p.r);
      minY = Math.min(minY, p.cy - p.r); maxY = Math.max(maxY, p.cy + p.r);
    } else {
      minX = Math.min(minX, p.x1, p.x2); maxX = Math.max(maxX, p.x1, p.x2);
      minY = Math.min(minY, p.y1, p.y2); maxY = Math.max(maxY, p.y1, p.y2);
    }
  }
  return seen ? { minX, minY, maxX, maxY } : null;
}

/**
 * The default rotation base: the bounding-box centre ROUNDED to a lattice
 * point. The rounding is the whole point — an unrounded centre is off-lattice
 * whenever the box's width and height differ in parity, and there is then no
 * way to express an unsafe base point rather than validating for one after
 * the fact.
 */
export function defaultRotateBase(
  ps: readonly Primitive[], indices: readonly number[],
): Point | null {
  const b = selectionBounds(ps, indices);
  if (b === null) return null;
  return { x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) };
}

/** The mirror axis: the bounding-box centre, NOT rounded — see the docblock. */
export function mirrorAxis(
  ps: readonly Primitive[], indices: readonly number[], horizontal: boolean,
): number | null {
  const b = selectionBounds(ps, indices);
  if (b === null) return null;
  return horizontal ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2;
}

/**
 * Whole quarter turns for a typed angle, or null if the grid cannot express it.
 *
 * Only multiples of 90 are accepted. Twelve exact stops DO exist on a
 * multiple-of-5 lattice at the Pythagorean angles (36.87, 53.13, ...), but
 * every one of them is a decimal, and a snap stop labelled "36.87 degrees" is
 * a bad control. Whole numbers only — the builder's rule, 2026-08-29.
 */
export function quarterTurnsFor(degrees: number): number | null {
  if (!Number.isFinite(degrees)) return null;
  if (!Number.isInteger(degrees)) return null;
  if (degrees % 90 !== 0) return null;
  return degrees / 90;
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: PASS, count risen to 418.

- [ ] **Step 5: Commit**

```bash
git add src/lib/canvas/transform.ts src/lib/canvas/transform.test.ts
git commit -m "feat(canvas): quarter-turn rotation and mirror geometry

Only 0/90/180/270 map the integer lattice to itself -- 4 of 360 -- and no
finer grid ever adds more. Rotate-and-round is not a near miss: a 4-unit
edge becomes 2.828 and a right angle 78.7, so it is not offered at all.

Rotate takes a base point and mirror does not, which is measured rather than
arbitrary: rotation couples x and y and is off-lattice whenever a bounding
box's width and height differ in parity, while a mirror touches one
coordinate at a time and is safe about any bbox centre.

The sign is pinned by a positive control. Grid y runs downward, so a
positive quarter turn maps (1,0) to (0,-1) -- a sign error here would give a
drawing that is self-consistent and mirrored, which is the one failure the
golden set exists to catch."
```

---

## Task 6: the rotate tool in the reducer and the UI

**Files:**
- Modify: `src/lib/canvas/editor.ts`
- Modify: `src/components/Toolbar.tsx`
- Modify: `src/components/Sheet.tsx`
- Modify: `src/components/Editor.tsx`
- Test: `src/lib/canvas/editor.test.ts`

**Interfaces:**
- Consumes: `rotatePrimitive`, `defaultRotateBase`, `quarterTurnsFor` from `./transform.ts` (Task 5).
- Produces: `Tool` gains `"rotate"`; `EditorState.rotateBase: Point | null`; actions `{ type: "SET_ROTATE_BASE"; at: Point }` and `{ type: "ROTATE_SELECTION"; quarterTurns: number }`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/canvas/editor.test.ts`:

```ts
test("rotate turns the selection about the default base and commits one entry", () => {
  const s = run([
    ...twoLines,
    { type: "SET_TOOL", tool: "select" },
    { type: "DRAG_BEGIN", at: { x: -1, y: -1 } },
    { type: "DRAG_UPDATE", at: { x: 6, y: 4 } },
    { type: "DRAG_COMMIT", additive: false },
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

test("mirror flips the selection and one repeat restores it", () => {
  const once = run([
    ...twoLines,
    { type: "SET_TOOL", tool: "select" },
    { type: "DRAG_BEGIN", at: { x: -1, y: -1 } },
    { type: "DRAG_UPDATE", at: { x: 6, y: 4 } },
    { type: "DRAG_COMMIT", additive: false },
    { type: "MIRROR_SELECTION", axis: "h" },
  ]);
  const twice = reduce(once, { type: "MIRROR_SELECTION", axis: "h" });
  assert.deepEqual(drawing(twice), drawing(run(twoLines)));
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npm test 2>&1 | tail -15`
Expected: FAIL — `"rotate"` is not assignable to `Tool`.

- [ ] **Step 3: Implement in the reducer**

In `editor.ts`:

```ts
export type Tool = "line" | "circle" | "select" | "move" | "rotate";
```

Import at the top:

```ts
import {
  defaultRotateBase, mirrorAxis, mirrorPrimitive, rotatePrimitive,
} from "./transform.ts";
```

Add to `EditorState`:

```ts
  /** The point a rotation turns about. null means "use the default", which is
   *  the bounding-box centre ROUNDED to a lattice point. A clicked base point
   *  comes from screenToGrid and is therefore always an integer, so there is
   *  no way to express an off-lattice base. */
  rotateBase: Point | null;
```

Add `rotateBase: null` to `initEditor()`. Add to `Action`:

```ts
  | { type: "SET_ROTATE_BASE"; at: Point }
  | { type: "ROTATE_SELECTION"; quarterTurns: number }
  | { type: "MIRROR_SELECTION"; axis: "h" | "v" }
```

Add the cases:

```ts
    case "SET_ROTATE_BASE":
      return { ...s, rotateBase: action.at };

    case "ROTATE_SELECTION": {
      if (s.selection.length === 0) return s;
      const base = s.rotateBase ?? defaultRotateBase(drawing(s), s.selection);
      if (base === null) return s;
      if (action.quarterTurns % 4 === 0) return s; // a no-op turn stays out of history
      return commit(s, mapSelected(s, (p) => rotatePrimitive(p, base, action.quarterTurns)));
    }

    case "MIRROR_SELECTION": {
      if (s.selection.length === 0) return s;
      const horizontal = action.axis === "h";
      const axis = mirrorAxis(drawing(s), s.selection, horizontal);
      if (axis === null) return s;
      return commit(s, mapSelected(s, (p) => mirrorPrimitive(p, axis, horizontal)));
    }
```

In `SET_TOOL`, also clear the base point:

```ts
    case "SET_TOOL":
      return { ...s, tool: action.tool, pending: null, drag: null, rotateBase: null };
```

In `CLICK_GRID`, route the rotate tool:

```ts
    case "CLICK_GRID":
      if (s.tool === "select") return clickWhileSelecting(s, action.at, action.additive);
      if (s.tool === "move") return s; // Move has no click behaviour, only drag.
      if (s.tool === "rotate") return { ...s, rotateBase: action.at };
      return clickWhileDrawing(s, action.at);
```

- [ ] **Step 4: Run the tests**

Run: `npm test 2>&1 | grep -E "^. (tests|pass|fail)"`
Expected: PASS, count risen to 422.

- [ ] **Step 5: Add the toolbar controls**

In `src/components/Toolbar.tsx`, add to `TOOLS`:

```tsx
  { id: "rotate", label: "Rotate", key: "r" },
```

Add after the tool group, so the typed field only exists while rotate is active:

```tsx
        {tool === "rotate" && (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const field = new FormData(e.currentTarget).get("deg");
              const turns = quarterTurnsFor(Number(field));
              if (turns === null) { setAngleError(true); return; }
              setAngleError(false);
              onAction({ type: "ROTATE_SELECTION", quarterTurns: turns });
            }}
          >
            <input
              name="deg" type="text" inputMode="numeric" defaultValue="90"
              aria-label="Rotate by degrees"
              className="t-small w-16 rounded-[var(--radius-sm)] border px-2 py-1"
              style={{
                background: "var(--bg-raised)",
                borderColor: angleError ? "var(--bad)" : "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
              onChange={() => setAngleError(false)}
            />
            <button type="submit" className={action} style={actionStyle}>Turn</button>
            {angleError && (
              <span className="t-small" style={{ color: "var(--bad)" }}>
                multiples of 90 only — this grid has no other exact rotation
              </span>
            )}
          </form>
        )}

        <div className="flex gap-0.5" role="group" aria-label="Mirror">
          <button
            type="button" data-backlit className={action} style={actionStyle}
            disabled={!hasSelection} title="Flip horizontally (Shift+H)"
            onClick={() => onAction({ type: "MIRROR_SELECTION", axis: "h" })}
          >Flip H</button>
          <button
            type="button" data-backlit className={action} style={actionStyle}
            disabled={!hasSelection} title="Flip vertically (Shift+V)"
            onClick={() => onAction({ type: "MIRROR_SELECTION", axis: "v" })}
          >Flip V</button>
        </div>
```

Add at the top of the component body, and the imports it needs:

```tsx
import { useState } from "react";
import { quarterTurnsFor } from "@/lib/canvas/transform";
```

```tsx
  const [angleError, setAngleError] = useState(false);
```

- [ ] **Step 6: Add the rotate preview and base point to `Sheet.tsx`**

Add `rotateBase: Point | null` to the props and pass `state.rotateBase` from `Editor.tsx`. Import `defaultRotateBase` and `rotatePrimitive` from `@/lib/canvas/transform`. Above the `return`:

```tsx
  // The rotate base point, and the quarter turn a drag is currently pointing
  // at. Rendering only — ROTATE_SELECTION does the actual work.
  const rotating = tool === "rotate" && selection.length > 0;
  const base = rotating ? (rotateBase ?? defaultRotateBase(drawing, selection)) : null;
  const rotateTurns = base && drag
    ? (() => {
      const a0 = Math.atan2(-(drag.start.y - base.y), drag.start.x - base.x);
      const a1 = Math.atan2(-(drag.current.y - base.y), drag.current.x - base.x);
      // Snap to the nearest of the FOUR stops the lattice allows.
      return ((Math.round(((a1 - a0) * 2) / Math.PI) % 4) + 4) % 4;
    })()
    : 0;
```

Render before the closing `</svg>`:

```tsx
      {base && (
        <g pointerEvents="none">
          <circle
            cx={gridToScreen(base, v).x} cy={gridToScreen(base, v).y} r={5}
            fill="none" stroke="var(--select)" strokeWidth={2}
          />
          <circle
            cx={gridToScreen(base, v).x} cy={gridToScreen(base, v).y} r={1.5}
            fill="var(--select)"
          />
        </g>
      )}

      {base && rotateTurns !== 0 && selection.map((i) => (
        <g key={`rot${i}`} pointerEvents="none">
          {primitivePath(rotatePrimitive(drawing[i], base, rotateTurns), v, {
            stroke: "var(--select)", strokeWidth: 3, strokeDasharray: "4 4",
            fill: "none", opacity: 0.8,
          })}
        </g>
      ))}
```

In `commitDrag` in `editor.ts`, the rotate tool must commit on release. Add before the final `return cleared`:

```ts
  if (s.tool === "rotate") {
    const base = s.rotateBase ?? defaultRotateBase(drawing(s), s.selection);
    if (base === null || s.selection.length === 0) return cleared;
    const a0 = Math.atan2(-(drag.start.y - base.y), drag.start.x - base.x);
    const a1 = Math.atan2(-(drag.current.y - base.y), drag.current.x - base.x);
    const turns = ((Math.round(((a1 - a0) * 2) / Math.PI) % 4) + 4) % 4;
    if (turns === 0) return cleared;
    return { ...commit(s, mapSelected(s, (p) => rotatePrimitive(p, base, turns))), drag: null };
  }
```

And allow rotate to start a drag, in `DRAG_BEGIN`:

```ts
      if (s.tool !== "select" && s.tool !== "move" && s.tool !== "rotate") return s;
```

- [ ] **Step 7: Wire the keyboard in `Editor.tsx`**

Extend the single-key shortcut line:

```tsx
        const tool = e.key === "s" ? "select" : e.key === "l" ? "line"
          : e.key === "c" ? "circle" : e.key === "g" ? "move"
          : e.key === "r" ? "rotate" : null;
```

Add a Shift branch above it, before the no-modifier branch:

```tsx
      } else if (e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
        && (e.key === "H" || e.key === "V")) {
        e.preventDefault();
        dispatch({ type: "MIRROR_SELECTION", axis: e.key === "H" ? "h" : "v" });
```

- [ ] **Step 8: Verify the gate**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all clean, 422 tests.

- [ ] **Step 9: Read it in a browser — NOT optional**

With `npm run dev`:
1. Select a view, press `r`. The base point marker appears at the selection's centre.
2. Drag around it. The dashed preview snaps to four positions only, never to a diagonal.
3. Release. The drawing lands exactly on the grid — zoom in and confirm no vertex sits between lines.
4. Type `45` and submit. The field goes red with the explanation. Type `-90`. It turns.
5. `Shift+H`, then `Shift+H` again. The drawing returns exactly to where it started.
6. Rotate a view, then check the drawing. The scorer should now report it wrong — confirming a rotated view is genuinely different geometry, not silently re-accepted.

- [ ] **Step 10: Commit**

```bash
git add src/lib/canvas/editor.ts src/lib/canvas/editor.test.ts src/components/Toolbar.tsx src/components/Sheet.tsx src/components/Editor.tsx
git commit -m "feat(canvas): a rotate tool at four stops, and mirror

Rotate snaps to 0/90/180/270 by drag, or takes a typed multiple of 90,
positive or negative. Anything else is refused with the reason, which is
teaching rather than an error: this grid has no other exact rotation.

The base point defaults to the bounding-box centre rounded to a lattice
point, and a click sets a different one. Both come out integer by
construction, so an off-lattice base cannot be expressed -- an unrounded
centre would be off-lattice for about half of all selections.

Mirror needs no base point at all and flips about the bbox centre directly."
```

---

## Task 7: record the session and open the PR

**Files:**
- Modify: `AGENTS.md`

- [ ] **Step 1: Update §3 and §9**

Add to §3's **Done** list:

```markdown
- [x] Five canvas drawing aids — a circle preview that cannot diverge from what
      commits, an angle readout at corners and crossings, copy/paste, a rotate
      tool at the four stops the lattice allows, and mirror
```

Append to §9's table (replace `NNN` with the real final count from Step 2):

```markdown
| 2026-08-29 | Claude (Claude Code) | Five canvas aids, specced and planned before any code. **Two premise checks came first and both changed the design.** Lines: only multiples of 45 are exact on this grid — `tan 60 = √3`, so no lattice pair sits at 60° and the nearest within 12 units is 60.2551°, which files **isometric DRAWING as Tier 2** (the Type B reverse drill is unaffected — it asks a student to READ an isometric). Rotation: only 0/90/180/270 preserve the lattice, 4 of 360, and no finer grid ever adds more — 0 of 6560 points survive a 45° rotation. Rotate-and-round is not a near miss: a 4-unit edge becomes 2.828 and a right angle 78.7°, so it is not offered. Twelve exact stops DO exist on a multiple-of-5 lattice at the Pythagorean angles, but each is a decimal and the builder's rule is that a snap stop must be a whole number. Also caught before implementation: rotating about a bounding-box CENTRE is off-lattice whenever the box's width and height differ in parity — about half of all selections — so every base point is integer by construction; mirror has no such trap, because it touches one coordinate at a time. The circle preview's real fix was structural: preview and commit now come from one `pendingPrimitive`, so the preview cannot lie at the radius clamps. NNN tests, lint, typecheck and build clean. Angle labels and the rotate preview were read in a browser, not only tested. |
```

- [ ] **Step 2: Full gate**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

- [ ] **Step 3: Commit, push, PR**

```bash
git add AGENTS.md
git commit -m "docs: record the canvas drawing aids session"
git push -u origin feat/canvas-drawing-aids
GH_TOKEN=$(gh auth token --user adamafzainizam) gh pr create --fill
```

Do NOT merge without the browser checks in Tasks 3 and 6 actually performed.
