/**
 * The Type B builder's state: which cells the student has left, and where they
 * are standing.
 *
 * THE STUDENT CARVES FROM THE FULL BASE BLOCK (reverse-drill spec §4.1). It
 * matches how the generator models a part — a block minus ordered subtractions
 * — and how the part would be machined. Adding is available to recover from an
 * over-cut, and is CONFINED TO THE BASE BLOCK: the exercise is to remove
 * material, not to build outward, and confining it also keeps every submission
 * inside `validateCells`' bounds by construction rather than by hoping.
 *
 * A PICK FACE'S CELL IS IN ROTATED COORDINATES. The pick list is computed on
 * `rotatedOccupancy(occ, q)`, so at any viewpoint but q=0 a face's `cell` is
 * NOT the cell the student's build holds. Every action therefore sends it home
 * through `unrotateCell` before touching state. Acting on `face.cell` directly
 * is the bug this docblock exists to prevent: it works perfectly at q=0 and
 * deletes the wrong block at every other viewpoint.
 *
 * THE VIEWPOINT IS NOT AN EDIT and is deliberately outside the history. Undo
 * should take back what a student built, not where they were standing.
 *
 * PURE. No I/O.
 */
import { initHistory, push, redo, undo, type History } from "./history.ts";
import { FACE_NORMAL, type PickFace } from "../geometry/isopick.ts";
import { cellKey } from "../geometry/cells.ts";
import { unrotateCell, type Cell, type QuarterTurn } from "../geometry/rotate3.ts";

export type Base = { w: number; d: number; h: number };

export type BuilderState = {
  history: History<Cell[]>;
  q: QuarterTurn;
  base: Base;
};

export type BuilderAction =
  | { kind: "add"; face: PickFace }
  | { kind: "remove"; face: PickFace }
  | { kind: "rotate"; delta: 1 | -1 }
  | { kind: "undo" }
  | { kind: "redo" }
  | { kind: "reset" };

/** Every cell of the full block, the shape a student starts from. */
export function baseCells(base: Base): Cell[] {
  const out: Cell[] = [];
  for (let z = 0; z < base.h; z++)
    for (let y = 0; y < base.d; y++)
      for (let x = 0; x < base.w; x++) out.push([x, y, z]);
  return out;
}

export function initBuilder(base: Base): BuilderState {
  return { history: initHistory(baseCells(base)), q: 0, base };
}

export const builderCells = (s: BuilderState): Cell[] => s.history.present;

const inBase = (c: Cell, b: Base) =>
  c[0] >= 0 && c[1] >= 0 && c[2] >= 0 && c[0] < b.w && c[1] < b.d && c[2] < b.h;

/** The face's owning cell, brought back into the student's own coordinates. */
function owningCell(face: PickFace, s: BuilderState): Cell {
  return unrotateCell(face.cell, s.q, s.base.w, s.base.d);
}

/** The cell a block added against this face would occupy, likewise unrotated. */
function targetCell(face: PickFace, s: BuilderState): Cell {
  const n = FACE_NORMAL[face.dir];
  const inRotated: Cell = [face.cell[0] + n[0], face.cell[1] + n[1], face.cell[2] + n[2]];
  return unrotateCell(inRotated, s.q, s.base.w, s.base.d);
}

export function reduceBuilder(s: BuilderState, a: BuilderAction): BuilderState {
  switch (a.kind) {
    case "add": {
      const c = targetCell(a.face, s);
      if (!inBase(c, s.base)) return s;
      const cells = builderCells(s);
      if (cells.some((o) => cellKey(o) === cellKey(c))) return s;
      return { ...s, history: push(s.history, [...cells, c]) };
    }
    case "remove": {
      const c = owningCell(a.face, s);
      const cells = builderCells(s);
      const next = cells.filter((o) => cellKey(o) !== cellKey(c));
      if (next.length === cells.length) return s;
      return { ...s, history: push(s.history, next) };
    }
    case "rotate":
      return { ...s, q: (((s.q + a.delta) % 4) + 4) % 4 as QuarterTurn };
    case "undo":
      return { ...s, history: undo(s.history) };
    case "redo":
      return { ...s, history: redo(s.history) };
    case "reset":
      return { ...s, history: push(s.history, baseCells(s.base)) };
  }
}
