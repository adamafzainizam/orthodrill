import { test } from "node:test";
import assert from "node:assert/strict";
import { viewsFigure, VIEW_GAP } from "./viewsheet.ts";
import { generateViews } from "./views.ts";
import { block, subtractBox } from "./solid.ts";
import { boundingBox, type Primitive } from "../scoring/primitives.ts";

// Asymmetric on both axes, so a mirrored or transposed layout cannot hide.
const PART = subtractBox(block(6, 4, 4), { x: 4, y: 0, z: 2, w: 2, d: 4, h: 2 }, "step");

/** Split a figure back into clusters, so a test can talk about "the top view". */
function clusters(ps: Primitive[]): Primitive[][] {
  const remaining = [...ps];
  const out: Primitive[][] = [];
  while (remaining.length > 0) {
    const group = [remaining.shift()!];
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = remaining.length - 1; i >= 0; i--) {
        const b = boundingBox([remaining[i]])!;
        const g = boundingBox(group)!;
        const near = b.minX <= g.maxX + 1 && b.maxX >= g.minX - 1
          && b.minY <= g.maxY + 1 && b.maxY >= g.minY - 1;
        if (near) { group.push(remaining.splice(i, 1)[0]); grew = true; }
      }
    }
    out.push(group);
  }
  return out;
}

test("a views figure holds all three views and nothing else", () => {
  const v = generateViews(PART);
  const figure = viewsFigure(PART, "first_angle");
  assert.equal(figure.length, v.front.length + v.top.length + v.side.length);
});

test("FIRST angle puts the top view BELOW the front and the side to its LEFT", () => {
  const figure = viewsFigure(PART, "first_angle");
  const groups = clusters(figure).sort((a, b) => boundingBox(a)!.minX - boundingBox(b)!.minX);
  assert.equal(groups.length, 3, "the three views did not separate — the gap is too small");
  const boxes = groups.map((g) => boundingBox(g)!);
  // Leftmost is the side view; the other two share an x range.
  const [side, ...rest] = boxes;
  const front = rest.find((b) => b.minY === Math.min(...rest.map((r) => r.minY)))!;
  const top = rest.find((b) => b !== front)!;
  assert.ok(side.maxX < front.minX, "side view is not to the LEFT of the front");
  assert.ok(top.minY > front.maxY, "top view is not BELOW the front");
});

test("THIRD angle puts the top view ABOVE the front and the side to its RIGHT", () => {
  const figure = viewsFigure(PART, "third_angle");
  const groups = clusters(figure).sort((a, b) => boundingBox(a)!.minX - boundingBox(b)!.minX);
  assert.equal(groups.length, 3);
  const boxes = groups.map((g) => boundingBox(g)!);
  const side = boxes[boxes.length - 1];
  const rest = boxes.slice(0, -1);
  const front = rest.find((b) => b.maxY === Math.max(...rest.map((r) => r.maxY)))!;
  const top = rest.find((b) => b !== front)!;
  assert.ok(side.minX > front.maxX, "side view is not to the RIGHT of the front");
  assert.ok(top.maxY < front.minY, "top view is not ABOVE the front");
});

test("ALIGNMENT IS THE CONTENT: front and top share an x range, front and side a y range", () => {
  // A figure that gets this wrong teaches the wrong thing, which is why it is
  // derived from bounding boxes rather than from a magic view size.
  for (const convention of ["first_angle", "third_angle"] as const) {
    const groups = clusters(viewsFigure(PART, convention)).map((g) => boundingBox(g)!);
    assert.equal(groups.length, 3, `${convention}: views did not separate`);
    // The two views sharing a vertical band are front and top.
    const byX = [...groups].sort((a, b) => a.minX - b.minX);
    const stacked = byX.filter((b) => b.minX === byX[0].minX || b.minX === byX[2].minX);
    // Find the pair with identical x extents — front and top.
    let found = false;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        if (groups[i].minX === groups[j].minX && groups[i].maxX === groups[j].maxX) found = true;
      }
    assert.ok(found, `${convention}: no two views share an x range — front and top must align`);
    let sharedY = false;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        if (groups[i].minY === groups[j].minY && groups[i].maxY === groups[j].maxY) sharedY = true;
      }
    assert.ok(sharedY, `${convention}: no two views share a y range — front and side must align`);
    assert.ok(stacked.length >= 2);
  }
});

test("the two conventions produce DIFFERENT figures", () => {
  // Positive control: if placement were ignored, both would be identical and
  // every assertion above would still pass on a constant layout.
  const a = JSON.stringify(viewsFigure(PART, "first_angle"));
  const b = JSON.stringify(viewsFigure(PART, "third_angle"));
  assert.notEqual(a, b);
});

test("the gap between views is at least VIEW_GAP, so they read as three drawings", () => {
  const groups = clusters(viewsFigure(PART, "third_angle")).map((g) => boundingBox(g)!);
  const xs = [...groups].sort((p, q) => p.minX - q.minX);
  const gap = xs[xs.length - 1].minX - xs[0].maxX;
  assert.ok(gap >= VIEW_GAP, `views are only ${gap} apart`);
});
