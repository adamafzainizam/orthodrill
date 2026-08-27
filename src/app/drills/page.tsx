import Link from "next/link";
import { getDrill, listDrillIds } from "@/drills/registry";

export default function DrillsPage() {
  const drills = listDrillIds().map((id) => getDrill(id)!);

  return (
    <main className="p-6 max-w-3xl mx-auto flex flex-col gap-4">
      <h1 className="text-2xl font-semibold">Choose a drill</h1>
      <ul className="flex flex-col gap-2">
        {drills.map((d) => (
          <li key={d.id}>
            <Link href={`/drills/${d.id}`} className="underline">
              {d.title}
            </Link>
            <span className="text-sm opacity-70">
              {" "}— {d.mode === "views"
                ? (d.convention === "first_angle" ? "first angle" : "third angle")
                : "construction"}
            </span>
          </li>
        ))}
      </ul>
      {/* Reserved ad slot. Menus and the landing page only, never a drill page. */}
      <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
    </main>
  );
}
