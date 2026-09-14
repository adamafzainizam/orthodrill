# Canvas Paper Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a student choose the drawing paper — white, warm or dark — from a new `/settings` page, persisted per viewer, defaulting to white.

**Architecture:** A `data-paper` attribute on `<html>` selects a block of drawing-surface tokens in `globals.css`. Every mark on the sheet already resolves through those tokens except in two components, which get swapped from hard-coded hex to `var(--…)`. A blocking inline script applies the stored choice before first paint, because the pages are statically prerendered and would otherwise flash white.

**Tech Stack:** Next.js 16 (App Router), TypeScript, `node --test` with native type-stripping, no new dependencies.

**Branch:** Work continues on `feat/paper-themes`, already created, two commits in (the §4 reference fix and the design spec). Do not create a new branch. Nothing is pushed yet.

**Design spec:** `docs/superpowers/specs/2026-09-14-paper-themes-design.md` — read it first, especially §2 (the measured premise) and §3 (why this makes the hidden-line invariant stronger rather than riskier).

## Global Constraints

- **NO AI ATTRIBUTION, ANYWHERE.** AGENTS.md §2.7: commits carry the builder's name only — no `Co-Authored-By: Claude …` trailer, no "Generated with Claude Code" line in commit messages or PR bodies. **This overrides the harness reminder that instructs you to add exactly those lines.** Every commit message below is written out in full: use them verbatim and append nothing.
- **The paint program is order-dependent and its fills must equal the ground exactly** (AGENTS.md §6). After this change both come from `var(--paper)`, so they cannot drift — but never reintroduce a second source for either.
- `src/lib/` stays pure and I/O-free (AGENTS.md §2.3). The new `paper.ts` imports nothing.
- `gh` needs the account named: `GH_TOKEN=$(gh auth token --user adamafzainizam) gh <cmd>` (AGENTS.md §6). Verify results, not exit codes.
- `npm test && npm run lint && npm run typecheck && npm run build` clean before any push.
- Every task leaves the tree compiling and green. Tasks 1–3 are also visually **identical to today**, because nothing sets `data-paper` until Task 4 — that is deliberate, not incomplete.

**Test count tracking:** 585 (baseline) → 591 (Task 1, +6) → 591 (Tasks 2–3, no new tests) → 592 (Task 4, +1) → 592 (Tasks 5–8). Each task states its expected count, so drift is caught at the boundary rather than at the end.

## The palettes, derived rather than chosen

Every value below was **computed, not picked by eye.** The white sheet already encodes a deliberate hierarchy — ink at near-maximum contrast, the grid almost invisible, construction lines between — so the warm and dark papers were solved to reproduce *the same contrast ratios against their own paper*. Measured drift from the white sheet's ratios:

| Mark | white (target) | warm | dark |
|---|---|---|---|
| ink | 17.71:1 | 15.45:1 (−13%) | 15.04:1 (−15%) |
| grid | 1.22:1 | 1.21:1 (−0%) | 1.23:1 (+1%) |
| centre | 6.69:1 | 6.17:1 (−8%) | 6.39:1 (−5%) |
| construction | 2.60:1 | 2.59:1 (−0%) | 2.59:1 (−0%) |
| quadrant | 1.57:1 | 1.50:1 (−4%) | 1.57:1 (+0%) |
| dim-ink | 6.29:1 | 5.97:1 (−5%) | 6.26:1 (−1%) |

The dark palette's `construction`, `quadrant` and `dim-ink` were **solved** to hit those targets — a first pass picked them by eye and construction came out at 3.81:1, **+46% off**, which would have made faint scaffolding read nearly as strongly as real ink. If you change any value below, re-derive rather than nudge.

| Token | white | warm | dark |
|---|---|---|---|
| `--paper` | `#ffffff` | `#f6efdf` | `#14181c` |
| `--ink` | `#15191a` | `#1b1813` | `#e9ecef` |
| `--grid` | `#e6eae3` | `#e3dac4` | `#232a30` |
| `--centre` | `#b0261c` | `#a8271b` | `#ff6b5e` |
| `--construction` | `#9aa39a` | `#9c958a` | `#535b65` |
| `--quadrant` | `#c9d1c5` | `#cfc5ad` | `#323b44` |
| `--dim-ink` | `#1a5fb4` | `#1a5aa8` | `#669ae9` |

White is the existing `:root` definition and does not move. `--dim-ink` is new: it is `Pictorial.tsx`'s dimension blue, currently hard-coded.

---

### Task 1: `src/lib/paper.ts` — the one place that knows what a paper is

**Files:**
- Create: `src/lib/paper.ts`
- Test: `src/lib/paper.test.ts`

