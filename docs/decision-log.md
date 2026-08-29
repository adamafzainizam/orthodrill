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

## 2026-08-24 — monetisation, checked before it was designed

**The premise check came first, and it moved the answer.** The question on the table was where to put non-obtrusive ads. Before designing placement, the cheapest question that could kill the work was asked instead: will this site get enough traffic for ads to be worth anything? Ad revenue is traffic times RPM, and the RPM half turned out not to be the binding constraint.

**The numbers.** Education is a high-value niche — roughly $15–30 RPM on tier-1 traffic (adstimate, 2026 figures). But this subject's audience is not tier-1 weighted: engineering drawing is a first-year requirement across Indian engineering programmes and a technical-school subject across West Africa and South-East Asia, while in the United States it sits mostly in CTE and community college. Indian traffic multiplies the tier-1 baseline by about 0.32 (techconda RPM benchmarks). A realistic blended figure is $3–5 RPM, which puts $100/month at roughly 25,000 pageviews and $500/month at roughly 125,000.

**A twelve-drill app cannot produce that.** It is about fifteen indexable pages of thin, interactive content, and AdSense approval itself requires a substantive body of original content. Designing ad placement today would have meant optimising the position of ads on a site that would not earn from them. This refines rather than contradicts the 2026-08-20 reasoning for going global: global beats Malaysia-local, but the specific global audience for *this* subject is still low-RPM, which the original decision did not account for.

**Decision: reserve the slots, ship them empty, decide later.** The canvas is designed with real reserved ad slots — fixed dimensions so nothing shifts, and kept clear of the drawing surface — but v1 ships with nothing in them. This costs almost nothing now, keeps the drill clean while the §10 success test runs, and leaves every monetisation path open.

**Why not commit to a content layer now.** Meaningful ad income would need written theory pages, worked examples and downloadable worksheets around the drills — a content site with an app attached rather than an app. That is a large scope increase, it closely resembles the content grind that killed the predecessor project, and it would be built on a premise not yet tested: no student has yet completed a drill and confirmed the feedback is correct. Committing a monetisation shape before the core product is validated is the mistake this project exists to avoid.

**Recorded for later, not chosen now: the generator is a worksheet factory.** Teachers Pay Teachers has an active market for orthographic projection worksheet bundles, and the UK KS3 Design and Technology curriculum (Oak National Academy) carries the topic. People already pay for exactly what the generator produces — unlimited parts with verified answer keys — and selling packs needs hundreds of visitors rather than hundreds of thousands. It is a different product shape from an interactive drill and would need the server-side entitlement story §5.1 warns about, so it is not chosen here. It is written down because it is the strongest alternative and the traffic economics are far kinder.

**Two constraints this places on the canvas design**, both recorded now so they are not retrofitted:
- **No ad adjacent to the drawing surface.** The canvas is a large area the student clicks and drags on repeatedly. Ads beside it are what AdSense treats as encouraging accidental clicks, and the penalty is account suspension rather than lost revenue. A drawing app carries unusually high exposure here.
- **Slots must reserve their space from first paint.** Late-loading ads that push content around would move the drawing surface mid-stroke. Beyond being infuriating, layout shift is a Core Web Vitals metric, poor vitals hurt search ranking, and ranking is where any future ad traffic would come from.

## 2026-08-24 — the isometric prompt image

**The first hidden-line design was wrong, and the error is worth recording.** It argued that because the projection direction (1, −1, 1) is a lattice diagonal, cubes project to hexagons that tile the plane, and therefore a visible voxel's faces are wholly visible. The first two claims are true; the third does not follow. A unit cube's projected hexagon has area √3 against a projected lattice cell of 1/√3 — every hexagon overlaps six neighbours threefold — so partial occlusion between voxels not sharing a diagonal is routine. Measured on the L-block fixture: the tread's visibility boundary cuts *through* voxel interiors, which no voxel-granular method can express, and the tread's right edge was emitted despite being occluded at 40 of 40 sampled points. Convex solids came out clean, which is precisely why the nine-edge test passed and looked reassuring.

**What replaced it: a painter's algorithm ordered by the diagonal depth.** Faces are sorted back to front by `t = x − y + z` and emitted as an opaque fill followed by that face's own strokes. A nearer fill covers a farther stroke, so occlusion happens by overdraw and is correct by construction, with no clipping arithmetic. Verified against ray-marched ground truth before adoption — 11,778 of 11,800 sampled points on the solid that broke the previous approach — and again after implementation at 100% surface agreement with zero spurious or missing ink across a randomised corpus.

