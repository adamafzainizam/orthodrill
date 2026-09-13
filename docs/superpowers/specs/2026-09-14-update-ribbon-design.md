# Update Notes And The Ribbon — Design

**Date:** 2026-09-14
**Status:** approved, not yet implemented
**Implements:** AGENTS.md §2.10 ("New exercises ship announced") — the RIBBON half of it. Part of item 2 of §4's "Next up"; see §9 for what that item still leaves open.

---

## 1. What changes

Every new drill already carries a release date in spirit — the session log records when each batch shipped — but that fact lives only in prose, and only ten of forty drills (`reading-views`, mode `"build"`) carry it as data at all. This gives the site a way to say, mechanically and without hand-authored copy, "N new exercises were added on DATE," and to point a reader at them.

Two things stay fixed from AGENTS.md and are not up for revisiting here:

- **The ribbon never appears on a drill page.** Same rule, same reasoning, as the reserved ad slot: a drill page is where the student is working, and nothing should compete for that attention.
- **Counts are derived from the registry, never authored.** A hand-written "5 new exercises" that says five when three shipped is the parabola-hint failure class exactly — authored prose beside content, verified by nothing.

## 2. Data: `addedOn` becomes universal

`BuildDrill` already carries `addedOn: string` (ISO date). `ViewsDrill` and `FigureDrill` do not have the field at all. Both gain it, required, same comment as `BuildDrill`'s: `/** ISO date. Derived content for the update ribbon (AGENTS.md §2.10). */`.

