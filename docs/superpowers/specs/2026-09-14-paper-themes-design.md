# Canvas Paper Themes And A Settings Page — Design

**Date:** 2026-09-14
**Status:** approved, not yet implemented
**Implements:** §4's settings-page item, requested by the builder 2026-08-27 and the oldest unbuilt request in the file. The handoff note that logged it is §9's 2026-08-27 row.

---

## 1. What changes

The drawing surface becomes a per-viewer choice of three papers — **white**, **warm**, **dark** — stored in `localStorage`, set from a new `/settings` page, and defaulting to white for anyone who never opens it.

Today `globals.css` pins the drawing-surface tokens in both chrome themes, and says why: *"a technical drawing is black ink on white paper, and pinning the paper means the ink never has to flip."* That reasoning is sound and is not being discarded — it is being made **opt-in**. A student who never visits `/settings` sees exactly what they see today, in either chrome theme. Dark paper flips the ink only for the student who asked for it.

**Paper is its own axis, independent of the OS chrome theme.** Dark chrome keeps white paper unless the student chooses otherwise. Tying the two was considered and rejected: it would silently change what every dark-mode user sees today, and reverse a decision `globals.css` argues for explicitly.

## 2. The premise, measured before designing on it

The whole design rests on one question: **does `var()` resolve inside an SVG presentation attribute** (`fill="var(--paper)"`), or only via `style`? If only via `style`, every paint in two components has to be restructured and a silent failure mode opens — an unresolved `fill` falls back to black, which would render the isometric as a black silhouette rather than failing loudly.

Measured in headless Chrome rather than assumed (§2.4), against `:root { --paper: rgb(1,2,3) }`:

| How the paint is set | Computed `fill` |
|---|---|
| Attribute — `fill="var(--paper)"` | `rgb(1, 2, 3)` |
| Style — `style="fill: var(--paper)"` | `rgb(1, 2, 3)` |
| Control — `fill="rgb(4,5,6)"` | `rgb(4, 5, 6)` |

**Attributes and styles behave identically**, and the control confirms the probe reads real computed values rather than echoing input. So this is a constant swap, not a restructure.

Worth noting why the check was necessary despite `Sheet.tsx` already shipping `stroke="var(--ink)"` as an attribute: no screenshot in the record actually proves that path resolves. Every canvas capture so far has been of an *empty* sheet, and the grid — the only thing visible in them — is painted through a Tailwind class, not an attribute. The app appeared to prove the premise and did not.

## 3. The hidden-line invariant gets STRONGER

§4's warning reads: `Pictorial.tsx` and `Builder.tsx` hard-code `#ffffff`, that equality IS the hidden-line mechanism, and "one hex digit out shows as hidden edges reappearing or the drawing going solid-white."

The warning is right about the mechanism and worth restating: `isoedges.ts` emits a **paint program**, and occlusion is by overdraw — a nearer face's opaque fill painting over a farther face's strokes. The fill must equal the ground beneath it *exactly*.

But the risk it describes is a property of the **current** code, not of this change. Today that colour is written as **three independent literals**:

- `src/components/Pictorial.tsx` — `const PAPER = "#ffffff"`
- `src/components/Builder.tsx` — `const PAPER = "#ffffff"`
- `src/app/globals.css` — `--paper: #ffffff`

Each component sets both its container `background` **and** its face `fill`/`stroke` from its own local constant, so the equality holds only because two files happen to agree with each other and with a third. Nothing enforces it.

Routing both through `var(--paper)` collapses three sources into one. Ground and fill then resolve from the same custom property by definition and **cannot drift** — the failure §4 warns about stops being expressible. This change removes the trap rather than risking it.

## 4. Mechanism

A `data-paper` attribute on `<html>`, with CSS blocks redefining the drawing-surface token group per value — the same shape as the existing `prefers-color-scheme` block, so it follows a pattern already in the file:

```css
:root[data-paper="warm"] { --paper: …; --grid: …; }
:root[data-paper="dark"] { --paper: …; --grid: …; --ink: …; --centre: …; --construction: …; --quadrant: …; --dim-ink: …; }
```

**Dark paper must flip more than `--ink`.** Five other marks sit on that surface and would be unreadable if only the ink changed: `--grid`, `--centre` (the red centre lines), `--construction`, `--quadrant`, and the dimension blue currently hard-coded as `DIM_INK` in `Pictorial.tsx`, which becomes a `--dim-ink` token so it can flip with the rest.

