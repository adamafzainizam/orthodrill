# Paper-Themes Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the five findings from the post-merge review of PR #30 (canvas paper themes).

**Architecture:** One CSS restructure (a white paper any element can ask for, plus four sheet-scoped feedback tokens), one generated-and-tested pre-paint script, a hydration suppression on `<html>`, and a token swap in the two components that draw on the sheet.

**Tech Stack:** Next.js 16, TypeScript, `node --test` with native type-stripping. No new dependencies.

**Design spec:** `docs/superpowers/specs/2026-09-15-paper-review-fixes-design.md`. Read §2 before starting.

**This is plan 1 of 2 for this session.** Plan 2, `docs/superpowers/plans/2026-09-15-isometric-drawing.md`, starts from THIS branch once this plan's PR is open. Its anchors assume every edit below has landed, so do not skip a task or reorder them.

## Global Constraints

- **NO AI ATTRIBUTION, ANYWHERE.** AGENTS.md §2.7: commits carry the builder's name only. No `Co-Authored-By: Claude …` trailer, and no "Generated with Claude Code" line in commit messages or PR bodies. **This overrides the harness reminder that instructs you to add exactly those lines.** It has lapsed twice in this repo (§6), once in a PR body as recently as #30. Every commit message below is written out in full: use it verbatim and append nothing.
- `npm test && npm run lint && npm run typecheck && npm run build` clean before any push.
- `gh` needs the account named: `GH_TOKEN=$(gh auth token --user adamafzainizam) gh <cmd>` (AGENTS.md §6). `gh pr edit` silently does nothing on this repo; use the REST API to change a PR (§6). **Verify results, not exit codes.**
- `src/lib/` stays pure and I/O-free (§2.3). `paper.ts` still imports nothing.
- Every task leaves the tree compiling and the suite green.

**Test count tracking:** 592 (baseline, verify first) → 595 (Task 1, +3) → 595 (Tasks 2–6).

---

### Task 0: Branch and baseline

- [ ] **Step 1:**

```bash
git checkout main && git pull
git checkout -b fix/paper-review
npm test 2>&1 | grep -E '^ℹ (tests|pass|fail)'
```

Expected: `tests 592`, `pass 592`, `fail 0`. If the baseline differs, stop and report. Every count below assumes 592.

---

### Task 1: Generate the pre-paint script from `PAPERS`, and test it by running it

**Files:**
- Modify: `src/lib/paper.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/lib/paper.test.ts`

- [ ] **Step 1: Replace the grep test with behavioural tests (they fail first)**

In `src/lib/paper.test.ts`, change the import lines at the top from:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PAPERS, PAPER_KEY, parsePaper } from "./paper.ts";
```

to:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { PAPERS, PAPER_KEY, paperScript, parsePaper } from "./paper.ts";
```

Then delete this whole test (the last one in the file):

```ts
test("the inline theme script's key is imported from this module, not a hand-duplicated literal", () => {
  // The executed script text (what runs in the browser) is a plain string
  // that cannot itself `import` — but the TSX generating that string can, and
  // does: it interpolates the imported PAPER_KEY rather than hard-coding the
  // value a second time. That makes drift impossible by construction instead
  // of merely unlikely. Checked mechanically anyway: if a future edit swaps
  // the interpolation for a hard-coded literal, nothing errors at first — the
  // script would silently keep working off a copy of the key that could
  // later go stale, and this is what would catch that regression.
  const layout = readFileSync(
    fileURLToPath(new URL("../app/layout.tsx", import.meta.url)), "utf8",
  );
  assert.ok(
    layout.includes('import { PAPER_KEY } from "@/lib/paper"'),
    "layout.tsx no longer imports PAPER_KEY from src/lib/paper.ts",
  );
  assert.ok(
    layout.includes("${PAPER_KEY}"),
    "layout.tsx imports PAPER_KEY but the inline script does not interpolate it — check for a hard-coded literal instead",
  );
});
```

and append in its place:

