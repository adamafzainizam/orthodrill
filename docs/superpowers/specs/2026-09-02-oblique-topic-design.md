# Oblique projection: a third topic

**Date:** 2026-09-02
**Status:** draft for approval
**Builds on:** `2026-08-27-topics-platform-design.md` (the topic model and `scoreFigure`), and the two oblique lattice checks of 2026-08-29 recorded in `docs/decision-log.md`.

---

## 1. What ships, and what does not

**Wave 1 (this spec).** Oblique projection as a Tier 1 topic: a generator parameterised by the depth factor `k`, exercises in all three types, authored hints, a method diagram and a preview figure. The prompt image is the **dimensioned isometric** the orthographic drills already use, so no new renderer is needed.

**Wave 2 (deliberately later).** Exercises prompted by the three orthographic views instead of a pictorial — the classic textbook form. It needs a views-as-figure renderer that **the Type B reverse drill will also need**, so the cost is shared and it is better spent once, together, than duplicated now. Agreed with the builder 2026-09-02.

---

## 2. What the lattice already decided

Settled on 2026-08-29 and **not to be re-litigated** — see AGENTS.md §1.1 and the decision log:

- **All three types ship**, as one generator parameterised by `k`: cavalier `1`, cabinet `1/2`, general `2/3`.
- **Every y-coordinate must be a multiple of `k`'s denominator** — 1, 2, 3 respectively. Base depth *and* every feature box's `y` and `d`.
- **The receding angle is fixed at 45°.** Only `tan 45° = 1` gives an integer step.
- **One grid diagonal per unit of depth**, which is `√2` longer than metrically true scale. The *ratios* between types are exact and are the teaching content. **A hint must never say "full size".**
- **Box-only. No cylinders.** A bore projects to an ellipse on x or z, and even on y its silhouette tangents are irrational.

### 2.1 One claim in AGENTS.md §4 is wrong and this spec corrects it

§4 says the box-only restriction "costs nothing because 5 of the 8 orthographic solids are already box-only and reusable". Measured against the real rule — every y-coordinate, not just the overall depth:

| Solid | y-coords | cavalier | cabinet | general |
|---|---|---|---|---|
| `step-block` | 0, 4 | yes | yes | **no** |
| `corner-cut` | 0, 2, 4 | yes | yes | **no** |
| `hidden-groove` | 0, 1, 3, 6 | yes | **no** | **no** |
| `near-mirror-notches` | 0, 2, 6 | yes | yes | **no** |
| `step-and-notch` | 0, 2, 6 | yes | yes | **no** |

Reuse holds for **cavalier only**. Cabinet gets 4 of 5. **General gets none.** A solid usable in all three needs every y divisible by 6, and no existing solid has that. So the decision log's "author at least one solid in all three types" requires **new solids**. That is a real cost, and it is small — a solid is a few lines — but the file should not claim otherwise.

---

## 3. The scope decision the lattice forced: PRISMS

A solid usable in all three types needs every y a multiple of 6. On a depth-6 solid that leaves `y ∈ {0, 6}`, so **every feature runs the full depth**. That is a prism: a 2D profile in the xz-plane, extruded through the whole depth.

**This is not a convenience, it is what the depth rule produces**, and it happens to be the case where visibility is exactly computable. It is also the form textbook oblique exercises overwhelmingly take.

**Wave 1 ships prisms only.** `validateSolid`'s oblique path rejects anything else, with a reason naming the rule.

### 3.1 Why this matters more than it looks

`isoedges.ts` cannot be reused. It returns a **paint program** — an ordered array where a nearer fill overdraws a farther stroke — which is correct for a prompt picture and useless as an answer key. An oblique key must be an explicit set of scoreable `Primitive`s, so it needs genuine visibility, computed.

That is the exact problem that broke the first isometric design (AGENTS.md §6: projected unit cubes do not tile, so voxel-granular visibility cannot express the true silhouette). Prisms sidestep it because a prism's faces are only three kinds — front, back, and the profile boundary extruded — and every edge's adjacent faces are known exactly.

---

## 4. The generator

**New pure module `src/lib/geometry/oblique.ts`.**

```ts
export type ObliqueType = "cavalier" | "cabinet" | "general";
export const DEPTH_FACTOR: Record<ObliqueType, number>;   // 1, 1/2, 2/3
export const DEPTH_STEP: Record<ObliqueType, number>;     // 1, 2, 3

export type ObliqueSpec = {
  solid: Solid;
  type: ObliqueType;
  /** Sheet coordinates of the front face's bottom-left corner. */
  originX: number;
  originY: number;
};

export function obliqueKey(spec: ObliqueSpec): Primitive[];
export function obliqueBounds(spec: ObliqueSpec): { width: number; height: number };
```

Named `obliqueKey`/`obliqueBounds` and taking a flat spec, to match `parabolaKey`/`parabolaBounds` exactly — a second figure generator should not invent a second shape.

### 4.1 Projection

Grid `y` runs DOWN the screen; the solid's `z` is height. The receding axis goes **up and to the right**, which is the conventional direction:

```
screen x = x + k·y
screen y = (H − z) − k·y
```

so one unit of depth steps one cell right and one cell up. `H` is the solid's height, placing the base on the drawing's bottom edge before `at` translates the whole figure.

### 4.2 Which edges are drawn

A prism has exactly three kinds of face: the **front** (the profile at y=0), the **back** (the profile at y=d), and the **side** faces (each profile boundary edge extruded through the depth).