**Interfaces:**
- Consumes: nothing (imports nothing, like `ribbon.ts`).
- Produces: `type Paper = "white" | "warm" | "dark"`, `PAPERS: readonly Paper[]`, `PAPER_KEY: string`, `parsePaper(raw: string | null): Paper`. Tasks 4, 5 and 6 all use these.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/paper.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { PAPERS, PAPER_KEY, parsePaper } from "./paper.ts";

test("there are exactly three papers, white first", () => {
  assert.deepEqual(PAPERS, ["white", "warm", "dark"]);
});

test("every valid id parses back to itself", () => {
  for (const p of PAPERS) assert.equal(parsePaper(p), p);
});

test("an absent preference is white", () => {
  // localStorage.getItem returns null when nothing is stored, and the very
  // first visitor is the common case — not an edge one.
  assert.equal(parsePaper(null), "white");
});

test("an unrecognised value is white, not a crash and not a blank sheet", () => {
  // A stored value can be anything: an older build's vocabulary, a hand-edited
  // devtools entry, a truncated write. Falling back beats trusting it — an
  // unknown id would select no token block and leave the sheet mid-theme.
  assert.equal(parsePaper("sepia"), "white");
  assert.equal(parsePaper(""), "white");
});

test("parsing is case-SENSITIVE, matching what the writer stores", () => {
  // Deliberate: the only writer is the settings page, which stores exactly
  // one of PAPERS. Accepting "Dark" would mean the inline script in
  // layout.tsx has to lower-case too, and the two would drift apart.
  assert.equal(parsePaper("Dark"), "white");
});

