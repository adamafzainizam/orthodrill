# AGENTS.md

**Living status document for this repository.** Whichever AI agent (or human) works on this project reads this first and updates it before finishing a session. This file — not any chat history, not any external memory — is the canonical record.

> Practice carried over from `campus-marketplace` and `pathway-navigator`, where it proved its value repeatedly: session boundaries destroy context, and a file in the repo is the only thing that survives them.

---

## 0. How to use this file

**At session start:** read sections 1–4. Read section 5 (the two invariants) and section 6 (gotchas) before writing any code.

**Before finishing:** update section 3 (status), add any new decision to `docs/decision-log.md`, add any new trap to section 6, and update section 4 so the next session starts oriented.

**Do not** record decisions only in commit messages. Commits explain a diff; this file explains the project.

---

## 1. What this project is

A browser drill for **orthographic projection**. Given an isometric view of a part, the student draws the front, top and side views; the app scores the attempt and says specifically what is wrong.

**The gap it fills.** The market splits cleanly and leaves this open:

- *Drawing tools* (SimpleDraw, Planner 5D, SmartDraw) let you create drawings. They do not know what a correct answer is and cannot mark anything.
- *Courses* (ICA Institute, CourseCareers, VDCI) give feedback by human critique — expensive, scheduled, and unavailable at 1am the night before an assessment.

Nothing found gives automated, immediate, specific feedback on a projection attempt. That is the product.

**Global, English-only, deliberately.** Technical drawing is international. This is not a Malaysian site — that was considered and rejected, because unlike its predecessor there is nothing locally specific about the subject, and Malaysia-local ad traffic has a low RPM ceiling. Local GMI students remain the **test** audience; they are not the market.

**Full design and reasoning:** `docs/superpowers/specs/2026-08-20-orthographic-drill-design.md`. Read it before changing anything structural.

---

## 2. Standing constraints

Not negotiable without an explicit decision recorded in `docs/decision-log.md`.

1. **No spending.** Free tiers only. Ask before introducing anything billable.
2. **Answer keys never reach the client.** See section 5. This is a security requirement, not a preference.
3. **The scorer and generator stay pure and I/O-free.** No framework imports, no filesystem, no network. They are the two things that must be testable without a browser or a server.
4. **Test a premise before building on it.** The predecessor project spent a week of infrastructure on an assumption that three PDFs would have disproved in an afternoon. Find the cheapest question that could kill a piece of work, and answer it first.
5. **Git workflow:** one feature = one branch, atomic commits, PR per feature, tagged releases. Branch *before* writing code.
6. **Reasoning gets recorded**, not just outcomes. The builder is using this project to learn, so the *why* matters as much as the *what*.
7. **English only.** No i18n, no Bahasa Melayu. Reversing this needs a recorded decision.

---

## 3. Current status

**Phase:** scorer, views generator and isometric prompt complete, golden set signed off. Canvas not started.

**Done:**
- [x] Candidate chosen after `pathway-navigator` was discontinued — see that repo's `docs/post-mortem.md`
- [x] Competitor gap verified *before* designing (drawing tools ≠ scored drills; teaching is human critique)
- [x] Design spec written, self-reviewed, revised twice, approved
- [x] Repository initialised
- [x] Scaffold, test harness, and the pure scoring engine — 36 tests
- [x] The views generator — solid model, occupancy grid, projection, holes, golden fixtures
- [x] The golden-set review sheet, published as a private Artifact
- [x] All four golden parts reviewed and marked VERIFIED (2026-08-26) — by the builder against prior coursework, not an outside expert; see `docs/decision-log.md` for the residual risk
- [x] The isometric prompt image — painter's algorithm ordered by diagonal depth, occlusion by overdraw, analytic bore ellipse (an earlier diagonal-visibility-walk design was replaced mid-implementation; see the session log)

**Not started:** the canvas, the scoring route handler, and all drill content.

---

## 4. Next up

**START HERE (updated 2026-08-26, evening).** **The golden set is signed off and the canvas is now the only thing between here and a shippable drill.**

The sign-off came from the builder's own review against prior coursework, not from an outside expert — a deliberate departure from §5.2's original wording, recorded in `docs/decision-log.md` with what it covers and the one thing it cannot. **Read that entry before treating `VERIFIED` in `golden.ts` as stronger than it is.** Two live follow-ups, neither blocking:

