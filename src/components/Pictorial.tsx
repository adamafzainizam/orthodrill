import type { IsoPrimitive } from "@/lib/geometry/isotypes";
import type { IsoDim } from "@/lib/geometry/isodims";

/**
 * THE ARRAY IS A PAINT PROGRAM, NOT A SET. Render it in order: each face is an
 * opaque fill in the PAPER colour, stroked in that same colour to seal its own
 * boundary, and later fills paint over earlier strokes — that overdraw is the
 * entire hidden-line mechanism. Never sort, filter or deduplicate it.
 * See src/lib/geometry/isoedges.ts and AGENTS.md §6.
 *
 * Dimensions are drawn AFTER every primitive, in a real ink colour distinct
 * from the object's own stroke — never the paper colour, or they would seal
 * against themselves the way a face fill seals its own boundary. They are
 * folded into the bounding-box computation below deliberately: isodims.ts
 * places them outside the picture's own silhouette on purpose, and a
 * bounding box drawn from `primitives` alone would clip exactly that.
 *
 * Every figure isodims.ts hands back is a BARE NUMBER — no repeated "mm" —
 * so the unit is declared exactly once, here, in the caption under the
 * drawing. Do not put "mm" back onto individual labels; that was the second
 * thing a real render caught (labels wide enough to run into each other).
 *
 * `labelAnchor`/`labelBaseline` come from isodims.ts, not decided here: which
 * side of its own dimension line a label reads from depends on which way
 * that dimension was pushed out, and isodims.ts is the one place that knows.
 */
const PAPER = "#ffffff";
const INK = "#111";
const DIM_INK = "#1a5fb4";
/** Font size of a dimension figure, in px. Must match the <text> below. */
const LABEL_SIZE = 11;

/**
 * Estimated width of a label, in MODEL units.
 *
 * 0.62em per character is a generous average for digits in a sans face; the
 * diameter prefix is wider than a digit, so it is counted as two. Over-
 * estimating is the safe direction.
 */
function labelWidthUnits(label: string): number {
  const chars = label.length + (label.includes("\u2300") ? 1 : 0);
  return (chars * LABEL_SIZE * 0.62) / SCALE;
}

const SCALE = 22;
const PAD = 16;

export function Pictorial(
  { primitives, dimensions = [] }:
  { primitives: readonly IsoPrimitive[]; dimensions?: readonly IsoDim[] },
) {
  if (primitives.length === 0) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of primitives) {
    if (p.kind === "iso-line") { xs.push(p.x1, p.x2); ys.push(p.y1, p.y2); }
    else if (p.kind === "iso-face") { for (const q of p.points) { xs.push(q[0]); ys.push(q[1]); } }
    else { xs.push(p.cx - p.rx, p.cx + p.rx); ys.push(p.cy - p.rx, p.cy + p.rx); }
  }
  for (const d of dimensions) {
    xs.push(d.line.x1, d.line.x2, d.extension[0].x1, d.extension[0].x2, d.extension[1].x1, d.extension[1].x2);
    ys.push(d.line.y1, d.line.y2, d.extension[0].y1, d.extension[0].y2, d.extension[1].y1, d.extension[1].y2);
    for (const arrow of d.arrows) for (const [ax, ay] of arrow) { xs.push(ax); ys.push(ay); }

    // A LABEL IS TEXT, and its width is in no coordinate. Including only its
    // anchor point let a figure anchored near an edge run off the paper and
    // render on the page background instead — visible on `near-mirror-notches`
    // before this was fixed. There are no font metrics here, so the extent is
    // estimated and deliberately generous: extra white margin costs nothing,
    // a clipped figure is a bug.
    const halfW = labelWidthUnits(d.label) / 2;
    const halfH = (LABEL_SIZE / SCALE) * 0.75;
    const centreX = d.labelAnchor === "start" ? d.labelAt.x + halfW
      : d.labelAnchor === "end" ? d.labelAt.x - halfW
      : d.labelAt.x;
    xs.push(centreX - halfW, centreX + halfW);
    ys.push(d.labelAt.y - halfH, d.labelAt.y + halfH);
  }
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const px = (n: number) => (n - minX) * SCALE + PAD;
  const py = (n: number) => (n - minY) * SCALE + PAD;
  const w = (maxX - minX) * SCALE + PAD * 2;
  const h = (maxY - minY) * SCALE + PAD * 2;

  return (
    <>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
        className="max-w-full h-auto border border-[var(--rule)]"
        style={{ background: PAPER }} role="img" aria-label="Isometric view of the part, dimensioned">
        {primitives.map((p, i) => {
          if (p.kind === "iso-face") {
            return <polygon key={i} points={p.points.map((q) => `${px(q[0])},${py(q[1])}`).join(" ")}
              fill={PAPER} stroke={PAPER} strokeWidth={0.3} />;
          }
          if (p.kind === "iso-line") {
            return <line key={i} x1={px(p.x1)} y1={py(p.y1)} x2={px(p.x2)} y2={py(p.y2)}
              stroke={INK} strokeWidth={2} />;
          }
          return <ellipse key={i} cx={px(p.cx)} cy={py(p.cy)} rx={p.rx * SCALE} ry={p.ry * SCALE}
            fill="none" stroke={INK} strokeWidth={2}
            transform={`rotate(${p.rotation} ${px(p.cx)} ${py(p.cy)})`} />;
        })}
        {dimensions.map((d, i) => (
          <g key={i} stroke={DIM_INK} fill={DIM_INK}>
            <line x1={px(d.extension[0].x1)} y1={py(d.extension[0].y1)}
              x2={px(d.extension[0].x2)} y2={py(d.extension[0].y2)} strokeWidth={0.5} />
            <line x1={px(d.extension[1].x1)} y1={py(d.extension[1].y1)}
              x2={px(d.extension[1].x2)} y2={py(d.extension[1].y2)} strokeWidth={0.5} />
            <line x1={px(d.line.x1)} y1={py(d.line.y1)} x2={px(d.line.x2)} y2={py(d.line.y2)} strokeWidth={0.75} />
            {d.arrows.map((arrow, j) => (
              <polygon key={j} points={arrow.map(([ax, ay]) => `${px(ax)},${py(ay)}`).join(" ")} stroke="none" />
            ))}
            <text x={px(d.labelAt.x)} y={py(d.labelAt.y)} fontSize={11}
              textAnchor={d.labelAnchor} dominantBaseline={d.labelBaseline} stroke="none">
              {d.label}
            </text>
          </g>
        ))}
      </svg>
      {dimensions.length > 0 && (
        <p className="text-xs mt-1 opacity-70">Dimensions in mm</p>
      )}
    </>
  );
}
