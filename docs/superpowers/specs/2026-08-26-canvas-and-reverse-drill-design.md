# The Canvas, and the Reverse Drill — Design

**Date:** 2026-08-26
**Status:** approved, not yet implemented
**Supersedes:** nothing. Extends the 2026-08-20 design, whose §4 and §6.1 described a
single drill direction and a canvas that had not yet been specified.

---

## 1. What this covers

Two things, decided together because the second changes the first:

1. **The canvas** — the last unbuilt unit from the original design. Snap-to-grid
   primitive input, and rendering of the feedback the scorer returns.
2. **A second drill direction.** The original design drilled one way only:
   isometric prompt in, three views out. The drill now runs both ways.

Everything server-side already exists and is verified: the scorer, both
generators, the drill store, and the three API routes.

---

## 2. Two drill types over one part library

A part is a solid. Both directions are drills over the same solid, so the
catalogue does not fork and no part has to be authored twice.

| Type | Given | Produced | Answer key |
|---|---|---|---|
| **A — draw the views** | the isometric pictorial | front, top and side views | the generated views |
| **B — build the part** | the three views | the solid | the solid itself |

A drill record gains a `type` field. A part may be published in either
direction, or both — the same solid drills comprehension one way and
construction the other.

**Why both directions.** Reading a pictorial and reading a set of views are
different skills, and a student who can do one is not thereby able to do the
other. Type B is also the direction in which a misunderstanding is most visible:
a wrong solid is wrong in a way the student can see the moment it is rendered
beside what the views demanded.

---

## 3. Type A — the canvas

### 3.1 Rendering: SVG

Per-element hit-testing is free, which makes selection, hover and dragging
ordinary DOM work rather than hand-written geometry. The primitive cap is 400
(`validate.ts`), where SVG's node count is a non-issue; Canvas 2D would only
start to win at thousands.

The deciding argument is precedent rather than performance: `scripts/verification-sheet.ts`
already renders the isometric paint program as SVG correctly, including the rule
that every face must be both filled and stroked in the background colour. That is
proven code to follow rather than a second renderer to get wrong.

**Rejected: Canvas 2D.** Hand-written hit-tests for segments and circles, manual
redraw on every state change, and no accessibility story, in exchange for
performance headroom this drill cannot use.

### 3.2 Structure

```
DrillPage (server component) — fetches the public half; no key is ever in scope
└── Editor ("use client")
    ├── Toolbar     tool ▾ | line type ▾ | undo | redo | delete | submit
    ├── Pictorial   the isometric, read-only
    ├── Sheet       grid + drawing layer + feedback overlay
    └── Backlog     dismissed notifications, expandable
```

### 3.3 State

One immutable `Primitive[]`, a selection set, an active line type, and an undo
stack of whole-drawing snapshots.

**Snapshots, not diffs.** At 400 primitives a snapshot is a few kilobytes and
copying it is free, while an undo stack of diffs has to be correct for every
operation including drag and retype. Snapshots make undo trivially correct, and
correctness is worth more than the memory here.

The stack is capped at a fixed depth — oldest dropped — so a long session cannot
grow it without bound. The cap is a number to tune, not a design question.

### 3.4 Interaction

Modelled on CAD conventions, because the students who most need this drill have
used or will use AutoCAD.

- **Draw** — click to anchor, a rubber-band preview follows the cursor snapped
  to the grid, click again to commit. Escape cancels. Circles: click the centre,
  then a point on the circumference; the radius rounds to a whole grid unit,
  because `validate.ts` requires an integer radius.
- **Select** — click; Ctrl+click extends the selection. Each primitive carries a
  wide transparent stroke beneath it so it can be hit without precision.
- **Move** — drag a selection; the delta snaps to whole grid steps.
- **Retype** — with a selection, the toolbar's line-type control changes it in
  place. This is the operation the drill teaches most (a hidden edge drawn
  solid), so it must not require deleting and redrawing.
- **Delete** — Delete or Backspace, or the toolbar button.
- **Undo/redo** — Ctrl+Z and Ctrl+Y, and toolbar buttons, covering every
  operation above. Non-negotiable once dragging exists: an accidental drag needs
  a clean recovery.

### 3.5 Feedback, and the change the scorer needs

**`ViewDiff` primitives are not in the student's coordinates.** `compareView`
normalises both the attempt and the key to the origin before diffing, so
`missing`, `extra`, `correct` and `wrongType` all come back origin-anchored. That
normalisation is deliberate and correct — it is what makes a correct view drawn
ten units to the right still correct — but it means the client cannot draw
feedback over the student's work without knowing where each view was.

