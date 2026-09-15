# Paper-Themes Review Fixes — Design

**Date:** 2026-09-15
**Status:** approved, not yet implemented
**Implements:** the five findings of the post-merge review of PR #30 (canvas paper themes), recorded in AGENTS.md §9's 2026-09-15 row. The builder judged the merged work acceptable at the time; the fixes are queued now as the small first half of the next session.
**Plan:** `docs/superpowers/plans/2026-09-15-paper-review-fixes.md`

---

## 1. Why these, and why now

PR #30 shipped three drawing papers. Its implementing session rendered twelve captures and called them clean. The review rendered the pages again, this time with a drawing on the sheet, feedback showing, and the settings page open, and found five defects the captures had not shown. Every one was confirmed by measurement or by a control run, not by reading code:

| # | Finding | Evidence |
|---|---|---|
| 1 | The settings page's **White swatch shows the active paper**, so on dark paper two of the three swatches are dark | computed `background-color` of the White swatch on dark: `rgb(20, 24, 28)` |
| 2 | **Every page load on warm or dark paper logs a React hydration error** | Next's "1 Issue" badge on every non-white capture; absent on white in a control run; the overlay names `data-paper` on `<html>` |
| 3 | **Feedback, selection and angle-readout marks use CHROME tokens**, so they follow the OS theme across a sheet the student themed separately | contrast down to 1.74:1 (the `ok` green, warm paper, dark chrome); the builder's hover overlay at 1.25–1.35:1 on every paper |
| 4 | The pre-paint script **hard-codes the paper vocabulary** (`"warm"`/`"dark"`) and nothing tests it | a fourth paper would apply when chosen and revert to white on every reload |
| 5 | **Stale prose**: the decision log still says the storage key "is written twice"; two `globals.css` comments say the sheet is white in both themes; AGENTS.md §6 claims every sheet mark resolves from a paper token | read directly |

They are small, well understood, and touch the same files the isometric topic will touch next (`Sheet.tsx`, `globals.css`). Fixing them first means the isometric work starts from a sheet whose colour rules are finished.

## 2. The fixes

### 2.1 A white paper any element can ask for (finding 1)

**Cause.** The swatches each carry their own `data-paper` so they render through the exact block that choosing them would apply. That is a good idea, recorded in the `globals.css` comment it came with. But white was defined only on `:root` and the White swatch carried no attribute, so it inherited whatever paper `<html>` had.

**Fix.** Move the drawing-surface token group out of the big `:root` block into its own rule with the selector `:root, [data-paper="white"]`. It is still one definition of white. `<html>` still gets no attribute for white, so the pre-paint script and the picker keep behaving as they do today. But any element can now scope itself back to white. The White swatch always carries `data-paper="white"`.

### 2.2 The pre-paint attribute stops tripping hydration (finding 2)

**Cause.** The inline script sets `data-paper` on `<html>` before React hydrates, and React reports that `<html>`'s attributes differ from what it rendered. Nothing breaks, because React does not patch attributes, but it is a console error on every page for every warm- or dark-paper student. In development it is also a red badge that hides any real hydration error behind it.

**Fix.** `suppressHydrationWarning` on `<html>`, which is what `next-themes` and React's own documentation prescribe for exactly this pattern. It is scoped: it suppresses attribute mismatches on that one element only, not its children. **The consequence worth writing down:** any other attribute mismatch on `<html>` would also be silenced. Nothing else writes to `<html>` today.

### 2.3 Marks on the sheet follow the paper (finding 3)

**Cause.** `Sheet.tsx` draws feedback (`--miss`, `--bad`, `--warn`), selection and previews (`--select`), angle-readout chips (`--bg-raised` fill) and the inexact-heading label (`--text-tertiary`). Those are chrome tokens, which `prefers-color-scheme` redefines. So they follow the OS theme across a sheet the student themed separately. `Builder.tsx` hard-codes its overlays (`#d4380d`, `#2c6bed`).

**Fix.** Four new sheet-scoped tokens, defined in every paper block, and every mark on the sheet reads them:

| Token | white | warm | dark | ratio held (on white, light chrome — the look before paper themes) |
|---|---|---|---|---|
| `--sheet-select` | `#1f6feb` | `#1464e1` | `#397fed` | 4.63:1 |
| `--sheet-miss` | `#b8860b` | `#ab7c0a` | `#886308` | 3.25:1 |
| `--sheet-bad` | `#c02626` | `#af2323` | `#e37373` | 5.92:1 |
| `--sheet-warn` | `#c2740a` | `#b46b09` | `#a36108` | 3.62:1 |

**Derived, not chosen**, the same way PR #30 derived the paper palette. The white column is today's light-chrome value. Each warm and dark value keeps the hue and saturation and was solved for the lightness that reproduces the white column's contrast ratio against its own paper, to within 0.03. A student on dark paper in light chrome, or on white paper in dark chrome, now sees feedback at the same strength as the default look.

- **Angle-readout chips** fill with `var(--paper)` instead of `var(--bg-raised)`. A chip is a label sitting on the sheet, so its ground is the paper, and its text contrast then equals the tone's ratio by construction.
- **The inexact-heading label** uses `var(--construction)`, the paper-derived mid-grey, instead of `--text-tertiary`.
- **`Builder.tsx`'s** extra-material shading uses `var(--sheet-bad)`. Its hover highlight uses `var(--sheet-select)` and gains a thin outline in the same token, because a fill at 22% opacity alone measured 1.25–1.35:1 on every paper.

**Chrome keeps the chrome tokens.** The toolbar's tool buttons, the Check button and the notifications are chrome, and they stay on `--select`, `--ok`, `--bad` and `--warn`. The rule is about where a mark sits, not what it means.

### 2.4 The pre-paint script is generated, and tested by running it (finding 4)

`paperScript()` in `src/lib/paper.ts` builds the script text from `PAPER_KEY` and `PAPERS`, and `layout.tsx` inlines its return value. The old test grepped `layout.tsx` for an import. The new tests **execute the generated script** in `node:vm` against a fake `localStorage` and `document`, and assert:

- what it sets for each stored value: warm, dark, white, absent, empty, unknown, and wrongly cased;
- that it covers every non-white entry in `PAPERS`, so a new paper cannot be forgotten;
- that a throwing `localStorage` does not throw.

One grep stays: that `layout.tsx` inlines `paperScript()` and not a hand-written copy.

### 2.5 Stale prose (finding 5)

- **`globals.css`:** the quadrant comment and the dark-chrome block comment are rewritten, since both claim the sheet is white in both themes.
- **AGENTS.md §6:** the "paper is a user choice" gotcha names the `--sheet-*` tokens, and states the rule that chrome tokens never go on the sheet.
- **Decision log:** a new entry records these fixes. It corrects the earlier "the key is written twice" line by reference; the old entry is not rewritten.

## 3. What this deliberately does not do

- **No change to any palette value** already shipped, and no new paper.
- **No change to chrome colours**, including the toolbar and notifications.
- **No component test harness.** The CSS and component fixes are verified by rendering, as PR #30's were, with the matrix in the plan's render task.

## 4. Testing

- **Unit:** `paper.test.ts` goes from 7 tests to 10. The grep test is replaced by one narrower grep and three behavioural tests. **Suite: 592 → 595.**
- **Render:**
  - `/settings` on each paper: three visibly different swatches, White always white.
  - A drill with lines drawn, checked, and a line mid-gesture showing its angle readout, on each paper in both chrome themes.
  - A build drill with extra material shaded and a hover, on each paper.
  - No "1 Issue" badge anywhere on warm or dark paper.
