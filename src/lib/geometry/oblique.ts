/**
 * Oblique projection: the front face true shape, depth receding at 45 degrees.
 *
 * WHAT THE LATTICE DECIDED, measured 2026-08-29 and not to be re-litigated
 * (AGENTS.md §1.1, docs/decision-log.md):
 *
 * - All three types ship, as ONE projection parameterised by the depth factor
 *   k: cavalier 1, cabinet 1/2, general 2/3.
 * - Every y-coordinate in the solid must be a multiple of k's DENOMINATOR --
 *   1, 2, 3 respectively -- or the projection leaves the integer grid and the
 *   scorer cannot express the answer. Enforced by `validateObliqueSolid`, not
 *   left to authoring care.
 * - The receding angle is fixed at 45 degrees. Only tan 45 = 1 gives an
 *   integer step; 15, 30, 60 and 75 are all irrational.
 * - Depth is ONE GRID DIAGONAL PER UNIT, which is sqrt(2) longer than
 *   metrically true scale. The RATIOS between the three types are exact and
 *   are the teaching content; the sqrt(2) is uniform and invisible without a
 *   ruler. A hint must therefore never say "full size" -- see AGENTS.md §6 on
 *   authored prose that contradicts the key.
 * - Box-only, and in wave 1 PRISMS only: every feature spans the full depth.
 *   A bore is an ellipse in oblique and `circle` is the only curved primitive
 *   we have.
 *
 * WHY NOT REUSE isoedges.ts. That returns a PAINT PROGRAM whose occlusion is
 * overdraw -- correct for a prompt picture, useless as an answer key. A key
 * must be an explicit set of scoreable primitives, so visibility here is
 * computed rather than painted.
 *
 * PURE. No I/O, no DOM, no framework imports. See AGENTS.md §2 constraint 3.
 */
import { buildOccupancy } from "./occupancy.ts";
import type { Op, Solid } from "./solid.ts";
import type { Primitive } from "../scoring/primitives.ts";

export type ObliqueType = "cavalier" | "cabinet" | "general";

/** The depth factor k applied along the receding axis. */
export const DEPTH_FACTOR: Readonly<Record<ObliqueType, number>> = Object.freeze({
  cavalier: 1,
  cabinet: 0.5,
  general: 2 / 3,
});

/**
 * The denominator of each k: every y-coordinate in the solid must be a
 * multiple of this, or k*y is not an integer and the vertex leaves the grid.
 */
export const DEPTH_STEP: Readonly<Record<ObliqueType, number>> = Object.freeze({
  cavalier: 1,
  cabinet: 2,
  general: 3,
});

export type ObliqueSpec = {
  solid: Solid;
  type: ObliqueType;
  /** Sheet coordinates of the front face's bottom-left corner. */
  originX: number;
  originY: number;
};

/**
 * Model space to sheet coordinates.
 *
 * Grid y runs DOWNWARD and the solid's z is height, so z is SUBTRACTED. The
 * receding axis goes UP AND TO THE RIGHT, the conventional direction, so one
 * unit of depth adds k to x and subtracts k from y. A sign error here yields a
 * drawing that recedes toward the viewer and is perfectly self-consistent
 * about it, which is why a positive control pins it.
 */
export function projectOblique(
  x: number, y: number, z: number, k: number, originX: number, originY: number,
): { x: number; y: number } {
  return { x: originX + x + k * y, y: originY - z - k * y };
}

/**
 * The solid's cross-section at y = 0, indexed [z][x].
 *
 * For a prism this is every slice, which is what makes wave 1 tractable:
 * visibility can be reasoned about from one 2D profile rather than from the
 * full lattice. `validateObliqueSolid` is what guarantees the solid IS a
 * prism, so this function is only correct downstream of that check.
 */
export function profileOf(s: Solid): boolean[][] {
  const o = buildOccupancy(s);
  const rows: boolean[][] = [];
  for (let z = 0; z < o.h; z++) {
    const row: boolean[] = [];
    for (let x = 0; x < o.w; x++) row.push(o.isSolid(x, 0, z));
    rows.push(row);
  }
  return rows;
}

