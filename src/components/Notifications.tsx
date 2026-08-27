"use client";

import { useEffect, useState } from "react";
import type { Notice } from "@/lib/canvas/messages";

const TONE: Record<Notice["tone"], string> = {
  good: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)",
};

/** How long a toast stays before falling into the backlog. */
const DWELL_MS = 6000;

/**
 * Sentinel used to seed `seen` below. It must be a reference no caller could
 * ever pass as `notices`, so that a batch already present on the very first
 * render is adopted rather than mistaken for one we've already seen — seeding
 * `seen` with `notices` itself would make the first render's guard a no-op
 * and silently drop that batch. See the review that caught this.
 */
const NONE: Notice[] = [];

export function Notifications({ notices }: { notices: Notice[] }) {
  const [visible, setVisible] = useState<Notice[]>([]);
  const [backlog, setBacklog] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  // Tracks the last `notices` reference we have reacted to, so a new batch
  // from the parent can be adopted into `visible` during render — the
  // React-sanctioned way to derive state from a prop change — rather than by
  // calling setState synchronously inside an effect body.
  const [seen, setSeen] = useState<Notice[]>(NONE);

  if (notices !== seen) {
    setSeen(notices);
    if (notices.length > 0) {
      // A new batch REPLACES visible, not discards it — archive whatever is
      // still on screen into the backlog first, the same place a manually
      // dismissed toast or one that dwelt out ends up.
      if (visible.length > 0) setBacklog((b) => [...visible, ...b]);
      setVisible(notices);
    }
  }

  useEffect(() => {
    if (visible.length === 0) return;
    const timer = setTimeout(() => {
      setVisible([]);
      setBacklog((b) => [...visible, ...b]);
    }, DWELL_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const dismiss = (n: Notice) => {
    setVisible((v) => v.filter((x) => x.id !== n.id));
    setBacklog((b) => [n, ...b]);
  };

  return (
    <>
      <div className="fixed bottom-4 right-4 flex flex-col gap-2 max-w-sm z-50" aria-live="polite">
        {visible.map((n) => (
          <button
            key={n.id} type="button" onClick={() => dismiss(n)}
            className="text-left text-sm p-3 rounded border bg-[var(--card)] shadow-lg"
            style={{ borderColor: TONE[n.tone] }}
          >{n.text}</button>
        ))}
      </div>

      {backlog.length > 0 && (
        <div className="mt-4">
          <button type="button" className="text-sm underline" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Show"} previous feedback ({backlog.length})
          </button>
          {open && (
            <ul className="mt-2 flex flex-col gap-1.5">
              {backlog.map((n, i) => (
                <li key={`${n.id}-${i}`} className="text-sm p-2 border-l-2 pl-3"
                  style={{ borderColor: TONE[n.tone] }}>{n.text}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
}
