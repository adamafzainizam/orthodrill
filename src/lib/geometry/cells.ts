/**
 * The occupied-cell set: the shape a Type B answer key and a Type B attempt
 * both take.
 *
 * OCCUPIED, NOT REMOVED. A student who carves a part in a different order from
 * another student submits the same thing, because the result is described
 * rather than the path to it (reverse-drill spec §6).
 *
 * NORMALISATION IS A TRANSLATION AND NOTHING MORE. `normaliseCells` moves the
 * bounding box to the origin so that where a part sits cannot affect a verdict
 * — the same invariance `compareView` gives the 2D scorer, for the same reason.
 * It must never be extended into anything that could make two DIFFERENT parts
 * compare equal.
 *
 * PURE. No I/O.
 */
import { buildOccupancy, type Occupancy } from "./occupancy.ts";
import type { Cell } from "./rotate3.ts";
import type { Solid } from "./solid.ts";

export const cellKey = (c: Cell): string => `${c[0]},${c[1]},${c[2]}`;

/** Sorted by z, then y, then x, so equal sets are deepEqual arrays. */
export function cellsOfOccupancy(o: Occupancy): Cell[] {
  const out: Cell[] = [];
  for (let k = 0; k < o.h; k++)
    for (let j = 0; j < o.d; j++)
      for (let i = 0; i < o.w; i++)
        if (o.isSolid(i, j, k)) out.push([i, j, k]);
  return out;
}

/**
 * The answer key for a Type B drill, DERIVED from the solid (AGENTS.md §7 —
 * never hand-written). Box-only by construction: `buildOccupancy` ignores
 * cylinder ops, which is exactly why a build drill may not have any.
 */
export function cellsOfSolid(s: Solid): Cell[] {
  return cellsOfOccupancy(buildOccupancy(s));
}

export function occupancyFromCells(
  cells: readonly Cell[], w: number, d: number, h: number,
): Occupancy {
  const present = new Set(cells.map(cellKey));
  return {
    w, d, h,
    isSolid(i, j, k) {
      if (i < 0 || j < 0 || k < 0 || i >= w || j >= d || k >= h) return false;
      return present.has(`${i},${j},${k}`);
    },
  };
}

export function normaliseCells(cells: readonly Cell[]): Cell[] {
  if (cells.length === 0) return [];
  let mx = Infinity, my = Infinity, mz = Infinity;
  for (const [x, y, z] of cells) {
    if (x < mx) mx = x;
    if (y < my) my = y;
    if (z < mz) mz = z;
  }
  return cells
    .map(([x, y, z]) => [x - mx, y - my, z - mz] as Cell)
    .sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
}
