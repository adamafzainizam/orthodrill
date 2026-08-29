/**
 * Every drawing operation, as one pure reducer.
 *
 * This exists so the React layer holds no logic worth testing: components
 * dispatch actions and render state, and everything that could be WRONG lives
 * here, under `node --test`, with no browser involved.
 *
 * PURE. No I/O, no DOM, no framework imports.
 */
import { radiusFrom, type Point } from "./coords.ts";
import {
  initHistory, push, redo as redoHistory, undo as undoHistory, type History,
} from "./history.ts";
import type { Primitive, PrimitiveType } from "../scoring/primitives.ts";
import { MAX_PRIMITIVES } from "../scoring/validate.ts";

export type Tool = "line" | "circle" | "select" | "move";

/** A rectangle or a move in progress: the drag's start point and its latest point. */
export type Drag = { start: Point; current: Point };

export type EditorState = {
  history: History<Primitive[]>;
  tool: Tool;
  activeType: PrimitiveType;
  /** Indices into the current drawing. */
  selection: number[];
  /** The first click of a two-click draw, if one is in progress. */
  pending: Point | null;
  /** A rubber-band or move drag in progress, if one is in progress. */
  drag: Drag | null;
};

export type Action =
  | { type: "SET_TOOL"; tool: Tool }
  | { type: "SET_ACTIVE_TYPE"; lineType: PrimitiveType }
  | { type: "CLICK_GRID"; at: Point; additive: boolean }
  | { type: "CANCEL" }
  | { type: "MOVE_SELECTION"; dx: number; dy: number }
  | { type: "RETYPE_SELECTION"; lineType: PrimitiveType }
  | { type: "DELETE_SELECTION" }
  | { type: "UNDO" }
  | { type: "REDO" }
  // A drag is one continuous gesture, named for the gesture rather than for
  // the mouse events that produce it: the component reports where it began,
  // where it currently is, and when it is released, and DRAG_COMMIT decides
  // what the drag MEANT (rubber-band select or move-by-delta) based on the
  // active tool at the moment it began. That keeps the reducer, not the
  // component, as the one place that interprets a gesture.
  | { type: "DRAG_BEGIN"; at: Point }
  | { type: "DRAG_UPDATE"; at: Point }
  | { type: "DRAG_COMMIT"; additive: boolean };

export function initEditor(): EditorState {
  return {
    history: initHistory<Primitive[]>([]),
    tool: "select",
    activeType: "visible",
    selection: [],
    pending: null,
    drag: null,
  };
}

export const drawing = (s: EditorState): Primitive[] => s.history.present;

/** Distance within which a click counts as hitting a primitive. */
const HIT_RADIUS = 0.6;

function distanceToSegment(p: Point, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(p.x - x1, p.y - y1);
  let t = ((p.x - x1) * dx + (p.y - y1) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (x1 + t * dx), p.y - (y1 + t * dy));
}

/** Index of the primitive under a point, or -1. Nearest wins, not first. */
function hitTest(ps: Primitive[], at: Point): number {
  let best = -1;
  let bestDistance = HIT_RADIUS;
  ps.forEach((p, i) => {
    const d = p.kind === "segment"
      ? distanceToSegment(at, p.x1, p.y1, p.x2, p.y2)
      : Math.abs(Math.hypot(at.x - p.cx, at.y - p.cy) - p.r);
    if (d <= bestDistance) { bestDistance = d; best = i; }
  });
  return best;
}

type Rect = { minX: number; minY: number; maxX: number; maxY: number };

function rectFrom(a: Point, b: Point): Rect {
  return {
    minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
    minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
  };
}

const within = (x: number, y: number, r: Rect): boolean =>
  x >= r.minX && x <= r.maxX && y >= r.minY && y <= r.maxY;

/**
 * PIN: a rubber-band rectangle selects a primitive only if it is WHOLLY
 * enclosed — every endpoint of a segment, or a circle's full extent (centre
 * plus radius in every direction), inside the rectangle. A primitive only
 * partly inside is NOT selected. This is the conventional choice (most
 * drawing tools rubber-band this way) and is simpler to reason about and
 * test than an intersection rule, which would have to special-case
 * tangencies and crossings. Deliberate and pinned by test, not incidental.
 */
function isWhollyEnclosed(p: Primitive, r: Rect): boolean {
  if (p.kind === "segment") return within(p.x1, p.y1, r) && within(p.x2, p.y2, r);
  return p.cx - p.r >= r.minX && p.cx + p.r <= r.maxX
    && p.cy - p.r >= r.minY && p.cy + p.r <= r.maxY;
}

function indicesEnclosedBy(ps: Primitive[], r: Rect): number[] {
  const out: number[] = [];
  ps.forEach((p, i) => { if (isWhollyEnclosed(p, r)) out.push(i); });
  return out;
}

function commit(s: EditorState, next: Primitive[]): EditorState {
  return { ...s, history: push(s.history, next) };
}

function mapSelected(s: EditorState, f: (p: Primitive) => Primitive): Primitive[] {
  const chosen = new Set(s.selection);
  return drawing(s).map((p, i) => (chosen.has(i) ? f(p) : p));
}

function shift(p: Primitive, dx: number, dy: number): Primitive {
  return p.kind === "segment"
    ? { ...p, x1: p.x1 + dx, y1: p.y1 + dy, x2: p.x2 + dx, y2: p.y2 + dy }
    : { ...p, cx: p.cx + dx, cy: p.cy + dy };
}

