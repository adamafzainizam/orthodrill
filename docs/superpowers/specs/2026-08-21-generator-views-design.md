# Generator (Views) — Design

**Date:** 2026-08-21
**Status:** approved in brainstorming, not yet planned
**Refines:** §5 and §9.2 of `2026-08-20-orthographic-drill-design.md`

This document refines the approved design where it was underspecified, and
records two places where it was **wrong**. It does not reopen anything settled.

---

## 1. Scope

**In:** a solid model → the three orthographic views, as the `KeyViews` type the
scorer already consumes.

**Out, deliberately:**

- the isometric prompt image — split into its own plan, see §2
- drill content and authoring — needs the generator to exist first
- the canvas and the scoring route handler — plan 3

## 2. Why the isometric image is split off

The approved spec treats "the generator" as one unit producing both the views and
the isometric prompt. They are two jobs with opposite risk profiles:

| | the three views | the isometric prompt |
|---|---|---|
| Consumed by | the scorer, as the answer key | the student's eyes |
| A defect means | the app teaches an incorrect drawing (§5.2) | a picture looks wrong |
| Detectable by | property tests and fixtures | looking at it |
| Needs curves | no — segments and exact circles | yes — ellipses for bores |

Bundling them makes the answer-key generator wait on ellipse rendering, which is
the fiddliest part and the least able to produce a wrong key. Splitting also
keeps `src/lib/geometry/` free of anything resembling presentation.

## 3. The seam with the scorer

```
generateViews(solid: Solid): KeyViews
```

`KeyViews` is the type already defined in `src/lib/scoring/assign.ts`, and
`Primitive` comes from `src/lib/scoring/primitives.ts`. The generator **imports
these rather than declaring parallel types**. Both libraries are pure and I/O-free,
so the dependency costs nothing, and a duplicated primitive vocabulary that could
drift apart would be strictly worse.

**Each view is emitted at its own origin.** The generator does not lay the three
views out according to a projection convention. It has no business doing so: the
scorer compares translation-invariantly and judges placement separately (§4.4 of
the approved spec), and *placing the views is the skill being tested*. A generator
that laid them out would be computing a fourth answer nobody consumes.

**"Side" means the right-side view.** This is not a free choice. `placement.ts`
fixes `side` to mean the view seen from the object's right, because the two
conventions disagree about where that view goes and "the side view" alone is
ambiguous. The generator must project the same view the scorer expects.

## 4. The solid model

A part is a **base block plus an ordered list of subtractive operations**, all
axis-aligned on an integer grid.

Two geometric operations, not five:

```
subtractBox(x, y, z, w, d, h)
subtractCylinder(axis, u, v, r)     // through-hole, spans the block on `axis`
```

`u` and `v` are the hole-centre coordinates **in the plane perpendicular to
`axis`**, taken in the order the remaining two axes appear in x→y→z. For
`axis: "z"` that is `(x, y)`; for `axis: "y"`, `(x, z)`; for `axis: "x"`, `(y, z)`.
Stated because "cx, cy" would be ambiguous for two of the three axes, and a
silently transposed hole centre is exactly the kind of error that survives
property tests.

The approved spec names five feature types — step, notch, slot, rectangular
opening, cylindrical through-hole. Under an occupancy model the first four are
**the same operation**: remove an axis-aligned box. They differ in *where the box
sits*, not in what the code does. Four near-identical code paths would be four
places for a subtle key error to hide.

The five names survive as **authoring helpers** in `features.ts` — `step()`,
`notch()`, `slot()`, `opening()` — which compute box arguments from friendlier
parameters and record the feature's name as metadata. That metadata is not used
by the geometry; it is for difficulty tagging and for wording feedback later.

Adding a sixth rectangular feature then costs one helper and no geometry.

## 5. Visibility is global, not per-feature

The approved spec says "each feature type knows how it projects into each of the
three views." **This is true of a feature's edges and false of their visibility.**

