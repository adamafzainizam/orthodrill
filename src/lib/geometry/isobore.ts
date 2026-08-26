/**
 * A cylindrical through-hole, seen isometrically.
 *
 * A circle in a principal plane projects to an ellipse: major radius equal to
 * the true radius, minor radius r/sqrt(3), with the major axis perpendicular to
 * the hole's axis in projection. Those constants were verified numerically
 * during design and are pinned by tests.
 *
 * Only the NEAR rim is drawn — the one on the visible face the hole emerges
 * through. The far rim and the cylindrical bore wall are omitted: visible
 * omissions in a picture, never a wrong answer, and this image is never scored.
 *
 * The returned `t` is the paint depth (isoedges.ts's faceDepth) of the face the
 * rim sits on. Task 3 made the generator's output a back-to-front paint
 * program: an ellipse appended at the end would be drawn on top of anything
 * that occludes its face, so the depth is returned for Task 5 to interleave it
 * at the right point rather than always last.
 *
 * PURE. No I/O.
 */
import type { Axis, CylinderOp } from "./solid.ts";
import { sizeAlong, type Occupancy } from "./occupancy.ts";
import { project, isVisible } from "./isoproject.ts";
import { faceDepth } from "./isoedges.ts";
import type { IsoEllipse } from "./isotypes.ts";

/** Major-axis rotation in degrees, by the axis the hole runs along. */
const ROTATION: Record<Axis, number> = { z: 0, y: 60, x: 120 };

/** The two axes perpendicular to `axis`, in x -> y -> z order. */
function planeAxes(axis: Axis): [Axis, Axis] {
  const all: Axis[] = ["x", "y", "z"];
  const [a, b] = all.filter((x) => x !== axis);
  return [a, b];
}

export function isoBore(op: CylinderOp, o: Occupancy): { ellipse: IsoEllipse; t: number } | null {
  const [pu, pv] = planeAxes(op.axis);

  // The near rim sits on the visible face the hole emerges through: the top for
  // a z hole, the front (y = 0) for a y hole, the right face for an x hole.
  const rim: Record<Axis, number> = { x: 0, y: 0, z: 0 };
  rim[pu] = op.u;
  rim[pv] = op.v;
  rim[op.axis] = op.axis === "y" ? 0 : sizeAlong(o, op.axis);

  // Is that part of the face actually visible? Test the voxel just inside it.
  const inside: Record<Axis, number> = { ...rim };
  inside[pu] = Math.min(Math.max(Math.floor(op.u), 0), sizeAlong(o, pu) - 1);
  inside[pv] = Math.min(Math.max(Math.floor(op.v), 0), sizeAlong(o, pv) - 1);
  inside[op.axis] = op.axis === "y" ? 0 : sizeAlong(o, op.axis) - 1;
  if (!isVisible(o, inside.x, inside.y, inside.z)) return null;

  const c = project(rim.x, rim.y, rim.z);

  // The ellipse spans +/- op.r in projection, so it can overlap coplanar
  // voxels of the SAME face at greater depth than the single centre voxel
  // above. Anchoring at the centre alone left those later, nearer fills
  // overpainting part of the rim - the same bug class isoedges.ts already
  // warns about for merged strokes, reintroduced by attaching a multi-voxel
  // primitive to one voxel's depth. Anchor instead at the MAXIMUM faceDepth
  // over the hole's footprint on its own face. A bounding square around the
  // disc (rather than the exact circle) is safe: every cell in it is
  // coplanar with the rim, so there is no occlusion between them, and using
  // the square can only push the ellipse LATER, never earlier.
  const puLo = Math.max(0, Math.floor(op.u - op.r));
  const puHi = Math.min(sizeAlong(o, pu) - 1, Math.ceil(op.u + op.r) - 1);
  const pvLo = Math.max(0, Math.floor(op.v - op.r));
  const pvHi = Math.min(sizeAlong(o, pv) - 1, Math.ceil(op.v + op.r) - 1);

  let t = -Infinity;
  const cell: Record<Axis, number> = { ...inside };
  for (let a = puLo; a <= puHi; a++) {
    for (let b = pvLo; b <= pvHi; b++) {
      cell[pu] = a;
      cell[pv] = b;
      t = Math.max(t, faceDepth(cell.x, cell.y, cell.z));
    }
  }

  return {
    ellipse: {
      kind: "iso-ellipse",
      cx: c.u,
      cy: c.v,
      rx: op.r,
      ry: op.r / Math.sqrt(3),
      rotation: ROTATION[op.axis],
    },
    // Paint depth of the FARTHEST cell the rim's own face-footprint touches,
    // so isometric.ts can interleave the ellipse into the back-to-front
    // order after everything it should sit on top of, and before everything
    // (on this face or nearer) that should occlude it.
    t,
  };
}
