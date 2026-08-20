/**
 * Partition a loose set of primitives into spatially separated groups.
 *
 * The student draws all three views on one canvas and positions them
 * themselves, so the scorer must work out where one view ends and the next
 * begins before it can compare anything.
 *
 * Union-find over bounding boxes that are within `gap` of each other. Simple,
 * deterministic, and O(n^2) — which is irrelevant at the tens-of-primitives
 * scale a drill produces, and far easier to reason about than a spatial index.
 *
 * PURE. No I/O.
 */
import { boundingBox, type BBox, type Primitive } from "./primitives.ts";

function near(a: BBox, b: BBox, gap: number): boolean {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
  return dx <= gap && dy <= gap;
}

export function clusterPrimitives(ps: Primitive[], gap: number): Primitive[][] {
  if (ps.length === 0) return [];

  const boxes = ps.map((p) => boundingBox([p])!);
  const parent = ps.map((_, i) => i);

  const find = (i: number): number => {
    while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  };
  const union = (i: number, j: number) => { parent[find(i)] = find(j); };

  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) {
      if (near(boxes[i], boxes[j], gap)) union(i, j);
    }
  }

  const groups = new Map<number, Primitive[]>();
  ps.forEach((p, i) => {
    const root = find(i);
    const g = groups.get(root);
    if (g) g.push(p); else groups.set(root, [p]);
  });

  // Deterministic order so tests and feedback are stable: top-to-bottom,
  // then left-to-right.
  return [...groups.values()].sort((a, b) => {
    const ba = boundingBox(a)!, bb = boundingBox(b)!;
    return ba.minY - bb.minY || ba.minX - bb.minX;
  });
}
