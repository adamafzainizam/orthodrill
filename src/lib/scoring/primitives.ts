/**
 * Geometric primitives and the operations the scorer needs on them.
 *
 * PURE. No I/O, no framework imports. See AGENTS.md §2 constraint 3.
 */

export type PrimitiveType = "visible" | "hidden" | "centre";

export type Segment = {
  kind: "segment";
  type: PrimitiveType;
  x1: number; y1: number; x2: number; y2: number;
};

export type Circle = {
  kind: "circle";
  type: PrimitiveType;
  cx: number; cy: number; r: number;
};

export type Primitive = Segment | Circle;

export type BBox = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * Put a primitive into canonical form so two equal primitives compare equal.
 * A segment drawn right-to-left is the same segment as left-to-right, so
 * endpoints are ordered by x, then y.
 */
export function normalise(p: Primitive): Primitive {
  if (p.kind === "circle") return { ...p };
  const swap = p.x1 > p.x2 || (p.x1 === p.x2 && p.y1 > p.y2);
  return swap
    ? { ...p, x1: p.x2, y1: p.y2, x2: p.x1, y2: p.y1 }
    : { ...p };
}

/**
 * Identity of a primitive by POSITION ONLY, deliberately excluding its type.
 *
 * This is what lets the scorer report "right line, wrong line style" — the
 * classic error of drawing a hidden edge solid — rather than reporting one
 * missing primitive and one extra primitive, which would teach nothing.
 */
export function positionKey(p: Primitive): string {
  const n = normalise(p);
  return n.kind === "circle"
    ? `c:${n.cx},${n.cy},${n.r}`
    : `s:${n.x1},${n.y1},${n.x2},${n.y2}`;
}

export function translate(p: Primitive, dx: number, dy: number): Primitive {
  return p.kind === "circle"
    ? { ...p, cx: p.cx + dx, cy: p.cy + dy }
    : { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy };
}

/** Null for an empty set — a zero-sized box at the origin would be a lie. */
export function boundingBox(ps: Primitive[]): BBox | null {
  if (ps.length === 0) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of ps) {
    const [a, b, c, d] = p.kind === "circle"
      ? [p.cx - p.r, p.cy - p.r, p.cx + p.r, p.cy + p.r]
      : [Math.min(p.x1, p.x2), Math.min(p.y1, p.y2), Math.max(p.x1, p.x2), Math.max(p.y1, p.y2)];
    minX = Math.min(minX, a); minY = Math.min(minY, b);
    maxX = Math.max(maxX, c); maxY = Math.max(maxY, d);
  }
  return { minX, minY, maxX, maxY };
}