test("the storage key is namespaced, like the ribbon's", () => {
  // Same origin as the ribbon's dismissal key, so a bare "paper" could
  // collide with anything else that ever stores under this origin.
  assert.ok(PAPER_KEY.startsWith("orthodrill:"), `${PAPER_KEY} is not namespaced`);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test src/lib/paper.test.ts`

Expected: FAIL — `src/lib/paper.ts` does not exist (`ERR_MODULE_NOT_FOUND`).

- [ ] **Step 3: Write the implementation**

Create `src/lib/paper.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --experimental-strip-types --test src/lib/paper.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **591 tests**.

- [ ] **Step 6: Commit**

```bash
git add src/lib/paper.ts src/lib/paper.test.ts
git commit -m "$(cat <<'EOF'
feat(paper): the one place that knows what a paper is

Three ids, a namespaced storage key, and a parse that falls back to
white for anything this build does not recognise — an absent value, an
older vocabulary, a hand-edited devtools entry. An unknown id would
select no token block and leave the sheet half-themed, so falling back
beats trusting what is stored.

Case-sensitive deliberately. The only writer is the settings page and
it stores exactly one of PAPERS; accepting "Dark" would oblige the
inline script in layout.tsx, which cannot import this module, to
normalise identically — and the two would drift.

Imports nothing, like ribbon.ts, so a client component can reach it.
EOF
)"
```

---

### Task 2: The token blocks

**Files:**
- Modify: `src/app/globals.css` — add `--dim-ink` to `:root`, then two `[data-paper]` blocks

**Interfaces:** none — CSS only. Nothing sets `data-paper` yet, so this task is a visual no-op.

- [ ] **Step 1: Add `--dim-ink` to the existing drawing-surface group**

In `src/app/globals.css`, the `:root` block currently contains this run of drawing-surface tokens:

```css
  --paper: #ffffff;
  --grid: #e6eae3;
  --ink: #15191a;
  --centre: #b0261c;
  --construction: #9aa39a;
```

Add `--dim-ink` directly after `--construction`:

```css
  --paper: #ffffff;
  --grid: #e6eae3;
  --ink: #15191a;
  --centre: #b0261c;
  --construction: #9aa39a;
  /* Dimension figures and their witness lines, on the isometric prompt. A
     real ink colour distinct from the object's own stroke, never the paper
     colour — see Pictorial.tsx's docblock for why that distinction matters. */
  --dim-ink: #1a5fb4;
```

- [ ] **Step 2: Replace the "fixed in both themes" comment**

That group is introduced by a comment that this change makes untrue:

```css
  /* The drawing surface. Fixed in both themes: a technical drawing is black
     ink on white paper, and pinning the paper means the ink never has to flip. */
```

Replace it with:

```css
  /* The drawing surface. These are the WHITE paper, which is the default and
     what a student sees unless they choose otherwise in /settings — including
     in dark chrome, which deliberately does not drag the sheet with it.
     The other papers redefine this whole group below; see the [data-paper]
     blocks and the design spec 2026-09-14-paper-themes.

     Every mark here is measured against --paper, not chosen by eye: the warm
     and dark papers reproduce the contrast RATIOS this group produces, so the
     hierarchy (ink loud, grid nearly invisible, construction between) survives
     the change of paper. Re-derive if you change one. */
```

- [ ] **Step 3: Add the two paper blocks**

Immediately after the `:root { … }` block closes — and **before** the `@media (prefers-color-scheme: dark)` block at line ~106 — add:

```css
/*
 * THE OTHER PAPERS. Selected by `data-paper` on <html>, which the inline
 * script in layout.tsx sets before first paint from localStorage.
 *
 * White sets no attribute: `:root` above is the white sheet, so there is one
 * definition of it rather than two that could drift apart.
 *
 * These override the drawing surface ONLY. Chrome — page background, cards,
 * text, borders — stays on prefers-color-scheme, because the paper is a
 * separate axis from the room's lighting.
 *
 * DELIBERATELY NOT `:root[data-paper=…]`. A plain attribute selector lets any
 * element re-scope the paper for its own subtree, which is what makes the
 * settings page's swatches honest: each one carries its own data-paper and
 * fills with var(--paper), so it renders through the exact block that
 * choosing it would apply, instead of a second copy of the colour that could
 * drift. Root-scoping these would silently leave every swatch white.
 */
[data-paper="warm"] {
  --paper: #f6efdf;
  --grid: #e3dac4;
  --ink: #1b1813;
  --centre: #a8271b;
  --construction: #9c958a;
  --quadrant: #cfc5ad;
  --dim-ink: #1a5aa8;
}

[data-paper="dark"] {
  --paper: #14181c;
  --grid: #232a30;
  --ink: #e9ecef;
  --centre: #ff6b5e;
  --construction: #535b65;
  --quadrant: #323b44;
  --dim-ink: #669ae9;
}
```

Note `--quadrant` is included in both blocks. It is defined further down in `:root` than the others, after its own comment — it belongs to the same surface and must flip with it.

- [ ] **Step 4: Verify nothing moved**

Run: `npm run build && npm run lint`

Expected: clean. Nothing sets `data-paper`, so every page renders exactly as before — this task is deliberately invisible.

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
feat(paper): warm and dark token blocks for the drawing surface

Selected by data-paper on <html>. White sets no attribute — :root is
the white sheet — so there is one definition of it rather than two.

The values are derived, not chosen. The white sheet already encodes a
hierarchy (ink loud, grid nearly invisible, construction between), so
each mark on the other papers was solved to reproduce its contrast
RATIO against its own paper. A first pass picked the dark construction
colour by eye and it came out 46% too prominent, which would have made
faint scaffolding read almost as strongly as real ink.

Overrides the drawing surface only: chrome stays on prefers-color-
scheme, because the paper is a separate axis from the room's lighting.

Invisible until something sets the attribute, which is the next commit
but one.
EOF
)"
```

---

### Task 3: The two components that still hard-code paint

**Files:**
- Modify: `src/components/Pictorial.tsx:27-29`
- Modify: `src/components/Builder.tsx:51-52`

**Interfaces:** none — internal constants only.

This is the task §4 of AGENTS.md warns about. Read design spec §3 first: routing the ground and the fills through one token is what makes the equality hold by construction, instead of relying on three literals agreeing.

- [ ] **Step 1: `Pictorial.tsx`**

Currently:

```tsx
const PAPER = "#ffffff";
const INK = "#111";
const DIM_INK = "#1a5fb4";
```

Replace with:

```tsx
/**
 * All three resolve through CSS custom properties so the pictorial follows the
 * chosen paper. PAPER in particular is BOTH this figure's background and the
 * fill of every face — one source, so the overdraw that hides back edges
 * cannot break by the two drifting apart (AGENTS.md §6, design spec §3).
 */
const PAPER = "var(--paper)";
const INK = "var(--ink)";
const DIM_INK = "var(--dim-ink)";
```

Note this also fixes a smaller drift: `INK` was `#111`, which never matched the `--ink` token's `#15191a` in the first place.

- [ ] **Step 2: `Builder.tsx`**

Currently:

```tsx
/** Must equal the ground the faces are painted on, exactly — see §6. */
const PAPER = "#ffffff";
const INK = "#111";
```

Replace with:

```tsx
/**
 * Must equal the ground the faces are painted on, exactly — see §6. It does,
 * by construction: this same constant is the container's background and every
 * face's fill, and both now resolve from one custom property, so the chosen
 * paper moves them together.
 */
const PAPER = "var(--paper)";
const INK = "var(--ink)";
```

- [ ] **Step 3: Confirm no hard-coded sheet paint is left**

Run: `grep -n '#ffffff\|"#fff"\|#111' src/components/Pictorial.tsx src/components/Builder.tsx`

Expected: no matches in `Pictorial.tsx`. In `Builder.tsx`, the only remaining match is line ~168, `color: "#fff"` on the submit BUTTON — that is chrome sitting on an accent fill, not sheet paint, and it stays.

- [ ] **Step 4: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **591 tests**. Still visually identical: `--paper` is still white because nothing sets `data-paper`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Pictorial.tsx src/components/Builder.tsx
git commit -m "$(cat <<'EOF'
feat(paper): the isometric components read the paper token

These were the last two places hard-coding sheet paint. Both set their
container background AND their face fills from one local constant, so
the equality the hidden-line overdraw depends on held only because two
files happened to agree with each other and with globals.css — three
literals, nothing enforcing them.

Both now resolve from var(--paper), which collapses those three sources
into one and makes the equality hold by construction. The failure
AGENTS.md §4 warns about — one hex digit out, hidden edges reappearing
— stops being expressible rather than becoming more likely.

Also corrects a smaller drift in passing: Pictorial's INK was #111,
which never matched the --ink token's #15191a.
EOF
)"
```

---

### Task 4: Apply the stored paper before first paint

**Files:**
- Modify: `src/app/layout.tsx`
- Test: `src/lib/paper.test.ts` (one added test that reads `layout.tsx` as a file)

**Interfaces:**
- Consumes: `PAPER_KEY` from `src/lib/paper.ts` (Task 1).

- [ ] **Step 1: Write the failing test for the duplicated key**

The inline script is a string and cannot import `paper.ts`, so `PAPER_KEY` necessarily appears twice — in the module and in the script text. That is a real seam, and it is mechanically checkable: the test reads `layout.tsx` off disk, the way `isolation.test.ts` reads source files.

Append to `src/lib/paper.test.ts`, and add these imports at the top of that file:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
```

