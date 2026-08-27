"use client";

import { useEffect, useState } from "react";
import type { Notice } from "@/lib/canvas/messages";

const TONE: Record<Notice["tone"], string> = {
  good: "var(--ok)", warn: "var(--warn)", bad: "var(--bad)",
};

/** How long a toast stays before falling into the backlog. */
const DWELL_MS = 6000;

export function Notifications({ notices }: { notices: Notice[] }) {
  const [visible, setVisible] = useState<Notice[]>([]);
  const [backlog, setBacklog] = useState<Notice[]>([]);
  const [open, setOpen] = useState(false);
  // Tracks the last `notices` reference we have reacted to, so a new batch
  // from the parent can be adopted into `visible` during render — the
  // React-sanctioned way to derive state from a prop change — rather than by
  // calling setState synchronously inside an effect body.
  const [seen, setSeen] = useState(notices);

  if (notices !== seen) {
    setSeen(notices);
    if (notices.length > 0) setVisible(notices);
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
