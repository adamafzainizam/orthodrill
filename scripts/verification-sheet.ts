/**
 * Render the golden parts to a standalone HTML sheet for human review.
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

const SCALE = 12;
const PAD = 16;

function renderView(ps: Primitive[], label: string): string {
  const b = boundingBox(ps);
  if (b === null) return `<div class="view"><em>${label}: empty</em></div>`;
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

  return `<div class="view">
    <h4>${label}</h4>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${body}
    </svg>
  </div>`;
}

function main(): void {
  const sections = GOLDEN_PARTS.map((part) => {
    const v = generateViews(part.solid);
    return `<section>
  <h2>${part.id} <span class="status ${part.status}">${part.status}</span></h2>
  <p>${part.description}</p>
  <p class="src"><strong>Source:</strong> ${part.source}</p>
  <div class="views">
    ${renderView(v.front, "Front")}
    ${renderView(v.top, "Top")}
    ${renderView(v.side, "Right side")}
  </div>
</section>`;
  }).join("\n");

  const html = `<!doctype html>
<meta charset="utf-8">
<title>Generator verification sheet</title>
<style>
  body { font: 15px/1.5 system-ui, sans-serif; margin: 2rem auto; max-width: 60rem; color: #111; }
  section { border-top: 1px solid #ddd; padding: 1.5rem 0; }
  .views { display: flex; gap: 2rem; flex-wrap: wrap; align-items: flex-start; }
  .view h4 { margin: 0 0 .5rem; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: #666; }
  svg { border: 1px solid #eee; background: #fff; }
  .status { font-size: 12px; padding: .2em .6em; border-radius: 3px; vertical-align: middle; }
  .UNVERIFIED { background: #fee; color: #900; }
  .VERIFIED { background: #efe; color: #060; }
  .src { color: #555; font-size: 13px; }
  .legend span { margin-right: 1.5rem; }
</style>
<h1>Generator verification sheet</h1>
<p class="legend">
  <span>solid = visible edge</span>
  <span>dashed = hidden edge</span>
  <span style="color:#b00">red chain = centre line</span>
</p>
<p><strong>Reviewer:</strong> please confirm each view matches the part described,
paying particular attention to which SIDE features appear on. A mirrored view is
the failure this sheet exists to catch.</p>
${sections}`;

  writeFileSync("verification-sheet.html", html);
  console.log("Wrote verification-sheet.html");
}

main();