- **Three of the four parts carry citations that were never actually pulled up.** Comparing our output against those published exercises is free, external, and stronger than any single human opinion. It is the first thing to reach for if a drill is ever reported wrong.
- **The spec asks for 8–10 golden parts; we have 4.** Add more as the generator's coverage grows.

The review sheet stays useful and is still published — regenerate with `npm run verify:sheet`, which writes `verification-sheet.html` (standalone, open it locally) and `verification-sheet.artifact.html` (body-only, what gets published). Both come from one body; only the outer wrapper differs, because the Artifact host supplies its own `<!doctype>`/`<head>`/`<body>`. It links Google Fonts, the one external host the Artifact CSP admits, and falls back to system faces offline.

**To update the published sheet, republish `verification-sheet.artifact.html` passing `url: https://claude.ai/code/artifact/6eb96803-3639-4378-b05e-0b5b45e24c8c`** — publishing without it creates a second artifact and leaves the existing link stale.

2. **Then the canvas**, as described below.


Build order is **scorer → generator → canvas**, and it is deliberate. The canvas is the tempting starting point and the wrong one: building it first would fix the interfaces by accident rather than by design. The scaffold, the scorer and the views generator are done; the rest follows in this order.

1. **The canvas.** Snap-to-grid primitive input, then feedback rendering. It is also the renderer for `isometricView`'s output (`src/lib/geometry/isometric.ts`), which is an ORDERED back-to-front paint program, not a set of primitives: render every `IsoFace` as an opaque fill in the page background colour AND stroke it in that same colour to seal its own boundary, then render the `IsoLine`/`IsoEllipse` entries that follow it, in array order. Reordering, filtering or deduplicating the array corrupts the picture — occlusion happens entirely by later fills overdrawing earlier strokes, not by any visibility computation the renderer needs to redo.

**Views generator: DONE 2026-08-24, golden set SIGNED OFF 2026-08-26.** `src/lib/geometry/` turns a base block plus ordered subtractive operations into front/top/side views with correct hidden-line classification and analytic circular bores — see the decision log entry of the same date for what the adversarial review found. The four golden fixtures in `src/lib/geometry/fixtures/golden.ts` are all asymmetric, but only the L-block's front view is pinned by hand-derived coordinates — the other three are pinned only by asymmetry, citation, non-emptiness and run-to-run stability, all of which are mirror-invariant and therefore regression-only (see the file header in `golden.test.ts`). All four were reviewed and passed by the builder on 2026-08-26 against prior coursework; no cited source has been pulled up to confirm them independently, and three of the four could still be. `npm run verify:sheet` renders them for review. Shipping drills was gated on that sign-off, and no longer is.

**Convention details: CHECKED 2026-08-21.** Four free references agree on first- vs third-angle view placement, and the check found a real bug — the shipped table placed the side view identically under both conventions. Corrected and pinned by test. ISO 128 and ISO 5456 remain paywalled and were not consulted; the table in `src/lib/scoring/placement.ts` carries the citations and is the single place to change if a paid standard ever contradicts them.

---

## 5. The two invariants (read before designing anything)

### 5.1 Answer keys never reach the client

Anything the client can check, the client can read. There is no client-side mitigation — not obfuscation, not hashing, not encryption. A drill is split into a **public half** (isometric image, grid size, convention, prompt) and a **private half** (the answer key) which is read only inside the route handler.

**Accepted limitation:** useful feedback inherently leaks the key — enough submissions reconstruct an answer. Rate limiting bounds it. Fine for a practice tool where the only victim of cheating is the cheater; **not** fine for graded assessment, which would need a separate mode.

**The same bug class will reappear.** If drill packs are ever sold, entitlement is checked server-side at scoring time. Shipping all drills and hiding paid ones in the UI is the identical mistake in different clothes.

### 5.2 The generator must never produce a wrong answer key

A wrong key means the app confidently teaches an incorrect drawing. This is the predecessor project's provenance problem in new form: *how do you know your own data is right?*

The builder is **not** a technical drawing expert. Two layers instead of relying on that judgement:

- **Property tests** — invariants that hold for any solid (projected edges within the bounding box projection; symmetric solids give symmetric views; a through-hole gives exactly one circle and two bore-line pairs).
- **A human-verified golden set** — 8–10 parts confirmed by someone who knows the subject, stored as fixtures.