/** The drawing's extent: (w + k*d) by (h + k*d). */
export function obliqueBounds(spec: ObliqueSpec): { width: number; height: number } {
  const k = DEPTH_FACTOR[spec.type];
  const { w, d, h } = spec.solid.base;
  return { width: w + k * d, height: h + k * d };
}

/**
 * Why a solid cannot be drawn in oblique, or null if it can.
 *
 * A SIBLING of `validateSolid` rather than a branch inside it: `validateSolid`
 * guards the orthographic path, and giving it a type parameter would make
 * every existing caller pass something meaningless.
 *
 * These are enforced here rather than left to authoring care, which is the
 * difference between a rule and a hope — AGENTS.md §4 is explicit that the
 * depth rule covers every feature box's y and d, not just the overall depth,
 * and that is exactly the part a careful author still gets wrong.
 */
export type ObliqueRejection =
  | "CYLINDER_IN_OBLIQUE"
  | "DEPTH_NOT_ON_STEP"
  | "NOT_A_PRISM"
  | "EMPTY_SOLID";

export function validateObliqueSolid(s: Solid, type: ObliqueType): ObliqueRejection | null {
  const step = DEPTH_STEP[type];
  const depth = s.base.d;

  for (const op of s.ops as Op[]) {
    // A bore on x or z projects to an ellipse at 2.618:1, and even on y its
    // silhouette tangents land at c ± r/√2. `circle` is our only curved
    // primitive, so neither is expressible. Tier 2.
    if (op.kind === "cylinder") return "CYLINDER_IN_OBLIQUE";
  }

  // The depth rule, over EVERY y-coordinate that can appear as a vertex.
  const ys = new Set<number>([0, depth]);
  for (const op of s.ops as Op[]) {
    if (op.kind !== "box") continue;
    ys.add(op.box.y);
    ys.add(op.box.y + op.box.d);
  }
  for (const y of ys) if (y % step !== 0) return "DEPTH_NOT_ON_STEP";

  // Wave 1 is prisms: every feature spans the full depth, so the solid is a
  // 2D profile extruded. That is what the depth rule already forces for a
  // solid usable in all three types, and it is the case where visibility is
  // exactly computable.
  for (const op of s.ops as Op[]) {
    if (op.kind !== "box") continue;
    const spansDepth = op.box.y <= 0 && op.box.y + op.box.d >= depth;
    if (!spansDepth) return "NOT_A_PRISM";
  }

  const o = buildOccupancy(s);
  let any = false;
  for (let z = 0; z < o.h && !any; z++)
    for (let x = 0; x < o.w && !any; x++) if (o.isSolid(x, 0, z)) any = true;
  if (!any) return "EMPTY_SOLID";

  return null;
}

// ---------------------------------------------------------------------------
// The visible-edge generator.
//
// A prism has exactly three kinds of face: the FRONT (the profile at y=0), the
// BACK (the profile at y=d), and the SIDE faces (each profile boundary edge
// extruded through the depth). The ray into the scene is d = (-k, 1, -k), so a
// face with outward normal n is visible iff n · d < 0, which leaves exactly
// three: front, +x (right) and +z (top).
//
// An edge is DRAWN iff its two adjacent faces differ in visibility (a
// silhouette) or are both visible but not coplanar (a crease). The crease half
// is the part a naive "union outline plus front profile" generator loses: on a
// plain box the receding line from the TOP-RIGHT corner is interior to the
// silhouette hexagon and is genuinely drawn. A test pins it.
//
// Back-face culling alone is not enough. A prism occludes ITSELF whenever
// moving up-and-right in profile space re-enters the profile, so every
// candidate is then tested against nearer material.
// ---------------------------------------------------------------------------

/** Which way a side face points. Only "+x" and "+z" are visible. */
type SideNormal = "+x" | "-x" | "+z" | "-z";

const VISIBLE_SIDE: Record<SideNormal, boolean> = {
  "+x": true, "-x": false, "+z": true, "-z": false,
};