**Required change:** each view's result gains `anchor: { dx, dy }`, the offset
that maps a normalised primitive back into submitted coordinates. About fifteen
lines across `compare.ts` and `assign.ts`, plus tests. Nothing about how scoring
*decides* anything changes.

**Rejected: the client re-derives clusters and anchors.** It would duplicate
`cluster.ts` and `compareView`'s object-anchor rule — including the subtlety that
centre lines are excluded from the anchor — in a second place that must agree
exactly. Any drift puts feedback silently in the wrong position, which is worse
than no feedback.

**Rendering.** On submit, an overlay layer draws missing primitives as ghosts
where they belong, extra ones marked, and wrong-type ones alongside the style
that was expected. Every issue simultaneously raises a notification naming the
view and the fault — "Top view: the bore's hidden line is missing". The canvas
shows *where*; the notification says *what*. Dismissed notifications fall into an
expandable backlog so nothing is lost by looking away.

A `WRONG_VIEW_COUNT` result raises a notification explaining that the drawing was
not read as three views, and draws no overlay — there is no assignment to
overlay.

---

## 4. Type B — the builder

### 4.1 Model and scoring

The student's solid is an occupancy set of unit cells. Scoring compares it to the
key's occupancy set cell by cell, both normalised to their bounding-box origin —
translation-invariant for the same reason `compareView` is, and for the same
reason: where the part sits is not what is being tested.

The diff is *missing* and *extra* cells, mirroring the primitive diff, so feedback
reuses the same shape: ghost blocks where material is missing, marked blocks
where there is material that should not be, and the same notifications.

**This needs no new geometry.** The occupancy grid already exists
(`geometry/occupancy.ts`), and comparison is set equality over integer triples.
That is the entire reason this form was chosen over drawing an isometric.

**The student carves from the full base block.** It matches how the generator
models parts — a base block minus ordered subtractions — and how the part would
be machined. Adding blocks is also available, to recover from an over-cut. The
base dimensions are readable directly off the three given views, so supplying
them gives nothing away.

### 4.2 Four viewpoints

From a single fixed viewpoint the far faces of the part can be neither seen nor
clicked, so a feature on the back is unreachable. The viewpoint therefore swings
between the four top corners.

**This is the riskiest piece of this design.** `isoproject.ts` currently fixes the
basis to (1, −1, 1) with constants verified numerically during design, and its own
docblock warns that a wrong sign produces a picture that is perfectly
self-consistent and perfectly *mirrored* — the same failure class as
`viewspec.ts`, and the reason the golden set exists. Four bases means four
opportunities for that error.

**It gets the same treatment the golden set gets:** each viewpoint pinned against
coordinates derived from its basis rather than recomputed from the generator, and
rendered for human review before any drill ships in that direction.

**Hit-testing comes free from the existing paint program.** The faces are already
emitted back-to-front, so the face under the cursor is the *last* one in paint
order whose projected polygon contains the point. No separate picking structure,
and it stays correct by construction as long as the paint order is not disturbed —
which AGENTS.md §6 already forbids for other reasons.

### 4.3 Interaction

- Click a visible face to add a block against it; Alt+click removes the block
  that owns the face.
- The viewpoint control rotates between the four corners.
- Undo/redo, the same stack model as Type A.
- Submit scores the built solid.

---

## 5. Shared: layout, notifications, and ads

Notifications and the backlog are shared between both drill types, since both
produce the same shape of feedback.

**Ads appear on the menu and landing pages only, never on a drill page.** This is
stricter than the 2026-08-24 decision-log entry, which required only that ads not
sit adjacent to the drawing surface. A drill page is where the student is working
and learning; nothing competes for attention there. Reserved slots still fix their
dimensions from first paint so no layout shift occurs, and v1 ships them empty.

---

## 6. API changes

- `POST /api/score` accepts a discriminated submission: `{ drillId, kind: "views",
  primitives }` or `{ drillId, kind: "solid", cells }`. One endpoint, because both
  are the same operation — submit an attempt, receive structured feedback — and
  both need the identical rate limiting and validation discipline.
- `GET /api/drills/[id]` returns the public half for the drill's type: the
  pictorial for Type A, the three views for Type B.
- `cells` is the set of cells the student's solid OCCUPIES, as integer
  `[x, y, z]` triples — not the cells they removed. Occupied cells describe the
  result rather than the path taken to it, so two students who carve the same
  part in different orders submit the same thing.
