# Isometric Drawing on Isometric Paper — Design

**Date:** 2026-09-15
**Status:** approved, not yet implemented
**Implements:** a fifth topic, **Isometric drawing**, with ten exercises, and a second grid for the canvas. It moves isometric DRAWING from Tier 2 to Tier 1 (AGENTS.md §1.1) **without tolerance scoring**.
**Plan:** `docs/superpowers/plans/2026-09-15-isometric-drawing.md`, which runs after `2026-09-15-paper-review-fixes.md` and on top of it.

---

## 1. What changes

A student is shown a part's three orthographic views and draws the part as an **isometric drawing** on **isometric grid paper**: heights vertical, widths and depths at 30°, one grid step per unit. It is marked exactly, like every other topic, and told specifically what is wrong.

It is the textbook exercise that was missing. The app already asks students to READ an isometric (Type A shows one as the prompt) and to read three views (Type B). Nothing yet asks them to DRAW one.

## 2. Why it is Tier 1 after all: the premise, measured

AGENTS.md §1.1 filed isometric drawing under Tier 2 on 2026-08-29. The reason is sound: `tan 60° = √3`, so no pair of **square**-grid points sits at 60°, and a snap grid cannot express the answer. **But a student does not learn isometric on squared paper.** They use isometric paper, whose ruling already runs vertical and at 30° either side. The question that could kill this design was whether that grid expresses the answer exactly. Measured before any design:

| Check | Result |
|---|---|
| Where a lattice point (x, y, z) lands under this repo's view direction (+1, −1, +1) | doubled grid coordinates (x + y, x − y − 2z): integers, even sum, **every** point |
| The new exact method's visible lines vs the verified painter's (`isoedges.ts`), replayed on the grid | **0 mismatches over 3,030 parts**: all 30 catalogue solids, 3,000 random ones. A further 500 and 300 on the plan's exact code: 0 |
| Every point in the painter's own output | on the grid; the converter would have stopped on the first one that was not |
| A single cube (positive control) | 9 lines from both methods, and its coordinates match a hand derivation |
| A deliberately broken classifier that forgets which plane a face lies on | **disagrees** with the painter (33 lines vs 36) on a part whose back half is lower. The agreement test can fail |

**One measurement is worth recording because it nearly produced a useless test.** The broken classifier AGREED with the painter on the first stepped part tried: that part's two top faces are always separated by a visible riser, so it never exercises the property. It is AGENTS.md §6's "the fixture happened not to exercise the property" failure, and it was caught only because the control was run before being trusted. The control part in the tests has its back half lower, so its riser faces away and two top faces meet directly.

## 3. Coordinates: doubled, and why

The isometric grid is a triangular lattice. It is stored in **doubled coordinates** `(c, r)`: screen x is `c · cell · √3/2`, screen y is `r · cell/2`, and `(c, r)` is a grid point exactly when `c + r` is even. A step along the grid is `(±1, ±1)` on the 30° lines or `(0, ±2)` vertically, each exactly `cell` long.

Doubled coordinates were chosen over a skewed basis for three reasons:
1. **Every stored value stays an integer**, so `validate.ts` and the scorer need no change to accept them.
2. **The screen mapping is a per-axis scale.** A rectangle in grid units is still a screen rectangle, so the rubber-band select, the move tool and the scorer's bounding-box normalisation all work unchanged.
3. **Translation by any grid vector preserves parity**, so the scorer's translation-forgiveness is still exact.

**What doubled coordinates cost, and where it is paid:**
- **Snapping** cannot round each axis, because that lands on an odd-sum point half the time. `screenToGrid` takes, for each of the two nearest columns, the nearest row of the right parity, then the nearer candidate.
- **Arrow-key nudges** move by 2, not 1: `(1, 0)` is not a grid vector.
- **Paste** already offsets by `(n, n)`, which is a grid vector. **Hit-testing** snaps first and every off-line grid point is at least one unit from a line (`HIT_RADIUS` is 0.6), so both work unchanged.

## 4. The answer key: `src/lib/geometry/isodraw.ts`

**The method.** The grid cuts the page into small triangles, and no visible boundary crosses a triangle's interior, so each triangle shows exactly one surface, or none.

- **Which surface:** for each triangle, walk the eye's ray through its centre, in exact integer thirds, and take the first solid cell entered. The surface is named by its direction **and its plane**, because parallel faces at different depths are different surfaces.
- **Where the lines go:** a line runs wherever two neighbouring triangles show different surfaces.
- **Why the walk is exact:** at a centre, x, y and z become integers at three distinct phases, so the ray never passes through a voxel edge and there is never a tie to break.

**The key** is those unit steps merged into maximal collinear lines, one `visible` segment per straight edge, lifted by an even offset so all coordinates are non-negative.

