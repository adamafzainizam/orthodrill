import { notFound } from "next/navigation";
import { Editor, type PublicDrill } from "@/components/Editor";
import { getDrill, publicHalf } from "@/drills/registry";

export default async function DrillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const drill = getDrill(id);
  if (drill === null) notFound();

  // Only the public half crosses into the client component. The solid — which
  // IS the answer key, since generateViews turns it into the views — stays here.
  const pub = publicHalf(drill) as PublicDrill;

  return <main className="p-6 max-w-6xl mx-auto"><Editor drill={pub} /></main>;
}
