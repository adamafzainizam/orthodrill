/**
 * The pickable faces of a solid, seen isometrically — what a click can land on.
 *
 * EMITTED FROM THE SAME ORDERED PASS AS THE PAINT PROGRAM, deliberately. The
 * parent spec claimed hit-testing "comes free" from the paint program because
 * the face under the cursor is the last one whose polygon contains the point.
 * That is true of the POLYGON, but `IsoFace` carries only `points` — not the
 * cell or the direction a click has to act on. The fix is not to recompute
 * face geometry beside isoedges.ts: that would be two sources of truth for
 * where a face is, and the first time either changed, a student's click would
 * land on a face other than the one they can see, with nothing to notice.
 * `orderedFaces` is therefore shared, and isopick.test.ts asserts the two
 * outputs agree face for face, in order.
 *
 * BACK TO FRONT, like the paint program. A caller hit-tests from the END of
 * this array, so the nearest face wins — the same reason the last fill wins
 * when painting.
 *
 * PURE. No I/O. Safe on the client: projection only, no answer key.
 */
import { faceCorners, orderedFaces, type Dir } from "./isoedges.ts";
import { project } from "./isoproject.ts";
import type { Occupancy } from "./occupancy.ts";
import type { Cell } from "./rotate3.ts";

export type PickFace = {
  /** The cell this face belongs to, in the coordinates of the occupancy given. */
  cell: Cell;
  /** Which of the voxel's faces this is. The three that can face the viewer. */
  dir: Dir;
  /** The projected polygon, identical to the `iso-face` the painter emits. */
  points: [number, number][];
};

/** The outward unit normal of a face direction — where a block added against it goes. */
export const FACE_NORMAL: Record<Dir, Cell> = {
  "+x": [1, 0, 0],
  "-y": [0, -1, 0],
  "+z": [0, 0, 1],
};

export function isoPickList(o: Occupancy): PickFace[] {
  const { ordered } = orderedFaces(o);
  return ordered.map((f) => ({
    cell: [f.x, f.y, f.z] as Cell,
    dir: f.name,
    points: faceCorners(f.name, f.x, f.y, f.z).map((p) => {
      const s = project(p[0], p[1], p[2]);
      return [s.u, s.v] as [number, number];
    }),
  }));
}