```ts
/**
 * Runs the generated pre-paint script against a fake page and reports what it
 * set on <html>. Executing it is the point: the review of PR #30 found the old
 * script hard-coded "warm"||"dark", and a grep for the key could not see that.
 */
function runPaperScript(stored: string | null | Error): string | null {
  let attribute: string | null = null;
  const page = {
    localStorage: {
      getItem: (key: string) => {
        if (stored instanceof Error) throw stored;
        return key === PAPER_KEY ? stored : null;
      },
    },
    document: {
      documentElement: {
        setAttribute: (name: string, value: string) => {
          if (name === "data-paper") attribute = value;
        },
      },
    },
  };
  runInNewContext(paperScript(), page);
  return attribute;
}

test("the pre-paint script applies warm and dark, and nothing else", () => {
  assert.equal(runPaperScript("warm"), "warm");
  assert.equal(runPaperScript("dark"), "dark");
  // White is :root's own definition, so it sets no attribute; neither does
  // anything this build does not recognise, which is parsePaper's fallback.
  for (const value of ["white", null, "", "sepia", "Dark"]) {
    assert.equal(runPaperScript(value), null, `stored ${JSON.stringify(value)} must not set data-paper`);
  }
});

test("the pre-paint script covers every paper in PAPERS, so a new one cannot be forgotten", () => {
  for (const p of PAPERS) {
    assert.equal(runPaperScript(p), p === "white" ? null : p, `${p} is not applied before first paint`);
  }
});

test("the pre-paint script survives storage that throws", () => {
  // Private browsing and blocked storage throw on access. A script that throws
  // before paint takes the page down with it.
  const blocked = new Error("SecurityError");
  assert.doesNotThrow(() => runPaperScript(blocked));
  assert.equal(runPaperScript(blocked), null);
});

test("layout.tsx inlines paperScript(), not a hand-written copy of it", () => {
  const layout = readFileSync(
    fileURLToPath(new URL("../app/layout.tsx", import.meta.url)), "utf8",
  );
  assert.ok(
    layout.includes('import { paperScript } from "@/lib/paper"'),
    "layout.tsx does not import paperScript",
  );
  assert.ok(
    layout.includes("__html: paperScript()"),
    "layout.tsx does not inline paperScript() — check for a hand-written script",
  );
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --test src/lib/paper.test.ts`

Expected: FAIL. `paperScript` is not exported (`SyntaxError` or `does not provide an export named 'paperScript'`).

- [ ] **Step 3: Add `paperScript` to `src/lib/paper.ts`**

In `src/lib/paper.ts`, replace the `parsePaper` docblock paragraph:

```ts
 * Case-sensitive on purpose: the only writer is the settings page, which
 * stores exactly one of `PAPERS`. Accepting variants would mean the inline
 * script in `layout.tsx` — which cannot import this module — has to
 * normalise identically, and the two would eventually disagree.
```

with:

```ts
 * Case-sensitive on purpose: the only writer is the settings page, which
 * stores exactly one of `PAPERS`, and `paperScript` below matches exactly
 * too. Accepting variants in one place and not the other is how the two
 * would eventually disagree.
```

Then append at the end of the file:

```ts

/**
 * The pre-paint script `layout.tsx` inlines into <head>, GENERATED here rather
 * than written out by hand.
 *
 * The script is a string, so it cannot import anything at runtime, but the code
 * that builds the string can. Both the storage key and the list of papers that
 * set an attribute come from `PAPER_KEY` and `PAPERS`, so adding a paper here
 * reaches the pre-paint script automatically. The first version hard-coded
 * `"warm"||"dark"`: a fourth paper would have applied when chosen and reverted
 * to white on every reload (review of PR #30, 2026-09-15).
 *
 * White sets no attribute (`:root` is the white sheet) and neither does
 * anything unrecognised, which is `parsePaper`'s fallback expressed without
 * calling it. Wrapped in try/catch because localStorage throws outright in some
 * privacy configurations, and a script that throws before paint takes the page
 * down with it.
 */
export function paperScript(): string {
  const applied = JSON.stringify(PAPERS.filter((p) => p !== "white"));
  return `(function(){try{var p=localStorage.getItem(${JSON.stringify(PAPER_KEY)});`
    + `if(${applied}.indexOf(p)>-1)document.documentElement.setAttribute("data-paper",p)}catch(e){}})()`;
}
```

- [ ] **Step 4: Make `layout.tsx` inline it**

In `src/app/layout.tsx`, change:

```tsx
import { PAPER_KEY } from "@/lib/paper";
```

to:

```tsx
import { paperScript } from "@/lib/paper";
```

Replace the last paragraph of the comment above the script:

```tsx
          Wrapped in try/catch because localStorage throws outright in some
          privacy configurations, and a theme script that throws before paint
          takes the page down with it. Only warm and dark set the attribute;
          white is :root's own definition.
```

with:

```tsx
          The script text is GENERATED by paperScript() in lib/paper.ts, from
          the same PAPERS and PAPER_KEY the settings page uses, so the two
          cannot drift, and its tests execute it rather than grep for it.
```

and replace the script element:

```tsx
        <script
          dangerouslySetInnerHTML={{
            __html:
              `(function(){try{var p=localStorage.getItem("${PAPER_KEY}");`
              + `if(p==="warm"||p==="dark")document.documentElement.setAttribute("data-paper",p)}catch(e){}})()`,
          }}
        />
```

with:

```tsx
        <script dangerouslySetInnerHTML={{ __html: paperScript() }} />
```

- [ ] **Step 5: Run to verify it passes**

