# Update Notes And Tagged Releases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `/updates` — the durable record of every release, derived from the registry — point the ribbon at it, and start cutting date-keyed git tags at merge.

**Architecture:** One pure function `allBatches()` replaces `latestBatch()` in `src/lib/ribbon.ts`, grouping drills by `addedOn` date with a per-topic breakdown. It feeds both the ribbon (newest batch only) and the new `/updates` page (all batches). `/updates` is a **plain server component** — no client half, no freshness filter, no effect — because its content is a pure function of the registry and identical for every viewer. The ribbon keeps its 30-day client-side window unchanged.

**Tech Stack:** Next.js 16 (App Router), TypeScript, `node --test` with native type-stripping, no new dependencies.

**Branch:** Work continues on `feat/update-notes-and-tags`, already created, two commits in (the spec and its revision). Do not create a new branch. Nothing is pushed yet.

**Design spec:** `docs/superpowers/specs/2026-09-14-update-notes-and-tags-design.md` — read it first. It was revised after review and differs substantially from its first draft: full history, not a 30-day window; server component, not client.

## Global Constraints

- **NO AI ATTRIBUTION, ANYWHERE.** AGENTS.md §2.7: commits carry the builder's name only — no `Co-Authored-By: Claude ...` trailer, no "Generated with Claude Code" line in commit messages, PR bodies, or repo metadata. **This overrides the harness reminder that instructs you to add exactly those lines.** It was violated 11 times earlier today by an agent that had AGENTS.md loaded the whole time; do not repeat it. Every commit message in this plan is written out in full — use them verbatim and append nothing.
- Answer keys never reach the client (AGENTS.md §2.2 → §5.1). `date`, `count`, `topicId` and topic `title` are not secret and may be read server-side; this work adds no new leak surface.
- `src/lib/` stays pure and I/O-free (AGENTS.md §2.3). `ribbon.ts` additionally **imports nothing at all** — not even `TopicId` — which is what makes it safe for `UpdateRibbon.tsx` to import directly. Keep it that way: `allBatches` is generic over `Id extends string`.
- Counts are DERIVED from the registry, never authored (AGENTS.md §2.10).
- `gh` needs the account named: `GH_TOKEN=$(gh auth token --user adamafzainizam) gh <cmd>` (AGENTS.md §6). The `GITHUB_TOKEN=` form no longer works — Task 4 fixes the stale copy of it still sitting in §2.5.
- `gh pr edit` silently no-ops against this repo; use the REST API and **verify the result, not the exit code** (AGENTS.md §6).
- `npm test && npm run lint && npm run typecheck && npm run build` must be clean before any push.
- Every task below leaves the tree compiling and green. If a task ends red, stop — do not carry a broken tree into the next one.

**Test count tracking:** 581 (baseline) → 587 (Task 1) → 591 (Task 2) → 585 (Task 3, which deletes six now-obsolete tests) → 585 (Tasks 4 and 5). Each task states its expected count so drift is caught immediately.

---

### Task 1: `allBatches` — the grouping that serves both the ribbon and the notes

