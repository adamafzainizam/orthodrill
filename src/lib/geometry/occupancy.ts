/**
 * Rasterise a solid into a 3D occupancy grid.
 *
 * WHY A GRID. Whether an edge is drawn solid or dashed depends on the whole
 * solid, not on the feature that produced it: a hole's bore lines are hidden
 * inside a block, but cut a notch away in front of them and they become visible.
 * Enumerating feature-interaction cases by hand is where wrong answer keys come
 * from. On a grid, visibility reduces to one question with one correct answer:
 * is this the first material along the ray?
 *
 * CYLINDERS ARE DELIBERATELY IGNORED. Rasterising a bore would staircase it, and
 * the generator could then never emit the exact Circle primitive the scorer
 * compares against. Holes are projected analytically in bore.ts, which consults
 * this grid only to ask what is in front of them.
 *
 * PURE. No I/O.
 */
import type { Axis, Solid } from "./solid.ts";

export type Occupancy = {
  w: number; d: number; h: number;
  isSolid(i: number, j: number, k: number): boolean;
};

export function sizeAlong(o: Occupancy, axis: Axis): number {
  return axis === "x" ? o.w : axis === "y" ? o.d : o.h;
}

export function buildOccupancy(s: Solid): Occupancy {
  const { w, d, h } = s.base;
  const cells = new Uint8Array(w * d * h).fill(1);
  const index = (i: number, j: number, k: number) => (k * d + j) * w + i;

  for (const op of s.ops) {
    if (op.kind !== "box") continue; // cylinders never enter the grid
    const b = op.box;
    const i0 = Math.max(0, b.x), i1 = Math.min(w, b.x + b.w);
    const j0 = Math.max(0, b.y), j1 = Math.min(d, b.y + b.d);
    const k0 = Math.max(0, b.z), k1 = Math.min(h, b.z + b.h);
    for (let k = k0; k < k1; k++)
      for (let j = j0; j < j1; j++)
        for (let i = i0; i < i1; i++) cells[index(i, j, k)] = 0;
  }

  return {
    w, d, h,
    isSolid(i, j, k) {
      if (i < 0 || j < 0 || k < 0 || i >= w || j >= d || k >= h) return false;
      return cells[index(i, j, k)] === 1;
    },
  };
}