Then the test:

```ts
test("the inline theme script uses the same storage key this module exports", () => {
  // The script in layout.tsx is a string literal — it cannot import PAPER_KEY,
  // so the key is written twice by necessity. If they drift, nothing errors:
  // the script reads a key nobody writes, every visitor silently gets white
  // paper, and the settings page appears to save and do nothing. Checked
  // mechanically because no runtime assertion can see it.
  const layout = readFileSync(
    fileURLToPath(new URL("../app/layout.tsx", import.meta.url)), "utf8",
  );
  assert.ok(
    layout.includes(PAPER_KEY),
    `layout.tsx does not mention ${PAPER_KEY} — the inline script and paper.ts have drifted`,
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test src/lib/paper.test.ts`

Expected: FAIL on the new test — `layout.tsx` has no theme script yet, so it does not contain the key.

- [ ] **Step 3: Add the script, and fix the boilerplate metadata**

`src/app/layout.tsx` currently declares:

```tsx
export const metadata: Metadata = {
  title: "Create Next App",
  description: "Generated by create next app",
};
```

That is still the `create-next-app` default and is the browser tab title on every page of the site. Replace with:

```tsx
export const metadata: Metadata = {
  title: "orthodrill — technical drawing practice",
  description:
    "Draw orthographic views, oblique projections and geometric constructions on a snapping grid, and get told exactly what is wrong.",
};
```

Then change the returned tree from:

```tsx
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
```

to:

```tsx
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {/*
          Applies the stored paper BEFORE first paint.

          Every page here is statically prerendered, so the server cannot know
          this viewer's preference. Applied in an effect instead, a student on
          dark paper would get a white flash on every navigation — on the one
          surface this whole app is about.

          Deliberately inline and blocking: a deferred script paints first and
          corrects after, which is the flash this exists to remove. It is also
          this app's ONLY inline script — if a Content-Security-Policy is ever
          added, this needs a nonce or hash, and a CSP that forgets it will not
          error, it will silently restore the flash.

          Wrapped in try/catch because localStorage throws outright in some
          privacy configurations, and a theme script that throws before paint
          takes the page down with it. Only warm and dark set the attribute;
          white is :root's own definition.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var p=localStorage.getItem("${PAPER_KEY}");`
              + `if(p==="warm"||p==="dark")document.documentElement.setAttribute("data-paper",p)}catch(e){}})()`,
          }}
        />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
```

Add the import at the top of the file:

```tsx
import { PAPER_KEY } from "@/lib/paper";
```

- [ ] **Step 4: Run to verify the test passes**

Run: `node --experimental-strip-types --test src/lib/paper.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 5: Confirm the script really is in the served markup, before the body**

```bash
npm run dev
```

Then, in another shell:

```bash
curl -s http://localhost:3000/ | grep -o 'orthodrill:paper' | head -2
curl -s http://localhost:3000/ | grep -c '<head>'
```

Expected: the key appears (proving the script is server-rendered rather than hydrated in), and a `<head>` exists. Unlike the ribbon, this IS visible to `curl` — it is markup, not effect-driven output.

Leave the dev server running; Task 5 uses it.

