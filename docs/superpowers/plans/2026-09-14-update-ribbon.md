# Update Ribbon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every drill an `addedOn` date, derive a "N new exercises added DATE" ribbon from the registry, and show it — dismissibly, and only while it's actually recent — on the three menu/landing pages, never on a drill page.

**Architecture:** `addedOn: string` becomes a required field on all three drill types (only `BuildDrill` has it today) and is backfilled from git history. A new pure, import-free module `src/lib/ribbon.ts` groups the newest batch and decides freshness. `registry.ts` exposes the batch as `getUpdateRibbon()`, safe to call from a server component because it reveals nothing an answer key would. A client component (`UpdateRibbon.tsx`) reads the viewer's own clock to decide freshness — deliberately not the server's, because `/` and `/topics` are statically prerendered and a server-side clock would freeze at build time — and remembers dismissal per batch in `localStorage`.

**Tech Stack:** Next.js 16 (App Router), TypeScript, `node --test` with native type-stripping, no new dependencies.

**Branch:** Work continues on `feat/update-ribbon`, already created and two commits in (the PR-27 doc fix and the design spec). Do not create a new branch.

**Design spec:** `docs/superpowers/specs/2026-09-14-update-ribbon-design.md` — read it before starting; this plan implements it exactly, including the two "does not do" items in its §9 (update notes, tagged releases) which stay explicitly out of scope here.

## Global Constraints

- Answer keys never reach the client (AGENTS.md §2.1 → repo §5.1). `addedOn` and everything derived from it (date, count, href) are not secret and may be read directly server-side; this task adds no new leak surface, and Task 1 confirms that by inspection (`publicHalf` builds each `PublicDrill` field explicitly, never via `...drill`, so a new field on `Drill` cannot leak through it).
- The scorer and generator stay pure and I/O-free (AGENTS.md §2.3). `src/lib/ribbon.ts` follows this: no imports, no clock read internally — `isFresh` takes `now` as a parameter.
- Git workflow: one feature, one branch, atomic commits, PR (AGENTS.md §2.5). Every task below ends with its own commit. Use `GH_TOKEN=$(gh auth token --user adamafzainizam) gh pr create --fill` when opening the PR (AGENTS.md §6) — not `GITHUB_TOKEN=`, which stopped working once a second keyring account appeared.
- Commits carry the builder's name only — no AI co-author trailer (AGENTS.md §2.7). This overrides any default attribution an agent would otherwise add.
- The ribbon never appears on a drill page (AGENTS.md §2.10). Enforced structurally in Task 5 by simply never importing `UpdateRibbon` into `src/app/drills/[id]/page.tsx`.
- Never hand-write an answer key or an authored count where a derived one is possible (AGENTS.md §7). The ribbon's count is derived; its `addedOn` dates are authored data sourced from git history, which Task 1 states explicitly rather than blurring the two.
- `npm test && npm run lint && npm run typecheck && npm run build` must be clean before any push (AGENTS.md §2.5).

---

### Task 1: `addedOn` becomes universal — type change, git-sourced backfill, and its guards

**Files:**
- Modify: `src/drills/registry.ts:40-49` (`ViewsDrill` type), `:56-69` (`FigureDrill` type), and 30 entries inside the `CATALOGUE` array (`:239` onward) that currently lack `addedOn`
- Test: `src/drills/registry.test.ts` (append two new tests)

**Interfaces:**
- Produces: every `Drill` (`ViewsDrill | FigureDrill | BuildDrill`) now has `addedOn: string` — Task 2 and Task 3 depend on this being true for every one of the 40 entries.

- [ ] **Step 1: Write the two failing tests**

Append to the end of `src/drills/registry.test.ts`:

```ts
test("every drill has an addedOn date, shaped like an ISO date", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    assert.match(
      drill.addedOn, /^\d{4}-\d{2}-\d{2}$/,
      `${id}'s addedOn is missing or not shaped like YYYY-MM-DD`,
    );
  }
});

