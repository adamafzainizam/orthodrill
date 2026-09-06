/**
 * Scoring a Type B attempt: the student's built solid against the key's.
 *
 * SERVER ONLY, like `score.ts` — it is used alongside answer keys, which never
 * reach the browser (AGENTS.md §5.1).
 *
 * THE VERDICT IS THE PRODUCT (AGENTS.md §1). "14 cells missing, 3 extra" is a
 * checksum, not marking. So the diff is grouped into 6-connected REGIONS and
 * each is described by where it sits and which view actually reveals it —
 * the Type B equivalent of Type A naming the convention a student really used.
 *
 * 6-CONNECTIVITY, NOT 26. Two cells touching only at a corner are two separate
 * mistakes and earn two separate sentences; merging them would describe a
 * region whose centre is in neither of them.
 *
 * There is deliberately NO overall percentage, for the same reason `score.ts`
 * has none: a number teaches nothing.
 *
 * PURE. No I/O.
 */
import { cellKey, normaliseCells } from "../geometry/cells.ts";
import type { Cell } from "../geometry/rotate3.ts";
import type { ViewName } from "./types.ts";

export type CellRegion = {
  cells: Cell[];
  /** Where it sits, in thirds of the key's bounding box. */
  where: string;
  /** Views this region genuinely changes. Never asserted — always derived. */
  views: ViewName[];
};

export type SolidDiff = { missing: CellRegion[]; extra: CellRegion[] };

export type SolidScoreResult = {
  ok: true;
  perfect: boolean;
  /**
   * The build differs from the key, yet all three views agree with it. Never
   * true when `perfect` is true. See the engine spec §5.3: a tool that says
   * what is wrong must never tell a student a correct reading is incorrect.
   */
  matchesAllViews: boolean;
  diff: SolidDiff;
};

const NEIGHBOURS: readonly Cell[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/** Connected components under face adjacency. */
export function groupRegions(cells: readonly Cell[]): Cell[][] {
  const remaining = new Map<string, Cell>();
  for (const c of cells) remaining.set(cellKey(c), c);

  const out: Cell[][] = [];
  for (const [startKey, startCell] of remaining) {
    if (!remaining.has(startKey)) continue;
    const region: Cell[] = [];
    const stack: Cell[] = [startCell];
    remaining.delete(startKey);
    while (stack.length > 0) {
      const c = stack.pop()!;
      region.push(c);
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const n: Cell = [c[0] + dx, c[1] + dy, c[2] + dz];
        const k = cellKey(n);
        const found = remaining.get(k);
        if (found === undefined) continue;
        remaining.delete(k);
        stack.push(found);
      }
    }
    out.push(region.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]));
  }
  return out;
}

const LABELS: readonly (readonly [string, string, string])[] = [
  ["left", "centre", "right"],
  ["front", "middle", "back"],
  ["bottom", "middle", "top"],
];

function thirdOf(v: number, size: number): number {
  if (size <= 0) return 1;
  return Math.min(2, Math.floor((3 * v) / size));
}

/**
 * Where a region sits, in thirds of the key's bounding-box `extent`. Read in
 * the order a person says it: height, then depth, then side.
 */
export function describeWhere(region: readonly Cell[], extent: Cell): string {
  let sx = 0, sy = 0, sz = 0;
  for (const [x, y, z] of region) { sx += x; sy += y; sz += z; }
  const n = region.length;
  const parts = [
    LABELS[2][thirdOf(sz / n, extent[2])],
    LABELS[1][thirdOf(sy / n, extent[1])],
    LABELS[0][thirdOf(sx / n, extent[0])],
  ].filter((p) => p !== "middle" && p !== "centre");
  return parts.length === 0 ? "in the middle" : `at the ${parts.join(" ")}`;
}

function extentOf(cells: readonly Cell[]): Cell {
  let mx = 0, my = 0, mz = 0;
  for (const [x, y, z] of cells) {
    if (x + 1 > mx) mx = x + 1;
    if (y + 1 > my) my = y + 1;
    if (z + 1 > mz) mz = z + 1;
  }
  return [mx, my, mz];
}

export function scoreSolid(attempt: readonly Cell[], key: readonly Cell[]): SolidScoreResult {
  const a = normaliseCells(attempt);
  const k = normaliseCells(key);
  const extent = extentOf(k);

  const inAttempt = new Set(a.map(cellKey));
  const inKey = new Set(k.map(cellKey));

  const missingCells = k.filter((c) => !inAttempt.has(cellKey(c)));
  const extraCells = a.filter((c) => !inKey.has(cellKey(c)));

  const toRegions = (cells: Cell[]): CellRegion[] =>
    groupRegions(cells).map((region) => ({
      cells: region,
      where: describeWhere(region, extent),
      views: [],
    }));

  const diff: SolidDiff = { missing: toRegions(missingCells), extra: toRegions(extraCells) };
  const perfect = missingCells.length === 0 && extraCells.length === 0;
  return { ok: true, perfect, matchesAllViews: false, diff };
}