/**
 * The primitive a second click would commit, or null if it would commit
 * nothing.
 *
 * THE POINT OF THIS FUNCTION IS THAT IT HAS TWO CALLERS. `clickWhileDrawing`
 * commits its result and `Sheet` previews it, so the preview cannot drift from
 * what lands — `radiusFrom` rounds AND clamps to [1, MAX_RADIUS], so a preview
 * computed independently would lie at both ends of that range.
 */
export function pendingPrimitive(
  tool: Tool, type: PrimitiveType, from: Point, to: Point,
): Primitive | null {
  if (tool === "line") {
    // A zero-length segment is not a line; validate.ts refuses it.
    if (from.x === to.x && from.y === to.y) return null;
    return { kind: "segment", type, x1: from.x, y1: from.y, x2: to.x, y2: to.y };
  }
  if (tool === "circle") {
    return { kind: "circle", type, cx: from.x, cy: from.y, r: radiusFrom(from, to) };
  }
  return null;
}

function clickWhileDrawing(s: EditorState, at: Point): EditorState {
  const from = s.pending;
  if (from === null) return { ...s, pending: at };

  // validate.ts rejects a whole attempt over MAX_PRIMITIVES (400); the UI must
  // not be able to produce what the server would refuse. Refuse the append
  // and drop the pending anchor rather than leaving a dangling first click.
  if (drawing(s).length >= MAX_PRIMITIVES) return { ...s, pending: null };

  const primitive = pendingPrimitive(s.tool, s.activeType, from, at);
  // null means the click commits nothing (a zero-length line, or a tool that
  // does not draw); drop the anchor rather than leaving it dangling.
  if (primitive === null) return { ...s, pending: null };
  return { ...commit(s, [...drawing(s), primitive]), pending: null };
}

/**
 * Resolve a finished drag according to the tool active while it happened.
 * Select mode rubber-bands (replacing the selection, or adding to it when
 * additive); move mode shifts the current selection by the drag's whole-unit
 * delta, committed as ONE history entry regardless of how many DRAG_UPDATEs
 * arrived along the way — the intermediate points never touch `history`, so
 * one UNDO always restores the pre-drag drawing.
 */
function commitDrag(s: EditorState, drag: Drag, additive: boolean): EditorState {
  const cleared: EditorState = { ...s, drag: null };

  if (s.tool === "select") {
    const rect = rectFrom(drag.start, drag.current);
    const enclosed = indicesEnclosedBy(drawing(s), rect);
    if (enclosed.length === 0) return additive ? cleared : { ...cleared, selection: [] };
    return {
      ...cleared,
      selection: additive ? Array.from(new Set([...s.selection, ...enclosed])) : enclosed,
    };
  }

  if (s.tool === "move") {
    // Both points come from screenToGrid, which always snaps to whole grid
    // units, so this difference is already a whole-unit delta — nothing
    // further to round here.
    const dx = drag.current.x - drag.start.x;
    const dy = drag.current.y - drag.start.y;
    if (s.selection.length === 0 || (dx === 0 && dy === 0)) return cleared;
    return { ...commit(s, mapSelected(s, (p) => shift(p, dx, dy))), drag: null };
  }

  return cleared;
}

function clickWhileSelecting(s: EditorState, at: Point, additive: boolean): EditorState {
  const hit = hitTest(drawing(s), at);
  if (hit === -1) return { ...s, selection: [] };
  if (!additive) return { ...s, selection: [hit] };
  return {
    ...s,
    selection: s.selection.includes(hit)
      ? s.selection.filter((i) => i !== hit)
      : [...s.selection, hit],
  };
}

export function reduce(s: EditorState, action: Action): EditorState {
  switch (action.type) {
    case "SET_TOOL":
      // Changing tools abandons a half-drawn primitive AND an in-progress
      // drag, rather than leaving stale state that would attach itself to
      // the next gesture under a different tool.
      return { ...s, tool: action.tool, pending: null, drag: null };

    case "SET_ACTIVE_TYPE":
      return { ...s, activeType: action.lineType };

    case "CLICK_GRID":
      if (s.tool === "select") return clickWhileSelecting(s, action.at, action.additive);
      if (s.tool === "move") return s; // Move has no click behaviour, only drag.
      return clickWhileDrawing(s, action.at);

    case "CANCEL":
      return { ...s, pending: null, drag: null };

    case "DRAG_BEGIN":
      // Only Select and Move interpret a drag; a stray begin under the
      // drawing tools is a no-op rather than stale state waiting to fire.
      if (s.tool !== "select" && s.tool !== "move") return s;
      return { ...s, drag: { start: action.at, current: action.at } };

    case "DRAG_UPDATE":
      if (s.drag === null) return s;
      return { ...s, drag: { ...s.drag, current: action.at } };

    case "DRAG_COMMIT":
      if (s.drag === null) return s;
      return commitDrag(s, s.drag, action.additive);

    case "MOVE_SELECTION":
      if (s.selection.length === 0) return s;
      return commit(s, mapSelected(s, (p) => shift(p, action.dx, action.dy)));

    case "RETYPE_SELECTION":
      if (s.selection.length === 0) return s;
      return commit(s, mapSelected(s, (p) => ({ ...p, type: action.lineType })));

    case "DELETE_SELECTION": {
      if (s.selection.length === 0) return s;
      const doomed = new Set(s.selection);
      return {
        ...commit(s, drawing(s).filter((_, i) => !doomed.has(i))),
        selection: [],
      };
    }

    case "UNDO":
      // Indices refer to a drawing that is about to change underneath them.
      return { ...s, history: undoHistory(s.history), selection: [], pending: null, drag: null };

    case "REDO":
      return { ...s, history: redoHistory(s.history), selection: [], pending: null, drag: null };
  }
}
