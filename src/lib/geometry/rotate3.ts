/**
 * The four isometric viewpoints, as quarter turns of the OCCUPANCY.
 *
 * WHY ROTATE THE PART AND NOT THE CAMERA. The four top corners a student needs
 * to reach are (+-1, +-1, +1), which differ from isoproject.ts's fixed
 * (+1, -1, +1) by a quarter turn about z — and those four turns are exactly the
 * ones the integer lattice permits (decision log, 2026-08-29). Rotating here
 * means `project` is never given a second basis, and isoproject.ts's own
 * warning stands undisturbed: a wrong sign there yields a picture that is
 * perfectly self-consistent and perfectly MIRRORED. This module's errors, by
 * contrast, are caught by a round-trip identity and a composition check.
 *
 * `Occupancy` is an interface, not data, so a viewpoint is a WRAPPER and not a
 * copy: nothing is allocated per turn and `isoedges.ts` cannot tell the
 * difference. Its paint order, nearest-face crease ownership and fill-seal
 * contract therefore keep working untouched.
 *
 * THE BOUNDARY: a quarter turn moves a cylinder's axis — an x-bore becomes a
 * y-bore. Type B is box-only so nothing here needs to care, but a
 * four-viewpoint viewer of a BORED solid would have to rotate the solid's ops
 * too. Do not reach for this module for that without solving it.
 *
 * PURE. No I/O.
 */
import type { Occupancy } from "./occupancy.ts";

export type Cell = readonly [number, number, number];
export type QuarterTurn = 0 | 1 | 2 | 3;

/**
 * Rotate a cell about z. `w` and `d` are always the ORIGINAL grid's width and
 * depth, for this function and its inverse alike, so a caller never has to
 * track which way round the dimensions are at each step.
 */
export function rotateCell(c: Cell, q: QuarterTurn, w: number, d: number): Cell {
  const [x, y, z] = c;
  if (q === 0) return [x, y, z];
  if (q === 1) return [d - 1 - y, x, z];
  if (q === 2) return [w - 1 - x, d - 1 - y, z];
  return [y, w - 1 - x, z];
}

/** The exact inverse of `rotateCell` under the same `w` and `d`. */
export function unrotateCell(c: Cell, q: QuarterTurn, w: number, d: number): Cell {
  const [i, j, k] = c;
  if (q === 0) return [i, j, k];
  if (q === 1) return [j, d - 1 - i, k];
  if (q === 2) return [w - 1 - i, d - 1 - j, k];
  return [w - 1 - j, i, k];
}

/**
 * The same solid seen from one of the four top corners. A view over the
 * original, allocating nothing.
 */
export function rotatedOccupancy(o: Occupancy, q: QuarterTurn): Occupancy {
  if (q === 0) return o;
  const odd = q % 2 === 1;
  const w = odd ? o.d : o.w;
  const d = odd ? o.w : o.d;
  return {
    w, d, h: o.h,
    isSolid(i, j, k) {
      if (i < 0 || j < 0 || k < 0 || i >= w || j >= d || k >= o.h) return false;
      const [x, y, z] = unrotateCell([i, j, k], q, o.w, o.d);
      return o.isSolid(x, y, z);
    },
  };
}
