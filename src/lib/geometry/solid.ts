/**
 * The solid model: a base block plus an ordered list of subtractive operations,
 * all axis-aligned on an integer grid.
 *
 * TWO operations, not five. The approved spec names step, notch, slot and
 * rectangular opening as separate feature types; under an occupancy model they
 * are all "remove an axis-aligned box" and differ only in where the box sits.
 * The five names survive as authoring helpers in features.ts. Four near-identical
 * code paths would be four places for a wrong answer key to hide.
 *
 * PURE. No I/O. See AGENTS.md §2 constraint 3.
 */

export type Axis = "x" | "y" | "z";

/** Half-open cell region: x..x+w, y..y+d, z..z+h. */
export type Box = {
  x: number; y: number; z: number;
  w: number; d: number; h: number;
};

export type BoxOp = { kind: "box"; box: Box; name?: string };

/**
 * A through-hole spanning the whole block along `axis`.
 *
 * `u` and `v` are the centre coordinates IN THE PLANE PERPENDICULAR TO `axis`,
 * taken in the order the remaining two axes appear in x -> y -> z:
 *   axis "x" -> (u, v) = (y, z)
 *   axis "y" -> (u, v) = (x, z)
 *   axis "z" -> (u, v) = (x, y)
 * Named u/v rather than cx/cy because "cx" would be ambiguous for two of the
 * three axes, and a silently transposed hole centre survives property tests.
 */
export type CylinderOp = {
  kind: "cylinder";
  axis: Axis; u: number; v: number; r: number;
  name?: string;
};

export type Op = BoxOp | CylinderOp;

export type Solid = {
  base: { w: number; d: number; h: number };
  ops: Op[];
};

function requireInteger(label: string, ...values: number[]): void {
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`${label} must be an integer, got ${v}`);
  }
}

function requirePositive(label: string, ...values: number[]): void {
  for (const v of values) {
    if (v <= 0) throw new Error(`${label} must be positive, got ${v}`);
  }
}

export function block(w: number, d: number, h: number): Solid {
  requireInteger("block dimensions", w, d, h);
  requirePositive("block dimensions", w, d, h);
  return { base: { w, d, h }, ops: [] };
}

export function subtractBox(s: Solid, box: Box, name?: string): Solid {
  requireInteger("box coordinates", box.x, box.y, box.z, box.w, box.d, box.h);
  requirePositive("box dimensions", box.w, box.d, box.h);
  return { base: s.base, ops: [...s.ops, { kind: "box", box, name }] };
}

export function subtractCylinder(
  s: Solid, axis: Axis, u: number, v: number, r: number, name?: string,
): Solid {
  requireInteger("cylinder centre", u, v);
  requireInteger("cylinder radius", r);
  requirePositive("cylinder radius", r);
  return { base: s.base, ops: [...s.ops, { kind: "cylinder", axis, u, v, r, name }] };
}
