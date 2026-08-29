import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Editor } from "@/components/Editor";
import { Pictorial } from "@/components/Pictorial";
import { MethodDiagram } from "@/components/MethodDiagram";
import { Sidebar } from "@/components/Sidebar";
import { getDrill, publicHalf, PARABOLA_METHOD_DIAGRAM } from "@/drills/registry";

export default async function DrillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drill = getDrill(id);
  if (drill === null) notFound();

  // Only the public half crosses into the client component. The solid — which
  // IS the answer key, since generateViews turns it into the views — stays here.
  // No cast: registry's PublicDrill is structurally assignable to Editor's —
  // that assignability is the only thing left linking the two shapes, since
  // Editor.tsx must hand-duplicate the type rather than import it. Sidebar
  // gets only `pub.topic` — id, title and hints — never the drill itself.
  const pub = publicHalf(drill);

  // Reference material for the right-hand column: the isometric pictorial
  // for a "views" exercise, or a worked method diagram for a "figure" one.
  // Both are computed server-side in registry.ts (the pictorial per-drill
  // from the solid, the diagram once at module load from a fixed n distinct
  // from any exercise's — see PARABOLA_METHOD_DIAGRAM's docstring) and cross
  // into the client tree only as plain primitive data, the same way the
  // pictorial's paint program always has. Gated on the topic, not just the
  // mode, so a future "figure" topic with no diagram of its own renders
  // nothing here rather than showing the wrong worked example.
  const reference = pub.mode === "views"
    ? (
      <section
        className="rounded-[var(--radius-lg)] border p-3"
        style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
      >
        <p className="t-label mb-2">The part</p>
        <Pictorial primitives={pub.isometric} dimensions={pub.dimensions} />
      </section>
    )
    : pub.topic.id === "parabola"
      ? (
        <MethodDiagram
          primitives={PARABOLA_METHOD_DIAGRAM}
          caption="Worked example: the rectangle method (n = 3) — illustrates the method only, not this exercise's answer."
        />
      )
      : null;

  return (
    <>
      <AppHeader
        trail={[
          { label: pub.topic.title, href: `/topics/${pub.topic.id}` },
          { label: pub.title },
        ]}
      />
      <main className="p-6 max-w-[1600px] mx-auto">
      {/* flex-col on a narrow viewport stacks the right column BELOW the
          drawing, so it never takes horizontal space away from the sheet —
          the thing that actually matters here. The sheet wants ~1000px of
          its own on a wide viewport, which is why the page is far wider
          than a typical max-w-6xl content column. */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="flex-1 min-w-0"><Editor drill={pub} /></div>
        <div className="w-full lg:w-[21rem] lg:shrink-0 flex flex-col gap-4">
          {reference}
          <Sidebar topic={pub.topic} />
        </div>
      </div>
      </main>
    </>
  );
}