Whether an edge is drawn solid or dashed depends on the whole solid, not on the
feature that produced it. A through-hole's bore lines are hidden inside a block;
cut a notch that removes the material in front of them and the same bore lines
become visible. Features interact, and enumerating feature-interaction cases by
hand is precisely where wrong answer keys come from.

**Resolution: a voxel occupancy grid.** Everything is axis-aligned and grid-snapped,
so the solid is represented as a 3D occupancy grid. Visibility reduces to a
question with one correct answer — *is this the first material along the ray?* —
with no interaction cases to enumerate.

At drill scale this is free. A generous part is 20×20×20 = 8,000 cells.

Rejected alternatives:

- **Per-feature analytic occlusion rules.** Closest to the spec's wording and to
  real parametric CAD, and it emits clean edges directly. Rejected: every new
  feature type must be reasoned about against every existing one, which is
  hand-written O(n²) cases in the one part of the system that must never be wrong.
- **Voxelising the cylinders too.** One code path, no special cases — but a circle
  becomes a staircase, so the generator could never emit the exact `Circle`
  primitive the scorer compares against. Non-starter for hole drills.

## 6. Cylindrical through-holes

Holes stay **analytic**, exactly as the approved spec enumerates:

| View | Appearance |
|---|---|
| Looking down the hole axis | one exact `Circle`, plus a centre-line cross |
| The other two views | two parallel bore lines, dashed when obscured, plus a centre line along the axis |

Occlusion for these primitives is answered by querying the occupancy grid, not by
reasoning about the cylinder analytically.

`centre` primitives are generated in v1. Marking the axes of circular features is
their primary use and convention requires them.

## 7. Coordinate conventions — the risky part

Model space is right-handed: **+x right, +y back (away from the front viewer),
+z up.** Screen space follows the scorer: **y increases downward.**

| View | Direction of sight | screen x | screen y |
|---|---|---|---|
| Front | along +y | `x` | `-z` |
| Top | along −z, from above | `x` | `-y` |
| Right-side | along −x, from the right | `y` | `-z` |

Each view is then translated so its bounding box starts at the origin.

Two consequences worth stating, because both follow from the table and neither is
obvious:

- In the **top view**, the front of the object is at the **bottom**. (`y=0` maps to
  `screen_y=0`; the back maps to negative screen y, i.e. higher.)
- In the **right-side view**, the front of the object is on the **left**.

Both match how the views sit next to the front view once placed, under either
convention — placement moves the views, it does not re-orient their content.

## 8. Verification: three independent sources

A sign error in §7 produces a view that is perfectly self-consistent and
perfectly **mirrored**.

**No property test can catch this.** Symmetry invariants stay green under a global
mirror — that is what symmetry means. "Every edge lies within the bounding-box
projection" stays green too. A mirrored generator passes every invariant listed in
§9.2 of the approved spec and is wrong on every drill it ever produces.

This narrows what fixtures are *for*: they exist primarily to pin **orientation and
handedness**, which properties structurally cannot. It follows that **golden
fixtures must be deliberately asymmetric.** A symmetric golden part verifies
almost nothing, and choosing one would be the most natural mistake to make.

Three sources, none of which depend on the builder's own judgement (§5.2):

**Tier 1 — published worked examples. In this plan.**
Parts whose correct views are already printed in free teaching material,
transcribed as fixtures, each **citing its source** in the fixture file, per §7 of
`AGENTS.md`. Candidate sources found and confirmed to exist:
- Engineering LibreTexts, Illinois Tech, *Introduction to Engineering Drawing and
  Design*, §2.7 Exercises
- *Orthographic Projection Exercises* (olaengineering)
- Engineering Graphics and Design Grade 12, third-angle castings worksheets

Zero latency, citable, and independent of any individual.

**The transcription risk, stated.** Turning a printed view into coordinates is
done by hand, so a reader who systematically mirrors while reading would
"confirm" a mirrored generator. Two things bound this: the parts are chosen
asymmetric (§8), which makes a mirror visually obvious rather than subtle, and a
fixture disagreeing with the generator is investigated in both directions — the
transcription is suspected before the code is trusted.

