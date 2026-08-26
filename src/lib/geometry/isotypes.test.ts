import { test } from "node:test";
import assert from "node:assert/strict";
import type { IsoLine, IsoEllipse, IsoFace, IsoPrimitive } from "./isotypes.ts";
import type { Primitive, Segment } from "../scoring/primitives.ts";

// The isometric is the PUBLIC half of a drill; the scorer's primitives are the
// PRIVATE half (the answer key) and must never reach the browser. These two
// assertions are the compiler-enforced part of that boundary. The actual
// directives below check that the types are genuinely incompatible: if they
// ever become assignable, typecheck will fail with "Unused '@ts-expect-error'".
test("the scorer's Segment is not assignable to an IsoPrimitive", () => {
  const seg: Segment = { kind: "segment", type: "visible", x1: 0, y1: 0, x2: 1, y2: 0 };
  // @ts-expect-error a key primitive must never satisfy the public payload type
  const leaked: IsoPrimitive = seg;
  assert.ok(leaked);
});

test("an IsoLine is not assignable to the scorer's Primitive", () => {
  const line: IsoLine = { kind: "iso-line", x1: 0, y1: 0, x2: 1, y2: 0 };
  // @ts-expect-error an isometric must never be comparable as a drawn view
  const scored: Primitive = line;
  assert.ok(scored);
});

test("the vocabulary carries the fields the renderer needs", () => {
  const line: IsoLine = { kind: "iso-line", x1: 0, y1: 1, x2: 2, y2: 3 };
  const ell: IsoEllipse = { kind: "iso-ellipse", cx: 1, cy: 2, rx: 3, ry: 4, rotation: 60 };
  assert.equal(line.kind, "iso-line");
  assert.equal(ell.kind, "iso-ellipse");
  assert.equal(ell.rotation, 60);
  const face: IsoFace = { kind: "iso-face", points: [[0, 0], [1, 0], [1, 1]] };
  assert.equal(face.kind, "iso-face");
  assert.equal(face.points.length, 3);
});
