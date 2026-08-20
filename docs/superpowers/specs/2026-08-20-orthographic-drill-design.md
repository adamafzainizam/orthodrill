# Orthographic Projection Drill — Design

**Date:** 2026-08-20
**Status:** approved, not yet implemented
**Working name:** orthodrill (placeholder)

---

## 1. The problem

Students learning technical drawing cannot practise orthographic projection alone. Given an isometric view of a part, producing the correct front / top / side views is the skill that is drilled hardest and failed most — and there is no way to know whether an attempt is right without an answer key or an instructor.

The existing market splits cleanly and leaves this gap open:

- **Drawing tools** (SimpleDraw, Planner 5D, SmartDraw, Floor Plan Creator) let you *create* drawings. They do not know what a correct answer is and cannot mark anything.
- **Courses** (ICA Institute, CourseCareers, VDCI, community colleges) provide feedback via human critique — expensive, scheduled, and not available at 1am the night before an assessment.

Nothing found provides **automated, scored, immediate feedback on a projection attempt**. That is the product.

### Why the gap might exist (honestly stated)

The risk is that nobody built this because automated scoring only measures the trivial part while real judgement stays qualitative. The counter-argument, and the reason to proceed: unlike *architectural* drafting, engineering drawing is governed by explicit standards. First- vs third-angle placement, hidden lines as dashed, centre lines on axes of symmetry — these are objectively right or wrong. Section 4 restricts scope to exactly the parts that are objectively scoreable.

## 2. Why this project

