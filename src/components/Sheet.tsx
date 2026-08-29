"use client";

import { useCallback, useEffect, useRef } from "react";
import { gridToScreen, screenToGrid, type Point, type Viewport } from "@/lib/canvas/coords";
import { mitreLine } from "@/lib/canvas/quadrants";
import { headingOf, interactionsWith, isExactAngle, type Interaction } from "@/lib/canvas/angles";
import { pendingPrimitive, type Action, type Drag, type Tool } from "@/lib/canvas/editor";
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

/**
 * Collapse Interactions that would draw on top of one another.
 *
 * Two segments meeting at a point yield two Interactions AT that point. If they
 * report the same angle that is one reading, not two; if they differ, each gets
 * its own row so both stay readable. `row` is the label's stacking index.
 */
function dedupeAndStack(items: Interaction[]): Array<Interaction & { row: number }> {
  const seen = new Set<string>();
  const rows = new Map<string, number>();
  const out: Array<Interaction & { row: number }> = [];
  for (const it of items) {
    const place = `${it.at.x},${it.at.y}`;
    const exact = `${place}@${it.degrees.toFixed(4)}`;
    if (seen.has(exact)) continue;
    seen.add(exact);
    const row = rows.get(place) ?? 0;
    rows.set(place, row + 1);
    out.push({ ...it, row });
  }
  return out;
}

/** Put an origin-normalised feedback primitive back where the student drew. */
function place(p: Primitive, anchor: { dx: number; dy: number }): Primitive {
  return p.kind === "circle"
    ? { ...p, cx: p.cx + anchor.dx, cy: p.cy + anchor.dy }
    : { ...p, x1: p.x1 + anchor.dx, y1: p.y1 + anchor.dy, x2: p.x2 + anchor.dx, y2: p.y2 + anchor.dy };
}

