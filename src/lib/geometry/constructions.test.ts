import { test } from "node:test";
import assert from "node:assert/strict";
import { constructionKey, type ConstructionSpec } from "./constructions.ts";

const ints = (ps: ReturnType<typeof constructionKey>) =>
  ps.every((p) => p.kind === "segment"
    && [p.x1, p.y1, p.x2, p.y2].every(Number.isInteger));

test("EVERY key this module produces lands on integer grid points", () => {
  // The property the whole topic rests on. `validate.ts` rejects a non-integer
  // primitive outright, so an off-grid key would make the correct answer
  // literally undrawable — the failure the §1.1 lattice check exists to catch.
  const specs: ConstructionSpec[] = [
    { shape: "perp-bisector", x1: 4, y1: 20, x2: 16, y2: 20, reach: 5 },
    { shape: "perp-bisector", x1: 6, y1: 26, x2: 14, y2: 18, reach: 4 },
    { shape: "equal-division", x: 6, y: 24, length: 12, parts: 4, tick: 2 },
    { shape: "perp-from-point", x: 4, y: 28, length: 16, px: 12, py: 14 },
    { shape: "parallel-through-point", x: 4, y: 26, length: 14, slope: 0, px: 6, py: 16 },
    { shape: "parallel-through-point", x: 4, y: 30, length: 10, slope: -1, px: 8, py: 20 },
    { shape: "square-on-side", x: 8, y: 30, side: 9 },
    { shape: "bisect-right-angle", x: 8, y: 30, arm: 10 },
  ];
  let checked = 0;
  for (const s of specs) {
    const key = constructionKey(s);
    assert.ok(key.length > 0, `${s.shape} produced nothing`);
    assert.ok(ints(key), `${s.shape} produced an off-grid coordinate`);
    checked++;
  }
  assert.equal(checked, specs.length);
});

test("a perpendicular bisector crosses the given line at its midpoint", () => {
  const key = constructionKey({ shape: "perp-bisector", x1: 4, y1: 20, x2: 16, y2: 20, reach: 5 });
  assert.equal(key.length, 2);
  const bis = key[1];
  assert.equal(bis.kind, "segment");
  if (bis.kind !== "segment") return;
  assert.equal(bis.x1, 10, "the bisector must sit at x = (4+16)/2");
  assert.equal(bis.x2, 10);
  assert.deepEqual([bis.y1, bis.y2].sort((a, b) => a - b), [15, 25]);
});

test("a 45-degree segment's bisector runs along the OTHER diagonal", () => {
  const key = constructionKey({ shape: "perp-bisector", x1: 6, y1: 26, x2: 14, y2: 18, reach: 4 });
  const bis = key[1];
  if (bis.kind !== "segment") throw new Error("expected a segment");
  // Midpoint (10, 22); the given segment runs (+1,-1), so the perpendicular
  // runs (+1,+1). Derived from the geometry, not read off the implementation.
  assert.equal((bis.x1 + bis.x2) / 2, 10);
  assert.equal((bis.y1 + bis.y2) / 2, 22);
  assert.equal(Math.abs(bis.x2 - bis.x1), Math.abs(bis.y2 - bis.y1), "not a 45-degree line");
  assert.equal(Math.sign(bis.x2 - bis.x1), Math.sign(bis.y2 - bis.y1), "wrong diagonal — this is the MIRROR of the answer");
});

test("POSITIVE CONTROL: an ODD span is refused, not silently rounded", () => {
  // An odd span puts the midpoint on a half-unit, which validate.ts rejects.
  // Rounding it would make the app mark a correct construction wrong.
  assert.throws(
    () => constructionKey({ shape: "perp-bisector", x1: 4, y1: 20, x2: 15, y2: 20, reach: 5 }),
    /EVEN/,
  );
});