- Cell submissions are validated like primitives: a cap on count, integer
  coordinates, bounds. The existing `validate.ts` discipline extends to a second
  shape; rebuilt field by field, never passed through.
- `kind` is required, not defaulted. No client exists yet, so there is no
  compatibility to preserve, and a silent default is how the wrong branch gets
  taken when a future submission shape is added.

---

## 7. Security

### 7.1 A precise relaxation of the §5.1 isolation rule

The builder must render the student's in-progress solid, so `isometric.ts`,
`isoedges.ts` and `isoproject.ts` must run client-side. They are pure projection
and contain no key, so they leave the banned list. `drills/registry`, `server/`,
`geometry/views`, `scoring/score` and `scoring/assign` stay banned.
`src/drills/isolation.test.ts` is updated to match, with a positive control for
the new boundary — the test is only worth having if it can still fail.

### 7.2 An accepted limitation, stated plainly

In both directions the public half fully determines the answer, and the inversion
is mechanisable by anyone willing to write it. A Type A pictorial determines the
views; a Type B set of views determines the solid. §5.1 protects against handing
the answer over, not against a student who would rather build our generator than
do the drill.

This is the same class of limitation already accepted for feedback leakage, and
the same reasoning applies: the only victim of that effort is the student who
made it, and this is a practice tool rather than a graded assessment. Graded use
would need a separate mode, as §5.1 has said since the beginning.

---

## 8. Testing

- **Pure units under `node --test`, as everywhere else:** grid/screen transforms,
  snapping, radius rounding, the undo stack, the occupancy diff, and the
  translation from a `ScoreResult` into notification text. These live in
  `src/lib/canvas/` and hold no framework imports.
- **The four-viewpoint projection** gets property tests plus per-viewpoint
  coordinates derived independently of the generator, and a rendered sheet for
  human review — the treatment §5.2 requires, because it is the same mirroring
  risk.
- **One integration test per direction**, covering the round trip the original
  design asks for: draw or build, submit, score, render.
- **The isolation test keeps its positive controls.** A guard that inspects
  nothing passes exactly as green as one that works.

---

## 9. Sequencing

1. **The scorer's `anchor` addition.** Small, and Type A's feedback rendering
   depends on it.
2. **Type A complete and shippable.** Its interfaces are already fixed and tested,
   so it is the shortest path to something a student can actually use — which is
   what the success test in the original design §10 needs.
3. **Type B**, on its own branch, starting with the four-viewpoint projection,
   since everything else in it depends on that being right.

Neither type blocks the other once the shared canvas primitives exist.

**This spec deliberately produces two implementation plans, not one.** Type A and
Type B share a vocabulary and a feedback model but almost no code beyond the
notification layer, and bundling them would produce a plan too large to execute
with review checkpoints that mean anything. The first plan covers steps 1 and 2.

---

## 10. Rejected alternatives

**Drawing the isometric freehand and set-diffing it.** The obvious reading of
"both ways", and the expensive one. It needs an answer key that is a set of
visible isometric edges, which this project deliberately abandoned on 2026-08-24:
the lattice-diagonal visibility walk was disproven mid-implementation because
projected unit-cube hexagons do not tile, so occlusion boundaries cut through
voxel interiors. Hidden lines are now removed by overdraw, and `isometricView`'s
output still contains strokes for partly-hidden faces that rely on being painted
over. Recovering a clean edge set means clipping every edge against all nearer
faces, and the resulting endpoints do not fall on grid points, so the snapping
model breaks as well. Weeks of work to reopen a decided question.

**Multiple choice: pick the matching pictorial from four.** Cheap, a real exam
format, and scoring is one comparison. Rejected because it tests recognition
rather than production, and turns a drawing tool into a quiz.

**Restricting reverse drills to parts reachable from one viewpoint.** Avoids the
projection work entirely, but limits what can be drilled and — worse — the limit
is invisible to whoever writes the next drill, who would discover it as a
mysterious rejection.

---

## 11. Open questions

- **Feedback colours.** Ghost/marked/expected need a palette that reads in both
  themes and does not collide with the red already used for centre lines.
- **Where the pictorial sits** relative to the sheet — beside or above — is a
  layout decision best made against a real rendering rather than in advance.
- **Whether Type B needs its own difficulty progression** or reuses Type A's
  parts in a different order. Content judgement, deferred to the builder.