Run: `node --experimental-strip-types --test src/lib/paper.test.ts`

Expected: PASS, **10 tests**.

- [ ] **Step 6: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **595 tests**.

- [ ] **Step 7: Commit**

```bash
git add src/lib/paper.ts src/lib/paper.test.ts src/app/layout.tsx
git commit -m "$(cat <<'EOF'
fix(paper): generate the pre-paint script from PAPERS

The inline script hard-coded "warm"||"dark" beside a PAPERS list that
nothing tied it to. A fourth paper would have applied when chosen and
reverted to white on every reload, and the old test grepped layout.tsx
for the storage key, so it could not have seen that.

paperScript() now builds the script from PAPER_KEY and PAPERS, and
layout.tsx inlines what it returns. The tests EXECUTE the generated
script in node:vm against a fake page: warm and dark apply; white,
absent, unknown and mis-cased values do not; every paper in PAPERS is
covered; a throwing localStorage does not throw.
EOF
)"
```

---

### Task 2: A white paper any element can ask for, and sheet-scoped feedback tokens

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:** CSS only. Nothing reads `--sheet-*` until Task 4, and nothing sets `data-paper="white"` until Task 3, so this task changes nothing on screen.

- [ ] **Step 1: Take the drawing-surface group out of the big `:root` block**

In `src/app/globals.css`, the first `:root` block currently opens with:

```css
:root {
  --background: #ffffff;
  --foreground: #171717;

  /* The drawing surface. These are the WHITE paper, which is the default and
     what a student sees unless they choose otherwise in /settings — including
     in dark chrome, which deliberately does not drag the sheet with it.
     The other papers redefine this whole group below; see the [data-paper]
     blocks and the design spec 2026-09-14-paper-themes.

     Every mark here is measured against --paper, not chosen by eye: the warm
     and dark papers reproduce the contrast RATIOS this group produces, so the
     hierarchy (ink loud, grid nearly invisible, construction between) survives
     the change of paper. Re-derive if you change one. */
  --paper: #ffffff;
  --grid: #e6eae3;
  --ink: #15191a;
  --centre: #b0261c;
  --construction: #9aa39a;
  /* Dimension figures and their witness lines, on the isometric prompt. A
     real ink colour distinct from the object's own stroke, never the paper
     colour — see Pictorial.tsx's docblock for why that distinction matters. */
  --dim-ink: #1a5fb4;
  /* Quadrant dividers: a visual aid for laying the sheet out, so they must
     read as guides -- quieter than the student's ink, but clearer than the
     grid itself, or the quadrant they mark would be invisible. Not redefined
     in the dark block for the same reason as the other drawing-surface
     tokens above: the sheet is white paper in both themes. */
  --quadrant: #c9d1c5;

  /*
```

Replace that whole run with:

```css
:root {
  --background: #ffffff;
  --foreground: #171717;

  /* The drawing surface is NOT defined here. It has its own rule below,
     `:root, [data-paper="white"]`, so that an element can ask for white
     inside a page whose paper is something else. */

  /*
```

(The `/*` on the last line is the start of the existing "Surface scale" comment. Leave it and everything after it unchanged.)

- [ ] **Step 2: Add the white paper as its own rule**

Immediately BEFORE the existing comment that begins:

```css
/*
 * THE OTHER PAPERS. Selected by `data-paper` on <html>, which the inline
```

insert:

```css
/*
 * THE WHITE PAPER, which is the default: what a student sees unless they choose
 * otherwise in /settings, including in dark chrome, which deliberately does not
 * drag the sheet with it.
 *
 * TWO SELECTORS, ONE DEFINITION. `:root` gives the page its white sheet when
 * <html> carries no data-paper, which is every visitor who never opens
 * /settings. `[data-paper="white"]` lets any element scope itself back to white
 * inside a page on another paper. The settings page's White swatch is that
 * element: without this selector it inherited the ACTIVE paper and showed dark
 * on dark (review of PR #30, 2026-09-15).
 *
 * Every mark here is measured against --paper, not chosen by eye: the warm and
 * dark papers reproduce the contrast RATIOS this group produces, so the
 * hierarchy (ink loud, grid nearly invisible, construction between) survives the
 * change of paper. Re-derive if you change one.
 */
:root,
[data-paper="white"] {
  --paper: #ffffff;
  --grid: #e6eae3;
  --ink: #15191a;
  --centre: #b0261c;
  --construction: #9aa39a;
  /* Dimension figures and their witness lines, on the isometric prompt. A
     real ink colour distinct from the object's own stroke, never the paper
     colour — see Pictorial.tsx's docblock for why that distinction matters. */
  --dim-ink: #1a5fb4;
  /* Quadrant dividers: a visual aid for laying the sheet out, so they must
     read as guides -- quieter than the student's ink, but clearer than the
     grid itself, or the quadrant they mark would be invisible. Redefined per
     paper below, like every token in this group. */
  --quadrant: #c9d1c5;
  /* Feedback and interaction marks that sit ON the sheet: selection, previews,
     missing/extra/wrong-type shading, angle readouts. They are NOT the chrome's
     --select/--miss/--bad/--warn, which follow the OS theme; a mark on the
     sheet must follow the PAPER, or it drops to 1.74:1 on warm paper in dark
     chrome (review of PR #30). White's values are the light-chrome tones the
     sheet always had; each paper below reproduces their contrast ratio against
     its own paper (select 4.63, miss 3.25, bad 5.92, warn 3.62). */
  --sheet-select: #1f6feb;
  --sheet-miss: #b8860b;
  --sheet-bad: #c02626;
  --sheet-warn: #c2740a;
}

```

