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

export type Tool = "line" | "circle" | "select";

export type EditorState = {
  history: History<Primitive[]>;
  tool: Tool;
  activeType: PrimitiveType;
  /** Indices into the current drawing. */
  selection: number[];
  /** The first click of a two-click draw, if one is in progress. */
  pending: Point | null;
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
  | { type: "REDO" };

export function initEditor(): EditorState {
  return {
    history: initHistory<Primitive[]>([]),
    tool: "select",
    activeType: "visible",
    selection: [],
    pending: null,
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

function clickWhileDrawing(s: EditorState, at: Point): EditorState {
  const from = s.pending;
  if (from === null) return { ...s, pending: at };

  // validate.ts rejects a whole attempt over MAX_PRIMITIVES (400); the UI must
  // not be able to produce what the server would refuse. Refuse the append
  // and drop the pending anchor rather than leaving a dangling first click.
  if (drawing(s).length >= MAX_PRIMITIVES) return { ...s, pending: null };

  if (s.tool === "line") {
    // A zero-length segment is not a line; validate.ts refuses it, so it must
    // never become drawable here either.
    if (from.x === at.x && from.y === at.y) return { ...s, pending: null };
    const segment: Primitive = {
      kind: "segment", type: s.activeType,
      x1: from.x, y1: from.y, x2: at.x, y2: at.y,
    };
    return { ...commit(s, [...drawing(s), segment]), pending: null };
  }

  const circle: Primitive = {
    kind: "circle", type: s.activeType,
    cx: from.x, cy: from.y, r: radiusFrom(from, at),
  };
  return { ...commit(s, [...drawing(s), circle]), pending: null };
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
      // Changing tools abandons a half-drawn primitive rather than leaving an
      // anchor that would attach itself to the next click of a different tool.
      return { ...s, tool: action.tool, pending: null };

    case "SET_ACTIVE_TYPE":
      return { ...s, activeType: action.lineType };

    case "CLICK_GRID":
      return s.tool === "select"
        ? clickWhileSelecting(s, action.at, action.additive)
        : clickWhileDrawing(s, action.at);

    case "CANCEL":
      return { ...s, pending: null };

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
      return { ...s, history: undoHistory(s.history), selection: [], pending: null };

    case "REDO":
      return { ...s, history: redoHistory(s.history), selection: [], pending: null };
  }
}