**The cost is that the output is a paint program rather than a set.** The array is ordered and the order is load-bearing: it still contains strokes belonging to partly-hidden faces, which rely on being overpainted. Anything consuming it must composite in sequence, and a renderer must stroke each fill in the background colour as well as filling it, or a hidden edge lying on the seam between two coplanar fills shows through as an antialiasing hairline. That is the one place in this project where a primitive list is not order-independent, and it is the reason the vocabulary is kept separate from the scorer's, where order means nothing.

**Two multi-voxel-wide primitives had to be anchored at their farthest depth, not their centre.** The same mistake appeared twice. Merging strokes across coplanar faces would attach a run to the farthest face and let the nearer coplanar fills paint over part of the outline, so strokes are deliberately not merged across faces. And a bore ellipse anchored at the depth of the single voxel under the hole centre was 25–42% overpainted by coplanar fills of its own face; it is now anchored at the maximum face depth over the voxels its footprint covers, measured back to 0%.

**The isometric's primitives are deliberately incompatible with the scorer's.** The pictorial is the public half of a drill and the three views are the private half that must never leave the server. A shared type would mean a function typed `Primitive[]` accepts either, which is how "hidden in the UI but shipped to the client" mistakes happen. A same-shaped alias would not help, because TypeScript is structurally typed. A different discriminant does: `kind: "iso-face"` is not assignable to `kind: "segment"`, so the compiler refuses the mix. The boundary is pinned by `@ts-expect-error` tests, which fail if the types ever become compatible — verified by mutation.

**A lighter verification regime, and why that is legitimate.** Nothing here is scored, so a defect is a picture that looks wrong rather than a silently wrong answer key. But the property suite still had to be forced to earn its keep: a mutation battery found it catching only three of seven injected bugs, including one test that restated a guard clause and could never fail. It now catches all of them, plus two mutations chosen afterwards to check it generalises. The one test that can detect a mirrored projection compares against coordinates derived from the projection basis rather than from the generator.

## 2026-08-26 — the golden set is signed off by the builder, not an outside expert

**The constraint being overridden.** §5.2 of AGENTS.md said the builder is not a technical drawing expert and that this judgement must never be relied on, with a human-verified golden set as the second of two layers protecting against a wrong answer key. The plan that followed from it was to publish the verification sheet and route it to a GMI contact who knows drafting. The sheet was built, improved for an outside reader, and published for exactly that.

**What actually happened.** The builder reviewed all four parts and passed them, having also compared them against their own secondary-school technical drawing coursework — work that exists independently of this project and predates it by years.

**Why this was accepted.** The objection to self-review was never really about expertise; spotting a left-right flip on an L-block is not expert work. It was about independence: checking generated output against a description written by the same person, in the same session, guarantees some of the agreement it appears to earn. Comparing against coursework held outside the project answers that objection directly — it is an external reference point, which is the property the check was missing. The residual risk is narrower than the original constraint implies, and it is written down below rather than argued away.

**What this sign-off does cover.** Handedness, which is the failure that matters: a mirrored view survives every automated check in the repo, because symmetry invariants stay green under a mirror. Line types, missing and spurious edges, and sizes against the written description.

**What it does not cover, and this is the honest residual.** If the model-space convention itself were mirrored — if "+x is right" had been misapplied consistently from `solid.ts` through `viewspec.ts` and into the fixture descriptions — the descriptions and the views would agree with each other and both be wrong, and no amount of looking at this sheet separates those two worlds. Only an external published answer does. Three of the four parts carry citations that could settle it; `stepped-plate-with-hole` carries none and is therefore the weakest of the four on provenance.

**Cheaper instrument that was offered and declined.** Pulling up the three cited exercises and comparing directly would have been free, external, and stronger than any single human opinion. It was offered and the builder chose their own review instead. Recorded here because it remains available at any time and is the first thing to reach for if a drill is ever reported wrong.

**Two things follow.**
- **`VERIFIED` in `golden.ts` now means "the builder checked it against prior coursework", not "an outside expert signed it off".** The `verifiedBy` field on each part says so, and points here. Do not quietly upgrade what this word means.
- **The spec asks for 8–10 golden parts; we have 4.** That gap is unchanged by this decision and is not a reason to hold up the canvas, but new parts should be added as the generator's coverage grows.

## 2026-08-27 — the product is the marking, not the projection drill

**What changed.** orthodrill stopped being an orthographic projection drill and became a tool for practising technical drawing across topics. Orthographic projection and parabola construction ship; oblique, the Type B reverse drill and straightedge constructions are next.