test("no drill's addedOn is dated in the future", () => {
  // One day of slack against the test machine's clock, so a drill dated
  // TODAY cannot fail on a machine whose timezone has not rolled over yet.
  // String comparison is safe and deliberate here: two YYYY-MM-DD strings
  // compare lexicographically in the same order as the dates themselves, so
  // there is no Date parsing and no timezone conversion to get wrong.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const cutoff = tomorrow.toISOString().slice(0, 10);
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    assert.ok(
      drill.addedOn <= cutoff,
      `${id}'s addedOn (${drill.addedOn}) is in the future`,
    );
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --experimental-strip-types --test src/drills/registry.test.ts`

Expected: both new tests FAIL. `ViewsDrill` and `FigureDrill` don't declare `addedOn` yet, so at runtime `drill.addedOn` is `undefined` for 30 of the 40 entries and `assert.match` throws a `TypeError` ("must be of type string") rather than passing.

- [ ] **Step 3: Add the field to both types**

In `src/drills/registry.ts`, `ViewsDrill` currently reads:

```ts
export type ViewsDrill = {
  id: string;
  title: string;
  prompt: string;
  convention: Convention;
  topicId: TopicId;
  mode: "views";
  /** PRIVATE. The answer key in compressed form. Never serialise this. */
  solid: Solid;
};
```

Change to:

```ts
export type ViewsDrill = {
  id: string;
  title: string;
  prompt: string;
  convention: Convention;
  topicId: TopicId;
  mode: "views";
  /** ISO date. Derived content for the update ribbon (AGENTS.md §2.10). */
  addedOn: string;
  /** PRIVATE. The answer key in compressed form. Never serialise this. */
  solid: Solid;
};
```

`FigureDrill` currently reads:

```ts
export type FigureDrill = {
  id: string;
  title: string;
  prompt: string;
  topicId: TopicId;
  mode: "figure";
  /**
   * PRIVATE. `parabolaKey(spec)` / `obliqueKey(spec)` derive the answer key
   * with no work at all — they are pure functions anyone could run — so `spec`
   * is exactly as sensitive as `solid` above and must never cross into
   * `publicHalf`. An oblique spec CONTAINS a solid, so this is not a weaker
   * secret than a views drill's; it is the same one.
   */
  spec: FigureSpec;
};
```

Change to:

```ts
export type FigureDrill = {
  id: string;
  title: string;
  prompt: string;
  topicId: TopicId;
  mode: "figure";
  /** ISO date. Derived content for the update ribbon (AGENTS.md §2.10). */
  addedOn: string;
  /**
   * PRIVATE. `parabolaKey(spec)` / `obliqueKey(spec)` derive the answer key
   * with no work at all — they are pure functions anyone could run — so `spec`
   * is exactly as sensitive as `solid` above and must never cross into
   * `publicHalf`. An oblique spec CONTAINS a solid, so this is not a weaker
   * secret than a views drill's; it is the same one.
   */
  spec: FigureSpec;
};
```

(`BuildDrill` at `:130-141` already has `addedOn` — leave it alone.)

- [ ] **Step 4: Backfill the 30 missing values, sourced from git history**

These dates were derived by running, for each drill id, `git log -S"id: \"<id>\"" --format='%ad' --date=short -- src/drills/registry.ts | tail -1` — the date each id first appeared in a commit. Cross-checked against the session log's prose wherever the log gives a date; every value agreed.

Save this script to a scratch file (e.g. your scratchpad directory), NOT into the repo — it is a one-time migration, run once:

```js
// backfill-added-on.mjs
import { readFileSync, writeFileSync } from "node:fs";

const DATES = {
  "step-block": "2026-08-26",
  "corner-cut": "2026-08-26",
  "plate-with-bore": "2026-08-26",
  "stepped-plate-bore": "2026-08-26",
  "parabola-rectangle-5": "2026-08-27",
  "hidden-groove": "2026-08-28",
  "near-mirror-notches": "2026-08-28",
  "bore-along-length": "2026-08-28",
  "step-and-notch": "2026-08-28",
  "parabola-rectangle-4": "2026-08-28",
  "parabola-rectangle-6": "2026-08-28",
  "oblique-cavalier-step": "2026-09-02",
  "oblique-cabinet-step": "2026-09-02",
  "oblique-general-step": "2026-09-02",
  "oblique-cabinet-notch": "2026-09-02",
  "oblique-from-views-cavalier": "2026-09-02",
  "oblique-from-views-cabinet": "2026-09-02",
  "window-through-plate": "2026-09-14",
  "pocketed-plate": "2026-09-14",
  "perpendicular-bisector": "2026-09-14",
  "perpendicular-bisector-diagonal": "2026-09-14",
  "bisect-right-angle": "2026-09-14",
  "divide-line-five": "2026-09-14",
  "perpendicular-from-point": "2026-09-14",
  "parallel-through-point": "2026-09-14",
  "square-on-a-side": "2026-09-14",
  "oblique-from-views-general-first": "2026-09-14",
  "oblique-from-views-general-third": "2026-09-14",
  "oblique-from-views-cavalier-third": "2026-09-14",
  "oblique-from-views-cabinet-first": "2026-09-14",
};

const path = "src/drills/registry.ts";
const lines = readFileSync(path, "utf8").split("\n");
const out = [];
let currentId = null;
let inserted = 0;

for (const line of lines) {
  out.push(line);
  const idMatch = line.match(/^\s*id:\s*"([^"]+)",\s*$/);
  if (idMatch) currentId = idMatch[1];
  const modeMatch = line.match(/^(\s*)mode:\s*"(views|figure)",\s*$/);
  if (modeMatch && currentId !== null && DATES[currentId]) {
    out.push(`${modeMatch[1]}addedOn: "${DATES[currentId]}",`);
    inserted++;
    currentId = null;
  }
}

if (inserted !== 30) {
  throw new Error(`expected to insert 30 addedOn lines, inserted ${inserted}`);
}

writeFileSync(path, out.join("\n"));
console.log(`inserted ${inserted} addedOn lines`);
```

Run it once from the repo root: `node /path/to/your/scratchpad/backfill-added-on.mjs`

Expected output: `inserted 30 addedOn lines`. If it throws instead, `git diff src/drills/registry.ts` to see what matched and fix the script rather than re-running it (running it twice would insert a second `addedOn` line into every entry it already touched).

- [ ] **Step 5: Spot-check the diff**

Run: `git diff src/drills/registry.ts | head -60`

Confirm each new `addedOn: "..."` line sits directly under its entry's `mode: "views",` or `mode: "figure",` line, with 4-space indentation matching its neighbours.

- [ ] **Step 6: Run the two new tests again — verify they pass**

Run: `node --experimental-strip-types --test src/drills/registry.test.ts`

Expected: PASS, including the two new tests.

- [ ] **Step 7: Run the full suite, lint, typecheck and build**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean. Test count should be 568 (566 existing + 2 new).

- [ ] **Step 8: Commit**

```bash
git add src/drills/registry.ts src/drills/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(ribbon): addedOn becomes universal, backfilled from git history

BuildDrill already carried addedOn; ViewsDrill and FigureDrill did not,
so 30 of 40 drills had no release date as data at all. Both types gain
the field, and each missing value is sourced from git log -S against
registry.ts rather than memory or prose — the date each id first landed
in a commit, cross-checked against the session log wherever it gives
one and agreeing every time.

The date is authored, not derived: nothing here checks it against the
commit that actually introduced it, since asserting against git log
directly would make the suite depend on history that rebases and
squashes rewrite. What IS checked: every addedOn is shaped like an ISO
date, and none is dated in the future — the typo class this asymmetry
actually permits.
EOF
)"
```

---

### Task 2: Pure logic — `src/lib/ribbon.ts`

**Files:**
- Create: `src/lib/ribbon.ts`
- Test: `src/lib/ribbon.test.ts`

**Interfaces:**
- Consumes: nothing (no imports).
- Produces: `Batch<Id extends string> = { date: string; count: number; topicId: Id | null }`, `latestBatch<Id extends string>(entries: readonly { addedOn: string; topicId: Id }[]): Batch<Id> | null`, `isFresh(date: string, now: Date, windowDays?: number): boolean` — Task 3 imports `latestBatch`, Task 4's component imports `isFresh`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/ribbon.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { latestBatch, isFresh } from "./ribbon.ts";

test("latestBatch returns null for an empty registry", () => {
  assert.equal(latestBatch([]), null);
});

test("a single date becomes the whole batch", () => {
  const entries = [
    { addedOn: "2026-09-06", topicId: "reading-views" },
    { addedOn: "2026-09-06", topicId: "reading-views" },
  ];
  assert.deepEqual(latestBatch(entries), { date: "2026-09-06", count: 2, topicId: "reading-views" });
});

test("only the maximum date is counted; older entries do not inflate it", () => {
  const entries = [
    { addedOn: "2026-08-26", topicId: "orthographic" },
    { addedOn: "2026-08-26", topicId: "orthographic" },
    { addedOn: "2026-09-14", topicId: "orthographic" },
  ];
  const batch = latestBatch(entries)!;
  assert.equal(batch.date, "2026-09-14");
  assert.equal(batch.count, 1);
});

test("a batch whose entries share one topic reports that topic", () => {
  const entries = [
    { addedOn: "2026-09-13", topicId: "reading-views" },
    { addedOn: "2026-09-13", topicId: "reading-views" },
    { addedOn: "2026-09-13", topicId: "reading-views" },
  ];
  assert.equal(latestBatch(entries)!.topicId, "reading-views");
});

// POSITIVE CONTROL. getUpdateRibbon() (Task 3) only ever calls latestBatch
// over the WHOLE registry, whose newest batch happens to span three topics
// today — so the single-topic case above is the only branch a
// real-registry-only suite could ever reach, and it alone cannot catch a
// hardcoded href. This is the case that can. See design spec §8 and
// AGENTS.md §6's recorded "views" field that always said all three, for the
// same failure class: a property test that passes with the property gone.
test("a batch spanning two topics reports no single topic, and sums the count", () => {
  const entries = [
    { addedOn: "2026-09-14", topicId: "orthographic" },
    { addedOn: "2026-09-14", topicId: "constructions" },
    { addedOn: "2026-09-14", topicId: "oblique" },
  ];
  const batch = latestBatch(entries)!;
  assert.equal(batch.topicId, null);
  assert.equal(batch.count, 3);
});

test("isFresh is true well inside the window", () => {
  assert.equal(isFresh("2026-09-14", new Date(2026, 8, 15)), true); // 1 day later
});

test("isFresh is false well outside the window", () => {
  assert.equal(isFresh("2026-09-14", new Date(2026, 10, 1)), false); // 48 days later
});

test("isFresh treats exactly windowDays as stale, one day short as fresh", () => {
  const date = "2026-09-14";
  const exactlyAtWindow = new Date(2026, 9, 14); // 30 days after Sep 14
  const oneDayShort = new Date(2026, 9, 13); // 29 days after
  assert.equal(isFresh(date, exactlyAtWindow, 30), false);
  assert.equal(isFresh(date, oneDayShort, 30), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test src/lib/ribbon.test.ts`