type BoundaryEdge = {
  /** Profile-space endpoints, in (x, z). */
  x1: number; z1: number; x2: number; z2: number;
  normal: SideNormal;
};

/** Every unit boundary edge of the profile, with the face it belongs to. */
function boundaryEdges(P: boolean[][]): BoundaryEdge[] {
  const h = P.length, w = P[0]?.length ?? 0;
  const at = (x: number, z: number) => x >= 0 && x < w && z >= 0 && z < h && P[z][x];
  const out: BoundaryEdge[] = [];
  // Vertical edges: the boundary between cell (x-1, z) and cell (x, z).
  for (let z = 0; z < h; z++)
    for (let x = 0; x <= w; x++) {
      const left = at(x - 1, z), right = at(x, z);
      if (left === right) continue;
      out.push({ x1: x, z1: z, x2: x, z2: z + 1, normal: left ? "+x" : "-x" });
    }
  // Horizontal edges: the boundary between cell (x, z-1) and cell (x, z).
  for (let z = 0; z <= h; z++)
    for (let x = 0; x < w; x++) {
      const below = at(x, z - 1), above = at(x, z);
      if (below === above) continue;
      out.push({ x1: x, z1: z, x2: x + 1, z2: z, normal: below ? "+z" : "-z" });
    }
  return out;
}

/**
 * Is the profile point (px, pz) hidden by material nearer than projection
 * offset `S`?
 *
 * A point at model depth y with profile position (px, pz) is occluded iff some
 * nearer material projects onto it, which for a prism reduces to: does moving
 * up and to the right in PROFILE space, by s in (0, S), land strictly inside an
 * occupied cell. `S` is k*y, the projection offset, so a front-face point has
 * S = 0 and is never occluded.
 *
 * Tested per cell with strict interior bounds rather than by sampling the ray,
 * so a ray grazing exactly along a cell edge or through a lattice corner is
 * decided exactly instead of by luck. Every value here is an integer or a
 * half, so the comparisons are float-exact.
 */
function occluded(P: boolean[][], px: number, pz: number, S: number): boolean {
  if (S <= 0) return false;
  const h = P.length, w = P[0]?.length ?? 0;
  for (let cz = 0; cz < h; cz++)
    for (let cx = 0; cx < w; cx++) {
      if (!P[cz][cx]) continue;
      const lo = Math.max(cx - px, cz - pz, 0);
      const hi = Math.min(cx + 1 - px, cz + 1 - pz, S);
      if (lo < hi) return true;
    }
  return false;
}

type Seg = { x1: number; y1: number; x2: number; y2: number };

/**
 * Merge collinear segments by UNIONING intervals, not by chaining end-to-start.
 *
 * Chaining is not enough, and the case that breaks it is not exotic. Two
 * receding edges rising from DIFFERENT profile vertices can project onto the
 * same line and OVERLAP — on a top-left-notched prism the edges from (0,2) and
 * (2,4) both land on x + y = 18, covering [0,6] and [2,8]. Interleaved
 * overlapping pieces defeat a chain and come out as five fragments where the
 * drawing has one line. Union is the operation that is actually wanted: the
 * key is the INK on the page, and overlapping ink is drawn once.
 */