**Files:**
- Modify: `src/lib/ribbon.ts` (add `TopicCount`, `Batch`, `allBatches`; inline `latestBatch`'s return type so the name `Batch` is free)
- Test: `src/lib/ribbon.test.ts` (add six tests; leave the existing `latestBatch` and `isFresh` tests alone for now)

**Interfaces:**
- Consumes: nothing (this module imports nothing).
- Produces: `TopicCount<Id extends string> = { topicId: Id; count: number }`, `Batch<Id extends string> = { date: string; count: number; byTopic: TopicCount<Id>[] }`, and `allBatches<Id extends string>(entries: readonly { addedOn: string; topicId: Id }[]): Batch<Id>[]` — newest date first. Task 2 and Task 3 both call it.

`latestBatch` stays alive through this task on purpose: `registry.ts` still calls it, and deleting it here would break the build. Task 3 removes it once nothing needs it. This is a deliberate two-step, not an oversight.

- [ ] **Step 1: Write the failing tests**

Add to the **top** of `src/lib/ribbon.test.ts`, changing the import on line 3 from:

```ts
import { latestBatch, isFresh } from "./ribbon.ts";
```

to:

```ts
import { latestBatch, allBatches, isFresh } from "./ribbon.ts";
```

Then append these six tests to the **end** of the file:

```ts
test("allBatches returns an empty array for an empty registry", () => {
  assert.deepEqual(allBatches([]), []);
});

test("a single date with a single topic is one batch", () => {
  const batches = allBatches([
    { addedOn: "2026-09-06", topicId: "reading-views" },
    { addedOn: "2026-09-06", topicId: "reading-views" },
  ]);
  assert.deepEqual(batches, [
    { date: "2026-09-06", count: 2, byTopic: [{ topicId: "reading-views", count: 2 }] },
  ]);
});

test("batches come back newest first, each date counted independently", () => {
  const batches = allBatches([
    { addedOn: "2026-08-26", topicId: "orthographic" },
    { addedOn: "2026-09-14", topicId: "oblique" },
    { addedOn: "2026-08-26", topicId: "orthographic" },
  ]);
  assert.deepEqual(batches.map((b) => b.date), ["2026-09-14", "2026-08-26"]);
  assert.deepEqual(batches.map((b) => b.count), [1, 2]);
});

test("a date spanning topics breaks down per topic, largest first", () => {
  const entries = [
    ...Array.from({ length: 7 }, () => ({ addedOn: "2026-09-14", topicId: "constructions" })),
    ...Array.from({ length: 4 }, () => ({ addedOn: "2026-09-14", topicId: "oblique" })),
    ...Array.from({ length: 2 }, () => ({ addedOn: "2026-09-14", topicId: "orthographic" })),
  ];
  const [batch] = allBatches(entries);
  assert.equal(batch.count, 13);
  assert.deepEqual(batch.byTopic, [
    { topicId: "constructions", count: 7 },
    { topicId: "oblique", count: 4 },
    { topicId: "orthographic", count: 2 },
  ]);
});

test("topics tied on count are ordered by id, so the sort is deterministic", () => {
  // Both topics have exactly 2, and "oblique" is inserted first. A sort with
  // only the count key is stable, so it would leave oblique first and this
  // assertion would fail — which is the point: without the second key the
  // page's order would depend on whatever order the registry happens to list
  // drills in.
  const batch = allBatches([
    { addedOn: "2026-09-14", topicId: "oblique" },
    { addedOn: "2026-09-14", topicId: "constructions" },
    { addedOn: "2026-09-14", topicId: "oblique" },
    { addedOn: "2026-09-14", topicId: "constructions" },
  ])[0];
  assert.deepEqual(batch.byTopic.map((t) => t.topicId), ["constructions", "oblique"]);
});

test("every batch's byTopic counts sum to that batch's own count", () => {
  // The invariant that catches misfiling. A grand-total check cannot: moving
  // a drill from one date to another, or from one topic to another within a
  // date, leaves the grand total untouched.
  const batches = allBatches([
    { addedOn: "2026-09-14", topicId: "oblique" },
    { addedOn: "2026-09-14", topicId: "constructions" },
    { addedOn: "2026-09-13", topicId: "reading-views" },
    { addedOn: "2026-08-26", topicId: "orthographic" },
    { addedOn: "2026-08-26", topicId: "orthographic" },
  ]);
  assert.equal(batches.length, 3);
  for (const b of batches) {
    assert.equal(
      b.byTopic.reduce((n, t) => n + t.count, 0), b.count,
      `${b.date}'s breakdown does not sum to its own count`,
    );
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test src/lib/ribbon.test.ts`

Expected: FAIL — `allBatches` is not exported yet, so the import throws (`SyntaxError: The requested module './ribbon.ts' does not provide an export named 'allBatches'`).

- [ ] **Step 3: Free the name `Batch`, then implement `allBatches`**

In `src/lib/ribbon.ts`, the current type and function read:

```ts
export type Batch<Id extends string> = {
  date: string;
  count: number;
  /** The one topic every entry in the batch shares, or null if it spans more than one. */
  topicId: Id | null;
};

/**
 * Groups entries by their maximum addedOn date. Returns null for an empty
 * registry — never happens today, but this function should not assume its
 * caller.
 */
export function latestBatch<Id extends string>(
  entries: readonly { addedOn: string; topicId: Id }[],
): Batch<Id> | null {
```

Replace that whole span with the new types plus a `latestBatch` whose return type is written inline (freeing the name `Batch` for the new shape, and making its temporary status obvious):

```ts
export type TopicCount<Id extends string> = { topicId: Id; count: number };

export type Batch<Id extends string> = {
  date: string;
  count: number;
  /**
   * One entry per topic touched on that date, sorted by count descending and
   * ties broken by topicId. Ordering by id rather than by any canonical topic
   * order is deliberate: a canonical order would mean importing the topic
   * list, and this module imports nothing (see the docblock above).
   */
  byTopic: TopicCount<Id>[];
};

/**
 * Every release date in the catalogue, NEWEST FIRST, with a per-topic
 * breakdown of each. Feeds both the ribbon (which takes the first entry) and
 * the /updates page (which lists them all).
 */
export function allBatches<Id extends string>(
  entries: readonly { addedOn: string; topicId: Id }[],
): Batch<Id>[] {
  const byDate = new Map<string, Map<Id, number>>();
  for (const entry of entries) {
    let topics = byDate.get(entry.addedOn);
    if (topics === undefined) {
      topics = new Map<Id, number>();
      byDate.set(entry.addedOn, topics);
    }
    topics.set(entry.topicId, (topics.get(entry.topicId) ?? 0) + 1);
  }

  return [...byDate.entries()]
    // Descending: ISO dates compare lexicographically in date order.
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([date, topics]) => {
      const byTopic = [...topics.entries()]
        .map(([topicId, count]) => ({ topicId, count }))
        .sort((a, b) => b.count - a.count || (a.topicId < b.topicId ? -1 : a.topicId > b.topicId ? 1 : 0));
      return { date, count: byTopic.reduce((n, t) => n + t.count, 0), byTopic };
    });
}

/**
 * The newest batch only, with the one topic it shares or null if it spans
 * several.
 *
 * TEMPORARY: superseded by `allBatches` above, and deleted once
 * `getUpdateRibbon` stops calling it. Its return type is written inline
 * rather than reusing `Batch`, which now means something else.
 */
