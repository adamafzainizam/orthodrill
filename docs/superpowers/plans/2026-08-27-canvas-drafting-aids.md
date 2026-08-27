# Canvas Drafting Aids — Plan

**Goal:** Make the canvas usable by someone who actually drafts. Five changes from the first real test of the app.

**Origin:** the builder drew a full three-view layout with the standard quadrant construction and a 45° mitre line, and the app answered "read as 1 view, not three views."

## The diagnosis that shapes this work

**The clustering failure was caused by the construction lines themselves.** `clusterPrimitives` groups by proximity, so a mitre line and a pair of projection lines crossing the sheet connect all three views into one component. The scorer was right about what it saw.

That makes construction lines a first-class concept rather than a nicety: they are working lines a draughtsman needs, they must be drawable, and they must be invisible to scoring — not merely tolerated by it.

## Decisions

1. **`construction` becomes a fourth `PrimitiveType`** alongside `visible`, `hidden`, `centre`.
2. **The scorer strips construction lines at its entry point**, before clustering. Not at the wire, not in the canvas: one place, so no caller can forget. `validate.ts` accepts the type, so a construction line that does reach the server is harmless rather than fatal — a filtering bug must not reject a student's whole attempt.
3. **The canvas also strips them before submit.** Belt and braces; the server-side strip is the one that is load-bearing.
4. **Quadrants are a visual aid only.** Dividers and the auto-placed mitre line help the student lay out the sheet; view identification stays content-based and placement keeps its own verdict, per design spec §4.3. The app must never tell the student which view belongs where — that is half of what first- vs third-angle projection teaches.
5. **The isometric gets real dimensions**, generated from the solid so they cannot disagree with the answer key.
6. **`Move` becomes a tool** (shortcut `G`), because drag now means rubber-band selection in `Select` mode and the two cannot share a gesture.

## Tasks

### Task 1 — the construction line type
`primitives.ts`, `validate.ts`, `score.ts`, `Sheet.tsx`, `Toolbar.tsx`, `submit.ts`.
Add the type; strip it in `scoreAttempt` before `clusterPrimitives`; render it thin and light; offer it in the line-type control; filter it in `submitAttempt`.
**Tests that must exist:** a drawing whose three views are joined by construction lines still clusters as three; construction lines never appear in any `ViewDiff`; a perfect attempt stays perfect when construction lines are added to it.

### Task 2 — quadrants and the mitre line
`Sheet.tsx` plus a pure `quadrants.ts`.
Divide the sheet in four. Determine which quadrants hold drawn primitives. Draw the mitre line at 45° through the empty one. Pure functions decide; the component only draws.
**Tests:** quadrant assignment for a point; which quadrants are occupied for a given drawing; the mitre line's endpoints for each of the four possible empty quadrants; the case where zero or several quadrants are empty.

### Task 3 — tools, shortcuts, and rubber-band select
`editor.ts`, `Toolbar.tsx`, `Sheet.tsx`, `Editor.tsx`.
`Move` tool. Shortcuts `S`/`L`/`C`/`G`. Drag in `Select` selects everything inside the rectangle; drag in `Move` moves the selection. Arrow-key nudge stays.
**Tests:** the reducer's rectangle selection, including a primitive partly inside; that shortcuts do not fire while a form control has focus.

### Task 4 — dimension the isometric
New `isodims.ts`, `Pictorial.tsx`, `registry.ts`.
Generate dimension lines, extension lines, arrowheads and figures from the solid: overall width, depth and height, then each subtractive feature. Place them clear of the silhouette and of each other. 1 grid unit = 10 mm, as the verification sheet already assumes.
**Tests:** every drill produces dimensions; the figures match the solid's real sizes; no dimension overlaps the silhouette's bounding box; output is deterministic.

## Constraints

- `src/lib/` stays pure. No new dependencies. No AI attribution in commits.
- `npm test && npm run lint && npm run typecheck && npm run build` clean before every commit; lint at zero problems.
- Never import `drills/registry`, `server/`, `geometry/views`, `scoring/score` or `scoring/assign` from a client component.
- Adding a `PrimitiveType` touches `Sheet.tsx`'s `DASH`/`INK` maps — type them `Record<PrimitiveType, …>` so the compiler catches the next one.
