/**
 * Project an occupancy grid along one line of sight into unit-length edges,
 * each tagged visible or hidden.
 *
 * Faces perpendicular to the line of sight project to areas, not lines, and so
 * draw nothing. Only faces PARALLEL to the line of sight become edges, and every
 * such face sits on the boundary between two adjacent cell columns.
 *
 * For each boundary line, walking from nearest to farthest:
 *   - a FACE exists at depth t when exactly one adjacent column has material;
 *   - the line becomes OCCLUDED from t onward when BOTH adjacent columns have
 *     material, because it is then buried inside solid;
 *   - the edge is visible when the first face found is not yet occluded.
 * Only the first face matters, because occlusion never reverses.
 *
 * This is exact rather than approximate: only the two adjacent columns can
 * cover the line.
 *
 * PURE. No I/O.
 */
import { sizeAlong, type Occupancy } from "./occupancy.ts";
import type { ViewSpec } from "./viewspec.ts";
import type { Axis } from "./solid.ts";

export type UnitEdge = { u: number; v: number; along: "u" | "v"; hidden: boolean };

/** Is the cell at screen column (a, b) and depth index t solid? */
function cellAt(o: Occupancy, spec: ViewSpec, a: number, b: number, t: number): boolean {
  const T = sizeAlong(o, spec.depth);
  const depthIndex = spec.nearIsLow ? t : T - 1 - t;
  const coord: Record<Axis, number> = { x: 0, y: 0, z: 0 };
  coord[spec.su] = a;
  coord[spec.sv] = b;
  coord[spec.depth] = depthIndex;
  return o.isSolid(coord.x, coord.y, coord.z);
}

/**
 * Walk one boundary line from near to far.
 * Returns null when the line carries no face at all.
 */
function classify(
  T: number,
  lo: (t: number) => boolean, hi: (t: number) => boolean,
): boolean | null {
  let occluded = false;
  for (let t = 0; t < T; t++) {
    const a = lo(t), b = hi(t);
    if (a !== b) return occluded;   // first face decides
    if (a && b) occluded = true;    // buried from here on
  }
  return null;
}

export function extractEdges(o: Occupancy, spec: ViewSpec): UnitEdge[] {
  const U = sizeAlong(o, spec.su);
  const V = sizeAlong(o, spec.sv);
  const T = sizeAlong(o, spec.depth);
  const edges: UnitEdge[] = [];

  // Edges running along u, sitting on v boundaries 0..V.
  for (let b = 0; b <= V; b++) {
    for (let a = 0; a < U; a++) {
      const h = classify(T,
        (t) => (b > 0 ? cellAt(o, spec, a, b - 1, t) : false),
        (t) => (b < V ? cellAt(o, spec, a, b, t) : false));
      if (h !== null) edges.push({ u: a, v: b, along: "u", hidden: h });
    }
  }

  // Edges running along v, sitting on u boundaries 0..U.
  for (let a = 0; a <= U; a++) {
    for (let b = 0; b < V; b++) {
      const h = classify(T,
        (t) => (a > 0 ? cellAt(o, spec, a - 1, b, t) : false),
        (t) => (a < U ? cellAt(o, spec, a, b, t) : false));
      if (h !== null) edges.push({ u: a, v: b, along: "v", hidden: h });
    }
  }

  return edges;
}
