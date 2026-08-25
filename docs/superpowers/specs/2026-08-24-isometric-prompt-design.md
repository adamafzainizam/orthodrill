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
type IsoLine    = { kind: "iso-line";    x1: number; y1: number; x2: number; y2: number };
type IsoEllipse = { kind: "iso-ellipse"; cx: number; cy: number; rx: number; ry: number; rotation: number };
type IsoPrimitive = IsoLine | IsoEllipse;
```

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

## 4. Appearance: a clean line drawing

Outlines only, no fill, visible edges only — the textbook idiom the student is
being taught to read. No hidden lines: a pictorial view conventionally shows
none, and this image is a prompt rather than an exercise in dashed-line reading.

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

## 6. Hidden-line removal is the walk we already do, along a diagonal

This looked like the hard part and is not.

**The projection direction (1, −1, 1) is a lattice diagonal.** Two voxels project
to the same point exactly when they differ by a multiple of it. This was checked
numerically: `(1, −1, 1)` is invariant under the projection and **no other unit
lattice step is**. Cubes project to hexagons that tile the plane, one hexagon per
diagonal line of voxels.

Therefore:

> A voxel is visible if and only if no voxel nearer along (1, −1, 1) is solid.

That is structurally identical to the near-to-far walk `project.ts` already does
along an axis — the step is `(+1, −1, +1)` instead of a unit axis vector — and it
is **exact for the same reason**, not an approximation. `buildOccupancy` is reused
unchanged.

Edges come out as they do in the orthographic views. Concretely, a line is
drawn along the shared border of two adjacent hexagons when the surfaces meeting
there differ — that is, when one hexagon is empty and the other visible (the
silhouette), or when both are visible but belong to voxels at different depths
along the diagonal (a step). Where two adjacent visible voxels lie at the same
depth and present the same face direction, the surface is continuous and no line
is drawn. The plan pins the exact adjacency rule and its expected edge counts.

Rejected alternatives:

- **Painter's algorithm over filled faces.** Simplest possible occlusion, since
  overdraw handles it. Rejected because §4 calls for a line drawing, and
  recovering clean edges from a filled rendering is harder than computing them.
- **General 3D hidden-line removal.** Projecting every face to a polygon and
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
