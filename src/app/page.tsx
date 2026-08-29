import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { MethodDiagram } from "@/components/MethodDiagram";
import { ORTHOGRAPHIC_PREVIEW } from "@/drills/registry";

/**
 * A short landing — deliberately not a marketing page.
 *
 * Arriving straight at "Choose a topic" is abrupt: a reader has had no chance
 * to learn what this is before being asked to pick. This is the thin layer in
 * between. It says what the tool does, shows one drawing so the claim is
 * visible rather than asserted, and gets out of the way. One primary path in.
 */
export default function Home() {
  return (
    <>
      <AppHeader />
      {/* Centred in what is left below the header, so the page does not
          trail off into a void beneath the hero. */}
      <main className="mx-auto flex min-h-[calc(100svh-3.5rem)] max-w-[1100px] flex-col justify-center gap-10 px-6 py-12">
        <div className="grid items-center gap-10 md:grid-cols-[1.1fr_0.9fr]">
          <div className="flex flex-col items-start gap-5">
            <p className="t-label">Technical drawing practice</p>
            <h1 className="t-display" style={{ fontSize: "clamp(2rem, 1.2rem + 2.6vw, 3rem)" }}>
              Draw it. Get told exactly what&nbsp;is wrong.
            </h1>
            <p className="t-body max-w-[46ch]" style={{ color: "var(--text-secondary)" }}>
              Most drawing tools can&apos;t mark anything, and a tutor isn&apos;t there at 1am.
              This one knows the answer: draw a view, and it tells you which line is
              missing, which should be hidden, and whether you placed it in the right
              projection.
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

          {/* One drawing, so the claim above is shown rather than asserted.
              Illustrative only — not any exercise's answer. Unframed and
              blended into the page: at this size it is atmosphere, and a
              hard white panel would shout over the sentence it supports. */}
          <div aria-hidden="true" className="justify-self-center">
            <MethodDiagram
              primitives={ORTHOGRAPHIC_PREVIEW}
              caption=""
              variant="blend"
            />
          </div>
        </div>
      </main>
    </>
  );
}