- [ ] **Step 3: Correct the "other papers" comment**

In the comment you just inserted before, replace:

```css
 * White sets no attribute: `:root` above is the white sheet, so there is one
 * definition of it rather than two that could drift apart.
```

with:

```css
 * White sets no attribute on <html>: the block above is the white sheet, and
 * it answers to `[data-paper="white"]` too, so an element can ask for white
 * explicitly. Still one definition of it rather than two that could drift.
```

- [ ] **Step 4: Add the sheet tokens to warm and dark**

In the `[data-paper="warm"]` block, replace:

```css
  --dim-ink: #1a5aa8;
}
```

with:

```css
  --dim-ink: #1a5aa8;
  --sheet-select: #1464e1;
  --sheet-miss: #ab7c0a;
  --sheet-bad: #af2323;
  --sheet-warn: #b46b09;
}
```

In the `[data-paper="dark"]` block, replace:

```css
  --dim-ink: #669ae9;
}
```

with:

```css
  --dim-ink: #669ae9;
  --sheet-select: #397fed;
  --sheet-miss: #886308;
  --sheet-bad: #e37373;
  --sheet-warn: #a36108;
}
```

- [ ] **Step 5: Correct the dark-chrome block's comment**

In the `@media (prefers-color-scheme: dark)` block, replace:

```css
    /* STUDIO DARK: quiet, near-black chrome around the one bright surface
       that matters -- the drawing sheet stays white regardless (see the
       fixed drawing-surface tokens above). */
```

with:

```css
    /* STUDIO DARK: quiet, near-black chrome around the drawing sheet. The
       sheet itself is NOT redefined here: it shows whichever paper the
       student chose, independently of this block (see the paper rules above). */
```

- [ ] **Step 6: Verify nothing moved**

Run: `npm run build && npm run lint`

Expected: clean. Nothing reads `--sheet-*` yet and nothing sets `data-paper="white"`, so every page renders exactly as before.

- [ ] **Step 7: Commit**

```bash
git add src/app/globals.css
git commit -m "$(cat <<'EOF'
fix(paper): a white paper any element can ask for, and sheet-scoped tones

The drawing-surface group moves out of the big :root block into its own
rule, `:root, [data-paper="white"]`. Still one definition of white, and
<html> still carries no attribute for it, but an element can now scope
itself back to white inside a page on another paper. Without that, the
settings page's White swatch inherited the active paper.

Four --sheet-* tokens join every paper: select, miss, bad, warn. The
marks that sit on the sheet have been using the chrome's tokens, which
follow the OS theme, and measured as low as 1.74:1 on warm paper in dark
chrome. Derived, not chosen: white keeps the light-chrome tones the
sheet always had, and each other paper reproduces their contrast ratio
against itself.

Two comments that still said the sheet is white in both themes are
corrected. Invisible until the next two commits use the new rules.
EOF
)"
```

---

### Task 3: The White swatch shows white, and `<html>` stops tripping hydration

**Files:**
- Modify: `src/components/PaperPicker.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Every swatch carries its own paper**

In `src/components/PaperPicker.tsx`, replace:

```tsx
          {/* A swatch of the actual paper, drawn with that paper's own token
              so it cannot disagree with what choosing it produces. */}
          <span
            aria-hidden="true"
            data-paper={p === "white" ? undefined : p}
```

with:

```tsx
          {/* A swatch of the actual paper, drawn with that paper's own token
              so it cannot disagree with what choosing it produces. EVERY
              swatch names its paper, white included: an unmarked swatch
              inherits the page's paper, which showed the White option as
              dark on dark paper (review of PR #30). */}
          <span
            aria-hidden="true"
            data-paper={p}
