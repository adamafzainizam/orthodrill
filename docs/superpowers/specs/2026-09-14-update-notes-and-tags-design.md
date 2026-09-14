# Update Notes And Tagged Releases — Design

**Date:** 2026-09-14
**Status:** approved, not yet implemented
**Implements:** AGENTS.md §2.10's two remaining pieces, left open by `docs/superpowers/specs/2026-09-14-update-ribbon-design.md` §9: a written notes page, and tagged releases (§2.5).

---

## 1. What changes

The ribbon (shipped in PR #28) announces the newest batch and links out. It never had anywhere durable to link *to* — its `href` pointed straight at a topic menu, so a reader who dismissed it, or who arrived more than 30 days after a release, had no way to see what had shipped. This adds that destination, `/updates`, and closes the second gap §9 recorded: `git tag` returning nothing despite §2.5 claiming tagged releases.

**The page shows the WHOLE history, and the ribbon keeps its 30-day window.** They are different jobs and they get different rules: a banner is saying *this is new*, and stops being true; a record is saying *this is what happened*, and doesn't. An earlier draft of this spec scoped the page to the same 30 days as the ribbon and was wrong in a way worth recording, because nothing about it looked wrong: **the page would have been unreachable exactly when it was empty, and empty exactly when it was unreachable.** Nothing links to `/updates` but the ribbon, and the ribbon only renders while a batch is fresh — so once 30 days passed with no release, the feature would have vanished entirely, while `§2.10`'s "update notes" went unsatisfied. Caught in review, before implementation.

One decision carries over unchanged from the ribbon spec, because the reasoning that produced it didn't change:

- **Counts and topic breakdowns are derived from the registry, never authored.** Same rule, same reason — an authored count that drifts from reality is the parabola-hint failure class.

And one deliberately does NOT carry over:

- **The page needs no client-side freshness check, because it has no freshness check at all.** The ribbon's clock lives on the client because a build-time `new Date()` freezes into statically prerendered HTML (ribbon spec §3.1). A full history has no such dependency — the content is a pure function of the registry, identical for every viewer at every moment until a drill is added — so `/updates` is a plain **server component**: statically prerendered, correct without JavaScript, and with no `useEffect` to trip over `react-hooks/set-state-in-effect` (AGENTS.md §6).

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

`UpdateRibbon.tsx` drops its `href` prop and links to `/updates` directly. Its own `isFresh` check is untouched: the ribbon still stops announcing a batch after 30 days.

`isFresh` itself is unchanged, and remains used by exactly one caller.

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

`src/app/updates/page.tsx` (new) is the whole page — **a server component, with no client component beneath it.** It renders `AppHeader back="/"`, calls `getUpdateNotes()`, and lists every batch newest-first. Each batch: a heading line ("13 new exercises — 14 September"), then one line per topic ("7 in Geometric constructions", "4 in Oblique projection", "2 in Orthographic projection"), each linking to that topic's page.

It **does not render `<UpdateRibbon>` on itself** — the ribbon's whole job is to point here, so showing it again on arrival is circular.

It **does** carry the reserved ad slot, matching `/topics`, `/topics/[id]` and `/drills`. (Note for whoever implements it: `/` does *not* have one, so "every non-drill page has an ad slot" is not true and should not be used as the justification — the rule from the canvas spec §5 is that menus and landing pages *may* carry them and drill pages may not.)

Nothing else links to `/updates` yet. That is acceptable now only because the history is durable: the page is correct and complete whenever someone reaches it, whether from a live ribbon or a saved URL. If it ever deserves a permanent nav entry, that is a small, separate change.

## 4. Tagged releases

§2.5's command sequence gains a tag step after the merge:

```bash
git checkout main && git pull            # gh pr merge already fast-forwards, but be sure
DATE=$(date +%Y-%m-%d)
N=$(( $(git tag -l "$DATE-*" | wc -l) + 1 ))
git tag -a "$DATE-$N" -m "<PR title>" "$(git rev-parse HEAD)"
git push origin "$DATE-$N"
```

`git rev-parse HEAD` rather than a placeholder: after the merge and pull, `main`'s tip *is* the merge commit being tagged.

Annotated, not lightweight — the message carries the PR title, which is the same information density the rest of this repo already insists on (a decision-log entry has a reason; a tag should have more than a bare name). Date-plus-sequence, decided because two PRs already merged today and a bare date collides; sequence rather than a full timestamp keeps the readable date-only format every other date-keyed thing in this repo already uses (session log rows, `addedOn`, decision-log headers).

**One caveat worth stating, because the command hides it:** `$(date +%Y-%m-%d)` is the date you *run* the command, not the date the merge happened. They are the same when you tag right after merging, which is what the sequence above does. If you ever tag a merge from a previous day, write the date out by hand.

### 4.1 §2.5's existing commands are stale and get fixed in the same pass

AGENTS.md §2.5 currently documents:

```bash
GITHUB_TOKEN= gh pr create --fill   # the empty assignment is required; see §6
GITHUB_TOKEN= gh pr merge --merge --delete-branch
```

**That form no longer works, and §6 of the same file already says so** — a second keyring account appeared and the fallback now picks the wrong one, so the working invocation is `GH_TOKEN=$(gh auth token --user adamafzainizam) gh <cmd>`. §2.5 and §6 contradict each other today. Since this work edits that block anyway to add the tag step, the stale commands are corrected at the same time rather than having a step appended to a sequence whose other steps are known-wrong.

### 4.2 Backfill

`2026-09-14-1` on PR #27's merge commit (`5bfa75e`) and `2026-09-14-2` on PR #28's (`c4aef93`) — both verified as the merge commits for those PRs. Both are already fully known, unlike the seven historical dates the ribbon spec's decision log explicitly rejected backfilling, which would need hunting down the right commit for each. These two don't; they are the two most recent merges to `main`.

## 5. Testing

**`src/lib/ribbon.test.ts`** — rewritten around `allBatches`, replacing the `latestBatch` tests it removes:

- empty input → `[]`
- a single date, single topic → one batch, `byTopic` has one entry
- multiple dates → returned newest-first, each date's count independent of the others
- a date spanning multiple topics → `byTopic` has one entry per topic, each with its own count, sorted by count descending
- a deliberate tie in that sort → broken by `topicId`, so the comparator's second key is actually exercised rather than assumed
- **each batch's `byTopic` counts sum to that batch's own `count`** — the invariant that actually catches a grouping bug. A test that only checks the grand total across all batches cannot: material misfiled from one date into another, or from one topic into another within a date, leaves the grand total untouched
- `isFresh` tests carry over unchanged — nothing about freshness changed

**`src/drills/registry.test.ts`**:

- `getUpdateRibbon()`'s date/count still checked structurally against the real registry, as before (this doesn't change)
- `getUpdateNotes()`'s batch counts sum to the total number of drills — every drill appears in exactly one date and one topic. Asserted against `listDrillIds().length`, never a hardcoded 40, so it survives the catalogue growing
- `getUpdateNotes()`'s dates are strictly decreasing — newest-first, and no date appears twice
- every `topicId` in every breakdown is one of `TOPIC_IDS`, and every `title` is non-empty

  *Deliberately NOT* "the title equals `getTopic(topicId)!.title`" — `getUpdateNotes` computes it with that exact expression, so such a test would recompute its subject and pass against any join, correct or not. That is the tautological-assertion failure AGENTS.md §6 records from the generator's bounding-box test. What is checkable without recomputing is that the id is real and the title is not empty; the join being the *right* join is carried by types, since `getTopic` returns `null` for an unknown id and the `!` would throw.