export function Sheet({
  grid, mode, tool, activeType, drawing, selection, pending, drag, cursor, feedback, onAction, onGridMove,
}: {
  grid: { width: number; height: number };
  /**
   * Explicit, not inferred from the absence of a third view or anything
   * else about `drawing` — same reasoning as `Drill.mode` (registry.ts):
   * inference is how the wrong branch gets taken. Gates the quadrant
   * dividers and the mitre line below, which exist to help lay out THREE
   * views; a "figure" exercise has one figure and nothing to place relative
   * to anything else, so both would be meaningless (or actively misleading,
   * in the mitre line's case) furniture on its sheet.
   */
  mode: "views" | "figure";
  tool: Tool;
  drawing: Primitive[];
  selection: number[];
  activeType: PrimitiveType;
  pending: Point | null;
  drag: Drag | null;
  cursor: Point | null;
  feedback: FeedbackOverlay | null;
  onAction: (a: Action) => void;
  onGridMove: (p: Point) => void;
}) {
  const v = VIEWPORT;
  const w = grid.width * v.cell + v.padding * 2;
  const h = grid.height * v.cell + v.padding * 2;
  const chosen = new Set(selection);

  const svgRef = useRef<SVGSVGElement>(null);
  // The point of the most recent mousedown, in grid units, while the button
  // is still held and no drag has been recognised yet. Null once released or
  // once DRAG_BEGIN has fired for this press. A ref, not state: it drives an
  // imperative decision (click vs. drag) made inside event handlers, not
  // anything rendered.
  const downAt = useRef<Point | null>(null);
  // Whether the current press has already turned into a recognised drag —
  // separate from `drag` (the reducer's state) so a mouseup can tell "no
  // drag happened, treat this as a click" apart from "a drag happened and
  // moved back to its start", which the reducer's `drag` alone can't say
  // once DRAG_COMMIT has cleared it.
  const dragging = useRef(false);

  const clientToGrid = useCallback((clientX: number, clientY: number): Point => {
    const box = svgRef.current?.getBoundingClientRect();
    if (box === undefined) return { x: 0, y: 0 };
    // The SVG is max-w-full, so its rendered box can be narrower than its
    // viewBox. Convert to viewBox units first, or every click lands in the
    // wrong cell on a narrow viewport.
    const scaleX = box.width === 0 ? 1 : w / box.width;
    const scaleY = box.height === 0 ? 1 : h / box.height;
    return screenToGrid(
      { x: (clientX - box.left) * scaleX, y: (clientY - box.top) * scaleY },
      VIEWPORT,
    );
  }, [w, h]);

  // Window-level listeners, not just the SVG's own onMouseMove/onMouseUp: a
  // drag that leaves the sheet before the button is released must still be
  // tracked and committed, or the button-up outside the SVG never reaches it
  // and both `dragging` and the reducer's `drag` are left stale.
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (downAt.current === null) return;
      const at = clientToGrid(e.clientX, e.clientY);
      if (!dragging.current) {
        if (at.x === downAt.current.x && at.y === downAt.current.y) return;
        dragging.current = true;
        onAction({ type: "DRAG_BEGIN", at: downAt.current });
      }
      onAction({ type: "DRAG_UPDATE", at });
    };
    const onUp = (e: MouseEvent) => {
      if (downAt.current === null) return;
      const additive = e.ctrlKey || e.metaKey;
      if (dragging.current) {
        onAction({ type: "DRAG_COMMIT", additive });
      } else {
        onAction({ type: "CLICK_GRID", at: downAt.current, additive });
      }
      downAt.current = null;
      dragging.current = false;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onAction, clientToGrid]);

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
  // the student lay THREE views out, exactly the way a draughtsman's own
  // construction lines would. Neither is a primitive: they are never added
  // to `drawing` and never reach the scorer. `mitreLine` looks at CONTENT
  // (which quadrant the student's own primitives occupy) purely to find the
  // one empty quadrant to draw in -- it never decides which view belongs
  // where. See `src/lib/canvas/quadrants.ts`. Both are `mode === "views"`
  // only: a "figure" exercise has one figure, not three views to place, so
  // there is no layout for either of these to assist with.
  const midX = gridToScreen({ x: grid.width / 2, y: 0 }, v).x;
  const midY = gridToScreen({ x: 0, y: grid.height / 2 }, v).y;
  const topLeft = gridToScreen({ x: 0, y: 0 }, v);
  const bottomRight = gridToScreen({ x: grid.width, y: grid.height }, v);
  const mitre = mode === "views" ? mitreLine(drawing, grid) : null;
  const mitreA = mitre ? gridToScreen({ x: mitre.x1, y: mitre.y1 }, v) : null;
  const mitreB = mitre ? gridToScreen({ x: mitre.x2, y: mitre.y2 }, v) : null;

  // The rubber-band rectangle, purely a rendering of `drag` — the reducer
  // decides what it selects, on DRAG_COMMIT; this just shows it in progress.
  const marquee = tool === "select" && drag
    ? {
      minX: Math.min(drag.start.x, drag.current.x), minY: Math.min(drag.start.y, drag.current.y),
      maxX: Math.max(drag.start.x, drag.current.x), maxY: Math.max(drag.start.y, drag.current.y),
    }
    : null;

  // A live preview of a move-in-progress: the selection redrawn at its
  // dragged offset. Also rendering only — the drawing itself is unchanged
  // until DRAG_COMMIT shifts it in one step.
  const moveDelta = tool === "move" && drag
    ? { dx: drag.current.x - drag.start.x, dy: drag.current.y - drag.start.y }
    : null;

  // The angle readout. Rendering only: an Interaction never enters `drawing`,
  // so its frequently-fractional crossing point cannot reach validate.ts.
  // Lines only -- a circle has no heading, and the angle of its radius drag
  // means nothing to the student.
  const showAngles = pending !== null && cursor !== null && tool === "line";
  // Several segments can meet at ONE point — drawing from a corner where two
  // lines already join gives two Interactions at the same place. Identical
  // readings there are one fact, not two, so they are deduplicated; genuinely
  // different angles at the same point are STACKED rather than drawn on top of
  // each other. Found by screenshotting the real page: two 45° labels sat
  // exactly on each other and the overlap was invisible only because they
  // happened to agree.
  const interactions = showAngles && pending && cursor
    ? dedupeAndStack(interactionsWith(pending, cursor, drawing)) : [];
  const heading = showAngles && pending && cursor ? headingOf(pending, cursor) : null;

  return (
    <svg
      ref={svgRef}
      width={w} height={h} viewBox={`0 0 ${w} ${h}`}
      className="max-w-full h-auto touch-none select-none rounded-[var(--radius-lg)]"
      style={{ background: "var(--paper)", boxShadow: "var(--shadow-paper)" }}
      onMouseDown={(e) => {
        // Only the primary button starts a click or drag — the previous
        // `onClick` handler this replaces only ever fired for that button,
        // and a raw mousedown/mouseup pair fires for any button unless
        // guarded, which would let a right-click draw or drag.
        if (e.button !== 0) return;
        downAt.current = clientToGrid(e.clientX, e.clientY);
        dragging.current = false;
      }}
      onMouseMove={(e) => onGridMove(clientToGrid(e.clientX, e.clientY))}
      role="application"
      aria-label="Drawing sheet"
    >
      <g>{gridLines}</g>

      {/* Quadrant dividers: clearer than the grid, quieter than the drawing.
          Drawn under the feedback overlay and the student's ink (see below).
          "views" only -- see the mode prop's doc comment above. */}
      {mode === "views" && (
        <g>
          <line x1={midX} y1={topLeft.y} x2={midX} y2={bottomRight.y} stroke="var(--quadrant)" strokeWidth={1} />
          <line x1={topLeft.x} y1={midY} x2={bottomRight.x} y2={midY} stroke="var(--quadrant)" strokeWidth={1} />
        </g>
      )}

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
            // While a move drag is live, the real primitive fades so the
            // dragged preview below reads as what will actually land.
            opacity: moveDelta && chosen.has(i) ? 0.3 : 1,
            fill: "none",
          })}
        </g>
      ))}

      {moveDelta && selection.map((i) => (
        <g key={`drag${i}`}>
          {primitivePath(place(drawing[i], moveDelta), v, {
            stroke: "var(--select)", strokeWidth: 3, strokeDasharray: "4 4", fill: "none", opacity: 0.8,
          })}
        </g>
      ))}

      {marquee && (
        <rect
          x={gridToScreen({ x: marquee.minX, y: marquee.minY }, v).x}
          y={gridToScreen({ x: marquee.minX, y: marquee.minY }, v).y}
          width={(marquee.maxX - marquee.minX) * v.cell}
          height={(marquee.maxY - marquee.minY) * v.cell}
          fill="var(--select)" fillOpacity={0.1} stroke="var(--select)" strokeWidth={1} strokeDasharray="4 4"
        />
      )}

      {pending !== null && cursor !== null && (() => {
        // The ghost comes from the SAME function that will commit it, so the
        // preview cannot drift from what lands — `radiusFrom` rounds and
        // clamps, and a preview computed here independently would lie at both
        // ends of that range.
        const ghost = pendingPrimitive(tool, activeType, pending, cursor);
        const a = gridToScreen(pending, v);
        const b = gridToScreen(cursor, v);
        return (
          <g pointerEvents="none">
            {/* The radius line stays for the circle tool: it is how you see
                WHERE the edge point is, which the circle alone does not show. */}
            <line
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="var(--select)" strokeWidth={2} strokeDasharray="4 4" opacity={0.7}
            />
            {ghost?.kind === "circle" && (
              <circle
                cx={a.x} cy={a.y} r={ghost.r * v.cell}
                fill="none" stroke="var(--select)" strokeWidth={2}
                strokeDasharray="4 4" opacity={0.7}
              />
            )}
          </g>
        );
      })()}

      {interactions.map((it, i) => {
        const p = gridToScreen(it.at, v);
        const tone = it.exact ? "var(--select)" : "var(--warn)";
        return (
          <g key={`ang${i}`} pointerEvents="none">
            <circle cx={p.x} cy={p.y} r={9} fill="none" stroke={tone} strokeWidth={1.5} opacity={0.85} />
            <rect
              x={p.x + 12} y={p.y - 20 - it.row * 19} width={54} height={17} rx={3}
              fill="var(--bg-raised)" stroke={tone} strokeWidth={1} opacity={0.95}
            />
            <text
              x={p.x + 39} y={p.y - 8 - it.row * 19} textAnchor="middle"
              fontSize={11} fill={tone} style={{ fontVariantNumeric: "tabular-nums" }}
            >{it.degrees.toFixed(1)}°</text>
          </g>
        );
      })}

      {heading !== null && cursor !== null && pending !== null && (() => {
        const p = gridToScreen(cursor, v);
        // The INTEGER rule, not `heading % 45 === 0`. A float comparison
        // happens to give the right answer for every case swept, but the
        // principle is that exactness is decided on integers, and a rule that
        // holds by luck is one a reader cannot check at a glance.
        const exact = isExactAngle(cursor.x - pending.x, cursor.y - pending.y, 1, 0);
        const tone = exact ? "var(--select)" : "var(--text-tertiary)";
        return (
          <g pointerEvents="none">
            <rect
              x={p.x + 14} y={p.y + 8} width={54} height={17} rx={3}
              fill="var(--bg-raised)" stroke={tone} strokeWidth={1} opacity={0.95}
            />
            <text
              x={p.x + 41} y={p.y + 20} textAnchor="middle"
              fontSize={11} fill={tone} style={{ fontVariantNumeric: "tabular-nums" }}
            >{heading.toFixed(1)}°</text>
          </g>
        );
      })()}
    </svg>
  );
}
