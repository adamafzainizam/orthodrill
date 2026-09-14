"use client";

import { useEffect, useState } from "react";
import { PAPERS, PAPER_KEY, parsePaper, type Paper } from "@/lib/paper";

const LABEL: Record<Paper, string> = {
  white: "White",
  warm: "Warm",
  dark: "Dark",
};

const BLURB: Record<Paper, string> = {
  white: "Black ink on white paper, the way a drawing is printed.",
  warm: "A cream sheet. Easier on the eyes over a long session.",
  dark: "A dark sheet with light ink, for working at night.",
};

/**
 * Chooses the drawing paper and writes it to localStorage.
 *
 * The attribute is set on <html> directly rather than through React state,
 * because it is read by CSS, not by any component — and because the inline
 * script in layout.tsx has already set it before this ever mounts. This
 * component's job is to CHANGE it, not to own it.
 */
export function PaperPicker() {
  // Starts null rather than "white": the real value is only knowable on the
  // client, and rendering a definite selection before reading storage would
  // show the wrong radio as chosen for one frame.
  const [paper, setPaper] = useState<Paper | null>(null);

  useEffect(() => {
    // localStorage is an external system, so the read is deferred out of the
    // effect body — the same react-hooks/set-state-in-effect rule that shaped
    // UpdateRibbon.tsx (AGENTS.md §6).
    queueMicrotask(() => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(PAPER_KEY);
      } catch {
        stored = null; // storage blocked: show the default, still let them change it
      }
      setPaper(parsePaper(stored));
    });
  }, []);

  const choose = (next: Paper) => {
    setPaper(next);
    if (next === "white") document.documentElement.removeAttribute("data-paper");
    else document.documentElement.setAttribute("data-paper", next);
    try {
      localStorage.setItem(PAPER_KEY, next);
    } catch {
      // Storage blocked: the change still applies for this page view, it just
      // will not survive a reload. Better than refusing to change at all.
    }
  };

  return (
    <fieldset className="flex flex-col gap-2 border-0 p-0">
      <legend className="t-label mb-2">Drawing paper</legend>
      {PAPERS.map((p) => (
        <label
          key={p}
          className="pressable flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border px-4 py-3"
          style={{
            background: "var(--bg-raised)",
            borderColor: paper === p ? "var(--select)" : "var(--border-subtle)",
          }}
        >
          <input
            type="radio"
            name="paper"
            value={p}
            checked={paper === p}
            onChange={() => choose(p)}
            className="mt-1"
          />
          <span className="flex flex-col gap-0.5">
            <span className="t-body font-medium" style={{ color: "var(--text-primary)" }}>
              {LABEL[p]}
            </span>
            <span className="t-small">{BLURB[p]}</span>
          </span>
          {/* A swatch of the actual paper, drawn with that paper's own token
              so it cannot disagree with what choosing it produces. */}
          <span
            aria-hidden="true"
            data-paper={p === "white" ? undefined : p}
            className="ml-auto h-8 w-12 shrink-0 rounded-[var(--radius-sm)] border"
            style={{ background: "var(--paper)", borderColor: "var(--border-subtle)" }}
          />
        </label>
      ))}
    </fieldset>
  );
}