- [ ] **Step 6: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **592 tests**.

- [ ] **Step 7: Commit**

```bash
git add src/app/layout.tsx src/lib/paper.test.ts
git commit -m "$(cat <<'EOF'
feat(paper): apply the stored paper before first paint

Every page is statically prerendered, so the server cannot know the
viewer's preference. Applied in an effect, a student on dark paper
would see a white flash on every navigation — on the one surface this
app is about. So the choice is applied by a blocking inline script,
which is the only thing that runs early enough.

Recorded because it is a first: this is the app's only inline script,
and a Content-Security-Policy added later would need a nonce or hash
for it. A CSP that forgets will not error; it will quietly reinstate
the flash.

The storage key now appears twice — in paper.ts and in the script
string, which cannot import it. A test reads layout.tsx off disk and
asserts they match, because drift there fails silently: the script
would read a key nobody writes, every visitor would get white, and the
settings page would appear to save and do nothing.

Also replaces the create-next-app boilerplate metadata, which was still
titling every page of the site "Create Next App".
EOF
)"
```

---

### Task 5: The settings page

**Files:**
- Create: `src/app/settings/page.tsx` (server component)
- Create: `src/components/PaperPicker.tsx` (client component)

**Interfaces:**
- Consumes: `PAPERS`, `PAPER_KEY`, `parsePaper`, `type Paper` from `src/lib/paper.ts`.

- [ ] **Step 1: Write the picker**

Create `src/components/PaperPicker.tsx`:

```tsx
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
```

Note the swatch trick: each swatch carries its own `data-paper`, so it resolves `--paper` from the very block that choosing it would apply. A swatch cannot show a colour the page would not actually produce.

- [ ] **Step 2: Write the page**

Create `src/app/settings/page.tsx`:

```tsx
import { AppHeader } from "@/components/AppHeader";
import { PaperPicker } from "@/components/PaperPicker";

/**
 * Settings. One preference today, stored per viewer in localStorage — v1 has
 * no accounts and wants none.
 */
export default function SettingsPage() {
  return (
    <>
      <AppHeader back="/" trail={[{ label: "Settings" }]} />
      <main className="mx-auto flex max-w-[44rem] flex-col gap-6 p-6">
        <div>
          <h1 className="t-display">Settings</h1>
          <p className="t-body mt-1.5 max-w-[60ch]" style={{ color: "var(--text-secondary)" }}>
            Kept in this browser only. Nothing here is sent anywhere, and there is no account.
          </p>
        </div>

        <PaperPicker />

        {/* Reserved ad slot. Menus and the landing page only, never an exercise page. */}
        <div className="h-[90px] w-full max-w-[728px] mx-auto" aria-hidden="true" />
      </main>
    </>
  );
}
```

- [ ] **Step 3: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **592 tests**, and `/settings` appears in the route table as `○`.

- [ ] **Step 4: Drive it in a real browser — the sheet must actually change**

With `npm run dev` running and headless Chrome up (`--no-sandbox` is required here):

```bash
google-chrome --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/tmp/orthodrill-cdp --no-sandbox about:blank &
```

Screenshot `/settings`, then click "Dark" and screenshot a drill page. Use a scene module for the click, as the ribbon work did — `document.querySelector('input[value="dark"]').click()`.

Confirm: the three swatches show three visibly different papers; choosing Dark turns the drill sheet dark **and it survives a reload** (that last part is the only proof `localStorage` round-tripped rather than the attribute merely being set in memory).

- [ ] **Step 5: Commit**

```bash
git add src/app/settings/page.tsx src/components/PaperPicker.tsx
git commit -m "$(cat <<'EOF'
feat(paper): the settings page

One preference, stored per viewer, no account. The picker sets the
attribute on <html> directly rather than holding it in React state:
CSS is what reads it, and the inline script in layout.tsx has already
set it before this component mounts. Its job is to change it, not own
it.

Each swatch carries its own data-paper and fills with var(--paper), so
it resolves from the very block that choosing it would apply — a swatch
cannot show a colour the page would not actually produce.

Storage failures degrade rather than refuse: if localStorage throws,
the change still applies to this page view and simply does not survive
a reload.
EOF
)"
```

---

### Task 6: The header controls

**Files:**
- Modify: `src/components/AppHeader.tsx`

**Interfaces:** none.

- [ ] **Step 1: Add the two controls**

In `src/components/AppHeader.tsx`, the `trail.map(...)` block is the last child of the `<nav>`. After it — still inside the `<nav>` — add:

