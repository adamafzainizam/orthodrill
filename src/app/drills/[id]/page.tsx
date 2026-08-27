import { notFound } from "next/navigation";
import { Editor } from "@/components/Editor";
import { Sidebar } from "@/components/Sidebar";
import { getDrill, publicHalf } from "@/drills/registry";

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

  return (
    <main className="p-6 max-w-6xl mx-auto">
      {/* flex-col on a narrow viewport stacks the sidebar BELOW the drawing,
          so it never takes horizontal space away from the sheet — the thing
          that actually matters here (Sidebar.tsx). */}
      <div className="flex flex-col lg:flex-row lg:items-start gap-6">
        <div className="flex-1 min-w-0"><Editor drill={pub} /></div>
        <Sidebar topic={pub.topic} />
      </div>
    </main>
  );
}