function mergeSegments(segs: Seg[]): Seg[] {
  const groups = new Map<string, Seg[]>();
  for (const s of segs) {
    const dx = Math.sign(s.x2 - s.x1), dy = Math.sign(s.y2 - s.y1);
    // Canonical direction, so a segment and its reverse group together.
    const [ux, uy] = dx < 0 || (dx === 0 && dy < 0) ? [-dx, -dy] : [dx, dy];
    // A line is identified by its direction plus one invariant of that
    // direction: x for vertical, y for horizontal, x+y for the 45 diagonal.
    const inv = ux === 0 ? s.x1 : uy === 0 ? s.y1 : s.x1 + s.y1;
    const k = `${ux},${uy}:${inv}`;
    const g = groups.get(k);
    if (g) g.push(s); else groups.set(k, [s]);
  }

  const out: Seg[] = [];
  for (const g of groups.values()) {
    const first = g[0];
    const vertical = first.x1 === first.x2;
    // Position along the line: y for a vertical line, x otherwise.
    const pos = (x: number, y: number) => (vertical ? y : x);
    const point = (t: number, sample: Seg): { x: number; y: number } => {
      if (vertical) return { x: sample.x1, y: t };
      const dy = sample.y2 - sample.y1, dx = sample.x2 - sample.x1;
      const slope = dx === 0 ? 0 : dy / dx;
      return { x: t, y: sample.y1 + (t - sample.x1) * slope };
    };

    const intervals = g
      .map((s) => {
        const a = pos(s.x1, s.y1), b = pos(s.x2, s.y2);
        return a <= b ? [a, b] as const : [b, a] as const;
      })
      .sort((p, q) => p[0] - q[0]);

    let [lo, hi] = intervals[0];
    const flush = () => {
      const a = point(lo, first), b = point(hi, first);
      out.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    };
    for (let i = 1; i < intervals.length; i++) {
      const [a, b] = intervals[i];
      // Touching counts as joined: two unit pieces sharing an endpoint are one
      // line, and so are two overlapping edges from different vertices.
      if (a <= hi) hi = Math.max(hi, b);
      else { flush(); lo = a; hi = b; }
    }
    flush();
  }
  return out;
}

/**
 * The answer key: the visible edges of the solid drawn in oblique.
 *
 * Only correct for a solid `validateObliqueSolid` accepts — it is that check
 * which guarantees the solid is a prism and that every vertex lands on the
 * lattice. Throws rather than drawing something wrong if it does not.
 */
export function obliqueKey(spec: ObliqueSpec): Primitive[] {
  const reason = validateObliqueSolid(spec.solid, spec.type);
  if (reason !== null) throw new Error(`solid cannot be drawn in oblique: ${reason}`);

  const k = DEPTH_FACTOR[spec.type];
  const d = spec.solid.base.d;
  const off = k * d;                       // the projection offset at full depth
  const P = profileOf(spec.solid);
  const edges = boundaryEdges(P);

  const at = (x: number, z: number, u: number) => ({
    x: spec.originX + x + u,
    y: spec.originY - z - u,
  });

  const pieces: Seg[] = [];

  // FRONT: every boundary edge, at u = 0. The front face is always visible, so
  // each of these is a silhouette or a crease either way, and u = 0 means the
  // occlusion test is vacuous.
  for (const e of edges) {
    const a = at(e.x1, e.z1, 0), b = at(e.x2, e.z2, 0);
    pieces.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  // BACK: only edges whose side face is visible, and only where not occluded.
  for (const e of edges) {
    if (!VISIBLE_SIDE[e.normal]) continue;
    const mx = (e.x1 + e.x2) / 2, mz = (e.z1 + e.z2) / 2;
    if (occluded(P, mx, mz, off)) continue;
    const a = at(e.x1, e.z1, off), b = at(e.x2, e.z2, off);
    pieces.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
  }

  // RECEDING: at each profile vertex where the boundary turns, provided at
  // least one incident face is visible. Subdivided into unit steps of the
  // projection offset, because occlusion can begin partway along.
  const incident = new Map<string, SideNormal[]>();
  for (const e of edges) {
    for (const [vx, vz] of [[e.x1, e.z1], [e.x2, e.z2]]) {
      const key = `${vx},${vz}`;
      const list = incident.get(key);
      if (list) list.push(e.normal); else incident.set(key, [e.normal]);
    }
  }
  for (const [key, normals] of incident) {
    const [vx, vz] = key.split(",").map(Number);
    // A vertex where the boundary runs straight through has both incident
    // edges on the SAME face, so there is no crease and no edge to draw.
    if (new Set(normals).size < 2) continue;
    if (!normals.some((n) => VISIBLE_SIDE[n])) continue;
    for (let u = 0; u < off; u++) {
      if (occluded(P, vx, vz, u + 0.5)) continue;
      const a = at(vx, vz, u), b = at(vx, vz, u + 1);
      pieces.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }

  return mergeSegments(pieces).map((s) => ({
    kind: "segment", type: "visible",
    x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2,
  }));
}
