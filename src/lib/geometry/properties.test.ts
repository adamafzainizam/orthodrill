import { test } from "node:test";
import assert from "node:assert/strict";
import { generateViews } from "./views.ts";
import { block, subtractBox, subtractCylinder, type Solid } from "./solid.ts";
import { boundingBox, type Primitive, type Segment } from "../scoring/primitives.ts";

/** A small deterministic corpus. Deterministic so a failure is reproducible. */
function corpus(): Solid[] {
  const out: Solid[] = [block(6, 4, 2), block(4, 4, 4), block(8, 2, 6)];
  for (const [x, y, z] of [[0, 0, 2], [2, 0, 2], [0, 2, 0]]) {
    out.push(subtractBox(block(6, 6, 4), { x, y, z, w: 2, d: 2, h: 2 }));
  }
  out.push(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2));
  out.push(subtractCylinder(block(8, 8, 8), "y", 4, 4, 2));
  out.push(subtractCylinder(block(8, 8, 8), "x", 4, 4, 2));
  return out;
}

test("every projected primitive lies within its view's bounding box", () => {
  for (const s of corpus()) {
    const views = generateViews(s);
    for (const [name, view] of Object.entries(views)) {
      const b = boundingBox(view);
      if (b === null) continue;
      for (const p of view as Primitive[]) {
        if (p.kind === "circle") {
          assert.ok(p.cx - p.r >= b.minX && p.cx + p.r <= b.maxX, `${name}: circle escapes x`);
          assert.ok(p.cy - p.r >= b.minY && p.cy + p.r <= b.maxY, `${name}: circle escapes y`);
        } else {
          assert.ok(p.x1 >= b.minX && p.x2 >= b.minX, `${name}: segment escapes x`);
          assert.ok(p.y1 >= b.minY && p.y2 >= b.minY, `${name}: segment escapes y`);
        }
      }
    }
  }
});

test("a solid with no internal features produces no hidden lines", () => {
  for (const s of [block(6, 4, 2), block(4, 4, 4), block(8, 2, 6)]) {
    const views = generateViews(s);
    for (const [name, view] of Object.entries(views)) {
      const hiddenCount = (view as Primitive[])
        .filter((p) => p.type === "hidden").length;
      assert.equal(hiddenCount, 0, `${name} of a plain block must have no hidden lines`);
    }
  }
});

test("a through-hole yields exactly one circle and two bore lines", () => {
  for (const [axis, circleView] of [["z", "top"], ["y", "front"], ["x", "side"]] as const) {
    const v = generateViews(subtractCylinder(block(8, 8, 8), axis, 4, 4, 2));
    for (const name of ["front", "top", "side"] as const) {
      const circles = v[name].filter((p) => p.kind === "circle").length;
      assert.equal(circles, name === circleView ? 1 : 0,
        `${axis}-hole: ${name} circle count`);
      if (name === circleView) continue;
      const bore = v[name].filter(
        (p): p is Segment => p.kind === "segment" && p.type !== "centre",
      );
      // Two bore lines, plus the four outline edges of the block.
      assert.ok(bore.length >= 2, `${axis}-hole: ${name} needs two bore lines`);
    }
  }
});

test("every circular feature carries centre lines in all three views", () => {
  for (const axis of ["x", "y", "z"] as const) {
    const v = generateViews(subtractCylinder(block(8, 8, 8), axis, 4, 4, 2));
    for (const name of ["front", "top", "side"] as const) {
      const centres = v[name].filter((p) => p.type === "centre").length;
      assert.ok(centres >= 1, `${axis}-hole: ${name} must carry a centre line`);
    }
  }
});

test("a solid symmetric left-to-right gives a symmetric front view", () => {
  // A centred hole in a centred block. NOTE: this cannot detect a MIRRORED
  // generator, which is precisely why golden fixtures exist. See design §8.
  const v = generateViews(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2));
  const b = boundingBox(v.front)!;
  const mirrored = v.front.map((p) => p.kind === "circle"
    ? { ...p, cx: b.maxX - (p.cx - b.minX) }
    : { ...p, x1: b.maxX - (p.x2 - b.minX), x2: b.maxX - (p.x1 - b.minX) });
  const key = (ps: Primitive[]) => ps
    .map((p) => p.kind === "circle"
      ? `c:${p.cx},${p.cy},${p.r},${p.type}`
      : `s:${p.x1},${p.y1},${p.x2},${p.y2},${p.type}`)
    .sort().join("|");
  assert.equal(key(mirrored as Primitive[]), key(v.front));
});

test("generating the same solid twice gives identical output", () => {
  for (const s of corpus()) {
    assert.deepEqual(generateViews(s), generateViews(s));
  }
});