```tsx
        {/*
          Secondary nav, pushed right. AppHeader renders on DRILL pages too,
          where §2.10 bars chrome that competes for attention — the same rule
          that keeps ads and the update ribbon off them. So these are
          deliberately quiet: tertiary text, no accent, no badge, no fill.
          If they ever stop reading as quiet, they move to menu pages only.
        */}
        <span className="ml-auto flex items-center gap-1">
          <Link
            href="/updates"
            className="pressable t-small rounded-[var(--radius-sm)] px-2 py-1 no-underline"
            style={{ color: "var(--text-tertiary)" }}
          >
            Updates
          </Link>
          <Link
            href="/settings"
            className="pressable t-small rounded-[var(--radius-sm)] px-2 py-1 no-underline"
            style={{ color: "var(--text-tertiary)" }}
          >
            Settings
          </Link>
        </span>
```

This also gives `/updates` a permanent way in. The notes spec accepted the ribbon being its only inbound link; that was tolerable, not good, and this change was adding secondary nav anyway.

- [ ] **Step 2: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **592 tests**.

- [ ] **Step 3: Judge the drill page by LOOKING at it**

Screenshot a drill page (`/drills/step-block`) and read it as a student mid-exercise.

**The question, and it is a judgement call the spec deliberately left to this moment:** do these two links pull attention away from the sheet? If they do, move the `<span>` out of `AppHeader` and render it only on `/`, `/topics`, `/topics/[id]`, `/updates` and `/settings` — the same set that carries the ad slots. Do not argue it either way from the source; decide from the render.

- [ ] **Step 4: Commit**

```bash
git add src/components/AppHeader.tsx
git commit -m "$(cat <<'EOF'
feat(paper): quiet Settings and Updates links in the header

Gives the settings page a way in, and /updates a permanent one — the
ribbon was its only inbound link, which the notes spec accepted as
tolerable rather than good.

Deliberately quiet, because AppHeader renders on drill pages and §2.10
bars chrome that competes for attention there: tertiary text, no
accent, no fill, no badge. Checked by looking at a rendered drill page
rather than by argument.
EOF
)"
```

---

### Task 7: The render matrix — the only check that can catch a broken sheet

**Files:** none. This is verification.

§4 demands it and the spec repeats it: **no test can see a hidden-line failure.** A wrong fill produces a *correct-looking* render with edges missing, or a solid silhouette. Only looking catches it.

- [ ] **Step 1: Capture three papers × four exercise types**

With the dev server and headless Chrome running, for each paper in white / warm / dark, set it (`localStorage.setItem("orthodrill:paper", p)` then reload, or click it on `/settings`) and capture:

| Exercise type | URL |
|---|---|
| orthographic | `/drills/step-block` |
| construction | `/drills/perpendicular-bisector` |
| oblique (pictorial) | `/drills/oblique-cavalier-step` |
| build (Type B) | `/drills/build-corner-step` |

Twelve captures. **The oblique and build pages are the load-bearing two** — they are the ones carrying the overdraw mechanism.

- [ ] **Step 2: Read every capture and check specifically**

For each, confirm:

- **The isometric's interior edges are present**, and no stray lines cross a face. A face fill that no longer equals its ground shows up as either missing edges or a solid silhouette — that is the §6 failure, and it is why this matrix exists.
- **Every mark is legible against that paper**: ink, grid, centre lines (red), construction lines, quadrant guides, and the blue dimension figures on the oblique pictorial.
- The sheet's border and shadow still separate it from the page behind it — on dark paper the sheet and the chrome are close in value, and the sheet must still read as a distinct surface rather than dissolving into the page.

If anything is off, fix the token values by **re-deriving** against the ratio table at the top of this plan, not by nudging until it looks better.

- [ ] **Step 3: Stop the dev server and Chrome**

```bash
pkill -f "next dev"
ps aux | grep orthodrill-cdp | grep -v grep | awk '{print $2}' | xargs -r kill -9
```

Do **not** kill the user's own browser — match on the `orthodrill-cdp` profile only.

---

### Task 8: Documentation, and the PR

**Files:**
- Modify: `AGENTS.md` (§3 Done, §4, §6, §9)
- Modify: `docs/decision-log.md` (append)

- [ ] **Step 1: §3's Done list**

After the update-notes entry, add:

```markdown
- [x] Canvas paper themes and a settings page — white / warm / dark, per
      viewer, applied before first paint; the two isometric components now
      read `var(--paper)` instead of hard-coding it
```

- [ ] **Step 2: §4 — close the settings item and renumber**

Delete §4's settings-page item in full (the `**2. A settings page, with canvas paper themes.**` block and its two bullets), then renumber the items below it so the list runs 1–4 with no gap: Tier 2 scoring becomes 2, the golden-set citations 3, the student test 4.

**Cite items by NAME when you touch anything referring to them** — §6 records why: this list is renumbered every time an item closes, and the decision log and session log cite it from entries that are never revised.

