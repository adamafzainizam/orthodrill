import type { Primitive, PrimitiveType } from "@/lib/scoring/primitives";

/**
 * Renders a topic's worked method diagram — construction lines and the
 * curve they locate, as plain data with no notion of WHICH topic or WHICH
 * exercise it came from. Structurally a smaller cousin of `Pictorial.tsx`:
 * a self-contained SVG scaled to its own content, safe in a client tree
 * because it only ever receives primitives, never anything that derives
 * them (`geometry/parabola.ts` is server-only; see
 * `src/drills/registry.ts`'s `PARABOLA_METHOD_DIAGRAM` and
 * `isolation.test.ts`).
 *
 * Deliberately its own small colour/weight scheme rather than importing
 * Sheet.tsx's — Sheet's DASH/INK maps are module-private on purpose (they
 * are keyed to the drawing surface's own affordances, e.g. a fat hit-target
 * stroke this component has no use for), so duplicating the two lines that
 * matter here is simpler than exporting internals across that boundary.
 */
const SCALE = 26;
const PAD = 12;

const STROKE: Record<PrimitiveType, string> = {
  visible: "var(--ink)",
  hidden: "var(--ink)",
  centre: "var(--centre)",
  construction: "var(--construction)",
};

const DASH: Record<PrimitiveType, string | undefined> = {
  visible: undefined,
  hidden: "6 4",
  centre: "10 3 3 3",
  construction: undefined,
};

const WIDTH: Record<PrimitiveType, number> = {
  visible: 2.5,
  hidden: 1.5,
  centre: 1,
  construction: 1,
};

export function MethodDiagram({ primitives, caption }: { primitives: readonly Primitive[]; caption: string }) {
  if (primitives.length === 0) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of primitives) {
    if (p.kind === "segment") { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
    else { xs.push(p.cx - p.r, p.cx + p.r); ys.push(p.cy - p.r, p.cy + p.r); }
  }
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const px = (n: number) => (n - minX) * SCALE + PAD;
  const py = (n: number) => (n - minY) * SCALE + PAD;
  const w = (maxX - minX) * SCALE + PAD * 2;
  const h = (maxY - minY) * SCALE + PAD * 2;

  return (
    <figure className="m-0">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
        className="max-w-full h-auto border border-[var(--rule)]"
        style={{ background: "var(--paper)" }} role="img" aria-label={caption}>
        {primitives.map((p, i) => {
          const stroke = STROKE[p.type];
          const dash = DASH[p.type];
          const strokeWidth = WIDTH[p.type];
          if (p.kind === "circle") {
            return <circle key={i} cx={px(p.cx)} cy={py(p.cy)} r={p.r * SCALE}
              fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />;
          }
          return <line key={i} x1={px(p.x1)} y1={py(p.y1)} x2={px(p.x2)} y2={py(p.y2)}
            stroke={stroke} strokeWidth={strokeWidth} strokeDasharray={dash} />;
        })}
      </svg>
      <figcaption className="text-xs mt-1 opacity-70">{caption}</figcaption>
    </figure>
  );
}