An edge is drawn iff **either**:

- its two adjacent faces differ in visibility (a silhouette edge), **or**
- both adjacent faces are visible but not coplanar (a crease).

This is the standard rule and it is what catches the case a naive "outline plus front profile" misses: on a plain box the receding line from the **top-right** corner is interior to the silhouette hexagon yet is genuinely drawn, because it is the crease between the visible top face and the visible right face. A generator that emits only the union outline plus the front profile loses that line, and the drawing looks subtly wrong in a way that is easy to miss. **A test asserts exactly this edge exists on a plain box.**

### 4.3 Hidden lines are OMITTED

Pictorial drawings conventionally omit hidden detail unless it is needed for clarity. Wave 1 omits them entirely: every emitted primitive is `visible`. **This must be stated in the prompt**, because the orthographic topic teaches the opposite rule for views, and a student carrying that habit across would add dashed lines and be marked wrong for it. Per §7 the convention gets a citation with the drill.

---

## 5. Validation

A **sibling** `validateObliqueSolid(solid, type)`, not a new branch inside `validateSolid`. `validateSolid` is the orthographic path's guard and giving it a type parameter would make every existing caller pass something meaningless. It rejects with a named reason:

| Rejected | Reason |
|---|---|
| any `CylinderOp` | a bore is an ellipse in oblique — Tier 2 |
| any y-coordinate not a multiple of `DEPTH_STEP[type]` | the type's depth rule |
| any feature not spanning the full depth | not a prism (wave 1) |

**These are enforced in code, not left to authoring care** — that is the §4 instruction, and it is the difference between a rule and a hope.

---

## 5.1 The registry needs two changes, and neither is cosmetic

**`FigureDrill.spec` is hard-typed to `ParabolaSpec`.** An oblique spec is a different shape, so `spec` becomes a discriminated union and the generators are selected on its tag:

```ts
export type FigureSpec =
  | ({ kind: "parabola" } & ParabolaSpec)
  | ({ kind: "oblique" } & ObliqueSpec);
```

Tagged rather than inferred from which fields are present — the registry's own comment on `mode` says inference is how the wrong branch gets taken, and that reasoning applies here identically.

**A figure drill currently carries no prompt image.** The parabola never needed one because its method diagram lives in the sidebar, but §7 requires every exercise give the student something to look at, and for oblique that is the dimensioned isometric. So `FigureDrill` gains `isometric` and `dimensions`, derived from the solid exactly as `ViewsDrill` derives them, and the public half carries them. The parabola drills leave them absent.

**The solid stays PRIVATE.** `ObliqueSpec` contains a `Solid`, which IS the answer key — `obliqueKey(spec)` is a pure function anyone could run. So `spec` is exactly as sensitive as `ViewsDrill.solid` and must never cross into `publicHalf`. `isolation.test.ts` already enforces the directory rule; the type must not open a hole in it.

---

## 6. Exercises

Four, all `mode: "figure"`, scored by the existing `scoreFigure`:

1. **The same solid in cavalier**, depth 6 — the introduction.
2. **The same solid in cabinet** — the comparison that is the actual teaching.
3. **The same solid in general (2/3)** — completing the set.
4. **A second, different solid in cabinet** — so the type is not welded to one shape in the student's mind.

Exercises 1–3 use ONE new prism whose every y is a multiple of 6. Comparing three drawings of one part is the point: same front face, three depths, visibly different distortion.

**The prompt must state:** the type, that the front face is drawn true shape, that the receding axis is 45° up-and-right, that depth is **one grid diagonal per unit**, and that hidden lines are omitted.

---

## 7. The other three things §7 requires

- **Hints** (`src/topics/topics.ts`, `TopicId` gains `"oblique"`): the three types and their ratios; front face true shape; the 45° axis; one grid diagonal per unit of depth — **never "full size"**; hidden lines omitted in a pictorial.
- **Method diagram**: a worked oblique at numbers no exercise uses, per §7. `MethodDiagram` already renders fill-less segments, so it can reuse that component.
- **Preview figure** for the topic chooser and front page, built from a solid no exercise uses.

**Every hint and prompt gets the §6 question asked of it before shipping: would a student who followed this exactly produce the key?** The parabola hint failure is the precedent, and the `√2` scale caveat is exactly where this topic would repeat it.

---

## 8. Testing

- **Property tests**: every emitted coordinate an integer, for all three types across a sweep of prisms; the drawing's extent matches `(w + k·d) × (h + k·d)`; a symmetric prism gives a drawing symmetric about the corresponding axis.
- **Positive controls**, per §6's account of why they matter: the top-right receding crease exists on a plain box (§4.2); a solid violating the depth rule is REJECTED rather than projected badly; a solid carrying a cylinder is REJECTED.
- **An independently derived fixture**: one prism's cavalier drawing written out by hand from the geometry, not recomputed from the generator — the same discipline that caught a real indexing error in the parabola generator.
- **Rendered and read as a student** before shipping, per §6 — the only instrument that sees a wrong hint or a bad prompt.

---

## 9. Deliberately out of scope

- View-prompted exercises (wave 2, shared with Type B).
- Non-prism solids — features that do not span the full depth.
- Cylinders, in any type (Tier 2).
- Hidden lines in the oblique drawing.
- Any receding angle but 45°, and any depth factor but the three named.
