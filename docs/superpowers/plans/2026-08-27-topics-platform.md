# Topics Platform — Implementation Plan

**Goal:** Turn the orthographic drill into a topic-based technical drawing platform, and prove the abstraction by shipping a second topic that shares nothing with the first.

**Spec:** `docs/superpowers/specs/2026-08-27-topics-platform-design.md`

## Global constraints

- `src/lib/` stays pure. No new npm dependencies. No AI attribution in commits.
- `npm test && npm run lint && npm run typecheck && npm run build` clean before every commit; lint at ZERO problems.
- Keys are derived, never hand-written. A topic without a generator does not ship.
- Never import `drills/`, `topics/registry`, `server/`, `geometry/views`, `geometry/solid`, `scoring/score` or `scoring/assign` from a client component. `src/drills/isolation.test.ts` scans every file.
- Answer keys never reach the client. Anything holding or deriving an answer stays server-side.

---

### Task 1 — the topic model, and orthographic moved into it

**Files:** create `src/topics/topics.ts` (PUBLIC — hints and titles, safe for the client) and `src/topics/topics.test.ts`; modify `src/drills/registry.ts`.

A topic owns its title, blurb, and the hints its sidebar shows. Hints are authored prose — the one place hand-authoring is right, because a hint is a teaching judgement rather than a derivable fact.

```ts
export type TopicId = "orthographic" | "parabola";
export type Hint = { title: string; body: string };
export type Topic = { id: TopicId; title: string; blurb: string; hints: Hint[] };
export function getTopic(id: string): Topic | null;   // Map lookup, no path
export const TOPIC_IDS: readonly TopicId[];
```

Author 4–6 hints for `orthographic` covering what a student actually gets wrong: hidden lines dashed, centre lines on circular features, first- versus third-angle placement, and that the three views must line up.

Every exercise gains `topicId`. The existing four drills become `topicId: "orthographic"`.

**Tests:** every topic id resolves; an unknown or inherited name (`__proto__`, `constructor`) resolves to null; every topic has at least one hint; every exercise's `topicId` resolves to a real topic.

**Watch for:** `src/topics/` is a new directory. Confirm the reported test count RISES — this repo has twice shipped test files that silently never ran.

---

### Task 2 — `scoreFigure`, the single-figure scoring mode

**Files:** modify `src/lib/scoring/score.ts`, `src/lib/scoring/score.test.ts`, `src/server/score.ts`, `src/server/score.test.ts`.

A construction is ONE figure. There is nothing to cluster and no placement to judge.

- Rename today's `scoreAttempt` to `scoreViews`. Keep the behaviour identical.
- Add `scoreFigure(attempt, key)` returning `{ ok: true; diff: ViewDiff; perfect: boolean }`. It calls the existing `compareView` — that is where the set-diff lives and it needs NO change.
- `scoreFigure` must strip `construction` primitives exactly as `scoreViews` does. Factor that strip into one shared helper so the two can never diverge; a construction line affecting a verdict is the bug this project already fixed once.
- `handleScoreRequest` dispatches on the exercise's mode, and rejects a request whose `kind` does not match the exercise's mode with `BAD_KIND`.

**Tests:** a figure matching its key is perfect; a missing primitive appears in `missing`; an extra one in `extra`; construction lines never affect a figure verdict; submitting `kind: "figure"` to a views exercise is refused, and vice versa.

---

### Task 3 — the parabola generator

**Files:** create `src/lib/geometry/parabola.ts` and `src/lib/geometry/parabola.test.ts`.

The rectangle method. Given `n`, the enclosing rectangle is `2n` wide and `n²` tall; half-width and height are each divided into `n` parts; the parabola passes through `(k, k²)` for `k = -n … n`.

**This is lattice-exact by construction, which is why it was chosen** — see the spec §2. Do not generalise it to arbitrary rectangles without re-running that check; most choices put the points off the grid and the answer becomes undrawable.

The key is the curve: segments joining consecutive points. **Construction lines are NOT part of the key** — the student draws them as `construction` type and the scorer ignores them, which is what makes the graded answer a definite set rather than a matter of style.

```ts
export type ParabolaSpec = { n: number; originX: number; originY: number };
export function parabolaKey(spec: ParabolaSpec): Primitive[];
export function parabolaBounds(spec: ParabolaSpec): { width: number; height: number };
```

`originX`/`originY` place the apex on the sheet. Y increases DOWNWARD on the sheet, so a parabola opening upward has its arms at decreasing y — get this right and pin it with a test, because a vertically mirrored parabola is self-consistent and wrong, the same failure class as a mirrored view.

**Tests:** every point is integral; the curve passes through the expected `(k, k²)` positions derived independently of the implementation, not recomputed the way the module does; the figure is symmetric about the apex; the apex is the lowest point of the curve on screen; the whole figure fits inside the 48×40 sheet for the `n` values shipped; output is deterministic.

---

### Task 4 — the sidebar, topic pages, and the parabola exercise end to end

**Files:** create `src/components/Sidebar.tsx`, `src/app/topics/page.tsx`, `src/app/topics/[id]/page.tsx`; modify `src/components/Editor.tsx`, `src/app/drills/[id]/page.tsx`, `src/drills/registry.ts`, `src/lib/canvas/submit.ts`.

- `Sidebar` renders the topic's hints beside the drawing. Collapsible; it must not crowd the sheet on a narrow viewport.
- A topics index, and a page per topic listing its exercises.
- The public half gains the topic's id, title and hints — **and nothing that narrows the answer for the exercise on screen.** A hint that only makes sense for one exercise belongs in that exercise's prompt instead.
- One parabola exercise, wired end to end, submitting `kind: "figure"`.
- Reserved ad slots stay on menu pages only, never on an exercise page.

**Tests:** the public half of a figure exercise leaks no key and no spec that trivially yields one; `isolation.test.ts` still passes with its positive controls intact.

**Verify by running it**: build, start the server, and check both an orthographic exercise and the parabola exercise render, that the sidebar shows the right hints for each, and that the served HTML carries no answer key.
