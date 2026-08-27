import { test } from "node:test";
import assert from "node:assert/strict";
import {
  quadrantOf, occupiedQuadrants, emptyQuadrants, mitreLineEndpoints, mitreLine,
} from "./quadrants.ts";
import type { Primitive } from "../scoring/primitives.ts";

const grid = { width: 10, height: 10 }; // mid = (5, 5)

function seg(x1: number, y1: number, x2: number, y2: number, type: Primitive["type"] = "visible"): Primitive {
  return { kind: "segment", type, x1, y1, x2, y2 };
}
function circ(cx: number, cy: number, r = 1, type: Primitive["type"] = "visible"): Primitive {
  return { kind: "circle", type, cx, cy, r };
}

test("a point strictly inside a quadrant is assigned to it", () => {
  assert.equal(quadrantOf({ x: 2, y: 2 }, grid), "top-left");
  assert.equal(quadrantOf({ x: 8, y: 2 }, grid), "top-right");
  assert.equal(quadrantOf({ x: 2, y: 8 }, grid), "bottom-left");
  assert.equal(quadrantOf({ x: 8, y: 8 }, grid), "bottom-right");
});

test("boundary rule: the vertical midline belongs to the right half", () => {
  assert.equal(quadrantOf({ x: 5, y: 2 }, grid), "top-right");
  assert.equal(quadrantOf({ x: 5, y: 8 }, grid), "bottom-right");
});

test("boundary rule: the horizontal midline belongs to the bottom half", () => {
  assert.equal(quadrantOf({ x: 2, y: 5 }, grid), "bottom-left");
  assert.equal(quadrantOf({ x: 8, y: 5 }, grid), "bottom-right");
});

test("boundary rule: the sheet's centre point is bottom-right", () => {
  assert.equal(quadrantOf({ x: 5, y: 5 }, grid), "bottom-right");
});

test("a realistic three-view drawing occupies three quadrants", () => {
  // Front view top-left, top view below it (bottom-left), side view to the
  // right of front (top-right). Bottom-right is left for the mitre line.
  const drawing: Primitive[] = [
    seg(1, 1, 4, 1), // front view, top-left
    seg(1, 6, 4, 6), // top view, bottom-left
    seg(6, 1, 9, 1), // side view, top-right
  ];
  const occupied = occupiedQuadrants(drawing, grid);
  assert.deepEqual(
    [...occupied].sort(),
    ["bottom-left", "top-left", "top-right"],
  );
  assert.deepEqual(emptyQuadrants(drawing, grid), ["bottom-right"]);
});

test("a circle is attributed by its centre", () => {
  const drawing: Primitive[] = [circ(2, 2, 1)];
  assert.deepEqual([...occupiedQuadrants(drawing, grid)], ["top-left"]);
});

test("a segment straddling a boundary is attributed by its midpoint", () => {
  // Midpoint (5, 2) sits on the vertical midline -> right half by the rule above.
  const drawing: Primitive[] = [seg(1, 2, 9, 2)];
  assert.deepEqual([...occupiedQuadrants(drawing, grid)], ["top-right"]);
});

test("construction primitives are ignored when deciding occupancy", () => {
  const views: Primitive[] = [
    seg(1, 1, 4, 1), // top-left
    seg(1, 6, 4, 6), // bottom-left
    seg(6, 1, 9, 1), // top-right
  ];
  // A corner-to-corner construction line crosses all four quadrants and its
  // midpoint lands exactly on the sheet's centre (bottom-right, by the rule
  // above) -- which, unignored, would occupy the one quadrant this test
  // depends on staying empty.
  const withConstruction = [...views, seg(0, 0, 10, 10, "construction")];
  assert.deepEqual(emptyQuadrants(views, grid), ["bottom-right"]);
  assert.deepEqual(emptyQuadrants(withConstruction, grid), ["bottom-right"]);
});

test("mitre line endpoints for each of the four possible empty quadrants, square grid", () => {
  assert.deepEqual(mitreLineEndpoints("top-left", grid), { x1: 5, y1: 5, x2: 0, y2: 0 });
  assert.deepEqual(mitreLineEndpoints("top-right", grid), { x1: 5, y1: 5, x2: 10, y2: 0 });
  assert.deepEqual(mitreLineEndpoints("bottom-left", grid), { x1: 5, y1: 5, x2: 0, y2: 10 });
  assert.deepEqual(mitreLineEndpoints("bottom-right", grid), { x1: 5, y1: 5, x2: 10, y2: 10 });
});

test("mitre line stays a true 45 degrees on a non-square grid, stopping at the nearer edge", () => {
  const wide = { width: 20, height: 10 }; // mid = (10, 5); shorter half-extent = 5
  assert.deepEqual(mitreLineEndpoints("top-left", wide), { x1: 10, y1: 5, x2: 5, y2: 0 });
  assert.deepEqual(mitreLineEndpoints("bottom-right", wide), { x1: 10, y1: 5, x2: 15, y2: 10 });
});

test("mitre line is drawn in the single empty quadrant of a real drawing", () => {
  const drawing: Primitive[] = [
    seg(1, 1, 4, 1), // top-left
    seg(1, 6, 4, 6), // bottom-left
    seg(6, 1, 9, 1), // top-right
  ];
  assert.deepEqual(mitreLine(drawing, grid), { x1: 5, y1: 5, x2: 10, y2: 10 });
});

test("no mitre line when zero quadrants are empty", () => {
  const drawing: Primitive[] = [
    seg(1, 1, 2, 1), seg(6, 1, 7, 1), seg(1, 6, 2, 6), seg(6, 6, 7, 6),
  ];
  assert.equal(emptyQuadrants(drawing, grid).length, 0);
  assert.equal(mitreLine(drawing, grid), null);
});

test("no mitre line when two or more quadrants are empty", () => {
  const oneView: Primitive[] = [seg(1, 1, 2, 1)];
  assert.equal(emptyQuadrants(oneView, grid).length, 3);
  assert.equal(mitreLine(oneView, grid), null);

  assert.equal(emptyQuadrants([], grid).length, 4);
  assert.equal(mitreLine([], grid), null);
});
