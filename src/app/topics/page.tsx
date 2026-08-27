import Link from "next/link";
import { TOPIC_IDS, getTopic } from "@/topics/topics";

export default function TopicsPage() {
  const topics = TOPIC_IDS.map((id) => getTopic(id)!);

  return (
    <main className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Choose a topic</h1>
      <ul className="flex flex-col gap-4">
        {topics.map((t) => (
          <li key={t.id}>
            <Link href={`/topics/${t.id}`} className="underline text-lg">
              {t.title}
            </Link>
            <p className="text-sm opacity-70 max-w-[65ch]">{t.blurb}</p>
          </li>
        ))}
      </ul>
      {/* Reserved ad slot. Menus and the landing page only, never an exercise page. */}
      <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
    </main>
  );
}
