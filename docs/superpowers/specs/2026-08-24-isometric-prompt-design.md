# Isometric Prompt Image — Design

**Date:** 2026-08-24
**Status:** approved in brainstorming, not yet planned
**Refines:** §5 and §13 of `2026-08-20-orthographic-drill-design.md`; picks up the split declared in §2 of `2026-08-21-generator-views-design.md`

The views generator shipped on 2026-08-24. This is the other half of what the
approved spec called "the generator": the picture the student is shown.

---

## 1. Scope

**In:** a solid model → the isometric pictorial, as 2D primitives.

**Out, deliberately:**

- anything scored — this image is never compared against anything
- SVG markup, React, or any rendering — a separate thin component does that
- the canvas and the scoring route handler — the next plan
- drill content and authoring — needs both generators to exist

## 2. The seam

```
isometricView(solid: Solid): IsoPrimitive[]
```

Pure, in `src/lib/geometry/`, alongside the views generator. No I/O, no
framework imports, per `AGENTS.md` §2 constraint 3.

## 3. The isometric gets its own primitive vocabulary — and it is enforced

```typescript
type IsoFace    = { kind: "iso-face";    points: [number, number][] };
type IsoLine    = { kind: "iso-line";    x1: number; y1: number; x2: number; y2: number };
type IsoEllipse = { kind: "iso-ellipse"; cx: number; cy: number; rx: number; ry: number; rotation: number };
type IsoPrimitive = IsoFace | IsoLine | IsoEllipse;
```

**The array is ORDERED, back to front, and the order is load-bearing.** The
renderer must paint it in sequence: an `IsoFace` as an opaque fill in the page's
background colour, an `IsoLine` as a stroke. See §6 — occlusion is achieved by
nearer fills painting over farther strokes, so shuffling the array corrupts the
picture. This is the one place in the project where a primitive list is a paint
program rather than a set.

The views generator deliberately reuses the scorer's `Primitive`. This one
deliberately does not, and the reason is the security invariant, not tidiness.

**The isometric and the answer key sit on opposite sides of the trust boundary.**
The isometric is the *public* half of a drill and goes to the browser. The three
views are the *private* half and must never leave the server (§5.1 of the
approved spec). §5.1 also warns, in terms, that this bug class will reappear in
new clothes.

So the question that decides the vocabulary is: **when someone later writes the
code that serialises a drill to the client, does the type system help them not
ship the answer key?** A single shared type answers "no" — a function typed
`Primitive[]` accepts either half, and nothing distinguishes them.

**A same-shaped alias would not help either.** TypeScript is structurally typed,
so a hand-rolled `IsoLine` with the same fields as `Segment` is freely assignable
to it. Renaming buys documentation, not enforcement.

**A different discriminant does help.** Because `kind` is `"iso-line"` rather than
`"segment"`, the two unions are genuinely incompatible, and the compiler refuses
to let key geometry flow into a public-payload slot or an isometric into
`compareView`. Discriminated unions are how TypeScript gets nominal typing.

Three further consequences fall out of the same choice:

- **`Ellipse` never enters `src/lib/scoring/`.** Adding it to `Primitive` would
  force `normalise`, `positionKey`, `translate`, `boundingBox` and every
  exhaustive `kind` switch to handle a shape no student can draw, since the
  canvas will not offer an ellipse tool. That is added surface area in the one
  module the project says must never be wrong.
- **Float coordinates stay out of the scorer's world.** Isometric coordinates are
  irrational by construction — `(x + y) / √2` and a `√6` divisor. The scorer's
  primitives carry a standing grid-snapped-integer invariant that its exact
  comparison depends on. Keeping the two apart keeps that invariant true.
- **The public/private split becomes visible in the types from day one**, rather
  than being a convention someone has to remember at the moment it matters.

Cost: roughly six lines of duplicated line shape, and a renderer that switches on
one extra `kind`. Cheap for a compiler-enforced trust boundary.

## 4. Appearance: a clean line drawing, produced by fill-and-stroke

What the student sees is outlines only — the textbook idiom, with no hidden
lines, since a pictorial conventionally shows none and this is a prompt rather
than an exercise in dashed-line reading.

