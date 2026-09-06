# Type B, the Reverse Drill — Engine and Server

**Date:** 2026-09-06
**Status:** approved, not yet implemented
**Extends:** `2026-08-26-canvas-and-reverse-drill-design.md`, whose §4 specified
Type B in full and left it unbuilt. This document does not replace that one; it
covers wave 1 of it, and **deviates from its §4.2 in one recorded way** (§3
below).

---

## 1. What this covers, and what it does not

Type B asks the student to build the part from its three views — the opposite
direction to the drill that ships today. The parent spec's §2 table stands
unchanged:

| Type | Given | Produced | Answer key |
|---|---|---|---|
| A — draw the views | the isometric pictorial | front, top and side | the generated views |
| B — build the part | the three views | the solid | the solid itself |

**This is wave 1: the engine and the server. There is no UI in it.** The
builder component, hit-testing, feedback colours and the §7.1 isolation
relaxation are wave 2, and get their own spec section and their own plan.

The split is the parent spec's own §9 advice — "starting with the
four-viewpoint projection, since everything else in it depends on that being
right" — and the same shape as oblique's two waves: get the thing that can be
silently wrong verified first, then build the page on top of it.

**The prompt half already exists.** `src/lib/geometry/viewsheet.ts` lays the
three views out as one figure, convention-aware and alignment-correct. It was
built general during oblique wave 2 precisely because Type B needs the same
picture, so no new prompt renderer is required.

---

## 2. The premise check, and what it found

**The question that could have killed this:** three orthographic views do not,
in general, determine a unique solid. If a student can build something
genuinely consistent with all three given views and the app marks it wrong, the
app confidently teaches a falsehood — §5.2's failure arriving through the front
door, and worse than a wrong key because the student's reasoning was correct.

Measured before designing, per AGENTS.md §2.4, on the nine box-only solids
already in the catalogue. Two probes, both decisive in the direction that
matters (proving ambiguity):

1. **Visual hull** — the intersection of the three extruded silhouettes is the
   maximal cell set consistent with the silhouettes. If it differs from the key
   *and* generates identical views, ambiguity is proven.
2. **Single-cell removal**, exhaustive over every occupied cell — if any one
   cell can be removed with all three views unchanged, ambiguity is proven, and
   by an example a student could plausibly build.

| part | cells | hull | hull = key? | hull gives same views? | 1-cell competitors |
|---|---|---|---|---|---|
| simple-step | 80 | 80 | yes | — | 0 |
| corner-notch | 112 | 112 | yes | — | 0 |
| hidden-groove | 160 | 160 | yes | — | 0 |
| near-mirror-notches | 168 | 176 | **NO** | no | 0 |
| step-and-notch | 172 | 172 | yes | — | 0 |
| oblique-step-8x6x5 | 204 | 204 | yes | — | 0 |
| oblique-notch-9x4x5 | 164 | 164 | yes | — | 0 |
| oblique-rebate-7x6x4 | 132 | 132 | yes | — | 0 |
| oblique-step-6x6x6 | 180 | 180 | yes | — | 0 |

**0 of 9 provably ambiguous.** An exhaustive TWO-cell removal probe was then run
on `near-mirror-notches`, the likeliest candidate: 14028 pairs tried, 0 preserve
all three views, 1.4 s.

**The interesting row is `near-mirror-notches`.** Its visual hull is eight cells
LARGER than the key, so the silhouettes alone genuinely do not pin it down —
what disambiguates it is the hidden lines the generator draws. That is worth
recording because it identifies the mechanism the whole drill rests on: **Type B
is well-posed because our views show hidden lines.** A convention that omitted
them would make these exercises ambiguous.

**What this does NOT establish.** The probes are bounded — one cell
exhaustively, two cells for one part. A distant multi-cell competitor is not
excluded by them, and no cheap probe excludes one in general. §5 handles that
residual honestly at runtime rather than pretending it away.

---

## 3. The four viewpoints — a recorded deviation from the parent §4.2

From one fixed viewpoint the far faces cannot be seen or clicked, so a feature
on the back is unreachable. The viewpoint swings between the four top corners.

The parent spec generalises `project()` to four bases and calls this "the
riskiest piece of this design". It is right about the risk: `isoproject.ts`'s
own docblock warns that a wrong sign there "produces a picture that is perfectly
self-consistent and perfectly MIRRORED", which is the failure class the golden
set exists to catch. Four bases is four independent chances at it, in float
code, verified by eye.

**This spec takes a different mechanism: rotate the solid, not the camera.**

All four top corners are `(±1, ±1, +1)`, which differ from the current
`(+1, −1, +1)` by a quarter turn about z. Those are also exactly the four
rotations the lattice permits — the same finding, and the same stop set, as the
canvas rotate tool (2026-08-29). So spin the part and leave the camera alone.

`Occupancy` is already an interface rather than data:

```ts
export type Occupancy = { w: number; d: number; h: number;
                          isSolid(i, j, k): boolean };
```