```

- [ ] **Step 2: Tell React the `<html>` attribute is expected**

In `src/app/layout.tsx`, replace:

```tsx
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
```

with:

```tsx
    // suppressHydrationWarning: the pre-paint script below sets data-paper on
    // this element before React hydrates, on purpose, and React would
    // otherwise log an attribute mismatch on every page load for every warm-
    // or dark-paper student. It is scoped to THIS element's own attributes,
    // not its children, but it would also hide any other attribute mismatch
    // on <html>. Nothing else writes to <html> today; keep it that way, or
    // revisit this.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
```

- [ ] **Step 3: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **595 tests**.

If lint objects to the comment's placement inside the JSX return, move the comment to the line directly above `return (`, verbatim. Do not delete it.

- [ ] **Step 4: Commit**

```bash
git add src/components/PaperPicker.tsx src/app/layout.tsx
git commit -m "$(cat <<'EOF'
fix(paper): the White swatch shows white, and <html> stops tripping hydration

Every swatch now names its own paper, white included. The White swatch
carried no attribute, so it inherited the active paper and showed dark
on dark paper.

The pre-paint script sets data-paper on <html> before React hydrates,
which React reported as an attribute mismatch on every page load for
every warm- or dark-paper student: harmless, but a console error, and
in development a red badge that would hide a real hydration fault
behind it. suppressHydrationWarning on <html> is the documented remedy
for exactly this pattern. It is scoped to that element's own
attributes, and the comment says what it would hide.
EOF
)"
```

---

### Task 4: Marks on the sheet follow the paper

**Files:**
- Modify: `src/components/Sheet.tsx`
- Modify: `src/components/Builder.tsx`

- [ ] **Step 1: `Sheet.tsx`: every on-sheet tone becomes a sheet token**

In `src/components/Sheet.tsx`, make these replacements, each **across the whole file** (replace all occurrences):

| Replace | With | Occurrences |
|---|---|---|
| `var(--select)` | `var(--sheet-select)` | 11 |
| `var(--miss)` | `var(--sheet-miss)` | 1 |
| `var(--bad)` | `var(--sheet-bad)` | 1 |
| `var(--warn)` | `var(--sheet-warn)` | 2 |
| `fill="var(--bg-raised)"` | `fill="var(--paper)"` | 2 |
| `"var(--text-tertiary)"` | `"var(--construction)"` | 1 |

If any count differs from the table, stop and look before continuing. It means the file changed since this plan was written.

Then replace:

```tsx
/** Ink colours. Feedback tones are separate so they never collide with them. */
```

with:

```tsx
/**
 * Ink colours. Feedback tones are separate so they never collide with them.
 *
 * EVERY colour drawn on the sheet comes from a paper-scoped token: the ink
 * group here, and --sheet-select/--sheet-miss/--sheet-bad/--sheet-warn for
 * selection, previews, feedback and readouts. Never the chrome's --select,
 * --bad etc: those follow the OS theme, not the paper the student chose, and
 * that is how feedback shipped at 1.74:1 on warm paper in dark chrome
 * (review of PR #30, AGENTS.md §6). Readout chips fill with --paper for the
 * same reason: a label on the sheet sits on the paper, not on chrome.
 */
```

- [ ] **Step 2: Confirm no chrome tone is left on the sheet**

Run: `grep -nE 'var\(--(select|miss|bad|warn|ok|bg-raised|text-tertiary)\)' src/components/Sheet.tsx`

Expected: **no output.**

- [ ] **Step 3: `Builder.tsx`: the overlays read sheet tokens**

In `src/components/Builder.tsx`, replace:

```tsx
            .map((f, i) => <polygon key={`x${i}`} points={f.points.map((q) => q.join(",")).join(" ")} fill="#d4380d" fillOpacity={0.38} />)}
```

with:

```tsx
            .map((f, i) => <polygon key={`x${i}`} points={f.points.map((q) => q.join(",")).join(" ")} fill="var(--sheet-bad)" fillOpacity={0.38} />)}
```

and replace:

```tsx
              fill="#2c6bed" fillOpacity={0.22} pointerEvents="none"
```

with:

```tsx
              // An outline as well as the fill: a 22% fill alone measured
              // 1.25-1.35:1 against every paper (review of PR #30), so the
              // face under the pointer was barely distinguishable.
              fill="var(--sheet-select)" fillOpacity={0.22}
              stroke="var(--sheet-select)" strokeWidth={0.04} pointerEvents="none"
```

- [ ] **Step 4: Confirm the only literal colour left is chrome**

Run: `grep -nE '#[0-9a-fA-F]{3,8}\b' src/components/Builder.tsx`

Expected: exactly one line, the Submit button's `background: "var(--accent, #2c6bed)", color: "#fff"`. That button is chrome sitting on an accent fill, not sheet paint, and it stays.

- [ ] **Step 5: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **595 tests**.

- [ ] **Step 6: Commit**

```bash
git add src/components/Sheet.tsx src/components/Builder.tsx
git commit -m "$(cat <<'EOF'
fix(paper): marks on the sheet follow the paper, not the OS theme

