import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { Editor } from "@/components/Editor";
import { Pictorial } from "@/components/Pictorial";
import { MethodDiagram } from "@/components/MethodDiagram";
import { Sidebar } from "@/components/Sidebar";
import {
  getDrill, publicHalf, PARABOLA_METHOD_DIAGRAM, OBLIQUE_METHOD_DIAGRAM,
} from "@/drills/registry";

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
  const card = (label: string, body: React.ReactNode) => (
    <section
      className="rounded-[var(--radius-lg)] border p-3"
      style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
    >
      <p className="t-label mb-2">{label}</p>
      {body}
    </section>
  );

  // THE PART, when there is one to depict. A views exercise always has one;
  // a figure exercise has one only if its topic redraws a solid, which
  // oblique does and the parabola does not. Keyed on the field being present
  // rather than on the topic id, so a future topic that carries a pictorial
  // gets it without another branch here.
  const part = pub.isometric !== undefined && pub.dimensions !== undefined
    ? card("The part", <Pictorial primitives={pub.isometric} dimensions={pub.dimensions} />)
    : null;

  // THE METHOD, gated on the TOPIC rather than the mode, so a future topic
  // with no worked example of its own renders nothing here rather than
  // showing someone else's — which would be a worked answer to the wrong
  // question.
  const method = pub.topic.id === "parabola"
    ? card("The method", (
      <MethodDiagram
        primitives={PARABOLA_METHOD_DIAGRAM}
        caption="Worked example: the rectangle method (n = 3) — illustrates the method only, not this exercise's answer."
      />
    ))
    : pub.topic.id === "oblique"
      ? card("The method", (
        <MethodDiagram
          primitives={OBLIQUE_METHOD_DIAGRAM}
          caption="Worked example: a plain block in cavalier oblique, with the 45° receding axis marked — illustrates the method only, not this exercise's answer."
        />
      ))
      : null;

  const reference = (part !== null || method !== null)
    ? <>{part}{method}</>
    : null;

  return (
    <>
      <AppHeader
        back={`/topics/${pub.topic.id}`}
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
