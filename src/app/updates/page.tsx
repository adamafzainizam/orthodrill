import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { getUpdateNotes } from "@/drills/registry";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Includes the year, unlike the ribbon's label — this page spans time. */
function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

/**
 * The update notes (AGENTS.md §2.10): every release, newest first.
 *
 * A SERVER component with no client half, deliberately. The ribbon reads the
 * VIEWER's clock because a build-time date would freeze into statically
 * prerendered HTML — but this page has no clock at all. Its content is a pure
 * function of the registry, identical for every viewer until a drill is
 * added, so it prerenders correctly and needs no JavaScript.
 *
 * THE WHOLE HISTORY, not a recent window. The ribbon says "this is new" and
 * stops being true; this says "this is what happened" and does not. An
 * earlier draft scoped this page to the ribbon's 30 days, which would have
 * made it unreachable exactly when it was empty — the ribbon is its only
 * inbound link, and it only renders while a batch is fresh. See the design
 * spec §1.
 */
export default function UpdatesPage() {
  const notes = getUpdateNotes();

  return (
    <>
      <AppHeader back="/" trail={[{ label: "Updates" }]} />
      <main className="mx-auto flex max-w-[52rem] flex-col gap-6 p-6">
        <div>
          <h1 className="t-display">What&apos;s new</h1>
          <p className="t-body mt-1.5 max-w-[60ch]" style={{ color: "var(--text-secondary)" }}>
            Every exercise added, newest first. The counts are read from the catalogue
            itself, so they cannot drift from what actually shipped.
          </p>
        </div>

        <ol className="flex flex-col gap-3">
          {notes.map((note) => (
            <li
              key={note.date}
              className="rounded-[var(--radius-md)] border px-4 py-3"
              style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)" }}
            >
              <p className="t-body font-medium" style={{ color: "var(--text-primary)" }}>
                {note.count} new exercise{note.count === 1 ? "" : "s"}
                <span className="t-small" style={{ color: "var(--text-tertiary)" }}>
                  {" "}— {formatDate(note.date)}
                </span>
              </p>
              <ul className="mt-2 flex flex-col gap-1">
                {note.byTopic.map((topic) => (
                  <li key={topic.topicId}>
                    <Link
                      href={`/topics/${topic.topicId}`}
                      className="t-small no-underline hover:underline"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {topic.count} in {topic.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </li>
          ))}
          {notes.length === 0 && <li className="t-small">No exercises yet.</li>}
        </ol>

        {/* Reserved ad slot. Menus and the landing page only, never an exercise page. */}
        <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
      </main>
    </>
  );
}