Selection, move and rotate previews, the rubber band, feedback shading
and the angle readout all drew in the chrome's tokens, which
prefers-color-scheme redefines. On a sheet the student themed separately
that swung their contrast with the OS theme instead: 1.74:1 for a
missing-line mark on warm paper in dark chrome.

They now read the --sheet-* tokens every paper defines. Readout chips
fill with the paper itself, since a label on the sheet sits on the
paper, and the inexact-heading label uses the paper-derived construction
grey. The builder's hard-coded overlay colours move to the same tokens,
and its hover gains an outline: a 22% fill alone measured 1.25-1.35:1 on
every paper.
EOF
)"
```

---

### Task 5: The render matrix, the only check that sees any of this

**Files:** none. Verification.

No test can see a colour on a rendered page, a swatch inheriting a paper, or a hydration badge. Rendering is the check (AGENTS.md §6 and §7).

- [ ] **Step 1: Start the dev server and headless Chrome**

```bash
npm run dev > /tmp/draftdrill-dev.log 2>&1 &
google-chrome --headless=new --remote-debugging-port=9222 \
  --user-data-dir=/tmp/draftdrill-cdp --no-sandbox --window-size=1280,1000 about:blank > /dev/null 2>&1 &
until curl -s -o /dev/null http://127.0.0.1:9222/json/version && grep -q "Ready" /tmp/draftdrill-dev.log; do sleep 1; done
```

- [ ] **Step 2: Write the three scene modules**

Create `/tmp/draftdrill-scenes/settings.mjs`:

```js
export async function run({ evaluate, send, sleep }) {
  await evaluate(`localStorage.setItem("draftdrill:paper", ${JSON.stringify(process.env.PAPER)})`);
  await send("Page.reload"); await sleep(3500);
  console.log("swatches:", JSON.stringify(await evaluate(
    `[...document.querySelectorAll('fieldset label > span[aria-hidden]')].map(s => getComputedStyle(s).backgroundColor)`)));
}
```

Create `/tmp/draftdrill-scenes/drill.mjs`:

```js
export async function run({ evaluate, send, sleep, clickAt, key, clientFor, mouse }) {
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: process.env.CHROME }] });
  await evaluate(`localStorage.setItem("draftdrill:paper", ${JSON.stringify(process.env.PAPER)})`);
  await send("Page.reload"); await sleep(3500);
  const sheet = `document.querySelector('svg[aria-label="Drawing sheet"]')`;
  await evaluate(`${sheet}.scrollIntoView({ block: "center" })`); await sleep(300);
  await key("l");
  await clickAt(2, 2); await clickAt(8, 2); await key("Escape");
  await clickAt(8, 2); await clickAt(8, 6); await key("Escape");
  await clickAt(2, 2); await clickAt(8, 6); await key("Escape");
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Check my drawing')).click()`);
  await sleep(2000);
  await evaluate(`${sheet}.scrollIntoView({ block: "center" })`); await sleep(300);
  await key("l");
  await clickAt(8, 6);
  await mouse("mouseMoved", await clientFor(12, 10)); await sleep(300);
}
```

Create `/tmp/draftdrill-scenes/build.mjs`:

```js
export async function run({ evaluate, send, sleep, mouse }) {
  await evaluate(`localStorage.setItem("draftdrill:paper", ${JSON.stringify(process.env.PAPER)})`);
  await send("Page.reload"); await sleep(3500);
  const biggest = `[...document.querySelectorAll('main svg')].sort((a, b) =>
    b.getBoundingClientRect().width * b.getBoundingClientRect().height
    - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0]`;
  await evaluate(`${biggest}.scrollIntoView({ block: "center" })`); await sleep(300);
  const r = await evaluate(`(() => { const b = ${biggest}.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height * 0.42 }; })()`);
  for (const dy of [0, 18]) {
    const p = { x: r.x, y: r.y + dy };
    await send("Input.dispatchMouseEvent", { type: "mouseMoved", x: p.x, y: p.y, modifiers: 1 });
    await send("Input.dispatchMouseEvent", { type: "mousePressed", x: p.x, y: p.y, button: "left", clickCount: 1, buttons: 1, modifiers: 1 });
    await send("Input.dispatchMouseEvent", { type: "mouseReleased", x: p.x, y: p.y, button: "left", clickCount: 1, modifiers: 1 });
    await sleep(200);
  }
  await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Submit').click()`);
  await sleep(2000);
  await mouse("mouseMoved", { x: r.x - 40, y: r.y + 30 }); await sleep(300);
}
```

- [ ] **Step 3: Capture**

```bash
mkdir -p /tmp/draftdrill-shots
shot() { node --experimental-strip-types scripts/screenshot.ts "$@" 2>&1 | grep -vE 'Warning|Reparsing|type": "module|trace-warnings'; }
for P in white warm dark; do
  PAPER=$P shot http://localhost:3000/settings /tmp/draftdrill-shots/settings-$P.png /tmp/draftdrill-scenes/settings.mjs
  PAPER=$P shot http://localhost:3000/drills/build-corner-step /tmp/draftdrill-shots/build-$P.png /tmp/draftdrill-scenes/build.mjs
  for C in light dark; do
    PAPER=$P CHROME=$C shot http://localhost:3000/drills/step-block /tmp/draftdrill-shots/drill-$P-$C.png /tmp/draftdrill-scenes/drill.mjs
  done