**No automated test for the page itself**, for the same reason `UpdateRibbon.tsx` has none — there is no component test harness in this repo. Verified by rendering, the same way the ribbon was: `/updates` against a real dev server, reading it as someone who wants to know what changed.

**One thing the render check cannot tell you, so don't claim it does:** today all seven release dates fall within 30 days of now (the oldest, 2026-08-26, is 19 days old), so a filtered page and an unfiltered page are pixel-identical. The render proves the page lists batches and topics correctly; it proves nothing about windowing either way. Under this design that is fine, because the page has no window — but if anyone later adds one, its correctness has to come from a unit test, not a screenshot.

## 6. What this deliberately does not do

- **No pagination.** Seven batches today, and the list grows by one per release day. It will be years before that is unwieldy, and building for it now would be designing for a problem that does not exist.
- **No per-drill titles on the page.** A batch names its topics and their counts, not the individual exercises; the topic pages already list those, and the link is one click away.
- **No RSS/Atom feed.** Nobody has asked for one, and nothing else in this repo has anything like it.
- **No permanent nav link to `/updates`.** The ribbon is the only route in for now — see §3 for why that is tolerable once the history is durable, and why it was not under the earlier 30-day design.
- **No retroactive tags for the seven historical dates before 2026-09-14.** That decision was made and recorded in the ribbon spec's decision log, and nothing here reopens it.
