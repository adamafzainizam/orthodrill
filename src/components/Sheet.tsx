"use client";

import { gridToScreen, screenToGrid, type Point, type Viewport } from "@/lib/canvas/coords";
import { mitreLine } from "@/lib/canvas/quadrants";
import type { Primitive, PrimitiveType } from "@/lib/scoring/primitives";
import type { ViewDiff } from "@/lib/scoring/types";

export type FeedbackOverlay = { views: ViewDiff[] };

const VIEWPORT: Viewport = { cell: 20, padding: 16 };

// Typed Record<PrimitiveType, ...> rather than a loose Record<string, ...> so
// the compiler forces every new primitive type to be given a dash pattern
// and an ink colour here — it caught nothing missing for "construction" only
// because both were added deliberately in the same change.
const DASH: Record<PrimitiveType, string | undefined> = {
  visible: undefined,
  hidden: "6 4",
  centre: "12 3 3 3",
  // A real construction line is a faint continuous line, not a dashed one —
  // it reads as scaffolding through its weight and colour, not its pattern.
  construction: undefined,
};

/** Ink colours. Feedback tones are separate so they never collide with them. */
const INK: Record<PrimitiveType, string> = {
  visible: "var(--ink)",
  hidden: "var(--ink)",
  centre: "var(--centre)",
  construction: "var(--construction)",
};

function primitivePath(p: Primitive, v: Viewport, extra: Record<string, unknown>) {
  const dash = DASH[p.type];
  if (p.kind === "circle") {
    const c = gridToScreen({ x: p.cx, y: p.cy }, v);
    return <circle cx={c.x} cy={c.y} r={p.r * v.cell} fill="none" strokeDasharray={dash} {...extra} />;
  }
  const a = gridToScreen({ x: p.x1, y: p.y1 }, v);
  const b = gridToScreen({ x: p.x2, y: p.y2 }, v);
  return <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeDasharray={dash} {...extra} />;
}

/** Put an origin-normalised feedback primitive back where the student drew. */
function place(p: Primitive, anchor: { dx: number; dy: number }): Primitive {
  return p.kind === "circle"
    ? { ...p, cx: p.cx + anchor.dx, cy: p.cy + anchor.dy }
    : { ...p, x1: p.x1 + anchor.dx, y1: p.y1 + anchor.dy, x2: p.x2 + anchor.dx, y2: p.y2 + anchor.dy };
}