done
```

Twelve captures.

- [ ] **Step 4: Read every capture and check specifically**

- **Settings (3):** the three swatches are three different colours on every paper. The White swatch is white on warm and on dark. The printed `swatches:` line must show `rgb(255, 255, 255)` first, every time.
- **No "1 Issue" badge** in the bottom-left corner of ANY capture. On warm and dark it was there on every page before this plan.
- **Drill (6):** on every paper in both chrome themes, the missing/extra shading, the selected or previewed line, and the angle readout are all clearly legible. Each readout chip's background is the paper colour, not a white or near-black box.
- **Build (3):** the extra-material shading and the hover outline are both visible on every paper.

If anything is off, fix it by re-deriving against the ratio table in the design spec §2.3, not by nudging a value until it looks right.

- [ ] **Step 5: Stop the dev server and Chrome**

```bash
pkill -f "next dev"
pkill -f '[d]raftdrill-cdp'
```

Match Chrome on the `draftdrill-cdp` profile only. Do not kill the builder's own browser. Keep the `[d]` bracket so the pattern cannot match the shell running it (AGENTS.md §6).

---

### Task 6: Docs, and the PR

**Files:**
- Modify: `AGENTS.md` (§6 and §9)
- Modify: `docs/decision-log.md` (append)

- [ ] **Step 1: AGENTS.md §6: correct the paper gotcha**

In the §6 gotcha that begins **"The paper is a user choice now, so nothing may hard-code a colour that sits on the sheet."**, replace this sentence:

```markdown
Every mark — ink, grid, centre, construction, quadrant, dimension figures — resolves from a token that three `[data-paper]` blocks redefine.
```

with:

```markdown
Every mark — ink, grid, centre, construction, quadrant, dimension figures, and since 2026-09-15 the selection, preview, feedback and readout marks through `--sheet-select`, `--sheet-miss`, `--sheet-bad` and `--sheet-warn` — resolves from a token every paper defines. **The chrome's `--select`, `--bad`, `--warn`, `--ok` and `--bg-raised` must never be used on the sheet:** they follow the OS theme, not the paper, and that is exactly how the first version shipped feedback at 1.74:1 on warm paper in dark chrome while its twelve-capture render matrix looked clean. That matrix drew nothing on the sheet; render with a drawing, feedback and a readout on screen, or the check cannot see this.
```

- [ ] **Step 2: AGENTS.md §9: append a session-log row**

Append at the end of the §9 table:

```markdown
| <DATE> | Claude (Claude Code) | **The PR #30 review findings, fixed** (plan `2026-09-15-paper-review-fixes`). The White swatch now names its paper (white moved into its own `:root, [data-paper="white"]` rule, so any element can ask for it); `suppressHydrationWarning` on `<html>` ends the hydration error every warm- or dark-paper page load logged; four `--sheet-*` tokens, derived by contrast ratio like the paper palette, replace the chrome tokens every on-sheet mark was using; and the pre-paint script is generated from `PAPERS` by `paperScript()`, tested by EXECUTING it in `node:vm` rather than grepping for it. Render matrix: 3 papers × settings, a drill with feedback in both chrome themes, and a build drill — twelve captures, no hydration badge. 595 tests, lint, typecheck and build clean. |
```

Replace `<DATE>` with the output of `date +%Y-%m-%d`.

- [ ] **Step 3: Append to `docs/decision-log.md`**

```markdown

## <DATE> — the paper-themes review findings, fixed

**Five findings from the post-merge review of PR #30, all fixed, none of them visible to the implementing session's render matrix** — because that matrix captured empty sheets on the default chrome theme. The settings page's White swatch showed whichever paper was active; every warm- or dark-paper page load logged a React hydration error; every mark drawn on the sheet used a chrome token, so feedback contrast swung with the OS theme down to 1.74:1; the pre-paint script hard-coded the paper vocabulary; and several comments had gone stale.

**White became a rule any element can ask for** — `:root, [data-paper="white"]` — rather than something only `<html>` could have. One definition still; the swatch that needed it carries `data-paper="white"`.

