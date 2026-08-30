# Canvas drawing aids: circle preview, angle readout, copy/paste, rotate, mirror

**Date:** 2026-08-29
**Status:** approved
**Supersedes nothing.** Extends `2026-08-26-canvas-and-reverse-drill-design.md`, which designed the Type A canvas these four features sit on.

---

## 1. What this is

Five requests from the builder against the working canvas. Three are ordinary
feature work. The fourth — a rotate tool — ran into the lattice, and the
measurement reshaped it before any code was written. The fifth, mirror, was
offered alongside rotate and added once it was noticed (§7); it turns out to be
the one operation here with no parity trap at all.

They are specced together because they share one seam (the editor reducer) and
one hazard (the canvas must never produce a drawing the scorer cannot accept).

---

## 2. The premise checks, run first

§2.4 of AGENTS.md: find the cheapest question that could kill a piece of work
and answer it first. Three of these features had one — the angle readout, the
rotate tool, and mirror (§7, measured there because it is the contrast that
explains rotate's base point).

### 2.1 Which angles can a LINE make? Multiples of 45, and nothing else.

Sweeping every integer vector out to 12 units and taking the closest approach
to each target angle:

| Target | Closest lattice vector | Actual | |
|---|---|---|---|
| 45° | `(1,-1)` | 45.0000° | **exact** |
| 90° | `(0,-1)` | 90.0000° | **exact** |
| 135° | `(-1,-1)` | 135.0000° | **exact** |
| 60° | `(4,-7)` | 60.2551° | off by 0.26°, needs an 8-unit run |
| 30° | `(7,-4)` | 29.7449° | off by 0.26° |
| 15°, 75° | | | off by 0.26° |

`tan 60° = √3`, so no pair of lattice points is at 60°. **This makes isometric
DRAWING a Tier 2 topic**, alongside tangents and ellipses. It is recorded in
AGENTS.md §1.1 as part of this change — the finding arrived here, but it belongs
in the tier table where the next topic decision will look for it. It does not affect the Type B reverse drill, which asks the
student to *read* an isometric, not draw one.

The angle readout is worth building anyway, and arguably worth more because of
this: a readout saying `63.4°` is precisely what tells a student their line is
not the 60° they intended.

### 2.2 Which ROTATIONS preserve the lattice? Four, and refining the grid never adds any.

Sweeping all 360 whole degrees against a spread of lattice points:

**Exact: 0°, 90°, 180°, 270°. Four of 360.**

Rotate-and-round is not a near miss. An asymmetric L rotated 45° and snapped
back to integers:

| | |
|---|---|
| Worst edge | `4.000` → `2.828` — a 29% shortening |
| Worst corner | right angle → `78.7°`, off by 11.3° |
| 0/90/180/270 | congruent, exactly |

A drawing tool that silently deforms the student's work, in an app that then
marks that work, is worse than a tool without a rotate button. This is the
"close enough" judgement §1.1 names as how a tool teaches the wrong thing.

**45° is impossible at any grid resolution, not merely at ours.** 0 of 6560
non-zero lattice points survive it. `(x−y)/√2` is an integer only if `x−y` is a
multiple of `√2`, which no integer is — so no finer grid, no different cell
size, and no future sheet ever rescues it.

### 2.3 More stops DO exist — at Pythagorean angles, rejected on a clean rule

Rational points on the unit circle are exactly the Pythagorean triples, so a
shape whose coordinates are all multiples of 5 can rotate exactly by the 3-4-5
angle: `(x,y) → ((4x−3y)/5, (3x+4y)/5)`. Verified end to end on an asymmetric
L — every vertex integer, worst pairwise-distance error `7e-15`, i.e. exactly
congruent.

| Shape coords must be | Exact stops in 360° | At |
|---|---|---|
| multiples of 1–4 | 4 | 0, 90, 180, 270 |
| multiples of 5 | **12** | 0, 36.87, 53.13, 90, 126.87, 143.13, … |
| multiples of 13 | **12** | 0, 22.62, 67.38, 90, … |
| multiples of 25 | 20 | |
| multiples of 65 | 36 | |

So twelve stops are genuinely reachable — but never at 45°, and every extra one
is a decimal.

**The builder's rule, stated 2026-08-29: ship only whole-number stops.** That
decides it without needing to argue the other costs, and it is a good rule on
its own terms — a snap stop labelled `36.87°` is a bad control. (The other costs
were real too: the sheet is 48×40, so forcing coordinates onto a ×5 lattice
leaves 9×8 usable positions, which cannot hold three orthographic views.)

**Rotate therefore ships with four stops: 0, 90, 180, 270.**

### 2.4 The rotation CENTRE has its own parity trap

Rotation by 90° about `(cx, cy)` is lattice-safe only when `cx` and `cy` are
**both** integer or **both** half-integer:

```
bbox 8×6 → centre (4, 3)     ok
bbox 7×6 → centre (3.5, 3)   OFF LATTICE
bbox 8×5 → centre (4, 2.5)   OFF LATTICE
bbox 7×5 → centre (3.5, 2.5) ok
```

The obvious implementation — rotate about the selection's bounding-box centre —
is therefore broken for roughly half of all selections, silently, producing
coordinates `validate.ts` will reject. **Every base point in this design comes
from `screenToGrid` or from a rounding, so it is always integer and always
safe.** This is pinned by test, not left to care.

---

## 3. Feature 1 — the circle preview

**Asked for:** while drawing a circle, show the circle that will be created, not
just the radius line.

**The structural point, which matters more than the feature.** The preview line
is currently drawn from the raw `pending` and `cursor` points, while the
committed circle comes from `radiusFrom()`, which **rounds and clamps to
`[1, MAX_RADIUS]`**. Adding a preview circle drawn from `Math.hypot` would make
the preview lie near both clamps: a long drag would preview a huge circle and
commit a `MAX_RADIUS` one.

**Design.** Extract into `editor.ts`:

```ts
export function pendingPrimitive(
  tool: Tool, type: PrimitiveType, from: Point, to: Point,
): Primitive | null
```

`clickWhileDrawing` and `Sheet` both call it. The preview then *is* the
primitive that will land, by construction. Returns `null` for the cases that
refuse to commit (a zero-length line; a non-drawing tool), so the preview
disappears exactly when the click would do nothing — which is itself feedback.

**Render.** Dashed circle at `pending` with the computed radius, **plus** the
existing radius line, in the same preview styling already used.

---

## 4. Feature 2 — the angle readout

**Asked for:** when the line being drawn interacts with an existing line, show
the angle of the corner that will be created.

**New pure module `src/lib/canvas/angles.ts`** — no DOM, no framework, tested
under `node --test`, consistent with §8's purity rule.

```ts
export type Interaction =
  | { kind: "corner";   at: Point; degrees: number; exact: boolean }
  | { kind: "crossing"; at: Point; degrees: number; exact: boolean };

export function headingOf(from: Point, to: Point): number | null;
export function cornerAngle(a: Point, vertex: Point, b: Point): number;
export function interactionsWith(
  from: Point, to: Point, ps: readonly Primitive[],
): Interaction[];
```

**Three things are shown:**

- **Shared endpoint → the true corner angle, in `[0,180]`.** A 135° corner reads
  135°, not 45°. This is the case the builder actually described.
- **Proper crossing → the acute angle of the four**, at the crossing point.
- **A live heading chip near the cursor while a LINE is pending.**
  `headingOf` in `[0,180)`, treating the pending line as a line rather than a
  ray. This is what actually helps lay a 45° mitre line, because it needs no
  existing line to touch. **Not shown for the circle tool** — a circle has no
  heading, and the radius drag's angle means nothing to the student.
  `headingOf` returns `null` when `from` and `to` are the same point, so the
  chip disappears rather than reading `0°` before the cursor has moved.

**Exactness is decided in integer arithmetic, never by comparing floats.** For
two rays between lattice points with integer deltas, the angle is a multiple of
45° iff `dot == 0` or `|dot| == |cross|`. `exact: true` renders in a distinct
colour. Given §2.1 this is honest teaching: 45/90/135 are the only angles this
grid can hit exactly, and the readout should say so by looking different.

**Deliberately excluded: circles.** The angle between a line and a circle is
against the tangent at the intersection, which is real work and was not asked
for. Segments only, and `interactionsWith` skips circle primitives.

**Construction lines ARE included.** The mitre line and projection lines are
exactly what a student measures against.

**Crossing points are frequently non-integer.** That is fine: an `Interaction`
is chrome. It is computed in the component's render path and never enters
`drawing`, so it cannot reach `validate.ts`.

---

## 5. Feature 3 — copy and paste

**Asked for:** copy and paste a selection, with the pasted copy selected
immediately.

**State.** `EditorState` gains `clipboard: Primitive[]` and `pasteSerial: number`.

**Actions.** `COPY_SELECTION` and `PASTE`.

- **An internal clipboard, not the system one.** Pure, testable without a
  browser, no permission prompts, and cross-tab copy is not a need here.
- **Paste offsets by `(1,1) × pasteSerial`**, so a repeated paste does not hide
  under the previous one. `COPY_SELECTION` resets `pasteSerial` to 0.
- **The pasted primitives are selected immediately**, so Move, the arrow keys
  and Retype act on them without a further click. This was the explicit ask.
- **One history entry per paste**, so one undo removes the whole paste.
- **An empty clipboard makes `PASTE` a no-op**, and an empty selection makes
  `COPY_SELECTION` one — neither clears what is already held.
- **Refuses entirely at the cap.** If `drawing.length + clipboard.length >
  MAX_PRIMITIVES`, the paste is a no-op rather than a partial paste — matching
  how `clickWhileDrawing` already refuses at the same cap.
- **`Ctrl/Cmd+C` and `Ctrl/Cmd+V`.** This claims `Ctrl+C`, which the comment at
  `Editor.tsx` currently cites as deliberately left free. **That comment must be
  updated in the same change**, not left contradicting the code.

**No clamping to the sheet bounds**, matching what `MOVE_SELECTION` already
does. Pasting partly off-sheet is possible and is recoverable by moving it back;
adding bounds to one action and not the other would be the real inconsistency.

---

## 6. Feature 4 — the rotate tool

**Asked for:** rotate a selection by mouse or by typed value, positive and
negative, with snapping stops, AutoCAD-style.

**Ships with four stops — 0°, 90°, 180°, 270° — per §2.2 and §2.3.**

**`Tool` gains `"rotate"`.** Shortcut `r`, alongside the existing `s`/`l`/`c`/`g`.

**The base point.** Defaults to the selection's bounding-box centre **rounded to
the nearest integer grid point**, which is always lattice-safe by §2.4. Clicking
with the rotate tool active sets a different base point; it comes from
`screenToGrid`, so it is always integer and therefore also always safe. There is
no way to express an unsafe base point, which is the point of designing it this
way rather than validating afterwards.

**With an empty selection the rotate tool does nothing** — no base point, no
preview, and both the drag and the typed value are no-ops. Same shape as
`MOVE_SELECTION`, which already returns unchanged for an empty selection.

**Mouse.** Drag around the base point; the preview snaps to whichever of the four
stops is nearest and renders the rotated selection dashed, exactly as the move
preview already does. Release commits. **A click and a drag are distinguished
the way `Sheet` already distinguishes them** (the `dragging` ref set on first
move): a click with no movement sets the base point, a drag rotates. A drag
whose nearest stop is 0° commits nothing, so a stray gesture cannot dirty the
history.

**Keyboard.** A numeric field appears in the toolbar while rotate is active.
Accepts any multiple of 90, positive or negative — `-90`, `180`, `270`, `-360`.
Anything else is refused with a message naming the reason, which is teaching
rather than an error. The existing form-control guard in `Editor.tsx` already
stops single-key shortcuts firing while an input has focus, so typing `9` will
not switch tools.

**Sign convention, stated explicitly because this is where a mirror bug hides.**
**Positive is counter-clockwise as seen on screen.** Grid `y` increases
downward, so the implementation is not the textbook matrix — a positive rotation
maps `(1,0)` to `(0,-1)` in grid coordinates. This is pinned by a positive
control test, in the spirit of §5.2: a sign error here produces a drawing that
is perfectly self-consistent and perfectly wrong, which is the same failure
class the golden set exists to catch.

**What rotates.** A segment's two endpoints; a circle's centre, with its radius
unchanged. One history entry per rotation. No clamping to sheet bounds, as in §5.

---

## 7. Feature 5 — mirror / flip

**Asked for** on 2026-08-29, after being offered and initially missed.

**Two actions: `MIRROR_H` (about a vertical axis) and `MIRROR_V` (about a
horizontal axis)**, both acting on the current selection.

**It needs no base point, and this is a real difference from rotate rather than
a simplification.** A horizontal mirror maps `x → 2·cx − x` and leaves `y`
alone, so it is exact whenever `2·cx` is an integer. The selection's
bounding-box centre is `(minX + maxX) / 2`, and `minX + maxX` is always an
integer, so **the bbox centre is always safe** — measured across even, odd and
offset bounding boxes:

```
bbox x 0..8  -> axis 4.0   SAFE
bbox x 0..7  -> axis 3.5   SAFE
bbox x 3..10 -> axis 6.5   SAFE
bbox x 2..9  -> axis 5.5   SAFE
```

Rotation fails for mixed-parity boxes (§2.4) because it couples `x` and `y`
through `cx + cy`; a mirror touches one coordinate at a time and cannot. So
rotate takes a base point and mirror does not, and that asymmetry is deliberate
and measured, not an oversight.

**Congruence is exact by construction** — a mirror is an isometry with integer
coefficients, so no rounding is involved anywhere and no distance can drift.

**What flips.** A segment's two endpoints; a circle's centre, radius unchanged.
One history entry. The selection is preserved (the same primitives, flipped in
place), so a second `MIRROR_H` returns the original exactly.

**Keyboard.** `Shift+H` and `Shift+V`. These carry a modifier deliberately: the
bare `h`/`v` keys are left free, and the existing single-key tool shortcuts are
already specified to fire only with no modifier held.

**One note worth carrying, and it is not a defect to fix.** A mirror is the one
operation here that turns a correct view into a plausible-looking wrong one —
the exact failure class §5.2 built the golden set to catch, now available to the
student as a button. That is fine: the scorer compares against the key and will
say the view is wrong, which is the tool working. It is recorded because
"handedness silently flipped" is the hardest error in this project to see by
eye, and the next person to debug a mystified student should think of it.

---

## 8. Testing

Everything with logic lives in `src/lib/canvas/` and is tested without a browser.

**`pendingPrimitive` (§3).** A swept range of `from`/`to` pairs asserting the
preview primitive is **identical** to the one that lands in history after
`CLICK_GRID`. Must include both radius clamps — a drag of 0 units and a drag
beyond `MAX_RADIUS` — since those are exactly where a naive preview diverges.

**`angles.ts` (§4).** Corner angles against hand-derived values. The integer
exactness test asserted directly: `(1,1)` against `(1,0)` is exact; `(2,1)`
against `(1,0)` is not. **Positive controls**, per §6's account of why they
matter: a case that must report NO interaction (two disjoint segments), and an
obtuse corner that must read 135° rather than 45° — that second one fails
outright under the "acute angle everywhere" design that was rejected, so it pins
the decision and not just the arithmetic.

**Copy/paste (§5).** Reducer tests: paste selects exactly the new indices; the
serial offsets a repeat paste; the cap refuses wholly rather than partially; one
undo removes a whole paste; copying an empty selection is a no-op.

**Rotate (§6).** The sign positive control above. Congruence: every pairwise
distance in the selection is preserved **exactly** by each of the four
rotations — this is the test that would have caught the rotate-and-round design
had it shipped. Integrality: every resulting coordinate is an integer, swept
over both base-point parities and over odd and even bounding boxes, which is the
§2.4 trap. Four rotations of 90° return the original drawing exactly.

**Mirror (§7).** Exactness swept over even, odd and offset bounding boxes —
every resulting coordinate an integer, with no rounding anywhere in the path.
Congruence: every pairwise distance preserved exactly. Involution: two
`MIRROR_H` in a row return the original drawing precisely. And a positive
control that the flip actually happened — an asymmetric selection must NOT be
equal to itself after one mirror, or a no-op implementation would pass the
involution test.

**In the browser, because tests cannot see it (§6, the authored-prose hazard in
its rendering form):** the angle arcs and labels must be read on a real sheet
with three views drawn, at a crossing dense enough for labels to collide. A
label that overlaps the drawing is the class of defect only a screenshot
catches, and the same is true of the rotate preview at each stop.

---

## 9. Deliberately out of scope

- **Line–circle intersection angles** (§4).
- **The system clipboard** (§5).
- **Cut.** Not asked for; copy plus delete already covers it.
- **Rotation by any angle other than a multiple of 90** (§2.2, §2.3), at any
  future grid resolution.
