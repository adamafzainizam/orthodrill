/**
 * Render the golden parts to an HTML sheet for human review.
 *
 * Emits TWO files from one body, differing only in their outer wrapper:
 *   verification-sheet.html           — standalone document, open it locally
 *   verification-sheet.artifact.html  — body-only, for publishing as an Artifact
 * The Artifact host supplies its own <!doctype>/<head>/<body>, so the second
 * file must not carry them. Both are gitignored build outputs.
 *
 * DEV SCRIPT, NOT LIBRARY CODE. It performs I/O and emits presentation markup,
 * so it deliberately lives outside src/lib/, which stays pure (AGENTS.md §2.3).
 *
 * Run: npm run verify:sheet
 */
import { writeFileSync } from "node:fs";
import { GOLDEN_PARTS } from "../src/lib/geometry/fixtures/golden.ts";
import { generateViews } from "../src/lib/geometry/views.ts";
import { boundingBox, type Primitive } from "../src/lib/scoring/primitives.ts";
import { isometricView } from "../src/lib/geometry/isometric.ts";
import type { IsoPrimitive } from "../src/lib/geometry/isotypes.ts";

const SCALE = 20;
const PAD = 16;

/**
 * One grid square per model unit, which the fixtures describe as 10 mm.
 * Drawn only under the orthographic views: the isometric's fills are opaque
 * and would bury it, and a square grid would misdescribe a projected lattice
 * anyway. Views are normalised to the origin (views.ts), and CENTRE_OVERSHOOT
 * is a whole number of units, so the grid stays aligned to the lattice even on
 * parts whose bounding box is enlarged by a centre line.
 */
function gridLines(w: number, h: number): string {
  const out: string[] = [];
  for (let x = PAD; x <= w - PAD + 0.01; x += SCALE) {
    out.push(`<line x1="${x}" y1="${PAD}" x2="${x}" y2="${h - PAD}" class="grid"/>`);
  }
  for (let y = PAD; y <= h - PAD + 0.01; y += SCALE) {
    out.push(`<line x1="${PAD}" y1="${y}" x2="${w - PAD}" y2="${y}" class="grid"/>`);
  }
  return out.join("\n      ");
}

