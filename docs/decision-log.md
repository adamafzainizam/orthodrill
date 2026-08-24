# Decision Log

Dated record of non-trivial choices and the reasoning behind them. The *why* matters as much as the *what* — this project is a learning exercise as much as a product.

Append new entries at the bottom. Never delete an entry; if a decision is reversed, add a new entry explaining the reversal.

---

## 2026-08-20 — project selection

**Chosen after `pathway-navigator` was discontinued.** That project's premise — that Malaysian credit transfer caps vary per institution — was disproved by its third data point. See its `docs/post-mortem.md`.

**Selection criteria, in order.** Attacks a documented skill gap (the builder's skills ledger lists JavaScript and CSS-beyond-inline-styles as gaps; this project is canvas, geometry and interaction). Not CRUD — both previous projects were data-over-Postgres. Global rather than Malaysia-specific. And its premise was checked *before* designing.

**The premise check, run first this time.** Searched for existing scored drafting drills before any design work. Found drawing tools (SimpleDraw, Planner 5D, SmartDraw) that cannot mark anything, and courses (ICA Institute, CourseCareers, VDCI) that mark by human critique. The automated-drill gap is real.

**A candidate that looked better and wasn't.** An ER-diagram drill was considered as "home turf" for a software engineering student. Checking it found the opposite of the expectation: ER-diagram auto-grading is a published research area with an ACM paper (*GRADE*), an existing web app (DiagrammER), and commercial courseware (uCertify, 45+ exercises). More crowded than the drafting idea, not less. Recorded because the instinct was wrong and the check reversed it.

**Global, English-only.** Rejected a Malaysian identity. Technical drawing standards are international, so local framing would be an arbitrary ceiling — unlike the predecessor, where local specificity *was* the product. Also fixes the economics the earlier research flagged: Malaysia-local ad traffic has a low RPM ceiling. GMI students remain the test audience, not the market.

## 2026-08-20 — core model

**Snap-to-grid typed primitives, not image comparison.** Scoring compares structured primitives as a set diff. Rejected comparing rendered images: that is a computer-vision problem — fuzzy, hard to test, and capable only of "72% similar", which teaches nothing. Accepted trade-off: snapping removes freehand motor skill, so the drill tests intent rather than draughtsmanship. That narrowing is what makes the marking honest.

**Server-side scoring, from the first commit.** Anything the client can check, the client can read — an answer key shipped to the browser is visible in DevTools. No client-side mitigation exists. Retrofitting this later would mean reworking the whole data flow, so it is not deferred. Accepted limitation: useful feedback inherently leaks the key over enough submissions; rate limiting bounds it, and this would be unacceptable for graded assessment.

**No database in v1.** Drills are files. Attempts do not need persisting for the tool to teach. Both previous projects started with Postgres; here it would mean schema, migrations and a deploy dependency in service of a feature nobody asked for.

**Generated answer keys, not hand-authored.** The builder is neutral on the domain, and hand-authoring keys would be the content grind that killed the predecessor — while also risking wrong keys, since he is not a technical drawing expert. Generating from a model makes keys correct by construction. The generator is fenced behind the key interface: if it stalls, hand-authored keys still work and the project still ships.

## 2026-08-20 — feature-based modelling, and round holes

**Cylindrical through-holes are in v1.** An earlier revision excluded them, because axis-aligned box composition cannot express a bore. Reversed: a drawing tool without round holes reads as a toy, since a hole is *the* canonical hidden-line teaching case.

**Rejected: a general boolean/CSG engine.** Robust boolean operations on solids are a known-hard problem — numerical robustness, coplanar faces, degenerate intersections. That Blender's boolean modifier is known for producing broken meshes is not a Blender failing but the difficulty showing through. It would plausibly consume the entire budget and produce nothing a student sees.

**Chosen: feature-based modelling.** A base block plus typed features, each knowing how it projects into each view — how real parametric CAD works. For a through-hole parallel to a principal axis, the projection needs no boolean geometry at all: a circle plus centre cross looking down the axis, two parallel bore lines in each other view.

**The real cost, recorded because it is easy to underestimate.** The core model generalises from typed segments to typed primitives, since a circle is not a segment. That touches the canvas, the scorer and the generator — roughly 1–2 weeks, spent before the canvas exists so the interface is fixed once rather than twice. Centre lines are consequently generated in v1 after all.

**Excluded, each for a reason:** blind holes (a bottom face adds hidden-line cases and more ways to be subtly wrong), fillets and chamfers (arcs tangent to lines, geometrically fiddly and pedagogically secondary), and holes not parallel to a principal axis (these need auxiliary views, a different topic).

## 2026-08-20 — the scorer

**Views are identified by content, not by where they were drawn.** The scorer brute-forces all six ways of assigning three clusters to the front, top and side views and keeps the lowest-cost assignment. The alternative — infer the view from its position on the canvas — is self-defeating: position is exactly what the projection convention governs, so a position-based heuristic would silently agree with whatever layout the student chose and could never report a placement error. Six permutations is trivial to compute, and it removes any heuristic that could mis-identify a view and then blame the student for the consequences.

**Content and placement get separate verdicts.** Comparison is translation-invariant: both the attempt and the key are shifted so their bounding boxes start at the origin before any diffing. A perfectly drawn view sitting ten units too far right is a *placement* problem, not a drawing problem, and conflating the two would produce feedback that is both false and useless. A student who draws all three views correctly but lays them out third-angle when asked for first-angle now gets told precisely that, via `matchesOtherConvention`.

**Wrong line style is `wrongType`, not missing-plus-extra.** `positionKey` deliberately excludes a primitive's type, so a hidden edge drawn solid matches its key entry by position and is reported as one styled-wrongly line. Keying on type as well would have reported one missing primitive and one extra one — technically true, pedagogically worthless, and a description of the single most common error in the subject.

**The wrong number of views is its own outcome, not a bad score.** `scoreAttempt` returns a discriminated union; drawing one view when three were asked for yields `WRONG_VIEW_COUNT`, not a diff full of missing lines. Different problem, different words.

**No overall percentage, deliberately.** The scorer returns a structured diff and nothing resembling a mark. "72% correct" was rejected for image comparison for the same reason it is rejected here: a number teaches nothing. The caller renders the structure.

**The conventions table is data and is still unverified.** First- versus third-angle placement lives in one exported object, not in branching logic, so correcting it against a reference touches one literal and no algorithms. It currently encodes first-angle top-below / third-angle top-above from general knowledge. **This has not yet been checked against a free reference** — that check is the premise test named in AGENTS.md §4 and it blocks publishing drills, not the scorer.

**Deviation from the plan, recorded:** the plan assumed a git remote that did not exist — the project had no GitHub repository at all. Created `adamafzainizam/orthodrill` as a **private** repo at this point and pushed. Private rather than public deliberately: the conventions table is still unverified, and once drill content exists AGENTS.md §5.1 means answer keys must never sit in a world-readable repo. Flipping it to public later is a decision to take with that in mind.

## 2026-08-21 — the convention premise check, and the bug it caught

**The check was run before the generator, and it paid for itself immediately.** AGENTS.md §2.4 says to find the cheapest question that could kill a piece of work and answer it first. That question here was "do free references agree on first- vs third-angle placement, given ISO 128 and ISO 5456 are paywalled?" They agree. Our code did not agree with them.

**The bug: the conventions table mirrored on one axis instead of two.** It read `first_angle: { top: "below", side: "right" }` and `third_angle: { top: "above", side: "right" }`. The side view was identical under both. In reality the two systems are mirror images on *both* axes — first-angle places the object between observer and plane, so every view lands on the far side from the direction it was seen: top view below, **right-side view to the left**. Third-angle places the plane between observer and object, so each view lands on its own side. Corrected to `first_angle: { top: "below", side: "left" }`.

**Consequence had it shipped.** `checkPlacement` would have told a student who laid out a correct first-angle drawing that their side view was misplaced, and `matchesOtherConvention` could never have fired correctly, because a layout can not match "the other convention" when both entries claim the same side. Exactly the §5.2 failure: the app confidently teaching an incorrect drawing.

**Why the existing 36 tests missed it.** Two reasons, both worth remembering. The placement test asserted only that the conventions differ on the *top* view, never on the side. And the composed tests in `score.test.ts` derive their layout offsets *from* `CONVENTIONS`, so they exercise the plumbing and stay green for any table values whatsoever. Tests that read their expectations out of the thing under test cannot falsify it. The fix adds three tests that pin the literal values instead.

**`side` now has a defined meaning: the right-side view.** It was ambiguous before, which is part of why the error survived review — "the side view" has no single placement, since the left-side view mirrors the right one. Recorded as a constraint on drill authoring: a drill wanting a left-side view must say so explicitly.

**Sources are cited in the source file, not just here**, per §7. Engineering LibreTexts (Illinois Tech), GD&T Basics, Xometry Pro and JLC CNC. The paywalled ISO standards were not consulted and the code says so.

## 2026-08-24 — the views generator, and what adversarial review found

**Cylinders never enter the occupancy grid.** The design had accepted that bores would staircase at cell resolution. They do not: the grid is built from box operations only, and cylindrical holes are projected analytically, consulting the grid solely to ask what lies in front of them. This removes an accepted limitation rather than adding one. The cost is that seeing through one hole to a feature behind it stays unmodelled — already excluded by the approved spec, and now enforced as a thrown error rather than left as an implicit assumption.

**Bore occlusion was asymmetric, and it was wrong in exactly the way this generator exists to get right.** The original occlusion check sampled a single grid column at a hole's depth to decide whether its two bore lines were hidden. A notch cut symmetrically in front of a symmetric hole should hide or expose both bore lines together; sampling one column meant the two lines could be judged independently, so a symmetric cut could bury one bore line and leave the other visible. That is a wrong answer key for the canonical hidden-line teaching case named in the design spec as the reason round holes are in v1 at all. Fixed by consulting both adjacent columns at the same depth before deciding either line's visibility.

**`validateSolid` rejects what v1 cannot model, rather than guessing.** Perpendicular intersecting holes were originally accepted and produced continuous bore lines that, in reality, terminate at the intersection curve — a wrong key by omission. Per §5.2, a confident wrong answer is worse than a refusal, so the generator now throws on solids it cannot correctly project instead of emitting a plausible-looking but incorrect one.

**Property tests were much weaker than they looked, and the weakness was found by injecting bugs rather than by reading the tests.** An adversarial reviewer wrote eight deliberate generator bugs and ran them against the existing property suite; five passed. Two patterns recurred: an invariant computed from the same primitives it was meant to check (the bounding-box test derived its bound from the projector's own output, so it could never fail), and a fixture that didn't exercise the property under test (the "no hidden lines" check ran only against plain blocks with no hidden edges, so a generator with hidden-line classification deleted outright still passed). Same failure mode as the `CONVENTIONS`-derived tests caught on 2026-08-21 — a test that reads its expectation from the code under test cannot falsify it. Rebuilt with positive controls (assert the property fails on a solid constructed to violate it), exact counts instead of loose bounds, and expected values derived independently of the implementation.

**The golden fixtures pinned nothing, twice over, before they pinned anything.** First mechanically: `npm test`'s unquoted `**` glob (recorded in AGENTS.md §6) meant `golden.test.ts` never ran at all while `npm test` stayed green. Second substantively, once it was made to run: all four of its assertions — asymmetry-exists, citation-present, non-empty, run-to-run stability — are invariant under a global mirror, so a generator with front and back (or left and right) swapped would have passed every one of them. Fixed by hand-deriving expected coordinates for the L-block's front view from the feature definition directly, cross-checked by four independent derivations, and confirmed to fail under both a horizontal and a vertical mirror of the correct answer.

**The golden parts remain UNVERIFIED, and merging does not change that.** §5.2 requires a human or a cited published source to sign off on each golden part before it backs a published drill; `npm run verify:sheet` renders all four for that review. None has been reviewed. The generator code, its property tests, and the pinned-but-unverified fixtures are being merged now because the gate is on *publishing drills*, not on *landing the generator* — the same distinction AGENTS.md §7 draws for content authoring generally.
