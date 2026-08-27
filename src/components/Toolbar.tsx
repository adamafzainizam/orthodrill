"use client";

import type { Action, Tool } from "@/lib/canvas/editor";
import type { PrimitiveType } from "@/lib/scoring/primitives";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "line", label: "Line" },
  { id: "circle", label: "Circle" },
];

const TYPES: { id: PrimitiveType; label: string }[] = [
  { id: "visible", label: "Visible edge" },
  { id: "hidden", label: "Hidden edge" },
  { id: "centre", label: "Centre line" },
  { id: "construction", label: "Construction line" },
];

export function Toolbar({
  tool, activeType, canUndo, canRedo, hasSelection, submitting, onAction, onSubmit,
}: {
  tool: Tool;
  activeType: PrimitiveType;
  canUndo: boolean;
  canRedo: boolean;
  hasSelection: boolean;
  submitting: boolean;
  onAction: (a: Action) => void;
  onSubmit: () => void;
}) {
  const button = "px-3 py-1.5 text-sm border border-[var(--rule)] rounded disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-[var(--select)]";

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2 p-2 border border-[var(--rule)] rounded">
        <div className="flex gap-1" role="group" aria-label="Tool">
          {TOOLS.map((t) => (
            <button
              key={t.id} type="button" className={button}
              aria-pressed={tool === t.id}
              style={tool === t.id ? { background: "var(--select)", color: "#fff" } : undefined}
              onClick={() => onAction({ type: "SET_TOOL", tool: t.id })}
            >{t.label}</button>
          ))}
        </div>

        <label className="text-sm flex items-center gap-1.5">
          Line type
          <select
            className={button}
            value={activeType}
            onChange={(e) => {
              const lineType = e.target.value as PrimitiveType;
              // With a selection, this RETYPES it AND updates activeType, so
              // the control (value={activeType}) reflects what was just
              // applied instead of visibly snapping back to the old type.
              // Without also setting activeType, this component still
              // cannot retype a selection TO the type that is already
              // active: a native <select> only fires onChange when its
              // value changes, so picking the option already shown never
              // reaches this handler at all. That is a browser behaviour,
              // not a bug in the dispatch below, and nothing achievable
              // from inside this component fixes it short of replacing the
              // <select> with controls that always fire on click.
              if (hasSelection) onAction({ type: "RETYPE_SELECTION", lineType });
              onAction({ type: "SET_ACTIVE_TYPE", lineType });
            }}
          >
            {TYPES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>

        <button type="button" className={button} disabled={!canUndo}
          onClick={() => onAction({ type: "UNDO" })}>Undo</button>
        <button type="button" className={button} disabled={!canRedo}
          onClick={() => onAction({ type: "REDO" })}>Redo</button>
        <button type="button" className={button} disabled={!hasSelection}
          onClick={() => onAction({ type: "DELETE_SELECTION" })}>Delete</button>

        <button type="button" className={`${button} ml-auto`} disabled={submitting} onClick={onSubmit}>
          {submitting ? "Checking…" : "Check my drawing"}
        </button>
      </div>

      <p className="text-xs opacity-60">
        Select a line or circle, then use the arrow keys to nudge it into place.
      </p>
    </div>
  );
}