so a viewpoint is a wrapper, not a copy: swap `w`/`d` on odd quarter turns and
remap indices inside `isSolid`. `isoedges.ts` cannot tell the difference,
because it only ever sees an `Occupancy` — so the paint program's ordering, the
nearest-face crease ownership and the fill-seal contract all keep working
untouched, and `isoproject.ts` is not edited at all.

**What this buys, and it is the whole reason for the deviation:**

| | parent §4.2, four bases | this spec, rotated occupancy |
|---|---|---|
| new float code | four bases in `project` | none |
| verification | hand-derived coordinates ×4, by eye | round trip over every cell × every turn |
| composition check | not available | four turns = identity; `q` = `q`× one turn |
| positive control | "does this look mirrored?" | asymmetric solid rotated once ≠ itself |

The right-hand column is machine-checkable. The left is the kind of thing this
project has twice shipped wrong and caught only by rendering it.

**The cost, stated plainly.** A quarter turn moves a cylinder's axis: an x-bore
becomes a y-bore. Type B is box-only (§4), so the cost here is zero — but a
four-viewpoint viewer of a BORED solid would need its ops rotated too, and that
boundary goes in the module docblock rather than waiting to be rediscovered.

### 3.1 The module

```ts
type QuarterTurn = 0 | 1 | 2 | 3;
rotatedOccupancy(o: Occupancy, q: QuarterTurn): Occupancy
rotateCell(c: Cell, q: QuarterTurn, w: number, d: number): Cell
unrotateCell(c: Cell, q: QuarterTurn, w: number, d: number): Cell
```

`rotateCell` and its inverse exist for wave 2's hit-testing, and are what make
the round-trip property test possible in wave 1.

### 3.2 How it is verified

1. **Round trip** — `unrotateCell(rotateCell(c, q), q) === c` for every cell of
   a test solid × every `q`.
2. **Composition** — `rotatedOccupancy(o, q)` agrees cell-for-cell with applying
   the `q = 1` adapter `q` times. A single wrong turn fails this.
3. **Identity** — four turns return the original occupancy.
4. **Positive control** — an asymmetric solid rotated once must NOT equal
   itself. A check that cannot fail is one this repository has shipped before
   (AGENTS.md §6, twice).
5. **Corner labels are DERIVED, not asserted.** Which `q` shows which corner is
   pinned by a fixture carrying a distinguishing feature on exactly one corner,
   and read off the rendered result. The labels are not to be reasoned out and
   written down: that is precisely the disguise the mirror bug wears.

Per the session's decision, property tests carry the verification and no
separate golden review sheet is produced. One render is still to be looked at
before the work is called done — that is AGENTS.md §7's standing discipline for
everything, not an extra deliverable.

---

## 4. Box-only, and why it is forced

`buildOccupancy` ignores cylinders by design — its own docblock: "cylinders
never enter the grid", because rasterising a bore would staircase it and the
generator could then never emit the exact `Circle` the scorer compares against.

Type B's key is an occupancy set. So a bored solid's key would **silently omit
the bore**, while the three views on screen show a circle plainly. The student
would be marked wrong for the one feature they could read most easily.

**Type B therefore ships box-only.** This is the lattice deciding, in the same
way it scoped oblique to prisms — not a preference, and not something to relax
without re-measuring. It is enforced mechanically in §6, not left to authoring
discipline.

---

## 5. Scoring, and the verdict

### 5.1 The diff

The student's solid is a set of occupied cells as integer `[x, y, z]` triples —
occupied, not removed, so two students who carve the same part in different
orders submit the same thing (parent spec §6). Both sides are normalised to
their bounding-box origin before comparison, translation-invariant for the same
reason `compareView` is: where the part sits is not what is being tested.

The diff is missing and extra cells, mirroring the primitive diff.

### 5.2 The verdict, which is the actual product

AGENTS.md §1: "the product is the MARKING." A verdict reading "14 cells missing,
3 extra" is a checksum, not marking. Type A does better than that — it says the
views are correct but placed in the wrong convention, and names which one the
student actually used.

So missing and extra cells are grouped into **6-connected regions**, and each
region is described by where it sits, derived from its centroid within the key's
bounding box.

**A view is named only when that view genuinely differs.** A region can sit
behind other material and change nothing in a given view; saying "the top view
shows this" when it does not is the parabola-hint failure in a new place —
authored prose that no test can see, telling a student something false. So the
naming is computed by generating both sets of views and comparing them, never
inferred from the region's position.

### 5.3 The honest outcome

**If the attempt's cells differ from the key but all three generated views are
identical, the verdict says so** — that the build matches all three views but is
not the part that was drawn — rather than marking it plainly wrong.

§6's well-posedness test makes this unreachable for shipped drills *within the
probes' reach*, and §2 is explicit that their reach is bounded. This costs one
view comparison. A tool whose whole purpose is to say specifically what is wrong
must never tell a student that a correct reading is incorrect.

