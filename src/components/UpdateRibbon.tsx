"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isFresh } from "@/lib/ribbon";

const RIBBON_KEY = "draftdrill:ribbon-dismissed";
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDate(iso: string): string {
  const [, month, day] = iso.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]}`;
}

/**
 * The "N new exercises" banner (AGENTS.md §2.10). Rendered explicitly by
 * each page that wants it — never baked into AppHeader — so a future header
 * refactor cannot accidentally carry it onto a drill page. See design spec §5.
 */
export function UpdateRibbon({ date, count }: { date: string; count: number }) {
  // Hidden until the effect below confirms the batch is fresh AND
  // undismissed, so SSR output and first client paint agree on "nothing" —
  // no flash-then-hide.
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isFresh(date, new Date())) return;
    // localStorage is an external system (per the lint rule this satisfies),
    // so the read-and-decide happens in a deferred callback rather than as
    // the effect body's own last statement.
    queueMicrotask(() => {
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(RIBBON_KEY) === date;
      } catch {
        dismissed = false; // storage blocked or unavailable: show it, never crash
      }
      setShow(!dismissed);
    });
  }, [date]);

  if (!show) return null;

  return (
    <div
      className="flex items-center justify-between gap-3 border-b px-6 py-2"
      style={{ background: "var(--bg-raised)", borderColor: "var(--border-subtle)" }}
    >
      {/* Always /updates: the destination is no longer per-batch data, it is
          a constant this component owns. */}
      <Link href="/updates" className="t-small no-underline hover:underline" style={{ color: "var(--text-primary)" }}>
        {count} new exercise{count === 1 ? "" : "s"} added {formatDate(date)}
      </Link>
      <button
        type="button"
        aria-label="Dismiss"
        className="pressable t-small rounded-[var(--radius-sm)] px-2 py-0.5"
        style={{ color: "var(--text-tertiary)" }}
        onClick={() => {
          try {
            localStorage.setItem(RIBBON_KEY, date);
          } catch {
            // storage blocked: dismissal just won't persist, which is fine
          }
          setShow(false);
        }}
      >
        ×
      </button>
    </div>
  );
}