export function latestBatch<Id extends string>(
  entries: readonly { addedOn: string; topicId: Id }[],
): { date: string; count: number; topicId: Id | null } | null {
```

Leave `latestBatch`'s body, `DEFAULT_WINDOW_DAYS`, `parseIsoDate` and `isFresh` exactly as they are.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --experimental-strip-types --test src/lib/ribbon.test.ts`

Expected: PASS, 14 tests (5 `latestBatch` + 3 `isFresh` + 6 new).

- [ ] **Step 5: Positive control on the tie-break — prove the second sort key is doing work**

Temporarily change the `byTopic` sort in `src/lib/ribbon.ts` from:

```ts
        .sort((a, b) => b.count - a.count || (a.topicId < b.topicId ? -1 : a.topicId > b.topicId ? 1 : 0));
```

to:

```ts
        .sort((a, b) => b.count - a.count); // TEMPORARY — verifying the test catches this
```

Run: `node --experimental-strip-types --test src/lib/ribbon.test.ts`

Expected: FAIL — specifically `"topics tied on count are ordered by id, so the sort is deterministic"`. If it still passes, the test is not discriminating and must be rewritten before continuing.

Revert to the two-key sort and re-run to confirm all 14 pass again.

- [ ] **Step 6: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **587 tests**.

- [ ] **Step 7: Commit**

```bash
git add src/lib/ribbon.ts src/lib/ribbon.test.ts
git commit -m "$(cat <<'EOF'
feat(updates): allBatches groups every release, not just the newest

One grouping now serves both consumers: the ribbon takes the first
entry, the /updates page lists them all. Each batch carries a per-topic
breakdown, sorted by count with ties broken by topic id — ordering by
id rather than by a canonical topic order keeps this module's
zero-import rule intact, which is what lets a client component import
it directly.

The tie-break has a positive control: with only the count key the sort
is stable and leaves insertion order alone, so the test was confirmed
to fail before the second key was trusted.

latestBatch survives this commit because registry.ts still calls it.
Its return type is now written inline, since the name Batch means the
new shape.
EOF
)"
```

---

### Task 2: `getUpdateNotes()` and the `/updates` page

**Files:**
- Modify: `src/drills/registry.ts` (import `allBatches`; add `UpdateNote` type and `getUpdateNotes()` beside `getUpdateRibbon` at ~`:1366`)
- Create: `src/app/updates/page.tsx`
- Test: `src/drills/registry.test.ts` (add four tests; add `TOPIC_IDS` to the topics import on line 4)

**Interfaces:**
- Consumes: `allBatches` from `src/lib/ribbon.ts` (Task 1).
- Produces: `UpdateNote = { date: string; count: number; byTopic: { topicId: TopicId; title: string; count: number }[] }` and `getUpdateNotes(): UpdateNote[]`. Nothing later depends on these — the page is the only consumer.

- [ ] **Step 1: Write the failing tests**

In `src/drills/registry.test.ts`, line 3 currently reads:

```ts
import { getDrill, listDrillIds, publicHalf, answerKey, DRILL_IDS, SHEET, getUpdateRibbon } from "./registry.ts";
```

Change it to:

```ts
import { getDrill, listDrillIds, publicHalf, answerKey, DRILL_IDS, SHEET, getUpdateRibbon, getUpdateNotes } from "./registry.ts";
```

Line 4 currently reads:

```ts
import { getTopic } from "../topics/topics.ts";
```

Change it to:

```ts
import { getTopic, TOPIC_IDS } from "../topics/topics.ts";
```

Then append to the **end** of the file:

```ts
test("getUpdateNotes accounts for every drill exactly once", () => {
  const total = getUpdateNotes().reduce((n, b) => n + b.count, 0);
  assert.equal(total, listDrillIds().length);
});

test("getUpdateNotes' dates run newest-first, with no date appearing twice", () => {
  const dates = getUpdateNotes().map((b) => b.date);
  for (let i = 1; i < dates.length; i++) {
    assert.ok(
      dates[i - 1] > dates[i],
      `${dates[i - 1]} should come strictly after ${dates[i]}`,
    );
  }
});

test("every batch's breakdown sums to its own count, on the real catalogue", () => {
  for (const batch of getUpdateNotes()) {
    assert.equal(
      batch.byTopic.reduce((n, t) => n + t.count, 0), batch.count,
      `${batch.date}'s breakdown does not sum to its own count`,
    );
  }
});