**Why it was cheap.** The scorer never knew what the primitives depicted. It diffs typed lines and circles on a grid, so a tangent, a parabola and a front view are the same kind of thing to it. The only real generalisation needed was that a construction is ONE figure with nothing to cluster and no placement to judge, which became `scoreFigure` beside `scoreViews` over the same `compareView`.

**The premise check that shaped the roadmap, run before any design.** Scoring needs integer grid coordinates, so the cheapest question that could kill whole topics was whether their answers land on lattice points. Measured: tangent points in **0 of 162** configurations, ellipse points 4 of 12, parabola by the rectangle method exact, straightedge constructions exact.

That is not a content problem to author around — the model cannot express the answer. It sorts topics into three tiers by what each actually needs (AGENTS.md §1.1), and it picked the second topic on evidence rather than on appeal. Building a tangents topic would have consumed weeks before the wall appeared.

**What a topic now costs:** a generator, hints, a method diagram, and a preview figure. Both illustrative figures must be built from a solid or spec that is not any exercise's, or the topic chooser publishes an answer.

**Deliberately out of scope:** building, electrical, interior and planning drawing. A correct schematic is not a unique set of primitives, so scoring it is a research problem rather than a feature. Recorded so the decision is visible rather than looking like an oversight.

## 2026-08-27 — the UI thesis is studio dark

**Decided** after the builder said the interface was not as good as it could be, which was fair: it was functional but read as a prototype.

**The thesis: quiet near-black chrome that recedes, with the drawing sheet as the one bright, elevated surface.** On a drawing tool the sheet is the subject, and chrome that competes with it is chrome that is wrong. Build against this.

**Three of the problems were structural rather than cosmetic**, which is why the revamp was worth doing properly:
- An exercise page had no way out — no header, no breadcrumb, no link to its topic. The browser back button was the only exit.
- The toolbar gave a MODE (choosing a tool), an ACTION (undo) and a COMMIT (check my drawing) one identical costume.
- The hints panel was the same wall of text the parabola worksheet had been criticised for, relocated into a sidebar.

**One constraint that must survive every future visual change:** `Pictorial.tsx` paints its face fills in exactly the ground colour, and that overdraw IS its hidden-line mechanism. It cannot be made translucent or placed on a themed surface. `MethodDiagram` renders fill-less segments and CAN, which is why previews blend and pictorials do not. The two look similar and obey different rules; both are commented in-source.


## 2026-08-29 — the oblique lattice check, and the finding the prediction missed

**Run before any oblique code was written**, as §1.1 and §2.4 require. The handoff of 2026-08-27 predicted that cavalier oblique is lattice-exact when the receding axis steps one grid unit per unit of depth. A prediction is not a measurement, and this project does not build on those.

**Measured.** Oblique projects `(x, y, z)` to `(x + k·y, z + k·y)`, with the depth factor `k = 1` for cavalier and `k = 1/2` for cabinet.

| What was measured | Result |
|---|---|
| Cavalier, every cell corner of blocks up to 6×6×6 | **19683 of 19683** on the lattice |
| Cabinet, same sweep | 10935 of 19683 |
| Cabinet, even depths only | **343 of 343** |
| Cabinet, odd depths only | **0 of 294** |
| Through-hole rim, bored along y (the receding axis) | major/minor = 1.000000 — a **circle** |
| Through-hole rim, bored along x or z | major/minor = 2.618034 — an **ellipse** |
| Bore silhouette tangent points along the 45° receding axis | **0 of 450** on the lattice |

**The prediction was right about boxes and silent about the thing that actually bites.** Cavalier is exact for all box geometry, and cabinet's dividing line is exactly the predicted parity. Neither of those is the finding.

**The finding is that oblique cannot express a through-hole.** Two independent reasons, either of which is sufficient:

- **A bore on x or z projects to an ellipse.** Its rim lies in a receding plane, so the only axis whose rim stays a true circle is y, the receding axis itself. `circle` is the only curved primitive we have, so an ellipse is not expressible — the same wall the tangent and ellipse topics hit, reached from a different direction.
- **Even the y bore fails.** Its rim survives as a circle, but the silhouette lines joining the front rim to the back rim are tangent to that circle along the 45° receding direction, and those tangent points land at `c ± r/√2` — irrational for every radius and centre tried, 0 of 450. So the feature cannot be outlined exactly even where its rim can be drawn.

**Decision: oblique ships Tier 1, restricted to box-only solids. Cylinders in oblique are Tier 2.** The restriction is affordable — 5 of the 8 orthographic exercises are already box-only, and those solids are directly reusable as oblique subjects, so the topic has content without inventing any.