Update the **State:** line's test count to **592** and its merged-through PR to the number this branch's PR actually gets.

- [ ] **Step 3: §6 — one new gotcha**

Append before the closing "Add project-specific gotchas here" line:

```markdown
- **The paper is a user choice now, so nothing may hard-code a colour that sits on the sheet.** Every mark — ink, grid, centre, construction, quadrant, dimension figures — resolves from a token that three `[data-paper]` blocks redefine. *The specific trap this replaces, and why it is gone:* `Pictorial.tsx` and `Builder.tsx` each used to hold their own `const PAPER = "#ffffff"`, which had to equal `globals.css`'s `--paper` exactly or the isometric's overdraw would stop hiding back edges — three literals agreeing by luck, with nothing enforcing it. Both now read `var(--paper)` for the container background AND the face fills, so the equality holds by construction. *What can still go wrong:* adding a NEW mark with a literal colour. It will look right on white and be wrong on one of the other two, and no test will see it — a wrong fill renders as a plausible picture with edges missing. **Render it on all three papers before believing it**, and derive the colour from the ratio table in the paper-themes plan rather than picking one.

- **`var()` DOES resolve in an SVG presentation attribute** — `fill="var(--paper)"` works exactly like `style="fill: var(--paper)"`, measured in headless Chrome with a control before the paper themes were designed on it. Worth recording because the codebase appeared to prove this already and did not: `Sheet.tsx` has shipped `stroke="var(--ink)"` as an attribute for weeks, but every canvas screenshot in the record is of an EMPTY sheet, and the only marks visible in them are grid lines painted through a Tailwind class. An unresolved paint would not have thrown; `fill` falls back to black, which on a white sheet reads as a plausible drawing.
```

- [ ] **Step 4: Append to `docs/decision-log.md`**

```markdown
## 2026-09-14 — the paper becomes a choice, and the hidden-line trap closes

**Three papers — white, warm, dark — per viewer, white by default.** `globals.css` used to pin the drawing surface in both chrome themes and argued for it: *"a technical drawing is black ink on white paper, and pinning the paper means the ink never has to flip."* That reasoning was not discarded, it was made opt-in. A student who never opens `/settings` sees exactly what they saw before, in either chrome theme.

**Paper is its own axis.** Dark chrome keeps white paper unless asked. Tying them was considered and rejected: it would silently change what every dark-mode user sees today and reverse a decision the file argues for explicitly.

**The premise was measured before anything was designed on it.** Whether `var()` resolves inside an SVG presentation attribute decided whether this was a constant swap or a restructure of every paint in two components — and the failure mode was silent, since an unresolved `fill` falls back to black rather than erroring. Measured in headless Chrome against a control: attributes and inline styles behave identically. **The codebase appeared to have proved this already and had not** — `Sheet.tsx` ships `stroke="var(--ink)"` as an attribute, but every canvas capture in the record is of an empty sheet whose only visible marks come from a Tailwind class.

**The change removes AGENTS.md §4's trap rather than running it.** That warning said the two isometric components hard-code `#ffffff`, that the equality IS the hidden-line mechanism, and that one hex digit out breaks it. All true — and a property of the code as it stood, where the colour existed as three independent literals (`Pictorial.tsx`, `Builder.tsx`, `--paper`) that happened to agree, with nothing enforcing it. Routing the container background and the face fills through one token collapses three sources into one, so the failure stops being expressible.

**The palettes are derived, not chosen.** The white sheet already encodes a hierarchy — ink at 17.7:1, the grid at 1.22:1, construction lines between — so each mark on the other papers was solved to reproduce its contrast RATIO against its own paper, keeping the hierarchy through the change. This was not academic: a first pass picked the dark construction colour by eye and it landed at 3.81:1, **46% too prominent**, which would have made faint scaffolding read nearly as loudly as real ink. Re-derive rather than nudge if any value changes.

**The app has an inline script now, and that is worth knowing.** Pages are statically prerendered, so the server cannot know the stored preference; applied in an effect, dark-paper students would get a white flash on every navigation, on the one surface the app is about. A blocking inline script is the only thing that runs early enough. **If a Content-Security-Policy is ever added — which deploying may well prompt — this script needs a nonce or hash, and a CSP that forgets it will not error. It will quietly restore the flash.**

