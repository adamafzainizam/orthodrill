"use client";

import { useState } from "react";
import { Backlight } from "./Backlight";
import { quarterTurnsFor } from "@/lib/canvas/transform";
import type { Action, Tool } from "@/lib/canvas/editor";
import type { PrimitiveType } from "@/lib/scoring/primitives";

const TOOLS: { id: Tool; label: string; key: string }[] = [
  { id: "select", label: "Select", key: "s" },
  { id: "line", label: "Line", key: "l" },
  { id: "circle", label: "Circle", key: "c" },
  { id: "move", label: "Move", key: "g" },
  { id: "rotate", label: "Rotate", key: "r" },
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
  /*
   * THREE KINDS OF CONTROL, THREE TREATMENTS. Choosing a tool sets a MODE and
   * reads as a segmented control — exactly one lit at a time. Undo, redo and
   * delete are ACTIONS and stay quiet. Checking the drawing is the COMMIT and
   * is the only filled button on the bar. They used to be one row of
   * identical grey boxes, which told the reader nothing about which was which.
   */
  const [angleError, setAngleError] = useState(false);

  const action =
    "pressable t-small px-2.5 py-1.5 rounded-[var(--radius-sm)] border disabled:opacity-35 disabled:cursor-not-allowed";
  const actionStyle = { background: "var(--bg-raised)", borderColor: "var(--border-subtle)", color: "var(--text-secondary)" };

  return (
    <Backlight
      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[var(--radius-lg)] border p-2"
      style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)", boxShadow: "var(--shadow-sm)" }}
    >
        <div
          className="flex gap-0.5 rounded-[var(--radius-md)] p-0.5"
          role="group" aria-label="Tool"
          style={{ background: "var(--bg-active)" }}
        >
          {TOOLS.map((t) => (
            <button
              key={t.id} type="button"
              data-backlit
              className="pressable t-small px-3 py-1.5 rounded-[var(--radius-sm)] font-medium"
              aria-pressed={tool === t.id}
              title={`${t.label} (${t.key.toUpperCase()})`}
              aria-keyshortcuts={t.key}
              style={tool === t.id
                ? { background: "var(--select)", color: "#fff", boxShadow: "var(--shadow-xs)" }
                : { background: "transparent", color: "var(--text-secondary)" }}
              onClick={() => onAction({ type: "SET_TOOL", tool: t.id })}
            >{t.label}</button>
          ))}
        </div>

        {/* The typed-angle field exists only while Rotate is active, so the
            bar does not carry a control that means nothing under the other
            tools. The form-control guard in Editor's key handler already
            stops the single-key tool shortcuts firing while this has focus,
            so typing "9" cannot switch tools out from under the field. */}
        {tool === "rotate" && (
          <form
            className="flex items-center gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              const raw = new FormData(e.currentTarget).get("deg");
              const turns = quarterTurnsFor(Number(raw));
              if (turns === null) { setAngleError(true); return; }
              setAngleError(false);
              onAction({ type: "ROTATE_SELECTION", quarterTurns: turns });
            }}
          >
            <input
              name="deg" type="text" inputMode="numeric" defaultValue="90"
              aria-label="Rotate by degrees"
              className="t-small w-16 rounded-[var(--radius-sm)] border px-2 py-1"
              style={{
                background: "var(--bg-raised)",
                borderColor: angleError ? "var(--bad)" : "var(--border-subtle)",
                color: "var(--text-primary)",
              }}
              onChange={() => setAngleError(false)}
            />
            <button type="submit" className={action} style={actionStyle}>Turn</button>
            {angleError && (
              <span className="t-small" style={{ color: "var(--bad)" }}>
                multiples of 90 only — this grid has no other exact rotation
              </span>
            )}
          </form>
        )}

        <div className="flex gap-0.5" role="group" aria-label="Mirror">
          <button
            type="button" data-backlit className={action} style={actionStyle}
            disabled={!hasSelection} title="Flip horizontally (Shift+H)"
            aria-keyshortcuts="Shift+H"
            onClick={() => onAction({ type: "MIRROR_SELECTION", axis: "h" })}
          >Flip H</button>
          <button
            type="button" data-backlit className={action} style={actionStyle}
            disabled={!hasSelection} title="Flip vertically (Shift+V)"
            aria-keyshortcuts="Shift+V"
            onClick={() => onAction({ type: "MIRROR_SELECTION", axis: "v" })}
          >Flip V</button>
        </div>

        <label className="t-small flex items-center gap-2" style={{ color: "var(--text-tertiary)" }}>
          Line
          <select
            className="pressable t-small px-2 py-1.5 rounded-[var(--radius-sm)] border"
            style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" }}
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

        <div aria-hidden="true" className="h-5 w-px" style={{ background: "var(--border-subtle)" }} />

        <div className="flex gap-1">
          <button type="button" data-backlit className={action} style={actionStyle} disabled={!canUndo}
            title="Undo (Ctrl+Z)" aria-keyshortcuts="Control+Z"
            onClick={() => onAction({ type: "UNDO" })}>Undo</button>
          <button type="button" data-backlit className={action} style={actionStyle} disabled={!canRedo}
            title="Redo (Ctrl+Y)" aria-keyshortcuts="Control+Y"
            onClick={() => onAction({ type: "REDO" })}>Redo</button>
          <button type="button" data-backlit className={action} style={actionStyle} disabled={!hasSelection}
            title="Delete selection (Del)" aria-keyshortcuts="Delete"
            onClick={() => onAction({ type: "DELETE_SELECTION" })}>Delete</button>
        </div>

        {/* Drag and arrow-key nudging are the two things a newcomer will not
            guess, and they are not on any control to carry a title. One short
            line, not the paragraph this used to be. */}
        <p className="t-small hidden xl:block" style={{ color: "var(--text-tertiary)" }}>
          Drag to select · arrows nudge
        </p>

        <button
          type="button"
          data-backlit
          className="pressable t-small ml-auto px-4 py-1.5 rounded-[var(--radius-sm)] font-semibold disabled:opacity-50"
          style={{ background: "var(--select)", color: "#fff", boxShadow: "var(--shadow-xs)" }}
          disabled={submitting}
          onClick={onSubmit}
        >
          {submitting ? "Checking…" : "Check my drawing"}
        </button>
    </Backlight>
  );
}
