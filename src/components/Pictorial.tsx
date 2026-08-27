import type { IsoPrimitive } from "@/lib/geometry/isotypes";

/**
 * THE ARRAY IS A PAINT PROGRAM, NOT A SET. Render it in order: each face is an
 * opaque fill in the PAPER colour, stroked in that same colour to seal its own
 * boundary, and later fills paint over earlier strokes — that overdraw is the
 * entire hidden-line mechanism. Never sort, filter or deduplicate it.
 * See src/lib/geometry/isoedges.ts and AGENTS.md §6.
 */
const PAPER = "#ffffff";
const SCALE = 22;
const PAD = 16;

export function Pictorial({ primitives }: { primitives: readonly IsoPrimitive[] }) {
  if (primitives.length === 0) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of primitives) {
    if (p.kind === "iso-line") { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
    else if (p.kind === "iso-face") { for (const q of p.points) { xs.push(q[0]); ys.push(q[1]); } }
    else { xs.push(p.cx - p.rx, p.cx + p.rx); ys.push(p.cy - p.rx, p.cy + p.rx); }
  }
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const px = (n: number) => (n - minX) * SCALE + PAD;
  const py = (n: number) => (n - minY) * SCALE + PAD;
  const w = (maxX - minX) * SCALE + PAD * 2;
  const h = (maxY - minY) * SCALE + PAD * 2;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      className="max-w-full h-auto border border-[var(--rule)]"
      style={{ background: PAPER }} role="img" aria-label="Isometric view of the part">
      {primitives.map((p, i) => {
        if (p.kind === "iso-face") {
          return <polygon key={i} points={p.points.map((q) => `${px(q[0])},${py(q[1])}`).join(" ")}
            fill={PAPER} stroke={PAPER} strokeWidth={0.3} />;
        }
        if (p.kind === "iso-line") {
          return <line key={i} x1={px(p.x1)} y1={py(p.y1)} x2={px(p.x2)} y2={py(p.y2)}
            stroke="#111" strokeWidth={2} />;
        }
        return <ellipse key={i} cx={px(p.cx)} cy={py(p.cy)} rx={p.rx * SCALE} ry={p.ry * SCALE}
          fill="none" stroke="#111" strokeWidth={2}
          transform={`rotate(${p.rotation} ${px(p.cx)} ${py(p.cy)})`} />;
      })}
    </svg>
  );
}
