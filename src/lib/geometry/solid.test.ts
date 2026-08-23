import { test } from "node:test";
import assert from "node:assert/strict";
import { block, subtractBox, subtractCylinder } from "./solid.ts";

test("a block records its base dimensions and has no operations", () => {
  const s = block(6, 4, 2);
  assert.deepEqual(s.base, { w: 6, d: 4, h: 2 });
  assert.deepEqual(s.ops, []);
});

test("subtractBox appends an operation", () => {
  const s = subtractBox(block(6, 4, 2), { x: 0, y: 0, z: 1, w: 2, d: 2, h: 1 });
  assert.equal(s.ops.length, 1);
  assert.equal(s.ops[0].kind, "box");
});

// Immutability matters: fixtures are shared between tests, and a builder that
// mutated its input would let one test corrupt another.
test("builders do not mutate their input", () => {
  const base = block(6, 4, 2);
  subtractBox(base, { x: 0, y: 0, z: 1, w: 2, d: 2, h: 1 });
  assert.equal(base.ops.length, 0);
});

test("subtractCylinder records axis, centre and radius", () => {
  const s = subtractCylinder(block(6, 4, 2), "z", 3, 2, 1);
  assert.equal(s.ops.length, 1);
  const op = s.ops[0];
  assert.equal(op.kind, "cylinder");
  if (op.kind !== "cylinder") return;
  assert.equal(op.axis, "z");
  assert.equal(op.u, 3);
  assert.equal(op.v, 2);
  assert.equal(op.r, 1);
});

test("operations keep their order", () => {
  const s = subtractCylinder(
    subtractBox(block(6, 4, 2), { x: 0, y: 0, z: 1, w: 2, d: 2, h: 1 }),
    "z", 3, 2, 1,
  );
  assert.deepEqual(s.ops.map((o) => o.kind), ["box", "cylinder"]);
});

test("a name is optional metadata carried on the operation", () => {
  const s = subtractBox(block(6, 4, 2), { x: 0, y: 0, z: 1, w: 2, d: 2, h: 1 }, "step");
  assert.equal(s.ops[0].name, "step");
});

test("a block with a non-positive dimension is rejected", () => {
  assert.throws(() => block(0, 4, 2), /positive/);
  assert.throws(() => block(6, -1, 2), /positive/);
});

test("a cylinder with a non-positive radius is rejected", () => {
  assert.throws(() => subtractCylinder(block(6, 4, 2), "z", 3, 2, 0), /positive/);
});

test("non-integer coordinates are rejected", () => {
  assert.throws(() => block(6.5, 4, 2), /integer/);
  assert.throws(() => subtractCylinder(block(6, 4, 2), "z", 3.5, 2, 1), /integer/);
});