export function Sheet({
  grid, drawing, selection, pending, cursor, feedback, onGridClick, onGridMove,
}: {
  grid: { width: number; height: number };
  drawing: Primitive[];
  selection: number[];
  pending: Point | null;
  cursor: Point | null;
  feedback: FeedbackOverlay | null;
  onGridClick: (p: Point, additive: boolean) => void;
  onGridMove: (p: Point) => void;
}) {
  const v = VIEWPORT;
  const w = grid.width * v.cell + v.padding * 2;
  const h = grid.height * v.cell + v.padding * 2;
  const chosen = new Set(selection);

  const toGrid = (e: React.MouseEvent<SVGSVGElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect();
    // The SVG is max-w-full, so its rendered box can be narrower than its
    // viewBox. Convert to viewBox units first, or every click lands in the
    // wrong cell on a narrow viewport.
    const scaleX = box.width === 0 ? 1 : w / box.width;
    const scaleY = box.height === 0 ? 1 : h / box.height;
    return screenToGrid(
      { x: (e.clientX - box.left) * scaleX, y: (e.clientY - box.top) * scaleY },
      v,
    );
  };

  const gridLines = [];
  for (let x = 0; x <= grid.width; x++) {
    const a = gridToScreen({ x, y: 0 }, v);
    const b = gridToScreen({ x, y: grid.height }, v);
    gridLines.push(<line key={`v${x}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-[var(--grid)]" strokeWidth={1} />);
  }
  for (let y = 0; y <= grid.height; y++) {
    const a = gridToScreen({ x: 0, y }, v);
    const b = gridToScreen({ x: grid.width, y }, v);
    gridLines.push(<line key={`h${y}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="stroke-[var(--grid)]" strokeWidth={1} />);
  }

  // Quadrant dividers and the mitre line are a VISUAL AID ONLY -- they help
  // the student lay the sheet out, exactly the way a draughtsman's own
  // construction lines would. Neither is a primitive: they are never added
  // to `drawing` and never reach the scorer. `mitreLine` looks at CONTENT
  // (which quadrant the student's own primitives occupy) purely to find the
  // one empty quadrant to draw in -- it never decides which view belongs
  // where. See `src/lib/canvas/quadrants.ts`.
  const midX = gridToScreen({ x: grid.width / 2, y: 0 }, v).x;
  const midY = gridToScreen({ x: 0, y: grid.height / 2 }, v).y;
  const topLeft = gridToScreen({ x: 0, y: 0 }, v);
  const bottomRight = gridToScreen({ x: grid.width, y: grid.height }, v);
  const mitre = mitreLine(drawing, grid);
  const mitreA = mitre ? gridToScreen({ x: mitre.x1, y: mitre.y1 }, v) : null;
  const mitreB = mitre ? gridToScreen({ x: mitre.x2, y: mitre.y2 }, v) : null;

  return (
    <svg
      width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      className="max-w-full h-auto touch-none select-none bg-[var(--paper)]"
      onClick={(e) => onGridClick(toGrid(e), e.ctrlKey || e.metaKey)}
      onMouseMove={(e) => onGridMove(toGrid(e))}
      role="application"
      aria-label="Drawing sheet"
    >
      <g>{gridLines}</g>

      {/* Quadrant dividers: clearer than the grid, quieter than the drawing.
          Drawn under the feedback overlay and the student's ink (see below). */}
      <g>
        <line x1={midX} y1={topLeft.y} x2={midX} y2={bottomRight.y} stroke="var(--quadrant)" strokeWidth={1} />
        <line x1={topLeft.x} y1={midY} x2={bottomRight.x} y2={midY} stroke="var(--quadrant)" strokeWidth={1} />
      </g>

      {/* The mitre line in the sheet's one empty quadrant, styled exactly like
          the student's own construction lines so it reads as scaffolding,
          not as ink they drew. Chrome only: never part of `drawing`. */}
      {mitre && mitreA && mitreB && (
        <line x1={mitreA.x} y1={mitreA.y} x2={mitreB.x} y2={mitreB.y} stroke="var(--construction)" strokeWidth={1} />
      )}

      {/* Feedback sits UNDER the student's ink, so their own drawing stays readable. */}
      {feedback?.views.map((d, vi) => (
        <g key={vi}>
          {d.missing.map((p, i) => (
            <g key={`m${i}`}>{primitivePath(place(p, d.anchor), v, { stroke: "var(--miss)", strokeWidth: 3, opacity: 0.55 })}</g>
          ))}
          {d.extra.map((p, i) => (
            <g key={`x${i}`}>{primitivePath(place(p, d.anchor), v, { stroke: "var(--bad)", strokeWidth: 6, opacity: 0.3 })}</g>
          ))}
          {d.wrongType.map((wt, i) => (
            <g key={`t${i}`}>{primitivePath(place(wt.expected, d.anchor), v, { stroke: "var(--warn)", strokeWidth: 6, opacity: 0.35 })}</g>
          ))}
        </g>
      ))}

      {drawing.map((p, i) => (
        <g key={i}>
          {/* A wide transparent stroke makes a thin line easy to hit. */}
          {primitivePath(p, v, { stroke: "transparent", strokeWidth: 14, fill: "none" })}
          {primitivePath(p, v, {
            stroke: chosen.has(i) ? "var(--select)" : INK[p.type],
            // Construction lines are thin and light — scaffolding, not ink —
            // so they read as working lines even when unselected.
            strokeWidth: chosen.has(i) ? 3 : p.type === "construction" ? 1 : 2,
            fill: "none",
          })}
        </g>
      ))}

      {pending !== null && cursor !== null && (
        <line
          x1={gridToScreen(pending, v).x} y1={gridToScreen(pending, v).y}
          x2={gridToScreen(cursor, v).x} y2={gridToScreen(cursor, v).y}
          stroke="var(--select)" strokeWidth={2} strokeDasharray="4 4" opacity={0.7}
        />
      )}
    </svg>
  );
}
