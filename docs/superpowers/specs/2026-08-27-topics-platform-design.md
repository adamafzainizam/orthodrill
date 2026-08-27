# From One Drill To A Technical Drawing Platform — Design

**Date:** 2026-08-27
**Status:** approved in principle, not yet implemented
**Extends:** the 2026-08-20 design, which scoped the product to orthographic projection alone.

---

## 1. What changes

The product becomes **technical drawing practice across many topics**, not an orthographic projection drill. A student picks a topic — orthographic, oblique, perspective, geometric construction, and more — and works exercises in it, with a sidebar of hints for that topic beside them.

Two things do NOT change, and they are what makes this affordable:

- **Answer keys are derived, never hand-written** (§7 of AGENTS.md). Every new topic brings its own generator, or it does not ship.
- **The scorer is topic-agnostic already.** It diffs typed primitives on a grid; it has never known or cared what they depict. A tangent, a parabola and a front view are all lines and circles to it.

---

## 2. The premise check that reshaped this, done first

The scoring model requires **integer grid coordinates**. `validate.ts` rejects anything else, and the canvas snaps. So before designing anything, the cheapest question that could kill it: **do these topics' correct answers land on lattice points?**

Measured, not assumed:

| Construction | Points on the lattice |
|---|---|
| Tangent from an external point to a circle | **0 of 162** configurations tried |
| Ellipse, concentric-circles method | 4 of 12 — only the axis endpoints |
| Parabola, rectangle method (h = n²) | **all**, exactly |
| Perpendicular bisector, even endpoints | **all**, exactly |

**Tangents and ellipses cannot be drawn on a snap grid.** A tangent point is irrational for essentially every configuration, including the Pythagorean ones that look promising. This is not a content problem to author around — the model cannot express the answer, and no amount of choosing nicer numbers fixes it.

**This is the finding that decides the topic order**, and it would otherwise have surfaced weeks into building a tangents topic.

### 2.1 Topics therefore fall into three tiers

**Tier 1 — buildable now, lattice-exact.** Orthographic (shipped), oblique, isometric-from-views (Type B, specced), parabola by the rectangle method, and straightedge constructions such as bisectors and equal divisions. All derive exact keys on integer coordinates.

**Tier 2 — needs a tolerance-scoring mode that does not exist.** Tangents, ellipses, curve fitting, anything whose answer is irrational. Scoring these means comparing within a distance tolerance instead of by exact position, which is a real change to `compare.ts` and a new source of ambiguity in feedback ("close enough" has to be defined and defended). **Not a content decision — an engineering one, deferred deliberately.**

**Tier 3 — needs a different notion of correct entirely.** Building, electrical, interior, planning. These are symbol-and-convention work where a correct drawing is not a unique set of primitives. Scoring them is a research problem, not a feature. Out of scope until Tiers 1 and 2 exist.

---

## 3. The model

### 3.1 Topic

A topic owns its vocabulary, its sidebar content, and its generator. Adding one must not require touching another.

```
Topic = {
  id, title, blurb,
  hints: Hint[],        // what the sidebar shows
  exercises: Exercise[] // generated or enumerated
}
```

### 3.2 Exercise, and the one real generalisation

Today a drill IS a solid, and scoring means: cluster into three views, assign by content, diff each, judge placement. That is orthographic-specific.

A construction exercise is **one figure**, not three views. There is nothing to cluster and no placement to judge.

So scoring splits in two, over a shared core:

- `scoreViews(attempt, key, convention)` — today's path: cluster, assign, diff, placement.
- `scoreFigure(attempt, key)` — one drawing against one key set, diffed directly.

Both call the existing `compareView`, which is where the actual set-diff lives and which needs no change. This is a small, honest generalisation rather than a rewrite, and it is the seam that makes every Tier 1 topic cheap.

An exercise declares which mode it scores in. `POST /api/score`'s `kind` discriminator, already required, carries it.

### 3.3 The sidebar

Hints belong to the topic, not the exercise: a student stuck on hidden-line convention is stuck on it in every orthographic exercise. Content is authored prose — this is the one place in the project where hand-authoring is right, because a hint is a teaching judgement and not a derivable fact.

**The sidebar must not leak answers.** It is served with the public half and is subject to the same rule as everything else: nothing in it may narrow the answer for the specific exercise on screen. Hints are about the topic; if a hint would only make sense for one exercise, it belongs in that exercise's prompt instead.

---

## 4. Sequencing

1. **The topic model and the sidebar**, with orthographic moved into it. Nothing new ships; the existing drill keeps working, now as a topic.
2. **`scoreFigure`**, the single-figure scoring mode, with tests.
3. **One second topic end to end: the parabola by the rectangle method.** Chosen deliberately — it shares NOTHING with the solid model, so it proves the abstraction is real rather than proving it fits the case it was drawn around, and §2's check says it is lattice-exact.
4. Then Tier 1 topics get cheap: oblique, Type B, further constructions.
5. **Tier 2 gets its own decision** about tolerance scoring, with the same rigour §5.2 applied to the generator, because "close enough" is exactly the kind of judgement that silently teaches the wrong thing.

**The second topic is the point of step 3.** An abstraction validated only against the case it was extracted from has not been validated.

---

## 5. What this does not change

- Answer keys never reach the client (§5.1). Every new topic's generator is server-side, and its solid-equivalent — whatever holds the answer — stays there.
- Keys are derived. A topic without a generator does not ship.
- The golden-set discipline (§5.2) applies per topic. A parabola generator can be wrong in exactly the way the projection generator could, and needs its own fixtures.
