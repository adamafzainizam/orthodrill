/**
 * Join runs of unit-length edges into whole segments.
 *
 * A four-unit face arrives as four unit edges. Emitting it as four primitives
 * would compare as four wrong answers against a key holding one line, so the
 * merge is not cosmetic — it is part of being correct.
 *
 * Visible and hidden runs are never merged together. They are different
 * primitives, and collapsing them would erase exactly the distinction the
 * scorer exists to report.
 *
 * PURE. No I/O.
 */
import type { UnitEdge } from "./project.ts";

export type LatticeSegment = {
  u1: number; v1: number; u2: number; v2: number; hidden: boolean;
};

export function mergeEdges(es: UnitEdge[]): LatticeSegment[] {
  // Group by the line an edge lies on, and by visibility.
  const groups = new Map<string, UnitEdge[]>();
  for (const e of es) {
    // For along "u" the line is identified by v; for along "v" by u.
    const line = e.along === "u" ? e.v : e.u;
    const key = `${e.along}:${line}:${e.hidden ? "h" : "v"}`;
    const g = groups.get(key);
    if (g) g.push(e); else groups.set(key, [e]);
  }

  const out: LatticeSegment[] = [];
  for (const g of groups.values()) {
    const along = g[0].along;
    // Position along the line, which is the other coordinate.
    const pos = (e: UnitEdge) => (along === "u" ? e.u : e.v);
    const sorted = [...g].sort((a, b) => pos(a) - pos(b));

    let start = pos(sorted[0]);
    let end = start + 1;
    const flush = () => {
      const line = along === "u" ? sorted[0].v : sorted[0].u;
      out.push(along === "u"
        ? { u1: start, v1: line, u2: end, v2: line, hidden: sorted[0].hidden }
        : { u1: line, v1: start, u2: line, v2: end, hidden: sorted[0].hidden });
    };

    for (let i = 1; i < sorted.length; i++) {
      const p = pos(sorted[i]);
      if (p === end) { end = p + 1; continue; }
      flush();
      start = p; end = p + 1;
    }
    flush();
  }

  // Deterministic order so tests and fixtures are stable.
  return out.sort((a, b) => a.v1 - b.v1 || a.u1 - b.u1 || a.v2 - b.v2 || a.u2 - b.u2);
}
