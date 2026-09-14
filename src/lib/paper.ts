/**
 * Which paper the drawing sheet is printed on (design spec
 * 2026-09-14-paper-themes).
 *
 * Imports nothing, like `ribbon.ts` — a client component reaches this
 * directly, and a module with no imports has no transitive path to anything
 * key-bearing (AGENTS.md §6).
 *
 * WHITE IS NOT STORED AS AN ATTRIBUTE. `:root` already defines the white
 * sheet, so `data-paper` is set only for "warm" and "dark". That keeps one
 * definition of white rather than two that could drift.
 */

export type Paper = "white" | "warm" | "dark";

/** White first: it is the default, and the settings page renders in this order. */
export const PAPERS: readonly Paper[] = ["white", "warm", "dark"];

/** Namespaced like the ribbon's dismissal key — one origin, several features. */
export const PAPER_KEY = "orthodrill:paper";

/**
 * The stored preference, or white for anything this build does not recognise.
 *
 * Case-sensitive on purpose: the only writer is the settings page, which
 * stores exactly one of `PAPERS`. Accepting variants would mean the inline
 * script in `layout.tsx` — which cannot import this module — has to
 * normalise identically, and the two would eventually disagree.
 */
export function parsePaper(raw: string | null): Paper {
  return PAPERS.includes(raw as Paper) ? (raw as Paper) : "white";
}
