/**
 * The topic's hints, shown beside the drawing.
 *
 * Not "use client" — a native `<details>` element needs no JavaScript to
 * collapse, so this renders as plain server-emitted HTML wherever it is
 * placed. Hints are teaching prose about the TOPIC, never about the one
 * exercise on screen (see `topics/topics.ts`'s header) — nothing here can
 * narrow the answer for whichever drill the student is looking at.
 *
 * The drawing surface is what matters; the sidebar is support. It is meant
 * to sit beside the drawing on a wide viewport and stack below it, out of
 * the sheet's way, on a narrow one — the caller's layout handles that (a
 * flex row that wraps to a column, right-hand column second), so this never
 * takes horizontal space away from the drawing regardless of the
 * `<details>` open/closed state. Open by default — the hints are worth
 * seeing without a click — with `<details>` giving the student a one-click
 * way to tuck them away once they don't need the reminder.
 *
 * No width classes of its own — it shares the right-hand column with the
 * pictorial/method diagram above it (page.tsx), so the column's own width
 * is the one place that decides that, not this component.
 */
import type { Hint, TopicId } from "@/topics/topics";

export type SidebarTopic = { id: TopicId; title: string; hints: readonly Hint[] };

export function Sidebar({ topic }: { topic: SidebarTopic }) {
  return (
    <aside className="w-full">
      <details className="rounded border border-[var(--rule)] bg-[var(--card)] p-3" open>
        <summary className="cursor-pointer text-sm font-semibold uppercase tracking-wider opacity-70">
          {topic.title} — hints
        </summary>
        <ul className="mt-3 flex flex-col gap-3">
          {topic.hints.map((h) => (
            <li key={h.title}>
              <p className="text-sm font-medium">{h.title}</p>
              <p className="text-sm opacity-80 mt-0.5">{h.body}</p>
            </li>
          ))}
        </ul>
      </details>
    </aside>
  );
}