test("POSITIVE CONTROL: a segment at a non-lattice angle is refused", () => {
  assert.throws(
    () => constructionKey({ shape: "perp-bisector", x1: 0, y1: 0, x2: 6, y2: 2, reach: 3 }),
    /lattice-exact/,
  );
});

test("equal division ticks every internal point and no end point", () => {
  const key = constructionKey({ shape: "equal-division", x: 6, y: 24, length: 12, parts: 4, tick: 2 });
  assert.equal(key.length, 1 + 3, "one line plus three internal ticks");
  const xs = key.slice(1).map((p) => (p.kind === "segment" ? p.x1 : NaN));
  assert.deepEqual(xs, [9, 12, 15]);
});

test("POSITIVE CONTROL: a division count that does not divide the length is refused", () => {
  assert.throws(
    () => constructionKey({ shape: "equal-division", x: 0, y: 0, length: 10, parts: 4, tick: 1 }),
    /does not divide/,
  );
});

test("a dropped perpendicular meets the line at the point's own x", () => {
  const key = constructionKey({ shape: "perp-from-point", x: 4, y: 28, length: 16, px: 12, py: 14 });
  const perp = key[1];
  if (perp.kind !== "segment") throw new Error("expected a segment");
  assert.equal(perp.x1, 12);
  assert.equal(perp.x2, 12);
  assert.equal(perp.y2, 28, "the foot must land ON the given line");
});

test("POSITIVE CONTROL: a foot outside the given line is refused", () => {
  assert.throws(
    () => constructionKey({ shape: "perp-from-point", x: 4, y: 28, length: 6, px: 20, py: 14 }),
    /outside/,
  );
});

test("a parallel keeps the given slope and misses the given line", () => {
  const key = constructionKey({ shape: "parallel-through-point", x: 4, y: 30, length: 10, slope: -1, px: 8, py: 20 });
  const [given, par] = key;
  if (given.kind !== "segment" || par.kind !== "segment") throw new Error("expected segments");
  const slope = (s: typeof given) => (s.y2 - s.y1) / (s.x2 - s.x1);
  assert.equal(slope(par), slope(given));
  assert.notEqual(par.y1 - slope(par) * par.x1, given.y1 - slope(given) * given.x1, "the 'parallel' is the same line");
});

test("POSITIVE CONTROL: a point lying ON the given line is refused", () => {
  assert.throws(
    () => constructionKey({ shape: "parallel-through-point", x: 4, y: 20, length: 10, slope: 0, px: 6, py: 20 }),
    /ON the given line/,
  );
});

test("a square has four sides, all the same length, closing on itself", () => {
  const key = constructionKey({ shape: "square-on-side", x: 8, y: 30, side: 9 });
  assert.equal(key.length, 4);
  const lens = key.map((p) => (p.kind === "segment" ? Math.hypot(p.x2 - p.x1, p.y2 - p.y1) : NaN));
  assert.deepEqual(lens, [9, 9, 9, 9]);
  const first = key[0], last = key[3];
  if (first.kind !== "segment" || last.kind !== "segment") throw new Error("expected segments");
  assert.deepEqual([last.x2, last.y2], [first.x1, first.y1], "the square does not close");
});

test("a right angle's bisector runs at 45 degrees between its arms", () => {
  const key = constructionKey({ shape: "bisect-right-angle", x: 8, y: 30, arm: 10 });
  assert.equal(key.length, 3, "two arms and the bisector");
  const bis = key[2];
  if (bis.kind !== "segment") throw new Error("expected a segment");
  assert.equal(Math.abs(bis.x2 - bis.x1), Math.abs(bis.y2 - bis.y1));
  // Arms run +x and UP the screen (screen y increases downward), so the
  // bisector must go right and up: +x, -y. Getting this sign backwards is the
  // same failure class as a mirrored view — self-consistent and wrong.
  assert.ok(bis.x2 > bis.x1 && bis.y2 < bis.y1, "the bisector points away from the angle it bisects");
});
