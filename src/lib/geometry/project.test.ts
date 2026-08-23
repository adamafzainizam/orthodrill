import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEdges } from "./project.ts";
import { buildOccupancy } from "./occupancy.ts";
import { VIEW_SPECS } from "./viewspec.ts";
import { block, subtractBox } from "./solid.ts";

const visible = (es: { hidden: boolean }[]) => es.filter((e) => !e.hidden);
const hidden = (es: { hidden: boolean }[]) => es.filter((e) => e.hidden);

test("a plain cube's front view is its outline and nothing else", () => {
  const es = extractEdges(buildOccupancy(block(2, 2, 2)), VIEW_SPECS.front);
  // A 2x2 silhouette: 2 unit edges on each of 4 sides.
  assert.equal(visible(es).length, 8);
  assert.equal(hidden(es).length, 0);
});

test("a solid block has no hidden lines in any view", () => {
  for (const spec of Object.values(VIEW_SPECS)) {
    const es = extractEdges(buildOccupancy(block(3, 2, 2)), spec);
    assert.equal(hidden(es).length, 0, `${spec.name} should have no hidden edges`);
  }
});

// A step: the near half is short, the far half is full height. Looking at the
// front, the top face of the near half is seen edge-on as a visible line.
test("a step produces a visible internal edge in the front view", () => {
  const stepped = subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 2, w: 4, d: 2, h: 2 });
  const es = extractEdges(buildOccupancy(stepped), VIEW_SPECS.front);
  // The outline is still the full 4x4 square because the far half is full height.
  // The internal edge sits on the v boundary corresponding to model z = 2.
  const internal = visible(es).filter((e) => e.along === "u" && e.v === 2);
  assert.equal(internal.length, 4, "a visible edge spanning the full width at z=2");
});

// The same step seen from the side: the cut face is now the outline, not an
// internal line, so nothing is hidden.
test("a step creates no hidden lines from the side", () => {
  const stepped = subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 2, w: 4, d: 2, h: 2 });
  const es = extractEdges(buildOccupancy(stepped), VIEW_SPECS.side);
  assert.equal(hidden(es).length, 0);
});

// The canonical hidden-line case: a rectangular hole through the block in y.
// From the front you see through it, so its outline is visible. From the side
// the same faces are buried in material, so they are dashed.
test("a through opening is visible head-on and hidden from the side", () => {
  const holed = subtractBox(block(4, 4, 4), { x: 1, y: 0, z: 1, w: 2, d: 4, h: 2 });

  const front = extractEdges(buildOccupancy(holed), VIEW_SPECS.front);
  assert.equal(hidden(front).length, 0, "you can see through the opening");
  assert.ok(visible(front).length > 8, "the opening adds edges beyond the outline");

  const side = extractEdges(buildOccupancy(holed), VIEW_SPECS.side);
  assert.ok(hidden(side).length > 0, "the opening's faces are buried from the side");
});

test("an internal void produces only hidden edges beyond the outline", () => {
  // A cavity fully enclosed on all sides.
  const cavity = subtractBox(block(5, 5, 5), { x: 2, y: 2, z: 2, w: 1, d: 1, h: 1 });
  const front = extractEdges(buildOccupancy(cavity), VIEW_SPECS.front);
  assert.equal(hidden(front).length, 4, "the cavity outlines as four hidden unit edges");
  assert.equal(visible(front).length, 20, "the 5x5 silhouette, unchanged");
});

test("an empty solid produces no edges", () => {
  const gone = subtractBox(block(2, 2, 2), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 2 });
  assert.deepEqual(extractEdges(buildOccupancy(gone), VIEW_SPECS.front), []);
});
