/**
 * The visible surface of a solid, seen isometrically, as a PAINT PROGRAM.
 *
 * The returned array is ORDERED back to front and must be rendered in sequence:
 * an IsoFace as an opaque fill in the page background colour, an IsoLine as a
 * stroke. Occlusion happens because a nearer face's fill paints over a farther
 * face's strokes. Do not sort, filter or deduplicate the result.
 *
 * WHY NOT JUST EMIT VISIBLE LINES. An earlier version did, on the claim that a
 * visible voxel's faces are wholly visible. That is false: projected unit-cube
 * hexagons have area sqrt(3) against a projected lattice cell of 1/sqrt(3), so
 * every hexagon overlaps six neighbours and partial occlusion is routine. On the
 * L-block the true visibility boundary cuts THROUGH voxel interiors, which no
 * voxel-granular method can express. See the design document §6.
 *
 * WHY STROKES ARE NOT MERGED ACROSS FACES. Each face emits its own unit-length
 * edges, right after its own fill. Merging a run across several coplanar faces
 * would attach it to the farthest of them, and the nearer coplanar fills would
 * then paint over part of the outline. Cancellation already removes the shared
 * edges between coplanar neighbours, so what survives is the true outline; it is
 * simply expressed as touching unit segments, which render identically.
 *
 * RENDERER CONTRACT: an IsoFace must be painted as an opaque fill AND stroked
 * in the same background colour, so it seals its own boundary. Without that,
 * a hidden edge lying exactly on the seam between two coplanar fills shows
 * through as an antialiasing hairline: a genuinely hidden crease (e.g. a notch
 * floor edge) can still project onto a seam between two later, unrelated
 * coplanar fills, and nothing short of the fill sealing its own edge hides it.
 *
 * PURE. No I/O.
 */
import type { Occupancy } from "./occupancy.ts";
import { project, isVisible } from "./isoproject.ts";
import type { IsoFace, IsoLine } from "./isotypes.ts";

type Corner = [number, number, number];
type Dir = "+x" | "-y" | "+z";

const FACES: { name: Dir; d: Corner }[] = [
  { name: "+x", d: [1, 0, 0] },
  { name: "-y", d: [0, -1, 0] },
  { name: "+z", d: [0, 0, 1] },
];

/** The four lattice corners of one face of the voxel at (x, y, z). */
function faceCorners(name: Dir, x: number, y: number, z: number): Corner[] {
  if (name === "+x") {
    return [[x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]];
  }
  if (name === "-y") {
    return [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]];
  }
  return [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
}

const cornerKey = (c: Corner) => `${c[0]},${c[1]},${c[2]}`;
const edgeKey = (a: Corner, b: Corner) => [cornerKey(a), cornerKey(b)].sort().join("|");

/** The exposed (neighbour-empty) viewer-facing directions of a solid voxel. */
function exposedDirs(o: Occupancy, x: number, y: number, z: number): Dir[] {
  const out: Dir[] = [];
  for (const f of FACES) {
    if (!o.isSolid(x + f.d[0], y + f.d[1], z + f.d[2])) out.push(f.name);
  }
  return out;
}

/**
 * Depth along the view direction (1,-1,1): larger is nearer the viewer.
 * Exported so the ordering rule can be pinned directly — the emitted array's
 * order is what makes occlusion work, and a wrong key here is invisible to
 * every structural test.
 */
export function faceDepth(x: number, y: number, z: number): number {
  return x - y + z;
}

type Face = { name: Dir; x: number; y: number; z: number; t: number };

export function isoEdges(o: Occupancy): (IsoFace | IsoLine)[] {
  // 1. Tally edges by position AND normal, over ALL exposed faces of ALL solid
  //    voxels — not just isVisible ones. Two coplanar patches are physically
  //    continuous (and their shared edge must cancel) purely because both are
  //    exposed to empty space; isVisible is a DIAGONAL ray-march cull and can
  //    reject one side of a seam that is nonetheless coplanar and continuous
  //    with a neighbour that IS emitted, which would otherwise leave a hidden
  //    stroke sitting exactly on that seam (see the module docblock's renderer
  //    contract note for the residual case this alone cannot fix).
  const tally = new Map<string, number>();
  for (let z = 0; z < o.h; z++) {
    for (let y = 0; y < o.d; y++) {
      for (let x = 0; x < o.w; x++) {
        if (!o.isSolid(x, y, z)) continue;
        for (const name of exposedDirs(o, x, y, z)) {
          const c = faceCorners(name, x, y, z);
          for (let i = 0; i < 4; i++) {
            const ek = `${edgeKey(c[i], c[(i + 1) % 4])}#${name}`;
            tally.set(ek, (tally.get(ek) ?? 0) + 1);
          }
        }
      }
    }
  }

  // 2. Exposed viewer-facing faces of visible voxels, with a depth key.
  //    isVisible remains a sound cull: it finds WHOLLY hidden voxels. This is
  //    the set that actually gets emitted.
  const exposed: Face[] = [];
  for (let z = 0; z < o.h; z++) {
    for (let y = 0; y < o.d; y++) {
      for (let x = 0; x < o.w; x++) {
        if (!isVisible(o, x, y, z)) continue;
        for (const name of exposedDirs(o, x, y, z)) {
          exposed.push({ name, x, y, z, t: faceDepth(x, y, z) });
        }
      }
    }
  }

  // 3. Farthest first. Sort is stable, so ties keep collection order.
  const ordered = [...exposed].sort((p, q) => p.t - q.t);

  // 4. Each fill, then that face's own surviving edges.
  const out: (IsoFace | IsoLine)[] = [];
  const drawn = new Set<string>();
  for (const f of ordered) {
    const c = faceCorners(f.name, f.x, f.y, f.z);
    out.push({
      kind: "iso-face",
      points: c.map((p) => {
        const s = project(p[0], p[1], p[2]);
        return [s.u, s.v] as [number, number];
      }),
    });

    for (let i = 0; i < 4; i++) {
      const ek = edgeKey(c[i], c[(i + 1) % 4]);
      if (tally.get(`${ek}#${f.name}`) === 2) continue; // coplanar continuation
      if (drawn.has(ek)) continue;                      // a crease, already drawn
      drawn.add(ek);
      const a = project(c[i][0], c[i][1], c[i][2]);
      const b = project(c[(i + 1) % 4][0], c[(i + 1) % 4][1], c[(i + 1) % 4][2]);
      if (Math.hypot(b.u - a.u, b.v - a.v) < 1e-9) continue;
      out.push({ kind: "iso-line", x1: a.u, y1: a.v, x2: b.u, y2: b.v });
    }
  }

  return out;
}
