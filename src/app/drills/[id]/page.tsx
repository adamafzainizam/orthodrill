import { notFound } from "next/navigation";
import { Editor } from "@/components/Editor";
import { getDrill, publicHalf } from "@/drills/registry";

export default async function DrillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drill = getDrill(id);
  if (drill === null) notFound();

  // Only the public half crosses into the client component. The solid — which
  // IS the answer key, since generateViews turns it into the views — stays here.
  // No cast: registry's PublicDrill is structurally assignable to Editor's —
  // that assignability is the only thing left linking the two shapes, since
  // Editor.tsx must hand-duplicate the type rather than import it.
  const pub = publicHalf(drill);

  return <main className="p-6 max-w-6xl mx-auto"><Editor drill={pub} /></main>;
}
