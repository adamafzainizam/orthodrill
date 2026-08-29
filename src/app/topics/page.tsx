import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { Backlight } from "@/components/Backlight";
import { MethodDiagram } from "@/components/MethodDiagram";
import { TOPIC_IDS, getTopic } from "@/topics/topics";
import { getDrill, listDrillIds, topicPreview } from "@/drills/registry";

/**
 * The topic chooser, as SECTIONS rather than a list of text cards.
 *
 * A topic is a kind of drawing, so the fastest way to say what one is, is to
 * show one. Each section carries an illustrative figure built server-side
 * from a solid or spec that is deliberately not any exercise's — it shows
 * what the topic looks like without solving anything a student will be asked.
 */
export default function TopicsPage() {
  const topics = TOPIC_IDS.map((id) => getTopic(id)!);
  const countFor = (topicId: string) =>
    listDrillIds().map((d) => getDrill(d)!).filter((d) => d.topicId === topicId).length;

  return (
    <>
      <AppHeader back="/" />
      <main className="mx-auto flex max-w-[1100px] flex-col gap-8 px-6 py-10">
        <div>
          <h1 className="t-display">Choose a topic</h1>
          <p className="t-body mt-1.5 max-w-[60ch]" style={{ color: "var(--text-secondary)" }}>
            Each one drills a different part of technical drawing, and marks what you draw.
          </p>
        </div>

        <Backlight className="flex flex-col gap-5">
          {topics.map((t) => {
            const preview = topicPreview(t.id);
            const count = countFor(t.id);
            return (
              <section key={t.id}>
                <Link
                  href={`/topics/${t.id}`}
                  data-backlit
                  className="grid gap-6 rounded-[var(--radius-lg)] border p-5 no-underline sm:grid-cols-[1fr_14rem] sm:items-center"
                  style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
                >
                  <div className="flex flex-col gap-2">
                    <h2 className="t-title" style={{ color: "var(--text-primary)" }}>{t.title}</h2>
                    <p className="t-small max-w-[52ch]">{t.blurb}</p>
                    <p className="t-label mt-1">
                      {count} {count === 1 ? "exercise" : "exercises"}
                    </p>
                  </div>

                  {preview !== null && (
                    /* The figure is decoration for the link's purposes — the
                       heading and blurb already name the topic — so it is
                       hidden from assistive tech rather than read out as a
                       wall of coordinates. */
                    <div aria-hidden="true" className="justify-self-center">
                      <MethodDiagram primitives={preview} caption="" />
                    </div>
                  )}
                </Link>
              </section>
            );
          })}
        </Backlight>

        {/* Reserved ad slot. Menus and the landing page only, never an exercise page. */}
        <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
      </main>
    </>
  );
}