/** Fixture prose is written in Markdown-ish backticks; render them as code. */
function ticks(text: string): string {
  return text.replace(/`([^`]+)`/g, "<code>$1</code>");
}

function renderView(ps: Primitive[], label: string): string {
  const b = boundingBox(ps);
  if (b === null) return `<figure class="view"><em>${label}: empty</em></figure>`;
  const w = (b.maxX - b.minX) * SCALE + PAD * 2;
  const h = (b.maxY - b.minY) * SCALE + PAD * 2;
  const at = (n: number) => n * SCALE + PAD;

  const body = ps.map((p) => {
    const dash = p.type === "hidden" ? ' stroke-dasharray="6 4"'
      : p.type === "centre" ? ' stroke-dasharray="12 3 3 3"' : "";
    const colour = p.type === "centre" ? "#b00" : "#111";
    return p.kind === "circle"
      ? `<circle cx="${at(p.cx)}" cy="${at(p.cy)}" r="${p.r * SCALE}" fill="none" stroke="${colour}" stroke-width="2"${dash}/>`
      : `<line x1="${at(p.x1)}" y1="${at(p.y1)}" x2="${at(p.x2)}" y2="${at(p.y2)}" stroke="${colour}" stroke-width="2"${dash}/>`;
  }).join("\n      ");

  return `<figure class="view">
    <figcaption>${label}</figcaption>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label} view">
      ${gridLines(w, h)}
      ${body}
    </svg>
  </figure>`;
}

function renderIsometric(ps: IsoPrimitive[], label: string): string {
  if (ps.length === 0) return `<figure class="view"><em>${label}: empty</em></figure>`;
  const pts = (p: IsoPrimitive): number[][] =>
    p.kind === "iso-line" ? [[p.x1, p.y1], [p.x2, p.y2]]
    : p.kind === "iso-face" ? p.points.map((q) => [q[0], q[1]])
    : [[p.cx - p.rx, p.cy - p.rx], [p.cx + p.rx, p.cy + p.rx]];
  const xs = ps.flatMap((p) => pts(p).map((q) => q[0]));
  const ys = ps.flatMap((p) => pts(p).map((q) => q[1]));
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const S = 26; // pixels per projection unit — presentation only
  const w = (maxX - minX) * S + PAD * 2;
  const h = (maxY - minY) * S + PAD * 2;
  const px = (n: number) => (n - minX) * S + PAD;
  const py = (n: number) => (n - minY) * S + PAD;

  // ORDER IS LOAD-BEARING. Emit in sequence: a fill paints over the strokes of
  // everything behind it, which is how hidden lines disappear. Do not sort,
  // filter or deduplicate. Fills are BOTH filled and stroked in the background
  // colour, per the renderer contract in isoedges.ts - stroking seals a fill's
  // own boundary so a hidden edge lying on the seam between two coplanar fills
  // cannot show through as an antialiasing hairline.
  //
  // BG MUST EQUAL THE PANEL BACKGROUND EXACTLY. It is not a theme token: the
  // panel is pure white in both themes precisely so this stays true.
  const BG = "#fff";
  const body = ps.map((p) => {
    if (p.kind === "iso-face") {
      const poly = p.points.map((q) => `${px(q[0])},${py(q[1])}`).join(" ");
      return `<polygon points="${poly}" fill="${BG}" stroke="${BG}" stroke-width="0.3"/>`;
    }
    if (p.kind === "iso-line") {
      return `<line x1="${px(p.x1)}" y1="${py(p.y1)}" x2="${px(p.x2)}" y2="${py(p.y2)}" stroke="#111" stroke-width="2"/>`;
    }
    return `<ellipse cx="${px(p.cx)}" cy="${py(p.cy)}" rx="${p.rx * S}" ry="${p.ry * S}" fill="none" stroke="#111" stroke-width="2" transform="rotate(${p.rotation} ${px(p.cx)} ${py(p.cy)})"/>`;
  }).join("\n      ");

  return `<figure class="view pictorial">
    <figcaption>${label}</figcaption>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${label}">
      ${body}
    </svg>
  </figure>`;
}

const FONTS =
  '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:ital,wght@0,400;0,500;0,600;1,400&display=swap">';

const STYLE = `<style>
  /* Drafting-room palette: board neutrals biased green, centre-line red as the
     accent. Every colour is a token defined on bare :root, redefined for dark;
     nothing takes its ONLY definition from inside a media or [data-theme] block. */
  :root {
    --board: #e9ede7;
    --card: #f7f9f5;
    --ink: #15191a;
    --ink-soft: #5a625c;
    --rule: #c6cdc4;
    --rule-soft: #dbe1d8;
    --accent: #b0261c;
    --accent-bg: #f7e3e0;
    --ok: #2f6b45;
    --ok-bg: #dfeee4;
    --paper: #ffffff;
    --grid: #e6eae3;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --board: #14181a;
      --card: #1c2124;
      --ink: #e6ebe6;
      --ink-soft: #9aa49d;
      --rule: #333b3d;
      --rule-soft: #262d30;
      --accent: #e8776a;
      --accent-bg: #3a1f1c;
      --ok: #7fc79b;
      --ok-bg: #1c3427;
      --paper: #ffffff;
      --grid: #e6eae3;
    }
  }
  :root[data-theme="dark"] {
    --board: #14181a;
    --card: #1c2124;
    --ink: #e6ebe6;
    --ink-soft: #9aa49d;
    --rule: #333b3d;
    --rule-soft: #262d30;
    --accent: #e8776a;
    --accent-bg: #3a1f1c;
    --ok: #7fc79b;
    --ok-bg: #1c3427;
    --paper: #ffffff;
    --grid: #e6eae3;
  }

  body {
    background: var(--board);
    color: var(--ink);
    font: 400 16px/1.6 "IBM Plex Sans", ui-sans-serif, system-ui, sans-serif;
    margin: 0;
    padding: 3rem 1.5rem 5rem;
  }
  .sheet { max-width: 66rem; margin: 0 auto; display: flex; flex-direction: column; gap: 2.5rem; }

  h1 {
    font: 600 clamp(2rem, 5vw, 3rem)/1.05 "Barlow Condensed", "IBM Plex Sans", sans-serif;
    text-transform: uppercase; letter-spacing: .04em; text-wrap: balance;
    margin: 0;
  }
  .eyebrow {
    font: 500 12px/1 "IBM Plex Mono", ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: .18em; color: var(--ink-soft);
    margin: 0 0 .75rem;
  }
  .lede { max-width: 60ch; margin: .75rem 0 0; color: var(--ink-soft); }

  .panel {
    background: var(--card);
    border: 1px solid var(--rule);
    padding: 1.5rem 1.75rem;
    display: flex; flex-direction: column; gap: 1rem;
  }
  .panel h2, .part h3 {
    font: 600 15px/1.2 "IBM Plex Mono", ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: .1em;
    margin: 0; color: var(--ink);
  }
  .panel p { margin: 0; max-width: 68ch; }

  .dirs { list-style: none; margin: 0; padding: 0; display: grid; gap: .6rem; }
  .dirs li { display: grid; grid-template-columns: 8.5rem 1fr; gap: 1rem; align-items: baseline; }
  .dirs .who {
    font: 500 12px/1.5 "IBM Plex Mono", ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: .08em; color: var(--accent);
  }
  .dirs .what { max-width: 60ch; }

  /* Numbered because this is a procedure and the order is the review order. */
  .steps { margin: 0; padding: 0; list-style: none; counter-reset: step; display: grid; gap: .8rem; }
  .steps li { counter-increment: step; display: grid; grid-template-columns: 2rem 1fr; gap: 1rem; max-width: 68ch; }
  .steps li p { margin: 0; }
  .steps li::before {
    content: counter(step, decimal-leading-zero);
    font: 500 12px/1.7 "IBM Plex Mono", ui-monospace, monospace;
    color: var(--ink-soft);
  }

  .legend { display: flex; flex-wrap: wrap; gap: 1.5rem; margin: 0; padding: 0; list-style: none; }
  .legend li { display: flex; align-items: center; gap: .6rem; font-size: 14px; }
  .legend svg { flex: none; display: block; background: var(--paper); border: 1px solid var(--rule); padding: 4px 6px; }

  /* Title block: the strip across the head of a drawing sheet. */
  .part { background: var(--card); border: 1px solid var(--rule); }
  .titleblock {
    display: flex; flex-wrap: wrap; align-items: baseline; gap: .75rem 1.25rem;
    padding: 1rem 1.5rem; border-bottom: 1px solid var(--rule);
  }
  .status {
    font: 500 11px/1 "IBM Plex Mono", ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: .12em;
    padding: .35em .6em; border-radius: 2px;
  }
  .UNVERIFIED { background: var(--accent-bg); color: var(--accent); }
  .VERIFIED { background: var(--ok-bg); color: var(--ok); }
  .part-body { padding: 1.25rem 1.5rem 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
  .desc { margin: 0; max-width: 68ch; }
  .src {
    margin: 0; font: 400 13px/1.5 "IBM Plex Mono", ui-monospace, monospace;
    color: var(--ink-soft); max-width: 76ch;
  }
  .src b { color: var(--ink); font-weight: 500; }
  code { font: 400 .9em/1 "IBM Plex Mono", ui-monospace, monospace; background: var(--rule-soft); padding: .15em .35em; border-radius: 2px; }

  .views { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 1.25rem; overflow-x: auto; }
  .view { margin: 0; display: flex; flex-direction: column; gap: .5rem; }
  /* The panel is pure white in BOTH themes on purpose: the isometric's opaque
     fills are #fff and hide edges by painting over them, so the ground beneath
     them must be exactly that colour or the picture breaks. */
  .view svg {
    display: block; background: var(--paper);
    border: 1px solid var(--rule); max-width: 100%; height: auto;
  }
  .view .grid { stroke: var(--grid); stroke-width: 1; }
  .view figcaption {
    font: 500 11px/1 "IBM Plex Mono", ui-monospace, monospace;
    text-transform: uppercase; letter-spacing: .12em; color: var(--ink-soft);
  }
  .pictorial figcaption { color: var(--accent); }

  @media (max-width: 40rem) {
    body { padding: 2rem 1rem 3rem; }
    .dirs li, .steps li { grid-template-columns: 1fr; gap: .2rem; }
  }
</style>`;

/** Small ink samples so the legend shows the line types rather than naming them. */
function legendSwatch(dash: string, colour: string): string {
  return `<svg width="52" height="8" viewBox="0 0 52 8" aria-hidden="true"><line x1="1" y1="4" x2="51" y2="4" stroke="${colour}" stroke-width="2"${dash}/></svg>`;
}

function prelude(): string {
  return `<header>
  <p class="eyebrow">Orthodrill · generator golden set</p>
  <h1>Golden set review</h1>
  <p class="lede">Four parts produced by the projection generator, each shown as a pictorial
  beside the three views it generated. None has been checked by anyone who knows drafting.
  Until one is, no drill can ship — the app would be marking students against these drawings.</p>
</header>

<section class="panel">
  <h2>Where the observer stands</h2>
  <p>Judging left from right is the whole point of this review, so the viewing directions are
  stated rather than assumed.</p>
  <ul class="dirs">
    <li><span class="who">Pictorial</span><span class="what">Drawn from the front, above and to the right. The faces you can see are the front, the top and the right side.</span></li>
    <li><span class="who">Front</span><span class="what">Observer in front, looking towards the back. The part's right is the view's right; up is up.</span></li>
    <li><span class="who">Top</span><span class="what">Observer above, looking down. The part's right is the view's right, and the front of the part is at the <b>bottom</b> of the view.</span></li>
    <li><span class="who">Right side</span><span class="what">Observer at the right, looking left. The front of the part is at the <b>left</b> of the view; up is up.</span></li>
  </ul>
  <p><b>Sheet layout is not under review.</b> The views sit side by side and labelled on purpose.
  Whether they belong above, below or beside one another is first- versus third-angle placement,
  which the app handles separately and teaches as a difference rather than a right answer.</p>
</section>

<section class="panel">
  <h2>What to check, in this order</h2>
  <ol class="steps">
    <li><p><b>Handedness.</b> Does every feature sit on the same side as it does in the pictorial? A view mirrored left-to-right is the specific failure this sheet exists to catch — it survives every automated check we have, because a mirrored drawing is perfectly self-consistent.</p></li>
    <li><p><b>Line types.</b> Visible edges solid, hidden edges dashed, hole axes as a red chain line.</p></li>
    <li><p><b>Completeness.</b> Any edge missing, and any edge drawn that should not be there.</p></li>
    <li><p><b>Sizes.</b> One grid square is 10&nbsp;mm. Count them against the written description of the part.</p></li>
  </ol>
  <ul class="legend">
    <li>${legendSwatch("", "#111")} Visible edge</li>
    <li>${legendSwatch(' stroke-dasharray="6 4"', "#111")} Hidden edge</li>
    <li>${legendSwatch(' stroke-dasharray="12 3 3 3"', "#b00")} Centre line</li>
  </ul>
  <p>Reply with a pass or fail per part and a note on anything wrong — a sentence is plenty,
  a marked-up screenshot is better. A fail is a useful result: it means the generator is caught
  before a single student sees it.</p>
</section>`;
}

function main(): void {
  const sections = GOLDEN_PARTS.map((part) => {
    const v = generateViews(part.solid);
    return `<article class="part">
  <div class="titleblock">
    <h3>${part.id}</h3>
    <span class="status ${part.status}">${part.status}</span>
  </div>
  <div class="part-body">
    <p class="desc">${ticks(part.description)}</p>
    <p class="src"><b>Source:</b> ${ticks(part.source)}</p>
    <div class="views">
    ${renderIsometric(isometricView(part.solid), "Pictorial (the prompt)")}
    ${renderView(v.front, "Front")}
    ${renderView(v.top, "Top")}
    ${renderView(v.side, "Right side")}
    </div>
  </div>
</article>`;
  }).join("\n");

  const head = `<title>Orthodrill Golden Set</title>
${FONTS}
${STYLE}`;
  const body = `<div class="sheet">
${prelude()}
${sections}
</div>`;

  writeFileSync("verification-sheet.html", `<!doctype html>\n<meta charset="utf-8">\n${head}\n${body}\n`);
  writeFileSync("verification-sheet.artifact.html", `${head}\n${body}\n`);
  console.log("Wrote verification-sheet.html and verification-sheet.artifact.html");
}

main();
