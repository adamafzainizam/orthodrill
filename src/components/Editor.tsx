"use client";

import { useCallback, useEffect, useReducer, useState } from "react";
import { Sheet, type FeedbackOverlay } from "./Sheet";
import { Toolbar } from "./Toolbar";
import { Notifications } from "./Notifications";
import { Pictorial } from "./Pictorial";
import { drawing, initEditor, reduce, type Action } from "@/lib/canvas/editor";
import { canRedo, canUndo } from "@/lib/canvas/history";
import { noticesFor, type Notice } from "@/lib/canvas/messages";
import { submitAttempt } from "@/lib/canvas/submit";
import type { Point } from "@/lib/canvas/coords";
import type { IsoPrimitive } from "@/lib/geometry/isotypes";

export type PublicDrill = {
  id: string;
  title: string;
  prompt: string;
  convention: "first_angle" | "third_angle";
  grid: { width: number; height: number };
  isometric: readonly IsoPrimitive[];
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
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
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
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.selection]);

  const onAction = useCallback((a: Action) => dispatch(a), []);

  const onSubmit = useCallback(async () => {
    setSubmitting(true);
    // Any edit invalidates the last overlay; clear before asking again.
    setFeedback(null);
    const result = await submitAttempt(drill.id, drawing(state));
    setSubmitting(false);

    if ("views" in result && result.ok) {
      setFeedback({ views: [result.views.front, result.views.top, result.views.side] });
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
  }, [drill.id, state]);

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{drill.title}</h1>
        <p className="max-w-[65ch] mt-1">{drill.prompt}</p>
        <p className="text-sm mt-1 opacity-70">
          Convention: {drill.convention === "first_angle" ? "first angle" : "third angle"}
        </p>
      </header>

      <div className="flex flex-wrap gap-6 items-start">
        <figure className="m-0">
          <figcaption className="text-xs uppercase tracking-wider opacity-70 mb-1">The part</figcaption>
          <Pictorial primitives={drill.isometric} />
        </figure>

        <div className="flex flex-col gap-2 flex-1 min-w-[320px]">
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
              drawing={drawing(state)}
              selection={state.selection}
              pending={state.pending}
              cursor={cursor}
              feedback={feedback}
              onGridClick={(p, additive) => dispatch({ type: "CLICK_GRID", at: p, additive })}
              onGridMove={setCursor}
            />
          </div>
        </div>
      </div>

      <Notifications notices={notices} />
    </div>
  );
}
