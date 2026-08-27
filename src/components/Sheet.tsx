"use client";

import { gridToScreen, screenToGrid, type Point, type Viewport } from "@/lib/canvas/coords";
import type { Primitive } from "@/lib/scoring/primitives";
import type { ViewDiff } from "@/lib/scoring/types";

export type FeedbackOverlay = { views: ViewDiff[] };

const VIEWPORT: Viewport = { cell: 20, padding: 16 };

const DASH: Record<string, string | undefined> = {
  visible: undefined,
  hidden: "6 4",
  centre: "12 3 3 3",
};

/** Ink colours. Feedback tones are separate so they never collide with them. */
const INK = { visible: "var(--ink)", hidden: "var(--ink)", centre: "var(--centre)" };

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
    return screenToGrid({ x: e.clientX - box.left, y: e.clientY - box.top }, v);
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
            strokeWidth: chosen.has(i) ? 3 : 2,
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