**The exact colour values are for the plan to NAME, not for the implementer to invent.** They are deferred out of this spec because picking hex values without looking at them is worse than useless — they have to be chosen against the existing palette and then confirmed by rendering (§7). But they must be written out in full in the plan, as literal values per token per paper, so that an implementing session is matching a specification rather than exercising taste.

## 5. Scope — smaller than §4 implies

**Already fully token-driven; nothing to change:**
- `Sheet.tsx` — the real drawing canvas; already uses `var(--paper)`, `var(--ink)`, `var(--grid)`, `var(--centre)`, `var(--construction)`
- `MethodDiagram.tsx` — same, including its grid and background

**Needs changing:**
- `Pictorial.tsx` — `PAPER`, `INK`, `DIM_INK` become tokens
- `Builder.tsx` — `PAPER`, `INK` become tokens

**New:**
- `src/app/settings/page.tsx` — the three-way choice
- A small client component owning the choice and writing `localStorage`
- A pre-paint inline script in `layout.tsx` (§6)
- A quiet settings control in `AppHeader`, which also carries a link to `/updates` (§8)

**Explicitly out of scope:** `scripts/verification-sheet.ts` stays pinned white in both themes. §6 records why — it is a standalone sign-off artifact whose job is to look like paper on a reviewer's screen, not part of the app's theming.

## 6. First paint, and the app's first inline script

Pages are statically prerendered, so the server cannot know the stored preference. Applied in an effect after mount, a dark-paper student would see a **white flash on every navigation** — on the one surface the entire app is about.

So `layout.tsx` gains a small blocking inline script that reads `localStorage` and sets `data-paper` on `<html>` before first paint. This is the standard pattern (`next-themes` does exactly this) and is the only way to get it right for a prerendered page.

**Stated plainly because it is a first for this app:** there are no inline scripts in the codebase today. If a Content-Security-Policy is ever added — which deployment might reasonably prompt — this script needs a `nonce` or a hash, and a CSP that forgets it will not error visibly; it will simply reinstate the flash. Recorded here so that is a known consequence rather than a discovery.

The script must also tolerate `localStorage` throwing (private browsing, blocked storage) and an unrecognised stored value, falling back to white in both cases. A theme script that throws before paint takes the page down with it.

## 7. Testing

**Pure and unit-testable** — a small module (`src/lib/paper.ts`, importing nothing, per the rule that lets client components reach `lib/`):

- `PAPERS` — the three valid ids
- `parsePaper(raw: string | null): Paper` — returns the stored value if valid, otherwise `"white"`. Tested against: each valid id, `null`, an unknown string, and a case-mismatched id. This is the function the inline script's logic and the settings page must agree on, so it is worth having in one place with tests rather than inline in two.

**Not unit-testable, and the check that actually matters.** There is no component test harness in this repo, and no test can see a hidden-line failure — a wrong fill produces a *correct-looking* render with edges missing or a solid silhouette. Verification is by rendering, and it must cover the matrix §4 demands:

> three papers × an orthographic drill, a construction, an oblique, and a build exercise

Twelve captures. The build and oblique pages are the load-bearing ones, because those are the two that carry the overdraw mechanism. **What to look for specifically:** on each paper, the isometric's interior edges present and no stray lines across faces (fill equals ground), and every mark — ink, grid, centre lines, construction lines, quadrant guides, dimension figures — legible against that paper.

## 8. The settings entry point, and `/updates`

`AppHeader` gains one quiet control linking to `/settings`, and alongside it a link to `/updates`. The notes spec accepted that the ribbon was `/updates`' only way in; that was tolerable but not good, and since this change is adding secondary nav anyway, solving it once is cheaper than solving it twice.

**The constraint this must respect:** `AppHeader` renders on drill pages too, and §2.10 bars chrome that competes for attention there — the rule that keeps ads and the ribbon off a drill page. These controls must be genuinely quiet: no accent colour, no badge, tertiary text weight at most. If they cannot be made quiet enough to sit on a drill page, they belong on menu pages only, and that judgement is made by **looking at a rendered drill page**, not by argument.

## 9. What this deliberately does not do

- **No per-drill or per-topic paper.** One preference, whole app.
- **No custom colours.** Three curated papers; a colour picker invites combinations where ink and paper are both mid-grey.
- **No server-side persistence.** `localStorage` per viewer, consistent with the ribbon's dismissal and with v1 having no accounts.
- **No "match system" fourth option.** Nobody has asked for it, and it is a fourth state to persist, parse and test.
- **No change to the chrome themes.** `prefers-color-scheme` continues to drive everything outside the sheet, untouched.
