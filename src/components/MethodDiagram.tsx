import type { ReactElement } from "react";
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

/*
 * BLEND variant. Drawn straight onto whatever surface hosts it, in the text
 * palette rather than in ink, so a preview reads as part of its card instead
 * of a white photograph pasted on top of one.
 *
 * Safe here and NOT safe in Pictorial.tsx, for a reason worth stating: this
 * component renders plain segments and circles, which have no fills. The
 * pictorial renders an ordered PAINT PROGRAM whose opaque face fills must
 * match the ground EXACTLY — that overdraw is its entire hidden-line
 * mechanism, so it cannot be made transparent (AGENTS.md §6).
 */
const BLEND_STROKE: Record<PrimitiveType, string> = {
  visible: "var(--text-secondary)",
  hidden: "var(--text-tertiary)",
  centre: "var(--centre)",
  construction: "var(--text-tertiary)",
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

export function MethodDiagram({
  primitives, caption, variant = "paper", grid = false,
}: {
  primitives: readonly Primitive[];
  caption: string;
  /** `paper` for reference material a student studies; `blend` for a preview
   *  that should sit quietly on its host surface. */
  variant?: "paper" | "blend";
  /**
   * Draw squared paper behind the figure.
   *
   * NOT decoration. When a figure is the only statement of a part's SIZE — as
   * the three-views prompt is, since it carries no dimensions — the student
   * has to be able to count units off it, or they cannot produce the answer
   * key at all and the exercise is unanswerable. Same reasoning that put a
   * grid under the verification sheet's orthographic views.
   */
  grid?: boolean;
}) {
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

  const blend = variant === "blend";
  const palette = blend ? BLEND_STROKE : STROKE;

  // One line per whole grid unit, covering the figure's own extent plus the
  // padding, so a student can count squares to read a size off the drawing.
  //
  // `--grid` on `--paper`, which is exactly what the drawing canvas uses, NOT
  // `--rule`: that is a BORDER token, and at 0.5px it sub-pixelled away
  // entirely, leaving a caption telling the student to count squares that were
  // not there. Caught by rendering the page, which is the only thing that sees
  // it (AGENTS.md §6).
  const gridLines: ReactElement[] = [];
  if (grid) {
    for (let i = 0; i <= Math.round(maxX - minX); i++) {
      gridLines.push(<line key={`gv${i}`} x1={px(minX + i)} y1={PAD} x2={px(minX + i)} y2={h - PAD}
        stroke="var(--grid)" strokeWidth={1} />);
    }
    for (let j = 0; j <= Math.round(maxY - minY); j++) {
      gridLines.push(<line key={`gh${j}`} x1={PAD} y1={py(minY + j)} x2={w - PAD} y2={py(minY + j)}
        stroke="var(--grid)" strokeWidth={1} />);
    }
  }

  return (
    <figure className="m-0">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}
        className={blend ? "max-w-full h-auto" : "max-w-full h-auto border border-[var(--rule)]"}
        style={blend
          ? {
            background: "transparent",
            opacity: 0.92,
            // Dissolve at the edges so the figure has no boundary to read as
            // a pasted-on image. The gradient is sized LARGER than the box
            // (125%) so only the far corners reach transparency: a
            // closest-side mask ate the outer views of a wide figure and
            // left it looking like fragments rather than a drawing.
            maskImage: "radial-gradient(125% 125% at 50% 50%, #000 58%, transparent 100%)",
            WebkitMaskImage: "radial-gradient(125% 125% at 50% 50%, #000 58%, transparent 100%)",
          }
          : { background: "var(--paper)" }}
        role="img" aria-label={caption}>
        {gridLines}
        {primitives.map((p, i) => {
          const stroke = palette[p.type];
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
      {caption !== "" && <figcaption className="t-small mt-1.5">{caption}</figcaption>}
    </figure>
  );
}
