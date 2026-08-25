/**
 * The isometric prompt image: the picture a student is shown.
 *
 * This is the PUBLIC half of a drill. It is never compared against anything and
 * never scored, which is why its primitives are deliberately incompatible with
 * the scorer's — see isotypes.ts.
 *
 * Coordinates carry no pixel scale and no viewport. The renderer fits them to
 * whatever space the page layout leaves.
 *
 * PURE. No I/O.
 */
import { buildOccupancy } from "./occupancy.ts";
import { isoEdges } from "./isoedges.ts";
import { isoBore } from "./isobore.ts";
import { validateSolid } from "./views.ts";
import type { Solid } from "./solid.ts";
import type { IsoPrimitive } from "./isotypes.ts";

export function isometricView(s: Solid): IsoPrimitive[] {
  // The same gate the views generator uses: a solid v1 cannot model should be
  // refused, not drawn confidently.
  validateSolid(s);

  const occ = buildOccupancy(s);

  // Bores are interleaved by paint depth, not appended: this array is a
  // back-to-front paint program, so an ellipse added at the end would be drawn
  // on top of anything that occludes the face its rim sits on.
  const extras: { t: number; prim: IsoPrimitive }[] = [];
  for (const op of s.ops) {
    if (op.kind !== "cylinder") continue;
    const bore = isoBore(op, occ);
    if (bore !== null) extras.push({ t: bore.t, prim: bore.ellipse });
  }

  return isoEdges(occ, extras);
}
