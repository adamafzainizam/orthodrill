import Link from "next/link";
import { notFound } from "next/navigation";
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
    <main className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{topic.title}</h1>
        <p className="max-w-[65ch] mt-1 opacity-80">{topic.blurb}</p>
      </div>
      <ul className="flex flex-col gap-2">
        {exercises.map((d) => (
          <li key={d.id}>
            <Link href={`/drills/${d.id}`} className="underline">
              {d.title}
            </Link>
            <span className="text-sm opacity-70">
              {" "}— {d.mode === "views"
                ? (d.convention === "first_angle" ? "first angle" : "third angle")
                : "construction"}
            </span>
          </li>
        ))}
        {exercises.length === 0 && (
          <li className="text-sm opacity-70">No exercises for this topic yet.</li>
        )}
      </ul>
      {/* Reserved ad slot. Menus and the landing page only, never an exercise page. */}
      <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
    </main>
  );
}