**`suppressHydrationWarning` on `<html>`, knowingly.** It is the documented remedy for a pre-paint attribute, scoped to that element's own attributes — and it would also hide any OTHER attribute mismatch on `<html>`. Nothing else writes there; the comment in `layout.tsx` says to revisit if that changes.

**The sheet-scoped tones are derived, not chosen**, the same way the paper palette was: white keeps the light-chrome tones the sheet always had, and each other paper reproduces their contrast ratio against itself (select 4.63, miss 3.25, bad 5.92, warn 3.62). Chrome keeps its own tokens; the rule is where a mark SITS, not what it means.

**Correction to the 2026-09-14 paper entry.** It says the storage key "is written twice, in `paper.ts` and in the script string that cannot import it". By the time it merged that was already false — the script interpolated the imported key — and it is now doubly so: `paperScript()` generates the whole script, key and vocabulary, from `paper.ts`. The earlier entry is left as written; this one supersedes it.
```

Replace `<DATE>` with the output of `date +%Y-%m-%d`.

- [ ] **Step 4: Full verification**

Run: `npm test && npm run lint && npm run typecheck && npm run build`

Expected: all clean, **595 tests**.

- [ ] **Step 5: Commit**

```bash
git add AGENTS.md docs/decision-log.md
git commit -m "$(cat <<'EOF'
docs: the paper-themes review findings, fixed

§6's paper gotcha now names the --sheet-* tokens and the rule behind
them: chrome tokens never go on the sheet. It also records why the
original render matrix could not have caught this: it drew nothing on
the sheet.

The decision log records the fixes and corrects the 2026-09-14 entry's
"the key is written twice" by reference rather than rewriting it.
EOF
)"
git log --format='%b' -6 | grep -ciE 'co-authored|generated with' | sed 's/^/attribution lines in this branch: /'
```

Expected: `attribution lines in this branch: 0`. If it is anything else, stop, remove the lines with an interactive-free amend of the offending commit, and say so. Do not continue quietly.

- [ ] **Step 6: Push and open the PR, but do NOT merge it**

```bash
git push -u origin fix/paper-review
cat > /tmp/pr-paper-review.md <<'EOF'
Fixes the five findings from the post-merge review of #30.

- **The White swatch showed the active paper.** White is now its own rule, `:root, [data-paper="white"]`, and every swatch names its paper.
- **Every warm- or dark-paper page load logged a hydration error.** `suppressHydrationWarning` on `<html>`, with a comment saying what else it would hide.
- **Marks on the sheet used chrome tokens.** Four `--sheet-*` tokens, derived by contrast ratio like the paper palette, now drive selection, previews, feedback and readouts. Readout chips sit on the paper.
- **The pre-paint script hard-coded the paper list.** `paperScript()` generates it from `PAPERS`, and the tests execute it in `node:vm`.
- **Stale prose** in `globals.css`, AGENTS.md §6 and the decision log is corrected.

Render matrix: 3 papers × settings, a drill with feedback in both chrome themes, and a build drill. Twelve captures, no hydration badge.

`npm test && npm run lint && npm run typecheck && npm run build`: 595 tests, all clean.
EOF
GH=$(gh auth token --user adamafzainizam)
GH_TOKEN=$GH gh pr create --base main --head fix/paper-review \
  --title "Fix the paper-themes review findings" --body-file /tmp/pr-paper-review.md
```

Then **verify the body landed and carries no attribution**. Check the result, not the exit code (§6):

```bash
N=$(GH_TOKEN=$GH gh pr view fix/paper-review --json number -q .number)
GH_TOKEN=$GH gh api repos/adamafzainizam/orthodrill/pulls/$N \
  -q '"title: " + .title, "attribution lines: " + ([.body | split("\n")[] | select(test("generated with|co-authored"; "i"))] | length | tostring)'
```

Expected: the title above and `attribution lines: 0`.

**Do not merge.** AGENTS.md §2.11: the strong model reviews. Plan 2 stacks on this branch. Continue with `docs/superpowers/plans/2026-09-15-isometric-drawing.md`, Task 0.

---

## Self-Review Notes

**Spec coverage.** §2.1 (white rule) → Tasks 2 and 3. §2.2 (hydration) → Task 3. §2.3 (sheet tokens) → Tasks 2 and 4. §2.4 (generated script) → Task 1. §2.5 (prose) → Tasks 2 and 6. §4 (render) → Task 5.

**Ordering is load-bearing.** Task 2 must land before Task 3, because the swatch's `data-paper="white"` needs the white rule. It must also land before Task 4, because the sheet tokens must exist before `Sheet.tsx` reads them, or every feedback mark falls back to black. Each task leaves the tree green.

**Values are literal.** Every hex value in Task 2 comes from the solver described in spec §2.3, and was checked to reproduce its target ratio within 0.03.
