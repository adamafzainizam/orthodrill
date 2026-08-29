import Link from "next/link";

/**
 * The one piece of chrome present on every page.
 *
 * It exists to answer the questions every screen owes its reader: where am I,
 * where can I go, and how do I get out. Before this, an exercise page had no
 * exit at all — the browser's back button was the only way back to the topic.
 *
 * A translucent layer rather than an opaque strip, so content scrolls beneath
 * it instead of the header permanently eating a band of the screen. It is
 * deliberately quiet: on a drawing tool the sheet is the subject, and chrome
 * that competes with it is chrome that is wrong.
 */
export type Crumb = { label: string; href?: string };

export function AppHeader({ trail = [] }: { trail?: Crumb[] }) {
  return (
    <header
      className="chrome-layer sticky top-0 z-40 border-b"
      style={{
        background: "var(--bg-chrome)",
        borderColor: "var(--border-subtle)",
        backdropFilter: "blur(20px) saturate(180%)",
      }}
    >
      <nav
        aria-label="Breadcrumb"
        className="mx-auto flex max-w-[1600px] items-center gap-2 px-6 py-3"
      >
        <Link href="/topics" className="pressable t-title no-underline" style={{ color: "var(--text-primary)" }}>
          orthodrill
        </Link>

        {trail.map((crumb) => (
          <span key={crumb.label} className="flex items-center gap-2 min-w-0">
            <span aria-hidden="true" className="t-small select-none" style={{ color: "var(--text-tertiary)" }}>
              /
            </span>
            {crumb.href === undefined ? (
              <span className="t-small truncate" style={{ color: "var(--text-primary)" }} aria-current="page">
                {crumb.label}
              </span>
            ) : (
              <Link
                href={crumb.href}
                className="pressable t-small truncate no-underline hover:underline"
                style={{ color: "var(--text-secondary)" }}
              >
                {crumb.label}
              </Link>
            )}
          </span>
        ))}
      </nav>
    </header>
  );
}