**Amended 2026-08-26.** The four parts we have were signed off by the builder's own review, checked against technical drawing coursework that predates this project — external to it, which was the property self-review was missing. This overrides the original "never rely on that judgement" wording and is recorded in `docs/decision-log.md`, along with the one failure it cannot rule out: a mirror applied consistently from `solid.ts` through `viewspec.ts` into the fixture descriptions would leave description and views agreeing with each other and both wrong. Only an external published answer separates those.

---

## 6. Gotchas

Empty for this repo so far. **Inherited from `pathway-navigator` and expected to apply** — the toolchain is deliberately the same:

- **`npm install` exits 0 while silently skipping install scripts.** npm 11 gates them behind an allowlist; the only sign is an `npm warn allow-scripts` block. *Symptom:* a tool fails bizarrely right after a "successful" install. *Fix:* `npm approve-scripts <pkg> ...`, then re-run `npm install`. Approvals are pinned to exact versions, so bumping those packages needs re-approval.
- **`tsc --noEmit` fails on a clean checkout until something has built once.** Next 16 generates `LayoutProps` / `PageProps` into `.next/types`, which `tsconfig.json` includes. *Symptom:* `TS2304: Cannot find name 'LayoutProps'`. Run `npm run build` once. Matters if CI typechecks before building.
- **`node --test` and `tsc` disagree about import extensions.** Node's native type stripping needs `./thing.ts` on relative imports in test files; `tsc` rejects that with `TS5097` unless `allowImportingTsExtensions` is set — only valid because `noEmit` is true.
- **tsx runs `.ts` files as CommonJS** unless `package.json` sets `"type": "module"`, so top-level `await` in a standalone script fails with an esbuild `TransformError`, not a Node error. Wrap script bodies in an `async main()`.
- Next.js **masks errors thrown out of a server action** in production builds. Return typed results; never throw for validation failures.

**Found in this repo:**