Expected: FAIL — `src/lib/ribbon.ts` does not exist yet, so the import throws (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Write the implementation**

Create `src/lib/ribbon.ts`:

```ts
/**
 * Pure logic behind the "new exercises" ribbon (AGENTS.md §2.10).
 *
 * Deliberately imports nothing — not even TopicId — so it has no transitive
 * path to anything key-bearing. That is what makes it safe for a CLIENT
 * component to import directly, given isolation.test.ts reads direct imports
 * only (AGENTS.md §6).
 */

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
  if (entries.length === 0) return null;
  const date = entries.reduce((max, e) => (e.addedOn > max ? e.addedOn : max), entries[0].addedOn);
  const batch = entries.filter((e) => e.addedOn === date);
  const topicIds = new Set(batch.map((e) => e.topicId));
  const topicId = topicIds.size === 1 ? batch[0].topicId : null;
  return { date, count: batch.length, topicId };
}

/** How many days a batch stays announced before the ribbon stops showing it. */
const DEFAULT_WINDOW_DAYS = 30;

function parseIsoDate(iso: string): Date {
  const [year, month, day] = iso.split("-").map(Number);
  // Local-time components, deliberately not `new Date(iso)`: a bare
  // YYYY-MM-DD string is parsed as UTC midnight, which shifts a day
  // backward once formatted in any timezone west of UTC.
  return new Date(year, month - 1, day);
}

/**
 * Whether a batch dated `date` is still recent enough to announce, as of
 * `now`. Takes the clock as a parameter rather than reading it — see design
 * spec §3.1 for why the caller must supply the VIEWER's clock, never one
 * read at build time.
 */
export function isFresh(date: string, now: Date, windowDays: number = DEFAULT_WINDOW_DAYS): boolean {
  const msPerDay = 24 * 60 * 60 * 1000;
  const daysSince = (now.getTime() - parseIsoDate(date).getTime()) / msPerDay;
  return daysSince < windowDays;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --experimental-strip-types --test src/lib/ribbon.test.ts`

Expected: PASS, all 8 tests.

- [ ] **Step 5: The positive control the design spec calls for — confirm the tie-breaking logic is actually being exercised**

Temporarily edit `src/lib/ribbon.ts`, changing:

```ts
  const topicId = topicIds.size === 1 ? batch[0].topicId : null;
```

to:

```ts
  const topicId = null; // TEMPORARY — verifying the test catches this
```

Run: `node --experimental-strip-types --test src/lib/ribbon.test.ts`

Expected: FAIL — specifically `"a batch whose entries share one topic reports that topic"` must fail (it will now see `null` instead of `"reading-views"`). If it does NOT fail, the test is not exercising the code path it claims to and needs to be rewritten before continuing.

Revert the temporary edit back to `topicIds.size === 1 ? batch[0].topicId : null`, and re-run to confirm all 8 tests pass again.

- [ ] **Step 6: Run the full suite, lint, typecheck and build**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean. Test count should be 576 (568 + 8 new).

- [ ] **Step 7: Commit**

```bash
git add src/lib/ribbon.ts src/lib/ribbon.test.ts
git commit -m "$(cat <<'EOF'
feat(ribbon): pure batch-grouping and freshness logic

latestBatch groups drills by their maximum addedOn date and reports
the shared topic only when the whole batch has one — null when it
spans more than one, which is the ONLY branch the real registry can
currently exercise through getUpdateRibbon (its newest batch spans
three topics), so the single-topic case is tested here against
constructed fixtures with a positive control confirming it actually
fails when the tie-breaking logic is deleted.

isFresh takes the clock as a parameter rather than reading it, so the
30-day announce window stays pure and is evaluated by the viewer, not
frozen into a statically prerendered page at build time.

Imports nothing, deliberately — no transitive path to anything
key-bearing, which is what will let the client-side ribbon component
import it directly.
EOF
)"
```

---

### Task 3: Registry export — `getUpdateRibbon()`

**Files:**
- Modify: `src/drills/registry.ts` (add import near `:33`, add function near `topicPreview` at `:1321`)
- Modify: `src/drills/registry.test.ts` (add import at `:3`, append 3 new tests)

**Interfaces:**
- Consumes: `latestBatch` from `src/lib/ribbon.ts` (Task 2); `listDrillIds`, `getDrill` already in `registry.ts`.
- Produces: `getUpdateRibbon(): { date: string; count: number; href: string } | null` — Task 5's pages call this.

- [ ] **Step 1: Write the failing tests**

In `src/drills/registry.test.ts`, change the import on line 3 from:

```ts
import { getDrill, listDrillIds, publicHalf, answerKey, DRILL_IDS, SHEET } from "./registry.ts";
```

to:

```ts
import { getDrill, listDrillIds, publicHalf, answerKey, DRILL_IDS, SHEET, getUpdateRibbon } from "./registry.ts";
```

Then append to the end of the file:

```ts
test("getUpdateRibbon's date is the maximum addedOn across the real registry", () => {
  const dates = listDrillIds().map((id) => getDrill(id)!.addedOn);
  const maxDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);
  assert.equal(getUpdateRibbon()!.date, maxDate);
});

test("getUpdateRibbon's count matches the number of drills at that date", () => {
  const ribbon = getUpdateRibbon()!;
  const atThatDate = listDrillIds().filter((id) => getDrill(id)!.addedOn === ribbon.date);
  assert.equal(ribbon.count, atThatDate.length);
});

test("getUpdateRibbon's href always points somewhere under /topics", () => {
  assert.match(getUpdateRibbon()!.href, /^\/topics(\/[a-z-]+)?$/);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test src/drills/registry.test.ts`

Expected: FAIL — `getUpdateRibbon` is not exported yet, so the import itself throws.

- [ ] **Step 3: Write the implementation**

In `src/drills/registry.ts`, add the import. The existing import block ends with (around line 33):

```ts
import { getTopic, type Hint, type TopicId } from "../topics/topics.ts";
```

Add directly after it:

```ts
import { latestBatch } from "../lib/ribbon.ts";
```

Then, next to `topicPreview` (around line 1321, just before its definition), add:

```ts
/**
 * The newest batch of drills, for the update ribbon (AGENTS.md §2.10).
 * `date`, `count` and `href` reveal nothing about any answer key, so this is
 * as safe to call from a server component as `topicPreview` already is.
 *
 * Deliberately does NOT check freshness — `/` and `/topics` are statically
 * prerendered, so a check made here would be evaluated at BUILD time and
 * frozen into the static HTML. `UpdateRibbon` (the client component) decides
 * freshness itself, against the viewer's own clock. See design spec §3.1.
 */
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

- [ ] **Step 4: Run to verify it passes**

Run: `node --experimental-strip-types --test src/drills/registry.test.ts`

Expected: PASS, including the 3 new tests.

- [ ] **Step 5: Run the full suite, lint, typecheck and build**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean. Test count should be 579 (576 + 3 new).

- [ ] **Step 6: Commit**

```bash
git add src/drills/registry.ts src/drills/registry.test.ts
git commit -m "$(cat <<'EOF'
feat(ribbon): getUpdateRibbon() exposes the newest batch

date, count and href are derived from the real registry the same way
topicPreview already is, and are just as safe to call from a server
component — none of the three can narrow any answer key. href is
/topics/{topicId} when the batch shares one topic, else /topics; today's
newest batch spans three topics, so the registry-backed tests here can
only confirm date and count structurally — the href branch logic is
what Task 2's constructed fixtures exist to cover.

No freshness check here on purpose: this module runs at request time
for a server component, but / and /topics are statically prerendered,
so a check made here would be baked into the static HTML at build time
and never reconsidered. That decision belongs to the client component
that reads the viewer's own clock.
EOF
)"
```

---

### Task 4: Component — `UpdateRibbon.tsx`

**Files:**
- Create: `src/components/UpdateRibbon.tsx`

**Interfaces:**
- Consumes: `isFresh` from `@/lib/ribbon` (Task 2).
- Produces: `UpdateRibbon({ date, count, href }: { date: string; count: number; href: string })` — a client component. Task 5 renders it on the three menu/landing pages.

There is no automated test harness for React components in this repo (`npm test`'s glob is `.test.ts` only, and no `.test.tsx` file exists anywhere under `src/components`). Rendered verification happens in Task 5, alongside the pages that use this component — building it in isolation here first keeps that task's diff to "wire it in" rather than "wire it in and also debug the component."

- [ ] **Step 1: Write the component**

Create `src/components/UpdateRibbon.tsx`:

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isFresh } from "@/lib/ribbon";

const RIBBON_KEY = "orthodrill:ribbon-dismissed";
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/**
 * The "N new exercises" banner (AGENTS.md §2.10). Rendered explicitly by
 * each page that wants it — never baked into AppHeader — so a future header
 * refactor cannot accidentally carry it onto a drill page. See design spec §5.
 */
export function UpdateRibbon({ date, count, href }: { date: string; count: number; href: string }) {
  // Hidden until the effect below confirms the batch is fresh AND
  // undismissed, so SSR output and first client paint agree on "nothing" —
  // no flash-then-hide.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isFresh(date, new Date())) return;
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(RIBBON_KEY) === date;
    } catch {
      dismissed = false; // storage blocked or unavailable: show it, never crash
    }
    setShow(!dismissed);
  }, [date]);

  if (!show) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 border-b px-6 py-2"
      style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)" }}
    >
      <Link href={href} className="t-small no-underline hover:underline" style={{ color: "var(--text-primary)" }}>
        {count} new exercise{count === 1 ? "" : "s"} added {formatDate(date)}
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        className="pressable t-small rounded-[var(--radius-sm)] px-2 py-0.5"
        style={{ color: "var(--text-tertiary)" }}
        onClick={() => {
          try {
            localStorage.setItem(RIBBON_KEY, date);
          } catch {
            // storage blocked: dismissal just won't persist, which is fine
          }
          setShow(false);
        }}
      >
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Confirm it compiles**

Run: `npm run typecheck`

Expected: clean. Nothing imports this component yet, but TypeScript still checks every file under `src/`.

- [ ] **Step 3: Confirm lint is clean**

Run: `npm run lint`

Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/UpdateRibbon.tsx
git commit -m "$(cat <<'EOF'
feat(ribbon): UpdateRibbon component

A client component, not baked into AppHeader — the same explicit
per-page pattern AppHeader's own back/trail props already use, so a
future header refactor cannot accidentally carry the ribbon onto a
drill page by touching one shared file.

Starts hidden and only shows once its effect confirms the batch is
fresh (isFresh, against the viewer's real clock) and undismissed
(localStorage, keyed by date so a later batch un-hides it for everyone
automatically) — so server and first client render agree on nothing,
with no flash-then-hide. localStorage reads and writes are both
wrapped: private browsing and blocked storage degrade to "always show",
never to a crash.

Not yet wired into any page — that's Task 5, where it also gets its
first real render.
EOF
)"
```

