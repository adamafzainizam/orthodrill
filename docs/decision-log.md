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