**What it deliberately does:**
- **Hidden edges are omitted.** A pictorial shows the part as it looks. The oblique topic already teaches this, in its hint "Hidden edges are left out of a pictorial".
- **It is box-only.** A bore draws as an ellipse on isometric paper, which is Tier 2. `isometricKey` throws on a cylinder op, rather than drawing the part without its hole.
- **It uses one viewpoint:** front, right and above, the same corner every pictorial in the app uses. Every prompt states it.

**Why not `isoedges.ts`.** It emits a paint program whose occlusion is by overdraw, which makes the right picture and the wrong key. It is used only as the independent check: the tests replay its paint program on the grid and require identical lines.

**Server-only.** `isometricKey(solid)` derives an answer key in one call, so `geometry/isodraw` joins `isolation.test.ts`'s `SERVER_ONLY` list in the same commit that creates it. It gets its own positive control, per the §6 gotcha about that list drifting.

## 5. The exercise

**The prompt is the three views**, laid out by `viewsFigure` in the drill's convention, on a squared grid the student counts. It is the same figure oblique wave 2 and Type B already show.

**Three guards, all mechanical:**
1. **The views-leak rule** (§6): the three views of the part ARE the answer to any Type A exercise on it, so no isometric drill may use a Type A part. The existing guard is extended to cover the new drill kind.
2. **The pictorial-leak rule, new here.** The isometric drawing of the part is the answer. It must not appear as a pictorial anywhere else: a Type A prompt, an oblique pictorial prompt, or a Type B part, whose solved build renders it. The guard compares **generated isometric keys**, not solid descriptions: two parts differing only in hidden material draw identically, and it is the drawing that leaks.
3. **Well-posedness.** The views must determine the part. Three views do not always do so (§6), and a student who draws a different part consistent with the views must not be marked wrong. The Type B probes (visual hull and every single-cell removal) are factored into a helper and applied to both drill kinds.

All ten candidate parts were run through all three before any prose was written: all pass, and all fit the sheet with room to spare. Every visibility claim in a prompt was **measured**: a feature is "visible" only if filling it back in changes the key.

**The sheet is `ISO_SHEET` = 56 × 80 doubled units.** At the canvas's 20px step that is 1002 × 832 px, against the square sheet's 992 × 832, so the page layout does not shift between topics. The largest part spans 12 × 22.

## 6. The canvas

- **`Sheet`, `Toolbar`, `Editor`, `MethodDiagram`** take a `lattice` (absent means square).
- **The sheet** rules isometric paper: verticals plus both 30° families, drawn only through grid points. It sizes itself by `sheetPixels`.
- **Tools:** Select, Line and Move. Circle and Rotate are hidden, and so are the Flip buttons and their shortcuts:
  - an isometric circle is an ellipse (Tier 2);
  - a quarter turn is not a symmetry of this grid;
  - a mirror about a bounding-box centre can land off-grid.
- **The angle readout is off.** On this grid every line is at 30°, 90° or 150°, so the readout says nothing a student needs.
- **The rubber band's rectangle** is sized from screen coordinates, not `cell`, so it matches what it selects on both grids.
- **Server-side**, a figure drill on the isometric grid rejects any circle or odd-sum point with `400 OFF_LATTICE`. The canvas cannot produce either; the server does not take its word for it.

## 7. Content

**Topic `isometric`, titled "Isometric drawing"**, is appended to the catalogue. Blurb: *"Draw a part the way it looks, on isometric grid paper: heights vertical, widths and depths at 30°. Given its three views, put the part back together as a picture."*

**Hints**, each checked against the key ("would a student who followed this exactly produce the key?"):
1. *Three directions, and the grid already has them.* Heights are vertical, widths slope at 30° down to the right, depths at 30° up to the right. That is true of the key: width `(+1, +1)`, depth `(+1, −1)`, height `(0, −2)`.
2. *One grid step per unit, in every direction.* This is an isometric DRAWING, so nothing is shortened. The key has one grid step per unit edge.
3. *Where the faces go.* Front faces on the left, sloping up to the left; right-hand faces on the right, sloping up to the right; top faces above both. This holds for every drill. A tempting "the nearest corner is the lowest point" was left out, because `iso-tee` has that corner cut away.
4. *Leave hidden edges out.* The key contains no hidden lines, and some features cannot be seen from this corner at all (`iso-hidden-notch`).
5. *A straight edge is one line.* The scorer does not merge a student's collinear pieces, so an edge drawn in two halves reads as two wrong lines. The key merges collinear edges maximally.
6. *Build it from the block.* Construction lines are stripped before marking, so a light enclosing block is free.