Chosen after Pathway Navigator was discontinued (see that repo's `docs/post-mortem.md`). Selection criteria, in order:

1. **Attacks a documented skill gap.** The builder's skills ledger lists JavaScript and CSS-beyond-inline-styles as gaps. This project is canvas interaction, geometry and interaction design — the gap, directly.
2. **Not CRUD.** Both previous projects were data-over-Postgres. The generator and scorer here are genuinely algorithmic.
3. **Global, not Malaysia-specific.** Technical drawing standards are international. Deliberate decision to avoid the low ad-RPM ceiling of Malaysia-local traffic, and to avoid an arbitrary limitation — unlike Pathway Navigator, where local specificity *was* the product.
4. **Testable premise, checked first.** The competitor gap was verified before designing, applying the explicit lesson from the previous project.

The builder is neutral on the domain but interested in the engineering. That is a stated risk and drives the content-generation decision in section 5.

## 3. Non-goals

Not in v1, deliberately:

- User accounts, authentication, any stored personal data
- Payments or paid drill packs
- Progress tracking or history
- Drill type B (dimensioning and annotation) — interface seam only, no implementation
- A drill-authoring UI
- Mobile / touch-optimised input
- Any language other than English
- Freehand drawing, or assessment of draughtsmanship quality
- A database

## 4. Core model and scoring

### 4.1 Snap-to-grid typed segments

The canvas accepts only **line segments with endpoints on integer grid coordinates**, each carrying a type:

- `visible` — solid line, a visible edge
- `hidden` — dashed line, an edge obscured by material
- `centre` — chain line, an axis of symmetry

A drawing is therefore a **set of typed segments**. So is the answer key.

**Rejected alternative:** comparing rendered images. That is a computer-vision problem — fuzzy, hard to test, and it can only produce feedback like "72% similar", which teaches nothing.

**Accepted trade-off:** snapping removes freehand motor skill. This drills *intent* — whether the student understands the projection — not draughtsmanship. This is a real narrowing and is the reason scoring can be honest and specific.

### 4.2 Scoring is a set diff

For each view, compare attempt against key:

| Case | Meaning |
|---|---|
| in both, same type | correct |
| in key, not in attempt | **missing** |
| in attempt, not in key | **extra** |
| same position, different type | **wrong line type** |

The last case matters most pedagogically: drawing a hidden edge as a solid line is the classic error, and this catches it precisely rather than marking the segment simply wrong.

Feedback is structured, never a percentage. "Your top view is missing the hidden line for the bore" — not "78%".

### 4.3 One canvas, three views, placed by the student

**The student draws all three views on a single canvas and positions each view
themselves.** They are not given three labelled boxes to fill in. Deciding where
the top and side views belong *relative to the front view* is the thing first-
and third-angle projection actually governs — pre-placing the views would remove
the skill being drilled.

A view is therefore identified by the cluster of segments it contains, not by
which box it was drawn in. Scoring resolves the front view first (it is the
same under both conventions), then interprets the remaining clusters' positions
relative to it.

### 4.4 View placement is scored separately from view content

First- vs third-angle projection is a distinct failure mode: a student can draw all three views perfectly and place them wrong. Placement produces its own verdict so the app can say exactly that, rather than marking the whole attempt incorrect.

### 4.5 Projection convention is regional, and first-class

ISO / first-angle dominates Europe and Asia. Third-angle dominates the US and Japan. **Neither is "correct".** A global resource must support both and teach the difference explicitly — the app must never imply one is the standard.

This is the transplanted insight from Pathway Navigator, whose one durable finding was that the same concept means different things in different places and nobody explains it clearly. There it was "credit exemption". Here it is projection convention.

## 5. Content generation

**The unsolved problem is content.** Drill A needs an isometric prompt plus a correct answer key per exercise. Hand-authoring 30 of those is a grind in a domain the builder does not know well — the most likely way this project dies, and the exact failure mode of the previous project.

### Decision: generate both from a solid model

A part is defined as **axis-aligned rectangular prisms composed on a grid** — a block with steps, notches, slots and rectangular through-openings. From that model, compute:

- the three orthographic views — visible edges, hidden edges, centre lines
- the isometric prompt image

Authoring a drill becomes defining a small solid. The answer key is **derived, never hand-made**.

**Why the axis-aligned restriction:** general 3D projection with hidden-line removal is hard. Axis-aligned box composition reduces it to interval arithmetic per axis, which is tractable and testable.

**Consequence — no curved features in v1.** Rectangular prisms cannot express a
cylindrical bore. Every "hole" in v1 is a rectangular through-opening. This is a
real narrowing: round holes are common in real engineering drawings, and adding
them later means arcs in projection plus circle/ellipse handling in the isometric.

**Therefore `centre` line segments are defined in the model but not generated in
v1.** Their primary use is marking the axes of circular features. The type stays
in the segment schema so the scorer and canvas need no change when cylindrical
features arrive, but no v1 answer key contains one, and the canvas should not
offer the tool until it does.

**Three reasons this is worth the risk:**
1. It eliminates the content grind that would otherwise kill the project.
2. It guarantees answer keys are *correct*, rather than depending on the builder's unfamiliarity with the domain.
3. It is the most interesting engineering in the project and the clearest portfolio artefact.

### The generator is fenced off

**The scorer accepts an answer key regardless of origin.** If the generator stalls, hand-authored JSON keys still work and the project still ships. The generator is a content *source*, never a dependency.

## 6. Architecture

Three units, deliberately separable.

### 6.1 The canvas (client)

Renders the isometric prompt and a snapping grid. Lets the student place, retype and delete segments. **Knows nothing about correctness** — it produces a segment set and renders feedback it is given. Kept thin on purpose so logic lives where it can be tested.

### 6.2 The scorer (pure, server-side)

Signature: `(attempt, key, convention) -> ScoreResult`

Returns structured correct / missing / extra / wrong-type segments per view, plus a view-placement verdict. No I/O, no framework, no database. Testable directly under `node --test`, following the pattern proven in the previous project's `src/lib/rules/` modules.

### 6.3 The drill store

A drill is split in two:

- **Public half** — isometric image, grid size, projection convention, prompt text. Served to the client; it *is* the question.
- **Private half** — the answer key. **Never leaves the server.**

v1 reads both from files on disk. No database.

### 6.4 Data flow

```
browser loads public drill
  -> student draws segments
  -> POST segment set to route handler
  -> handler loads private key, calls scorer
  -> structured feedback returned
  -> client renders feedback over the drawing
```

### 6.5 No database in v1

Drills are files. Attempts do not need persisting for the tool to teach. Adding Postgres would mean schema, migrations and a deploy dependency in service of a feature nobody asked for. If progress tracking later earns its way in, it slots in behind the same route handler.

## 7. Security requirements

These are requirements, not aspirations.

**Answer keys must never reach the client.** Anything the client can check, the client can read. There is no client-side mitigation — not obfuscation, not hashing, not encryption. Server-side scoring is the only fix, and it must be in place from the first commit because retrofitting it means reworking the data flow.

**Known limitation, accepted:** useful feedback inherently leaks the key. Enough submissions reconstruct an answer. Rate limiting bounds this. Acceptable for a practice tool where the only victim of cheating is the cheater; **not** acceptable for graded assessment, which would need a separate mode.

**Drill IDs must be whitelisted against a known list, never interpolated into a file path.** `drills/${id}.json` with unvalidated input is path traversal.

**Submitted segment sets must be validated before scoring:** maximum segment count, coordinate bounds, valid type enum. Otherwise a large payload exhausts CPU or times the function out.

**The scoring endpoint must be rate limited.** Free-tier invocation limits are a real ceiling.

**Nothing renders authored content as raw HTML.** React escapes by default; this holds only while that remains true.

**v1 collects no user data.** No accounts, no PII, nothing to leak. This is the single largest safety property and is a reason to keep accounts out of v1.

**Forward-looking:** if drill packs are ever sold, entitlement must be checked server-side at scoring time. Shipping all drills and hiding paid ones in the UI is the identical mistake in different clothes.

## 8. v1 scope

**Ships:**
- Drill type A — orthographic projection
- The generator, restricted to axis-aligned box-composed solids
- The canvas with snap-to-grid typed segment input
- Server-side scoring with structured feedback
- Both first-angle and third-angle conventions, taught explicitly
- 8–12 drills in a difficulty progression
- English only

**Interface seam only, not implemented:** drill type B.

**Budget:** 10–20 hrs/week, 8–10 weeks.

## 9. Testing

### 9.1 The scorer

Unit tests for correct, missing, extra, wrong-line-type, and each view-placement verdict under both conventions. Pure function, no browser, no database.

### 9.2 The generator — the testing problem that matters

If the generator emits a wrong key, the app confidently teaches incorrect drawings. This is the previous project's provenance problem in new form: how do you know your own data is right?

**Two layers, neither sufficient alone.**

*Property tests* — invariants that must hold for any solid:
- every projected edge lies within the projection of the bounding box
- a solid symmetric about an axis produces a symmetric view
- a solid with no internal features produces no hidden lines
- front and rear views are mirror images

These catch systematic errors across many generated cases.

*A hand-verified golden set* — 8–10 parts whose correct views are confirmed by someone who knows technical drawing, stored as test fixtures. **These are verification fixtures, not published exercises**, and are separate from the 8–12 drills that ship to users; a fixture exists to prove the generator is correct, and may be duller than anything worth drilling. The builder has access to GMI students who have taken the subject. Verify the algorithm against human judgement once; the property tests then guard against regression.

Together these mean the builder never has to trust their own unfamiliarity with the domain.

### 9.3 The canvas

Thin by design. One integration test covers the round trip: draw, submit, score, render.

## 10. Success criteria

**The success test:** a GMI student who has taken technical drawing completes a drill cold and agrees the feedback is correct and useful.

If they say the app marked them wrong when they were right, the project has failed at its core, and that must be discovered in week three rather than week nine.

Secondary: the golden set is verified by someone competent in the domain before drills are published.

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Generator produces wrong answer keys | **Critical** — teaches errors | Property tests + human-verified golden set; scorer accepts hand-authored keys as fallback |
| Hidden-line removal harder than expected | High — it is the core algorithm | Axis-aligned restriction; generator fenced behind the key interface so the project ships without it |
| Builder is neutral on the domain | Medium — content grind demotivates | Generator removes most authoring; v1 caps at 8–12 drills |
| Automated scoring only measures the trivial part | Medium — undermines the premise | Success test with a real student in week three, not week nine |
| Snapping makes it feel unlike real drafting | Low — accepted trade-off | Stated explicitly; the tool drills intent, not draughtsmanship |

## 12. Implementation sequencing

The three units must be built in dependency order so each is verifiable before
the next depends on it:

1. **Scorer first.** Pure, no browser, no content needed — write it against
   hand-written fixtures. Proves the feedback model before anything renders.
2. **Generator second.** Verified against the scorer's fixtures plus the golden
   set. Until it works, hand-authored keys keep the project moving.
3. **Canvas last.** It is the only part needing a browser, and by then both the
   input shape and the feedback shape are already fixed by tests.

Building the canvas first would be the natural temptation and the wrong order —
it would fix the interface by accident rather than by design.

## 13. Open questions

- **Standards sourcing.** ISO 128 and ISO 5456 are paywalled. Conventions must come from GMI coursework, textbooks or free national summaries. Confirm before authoring drills — this project's version of "read three PDFs first".
- **Name.** "orthodrill" is a placeholder.
- **Hosting.** Vercel free tier assumed, consistent with previous projects. Not yet confirmed for a route handler under load.