- **`gh` DOES reach this repo — the 2026-08-24 session log entry saying it cannot is wrong, and it cost three features their PRs.** A `GITHUB_TOKEN` env var is set deliberately for the builder's separate Hermes project, it takes precedence over `gh`'s stored keyring credentials, and it has no access to this private repo — all of that is true, and it produces `Could not resolve to a Repository`, which reads exactly like "no access" and was recorded as such. *Fix:* scope the variable out for the single command — `GITHUB_TOKEN= gh pr create ...` — and `gh` falls back to the keyring account, which has `repo` scope and full access. This is NOT the same as clearing or overriding the token: the empty assignment applies to one process, and every other process, including anything Hermes runs, still sees it. Verified 2026-08-26 with `repo view` and `pr list`. *Symptom of the belief, not the bug:* work merging straight to `main` with no PR, because the web UI is a manual step that is easy to skip — `feat/generator`, `feat/isometric` and `chore/verification-sheet-artifact` all landed that way, against §2.5. Only the scorer (PRs #1, #2) was ever reviewed as a PR.

- **`node --test` warns `MODULE_TYPELESS_PACKAGE_JSON` on every run.** `package.json` has no `"type": "module"`, so Node parses each `.test.ts` as CommonJS, fails, and reparses as ESM. *Symptom:* a noisy warning block above the test results, plus a small startup cost. Harmless — the tests pass regardless. Not fixed by setting `"type": "module"` without checking it against the Next build first, which is why it was left alone.
- **The npm 11 allow-scripts gotcha above is confirmed here**, and `allowScripts` in `package.json` pins `unrs-resolver@1.12.2` by exact version. Bumping that package needs a fresh `npm approve-scripts`.
- **An unquoted `**` glob in an npm script is expanded by the shell, not by Node, and silently drops nested test directories.** `"test": "node --test --experimental-strip-types src/lib/**/*.test.ts"` looks recursive but isn't: without `shopt -s globstar` (off by default), bash treats `**` as an ordinary `*`, which does not cross `/`. The pattern only ever reached one directory level under `src/lib` (`src/lib/<dir>/*.test.ts`). *Symptom:* a `.test.ts` file placed in a nested subdirectory (e.g. `src/lib/geometry/fixtures/golden.test.ts`) is never picked up — `npm test` keeps reporting the old test count and stays green, with no error, warning, or hint that a whole file was skipped. This is exactly how the golden fixtures (`src/lib/geometry/fixtures/golden.test.ts`) — the project's only backstop against a mirrored generator, per §5.2 — went unexecuted for a full round despite being correct and passing when invoked directly. *Fix:* single-quote the glob so the shell passes it through literally and Node's own glob support expands it recursively instead: `"test": "node --test --experimental-strip-types 'src/lib/**/*.test.ts'"`. Confirmed empirically: unquoted reports 128 tests (fixtures missing); quoted reports 132 (fixtures included). Note `node --test --experimental-strip-types src/lib` (pointing at the directory, no glob) is *not* an equivalent fix — it reports 1 test, 1 failing, not a full recursive run.
- **A mirrored view passes every property test.** Symmetry invariants stay green under a global mirror — that is what symmetry means. *Symptom:* all tests green, every drill wrong on the left/right axis. *Guard:* `src/lib/geometry/fixtures/golden.ts` parts are all asymmetric, enforced by a test, and `npm run verify:sheet` renders them for human review. If view geometry ever looks wrong, suspect the signs in `viewspec.ts` first.
- **A property test can pass while the property it claims to guard is entirely absent from the code.** An adversarial reviewer injected eight deliberate bugs into the generator and re-ran `properties.test.ts`; five of eight still passed. Two concrete causes, both worth checking for in any new invariant test: (1) the assertion was computed from the same primitives it was meant to check — the original bounding-box test derived its bound from the projector's own output, so it was tautological — and (2) the test fixture happened not to exercise the property — the original "no hidden lines on a plain block" test used only solids with no hidden edges at all, so a generator with hidden-line classification deleted outright still passed it. *Symptom:* full green suite, confident in review, wrong regardless. *Fix used here:* positive controls (assert the property *fails* on a solid deliberately constructed to violate it), exact counts instead of non-strict bounds, and expected values derived independently of the code under test rather than recomputed from it.
- **Projected unit-cube hexagons do NOT tile.** A cube face projects to a hexagon of area sqrt(3); the projected lattice cell is only 1/sqrt(3). Every hexagon overlaps six neighbours, so partial occlusion between non-adjacent voxels is routine, not an edge case. *Symptom:* an isometric line drawing looks perfect on convex blocks and draws stray lines across the faces of any stepped or notched solid. This premise passed every convex test before being caught — see `isoedges.ts`'s module docblock for the design it forced (a painter's algorithm, not a voxel-granular visibility computation).
- **The isometric paint program (`isometricView`'s return value) is a paint program, not a set.** Order encodes occlusion: a later `IsoFace` fill overdraws an earlier face's strokes, and that is the entire hidden-line mechanism. *Symptom:* an isometric renders with hidden lines showing, or with edges missing, after code that sorts or dedupes the array "for tidiness". Never reorder, filter or deduplicate it — see `isoedges.ts` and `isometric.ts`. **The corollary bites in dark mode:** the fill colour must equal the actual ground beneath it *exactly*, so an isometric cannot sit on a themed surface that changes colour. *Symptom:* the picture renders as a white silhouette on a dark page, or hidden edges reappear, in the dark theme only. The verification sheet resolves this by keeping its drawing panels pure white in **both** themes and hard-coding the fill to `#fff`; the canvas needs the same treatment, or must recolour the fills to whatever it actually paints behind them.

Add project-specific gotchas here as they are found, with enough detail that the *symptom* is searchable, not just the fix.

---

## 7. Content authoring discipline

- **Never hand-write an answer key** if the generator can produce it. Hand-authored keys are the fallback for when the generator cannot express a part, not the default.
- **A drill is not published until its key is verified** — by the generator's property tests, or by a human for golden-set parts.
- **Cite the convention.** When a drill depends on a rule (hidden lines dashed, first- vs third-angle placement), the reference belongs with the drill. Same discipline as provenance on a data row: a claim without a source is a guess.
- **Neither projection convention is "correct".** First-angle dominates Europe and Asia, third-angle the US and Japan. The app teaches the difference and never implies one is standard.

---

## 8. Repository map

```
├── AGENTS.md              ← you are here
├── CLAUDE.md              ← one line: points Claude Code at AGENTS.md
├── README.md              ← public-facing description
├── docs/
│   ├── decision-log.md    ← dated record of non-trivial choices + reasoning
│   └── superpowers/specs/ ← the approved design spec
└── src/
    ├── app/               ← Next.js App Router; the scoring route handler
    ├── lib/
    │   ├── scoring/       ← PURE. set diff, view resolution, verdicts
    │   └── geometry/      ← PURE. features → projected views
    ├── components/        ← the canvas
    └── drills/            ← public halves + private keys, files not a database
```

**Keep `src/lib/` pure and free of I/O.** This is what made mutation testing tractable in `campus-marketplace` and unit testing trivial in `pathway-navigator`. Same pattern applies here, and it is what lets the scorer be tested without a browser.

---

## 9. Session log

Append a short entry per working session. Newest at the bottom.

| Date | Who | What changed |
|---|---|---|
| 2026-08-20 | Claude (Claude Code) | Project chosen and designed after `pathway-navigator` was discontinued. Competitor gap verified before designing. Spec written, self-reviewed (three fixes), then revised to add cylindrical through-holes via feature-based modelling. Repo initialised; no code yet. |
| 2026-08-20 | Claude (Claude Code) | Scaffolded Next 16 + `node --test`. Built the pure scorer: primitives, clustering, translation-invariant comparison, content-based view assignment, placement against a convention table. 36 tests. Created the GitHub repo (`adamafzainizam/orthodrill`, **private**) — the project had none until now; PR #1 opened. |
| 2026-08-21 | Claude (Claude Code) | Ran the convention premise check before starting the generator. Four free references agree, and they disagreed with our code: the table placed the side view to the right under BOTH conventions, so first-angle was wrong. Fixed, cited in-source, pinned by three new tests (39 total). Pushed to PR #1. |
| 2026-08-24 | Claude (Claude Code) | Built the views generator: solid model, occupancy grid (box ops only — cylinders never enter it), edge extraction with near-to-far visibility walking, collinear merging, analytic circular bores, view composition, `validateSolid` rejecting what v1 cannot model. Adversarial review found and fixed an asymmetric bore-occlusion bug (one sampled column instead of two), and found that five of eight injected bugs slipped past the original property suite, which is now rebuilt with positive controls and exact counts. Golden fixtures fixed twice over — an unquoted glob meant they never ran, and once running, all four were mirror-invariant — now four asymmetric parts, with the L-block's front view additionally pinned by hand-derived coordinates. 133 tests. All four golden parts remain UNVERIFIED; `npm run verify:sheet` renders them for the sign-off §5.2 requires before publishing. |
| 2026-08-24 | Claude (Claude Code) | Applied the fix wave from a final whole-branch review. Two blockers: coincident lattice-edge/bore-silhouette primitives were both emitted with no precedence, so `compare.ts`'s last-write-wins keying let a hidden bore entry override a visible face edge at the same position (fixed by deduplicating on `positionKey` with visible > hidden > centre precedence, in `buildView`); and `validateSolid` never checked a cylinder against the base block itself, so a hole overhanging a face or sitting entirely outside the block was silently accepted (fixed, tangency kept legal). Folded in a third check: a fully-subtracted solid now throws instead of producing three empty "perfect" views. Added the coverage gap the review named — a bore-exposure test under `nearIsLow: false` in the TOP view specifically. Recorded the `CENTRE_OVERSHOOT`/bounding-box-normalisation interaction as an open seam for the canvas to resolve, not fixed here. Corrected this file's overstatement about which golden fixtures are coordinate-pinned versus asymmetry-pinned only. 141 tests, lint and typecheck clean. |
| 2026-08-24 | Claude (Claude Code) | Merged `feat/generator` to `main` (7478804) and pushed; branch deleted. PR #2 auto-closed when its commits landed on `main`. **Note for future sessions: `gh` cannot reach this repo, and that is expected, not a fault to fix.** A `GITHUB_TOKEN` env var is set deliberately for the builder's separate Hermes research project and takes precedence over `gh`'s stored credentials; it has no access to this private repo. Git over SSH works normally, so use `git` for anything scriptable and the web UI for PR/issue operations. Do not clear or override that token. The stale `feat/scorer` branch was deleted on 2026-08-26 once confirmed fully merged. The four golden parts remain **UNVERIFIED** — run `npm run verify:sheet` and have someone who knows drafting check it before any drill ships. |
| 2026-08-24 | Claude (Claude Code) | Built the isometric prompt image: projection basis, then a hidden-line design (visibility by walking the lattice diagonal (1,-1,1), face cancellation, collinear merging) that turned out to be wrong — projected unit-cube hexagons don't tile, so a voxel-granular visibility boundary can't express the true silhouette on a stepped or notched solid — and was replaced mid-implementation with a painter's algorithm: fills and strokes ordered by the diagonal depth key `x - y + z`, with occlusion by overdraw rather than by computed visibility (`isVisible` survives only as a cull for wholly hidden voxels). Collinear merging across faces was deliberately dropped, not kept — merging a run would attach it to the farthest of several coplanar faces, and nearer fills would then paint over part of the outline. Analytic bore ellipse at the textbook root-three ratio, interleaved into the paint program by depth. Its primitives use a distinct discriminant from the scorer's, so the compiler enforces the public/private split. Verification sheet now renders the pictorial beside the three views. |
| 2026-08-26 | Claude (Claude Code) | Applied the fix wave from a final whole-branch review of the isometric prompt. Blocker: shared creases (edges between two differently-oriented faces) were drawn by the FIRST face to claim them in paint order, which under farthest-first sorting is the farther of the two — so the nearer face's later fill repainted its own half of the stroke, leaving 14 of 45 strokes on the L-block at half line weight. Fixed in `isoedges.ts` by precomputing the last (nearest) owning face index per edge and emitting only from that index, replacing the first-wins `drawn` Set; half-covered strokes now 0 of 45. Corrected this file's session log and Done list, which had credited the discarded diagonal-walk/collinear-merging design as what shipped — the actual mechanism is the painter's algorithm above. Added the paint-program order contract to `isometric.ts`'s docblock and to §4/§6 below. Thinned the verification sheet's fill-seal stroke from 1px to 0.3px so it stops biting into adjacent 2px ink strokes. Reworded `isoproject.ts`'s `VIEW_STEP` comment: its length is sqrt(3), so it is the minimal invariant lattice step, not "the unit" step. 189 tests, lint and typecheck clean. |
| 2026-08-26 | Claude (Claude Code) | Merged `feat/isometric` to `main` (4529573) and pushed; branch deleted. 190 tests, lint/typecheck/build clean. **Both generators are now done and the canvas is the only thing left before drills can ship.** |
| 2026-08-26 | Claude (Claude Code) | Took the golden-set sheet from "a file that exists" to "a document sent to a reviewer", which is what §5.2's sign-off actually needs. Read it as the drafting reviewer instead of as its author and found the gap: it never said where the observer stands for each view, which is the one fact needed to judge handedness — the exact failure the sheet exists to catch. Added the four viewing directions, an explicit note that sheet layout (first- vs third-angle) is NOT under review, the review procedure in order with handedness first, and a request for a pass/fail per part. Added a 10&nbsp;mm grid under the orthographic views (not the isometric — opaque fills would bury it) and enlarged them from 12 to 20&nbsp;px/unit, since they had been rendering at half the pictorial's size. Redesigned the sheet and split the output into a standalone file plus a body-only file for publishing. Rendering it headlessly before publishing caught two real bugs a source read would not have: a grid-layout `li` that put every step's prose in the 2&nbsp;rem counter column, and legend swatches in true ink colours that vanished on the dark card. Published privately — **the URL is in §4 and must be reused via `url` on any re-publish, or the reviewer's link goes stale**. 190 tests, lint and typecheck clean. |
| 2026-08-26 | Claude (Claude Code) | Golden set signed off. The builder reviewed all four parts against their own secondary-school technical drawing coursework and passed them — external to this project, which was the property self-review was missing and the actual basis of the objection to it. All four flipped to `VERIFIED` with `verifiedBy` recording who, when, and what it rests on. §5.2's "never rely on that judgement" wording overridden and the override recorded in `docs/decision-log.md`, together with the residual it cannot cover: a mirror applied consistently from `solid.ts` through `viewspec.ts` into the fixture descriptions leaves description and views agreeing with each other and both wrong. Three of the four parts carry citations that were never pulled up and could still settle that; `stepped-plate-with-hole` carries none and its source text was rewritten to say so rather than contradict the status beside it. Sheet re-rendered and re-published to the same URL. **The canvas is now the only thing left.** 190 tests, lint and typecheck clean. |
| 2026-08-26 | Claude (Claude Code) | Merged `chore/verification-sheet-artifact` to `main` (d0e3ea4) and pushed; branch deleted. 190 tests, lint, typecheck and build clean. **Everything the drill needs before a student can use it is now done except the canvas.** |
| 2026-08-26 | Claude (Claude Code) | Noticed by the builder: no PR existed for this work, or for the two features before it. Root cause was a wrong belief recorded in this file on 2026-08-24 — that `gh` cannot reach the repo. It can: `GITHUB_TOKEN= gh <cmd>` scopes the Hermes token out for one process and `gh` falls back to the keyring account, which has full access. Corrected in §6. No PR could be opened retroactively for the merged work — its commits are already ancestors of `main`, so a PR would have an empty diff. §2.5's PR step applies from the canvas onward. |