**Backfill is sourced from git history, not memory or the session log's prose.** For each of the 30 drills missing the field, `git log -S"id: \"<drill-id>\"" --format='%ad' --date=short -- src/drills/registry.ts | tail -1` gives the exact date that id first appeared in a commit — i.e. the date it actually shipped. This was run for all 30 and cross-checked against the session log's prose wherever the log gives a date; every value agreed (e.g. `parabola-rectangle-5` → 2026-08-27, matching the log's account of when the first parabola exercise shipped). Resulting batches:

| Date | Count | Drills |
|---|---|---|
| 2026-08-26 | 4 | `step-block`, `corner-cut`, `plate-with-bore`, `stepped-plate-bore` |
| 2026-08-27 | 1 | `parabola-rectangle-5` |
| 2026-08-28 | 6 | `hidden-groove`, `near-mirror-notches`, `bore-along-length`, `step-and-notch`, `parabola-rectangle-4`, `parabola-rectangle-6` |
| 2026-09-02 | 6 | `oblique-cavalier-step`, `oblique-cabinet-step`, `oblique-general-step`, `oblique-cabinet-notch`, `oblique-from-views-cavalier`, `oblique-from-views-cabinet` |
| 2026-09-06 | 2 | `build-corner-step`, `build-offset-notch` *(already set)* |
| 2026-09-13 | 8 | the eight remaining `build-*` drills *(already set)* |
| 2026-09-14 | 13 | `window-through-plate`, `pocketed-plate`, the seven non-parabola `constructions` drills, `oblique-from-views-general-first`, `oblique-from-views-general-third`, `oblique-from-views-cavalier-third`, `oblique-from-views-cabinet-first` |

Forty in total, which is the catalogue.

### 2.1 `addedOn` is AUTHORED, and the guard only checks its shape

This matters enough to state outright, because the rest of this document is about a number that is *derived* and it would be easy to read the date as derived too. It is not. Each date is a hand-typed string in `registry.ts`. Git history is where the backfill values came from, and it is the right source for new ones — **a new drill's `addedOn` should be the date its commit lands** — but nothing in the running app or the test suite verifies that a given date matches the commit that introduced it.

So the honest statement of what is checked:

- The **count** is derived from the registry and cannot disagree with it. (§2.10's actual requirement.)
- The **date** is authored. §8's regex checks that it *looks* like `YYYY-MM-DD`, never that it is true.

A future-dated typo is the failure this asymmetry actually permits — `addedOn: "2027-01-01"` on a drill shipping today would pin the ribbon to that batch forever, and every guard would stay green. §8 adds the cheap assertion that catches it. Asserting each date against `git log` was considered and rejected: it makes the suite depend on history that rebases and squashes rewrite, and it would fail for reasons that have nothing to do with the catalogue.

## 3. Pure logic: `src/lib/ribbon.ts`

Two functions, both I/O-free and **clock-free**, like everything else under `lib/`:

```ts
export type Batch<Id extends string> = { date: string; count: number; topicId: Id | null };

export function latestBatch<Id extends string>(
  entries: { addedOn: string; topicId: Id }[],
): Batch<Id> | null;

/** Whether a batch is recent enough to still be announced. See §3.1. */
export function isFresh(date: string, now: Date, windowDays?: number): boolean;
```

`latestBatch`:

- Returns `null` for an empty registry (never happens today, but the function should not assume its caller).
- Finds the maximum `addedOn` across all entries; all entries at that date form the batch.
- `topicId` is that shared id **only if every entry in the batch has the same one**; otherwise `null`.

Generic over `Id extends string` rather than importing `TopicId`, so **this module imports nothing at all**. That is both the cleanest possible statement of "pure" and what makes it safe for the client component in §5 to import directly — it has no transitive path to anything key-bearing, which is the hazard AGENTS.md §6 records about `isolation.test.ts` reading direct imports only.

### 3.1 Freshness, and why the clock is on the client

"Latest batch only" with no expiry means that if nothing ships for six months, every menu page still announces "13 new exercises added 14 September" in March. The count stays true while the word *new* quietly stops being. So the ribbon is suppressed once its batch is older than **30 days** — chosen against this project's real cadence (26, 27, 28 Aug; 2, 6, 13, 14 Sep), which a 30-day window would have kept lit continuously, going dark only when there genuinely is nothing new.

**The age comparison happens in the browser, not on the server, and that is not a detail.** `/` and `/topics` are statically prerendered (`○` in the Next build output). A server-side `new Date()` would be evaluated at BUILD time and frozen into the static HTML — so the decision would be stale in exactly the case it exists to handle, because "nothing has shipped for months" is the same thing as "there has been no rebuild for months". The viewer's own clock is the only one that is telling the truth here.

Hence `isFresh(date, now, windowDays)` takes `now` as an argument: the clock enters at the one call site in §5's effect, and the function itself stays pure and testable at fixed dates.

## 4. Registry export: `getUpdateRibbon()`

In `src/drills/registry.ts`, alongside the existing derived-public-getters like `topicPreview`:

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

Nothing here is secret — `date`, `count` and `href` reveal nothing about any answer key — so this is safe to call from a server component exactly the way `topicPreview` already is. It performs **no freshness check**, for the build-time reason in §3.1; it reports what the newest batch is, and §5 decides whether to announce it.

## 5. Component: `UpdateRibbon.tsx`

A client component (dismissal and the freshness check both need the browser), rendered explicitly by each page that wants it — the same explicit-per-page pattern `AppHeader`'s `back`/`trail` props already use, chosen deliberately over baking it into `AppHeader` itself so a future header refactor cannot accidentally carry it onto a drill page.

```tsx
"use client";
const RIBBON_KEY = "orthodrill:ribbon-dismissed";

export function UpdateRibbon({ date, count, href }: { date: string; count: number; href: string }) {
  const [show, setShow] = useState(false); // hidden until the effect below decides otherwise
  useEffect(() => {
    if (!isFresh(date, new Date())) return; // a stale batch is never announced
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
    <div className="chrome-layer ...">
      <Link href={href}>{count} new exercise{count === 1 ? "" : "s"} added {formatDate(date)}</Link>
      <button aria-label="Dismiss" onClick={() => {
        try { localStorage.setItem(RIBBON_KEY, date); } catch {}
        setShow(false);
      }}>×</button>
    </div>
  );
}
```

- Starts hidden and only shows once the effect confirms the batch is fresh AND undismissed — so SSR output and first client paint agree (nothing), with no flash-then-hide.
- Dismissal is keyed by date, so a later batch un-hides it for everyone automatically without any expiry bookkeeping.
- `localStorage` reads and writes are both wrapped: it throws in private-browsing and blocked-storage configurations. Degrade to "show it", never to a crash.
- **No `role="status"`.** A live region is announced on every navigation to every menu page, which for a persistent banner is noise rather than help. It is ordinary markup; the dismiss control carries an `aria-label` and that is the whole accessibility surface.
- Consequence worth accepting knowingly: the ribbon does not exist without JavaScript, and crawlers will not see it. For an announcement banner on a drawing tool that is already useless without JS, that costs nothing.

## 6. Wiring

`getUpdateRibbon()` is called server-side and the result passed down as a prop, rendered directly under `<AppHeader/>`, on:

- `/` (`src/app/page.tsx`)
- `/topics` (`src/app/topics/page.tsx`)
- `/topics/[id]` (`src/app/topics/[id]/page.tsx`)

**Never** on `/drills/[id]`. `/drills` (the plain drill list) is left alone — see §7.

When `getUpdateRibbon()` returns `null` — an empty catalogue, which cannot happen today — the page renders no ribbon and nothing else changes. Pages should not construct a placeholder or reserve space for it.

## 7. Out of scope, found along the way

Two things this work sits next to and deliberately does not fix:

**`src/app/drills/page.tsx` is orphaned.** Nothing in the app links to it, it predates the Studio Dark UI revamp (no `AppHeader`, plain Tailwind classes instead of the design-token scale), and it is only reachable by typing the URL. Not part of this feature; worth a line in AGENTS.md §6 so it isn't mistaken for a maintained page later.

**`isolation.test.ts`'s `SERVER_ONLY` list has drifted.** It names `geometry/parabola` but not `geometry/constructions` or `geometry/oblique`, all three of which derive answer keys the same way. Nothing violates it today — only `registry.ts` imports them, and `registry.ts` is allowed — so this is latent rather than live. But the guard would catch a client component importing `parabola.ts` and wave through the identical import of `constructions.ts`, which shipped yesterday. It is a one-line regex change plus the positive control that file already has a pattern for, and it belongs in **its own small commit**, not in the ribbon's.

## 8. Testing

**`src/lib/ribbon.test.ts`** — against constructed fixtures, because the real registry cannot reach every branch (see the note below):

- empty input → `null`
- a single date → that batch, with its count
- multiple dates → only the maximum is counted, and older entries do not inflate it
- a batch whose entries share one topic → `topicId` is that id
- a batch spanning two topics → `topicId` is `null`, and `count` sums across both
- `isFresh` at fixed `now` values: inside the window, outside it, and exactly on the boundary

**The single-topic case needs a positive control, and this is the point of the whole section.** `getUpdateRibbon()` only ever calls `latestBatch` over the *whole* registry, which yields exactly one batch — the newest. Today's newest (2026-09-14) spans three topics, and the batches that are single-topic (2026-08-26, 2026-09-06, 2026-09-13) are never *latest*. So the `topicId !== null → /topics/{id}` branch is **unreachable through real registry data**, and a suite that tested only against the real registry would pass just as happily against a hardcoded `href: "/topics"`. That is AGENTS.md §6's recorded failure class twice over — the `views` field that always said all three, and the property test that passed with the property deleted. **Confirm the single-topic test fails against a hardcoded `"/topics"` before trusting it.**

**`src/drills/registry.test.ts`:**

- every drill's `addedOn` matches `/^\d{4}-\d{2}-\d{2}$/` — a mechanical guard so the next new exercise cannot ship without one, the same class as the existing squares-not-units check
- **no drill's `addedOn` is in the future**, which is the typo class §2.1 leaves open. Allow one day of slack against the test machine's clock, so a drill dated today cannot fail spuriously on a machine whose timezone has not rolled over yet
- `getUpdateRibbon()`'s `date` equals the maximum `addedOn` across the real registry and its `count` equals the number of drills at that date — asserted structurally against `listDrillIds()`, never as a hardcoded number, so it does not need updating every time a drill is added

## 9. What this deliberately does not do

**It does not close §4 item 2.** That item bundles three things, and this ships one and a half of them:

- *The ribbon* — shipped here.
- *Update notes* — **not shipped.** §2.10 asks for notes carrying a date *and* a ribbon announcing them; there is no `/updates` page and no written notes, because the ribbon links straight into the topic menu where the new content actually lives. A changelog page with content for past batches is more scope than the ribbon needs and can be added later without touching anything here. AGENTS.md §4 should keep item 2 open, reduced to this.
- *Tagged releases* — **not shipped.** `git tag` still returns nothing across 27 merged PRs despite §2.5 claiming tagged releases. Retroactively tagging the seven historical dates means hunting the right commit for each and is not worth it; from the next release forward a date-keyed tag can be cut at merge, now that the dates are data. Recorded here rather than left silent so the next session does not rediscover it as a surprise.

No cross-session or server-side "seen" tracking. Dismissal is a `localStorage` per-viewer convenience, consistent with how the rest of the app already treats client-only preferences (the canvas paper theme is planned the same way).
