# Type B Wave 2 — The Builder UI

**Goal:** A student reads three views and BUILDS the part by clicking faces. Wave 1's engine, scoring and API are merged and working; this is the thing a student touches.

**Branch:** `feat/type-b-builder`.

**Parent specs:** `2026-08-26-canvas-and-reverse-drill-design.md` §4.3 (interaction), `2026-09-06-type-b-engine-design.md` (the engine beneath).

---

## Three corrections to the wave-2 notes, found before planning

**1. Hit-testing does NOT come free.** Parent spec §4.2 says the face under the cursor is the last polygon in paint order containing the point. True — but `IsoFace` carries only `points`, so the hit gives a POLYGON and not the cell or direction needed to act on it. `isoedges.ts`'s internal `Face` type already carries `{name, x, y, z, t}`, so the fix is to emit a pick list **from the same ordered pass** rather than to recompute face geometry beside it. Two sources of truth for where a face is would put clicks and pixels permanently at risk of disagreeing.

**2. The §7.1 isolation relaxation is WRONG AS WRITTEN and would open the exact hole §6 warns about.** It names `isometric.ts`, `isoedges.ts` and `isoproject.ts`. But `isometric.ts` imports `validateSolid` from `views.ts` — the key-DERIVING module — and `isolation.test.ts` reads DIRECT imports only, so a client importing `isometric.ts` would pull `views.ts` into the browser bundle with nothing to notice.

   **The builder does not need `isometric.ts`.** It renders a CELL SET through `isoEdges`, not a `Solid` through `isometricView`. And `isoedges.ts` imports only `occupancy`, `isoproject` and `isotypes` — genuinely clean. So the relaxation is **narrower than specced**: `isoedges`, `isoproject`, `cells`, `rotate3`. `isometric.ts` stays banned.

**3. `lib/canvas/history.ts` is already generic** (`History<T>`), so undo/redo is reuse.

## One thing the parent spec did not anticipate

**Feedback cells arrive NORMALISED.** `scoreSolid` normalises both sides to their bounding-box origin, so the returned `missing`/`extra` cells are in normalised space and do not line up with the student's own coordinates. The client must translate them by the attempt's own bounding-box minimum before drawing ghosts over the model. That is a pure function and gets a test.

---

## Tasks

### Task 1 — `isoPickList`, from the same pass as the paint program
- Extract steps 1–3 of `isoEdges` into `orderedFaces(o)`; `isoEdges` consumes it unchanged.
- `isoPickList(o): PickFace[]` where `PickFace = { cell: Cell; dir: "+x" | "-y" | "+z"; points: [number, number][] }`, back-to-front, same order.
- **Tests:** the pick list's polygons are identical, in order, to the `iso-face` primitives `isoEdges` emits for the same occupancy (this is the anti-divergence guard, and it must be confirmed to FAIL if the two are computed separately); every pick cell is solid; a plain block's pick list has exactly the faces its three visible sides carry.

### Task 2 — Picking, pure
- `src/lib/canvas/picking.ts`: `pointInPolygon(p, poly)` and `faceAt(list, p): PickFace | null` returning the LAST containing face.
- **Tests:** a point inside one polygon; a point in an overlap returns the NEARER (later) one — positive control, since returning the first is the obvious wrong implementation; a point outside everything returns null; a point on a boundary is decided consistently.

### Task 3 — The builder reducer, pure
- `src/lib/canvas/builder.ts`: state is `{ cells: Cell[]; q: QuarterTurn }` under `History`.
- Actions: `addAgainst(face)`, `removeOwning(face)`, `rotate(delta)`, `undo`, `redo`, `reset`.
- **Rotation is the subtle part:** the pick list is computed on the ROTATED occupancy, so a face's cell is in rotated space and must go back through `unrotateCell` before it touches state.
- **Adds are confined to the base block.** §4.1 has the student carving from the full block; adding exists to recover from an over-cut, not to build outward. Confining it also keeps every submission inside `validateCells`' bounds by construction.
- **Tests:** add against `+z` puts a cell one above, in UNROTATED coordinates, for every `q` (the positive control: if rotation were ignored, `q=0` would still pass — so the test must assert a case where rotated and unrotated differ); remove deletes the owning cell; an add outside the base block is refused; undo/redo round-trip; reset returns the full block.

### Task 4 — The narrowed isolation relaxation
- Remove `geometry/isoedges` from `SERVER_ONLY`; leave `geometry/views`, `geometry/solid`, `drills/registry`, `server/`, `scoring/*` banned. `isometric.ts` is not in the list and stays reachable only through server code.
- **Add a positive control for the NEW boundary** — a client file importing `geometry/views` must still be caught. A relaxation without one is how a guard quietly stops guarding.

### Task 5 — `Builder.tsx`
- SVG. Paint the program in order (fills in paper, sealed), then invisible pick polygons on top in reverse order for hit-testing.
- Click adds against the face; Alt/right-click removes the owning block; four viewpoint stops; undo/redo/reset; submit posts `{ kind: "solid", cells }`.
- Reuses `Notifications` and the backlog.

### Task 6 — Feedback rendering
- `ghostCells`/`markedCells` translated out of normalised space (the wrinkle above), drawn as tinted blocks over the model.
- Colours from tokens, checked in both themes — `Pictorial`'s `#ffffff` trap (§6) applies here: the face fill must equal the ground exactly or hidden-line removal breaks.

### Task 7 — Wire the page and unhide
- `app/drills/[id]/page.tsx` renders `Builder` for `mode === "build"` instead of 404.
- Delete `listPlayableDrillIds` and `playableTopicIds`; restore `listDrillIds` in the three pages that call them.

### Task 8 — The owed prose checks, and the grid
- §7's "would a student who followed this exactly produce the key?" on both prompts and all four hints, **by rendering the page and reading it**.
- **`build-corner-step` says "count grid squares" — render a grid or reword.** That exact defect shipped once (oblique wave 2).

### Task 9 — Eight more exercises
- To meet §2.9's floor of 10. Each box-only, asymmetric, well-posed, and used by no Type A exercise. **If a guard fails, change the solid, never the guard.**

---

## Verification

`npm test && npm run lint && npm run typecheck && npm run build` after every task, and the reported test COUNT must rise. Every new guard confirmed to FAIL on a deliberately broken input before it is trusted. Commits carry the builder's name only (§2.7).