### 5.4 A small refactor to `views.ts`

§5.2 needs the three views of an ARBITRARY cell set. `buildView` already takes
an `Occupancy` and consults the `Solid` only for cylinder ops, so the capability
exists and is merely unexported. Export `generateViewsFromOccupancy(occ)` and
make `generateViews(s)` a thin wrapper over it.

The alternative is synthesising a `Solid` of several hundred unit-box
subtractions to reach a function that is already there. No behaviour change, and
the existing view tests pin it.

---

## 6. What guards the content

`registry.test.ts` gains two mechanical checks per `build` drill, in the spirit
of the two oblique prompt checks it already carries:

- **Box-only** (§4) — a build drill whose solid has a cylinder op fails.
- **Well-posed** (§2) — the visual-hull comparison and the exhaustive
  single-cell-removal probe must find no competitor. Measured at roughly 0.1 s
  per part, which is affordable in the suite.

Both must be **confirmed to FAIL on a deliberately bad drill before being
trusted**. A property test can pass while the property is absent from the code;
this repository has measured that (five of eight injected bugs survived the
original property suite).

The exhaustive two-cell probe stays a scratch script run during authoring, like
the lattice checks. It is too slow for the suite and its value is in authoring,
not regression.

**The §5.1 leak rule applies by definition.** Type B shows three views as its
entire prompt, and `generateViews(S)` IS the Type A answer for `S`.
`registry.test.ts` already asserts that no solid is used both as a views prompt
and as a Type A subject, comparing generated VIEWS rather than solid fields;
extend that to `mode: "build"` rather than re-deriving it.

**Consequence for content:** every box-only solid in the catalogue is already a
Type A subject, so Type B needs new solids. Wave 1 registers three.

---

## 7. Surface: its own topic

Type B is its own topic card beside Orthographic Projection, Parabola and
Oblique, with its own hints and preview figure. Reading a pictorial and reading
a set of views are different skills — the parent spec's own §2 reasoning — and
the chooser should say so.

§7's four-things rule applies: a generator (the existing one, deriving cells
from a solid), authored hints, a prompt figure (`viewsheet.ts`), and a preview
built from a solid that is deliberately no exercise's.

**An owed debt, recorded so it is not quietly skipped.** §7's check — *would a
student who followed this exactly produce the key?* — is applied by rendering
the page and reading it as a student. There is no page in wave 1. **The prompts
and hints authored here are therefore UNVERIFIED by that check until wave 2**,
and verifying them is the first content task of wave 2. The parabola hint that
told students to draw a smooth curve against a straight-segment key passed every
test in the suite; only reading it on the page caught it.

---

## 8. API and validation

- `POST /api/score` accepts a discriminated submission: `{ drillId, kind:
  "views", primitives }` or `{ drillId, kind: "solid", cells }`. One endpoint,
  because both are the same operation and both need identical rate limiting and
  validation discipline.
- **`kind` is required, never defaulted.** A silent default is how the wrong
  branch gets taken when a third submission shape arrives.
- `GET /api/drills/[id]` returns the public half for the drill's mode: the
  pictorial for Type A, the views figure and the base dimensions for Type B.
  The base dimensions are readable off the three views anyway, so supplying them
  gives nothing away.
- `cells` is validated like primitives — a cap on count, integer coordinates,
  bounds — and **rebuilt field by field, never passed through**. `validate.ts`'s
  existing discipline extends to a second shape.

---

## 9. Testing

- Pure units under `node --test`: the rotation adapter and its inverse, the
  occupancy diff, region grouping, and the verdict text.
- The four viewpoints get §3.2's five checks.
- Content guards per §6, each confirmed to fail on a bad drill first.
- One round-trip test through validate → score → verdict for a `kind: "solid"`
  submission.

---

## 10. Rejected alternatives

**Four projection bases (the parent spec's §4.2).** Rejected for §3's reasons —
strictly more general, and the generality buys nothing the lattice permits,
while costing four hand-verified sets of float constants in the module that
warns loudest about exactly that.

**Scoring by the views the student's solid generates, rather than by cells.**
Attractive: it speaks the language the prompt was given in, and reuses verified
machinery. Rejected as the PRIMARY comparison because it cannot distinguish a
solid that is right from one that merely projects the same way, which is the
distinction §5.3 exists to make honestly. It is used, in §5.2 and §5.3, for
exactly the questions it can answer.

**Allowing bores in Type B.** Rejected in §4; the occupancy grid cannot
represent them and the student would be marked wrong for a feature the prompt
shows clearly.

---

## 11. Open questions

- **How many Type B exercises, and in what progression.** Wave 1 registers
  three; the catalogue's shape is content judgement, deferred to the builder, as
  the parent spec's §11 already deferred it.
- **Feedback colours** for missing and extra regions — parent spec §11, and a
  wave 2 decision best made against a real rendering.