**Tier 2 — FreeCAD TechDraw cross-check. Specced, not in this plan.**
FreeCAD is free and open-source (§2.1 satisfied) and scriptable:
`TechDraw::DrawProjGroup`, set `ProjectionType`, then `addProjection("Front")`,
`("Top")`, `("Right")`. This is an **independent implementation** written by people
who do know drafting, and it can be run over hundreds of generated parts rather
than eight.

Deliberately **out of this plan**: it is a ~1GB dependency plus SVG/DXF parsing,
and it could plausibly consume the whole plan. It is the highest-value follow-up
if Tier 1 ever proves insufficient.

**Tier 3 — human confirmation. Non-blocking.**
The GMI contacts described in the approved spec. Now a *confirmation* of an
already-cited result rather than the only source of truth, so nothing waits on
anyone's calendar.

**What is gated on what.** Shipping drills to students is gated on at least one
tier signing off. Merging the generator's code is not. Fixtures land marked `UNVERIFIED` until a tier signs
them off, in the same pattern that worked for the conventions table on 2026-08-21.

## 9. Module structure

Under `src/lib/geometry/`, pure and I/O-free per §2.3 of `AGENTS.md`. Each module
has one responsibility and a sibling `*.test.ts`.

| Module | Responsibility |
|---|---|
| `solid.ts` | the `Solid` model; `subtractBox`, `subtractCylinder` |
| `features.ts` | `step()`/`notch()`/`slot()`/`opening()` authoring helpers |
| `occupancy.ts` | the 3D grid; `isSolid`, first-surface queries along an axis |
| `project.ts` | one direction of sight → edges tagged visible or hidden |
| `bore.ts` | cylinder projections: circle, bore lines, centre lines |
| `views.ts` | compose the three views into `KeyViews` |

## 10. Testing

**Property tests**, from §9.2 of the approved spec:
- every projected edge lies within the projection of the bounding box
- a solid symmetric about an axis produces a symmetric view
- a solid with no internal features produces no hidden lines
- a cylindrical through-hole yields exactly one circle in the view down its axis,
  and exactly two parallel bore lines in each of the other two views
- every circular feature carries centre lines in all three views

These catch systematic errors across many cases. **They cannot catch a mirror**
(§8), which is the whole reason fixtures exist.

**Golden fixtures** — asymmetric parts from Tier 1, stored with their citation and
their verification status.

**A verification sheet** — a printable comparison of each fixture's generated
views against its cited source, so Tier 2 or Tier 3 review is a matter of looking
rather than of reading coordinates.

This sheet is a **development script, not library code.** It lives outside
`src/lib/geometry/`, which stays free of presentation per §2 and pure per §2.3 of
`AGENTS.md`. It renders SVG; the geometry library never does.

## 11. Accepted limitations

- **Cylinders staircase in the occupancy grid.** They participate in occlusion
  queries at cell resolution while the drawn circle stays exact. The discrepancy
  is observable only where a hole partially overlaps another feature, which the
  approved spec already excludes from v1. Recorded now rather than discovered later.
- **Through-holes only**, no blind holes, fillets, chamfers, or non-axis-parallel
  holes — unchanged from the approved spec, each excluded for a stated reason.
- **No isometric output**, by §2 above.

## 12. Open questions

- **Grid resolution and part size limits.** 20³ is assumed generous; not yet
  confirmed against the drill progression, which does not exist yet.
- **Collinear edge merging.** Adjacent voxel faces produce many unit-length
  segments that must merge into single edges before comparison. The merge is
  straightforward; whether it belongs in `project.ts` or its own module is a
  question for the plan.
- **Whether `features.ts` metadata is worth carrying in v1** if nothing consumes it
  until drill authoring. Cheap to keep, cheap to add later.
