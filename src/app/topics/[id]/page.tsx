import Link from "next/link";
import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { getTopic } from "@/topics/topics";
import { getDrill, listDrillIds } from "@/drills/registry";

export default async function TopicPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const topic = getTopic(id);
  if (topic === null) notFound();

  const exercises = listDrillIds()
    .map((drillId) => getDrill(drillId)!)
    .filter((d) => d.topicId === topic.id);

  return (
    <>
      <AppHeader trail={[{ label: topic.title }]} />
      <main className="p-6 max-w-3xl mx-auto flex flex-col gap-6">
      <div>
        <h1 className="t-display">{topic.title}</h1>
        <p className="t-body mt-1.5 max-w-[60ch]" style={{ color: "var(--text-secondary)" }}>{topic.blurb}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {exercises.map((d) => (
          <li key={d.id}>
            <Link
              href={`/drills/${d.id}`}
              className="pressable flex items-baseline justify-between gap-4 rounded-[var(--radius-md)] border px-4 py-3 no-underline"
              style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)" }}
            >
              <span className="t-body font-medium" style={{ color: "var(--text-primary)" }}>{d.title}</span>
              {/* The convention is the single fact that changes how the whole
                  sheet is laid out, so it earns a place in the list rather
                  than waiting to be discovered on the exercise itself. */}
              <span className="t-small shrink-0" style={{ color: "var(--text-tertiary)" }}>
                {d.mode === "views"
                  ? (d.convention === "first_angle" ? "first angle" : "third angle")
                  : "construction"}
              </span>
            </Link>
          </li>
        ))}
        {exercises.length === 0 && (
          <li className="t-small">No exercises for this topic yet.</li>
        )}
      </ul>
      {/* Reserved ad slot. Menus and the landing page only, never an exercise page. */}
      <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
      </main>
    </>
  );
}
