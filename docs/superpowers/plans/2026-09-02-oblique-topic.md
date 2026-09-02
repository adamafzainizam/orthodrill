# Oblique Topic Implementation Plan

> **For agentic workers:** follow task-by-task, TDD, commit per task.

**Goal:** Ship oblique projection as a third Tier 1 topic — generator, validation, exercises, hints, method diagram, preview.

**Architecture:** A new pure `src/lib/geometry/oblique.ts` produces a scoreable `Primitive[]` answer key. It cannot reuse `isoedges.ts`, which emits a paint program. Scope is PRISMS (profile extruded through the full depth), which the depth rule forces and which makes visibility exactly computable.

**Tech Stack:** TypeScript, `node --test --experimental-strip-types`, Next 16.

## Global Constraints

- `src/lib/` stays pure — no DOM, no framework, no I/O.
- Every emitted coordinate an INTEGER. No rounding anywhere.
- The solid is the answer key: `ObliqueSpec` never crosses into `publicHalf`.
- No AI attribution in commits (AGENTS.md §2.7).
- Gate: `npm test && npm run lint && npm run typecheck && npm run build`.
- Baseline: **424 tests**.

---

## Task 1: projection, constants, and the profile

**Files:** create `src/lib/geometry/oblique.ts`, `src/lib/geometry/oblique.test.ts`

The projection, with grid y DOWN and the receding axis UP-AND-RIGHT:

```
sx = originX + x + k*y
sy = originY - z - k*y
```

**Deliverables:**
- `ObliqueType`, `DEPTH_FACTOR` (1, 1/2, 2/3), `DEPTH_STEP` (1, 2, 3)
- `projectOblique(x, y, z, k, originX, originY): {x, y}`
- `profileOf(solid): boolean[][]` — the occupancy slice at y=0, which for a prism is every slice
- `obliqueBounds(spec): {width, height}` = `(w + k*d) x (h + k*d)`

**Tests:** projection of the 8 corners of a unit cube for each type; a positive control that a depth-1 step really moves one cell right and one cell UP (sy decreases); bounds against hand arithmetic.

---

## Task 2: `validateObliqueSolid`

**Files:** `src/lib/geometry/oblique.ts`, its test

Rejects, each with a distinct reason string:
- any `CylinderOp` → `"CYLINDER_IN_OBLIQUE"`
- any y-coordinate not a multiple of `DEPTH_STEP[type]` → `"DEPTH_NOT_ON_STEP"`
- any feature box not spanning `y = 0 .. base.d` → `"NOT_A_PRISM"`
- a fully-subtracted solid → `"EMPTY_SOLID"`

**Tests:** one positive control per reason — a solid that SHOULD pass, and one that trips each rule. The depth-rule case is swept over all three types, since a solid legal in cavalier is illegal in general.

---

## Task 3: the visible-edge generator — the risky core

**Files:** `src/lib/geometry/oblique.ts`, its test

**Face model.** A prism has three face kinds: front (profile at y=0, normal −y), back (profile at y=d, normal +y), and side faces (each profile boundary edge extruded through the depth, normal ±x or ±z).

**Back-face culling.** The ray into the scene is `d = (−k, 1, −k)`. A face with outward normal `n` is visible iff `n · d < 0`, which gives exactly: front, +x (right), +z (top). Back, −x and −z are hidden.

**Which edges are candidates.**
- Every FRONT profile boundary edge — the front face is always visible, so each such edge is a silhouette or a crease either way.
- Every BACK profile boundary edge whose side face is +x or +z.
- A RECEDING edge at each profile boundary VERTEX where direction changes, drawn iff at least one adjacent side face is visible.

**Then occlusion**, which back-face culling alone does not handle — on an L-profile the sweep of one arm covers part of the other:
1. Split every candidate edge at each intersection with every visible face's projected outline.
2. For each sub-segment, take its MIDPOINT and ask whether any strictly-nearer material projects onto it.
3. Keep the sub-segments that survive; merge collinear runs.

**Exactness.** All vertex coordinates are integers by the depth rule. Midpoints are half-integers, so scale by 2 and compare in integers — no float tolerance anywhere.

**Tests, including the positive controls that matter:**
- A plain box: assert the receding crease from the TOP-RIGHT corner EXISTS. It is interior to the silhouette hexagon and is the edge a naive "outline plus front profile" generator loses.
- Assert the box's total edge count exactly (hand-derived, not recomputed).
- An L-profile where one arm's sweep occludes the other: assert the occluded portion is ABSENT and the visible portion PRESENT.
- Every coordinate an integer, swept over all three types.
- A symmetric profile gives a drawing whose front profile is symmetric.
- Hidden lines: every emitted primitive has `type: "visible"`.

---

## Task 4: registry and topic wiring

**Files:** `src/drills/registry.ts`, `src/topics/topics.ts`, `src/lib/scoring` if needed, `src/app` drill page, `src/components/Editor.tsx`

- `FigureSpec` becomes a tagged union: `({kind:"parabola"} & ParabolaSpec) | ({kind:"oblique"} & ObliqueSpec)`. Existing parabola entries gain `kind: "parabola"`.
- `FigureDrill` gains `isometric` and `dimensions`, derived from the solid for oblique, absent for parabola. The public half carries them; the SOLID never does.
- `TopicId` gains `"oblique"`, with authored hints.
- The drill page renders `Pictorial` for a figure drill that has one.

**Tests:** `isolation.test.ts` must still pass — it is the guard that the solid does not leak. Add a case asserting an oblique drill's public half carries no `spec`.

---

## Task 5: solids, exercises, hints, diagram, preview

**Files:** `src/drills/registry.ts`, `src/topics/topics.ts`, `src/components/MethodDiagram.tsx`

- ONE new prism whose every y is a multiple of 6, used in all three types (exercises 1–3).
- A SECOND prism for exercise 4, in cabinet.
- A THIRD prism, used by neither, for the method diagram and preview — §7 requires the illustrative figure not be any exercise's answer.
- Prompts state: the type, front face true shape, 45° up-right, **one grid diagonal per unit of depth**, hidden lines omitted.
- Hints: the three types and their ratios; front face true shape; the 45° axis; the diagonal-per-unit wording; hidden lines omitted in a pictorial.

**Before shipping, ask of every hint and prompt: would a student who followed this exactly produce the key?** The `√2` scale caveat is exactly where this topic would repeat the parabola-hint failure.

---

## Task 6: render, read as a student, then document

- Drive the real page and screenshot each of the three types on the same solid — the comparison must be visibly different, and the method diagram and preview must read correctly.
- Correct AGENTS.md §4's "costs nothing" claim (spec §2.1), update §3 and §9.
- PR.