**Decision: cavalier, not cabinet.** ~~Cabinet halves the receding depth, which is why it looks less distorted and why textbooks often prefer it — but it is lattice-exact only for even depths, so it would silently constrain every exercise's depth to an even number and make an odd-depth solid unscoreable rather than merely wrong. Cavalier has no such coupling.~~ **SUPERSEDED the same day — see the next entry.** The builder pointed out that oblique has three standard types, and re-measuring showed all three are lattice-exact under a per-type authoring rule. Treating cabinet's even-depth requirement as a defect was the error: it is an authoring constraint of exactly the same kind as the parabola's `h = n²`, which this project already accepts without complaint.

**What this cost:** one throwaway script and about twenty minutes. What it saved is the version of this session where a bore is added to an oblique exercise in week two and the ellipse is discovered by a student.

## 2026-08-29 — oblique has three types, all three are lattice-exact, and the real constraint is elsewhere

**Prompted by the builder**, hours after the entry above: *"there are 3 types of oblique drawing. we should include exercises for all of them, no?"* Correct, and the re-measurement changed the decision.

**The three types differ only in the depth factor `k` applied along the receding axis.** Cavalier draws depth at `k = 1`, cabinet at `k = 1/2`, and general (or normal) oblique at a reduction ratio, conventionally `2/3` or `3/4`. That is a ONE-PARAMETER generalisation of the same projection, not three topics:

```
(x, y, z)  ->  (x + k·y,  z + k·y)
```

**Measured: every type is lattice-exact, under one authoring rule per type.** A vertex lands on the lattice iff `k·y` is an integer, so the rule is about every y-coordinate appearing as a vertex — the base depth *and* every feature box's `y` and `d` — not just the overall depth.

| Type | `k` | Admissible depths | Naive authoring | Authored in steps of the denominator |
|---|---|---|---|---|
| Cavalier | 1 | every integer | 85184 of 85184 | **27104 of 27104 — exact** |
| Cabinet | 1/2 | multiples of 2 | 46464 of 85184 | **27104 of 27104 — exact** |
| General | 2/3 | multiples of 3 | 32912 of 85184 | **27104 of 27104 — exact** |
| General | 3/4 | multiples of 4 | 27104 of 85184 | **27104 of 27104 — exact** |

So the earlier "cavalier only" call was wrong. Cabinet is not blocked; it is authored on a depth grid of 2. **All three ship.**

**The receding angle, by contrast, really is fixed.** Only 45° gives an integer step: `tan 15°`, `tan 30°`, `tan 60°` and `tan 75°` are all irrational, and only `tan 45° = 1` yields the step `(1, 1)`. 45° is the standard for oblique anyway, so this costs nothing — but it means the angle is not a variable the topic can teach by varying, and a hint must not imply otherwise. *(The first version of this check reported 45° as off-lattice, because `Math.tan(Math.PI/4)` is `0.9999999999999999`. Caught by disbelieving a result that contradicted the arithmetic, and re-run with a tolerance. A premise check with a floating-point bug is not a premise check.)*

**The real constraint is one I glossed this morning, and it is a content hazard rather than a scoring one.** Strictly, "full depth" in cavalier means the receding line's LENGTH on the page equals the true depth. A 45° axis has unit direction `(1/√2, 1/√2)`, so a true-scale depth `y` gives the offset `k·y/√2` — irrational for every rational `k` and every `y > 0`, **0 of 80** measured. Our step of one grid diagonal per depth unit is therefore `√2` longer than true scale.

**Why that is still correct, and why it must be said out loud.** The ratios between the types — 1 : 1/2 : 2/3 — are preserved exactly, and those ratios are the entire teaching content. The `√2` factor is uniform, applies to every type equally, and is only visible to a ruler laid across the page. The app has no ruler; it has a grid, and the unit along the receding axis is the grid diagonal. Counting one diagonal per unit of depth is exactly how oblique is drawn on squared paper.

**But this is the parabola-hint failure class waiting to happen** (§6). A sidebar hint reading "in cavalier oblique the depth is drawn full size" is, read metrically, describing something the answer key does not do. The hint must say **"one grid diagonal per unit of depth"** and let the ratio carry the teaching. Per §7 the convention needs a citation before the hints are authored — this is precisely a case where the reference belongs with the drill.

**Decisions.**
- **Ship all three types**, as one generator parameterised by `k`, with a per-type depth rule enforced in validation rather than left to authoring care.
- **General oblique at `2/3`**, not `3/4` — it needs depths divisible by 3 rather than 4, so the solids stay smaller and the drawings fit the sheet.
- **Author at least one solid drawn in all three types**, since the comparison is the point: the same part, three depth factors, visibly different distortion.
- **Box-only still holds.** Nothing here rescues the through-hole; that finding is unchanged and independent of `k`.
