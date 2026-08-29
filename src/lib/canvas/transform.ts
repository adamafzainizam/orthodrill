/**
 * Rigid transforms of a selection: quarter-turn rotation, and mirroring.
 *
 * WHY ONLY QUARTER TURNS. Only 0, 90, 180 and 270 degrees map the integer
 * lattice to itself — 4 of 360 whole degrees, measured. No finer grid ever
 * adds more: 0 of 6560 lattice points survive a 45 degree rotation, because
 * (x-y)/sqrt2 is an integer only if x-y is a multiple of sqrt2. Rotating and
 * ROUNDING is not a near miss either: a 4-unit edge becomes 2.828 and a right
 * angle becomes 78.7. See the 2026-08-29 spec §2.2.
 *
 * Twelve exact stops DO exist for a shape whose coordinates are all multiples
 * of 5, at the Pythagorean angles (36.87, 53.13, ...). Every one of them is a
 * decimal, and a snap stop labelled "36.87 degrees" is a bad control, so they
 * are not offered.
 *
 * WHY ROTATE TAKES A BASE POINT AND MIRROR DOES NOT. Rotation couples the two
 * coordinates — it is exact only when cx and cy are both integer or both
 * half-integer, so a bounding-box centre fails for mixed-parity boxes, about
 * half of all selections. A mirror touches one coordinate at a time and needs
 * only 2*cx to be an integer, which a bounding-box centre always satisfies.
 *
 * PURE. No I/O, no DOM, no framework imports. See AGENTS.md §8.
 */
import type { Point } from "./coords.ts";
import type { Primitive } from "../scoring/primitives.ts";

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Rotate about `base` by whole quarter turns.
 *
 * POSITIVE IS COUNTER-CLOCKWISE AS SEEN ON SCREEN. Grid y increases downward,
 * so this is NOT the textbook matrix: one positive quarter turn sends (dx,dy)
 * to (dy,-dx), and (1,0) to (0,-1). A sign error here yields a drawing that is
 * perfectly self-consistent and perfectly mirrored — the failure class the
 * golden set exists to catch — so it is pinned by a positive control test.
 */
export function rotatePoint(p: Point, base: Point, quarterTurns: number): Point {
  const k = ((quarterTurns % 4) + 4) % 4;
  let x = p.x - base.x;
  let y = p.y - base.y;
  for (let i = 0; i < k; i++) {
    const nx = y;
    const ny = -x;
    x = nx; y = ny;
  }
  return { x: base.x + x, y: base.y + y };
}

export function rotatePrimitive(p: Primitive, base: Point, quarterTurns: number): Primitive {
  if (p.kind === "circle") {
    const c = rotatePoint({ x: p.cx, y: p.cy }, base, quarterTurns);
    return { ...p, cx: c.x, cy: c.y };
  }
  const a = rotatePoint({ x: p.x1, y: p.y1 }, base, quarterTurns);
  const b = rotatePoint({ x: p.x2, y: p.y2 }, base, quarterTurns);
  return { ...p, x1: a.x, y1: a.y, x2: b.x, y2: b.y };
}

/** Mirror across `x = axis` when `horizontal`, otherwise across `y = axis`. */
export function mirrorPrimitive(p: Primitive, axis: number, horizontal: boolean): Primitive {
  const fx = (x: number) => (horizontal ? 2 * axis - x : x);
  const fy = (y: number) => (horizontal ? y : 2 * axis - y);
  if (p.kind === "circle") return { ...p, cx: fx(p.cx), cy: fy(p.cy) };
  return { ...p, x1: fx(p.x1), y1: fy(p.y1), x2: fx(p.x2), y2: fy(p.y2) };
}

/** A circle contributes its FULL extent, not just its centre. */
export function selectionBounds(
  ps: readonly Primitive[], indices: readonly number[],
): Bounds | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let seen = false;
  for (const i of indices) {
    const p = ps[i];
    if (p === undefined) continue;
    seen = true;
    if (p.kind === "circle") {
      minX = Math.min(minX, p.cx - p.r); maxX = Math.max(maxX, p.cx + p.r);
      minY = Math.min(minY, p.cy - p.r); maxY = Math.max(maxY, p.cy + p.r);
    } else {
      minX = Math.min(minX, p.x1, p.x2); maxX = Math.max(maxX, p.x1, p.x2);
      minY = Math.min(minY, p.y1, p.y2); maxY = Math.max(maxY, p.y1, p.y2);
    }
  }
  return seen ? { minX, minY, maxX, maxY } : null;
}

/**
 * The default rotation base: the bounding-box centre ROUNDED to a lattice
 * point. The rounding is the whole point — an unrounded centre is off-lattice
 * whenever the box's width and height differ in parity, and rounding means
 * there is no way to EXPRESS an unsafe base point rather than having to
 * validate for one after the fact.
 */
export function defaultRotateBase(
  ps: readonly Primitive[], indices: readonly number[],
): Point | null {
  const b = selectionBounds(ps, indices);
  if (b === null) return null;
  return { x: Math.round((b.minX + b.maxX) / 2), y: Math.round((b.minY + b.maxY) / 2) };
}

/** The mirror axis: the bounding-box centre, NOT rounded — see the docblock. */
export function mirrorAxis(
  ps: readonly Primitive[], indices: readonly number[], horizontal: boolean,
): number | null {
  const b = selectionBounds(ps, indices);
  if (b === null) return null;
  return horizontal ? (b.minX + b.maxX) / 2 : (b.minY + b.maxY) / 2;
}

/**
 * Whole quarter turns for a typed angle, or null if the grid cannot express it.
 *
 * Only multiples of 90 are accepted — whole numbers only, which is the
 * builder's rule of 2026-08-29 and also the honest one: see the module
 * docblock for why every other stop is either impossible or a decimal.
 */
export function quarterTurnsFor(degrees: number): number | null {
  if (!Number.isFinite(degrees)) return null;
  if (!Number.isInteger(degrees)) return null;
  if (degrees % 90 !== 0) return null;
  return degrees / 90;
}