---

### Task 5: Wire the ribbon into the three pages, and verify by rendering

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/topics/page.tsx`
- Modify: `src/app/topics/[id]/page.tsx`

**Interfaces:**
- Consumes: `getUpdateRibbon` from `@/drills/registry` (Task 3), `UpdateRibbon` from `@/components/UpdateRibbon` (Task 4).

- [ ] **Step 1: Wire `/` (`src/app/page.tsx`)**

Current imports (lines 1-5):

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DriftingFigures } from "@/components/DriftingFigures";
import { TOPIC_IDS, getTopic } from "@/topics/topics";
import { topicPreview } from "@/drills/registry";
```

Change to:

```tsx
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { DriftingFigures } from "@/components/DriftingFigures";
import { UpdateRibbon } from "@/components/UpdateRibbon";
import { TOPIC_IDS, getTopic } from "@/topics/topics";
import { getUpdateRibbon, topicPreview } from "@/drills/registry";
```

Inside `export default function Home() {`, the body currently starts:

```tsx
export default function Home() {
  // Resolved HERE, not inside the component: `drills/registry` holds the
  // answer keys, so only server code under app/ may reach it.
  const withPreview = TOPIC_IDS
```

Add one line before `const withPreview`:

```tsx
export default function Home() {
  const ribbon = getUpdateRibbon();
  // Resolved HERE, not inside the component: `drills/registry` holds the
  // answer keys, so only server code under app/ may reach it.
  const withPreview = TOPIC_IDS
```

