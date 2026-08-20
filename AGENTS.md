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

**Phase:** scorer complete. Generator and canvas not started.

**Done:**
- [x] Candidate chosen after `pathway-navigator` was discontinued — see that repo's `docs/post-mortem.md`
- [x] Competitor gap verified *before* designing (drawing tools ≠ scored drills; teaching is human critique)
- [x] Design spec written, self-reviewed, revised twice, approved
- [x] Repository initialised
- [x] Scaffold, test harness, and the pure scoring engine — 36 tests

**Not started:** the generator, the canvas, the scoring route handler, and all drill content.

---

## 4. Next up

Build order is **scorer → generator → canvas**, and it is deliberate. The canvas is the tempting starting point and the wrong one: building it first would fix the interfaces by accident rather than by design. The scaffold and the scorer are done; the rest follows in this order.

1. **The generator.** Base block plus typed features → three views plus an isometric prompt. Verified by property tests and a human-checked golden set.
2. **The canvas.** Snap-to-grid primitive input, then feedback rendering.

**Before authoring drills:** confirm that free references agree on convention details. ISO 128 and ISO 5456 are paywalled. This is the project's cheapest premise check — if free sources contradict each other, that is much better known before twelve drills exist.

---

## 5. The two invariants (read before designing anything)

### 5.1 Answer keys never reach the client

Anything the client can check, the client can read. There is no client-side mitigation — not obfuscation, not hashing, not encryption. A drill is split into a **public half** (isometric image, grid size, convention, prompt) and a **private half** (the answer key) which is read only inside the route handler.

**Accepted limitation:** useful feedback inherently leaks the key — enough submissions reconstruct an answer. Rate limiting bounds it. Fine for a practice tool where the only victim of cheating is the cheater; **not** fine for graded assessment, which would need a separate mode.

**The same bug class will reappear.** If drill packs are ever sold, entitlement is checked server-side at scoring time. Shipping all drills and hiding paid ones in the UI is the identical mistake in different clothes.

### 5.2 The generator must never produce a wrong answer key

A wrong key means the app confidently teaches an incorrect drawing. This is the predecessor project's provenance problem in new form: *how do you know your own data is right?*

The builder is **not** a technical drawing expert. Never rely on that judgement. Two layers instead:

- **Property tests** — invariants that hold for any solid (projected edges within the bounding box projection; symmetric solids give symmetric views; a through-hole gives exactly one circle and two bore-line pairs).
- **A human-verified golden set** — 8–10 parts confirmed by someone who knows the subject, stored as fixtures.

---

## 6. Gotchas

Empty for this repo so far. **Inherited from `pathway-navigator` and expected to apply** — the toolchain is deliberately the same:

- **`npm install` exits 0 while silently skipping install scripts.** npm 11 gates them behind an allowlist; the only sign is an `npm warn allow-scripts` block. *Symptom:* a tool fails bizarrely right after a "successful" install. *Fix:* `npm approve-scripts <pkg> ...`, then re-run `npm install`. Approvals are pinned to exact versions, so bumping those packages needs re-approval.
- **`tsc --noEmit` fails on a clean checkout until something has built once.** Next 16 generates `LayoutProps` / `PageProps` into `.next/types`, which `tsconfig.json` includes. *Symptom:* `TS2304: Cannot find name 'LayoutProps'`. Run `npm run build` once. Matters if CI typechecks before building.
- **`node --test` and `tsc` disagree about import extensions.** Node's native type stripping needs `./thing.ts` on relative imports in test files; `tsc` rejects that with `TS5097` unless `allowImportingTsExtensions` is set — only valid because `noEmit` is true.
- **tsx runs `.ts` files as CommonJS** unless `package.json` sets `"type": "module"`, so top-level `await` in a standalone script fails with an esbuild `TransformError`, not a Node error. Wrap script bodies in an `async main()`.
- Next.js **masks errors thrown out of a server action** in production builds. Return typed results; never throw for validation failures.

**Found in this repo:**

- **`node --test` warns `MODULE_TYPELESS_PACKAGE_JSON` on every run.** `package.json` has no `"type": "module"`, so Node parses each `.test.ts` as CommonJS, fails, and reparses as ESM. *Symptom:* a noisy warning block above the test results, plus a small startup cost. Harmless — the tests pass regardless. Not fixed by setting `"type": "module"` without checking it against the Next build first, which is why it was left alone.
- **The npm 11 allow-scripts gotcha above is confirmed here**, and `allowScripts` in `package.json` pins `unrs-resolver@1.12.2` by exact version. Bumping that package needs a fresh `npm approve-scripts`.

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
| 2026-08-20 | Claude (Claude Code) | Scaffolded Next 16 + `node --test`. Built the pure scorer: primitives, clustering, translation-invariant comparison, content-based view assignment, placement against a convention table. 36 tests. **Conventions table still unverified against a reference.** |
