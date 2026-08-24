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

## 2026-08-24 — a fix wave from final review, and an open seam left for the canvas

**Coincident primitives now resolve by drafting precedence, not insertion order.** `buildView` computed the merged lattice silhouette and the analytic bore primitives independently and simply concatenated them. When a lattice edge and a bore silhouette land on the same screen position — a step's face edge sitting exactly where a hole's outer bore line would also be drawn — both are real 3D edges, but `compare.ts` keys the key view by position with last-write-wins, so whichever list happened to be pushed second silently decided the type. A corpus sweep found 72 collisions where the two disagreed on type and 1188 where they agreed but were still duplicated; one of the latter already sat in the `stepped-plate-with-hole` fixture. Fixed by deduplicating on `positionKey` (already exported from `primitives.ts` for exactly this kind of position-only identity) with drafting precedence visible > hidden > centre, applied in `buildView` before the translate-to-origin step. `golden.test.ts` gained an assertion that no fixture view contains two primitives at the same position — confirmed to fail against the pre-fix code before landing the fix, not just written to pass against it.

**`validateSolid` gained the check it was missing: cylinder vs. the base block itself.** It checked hole-vs-hole and hole-vs-box overlap but never asked whether a hole's own circle stayed inside the block's footprint. A hole overhanging a face — real feature: a semicircular slot open on that face — was silently accepted and produced a full circle sitting outside the block outline; a hole entirely clear of the block was accepted too. Per §5.2, guessing at a shape the generator cannot draw is worse than refusing, so both are now rejected, with tangency (`u - r === 0`) deliberately kept legal since `bore.ts` already relies on a face-tangent hole keeping its outer bore line visible.

**An entirely-subtracted solid is now rejected rather than producing three empty "perfect" views.** `validateSolid` builds the occupancy grid and throws if no cell is solid. Folded in alongside the block-bounds check because both are the same class of gap: a validator that checked feature-vs-feature interactions but never checked the result against reality.

**Open seam, not fixed here: `CENTRE_OVERSHOOT` is load-bearing for scoring in a way nobody owns.** `compare.ts` normalises each side of a comparison by its own bounding box, and a bore's centre line deliberately extends past the circle or bore lines it marks (`CENTRE_OVERSHOOT = 2` in `bore.ts`) — that's correct drafting convention, not a bug. But because normalisation derives the bounding box from *all* primitives including centre lines, a student who draws a centre line with a different overshoot (3 units instead of 2, say) shifts the computed bounding box, which shifts the translation applied to every OTHER primitive in that view by one unit — so one plausible variation on a line nobody is being tested on turns every real primitive in the view into a reported miss. This is not a generator defect — the key itself is correct — and it isn't fixed here because the right fix depends on how the canvas snaps centre-line length, which doesn't exist yet: either snap the overshoot exactly so the ambiguity can't arise, or exclude centre lines from bounding-box normalisation entirely. Recorded now, before the canvas is built, so the choice is made deliberately rather than discovered as a confusing test failure later.

## 2026-08-24 — closing the centre-line normalisation seam

**Resolved: comparison anchors on the object, not on everything drawn.** `toOrigin` in `src/lib/scoring/compare.ts` now computes its translation from the non-`centre` primitives, falling back to the whole set only when a view contains nothing else. Every primitive is still translated by the same offset; only the choice of anchor changed.

**The failure it removes.** Comparison is translation-invariant, which is what lets a student place a view anywhere on the canvas. But centre lines legitimately extend past the feature they mark, so they were part of the bounding box the translation was derived from. A student who drew the part perfectly and ran their centre lines one unit longer therefore shifted the entire view relative to the key. Measured on a real generated key — an 8×8×4 plate with a centred through-hole, top view, seven primitives — that scored **0 correct, 7 missing, 7 extra**. A cosmetic choice produced total failure. With the fix the same attempt scores **5 correct, 2 missing, 2 extra**: the outline and the circle match, and only the two centre lines, which genuinely differ, are marked.

**Why this option and not the others.** Two alternatives were considered. Snapping the overshoot at input would have made the canvas silently rewrite what the student drew, and centre-line length is a legitimate thing for them to choose. Comparing centre lines by their axis rather than their endpoints would be the most forgiving and the closest to how a human marks, but it introduces a second comparison rule into a scorer whose single rule is much of its value. Anchoring is a few lines in one function, keeps one rule, and makes the penalty proportional to the mistake.

**Accepted remainder.** A centre line of the wrong length is still reported as one missing plus one extra primitive rather than as "right line, wrong length". That is the same shape of answer the scorer gives for a circle of the wrong radius, so it is at least consistent. If it proves harsh once students use it, the axis-based comparison above is the next step.

**Found before it could bite.** Nothing generates student input yet, so both sides of every comparison came from the same generator and always agreed. The defect was reachable only once a human drew the input, which is to say during the canvas work. It surfaced from tracing the seam deliberately rather than from a failing test.