And where the JSX currently reads:

```tsx
      <DriftingFigures figures={figures} />
      <AppHeader />
      {/* Centred in what is left below the header, so the page does not
```

Change to:

```tsx
      <DriftingFigures figures={figures} />
      <AppHeader />
      {ribbon !== null && <UpdateRibbon date={ribbon.date} count={ribbon.count} href={ribbon.href} />}
      {/* Centred in what is left below the header, so the page does not
```

- [ ] **Step 2: Wire `/topics` (`src/app/topics/page.tsx`)**

Current import line 7:

```tsx
import { getDrill, listDrillIds, topicPreview } from "@/drills/registry";
```

Change to:

```tsx
import { getDrill, getUpdateRibbon, listDrillIds, topicPreview } from "@/drills/registry";
```

Add the `UpdateRibbon` import beside the others (after the `MethodDiagram` import, line 5):

```tsx
import { MethodDiagram } from "@/components/MethodDiagram";
import { UpdateRibbon } from "@/components/UpdateRibbon";
```

Inside `export default function TopicsPage() {`, the body currently starts:

```tsx
export default function TopicsPage() {
  const topics = TOPIC_IDS.map((id) => getTopic(id)!);
```

Add one line:

```tsx
export default function TopicsPage() {
  const ribbon = getUpdateRibbon();
  const topics = TOPIC_IDS.map((id) => getTopic(id)!);
```

And where the JSX reads:

```tsx
      <DriftingFigures figures={driftFigures} count={4} />
      <AppHeader back="/" />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-6 py-10">
```

Change to:

```tsx
      <DriftingFigures figures={driftFigures} count={4} />
      <AppHeader back="/" />
      {ribbon !== null && <UpdateRibbon date={ribbon.date} count={ribbon.count} href={ribbon.href} />}
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-6 py-10">
```

- [ ] **Step 3: Wire `/topics/[id]` (`src/app/topics/[id]/page.tsx`)**

