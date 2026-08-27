/**
 * GET /api/drills — the catalogue: ids and titles only.
 *
 * Enough to build a menu, and nothing that helps anyone answer a drill.
 */
import { getDrill, listDrillIds } from "../../../drills/registry.ts";

export async function GET(): Promise<Response> {
  const drills = listDrillIds().map((id) => {
    const d = getDrill(id)!;
    return {
      id: d.id,
      title: d.title,
      topicId: d.topicId,
      mode: d.mode,
      // Only a "views" exercise has a convention to place its views by.
      convention: d.mode === "views" ? d.convention : null,
    };
  });
  return Response.json({ drills });
}
