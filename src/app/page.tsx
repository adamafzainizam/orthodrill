import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { MethodDiagram } from "@/components/MethodDiagram";
import { TOPIC_IDS, getTopic } from "@/topics/topics";
import { topicPreview } from "@/drills/registry";

/**
 * A short landing — deliberately not a marketing page.
 *
 * Arriving straight at "Choose a topic" is abrupt: a reader has had no chance
 * to learn what this is before being asked to pick. This is the thin layer in
 * between. It says what the tool does, shows the drawings so the claim is
 * visible rather than asserted, and gets out of the way. One primary path in.
 *
 * THE FIGURES ARE DRIVEN BY THE TOPIC LIST, not hard-coded. This page used to
 * show one three-view drawing and describe the product as if orthographic
 * projection were all of it — which was true once and stopped being true. A
 * new topic with a preview now appears here on its own, so the front page
 * cannot quietly go stale about what the tool covers.
 */
export default function Home() {
  const previews = TOPIC_IDS
    .map((id) => ({ topic: getTopic(id)!, figure: topicPreview(id) }))
    .filter((p): p is { topic: NonNullable<ReturnType<typeof getTopic>>; figure: NonNullable<ReturnType<typeof topicPreview>> } => p.figure !== null);

  return (
    <>
      <AppHeader />
      {/* Centred in what is left below the header, so the page does not
          trail off into a void beneath the hero. */}
      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-[1100px] flex-col justify-center gap-10 px-6 py-12">
        <div className="grid items-center gap-10 md:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col items-start gap-5">
            <p className="t-label">Technical drawing practice</p>
            <h1 className="t-display" style={{ fontSize: "clamp(2rem, 1.2rem + 2.6vw, 3rem)" }}>
              Draw it. Get told exactly what&nbsp;is wrong.
            </h1>
            <p className="t-body max-w-[48ch]" style={{ color: "var(--text-secondary)" }}>
              Drawing tools can&apos;t mark anything, and a tutor isn&apos;t there at 1am.
              This one knows the answer, so it can name the line you missed, the edge
              that should have been hidden, and the step where a construction went wrong.
            </p>
            {/* Named from the topic list rather than written out, so this
                sentence cannot go stale the way the old copy did. */}
            <p className="t-small max-w-[48ch]">
              Topics so far: {previews.map((p) => p.topic.title).join(", ")}. More of
              technical drawing is on the way.
            </p>
            <Link
              href="/topics"
              data-backlit
              className="pressable t-body rounded-[var(--radius-md)] px-5 py-2.5 font-semibold no-underline"
              style={{ background: "var(--select)", color: "#fff", boxShadow: "var(--shadow-sm)" }}
            >
              Start drawing
            </Link>
            <p className="t-small" style={{ color: "var(--text-tertiary)" }}>
              No account. Nothing to install.
            </p>
          </div>

          {/* One figure per topic, so the range is shown rather than claimed.
              Illustrative only — every one is built from a solid or spec that
              is deliberately not any exercise's. */}
          <div aria-hidden="true" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            {previews.map(({ topic, figure }) => (
              <MethodDiagram key={topic.id} primitives={figure} caption="" variant="blend" />
            ))}
          </div>
        </div>
      </main>
    </>
  );
}