**The ten exercises**, conventions alternating, all verified:

| id | title | part | views | lines | feature claim (measured) |
|---|---|---|---|---|---|
| `iso-l-block` | An L-shaped block | 6×4×4 − upper right 4×4×2 | first | 15 | tall left, lower right: visible |
| `iso-front-step` | A step facing you | 5×6×4 − front 5×3×2 top | third | 15 | front half lower: visible |
| `iso-corner-notch` | A notched corner | 6×5×4 − front-right-top 2×2×2 | first | 18 | notch at the nearest top corner: visible |
| `iso-channel` | A channel | 7×4×3 − 2-wide channel front to back | third | 17 | visible |
| `iso-two-steps` | Two steps | 6×4×6 stepping down twice, left to right | first | 21 | both steps visible |
| `iso-hidden-notch` | A notch you cannot see | 6×6×4 − back-left-bottom 2×2×2 | third | 9 | **invisible**: the key is a plain block's |
| `iso-tee` | A T-shaped plate | 7×6×3, T in plan, crossbar at the back | first | 18 | both cuts visible |
| `iso-cross-groove` | A groove across the top | 6×6×4 − groove left to right | third | 17 | visible |
| `iso-stepped-tiers` | Three tiers | 6×6×1 + 4×4×1 + 2×2×1, centred | first | 23 | visible |
| `iso-step-and-slot` | A step and a cut-out | 7×5×5 − top-right step − front-left-bottom 2×2×3 | third | 17 | both visible |

**Illustrations:**
- **The method diagram** is a plain 3×2×2 block, with its three edge directions carried past the nearest corner as construction lines.
- **The topic preview** is the same notched block the orthographic card uses.

Neither is any exercise's answer, and the registry test compares keys to prove it.

**Two small fixes this topic forces:**
- The figure-mode perfect message said *"The curve is exactly right."* for every figure exercise. That was already wrong for oblique and the straightedge constructions, and would be wrong here. It becomes *"Your drawing is exactly right."*
- The topic page labels a figure drill "construction". An isometric drill is labelled with its views' convention instead ("first angle views").

## 8. Previews carry their grid

`topicPreview` returns a `Figure`, `{ primitives, lattice }`, not bare primitives. The landing page, the topic chooser and `DriftingFigures` pass the lattice to `MethodDiagram`. Without it, an isometric preview renders in square cells, stretched to twice its height.

## 9. Testing

| File | New tests | What they guard |
|---|---|---|
| `coords.test.ts` | 6 | steps one cell long in all three directions; every sheet point round-trips; brute-force-nearest snapping that never lands off-grid; sheet pixel sizes; the parity rule; ruling through grid points only |
| `isodraw.test.ts` (new) | 9 | the axis mapping; a hand-derived single cube; plain blocks = 9 lines; hidden material leaves no trace; **agreement with the replayed painter** on fixed and 300 seeded random parts; the broken-classifier control; every key point on the grid; cylinders refused; merging |
| `isolation.test.ts` | 1 | the positive control for `geometry/isodraw` |
| `validate.test.ts` | 2 | `offIsoLattice` |
| `score.test.ts` | 5 | `OFF_LATTICE` for an odd point and for a circle; on-grid attempts scored; parity is NOT imposed on square figures; the real `iso-l-block` scores its own key perfect end to end |
| `registry.test.ts` | 6 | isometric drills well-posed; box-only; key on the grid and inside `ISO_SHEET`; the pictorial-leak rule; preview and diagram are no exercise's answer; **every topic carries at least ten exercises** (§2.9, never mechanically enforced until now) |

Three existing registry tests are widened rather than duplicated: the one-sheet rule (now per lattice), the views-leak rule, and "publishes its views and not its solid". The suite goes from 595 after plan 1 to **624**.

**Not unit-testable, and the check that matters most (§7):**
- **Render the page and read it as a student.** Ruling, snapping and tool set on white, warm and dark paper.
- **Draw a real answer and see it marked perfect:** draw `iso-l-block`'s key through the live canvas and check it.
- **Draw a wrong one and see the feedback overlay** land on the student's own lines.
- **Read every prompt and hint** against the answer it produces.

## 10. What this deliberately does not do

- **No isometric circles.** Holes remain Tier 2.
- **No hidden lines** in an isometric answer.
- **No merging of a student's collinear segments.** The same rule as every other topic, stated in a hint.
- **No change to the Type A isometric prompt** or its renderer.
- **No regular hexagon, yet.** It is exact on this grid: its vertices are grid neighbours, unlike on squared paper, where §1.1 records it as never exact. It is an obvious future constructions exercise, recorded rather than built.
- **No second viewpoint.** Every pictorial in the app is seen from front, right and above.
