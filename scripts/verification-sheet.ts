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
import { isometricView } from "../src/lib/geometry/isometric.ts";
import type { IsoPrimitive } from "../src/lib/geometry/isotypes.ts";

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

function renderIsometric(ps: IsoPrimitive[], label: string): string {
  if (ps.length === 0) return `<div class="view"><em>${label}: empty</em></div>`;
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
    ${renderIsometric(isometricView(part.solid), "Isometric (prompt)")}
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