Current imports:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getTopic } from "@/topics/topics";
import { getDrill, listDrillIds } from "@/drills/registry";
```

Change to:

```tsx
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { UpdateRibbon } from "@/components/UpdateRibbon";
import { getTopic } from "@/topics/topics";
import { getDrill, getUpdateRibbon, listDrillIds } from "@/drills/registry";
```

The body currently reads:

```tsx
export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = getTopic(id);
  if (topic === null) notFound();

  const exercises = listDrillIds()
    .map((drillId) => getDrill(drillId)!)
    .filter((d) => d.topicId === topic.id);

  return (
    <>
      <AppHeader back="/topics" trail={[{ label: topic.title }]} />
      <main className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
```

Change to:

```tsx
export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = getTopic(id);
  if (topic === null) notFound();

  const exercises = listDrillIds()
    .map((drillId) => getDrill(drillId)!)
    .filter((d) => d.topicId === topic.id);
  const ribbon = getUpdateRibbon();

  return (
    <>
      <AppHeader back="/topics" trail={[{ label: topic.title }]} />
      {ribbon !== null && <UpdateRibbon date={ribbon.date} count={ribbon.count} href={ribbon.href} />}
      <main className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
```

- [ ] **Step 4: Run the full suite, lint, typecheck and build**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, 579 tests, and the build's route table should still show `/`, `/topics` and `/topics/[id]` — confirm none of them silently switched from static (`○`) to dynamic (`ƒ`) in a way that surprises you. (They may or may not switch — `getUpdateRibbon()` reads the registry at build/request time either way; the freshness decision that must NOT be frozen at build time lives entirely in the client component, per Task 2/3's design. If a page does switch to dynamic, that's expected and fine, not a bug to chase.)

- [ ] **Step 5: Render and verify — this is the check that actually catches layout and behaviour bugs**

AGENTS.md §6 and §7 both single this out as the highest-yield check in the project; a green suite has repeatedly shipped past defects only rendering caught. Follow the same pattern `scripts/screenshot.ts` documents.

In one terminal:

```bash
npm run dev
```

In another:

```bash
google-chrome --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/orthodrill-cdp about:blank &
```

Then, from the repo root:

```bash
node --experimental-strip-types scripts/screenshot.ts http://localhost:3000/ /tmp/ribbon-home.png
node --experimental-strip-types scripts/screenshot.ts http://localhost:3000/topics /tmp/ribbon-topics.png
node --experimental-strip-types scripts/screenshot.ts http://localhost:3000/topics/constructions /tmp/ribbon-topic-detail.png
node --experimental-strip-types scripts/screenshot.ts http://localhost:3000/drills/step-block /tmp/ribbon-drill.png
```

Read all four PNGs (Read tool handles images directly). Confirm:

- `/`, `/topics`, `/topics/constructions` each show a ribbon reading "13 new exercises added 14 September" (today's real batch — adjust the exact wording check if the registry has changed since this plan was written), and it links out (visually check the href isn't visible as raw text, obviously — but that it renders as a normal link).
- `/drills/step-block` shows NO ribbon at all.

If the ribbon does not appear on the menu pages, or appears on the drill page, stop and fix before continuing — do not proceed to the dismissal check on a broken render.

- [ ] **Step 6: Verify dismissal persists**

Save this scene module to your scratchpad (not committed — it's throwaway verification tooling, the same way Task 1's backfill script was):

```js
// dismiss-ribbon.mjs
export async function run({ evaluate, sleep }) {
  await evaluate(`document.querySelector('button[aria-label="Dismiss"]')?.click()`);
  await sleep(200);
}
```

Then:

```bash
node --experimental-strip-types scripts/screenshot.ts http://localhost:3000/ /tmp/ribbon-dismissed.png /path/to/your/scratchpad/dismiss-ribbon.mjs
node --experimental-strip-types scripts/screenshot.ts http://localhost:3000/ /tmp/ribbon-reloaded.png
```

Read both PNGs. Confirm the ribbon is gone in `ribbon-dismissed.png` (right after clicking dismiss) AND still gone in `ribbon-reloaded.png` (a fresh navigation to the same page) — the second confirms `localStorage` actually persisted the dismissal, not just that `setShow(false)` worked for the one page instance that was already open.

Stop the dev server and the headless Chrome process once done (`pkill -f "next dev"`, `pkill -f "remote-debugging-port=9222"` or close whichever terminals are running them).

- [ ] **Step 7: Commit**

```bash
git add src/app/page.tsx src/app/topics/page.tsx "src/app/topics/[id]/page.tsx"
git commit -m "$(cat <<'EOF'
feat(ribbon): wire it into /, /topics and /topics/[id]

Never into /drills/[id] — enforced structurally by simply never
importing UpdateRibbon there, the same way AGENTS.md §2.10 requires.

Verified by rendering, not just by the type checker: the ribbon shows
its real text and link on all three menu/landing pages, is absent on a
drill page, and a dismissal persists across a fresh page load (which
only a real localStorage round-trip confirms, not a single component
instance's state).
EOF
)"
```

---

### Task 6: Close the `isolation.test.ts` gap found along the way

**Files:**
- Modify: `src/drills/isolation.test.ts:43` (the `SERVER_ONLY` regex), and append 2 new tests

This is unrelated to the ribbon itself — the design spec's §7 flags it as a latent gap found while reading the codebase for this work, and says explicitly it belongs in its own commit. It's included in this plan (not deferred to some future session) because it's small, well-specified, and closes a real gap rather than just noting one.

**The gap:** `SERVER_ONLY` names `geometry/parabola` but not `geometry/constructions` or `geometry/oblique`, even though `constructionKey` and `obliqueKey` derive answer keys exactly the way `parabolaKey` does. Nothing violates this today — only `registry.ts` imports any of the three, and `registry.ts` is in `ALLOWED` — so this is latent, not live. But the guard would catch a client component importing `parabola.ts` and wave through the identical mistake with `constructions.ts` or `oblique.ts`.

- [ ] **Step 1: Write the two failing tests**

In `src/drills/isolation.test.ts`, find the existing test (it's the one right after the two "the checker catches ... transitively" tests, near the end of the file):

```ts
test("the checker catches a client component importing the parabola generator directly", () => {
  // parabolaKey(spec) derives a figure's answer key with one call, exactly as
  // generateViews(solid) does for a views exercise — this is the Task 4
  // addition to SERVER_ONLY, and it needs its own positive control rather
  // than riding along on the generic one above.
  const offending = `"use client";\nimport { parabolaKey } from "../lib/geometry/parabola.ts";\n`;
  assert.notEqual(
    violation("components/Sidebar.tsx", offending),
    null,
    "a client component importing the parabola generator must be caught",
  );
});
```

Add two new tests directly after it, modeled on it exactly:

```ts
test("the checker catches a client component importing the construction generator directly", () => {
  // constructionKey(spec) derives a figure's answer key with one call, the
  // same shape as parabolaKey and generateViews above — SERVER_ONLY named
  // parabola but not this one, which shipped the same week (AGENTS.md §6).
  const offending = `"use client";\nimport { constructionKey } from "../lib/geometry/constructions.ts";\n`;
  assert.notEqual(
    violation("components/Sidebar.tsx", offending),
    null,
    "a client component importing the construction generator must be caught",
  );
});

test("the checker catches a client component importing the oblique generator directly", () => {
  const offending = `"use client";\nimport { obliqueKey } from "../lib/geometry/oblique.ts";\n`;
  assert.notEqual(
    violation("components/Sidebar.tsx", offending),
    null,
    "a client component importing the oblique generator must be caught",
  );
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `node --experimental-strip-types --test src/drills/isolation.test.ts`

Expected: the two new tests FAIL — `violation(...)` currently returns `null` for both, because `SERVER_ONLY` doesn't match `geometry/constructions` or `geometry/oblique`.

- [ ] **Step 3: Widen the regex**

In `src/drills/isolation.test.ts:43`, current:

```ts
const SERVER_ONLY = /from\s+["'][^"']*(drills\/registry|server\/|geometry\/solid|geometry\/views|geometry\/parabola|scoring\/score|scoring\/solid|scoring\/assign)/;
```

Change to:

```ts
const SERVER_ONLY = /from\s+["'][^"']*(drills\/registry|server\/|geometry\/solid|geometry\/views|geometry\/parabola|geometry\/constructions|geometry\/oblique|scoring\/score|scoring\/solid|scoring\/assign)/;
```

- [ ] **Step 4: Run to verify both pass**

Run: `node --experimental-strip-types --test src/drills/isolation.test.ts`

Expected: PASS, all tests including the two new ones.

- [ ] **Step 5: Run the full suite, lint, typecheck and build**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, 581 tests (579 + 2 new).

- [ ] **Step 6: Commit**

```bash
git add src/drills/isolation.test.ts
git commit -m "$(cat <<'EOF'
fix(isolation): SERVER_ONLY was missing constructions and oblique

Found while reading registry.ts for the ribbon work, unrelated to it.
constructionKey(spec) and obliqueKey(spec) derive answer keys the same
one-call way parabolaKey(spec) does, but SERVER_ONLY named only the
parabola generator — a leftover from before the constructions topic
existed. Latent, not live: only registry.ts imports any of the three
today, and registry.ts is allowed to. Widened the regex and gave both
their own positive control, the same pattern the parabola one already
uses, rather than assuming the generic control covers them.
EOF
)"
```

---

### Task 7: AGENTS.md — status, next-up, gotchas, decision log, session log

**Files:**
- Modify: `AGENTS.md` (§3, §4, §6)
- Modify: `docs/decision-log.md` (append)

This is the "before finishing" step §0 requires, and it's the task that actually closes the loop on the design spec's §7 and §9 — recording the two things found-but-not-fixed, and being honest that §4 item 2 is only half done.

- [ ] **Step 1: Update AGENTS.md §3 (Current status) — Done list**

Add one entry to the `Done:` list (after the geometric constructions entry, before "Catalogue backfill"):

```markdown
- [x] The update ribbon — `addedOn` backfilled across all 40 drills from git
      history, a pure `latestBatch`/`isFresh` in `src/lib/ribbon.ts`, and
      `UpdateRibbon.tsx` on the three menu/landing pages, never a drill page
```

- [ ] **Step 2: Update AGENTS.md §4 (Next up) — item 2**

Find:

```markdown
**2. Update notes and the ribbon** (§2.10). Date-keyed releases, menu and landing pages ONLY — never a drill page — and counts DERIVED from an `addedOn` field.

- **The real prerequisite:** only the ten `reading-views` drills carry `addedOn`. `ViewsDrill` and `FigureDrill` do not have the field at all, so adding it to those types and backfilling dates across the other 30 exercises IS this work, not a chore beside it.
- `git tag` still returns nothing across 26 merged PRs despite §2.5 claiming tagged releases.
```

Replace with:

```markdown
**2. Update notes, and tagged releases** (§2.10 — the RIBBON half shipped 2026-09-14; this item is now reduced to what's left).

- **The ribbon is done.** `addedOn` is universal, sourced from git history; `getUpdateRibbon()` derives the newest batch; `UpdateRibbon.tsx` shows it on `/`, `/topics` and `/topics/[id]` for 30 days, dismissibly, never on a drill page. See `docs/superpowers/specs/2026-09-14-update-ribbon-design.md`.
- **Update notes are NOT done.** §2.10 asks for notes carrying a date *and* a ribbon announcing them; there is still no `/updates` page or any written notes — the ribbon links straight into the topic menu instead. Worth doing if a reader ever wants the history, not required for the ribbon to be useful today.
- `git tag` still returns nothing across 27 merged PRs despite §2.5 claiming tagged releases. Retroactively tagging the seven historical dates was considered and rejected — not worth hunting the right commit for each — but a date-keyed tag can be cut at merge from the next release forward, now that the dates are data.
```

- [ ] **Step 3: Add two entries to AGENTS.md §6 (Gotchas → Found in this repo)**

Add near the end of the "Found in this repo" list (after the most recent entry, which is the construction-prompt-units one):

```markdown
- **`src/app/drills/page.tsx` is orphaned.** Nothing in the app links to it — `/topics` and `/topics/[id]` are the only ways a reader reaches an exercise list. It predates the Studio Dark UI revamp: no `AppHeader`, plain Tailwind classes instead of the design-token scale (`text-2xl font-semibold` rather than `t-display`), no ribbon. Found while wiring the update ribbon into every menu page (2026-09-14) and deliberately left alone rather than fixed as a drive-by — it is only reachable by typing the URL, so nothing user-facing depends on it, but a future session should not mistake it for a maintained page.

- **`isolation.test.ts`'s `SERVER_ONLY` list drifts when a new key-deriving generator ships**, and nothing catches the drift automatically. It named `geometry/parabola` from the day the parabola topic shipped, but `geometry/constructions` and `geometry/oblique` — which derive answer keys the identical one-call way — were never added when THEIR topics shipped. Found and fixed 2026-09-14, closing a real (if latent) gap: only `registry.ts` ever imported any of the three, so nothing was actually leaking, but the guard would have caught a client component reaching `parabola.ts` and waved through the same mistake against either of the other two. **Whenever a new `geometry/*Key`-style generator is added, add it to `SERVER_ONLY` in the same commit, with its own positive control** — the generic controls do not exercise a name the regex doesn't contain.
```

- [ ] **Step 4: Append to `docs/decision-log.md`**

```markdown
## 2026-09-14 — the update ribbon: authored dates from git history, freshness on the client

**What shipped.** `addedOn` is now a required field on every drill (previously only `BuildDrill` had it). `getUpdateRibbon()` derives the newest batch — date, count, and a link — and `UpdateRibbon.tsx` announces it on `/`, `/topics` and `/topics/[id]`, dismissibly, for 30 days.

**`addedOn` is authored data, sourced from git history at backfill time — not derived, and the design spec says so explicitly rather than leaving it implied.** The 30 missing values were read off `git log -S"id: \"<id>\""` against `registry.ts`, which gives the exact commit date each drill first shipped. That is the right source for a new drill's date going forward too. What is NOT true: nothing checks a given `addedOn` against the commit that actually introduced it. Asserting against git log directly was considered and rejected — it would make the test suite depend on history that a rebase or squash rewrites, failing for reasons that have nothing to do with the catalogue. The guard that exists instead: shape (`YYYY-MM-DD`) and no future dates, which catches the actual failure this asymmetry permits — a typo'd date that pins the ribbon to itself forever.

**Freshness is decided on the client, and that is load-bearing, not a style choice.** `/` and `/topics` are statically prerendered (`○` in the Next build output). A server-side staleness check — `new Date()` evaluated inside `getUpdateRibbon()` or the page component — would be frozen into the static HTML at BUILD time, and would therefore be wrong in exactly the case it exists to handle: "nothing has shipped in months" is the same condition as "there has been no rebuild in months," so a frozen check would never notice. `UpdateRibbon.tsx` reads the viewer's own clock instead, in a `useEffect`, which is also why dismissal and freshness share one client component rather than being split across server and client.

**The 30-day window is a judgement call, chosen against this project's actual release cadence** (26, 27, 28 August; 2, 6, 13, 14 September) rather than a round number picked in the abstract — that cadence would have kept the ribbon lit continuously throughout, going dark only once there genuinely was nothing new to say.

**Found along the way, fixed in its own commit:** `isolation.test.ts`'s `SERVER_ONLY` list named `geometry/parabola` but not `geometry/constructions` or `geometry/oblique`, despite all three deriving answer keys identically. Latent rather than live — nothing outside `registry.ts` imports any of them today — but real: the guard would have caught the parabola case and waved through either of the other two. See AGENTS.md §6.

**Left open, recorded rather than silently dropped:** §2.10 also asks for written update notes alongside the ribbon, and §2.5 has claimed tagged releases since before this session. Neither shipped here. See AGENTS.md §4 item 2.
```

- [ ] **Step 5: Append a session log row to AGENTS.md §9**

Add a new row at the bottom of the session log table (adjust the "Who" column if a different agent/human executes this plan):

```markdown
| 2026-09-14 | Claude (Claude Code) | **The update ribbon**, brainstormed and speced before any code, then reviewed by a second pass (Opus) that found the spec's own test plan had a hole matching AGENTS.md's own recorded failure class: it claimed both topicId branches were reachable through real registry data, when `getUpdateRibbon()` only ever sees the NEWEST batch and today's spans three topics — so the single-topic href branch is provably unreachable that way, and a hardcoded `/topics` would have passed a real-registry-only suite. Fixed before implementation, with constructed fixtures and an explicit positive control (§8 of the spec). Also added mid-review: a 30-day freshness window, decided against the project's real release cadence, evaluated on the VIEWER's clock rather than the server's because `/` and `/topics` are statically prerendered and a server-side check would freeze at build time; `addedOn` stated plainly as authored data (git-log-sourced at backfill, not verified against it after) rather than blurred into "derived" alongside the count, which genuinely is. Implementation: `addedOn` backfilled across all 40 drills from `git log -S`, a pure import-free `src/lib/ribbon.ts`, `getUpdateRibbon()` beside `topicPreview`, and `UpdateRibbon.tsx` wired into `/`, `/topics` and `/topics/[id]` — verified by rendering all four pages (three with the ribbon, one without) and confirming a dismissal survives a fresh page load, not just one component instance. Also closed, in its own commit: `isolation.test.ts`'s `SERVER_ONLY` list had drifted, naming `geometry/parabola` but not `geometry/constructions` or `geometry/oblique`, found while reading the codebase for this work. §4 item 2 stays open, reduced to update notes and tagged releases — neither shipped here, both recorded rather than dropped silently. 581 tests, lint, typecheck and build clean. |
```

- [ ] **Step 6: Run the full suite one more time (docs-only changes, but confirm nothing else drifted)**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, 581 tests.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md docs/decision-log.md
git commit -m "$(cat <<'EOF'
docs: the update ribbon shipped — status, gotchas, decision log

§3's Done list, §4's item 2 (now honestly half-closed: ribbon shipped,
update notes and tagged releases still open), two new §6 gotchas found
while doing this work (the orphaned /drills page, isolation.test.ts's
drifted SERVER_ONLY list), a decision-log entry recording why addedOn
is authored rather than derived and why freshness has to be decided on
the client, and the session log entry.
EOF
)"
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin feat/update-ribbon
GH_TOKEN=$(gh auth token --user adamafzainizam) gh pr create --fill
```

Then verify the PR body actually landed correctly (AGENTS.md §6: `gh pr create --fill` is fine, but never trust `gh pr edit` afterward — it silently no-ops against this repo). If the description needs fixing later, use the REST API (`gh api -X PATCH repos/adamafzainizam/orthodrill/pulls/<N> -f title="..." -F body=@file.md`), never `gh pr edit`.

---

## Self-Review Notes

**Spec coverage** — every numbered section of `docs/superpowers/specs/2026-09-14-update-ribbon-design.md` maps to a task: §2/§2.1 → Task 1; §3/§3.1 → Task 2; §4 → Task 3; §5 → Task 4; §6 → Task 5; §7 → Task 6 (isolation gap) and Task 7 (orphaned-page note); §8 → the tests embedded in Tasks 1-3, including the positive control the spec calls out by name in Task 2 Step 5; §9 → Task 7's AGENTS.md and decision-log updates state plainly what did NOT ship.

**Placeholder scan** — no TBD/TODO; every step has real, complete code or an exact shell command; no step says "add appropriate X" without showing X.

**Type consistency** — `Batch<Id extends string>`, `latestBatch`, `isFresh(date, now, windowDays?)`, `getUpdateRibbon(): { date, count, href } | null`, and `UpdateRibbon({ date, count, href })` use identical names and shapes everywhere they appear across Tasks 2-5.

**Test count tracking** — 566 (baseline) → 568 (Task 1) → 576 (Task 2) → 579 (Task 3) → 579 (Task 4, no new automated tests) → 579 (Task 5, wiring only) → 581 (Task 6) → 581 (Task 7, docs only). Each task states the expected count so a drift is caught immediately rather than discovered later.
