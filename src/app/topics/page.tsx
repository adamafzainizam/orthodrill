import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { TOPIC_IDS, getTopic } from "@/topics/topics";

export default function TopicsPage() {
  const topics = TOPIC_IDS.map((id) => getTopic(id)!);

  return (
    <>
      <AppHeader />
      <main className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="t-display">Choose a topic</h1>
        <p className="t-body mt-1 max-w-[60ch]" style={{ color: "var(--text-secondary)" }}>
          Each topic drills one part of technical drawing, and marks what you draw.
        </p>
      </div>
      <ul className="flex flex-col gap-3">
        {topics.map((t) => (
          <li key={t.id}>
            <Link
              href={`/topics/${t.id}`}
              className="pressable block rounded-[var(--radius-lg)] border p-4 no-underline"
              style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
            >
              <span className="t-title block" style={{ color: "var(--text-primary)" }}>{t.title}</span>
              <span className="t-small mt-1 block max-w-[60ch]">{t.blurb}</span>
            </Link>
          </li>
        ))}
      </ul>
      {/* Reserved ad slot. Menus and the landing page only, never an exercise page. */}
      <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
      </main>
    </>
  );
}