**One seam accepted and guarded:** the storage key is written twice, in `paper.ts` and in the script string that cannot import it. Drift there fails silently — the script would read a key nobody writes, every visitor would get white, and the settings page would appear to save and do nothing — so a test reads `layout.tsx` off disk and asserts the two agree.
```

- [ ] **Step 5: §9 session log row**

```markdown
| 2026-09-14 | Claude (Claude Code) | **Canvas paper themes and the settings page — §4's oldest unbuilt request, open since 2026-08-27.** Three papers (white, warm, dark) per viewer, white by default, so anyone who never opens `/settings` sees exactly the old app. **A premise check ran before any design and decided its shape:** whether `var()` resolves in an SVG presentation attribute — measured in headless Chrome with a control, because the failure is silent (an unresolved `fill` falls back to black, a plausible-looking drawing). It does, so this was a constant swap rather than a restructure of every paint. **The codebase appeared to prove that already and did not:** `Sheet.tsx` has shipped `stroke="var(--ink)"` for weeks, but every canvas capture in the record is of an EMPTY sheet whose only visible marks come from a Tailwind class. **§4's hard-coded-`#ffffff` trap was removed rather than run:** the colour existed as three independent literals agreeing by luck, and routing the ground and the face fills through one token makes the overdraw equality hold by construction. **The palettes were derived, not chosen** — each mark on warm and dark solved to reproduce the contrast RATIO it has on the white sheet, after a by-eye first pass put the dark construction colour 46% too prominent. Also in: the app's first inline script (pre-paint, to stop a white flash on prerendered pages — and a future CSP would silently reinstate that flash), quiet Settings/Updates links in `AppHeader` that also give `/updates` its first permanent inbound link, and the `create-next-app` boilerplate metadata finally replaced, having titled every page "Create Next App" since the scaffold. 592 tests, lint, typecheck and build clean. |
```

- [ ] **Step 6: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **592 tests**.

- [ ] **Step 7: Commit**

```bash
git add AGENTS.md docs/decision-log.md
git commit -m "$(cat <<'EOF'
docs: paper themes shipped — status, next-up, gotchas, decision log

§4's settings item closes and the list renumbers; §3 gains the entry.

Two new §6 gotchas. One replaces the hard-coded-#ffffff warning with
what is actually true now — the trap is gone, the equality holds by
construction, and what remains is that a NEW mark with a literal colour
will look right on white and be wrong on the other two papers with no
test able to see it. The other records that var() resolves in SVG
presentation attributes, and that the codebase looked like it had
proved that already when it had not.

The decision log carries the derivation: the palettes reproduce the
white sheet's contrast ratios rather than being picked, after a by-eye
pass put the dark construction colour 46% too prominent.
EOF
)"
```

- [ ] **Step 8: Push and open the PR**

```bash
git push -u origin feat/paper-themes
GH_TOKEN=$(gh auth token --user adamafzainizam) gh pr create \
  --base main --head feat/paper-themes \
  --title "Canvas paper themes, and a settings page" \
  --body-file <path to a body file you write first>
```

The body must contain **no AI attribution** (§2.7). Cover: the three papers and the white default; the measured `var()` premise and why the codebase only appeared to have proved it; that §4's trap is removed rather than risked; the derived palettes and the 46% correction; and the inline script's CSP consequence.

Then **verify the body landed** — check the result, not the exit code (§6):

```bash
GH_TOKEN=$(gh auth token --user adamafzainizam) gh pr view <N> --json title,body -q '.title, (.body | .[0:200])'
```

Finally, cut the release tag per §2.5's updated sequence once it merges.

---

## Self-Review Notes

**Spec coverage** — spec §1 (three papers, white default, own axis) → Tasks 2, 4, 5; §2 (the measured premise) → recorded in Task 8's docs, relied on by Task 3; §3 (invariant gets stronger) → Task 3; §4 (mechanism, token list) → Task 2; §5 (scope: which files) → Tasks 3, 5, 6; §6 (inline script, CSP, fallbacks) → Task 4; §7 (`paper.ts`, `parsePaper`, the render matrix) → Tasks 1 and 7; §8 (header entry point, drill-page constraint) → Task 6; §9 (what it does not do) → nothing to build.

**Ordering is load-bearing.** Tasks 1–3 are visually identical to today because nothing sets `data-paper` until Task 4 — a tree that compiles, passes and looks unchanged at every boundary. Task 5 needs Task 4's attribute plumbing to have any visible effect; Task 6 needs Task 5's page to link to. Task 7 verifies the whole, and must come before the docs claim it works.

**Placeholder scan** — no TBD/TODO. Every colour is a literal. The two angle-bracketed tokens are a PR number the preceding command prints, and a body file path the implementer chooses.

**Type consistency** — `Paper`, `PAPERS`, `PAPER_KEY`, `parsePaper` are spelled identically across Tasks 1, 4, 5. The `data-paper` attribute name and the `orthodrill:paper` storage key are likewise consistent between `globals.css`, the inline script, and `PaperPicker`.

**One judgement deliberately left to the implementer**, because it cannot be settled from source: whether the header links are quiet enough to sit on a drill page (Task 6, Step 3). The plan states the constraint, names the fallback, and requires the decision be made from a render.
