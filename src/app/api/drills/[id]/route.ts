/**
 * GET /api/drills/[id] — the public half of a drill.
 *
 * The pictorial is computed here rather than shipped in the client bundle,
 * because computing it needs the SOLID, and the solid is the answer key in
 * compressed form: anyone holding it runs the generator and has the three
 * correct views. Serving the derived picture keeps the derivation server-side.
 */
import { getDrill, publicHalf } from "../../../../drills/registry.ts";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const drill = getDrill(id);
  if (drill === null) {
    return Response.json({ ok: false, reason: "NO_SUCH_DRILL" }, { status: 404 });
  }
  return Response.json(publicHalf(drill));
}
