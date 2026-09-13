# Update Notes And The Ribbon — Design

**Date:** 2026-09-14
**Status:** approved, not yet implemented
**Implements:** AGENTS.md §2.10 ("New exercises ship announced"), item 2 of §4's "Next up".

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

This makes the git-derived date the source of truth going forward too: **a new drill's `addedOn` should be the date its commit lands**, not a date chosen for narrative effect.

## 3. Pure logic: `src/lib/ribbon.ts`

One function, I/O-free like everything else under `lib/`:

```ts
export type Batch = { date: string; count: number; topicId: TopicId | null };

export function latestBatch(entries: { addedOn: string; topicId: TopicId }[]): Batch | null
```

- Returns `null` for an empty registry (never happens today, but the function should not assume its caller).
- Finds the maximum `addedOn` across all entries, then all entries at that date form the batch.
- `topicId` is that shared id **only if every entry in the batch has the same one**; otherwise `null`. Both branches are exercised by real registry data today — 2026-09-06 and 2026-09-13 are single-topic (`reading-views`), 2026-08-28 and 2026-09-14 span multiple topics — so tests assert against the real registry's shape rather than needing synthetic fixtures to reach both branches.

This is the only new pure module. It is a single file, not a new `lib/` subdirectory — one function does not earn a directory the way `scoring/`, `geometry/` and `canvas/` did.

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

Nothing here is secret — `date`, `count` and `href` reveal nothing about any answer key — so this is safe to call from a server component exactly the way `topicPreview` already is.

## 5. Component: `UpdateRibbon.tsx`

A client component (dismissal needs `localStorage`), rendered explicitly by each page that wants it — the same explicit-per-page pattern `AppHeader`'s `back`/`trail` props already use, chosen deliberately over baking it into `AppHeader` itself so a future header refactor cannot accidentally carry it onto a drill page.

```tsx
"use client";
export function UpdateRibbon({ date, count, href }: { date: string; count: number; href: string }) {
  const [dismissed, setDismissed] = useState(true); // hidden until the effect below decides otherwise
  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(RIBBON_KEY) === date);
    } catch {
      setDismissed(false);
    }
  }, [date]);
  if (dismissed) return null;
  return (
    <div className="chrome-layer ..." role="status">
      <Link href={href}>{count} new exercise{count === 1 ? "" : "s"} added {formatDate(date)}</Link>
      <button aria-label="Dismiss" onClick={() => { try { localStorage.setItem(RIBBON_KEY, date); } catch {} setDismissed(true); }}>×</button>
    </div>
  );
}
```

- Starts hidden (`dismissed = true`) and only shows once the effect confirms it was not dismissed for *this* date — avoids a flash-then-hide, and means SSR output and first paint agree (nothing).
- Dismissal is keyed by date, so a later batch un-hides it for everyone automatically without any expiry logic.
- Wrapped in `try/catch` because `localStorage` can throw (private browsing, blocked storage) — degrade to "always show," never to a crash.

## 6. Wiring

`getUpdateRibbon()` is called server-side and the result passed down as a prop, rendered directly under `<AppHeader/>`, on:

- `/` (`src/app/page.tsx`)
- `/topics` (`src/app/topics/page.tsx`)
- `/topics/[id]` (`src/app/topics/[id]/page.tsx`)

**Never** on `/drills/[id]`. `/drills` (the plain drill list) is left alone — see §7.

## 7. Out of scope, found along the way

`src/app/drills/page.tsx` is orphaned: nothing in the app links to it, it predates the Studio Dark UI revamp (no `AppHeader`, plain Tailwind classes instead of the design-token scale), and it is only reachable by typing the URL. It is not part of this feature and won't be touched here, but it's worth a line in AGENTS.md §6 so it isn't mistaken for a maintained page later.

## 8. Testing

- `src/lib/ribbon.test.ts` — `latestBatch` against constructed fixtures: empty input → `null`; single date → that batch; multiple dates → only the max is counted; single-topic batch → `topicId` set; multi-topic batch → `topicId` null; a tie between two topics at the max date is still one batch (count sums across topics).
- `src/drills/registry.test.ts` — every drill's `addedOn` matches `/^\d{4}-\d{2}-\d{2}$/` (a mechanical guard so the next new exercise can't ship without one, the same class of guard as the existing squares-not-units check); `getUpdateRibbon()`'s `date` equals the max `addedOn` across the real registry and `count` equals the number of drills at that date — asserted structurally against `listDrillIds()`, not as a hardcoded number, so it does not need updating every time a drill is added.

## 9. What this deliberately does not do

- No separate `/updates` changelog page. The ribbon links straight into the topic menu where the new content actually lives; a changelog page with content for *past* batches is more scope than §2.10 asks for and can be added later without touching anything here.
- No cross-session/server-side "seen" tracking. Dismissal is a `localStorage` per-viewer convenience, consistent with how the rest of the app already treats client-only preferences (canvas paper theme is planned the same way).