**How that is achieved changed after the first attempt failed.** The drawing is
produced by painting each visible face as an opaque fill in the background
colour, followed by that face's own outline strokes, working back to front.
Nearer fills cover farther strokes, so hidden lines disappear by overdraw. The
rendered result is indistinguishable from a pure line drawing; the difference is
that occlusion is correct by construction rather than computed.

Strokes are still cancelled between adjacent coplanar faces, or every flat
surface would show a grid of unit-square outlines. That cancellation is purely
local and needs no visibility information.

## 5. Viewpoint: fixed, front-top-right

One conventional viewpoint for every drill. Difficulty comes from the part's
shape, not from puzzling out the orientation, and it means one projection to get
right and one to verify rather than eight.

Direction from object to viewer: **(+1, −1, +1)** in model space, where +x is
right, +y is back, +z is up.

Screen basis, perpendicular to that direction:

```
u =  (x + y) / √2
v = −(−x + y + 2z) / √6      (negated: screen y increases downward)
```

Verified numerically during design:

- The three axes facing the viewer are **+x, −y, +z** — the right, front and top
  faces, as expected.
- Those three project to screen angles **30°, 150° and 270°** — 120° apart, which
  is what makes the projection isometric. All three foreshorten equally.
- The object's front face therefore appears on the **left** of the picture.

## 6. Hidden-line removal — the first design here was WRONG

**Recorded rather than quietly replaced, because the error is instructive.**

### What was claimed, and why it was wrong

The first version of this section argued: the projection direction (1, −1, 1) is
a lattice diagonal, so voxels projecting to the same point are exactly those on
that diagonal; cubes project to hexagons that tile the plane; therefore a voxel
is visible iff no voxel nearer along the diagonal is solid, and **a visible
voxel's faces are wholly visible.**

The first two claims are true. The third does not follow, and is false.

**The hexagons do not tile.** A unit cube's projected hexagon has area √3 ≈ 1.732.
The projected lattice cell has area 1/√3 ≈ 0.577 — a factor of three smaller. Every
hexagon interior-overlaps six neighbours. Partial occlusion between voxels *not*
on a shared diagonal is therefore routine, and a per-diagonal visibility test
cannot see it.

The consequence was measured on the L-block fixture (a 6×4×4 block with a
3×4×2 step removed from the top-front-left):

- The step's tread is hidden wherever `x ≥ max(3−y, 1)` — a boundary that **cuts
  through voxel interiors**, so no voxel-granular method can express it. Sampled
  directly: the tread point (2.5, 0.5, 2) is visible while (2.5, 2.0, 2) is hidden.
- The tread's right boundary edge (3,0,2)-(3,4,2) is occluded at 40 of 40 sampled
  points, yet the algorithm emitted it — a line drawn across the face of a solid
  block.
- An independent checker found fully-hidden lines in every non-convex solid
  tested: 2 of 18 on the step, 4 of 22 on a cut corner, 4 of 24 on a mid-face
  notch. Convex blocks came out clean, which is exactly why the nine-edge test
  passed and looked reassuring.

### What replaced it: painter's algorithm, ordered by the diagonal depth

Faces are sorted **back to front by `t = x − y + z`** — the depth along the view
direction — and painted in that order: an opaque fill in the background colour,
then that face's surviving strokes. A nearer face's fill covers a farther face's
strokes, so occlusion happens by overdraw and is correct by construction. There
is no clipping arithmetic and no floating-point edge cases.

Verified before adoption, against ray-marched ground truth on the same L-block
that broke the previous approach: painting in this order reproduces the true
nearest surface at **11,778 of 11,800** sampled interior points. The 22
disagreements are all between voxels adjacent in z, at shared face boundaries —
rounding in the verification harness, not systematic failure.

`isVisible` from §5 survives and is still correct: it identifies voxels that are
*wholly* hidden, which is a sound culling optimisation. It was only ever wrong as
a claim about *faces*.

### What this costs

The emitted array is a paint program, not a set of visible lines (§3). It still
contains strokes belonging to partly-hidden faces; they simply get painted over.
Anything consuming these primitives must composite them in order. That is
acceptable here — this is a picture, never a scored answer — but it is the reason
the vocabulary is kept separate from the scorer's, where order means nothing.

