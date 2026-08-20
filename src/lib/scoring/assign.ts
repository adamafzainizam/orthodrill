/**
 * Decide which drawn cluster is the front, top and side view.
 *
 * By CONTENT, not by position. Position is what the convention governs, so
 * inferring the view from where it was drawn would make it impossible to
 * detect that the student placed the views wrongly — the scorer would simply
 * agree with whatever they did.
 *
 * Brute-forces all six permutations and takes the lowest total cost. Six is
 * trivial, and it removes any heuristic that could mis-identify a view and
 * then blame the student for the mistake.
 *
 * PURE. No I/O.
 */
import { compareView, diffCost } from "./compare.ts";
import type { Primitive } from "./primitives.ts";
import type { ViewDiff, ViewName } from "./types.ts";

export type KeyViews = { front: Primitive[]; top: Primitive[]; side: Primitive[] };

export type Assignment = {
  byView: Record<ViewName, { cluster: Primitive[]; diff: ViewDiff }>;
};

const VIEW_ORDER: ViewName[] = ["front", "top", "side"];

const PERMUTATIONS: number[][] = [
  [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
];

export function assignClusters(clusters: Primitive[][], key: KeyViews): Assignment {
  if (clusters.length !== 3) {
    throw new Error(`assignClusters needs exactly three clusters, got ${clusters.length}`);
  }

  let best: Assignment | null = null;
  let bestCost = Infinity;

  for (const perm of PERMUTATIONS) {
    const byView = {} as Assignment["byView"];
    let cost = 0;
    VIEW_ORDER.forEach((view, i) => {
      const cluster = clusters[perm[i]];
      const diff = compareView(cluster, key[view]);
      cost += diffCost(diff);
      byView[view] = { cluster, diff };
    });
    if (cost < bestCost) { bestCost = cost; best = { byView }; }
  }

  return best!;
}
