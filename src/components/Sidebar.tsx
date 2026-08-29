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
 * `<details>` open/closed state. EACH hint collapses on its own and only the
 * first is open: four hints stacked open is exactly the wall of text this
 * panel exists to replace. The titles are written to be scannable on their
 * own, so a student can find the one that matches their problem and open
 * only that.
 *
 * No width classes of its own — it shares the right-hand column with the
 * pictorial/method diagram above it (page.tsx), so the column's own width
 * is the one place that decides that, not this component.
 */
import type { Hint, TopicId } from "@/topics/topics";

export type SidebarTopic = { id: TopicId; title: string; hints: readonly Hint[] };

export function Sidebar({ topic }: { topic: SidebarTopic }) {
  return (
    <aside
      className="w-full rounded-[var(--radius-lg)] border overflow-hidden"
      style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
    >
      <p className="t-label px-4 pt-3.5 pb-2">{topic.title} — hints</p>

      <ul className="flex flex-col">
        {topic.hints.map((h, i) => (
          <li key={h.title} className="border-t" style={{ borderColor: "var(--border-subtle)" }}>
            {/* EACH hint collapses on its own, and only the first is open.
                Four hints stacked open is the wall of text this panel was
                built to replace — the titles alone should be scannable, with
                the prose one click away when a particular one is the problem. */}
            <details open={i === 0} className="group">
              <summary
                className="pressable t-body flex cursor-pointer list-none items-start gap-2 px-4 py-2.5 font-medium marker:content-none"
                style={{ color: "var(--text-primary)" }}
              >
                {/* flex, not an inline glyph: a title that wraps to a second
                    line must align under itself rather than under the chevron. */}
                <span
                  aria-hidden="true"
                  className="mt-px shrink-0 transition-transform group-open:rotate-90"
                  style={{ color: "var(--text-tertiary)" }}
                >
                  ›
                </span>
                <span>{h.title}</span>
              </summary>
              <p className="t-small px-4 pb-3.5 pl-[2.1rem]" style={{ color: "var(--text-secondary)" }}>
                {h.body}
              </p>
            </details>
          </li>
        ))}
      </ul>
    </aside>
  );
}