Rejected alternatives:

- **Clipping each segment in 2D** against the projected silhouettes of nearer
  faces. Keeps the output a pure, order-independent set of lines. Rejected as
  materially more code and more floating-point risk for a picture that is never
  scored.
- **Restricting v1 to convex solids.** The failed approach is provably correct
  for them. Rejected because it would exclude steps, notches and slots — every
  part actually worth drilling.
- **General 3D hidden-line removal**, projecting every face to a polygon and
  clipping edges against nearer polygons. Correct for any geometry, and far more
  machinery than an axis-aligned voxel solid needs.

## 7. Cylindrical through-holes

A circle in a principal plane projects to an ellipse under isometric projection.
Emitted analytically as a single `IsoEllipse` with centre, radii and rotation —
the same instinct as `bore.ts` emitting an exact `Circle` rather than a staircase.

Only the near rim is drawn. The far rim of a through-hole is hidden by the
material around it, and §4 excludes hidden lines. Where a bore's far rim is
genuinely visible through the hole, v1 omits it: a small, visible omission in a
picture, not a wrong answer.

Ellipse visibility follows the face the rim sits on — if that face is occluded,
the ellipse is not drawn.

## 8. Verification: a much lighter regime, and why that is legitimate

The views generator carried §5.2's full apparatus because a wrong answer key
teaches an incorrect drawing silently. **That does not apply here.** This image is
never compared against anything; a defect is a picture that looks wrong, which is
visible to anyone who looks.

So the regime is:

- **Property tests** for structure — a plain block yields exactly the nine edges
  of an isometric cube; a through-hole adds exactly one ellipse; every emitted
  coordinate is finite.
- **The existing verification sheet**, extended to render the pictorial beside the
  three orthographic views for each golden part. That also makes the drafting
  review more useful, since a reviewer can check the views against the picture.
- **One asymmetric fixture with pinned coordinates.** Not because scoring depends
  on it, but because a *mirrored pictorial* would quietly mislead students about
  which side a feature is on while every structural test stayed green. That is the
  same failure mode the views generator's golden set exists to catch, and the
  lesson from building it — that mirror-invariant tests pin nothing — applies
  unchanged.

## 9. Module structure

Under `src/lib/geometry/`, pure and I/O-free. Sibling `*.test.ts` per module.

| Module | Responsibility |
|---|---|
| `isoproject.ts` | the screen basis, and the diagonal visibility walk |
| `isoedges.ts` | visible voxel faces → `IsoLine` primitives |
| `isobore.ts` | circle → `IsoEllipse`, with visibility |
| `isometric.ts` | compose into `IsoPrimitive[]` |

`scripts/verification-sheet.ts` is extended to render the pictorial. It stays a
dev script outside `src/lib/`, which remains pure.

## 10. Accepted limitations

- **No hidden lines**, by §4. Conventional for a pictorial.
- **A bore's far rim and inner wall are omitted.** Looking into a hole you would
  see a sliver of the cylindrical bore surface and, at some angles, part of the
  far rim; v1 draws neither, only the near rim ellipse (§7). Both are visible
  omissions in a picture, never a wrong answer.
- **One fixed viewpoint** (§5). Widening it later is additive: the direction
  becomes a parameter and the diagonal step follows from it.
- **Same feature set as the views generator** — through-holes only, no blind
  holes, fillets, chamfers, or non-axis-parallel holes.

## 11. Open questions

- **Centre lines in the pictorial.** Drafting practice varies on whether a
  pictorial shows the axis of a hole. Cheap to add later; not in v1 unless the
  drafting review asks for it.
- **Scale and stroke weight.** Presentation concerns belonging to the renderer,
  not the geometry. Deferred to the canvas work, which will set them alongside
  everything else the student sees.

**Not an open question, stated so it is not assumed away:** the primitives carry
**no pixel scale and no viewport**. Coordinates are in abstract projection units,
and it is the renderer's job to fit them to whatever space the page layout
leaves. This matters because the canvas will reserve ad slots (see the decision
log, 2026-08-24), so the space available to the prompt is not known here and must
not be baked in.
