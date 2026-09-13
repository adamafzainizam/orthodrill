# Update Notes And Tagged Releases — Design

**Date:** 2026-09-14
**Status:** approved, not yet implemented
**Implements:** AGENTS.md §2.10's two remaining pieces, left open by `docs/superpowers/specs/2026-09-14-update-ribbon-design.md` §9: a written notes page, and tagged releases (§2.5).

---

## 1. What changes

The ribbon (shipped in PR #28) announces the newest batch and links out. It never had anywhere durable to link *to* — its `href` pointed straight at a topic menu, so a reader who dismissed it or arrived later than the 30-day window had no way to see what had actually shipped. This adds that destination, `/updates`, and closes the second gap §9 recorded: `git tag` returning nothing despite §2.5 claiming tagged releases.

Two decisions carried over unchanged from the ribbon spec, because the reasoning that produced them didn't change:

- **Counts and topic breakdowns are derived from the registry, never authored.** Same rule, same reason — an authored count that drifts from reality is the parabola-hint failure class.
- **A client-side freshness check, not a server-side one.** `/updates` will be statically prerendered the same way `/` and `/topics` are unless something forces it dynamic, and nothing here does — so the same build-time-freeze hazard applies, and the same fix applies: the viewer's own clock, read in an effect, never the server's.

## 2. The ribbon simplifies

Once every batch links to the same place, `getUpdateRibbon()`'s per-batch destination becomes a constant. That makes the topic-branching logic added in `latestBatch` (`Batch.topicId`: the one topic every entry shares, or `null` if it spans more than one — used only to decide `/topics/{id}` vs `/topics`) genuinely unused. It is removed rather than left in place: `src/lib/ribbon.ts`'s `latestBatch` function and `Batch.topicId` field are deleted, along with the tests built specifically to guard that branching (including the multi-topic positive control from the previous session — it guarded real logic then; the logic it guarded no longer exists).

In its place, one function does the whole job for both the ribbon and the notes page:

```ts
export type TopicCount<Id extends string> = { topicId: Id; count: number };
export type Batch<Id extends string> = {
  date: string;
  count: number;
  /** Sorted by count descending, ties broken by topicId — deterministic
   * without needing any canonical topic ordering, which would mean
   * importing something and breaking this module's zero-import rule. */
  byTopic: TopicCount<Id>[];
};

export function allBatches<Id extends string>(
  entries: readonly { addedOn: string; topicId: Id }[],
): Batch<Id>[]; // one entry per distinct addedOn date, NEWEST FIRST
```

`getUpdateRibbon()` becomes `allBatches(...)[0] ?? null`, mapped down to `{ date, count }` — `href` is dropped from its return type entirely, because it is no longer data, it is a constant the component owns.

`UpdateRibbon.tsx` drops its `href` prop and links to `/updates` directly.

`isFresh` is unchanged.

## 3. `getUpdateNotes()` and the `/updates` page

`registry.ts` gains:

```ts
export function getUpdateNotes(): { date: string; count: number; byTopic: { topicId: TopicId; title: string; count: number }[] }[] {
  return allBatches(listDrillIds().map((id) => getDrill(id)!))
    .map((batch) => ({
      ...batch,
      byTopic: batch.byTopic.map((t) => ({ ...t, title: getTopic(t.topicId)!.title })),
    }));
}
```

The `topicId → title` join happens here, server-side, deliberately — `ribbon.ts` stays free of any import (including `topics.ts`), the same purity rule that let `UpdateRibbon.tsx` import it directly in the first place. This is the same shape of join `publicTopic()` already does elsewhere in `registry.ts`.

`src/app/updates/page.tsx` (new): a server component, `AppHeader back="/"`, calls `getUpdateNotes()`, passes the array to a new client component. **Does not render `<UpdateRibbon>` on itself** — the ribbon's whole job is to point here, so showing it again on arrival is circular. Carries the same reserved ad slot every other non-drill page does, for the same reason.

`src/components/UpdateNotesList.tsx` (new, client): mirrors `UpdateRibbon`'s hidden-until-effect pattern — starts with nothing rendered, and in a `useEffect` filters the batches to `isFresh(date, new Date(), 30)`, then renders the survivors. Each surviving date: a heading line ("13 new exercises — 14 September"), then one sub-line per topic ("7 in Geometric constructions", "4 in Oblique projection", "2 in Orthographic projection"), each linking to that topic. If nothing survives the filter (no batch within 30 days), the page says so in one line rather than rendering an empty list with no explanation.

## 4. Tagged releases

§2.5's command sequence gains one step, after `gh pr merge --merge --delete-branch`:

```bash
n=$(( $(git tag -l "$(date +%Y-%m-%d)-*" | wc -l) + 1 ))
git tag -a "$(date +%Y-%m-%d)-$n" -m "<PR title>" <merge-commit-sha>
git push origin "$(date +%Y-%m-%d)-$n"
```

Annotated, not lightweight — the message carries the PR title, which is the same information density the rest of this repo already insists on (a decision-log entry has a reason; a tag should have more than a bare name). Date-plus-sequence, decided because two PRs already merged today and a bare date collides; sequence rather than a full timestamp keeps the readable date-only format every other date-keyed thing in this repo already uses (session log rows, `addedOn`, decision-log headers).

**Backfilled now, not left for "the next release":** `2026-09-14-1` on PR #27's merge commit (`5bfa75e`) and `2026-09-14-2` on PR #28's (`c4aef93`). Both are already fully known — unlike the seven historical dates the ribbon spec's decision log explicitly rejected backfilling, because those would need hunting down the right commit for each. These two don't; they're the two most recent merges to `main`, found by `git log`.

## 5. Testing

**`src/lib/ribbon.test.ts`** — rewritten around `allBatches`, replacing the `latestBatch` tests it removes:

- empty input → `[]`
- a single date, single topic → one batch, `byTopic` has one entry
- multiple dates → returned newest-first, each date's count independent of the others
- a date spanning multiple topics → `byTopic` has one entry per topic, each with its own count, sorted by count descending (with a tie-break-by-id case, so the sort's second key is actually exercised and not just assumed)
- `isFresh` tests carry over unchanged — nothing about freshness changed

**`src/drills/registry.test.ts`**:

- `getUpdateRibbon()`'s date/count still checked structurally against the real registry, as before (this doesn't change)
- `getUpdateNotes()`'s total count across all batches equals the total number of drills (every drill appears in exactly one date, one topic) — a structural invariant that holds regardless of what the catalogue currently contains, so it doesn't need updating as drills are added
- `getUpdateNotes()`'s dates are strictly decreasing (newest-first, no duplicates)

**No automated test for `UpdateNotesList.tsx`**, for the same reason `UpdateRibbon.tsx` has none — no component test harness in this repo. Verified by rendering, the same way the ribbon was: `/updates` with real data, and (since every one of today's seven historical dates falls within 30 days of "now" in this project's timeline) confirm all seven show, not just the newest.

## 6. What this deliberately does not do

- No pagination, no way to see batches older than 30 days. If the catalogue keeps growing at anything like its current pace this will need revisiting, but building that now would be designing for a problem that doesn't exist yet.
- No RSS/Atom feed. Nobody has asked for one, and nothing else in this repo has anything like it.
- Tags are not retroactively cut for the seven historical dates before 2026-09-14 — that decision was already made and recorded in the ribbon spec's decision log, and nothing here reopens it.
