/**
 * Undo/redo over whole-state snapshots.
 *
 * SNAPSHOTS, NOT DIFFS. A drawing is capped at 400 primitives, so a snapshot is
 * a few kilobytes and copying it is free — while a diff-based stack has to be
 * correct for every operation, including drag and retype. Correctness is worth
 * more than the memory here.
 *
 * PURE. Every function returns a new history and mutates nothing.
 */
export type History<T> = { past: T[]; present: T; future: T[] };

/** Bounded so a long session cannot grow the stack without limit. */
export const MAX_HISTORY = 50;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function push<T>(h: History<T>, next: T, maxDepth: number = MAX_HISTORY): History<T> {
  const past = [...h.past, h.present];
  // Drop from the FRONT: the oldest state is the one worth losing.
  return {
    past: past.length > maxDepth ? past.slice(past.length - maxDepth) : past,
    present: next,
    // A new edit invalidates the branch that was undone away.
    future: [],
  };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return {
    past: h.past.slice(0, -1),
    present: previous,
    future: [h.present, ...h.future],
  };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}

export const canUndo = <T>(h: History<T>): boolean => h.past.length > 0;
export const canRedo = <T>(h: History<T>): boolean => h.future.length > 0;