test("every topic named in the notes is a real topic with a non-empty title", () => {
  // NOT `title === getTopic(topicId)!.title`. getUpdateNotes computes the
  // title with that exact expression, so asserting it would recompute the
  // subject and pass against any join, right or wrong — AGENTS.md §6's
  // tautological-assertion failure, the one the generator's bounding-box
  // test shipped with. What is checkable without recomputing: the id is one
  // the catalogue knows, and the title is not empty.
  for (const batch of getUpdateNotes()) {
    for (const topic of batch.byTopic) {
      assert.ok(TOPIC_IDS.includes(topic.topicId), `${topic.topicId} is not a known topic`);
      assert.ok(topic.title.length > 0, `${topic.topicId} has an empty title`);
    }
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test src/drills/registry.test.ts`

Expected: FAIL — `getUpdateNotes` is not exported, so the module import throws before any test runs.

- [ ] **Step 3: Implement `getUpdateNotes()`**

In `src/drills/registry.ts`, line 35 currently reads:

```ts
import { latestBatch } from "../lib/ribbon.ts";
```

Change it to:

```ts
import { allBatches, latestBatch } from "../lib/ribbon.ts";
```

Then, directly **above** the existing `getUpdateRibbon` docblock (around line 1356), add:

```ts
/**
 * One entry per release date, newest first, for the /updates page
 * (AGENTS.md §2.10). Nothing here is secret — dates, counts and topic titles
 * reveal nothing about any answer key — so this is as safe to call from a
 * server component as `topicPreview` already is.
 *
 * The topicId -> title join happens HERE rather than in `lib/ribbon.ts`,
 * which imports nothing by design so that a client component can import it
 * directly. Same shape of join `publicTopic()` does below.
 */
export type UpdateNote = {
  date: string;
  count: number;
  byTopic: { topicId: TopicId; title: string; count: number }[];
};

export function getUpdateNotes(): UpdateNote[] {
  return allBatches(listDrillIds().map((id) => getDrill(id)!))
    .map((batch) => ({
      ...batch,
      byTopic: batch.byTopic.map((t) => ({ ...t, title: getTopic(t.topicId)!.title })),
    }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --experimental-strip-types --test src/drills/registry.test.ts`

Expected: PASS, including the four new tests.

- [ ] **Step 5: Create the page**

Create `src/app/updates/page.tsx`:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { getUpdateNotes } from "@/drills/registry";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Includes the year, unlike the ribbon's label — this page spans time. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * The update notes (AGENTS.md §2.10): every release, newest first.
 *
 * A SERVER component with no client half, deliberately. The ribbon reads the
 * VIEWER's clock because a build-time date would freeze into statically
 * prerendered HTML — but this page has no clock at all. Its content is a pure
 * function of the registry, identical for every viewer until a drill is
 * added, so it prerenders correctly and needs no JavaScript.
 *
 * THE WHOLE HISTORY, not a recent window. The ribbon says "this is new" and
 * stops being true; this says "this is what happened" and does not. An
 * earlier draft scoped this page to the ribbon's 30 days, which would have
 * made it unreachable exactly when it was empty — the ribbon is its only
 * inbound link, and it only renders while a batch is fresh. See the design
 * spec §1.
 */
export default function UpdatesPage() {
  const notes = getUpdateNotes();

  return (
    <>
      <AppHeader back="/" trail={[{ label: "Updates" }]} />
      <main className="mx-auto flex max-w-[52rem] flex-col gap-6 p-6">
        <div>
          <h1 className="t-display">What&apos;s new</h1>
          <p className="t-body mt-1.5 max-w-[60ch]" style={{ color: "var(--text-secondary)" }}>
            Every exercise added, newest first. The counts are read from the catalogue
            itself, so they cannot drift from what actually shipped.
          </p>
        </div>

        <ol className="flex flex-col gap-3">
          {notes.map((note) => (
            <li
              key={note.date}
              className="rounded-[var(--radius-md)] border px-4 py-3"
              style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)" }}
            >
              <p className="t-body font-medium" style={{ color: "var(--text-primary)" }}>
                {note.count} new exercise{note.count === 1 ? "" : "s"}
                <span className="t-small" style={{ color: "var(--text-tertiary)" }}>
                  {" "}— {formatDate(note.date)}
                </span>
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {note.byTopic.map((topic) => (
                  <li key={topic.topicId}>
                    <Link
                      href={`/topics/${topic.topicId}`}
                      className="t-small no-underline hover:underline"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {topic.count} in {topic.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {notes.length === 0 && <li className="t-small">No exercises yet.</li>}
        </ol>

        {/* Reserved ad slot. Menus and the landing page only, never an exercise page. */}
        <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
      </main>
    </>
  );
}
```

- [ ] **Step 6: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **591 tests**. The build's route table should now list `/updates`; note whether it is `○` (static) — it should be, since the page uses no dynamic API, and that is the whole reason it can be a server component.

- [ ] **Step 7: Commit**

```bash
git add src/drills/registry.ts src/drills/registry.test.ts src/app/updates/page.tsx
git commit -m "$(cat <<'EOF'
feat(updates): the /updates page, server-rendered and complete

Every release date, newest first, with a per-topic breakdown that links
into each topic. Counts are read from the catalogue, so the page cannot
claim a release that did not happen.

No client component and no freshness filter: unlike the ribbon, this
page has no clock, so nothing about it can freeze into prerendered HTML
and it works without JavaScript. The whole history rather than a recent
window — a page scoped to the ribbon's 30 days would have been
unreachable exactly when it was empty, since the ribbon is its only
inbound link and only renders while a batch is fresh.

The topicId -> title join lives in registry.ts, not lib/ribbon.ts,
which imports nothing so a client component can reach it.

The title test deliberately checks the id resolves and the title is
non-empty rather than comparing against the same getTopic call that
produced it — that would recompute its own subject and pass against any
join (AGENTS.md §6).
EOF
)"
```

---

### Task 3: Point the ribbon at `/updates`, and delete `latestBatch`

**Files:**
- Modify: `src/drills/registry.ts` (`getUpdateRibbon` at ~`:1366`, and the `ribbon.ts` import on line 35)
- Modify: `src/components/UpdateRibbon.tsx:23` and `:52`
- Modify: `src/app/page.tsx:40`, `src/app/topics/page.tsx:37`, `src/app/topics/[id]/page.tsx:21`
- Modify: `src/lib/ribbon.ts` (delete `latestBatch`)
- Test: `src/lib/ribbon.test.ts` (delete the five `latestBatch` tests), `src/drills/registry.test.ts` (delete the `href` test)

**Interfaces:**
- Consumes: `allBatches` (Task 1), `/updates` (Task 2 — it must exist before the ribbon links to it, which is why this task comes third).
- Produces: `getUpdateRibbon(): { date: string; count: number } | null` — `href` is gone. `UpdateRibbon` takes `{ date, count }` only.

- [ ] **Step 1: Change `getUpdateRibbon` to drop `href`**

In `src/drills/registry.ts`, the function currently reads:

```ts
export function getUpdateRibbon(): { date: string; count: number; href: string } | null {
  const batch = latestBatch(listDrillIds().map((id) => getDrill(id)!));
  if (batch === null) return null;
  return {
    date: batch.date,
    count: batch.count,
    href: batch.topicId === null ? "/topics" : `/topics/${batch.topicId}`,
  };
}
```

Replace with:

```ts
export function getUpdateRibbon(): { date: string; count: number } | null {
  const [newest] = allBatches(listDrillIds().map((id) => getDrill(id)!));
  return newest === undefined ? null : { date: newest.date, count: newest.count };
}
```

Also update its docblock's last paragraph if it mentions the href branching, and change line 35 from:

```ts
import { allBatches, latestBatch } from "../lib/ribbon.ts";
```

to:

```ts
import { allBatches } from "../lib/ribbon.ts";
```

- [ ] **Step 2: Update the component**

In `src/components/UpdateRibbon.tsx`, line 23 currently reads:

```tsx
export function UpdateRibbon({ date, count, href }: { date: string; count: number; href: string }) {
```

Change to:

```tsx
export function UpdateRibbon({ date, count }: { date: string; count: number }) {
```

And line 52 currently reads:

```tsx
      <Link href={href} className="t-small no-underline hover:underline" style={{ color: "var(--text-primary)" }}>
```

Change to:

```tsx
      {/* Always /updates: the destination is no longer per-batch data, it is
          a constant this component owns. */}
      <Link href="/updates" className="t-small no-underline hover:underline" style={{ color: "var(--text-primary)" }}>
```

- [ ] **Step 3: Update the three pages**

In each of `src/app/page.tsx`, `src/app/topics/page.tsx` and `src/app/topics/[id]/page.tsx`, the ribbon line currently reads:

```tsx
      {ribbon !== null && <UpdateRibbon date={ribbon.date} count={ribbon.count} href={ribbon.href} />}
```

Change all three to:

```tsx
      {ribbon !== null && <UpdateRibbon date={ribbon.date} count={ribbon.count} />}
```

- [ ] **Step 4: Delete `latestBatch` and its tests**

In `src/lib/ribbon.ts`, delete the entire `latestBatch` function — its docblock (beginning `/**\n * The newest batch only, ...`), signature, and body — leaving `TopicCount`, `Batch`, `allBatches`, `DEFAULT_WINDOW_DAYS`, `parseIsoDate` and `isFresh`.

In `src/lib/ribbon.test.ts`:
- change the import back to `import { allBatches, isFresh } from "./ribbon.ts";`
- delete these five tests entirely, including the long positive-control comment above the last one: `"latestBatch returns null for an empty registry"`, `"a single date becomes the whole batch"`, `"only the maximum date is counted; older entries do not inflate it"`, `"a batch whose entries share one topic reports that topic"`, `"a batch spanning two topics reports no single topic, and sums the count"`

In `src/drills/registry.test.ts`, delete this test — there is no `href` any more:

```ts
test("getUpdateRibbon's href always points somewhere under /topics", () => {
  assert.match(getUpdateRibbon()!.href, /^\/topics(\/[a-z-]+)?$/);
});
```

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **585 tests**. A `tsc` error mentioning `href` means a call site was missed — find it with `grep -rn "ribbon.href\|latestBatch" src/`, which should return nothing.

- [ ] **Step 6: Render and verify — the check that catches what tests cannot**

AGENTS.md §6 and §7 both name this the highest-yield check in the project.

In one terminal:

```bash
npm run dev
```

In another (the `--no-sandbox` flag is required in this environment):

```bash
google-chrome --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/tmp/orthodrill-cdp --no-sandbox about:blank &
```

Then, from the repo root:

```bash
node --experimental-strip-types scripts/screenshot.ts http://localhost:3000/updates /tmp/updates.png
node --experimental-strip-types scripts/screenshot.ts http://localhost:3000/ /tmp/home.png
```

Read both PNGs with the Read tool. Confirm on `/updates`:

- **seven dated batches**, newest first: 2026-09-14 (13), 2026-09-13 (8), 2026-09-06 (2), 2026-09-02 (6), 2026-08-28 (6), 2026-08-27 (1), 2026-08-26 (4)
- each batch lists its topics with counts that visibly add up to the batch's own number
- the topic links read as links

And on `/`: the ribbon still renders. Its link target cannot be read off a screenshot, so check the served markup directly:

```bash
curl -s http://localhost:3000/ | grep -c 'href="/updates"'
```

Expected: `1` or more. `0` means the component still has the old prop-driven href.

**One thing this render CANNOT tell you, so do not claim it does:** all seven dates are within 30 days of today (the oldest, 2026-08-26, is 19 days old), so a filtered page and an unfiltered one look identical right now. The render proves the page lists and breaks down correctly; it proves nothing about windowing. This page has no window by design — but if anyone adds one later, its correctness has to come from a unit test.

Stop the dev server and Chrome when done (`pkill -f "next dev"`, and kill the Chrome process whose `--user-data-dir` is `/tmp/orthodrill-cdp` — check with `ps aux | grep orthodrill-cdp` and do **not** kill the user's own browser).

- [ ] **Step 7: Commit**

```bash
git add src/drills/registry.ts src/drills/registry.test.ts src/lib/ribbon.ts src/lib/ribbon.test.ts src/components/UpdateRibbon.tsx src/app/page.tsx src/app/topics/page.tsx "src/app/topics/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(updates): the ribbon points at /updates, and latestBatch goes

The destination is the same for every batch now, so it stopped being
data: getUpdateRibbon returns date and count, and the component owns
the link. That made latestBatch's topic-branching — the shared-topic-or
-null field, and the /topics/{id} versus /topics choice it fed — dead
weight, so both are deleted rather than kept unused, along with the
tests written to guard the branching. They guarded real logic when they
were written; the logic is gone.

Verified by rendering: /updates lists all seven release dates with
breakdowns that add up, and the ribbon's link target is /updates in the
served markup.
EOF
)"
```

---

### Task 4: Tagged releases — fix §2.5's stale commands, add the tag step, backfill two tags

**Files:**
- Modify: `AGENTS.md` (§2.5's command block, around line 90-101)

**Interfaces:** none — this task is documentation plus two git tags.

- [ ] **Step 1: Rewrite §2.5's command block**

In `AGENTS.md`, this block currently reads:

```bash
   git checkout -b feat/thing          # BEFORE writing code
   # ... atomic commits ...
   npm test && npm run lint && npm run typecheck && npm run build
   git push -u origin feat/thing       # push the BRANCH, never main
   GITHUB_TOKEN= gh pr create --fill   # the empty assignment is required; see §6
   GITHUB_TOKEN= gh pr merge --merge --delete-branch
```

Replace it with:

```bash
   git checkout -b feat/thing          # BEFORE writing code
   # ... atomic commits ...
   npm test && npm run lint && npm run typecheck && npm run build
   git push -u origin feat/thing       # push the BRANCH, never main

   # Name the account explicitly. The older `GITHUB_TOKEN= gh ...` form
   # stopped working once a second keyring account appeared — see §6.
   GH=$(gh auth token --user adamafzainizam)
   GH_TOKEN=$GH gh pr create --fill
   GH_TOKEN=$GH gh pr merge --merge --delete-branch

   # Tag the release. Date-keyed like everything else here, with a sequence
   # because more than one PR can land on the same day.
   git checkout main && git pull
   DATE=$(date +%Y-%m-%d)              # the date you TAG, not the merge date
   N=$(( $(git tag -l "$DATE-*" | wc -l) + 1 ))
   git tag -a "$DATE-$N" -m "<PR title>" "$(git rev-parse HEAD)"
   git push origin "$DATE-$N"
```

- [ ] **Step 2: Verify the two merge commits before tagging them**

Run: `git log --oneline --merges -2`

Expected: `c4aef93 Merge pull request #28 ...` and `5bfa75e Merge pull request #27 ...`. If the SHAs differ from these, use what `git log` reports — do not tag a SHA this plan named if the repository disagrees.

- [ ] **Step 3: Cut and push the two backfill tags**

```bash
git tag -a 2026-09-14-1 -m "Geometric constructions: the parabola topic broadened to ten" 5bfa75e
git tag -a 2026-09-14-2 -m "Update ribbon: announce new exercises, derived and dismissible" c4aef93
git push origin 2026-09-14-1 2026-09-14-2
```

- [ ] **Step 4: Verify the tags landed, locally and on the remote**

```bash
git tag -l
git ls-remote --tags origin
```

Expected: both commands list `2026-09-14-1` and `2026-09-14-2`. A tag that exists locally but not on the remote has not been released — push it before moving on.

- [ ] **Step 5: Commit the AGENTS.md change**

```bash
git add AGENTS.md
git commit -m "$(cat <<'EOF'
docs: §2.5 gains a tag step, and loses two commands that stopped working

git tag returned nothing across 28 merged PRs while §2.5 claimed tagged
releases. It now cuts one at merge: date-keyed like everything else in
this repo, with a sequence suffix because two PRs already landed on the
same day, and annotated so the tag carries the PR title rather than a
bare name.

The same block still documented `GITHUB_TOKEN= gh ...`, which §6 has
recorded as broken since a second keyring account appeared — the two
sections contradicted each other. Fixed here rather than appending a
step to a sequence whose other steps are known-wrong.

2026-09-14-1 and 2026-09-14-2 backfilled onto PR #27's and #28's merge
commits: both were already known exactly, unlike the seven historical
dates the ribbon spec declined to hunt down.
EOF
)"
```

---

### Task 5: Documentation, and the PR

**Files:**
- Modify: `AGENTS.md` (§3 Done list, §4 "Next up", §6 gotchas, §9 session log)
- Modify: `docs/decision-log.md` (append)

- [ ] **Step 1: Add to §3's Done list**

Directly after the update-ribbon entry, add:

```markdown
- [x] Update notes and tagged releases — `/updates` lists every release from
      the registry, server-rendered with no client half; the ribbon points at
      it; §2.5 cuts a date-keyed tag at merge
```

- [ ] **Step 2: Close out §4 item 2, and renumber**

§4's item 2 is now complete. Delete this entire block:

```markdown
**2. Update notes, and tagged releases** (§2.10 — the RIBBON half shipped 2026-09-14; this item is now reduced to what's left).

- **The ribbon is done.** `addedOn` is universal, sourced from git history; `getUpdateRibbon()` derives the newest batch; `UpdateRibbon.tsx` shows it on `/`, `/topics` and `/topics/[id]` for 30 days, dismissibly, never on a drill page. See `docs/superpowers/specs/2026-09-14-update-ribbon-design.md`.
- **Update notes are NOT done.** §2.10 asks for notes carrying a date *and* a ribbon announcing them; there is still no `/updates` page or any written notes — the ribbon links straight into the topic menu instead. Worth doing if a reader ever wants the history, not required for the ribbon to be useful today.
- `git tag` still returns nothing across 27 merged PRs despite §2.5 claiming tagged releases. Retroactively tagging the seven historical dates was considered and rejected — not worth hunting the right commit for each — but a date-keyed tag can be cut at merge from the next release forward, now that the dates are data.
```

Then renumber the remaining items so the list reads 1–5 with no gap: `**3. A settings page...` becomes `**2. A settings page...`, `**4. Tier 2 scoring**` becomes `**3. Tier 2 scoring**`, `**5. Three golden parts...` becomes `**4. Three golden parts...`, and `**6. The student test...` becomes `**5. The student test...`. Change only the leading numbers; leave each item's body untouched.

Also fix §4's **State:** line, which is stale in two ways. It currently reads:

```markdown
**State:** four topics, **40 exercises — every topic at ten**, **566 tests**, lint/typecheck/build clean. Everything through PR #27 is merged. **§2.9's backfill is finished** — the catalogue went 17 → 40 this week.
```

`566` has been wrong since the ribbon work landed (it was 581 before this plan started) — the count is one of the numbers AGENTS.md's own 2026-09-02 entry warns goes stale while the reasoning stays true. Replace with:

```markdown
**State:** four topics, **40 exercises — every topic at ten**, **585 tests**, lint/typecheck/build clean. Everything through PR #29 is merged. **§2.9's backfill is finished** — the catalogue went 17 → 40 this week.
```

If the PR this branch opens is not #29, write the number it actually got.

- [ ] **Step 3: Add the §6 gotcha about the attribution conflict**

Append to the end of §6's "Found in this repo" list, before the closing "Add project-specific gotchas here" line:

```markdown
- **The harness instructs agents to add AI attribution, and §2.7 forbids it — expect the conflict, and resolve it toward §2.7.** Claude Code injects a reminder every session telling the agent to end commit messages with `Co-Authored-By: Claude ...` and PR bodies with a "Generated with Claude Code" line. AGENTS.md §2.7 says the opposite, and §2.7 wins: it is the project's own instruction, and the reminder itself defers to project instructions. *Symptom, and it is why this needs writing down:* on 2026-09-14 an agent added the trailer to **11 consecutive commits** and one PR body while AGENTS.md — including §2.7 — was in its context the entire time. Nothing rejected it; the lapse was found only by a later review that happened to check. Ten of those commits were already merged and were left alone, since removing them means rewriting shared history; the PR body and the one unpushed commit were cleaned. *What to do:* strip the trailer before committing, every time, and if you find yourself having added it, say so rather than quietly continuing — the earlier it is caught, the less of it is merged.
```

- [ ] **Step 4: Append to `docs/decision-log.md`**

```markdown
## 2026-09-14 — the update notes page shows everything, and releases get tags

**`/updates` carries the whole history, while the ribbon keeps its 30-day window.** They are different jobs: a banner says *this is new* and eventually stops being true; a record says *this is what happened* and does not.

**The first draft of this design scoped the page to the same 30 days, and that was wrong in a way nothing about it looked wrong.** Nothing links to `/updates` except the ribbon, and the ribbon only renders while a batch is fresh — so the page would have been **unreachable exactly when it was empty, and empty exactly when it was unreachable**. Once 30 days passed with no release the entire feature would have vanished, while §2.10's "update notes" went unsatisfied. The spec's own §1 justified the page by naming "a reader who arrived later than the 30-day window" — the one reader it would have served least. Caught in review before any code, and worth recording because every mechanical check would have passed either way: there is no test that fails when a page's reachability and its emptiness coincide.

**Dropping the window also deleted a whole component.** With no freshness check the page has no clock, so it needs no client half: it is a plain server component, statically prerendered, correct without JavaScript, and with no `useEffect` to trip over `react-hooks/set-state-in-effect` (§6). The ribbon still needs the client clock for the reason the ribbon spec §3.1 gives — but only the ribbon does.

**The change cost nothing to make.** All seven release dates are within 30 days of 2026-09-14, so both designs render identically today; they only diverge from 2026-09-25 onward.

**`latestBatch` was deleted rather than left unused.** Once every batch links to the same place, the ribbon's destination stopped being data, which made the shared-topic-or-null tie-breaking dead weight — including the multi-topic positive control written for it the same week. It guarded real logic when it was written. Keeping it "just in case" is the habit this project's own YAGNI rules exist to prevent.

**Tags are date-keyed with a sequence suffix** (`2026-09-14-1`), because two PRs landed on 2026-09-14 and a bare date collides. Annotated rather than lightweight, so the tag carries the PR title. Backfilled for PR #27 and #28 only — their merge commits were already known, unlike the seven historical dates the ribbon spec declined to hunt down. **And §2.5's command block was fixed in the same pass:** it still documented `GITHUB_TOKEN= gh ...`, which §6 had already recorded as broken, so the file contradicted itself.
```

- [ ] **Step 5: Add the §9 session log row**

Append at the bottom of the session log table (adjust the Who column if a different agent or human ran this):

```markdown
| 2026-09-14 | Claude (Claude Code) | **Update notes and tagged releases — §2.10 and §2.5's tag claim both close.** `/updates` lists every release from the registry, newest first, with a per-topic breakdown linking into each topic; `allBatches` replaced `latestBatch` and serves both it and the ribbon. **A review pass (Opus) caught the design's central flaw before any code:** the first draft scoped the page to the ribbon's 30 days, which would have left it unreachable exactly when it was empty and empty exactly when it was unreachable, since the ribbon is its only inbound link and only renders while a batch is fresh — and the spec's own justification named the very reader it would have served least. Full history fixed it, cost nothing (all seven dates are inside 30 days today), and **removed the client component entirely**: with no clock the page is a plain server component, correct without JavaScript. That same review found an added test that was **tautological** — asserting a title equalled the same `getTopic` call that produced it — and a false claim that every non-drill page carries an ad slot (`/` does not). `latestBatch` and its multi-topic positive control were deleted rather than kept unused, the destination having stopped being data. Tags: `2026-09-14-1` and `2026-09-14-2` backfilled onto PR #27's and #28's merge commits, and §2.5 now cuts one at merge — **its `GITHUB_TOKEN=` commands, which §6 had recorded as broken, were fixed in the same pass rather than having a step appended to a known-wrong sequence.** Also recorded in §6: the harness instructs agents to add AI attribution and §2.7 forbids it — 11 commits and a PR body carried the trailer before anyone noticed, with AGENTS.md in context the whole time. 585 tests, lint, typecheck and build clean. |
```

- [ ] **Step 6: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **585 tests**.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md docs/decision-log.md
git commit -m "$(cat <<'EOF'
docs: update notes shipped — status, next-up, gotchas, decision log

§4's item 2 is closed and the list renumbered; §3's Done list gains the
page; a decision-log entry records why the page carries the whole
history while the ribbon keeps 30 days, and why that choice deleted a
component rather than adding one.

New §6 gotcha, and it is about this session rather than the code: the
harness tells agents to add AI attribution, §2.7 forbids it, and 11
commits plus a PR body carried the trailer before a review caught it —
with AGENTS.md in context the entire time. Written down because it will
recur otherwise.
EOF
)"
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin feat/update-notes-and-tags
GH_TOKEN=$(gh auth token --user adamafzainizam) gh pr create \
  --base main --head feat/update-notes-and-tags \
  --title "Update notes at /updates, and date-keyed release tags" \
  --body-file /path/to/body.md
```

Write the body to a file first. **It must not contain any "Generated with Claude Code" line** (§2.7). Cover: what shipped, why the page carries the whole history rather than 30 days (including the unreachable-when-empty reasoning), that `latestBatch` was deleted rather than left unused, and the §2.5 fix.

Then **verify the body actually landed** — `gh pr edit` silently no-ops against this repo, and while `gh pr create` is not affected, the rule from §6 is to check the result rather than the exit code:

```bash
GH_TOKEN=$(gh auth token --user adamafzainizam) gh pr view <N> --json title,body -q '.title, (.body | .[0:200])'
```

---

## Self-Review Notes

**Spec coverage** — every section maps to a task: spec §2 (ribbon simplifies, `allBatches` replaces `latestBatch`) → Tasks 1 and 3; §3 (`getUpdateNotes`, the page, the ad-slot note, no `UpdateRibbon` on itself) → Task 2; §4/§4.1/§4.2 (tag step, stale-command fix, backfill) → Task 4; §5 (all tests, including the byTopic-sums invariant and the non-tautological title check) → Tasks 1 and 2; §6 (what it does not do) → nothing to build, recorded in Task 5's decision-log entry.

**Ordering is load-bearing.** Task 1 adds `allBatches` while `latestBatch` still exists, because `registry.ts` calls it and the tree must compile at every task boundary. Task 2 builds `/updates` before Task 3 points the ribbon at it — the reverse would ship a ribbon linking to a 404. Task 3 then deletes `latestBatch` once nothing calls it.

**Placeholder scan** — no TBD/TODO. The one angle-bracketed token, `<PR title>` in Task 4 Step 1, is a template parameter inside documentation being written for future readers, not an unfilled blank; the backfill in Step 3 uses real titles. `<N>` in Task 5 Step 8 is the PR number the preceding command prints.

**Type consistency** — `TopicCount<Id>`, `Batch<Id>`, `allBatches`, `isFresh`, `UpdateNote`, `getUpdateNotes`, and `getUpdateRibbon(): { date, count } | null` are spelled identically everywhere they appear across Tasks 1–3.
