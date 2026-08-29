"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { Sheet, type FeedbackOverlay } from "./Sheet";
import { Toolbar } from "./Toolbar";
import { Notifications } from "./Notifications";
import { drawing, initEditor, reduce, type Action } from "@/lib/canvas/editor";
import { canRedo, canUndo } from "@/lib/canvas/history";
import { noticesFor, type Notice } from "@/lib/canvas/messages";
import { submitAttempt } from "@/lib/canvas/submit";
import type { Point } from "@/lib/canvas/coords";

// Hand-duplicated from registry.ts's PublicDrill, not imported — importing it
// would trip isolation.test.ts even though PublicDrill itself is safe,
// because the same module also exports the key-bearing Drill/ViewsDrill/
// FigureDrill types. Nothing links the two shapes but structural
// assignability at the one call site that hands a real PublicDrill to
// <Editor>. `mode` is the discriminant both here and there: a "views"
// exercise carries a convention to place views by, a "figure" exercise
// carries none — there is nothing to place relative to anything else.
//
// `isometric`/`dimensions` are deliberately NOT duplicated here even though
// registry.ts's actual "views" branch carries them — Editor no longer
// renders the pictorial (page.tsx does, directly from its own `pub`, which
// stays fully typed), so this component has no use for those fields. TS
// still allows page.tsx's real PublicDrill through: assigning a value to a
// narrower-but-compatible type is fine, only fresh object literals get the
// excess-property check.
export type PublicDrill =
  | {
      id: string;
      title: string;
      prompt: string;
      mode: "views";
      convention: "first_angle" | "third_angle";
      grid: { width: number; height: number };
    }
  | {
      id: string;
      title: string;
      prompt: string;
      mode: "figure";
      grid: { width: number; height: number };
    };

export function Editor({ drill }: { drill: PublicDrill }) {
  const [state, dispatch] = useReducer(reduce, undefined, initEditor);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [feedback, setFeedback] = useState<FeedbackOverlay | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // The toolbar has real form controls. Without this, Backspace with the
      // line-type select focused silently deletes part of the drawing.
      const target = e.target as HTMLElement | null;
      if (target !== null) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || target.isContentEditable) {
          return;
        }
      }
      if (e.key === "Escape") dispatch({ type: "CANCEL" });
      else if (e.key === "Delete" || e.key === "Backspace") dispatch({ type: "DELETE_SELECTION" });
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        e.preventDefault();
        dispatch({ type: "COPY_SELECTION" });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        dispatch({ type: "PASTE" });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        dispatch({ type: e.shiftKey ? "REDO" : "UNDO" });
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        dispatch({ type: "REDO" });
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "ArrowUp" || e.key === "ArrowDown") {
        // Placement is one of the two things the scorer marks, and until now
        // there was no way to nudge a mis-placed view without deleting and
        // redrawing it. Only claim the key (and stop the page scrolling)
        // when there is a selection to move; otherwise let arrow keys behave
        // normally.
        if (state.selection.length === 0) return;
        e.preventDefault();
        const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
        const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
        dispatch({ type: "MOVE_SELECTION", dx, dy });
      } else if (!e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        // Single-key tool shortcuts. Deliberately excluded from firing under
        // any modifier — "no modifier" per the plan. Ctrl+C and Ctrl+V are now
        // CLAIMED above for copy and paste; this branch never sees them
        // because it requires no modifier held. The form-control guard above
        // already stops these from firing while the line-type <select> or any
        // other control has focus.
        const tool = e.key === "s" ? "select" : e.key === "l" ? "line"
          : e.key === "c" ? "circle" : e.key === "g" ? "move" : null;
        if (tool !== null) dispatch({ type: "SET_TOOL", tool });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.selection]);

  // An edit invalidates the last overlay — its anchors describe a drawing
  // that no longer exists. `state.history.present` is a new reference on
  // every commit (draw, move, retype, delete) and on undo/redo, and on
  // NOTHING else — submitting a check does not touch the drawing, so this
  // does not race the feedback a submit is about to set. Confirmed by
  // reading `onSubmit` below: it never assigns `state.history`, so the
  // reference `seenDrawing` is compared against is unchanged across a
  // submit, and this does not clobber the result `setFeedback` sets
  // afterwards. Adjusted during render rather than in an effect — the same
  // pattern as `Notifications`' `seen` sentinel — so the clear lands in the
  // same commit as the edit instead of one render later.
  const [seenDrawing, setSeenDrawing] = useState(state.history.present);
  if (state.history.present !== seenDrawing) {
    setSeenDrawing(state.history.present);
    setFeedback(null);
  }

  const onAction = useCallback((a: Action) => dispatch(a), []);

  const onSubmit = useCallback(async () => {
    setSubmitting(true);
    // Clears any overlay left over from a previous check. This is a separate
    // concern from the edit-driven clear above (which handles the drawing
    // changing) — this one avoids a stale overlay flashing on screen while a
    // repeat submit of the SAME drawing is in flight.
    setFeedback(null);
    const result = await submitAttempt(drill.id, drill.mode, drawing(state));
    setSubmitting(false);

    if ("views" in result && result.ok) {
      setFeedback({ views: [result.views.front, result.views.top, result.views.side] });
      setNotices(noticesFor(result));
      return;
    }
    // FigureScoreResult has no `ok: false` branch — compareView has nothing
    // structurally equivalent to a wrong view count to fail on — so `"diff"
    // in result` alone is enough to know this is a figure success, unlike
    // the views case above which also has to check `result.ok`.
    if ("diff" in result) {
      setFeedback({ views: [result.diff] });
      setNotices(noticesFor(result));
      return;
    }
    if ("found" in result) { setNotices(noticesFor(result)); return; }
    setNotices([{
      id: "transport", tone: "warn",
      text: (result as { reason: string }).reason === "RATE_LIMITED"
        ? "You are checking very quickly — wait a moment and try again."
        : "Could not reach the marker. Check your connection and try again.",
    }]);
  }, [drill.id, drill.mode, state]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="t-display">{drill.title}</h1>
        <p className="t-body mt-1.5 max-w-[62ch]" style={{ color: "var(--text-secondary)" }}>{drill.prompt}</p>
        {drill.mode === "views" && (
          /* The convention governs where every view goes, so it is a
             standing fact about this exercise rather than a footnote. */
          <p className="t-label mt-2.5">
            {drill.convention === "first_angle" ? "First angle" : "Third angle"} projection
          </p>
        )}
      </header>

      {/* The pictorial (views mode) or method diagram (figure mode) used to
          sit here, beside the sheet, which is why this was ever a row. Both
          now render in page.tsx's right-hand column instead — reference
          material belongs beside the hints, not competing with the drawing
          surface for the page's width. This is the drawing surface's own
          column; nothing else shares it. */}
      <div className="flex flex-col gap-2">
        <Toolbar
          tool={state.tool}
          activeType={state.activeType}
          canUndo={canUndo(state.history)}
          canRedo={canRedo(state.history)}
          hasSelection={state.selection.length > 0}
          submitting={submitting}
          onAction={onAction}
          onSubmit={onSubmit}
        />
        <div className="overflow-x-auto">
          <Sheet
            grid={drill.grid}
            mode={drill.mode}
            tool={state.tool}
            activeType={state.activeType}
            drawing={drawing(state)}
            selection={state.selection}
            pending={state.pending}
            drag={state.drag}
            cursor={cursor}
            feedback={feedback}
            onAction={onAction}
            onGridMove={setCursor}
          />
        </div>
      </div>

      <Notifications notices={notices} />
    </div>
  );
}
