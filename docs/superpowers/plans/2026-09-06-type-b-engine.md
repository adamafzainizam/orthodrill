# Type B Reverse Drill — Wave 1 (Engine and Server) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the engine and server for the Type B drill — the student is shown three orthographic views and builds the solid — with no UI.

**Architecture:** The four viewpoints come from rotating the OCCUPANCY a quarter turn about z, never from a second projection basis, so `isoproject.ts` is not edited (spec §3). The answer key is a set of occupied unit cells; scoring is a translation-invariant set diff, grouped into 6-connected regions and described in prose that names a view only when that view genuinely differs.

**Tech Stack:** TypeScript, Next 16 App Router, `node --test --experimental-strip-types`. No new dependencies.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-09-06-type-b-engine-design.md`. Read §3, §4 and §5 before Task 1.
- **Branch:** `feat/type-b-engine`, already created with the spec committed. Never push to `main` (AGENTS.md §2.5).
- **Commits carry the builder's name only.** No `Co-Authored-By` trailer, no AI attribution (AGENTS.md §2.7).
- **`src/lib/` is PURE and I/O-free.** No framework imports, no filesystem, no network (AGENTS.md §2.3).
- **Type B is BOX-ONLY.** `buildOccupancy` drops cylinders, so a bored key would silently omit the bore (spec §4).
- **Relative imports in test files carry the `.ts` extension** — Node's type stripping requires it and `tsconfig` sets `allowImportingTsExtensions` (AGENTS.md §6).
- **Run `npm test` after every task** and confirm the reported test COUNT rose. A test that has never been seen to fail has not been shown to run (AGENTS.md §6).
- **Every new guard must be confirmed to FAIL on a deliberately broken input before it is trusted.**
- Verification command for every task: `npm test && npm run lint && npm run typecheck`.

---

### Task 1: The quarter-turn occupancy adapter

**Files:**
- Create: `src/lib/geometry/rotate3.ts`
- Test: `src/lib/geometry/rotate3.test.ts`

**Interfaces:**
- Consumes: `Occupancy` from `./occupancy.ts` — `{ w: number; d: number; h: number; isSolid(i, j, k): boolean }`.
- Produces:
  - `type Cell = readonly [number, number, number]`
  - `type QuarterTurn = 0 | 1 | 2 | 3`
  - `rotateCell(c: Cell, q: QuarterTurn, w: number, d: number): Cell`
  - `unrotateCell(c: Cell, q: QuarterTurn, w: number, d: number): Cell`
  - `rotatedOccupancy(o: Occupancy, q: QuarterTurn): Occupancy`

**THE ROTATION CONVENTION, fixed here so test and implementation cannot drift.**
`w` and `d` are always the ORIGINAL grid's width and depth, for both functions.

| `q` | `rotateCell([x, y, z])` |
|---|---|
| 0 | `[x, y, z]` |
| 1 | `[d - 1 - y, x, z]` |
| 2 | `[w - 1 - x, d - 1 - y, z]` |
| 3 | `[y, w - 1 - x, z]` |

The rotated grid's dimensions are `(d, w, h)` for odd `q` and `(w, d, h)` for even `q`.

- [ ] **Step 1: Write the failing test file**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { rotateCell, unrotateCell, rotatedOccupancy, type Cell, type QuarterTurn } from "./rotate3.ts";
import { buildOccupancy } from "./occupancy.ts";
import { block, subtractBox } from "./solid.ts";

const TURNS: QuarterTurn[] = [0, 1, 2, 3];

/** An L-shaped, deliberately asymmetric part. */
const L = subtractBox(block(4, 3, 2), { x: 2, y: 0, z: 1, w: 2, d: 3, h: 1 }, "step");

function cellsOf(o: ReturnType<typeof buildOccupancy>): Cell[] {
  const out: Cell[] = [];
  for (let k = 0; k < o.h; k++) for (let j = 0; j < o.d; j++) for (let i = 0; i < o.w; i++)
    if (o.isSolid(i, j, k)) out.push([i, j, k]);
  return out;
}
const key = (c: Cell) => c.join(",");
const setOf = (o: { w: number; d: number; h: number; isSolid(i: number, j: number, k: number): boolean }) => {
  const s = new Set<string>();
  for (let k = 0; k < o.h; k++) for (let j = 0; j < o.d; j++) for (let i = 0; i < o.w; i++)
    if (o.isSolid(i, j, k)) s.add(`${i},${j},${k}`);
  return s;
};

test("rotateCell and unrotateCell round-trip for every cell and every turn", () => {
  const o = buildOccupancy(L);
  let checked = 0;
  for (const q of TURNS) {
    for (const c of cellsOf(o)) {
      const there = rotateCell(c, q, o.w, o.d);
      const back = unrotateCell(there, q, o.w, o.d);
      assert.equal(key(back), key(c), `q=${q} failed to round-trip ${key(c)} (via ${key(there)})`);
      checked++;
    }
  }
  assert.ok(checked > 0, "no cells checked — this test is inert");
});

test("a rotated cell stays inside the rotated grid's bounds", () => {
  const o = buildOccupancy(L);
  for (const q of TURNS) {
    const rw = q % 2 === 1 ? o.d : o.w;
    const rd = q % 2 === 1 ? o.w : o.d;
    for (const [x, y, z] of cellsOf(o)) {
      const [i, j, k] = rotateCell([x, y, z], q, o.w, o.d);
      assert.ok(i >= 0 && i < rw, `q=${q}: i=${i} outside 0..${rw - 1}`);
      assert.ok(j >= 0 && j < rd, `q=${q}: j=${j} outside 0..${rd - 1}`);
      assert.equal(k, z, "a turn about z must not move z");
    }
  }
});

test("rotatedOccupancy at q equals applying the q=1 adapter q times", () => {
  const o = buildOccupancy(L);
  for (const q of TURNS) {
    let stepwise = o;
    for (let n = 0; n < q; n++) stepwise = rotatedOccupancy(stepwise, 1);
    const direct = rotatedOccupancy(o, q);
    assert.equal(direct.w, stepwise.w, `q=${q} width disagrees`);
    assert.equal(direct.d, stepwise.d, `q=${q} depth disagrees`);
    assert.equal(direct.h, stepwise.h, `q=${q} height disagrees`);
    assert.deepEqual(setOf(direct), setOf(stepwise), `q=${q} occupancy disagrees with stepwise rotation`);
  }
});

test("four quarter turns return the original occupancy", () => {
  const o = buildOccupancy(L);
  let r = o;
  for (let n = 0; n < 4; n++) r = rotatedOccupancy(r, 1);
  assert.equal(r.w, o.w);
  assert.equal(r.d, o.d);
  assert.deepEqual(setOf(r), setOf(o));
});

test("POSITIVE CONTROL: an asymmetric solid rotated once is NOT itself", () => {
  // Without this, every check above would pass on an adapter that returned its
  // input unchanged. AGENTS.md §6: a property test can pass while the property
  // is entirely absent from the code.
  const o = buildOccupancy(L);
  const r = rotatedOccupancy(o, 1);
  assert.notDeepEqual(setOf(r), setOf(o), "rotating an L by 90 degrees changed nothing — the adapter is a no-op");
});

test("the q=1 mapping is pinned by a hand-derived coordinate, not by the code", () => {
  // A 3-wide, 2-deep, 1-high grid with exactly one solid cell at the origin.
  // By the convention table: (x,y) -> (d-1-y, x), so (0,0) -> (2-1-0, 0) = (1,0).
  // Derived from the rule, never recomputed from the implementation — this is
  // the check that a mirrored adapter cannot survive.
  const oneCell = {
    w: 3, d: 2, h: 1,
    isSolid: (i: number, j: number, k: number) => i === 0 && j === 0 && k === 0,
  };
  const r = rotatedOccupancy(oneCell, 1);
  assert.equal(r.w, 2, "rotated width must be the original depth");
  assert.equal(r.d, 3, "rotated depth must be the original width");
  assert.equal(r.isSolid(1, 0, 0), true, "the cell must land at (1,0,0)");
  assert.deepEqual(setOf(r), new Set(["1,0,0"]), "exactly one cell, and it is at (1,0,0)");
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test 2>&1 | grep -A 3 'rotate3'`
Expected: FAIL — cannot find module `./rotate3.ts`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The four isometric viewpoints, as quarter turns of the OCCUPANCY.
 *
 * WHY ROTATE THE PART AND NOT THE CAMERA. The four top corners a student needs
 * to reach are (+-1, +-1, +1), which differ from isoproject.ts's fixed
 * (+1, -1, +1) by a quarter turn about z — and those four turns are exactly the
 * ones the integer lattice permits (decision log, 2026-08-29). Rotating here
 * means `project` is never given a second basis, and isoproject.ts's own
 * warning stands undisturbed: a wrong sign there yields a picture that is
 * perfectly self-consistent and perfectly MIRRORED. This module's errors, by
 * contrast, are caught by a round-trip identity and a composition check.
 *
 * `Occupancy` is an interface, not data, so a viewpoint is a WRAPPER and not a
 * copy: nothing is allocated per turn and `isoedges.ts` cannot tell the
 * difference. Its paint order, nearest-face crease ownership and fill-seal
 * contract therefore keep working untouched.
 *
 * THE BOUNDARY: a quarter turn moves a cylinder's axis — an x-bore becomes a
 * y-bore. Type B is box-only so nothing here needs to care, but a
 * four-viewpoint viewer of a BORED solid would have to rotate the solid's ops
 * too. Do not reach for this module for that without solving it.
 *
 * PURE. No I/O.
 */
import type { Occupancy } from "./occupancy.ts";

export type Cell = readonly [number, number, number];
export type QuarterTurn = 0 | 1 | 2 | 3;

/**
 * Rotate a cell about z. `w` and `d` are always the ORIGINAL grid's width and
 * depth, for this function and its inverse alike, so a caller never has to
 * track which way round the dimensions are at each step.
 */
export function rotateCell(c: Cell, q: QuarterTurn, w: number, d: number): Cell {
  const [x, y, z] = c;
  if (q === 0) return [x, y, z];
  if (q === 1) return [d - 1 - y, x, z];
  if (q === 2) return [w - 1 - x, d - 1 - y, z];
  return [y, w - 1 - x, z];
}

/** The exact inverse of `rotateCell` under the same `w` and `d`. */
export function unrotateCell(c: Cell, q: QuarterTurn, w: number, d: number): Cell {
  const [i, j, k] = c;
  if (q === 0) return [i, j, k];
  if (q === 1) return [j, d - 1 - i, k];
  if (q === 2) return [w - 1 - i, d - 1 - j, k];
  return [w - 1 - j, i, k];
}

/**
 * The same solid seen from one of the four top corners. A view over the
 * original, allocating nothing.
 */
export function rotatedOccupancy(o: Occupancy, q: QuarterTurn): Occupancy {
  if (q === 0) return o;
  const odd = q % 2 === 1;
  const w = odd ? o.d : o.w;
  const d = odd ? o.w : o.d;
  return {
    w, d, h: o.h,
    isSolid(i, j, k) {
      if (i < 0 || j < 0 || k < 0 || i >= w || j >= d || k >= o.h) return false;
      const [x, y, z] = unrotateCell([i, j, k], q, o.w, o.d);
      return o.isSolid(x, y, z);
    },
  };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, with the total test count risen by 6.

- [ ] **Step 5: Prove the positive control can actually fail**

Temporarily change `rotateCell`'s `q === 1` branch to `return [y, x, z]` (a transpose — a mirror, not a rotation). Run `npm test`. The hand-derived coordinate test and the round-trip must FAIL. Revert the change and confirm green again. **Do not skip this step**: it is the difference between a guard and decoration.

- [ ] **Step 6: Commit**

```bash
git add src/lib/geometry/rotate3.ts src/lib/geometry/rotate3.test.ts
git commit -m "feat(geometry): four isometric viewpoints as quarter turns of the occupancy"
```

---

### Task 2: Cell sets — the shape a student's solid arrives in

**Files:**
- Create: `src/lib/geometry/cells.ts`
- Test: `src/lib/geometry/cells.test.ts`

**Interfaces:**
- Consumes: `Cell` from `./rotate3.ts`; `Occupancy`, `buildOccupancy` from `./occupancy.ts`; `Solid` from `./solid.ts`.
- Produces:
  - `cellsOfOccupancy(o: Occupancy): Cell[]`
  - `cellsOfSolid(s: Solid): Cell[]`
  - `occupancyFromCells(cells: readonly Cell[], w: number, d: number, h: number): Occupancy`
  - `normaliseCells(cells: readonly Cell[]): Cell[]`
  - `cellKey(c: Cell): string`

**Ordering contract:** `cellsOfOccupancy` and `normaliseCells` both return cells sorted by `z`, then `y`, then `x`. Two equal sets therefore have `deepEqual` arrays, which is what lets the tests and the scorer compare without building a Set every time.

- [ ] **Step 1: Write the failing test file**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { cellsOfOccupancy, cellsOfSolid, occupancyFromCells, normaliseCells, cellKey } from "./cells.ts";
import { buildOccupancy } from "./occupancy.ts";
import { block, subtractBox } from "./solid.ts";
import type { Cell } from "./rotate3.ts";

test("cellsOfSolid returns every occupied cell of a plain block", () => {
  assert.equal(cellsOfSolid(block(2, 3, 4)).length, 24);
});

test("cellsOfSolid omits the cells a subtraction removed", () => {
  const s = subtractBox(block(4, 2, 2), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 1 }, "notch");
  assert.equal(cellsOfSolid(s).length, 16 - 4);
});

test("cells come back sorted by z, then y, then x", () => {
  const cells = cellsOfSolid(block(2, 2, 2));
  assert.deepEqual(cells, [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ]);
});

test("occupancyFromCells round-trips through cellsOfOccupancy", () => {
  const s = subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }, "step");
  const cells = cellsOfSolid(s);
  const o = occupancyFromCells(cells, 4, 3, 3);
  assert.deepEqual(cellsOfOccupancy(o), cells);
});

test("occupancyFromCells reports empty outside its bounds rather than throwing", () => {
  const o = occupancyFromCells([[0, 0, 0]], 1, 1, 1);
  assert.equal(o.isSolid(0, 0, 0), true);
  assert.equal(o.isSolid(-1, 0, 0), false);
  assert.equal(o.isSolid(0, 0, 5), false);
});

test("normaliseCells moves the bounding box to the origin", () => {
  const shifted: Cell[] = [[5, 7, 2], [6, 7, 2], [5, 8, 2]];
  assert.deepEqual(normaliseCells(shifted), [[0, 0, 0], [1, 0, 0], [0, 1, 0]]);
});

test("normaliseCells makes translation invisible — the whole point", () => {
  const a: Cell[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
  const b: Cell[] = [[10, 20, 30], [11, 20, 30], [10, 21, 30]];
  assert.deepEqual(normaliseCells(a), normaliseCells(b));
});

test("POSITIVE CONTROL: normaliseCells does NOT make a different shape equal", () => {
  // Normalising is a translation, not a scrub. If this ever passes, the
  // scorer would call two different parts identical.
  const a: Cell[] = [[0, 0, 0], [1, 0, 0]];
  const b: Cell[] = [[0, 0, 0], [0, 1, 0]];
  assert.notDeepEqual(normaliseCells(a), normaliseCells(b));
});

test("normaliseCells on an empty set returns an empty set", () => {
  assert.deepEqual(normaliseCells([]), []);
});

test("cellKey distinguishes cells that differ on any one axis", () => {
  assert.notEqual(cellKey([1, 0, 0]), cellKey([0, 1, 0]));
  assert.equal(cellKey([1, 2, 3]), cellKey([1, 2, 3]));
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test 2>&1 | grep -A 3 'cells.test'`
Expected: FAIL — cannot find module `./cells.ts`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * The occupied-cell set: the shape a Type B answer key and a Type B attempt
 * both take.
 *
 * OCCUPIED, NOT REMOVED. A student who carves a part in a different order from
 * another student submits the same thing, because the result is described
 * rather than the path to it (reverse-drill spec §6).
 *
 * NORMALISATION IS A TRANSLATION AND NOTHING MORE. `normaliseCells` moves the
 * bounding box to the origin so that where a part sits cannot affect a verdict
 * — the same invariance `compareView` gives the 2D scorer, for the same reason.
 * It must never be extended into anything that could make two DIFFERENT parts
 * compare equal.
 *
 * PURE. No I/O.
 */
import { buildOccupancy, type Occupancy } from "./occupancy.ts";
import type { Cell } from "./rotate3.ts";
import type { Solid } from "./solid.ts";

export const cellKey = (c: Cell): string => `${c[0]},${c[1]},${c[2]}`;

/** Sorted by z, then y, then x, so equal sets are deepEqual arrays. */
export function cellsOfOccupancy(o: Occupancy): Cell[] {
  const out: Cell[] = [];
  for (let k = 0; k < o.h; k++)
    for (let j = 0; j < o.d; j++)
      for (let i = 0; i < o.w; i++)
        if (o.isSolid(i, j, k)) out.push([i, j, k]);
  return out;
}

/**
 * The answer key for a Type B drill, DERIVED from the solid (AGENTS.md §7 —
 * never hand-written). Box-only by construction: `buildOccupancy` ignores
 * cylinder ops, which is exactly why a build drill may not have any.
 */
export function cellsOfSolid(s: Solid): Cell[] {
  return cellsOfOccupancy(buildOccupancy(s));
}

export function occupancyFromCells(
  cells: readonly Cell[], w: number, d: number, h: number,
): Occupancy {
  const present = new Set(cells.map(cellKey));
  return {
    w, d, h,
    isSolid(i, j, k) {
      if (i < 0 || j < 0 || k < 0 || i >= w || j >= d || k >= h) return false;
      return present.has(`${i},${j},${k}`);
    },
  };
}

export function normaliseCells(cells: readonly Cell[]): Cell[] {
  if (cells.length === 0) return [];
  let mx = Infinity, my = Infinity, mz = Infinity;
  for (const [x, y, z] of cells) {
    if (x < mx) mx = x;
    if (y < my) my = y;
    if (z < mz) mz = z;
  }
  return cells
    .map(([x, y, z]) => [x - mx, y - my, z - mz] as Cell)
    .sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, count risen by 10.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/cells.ts src/lib/geometry/cells.test.ts
git commit -m "feat(geometry): the occupied-cell set, and translation-invariant normalisation"
```

---

### Task 3: Generate the three views of an arbitrary occupancy

**Files:**
- Modify: `src/lib/geometry/views.ts` (the `buildView` / `generateViews` pair near line 220-258)
- Test: `src/lib/geometry/views.test.ts` (append)

**Interfaces:**
- Produces: `generateViewsFromOccupancy(occ: Occupancy): KeyViews`
- `generateViews(s: Solid): KeyViews` keeps its exact existing signature and behaviour.

**Why:** Task 5 needs the three views of a student's arbitrary cell set, which is not a `Solid` and cannot be made into one without synthesising several hundred unit-box subtractions. `buildView` already takes an `Occupancy` and consults the `Solid` only for cylinder ops — the capability exists and is merely unexported (spec §5.4).

- [ ] **Step 1: Write the failing test**

Append to `src/lib/geometry/views.test.ts`:

```ts
test("generateViewsFromOccupancy agrees with generateViews on a box-only solid", () => {
  // The refactor's whole contract: the occupancy path and the solid path are
  // the same path. If these ever diverge, the Type B scorer is judging a
  // different drawing from the one Type A grades.
  const s = subtractBox(block(6, 4, 4), { x: 4, y: 0, z: 2, w: 2, d: 4, h: 2 }, "step");
  assert.deepEqual(generateViewsFromOccupancy(buildOccupancy(s)), generateViews(s));
});

test("generateViewsFromOccupancy handles a cell set no Solid could express", () => {
  // A floating cell above a block. `validateSolid` would refuse this and
  // subtractBox cannot build it, which is precisely why the occupancy entry
  // point has to exist — a student's in-progress build is often not a
  // well-formed Solid.
  const cells: Cell[] = [...cellsOfSolid(block(2, 2, 1)), [0, 0, 2]];
  const views = generateViewsFromOccupancy(occupancyFromCells(cells, 2, 2, 3));
  assert.ok(views.front.length > 0, "a front view should have been produced");
  assert.ok(views.top.length > 0, "a top view should have been produced");
  assert.ok(views.side.length > 0, "a side view should have been produced");
});
```

Add to that file's imports (matching whatever is already there):

```ts
import { generateViewsFromOccupancy } from "./views.ts";
import { buildOccupancy } from "./occupancy.ts";
import { cellsOfSolid, occupancyFromCells } from "./cells.ts";
import type { Cell } from "./rotate3.ts";
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test 2>&1 | grep -B 2 -A 5 'generateViewsFromOccupancy'`
Expected: FAIL — `generateViewsFromOccupancy` is not exported.

- [ ] **Step 3: Refactor `views.ts`**

Change `buildView`'s signature to take the cylinder ops directly rather than the whole solid, then add the new entry point. Replace lines 220-258 with:

```ts
function buildView(ops: readonly Solid["ops"][number][], occ: Occupancy, spec: ViewSpec): Primitive[] {
  const lattice = mergeEdges(extractEdges(occ, spec));

  const out: Primitive[] = lattice.map((l) => ({
    kind: "segment",
    type: l.hidden ? "hidden" : "visible",
    x1: spec.suSign * l.u1, y1: spec.svSign * l.v1,
    x2: spec.suSign * l.u2, y2: spec.svSign * l.v2,
  }));

  for (const op of ops) {
    if (op.kind !== "cylinder") continue;
    for (const p of borePrimitives(op, occ, spec)) {
      out.push(p.kind === "circle"
        ? { ...p, cx: spec.suSign * p.cx, cy: spec.svSign * p.cy }
        : {
            ...p,
            x1: spec.suSign * p.x1, y1: spec.svSign * p.y1,
            x2: spec.suSign * p.x2, y2: spec.svSign * p.y2,
          });
    }
  }

  const deduped = dedupeByPosition(out);

  const box = boundingBox(deduped);
  if (box === null) return [];
  return deduped.map((p) => translate(p, -box.minX, -box.minY));
}

function composeViews(ops: readonly Solid["ops"][number][], occ: Occupancy): KeyViews {
  const views = {} as Record<ViewName, Primitive[]>;
  for (const name of ["front", "top", "side"] as ViewName[]) {
    views[name] = buildView(ops, occ, VIEW_SPECS[name]);
  }
  return { front: views.front, top: views.top, side: views.side };
}

export function generateViews(s: Solid): KeyViews {
  validateSolid(s);
  const occ = buildOccupancy(s); // rasterised once, shared by all three views
  return composeViews(s.ops, occ);
}

/**
 * The three views of an arbitrary occupancy — a cell set that may not be a
 * well-formed `Solid` at all.
 *
 * WHY THIS EXISTS. The Type B scorer must generate the views of a STUDENT'S
 * in-progress build to answer two questions honestly: which view a mistake
 * actually shows up in, and whether a build that differs from the key
 * nonetheless matches all three views (reverse-drill engine spec §5.2, §5.3).
 * A student's build is frequently not expressible as a base block minus ordered
 * subtractions, so it cannot go through `generateViews`.
 *
 * NO CYLINDERS, and none are possible: an occupancy has no ops. That is sound
 * only because Type B is box-only — see that spec's §4 for why that is forced
 * rather than chosen.
 *
 * `validateSolid` is deliberately NOT called: there is no solid to validate,
 * and the caller has already bounded the cell set through `validate.ts`.
 */
export function generateViewsFromOccupancy(occ: Occupancy): KeyViews {
  return composeViews([], occ);
}
```

- [ ] **Step 4: Run the whole suite and verify nothing regressed**

Run: `npm test 2>&1 | tail -8`
Expected: PASS. Every pre-existing view and golden-fixture test must still pass — this refactor changes no behaviour, and if a golden fixture moves, stop and find out why before going further.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/views.ts src/lib/geometry/views.test.ts
git commit -m "refactor(geometry): expose the three views of an arbitrary occupancy"
```

---

### Task 4: The occupancy diff and its 6-connected regions

**Files:**
- Create: `src/lib/scoring/solid.ts`
- Test: `src/lib/scoring/solid.test.ts`

**Interfaces:**
- Consumes: `Cell` from `../geometry/rotate3.ts`; `normaliseCells`, `cellKey` from `../geometry/cells.ts`.
- Produces:
  - `type CellRegion = { cells: Cell[]; where: string; views: ViewName[] }`
  - `type SolidDiff = { missing: CellRegion[]; extra: CellRegion[] }`
  - `type SolidScoreResult = { ok: true; perfect: boolean; matchesAllViews: boolean; diff: SolidDiff }`
  - `groupRegions(cells: readonly Cell[]): Cell[][]` (exported for its own test)
  - `describeWhere(region: readonly Cell[], extent: Cell): string`

This task builds the structure and leaves `views` as an empty array on every region; Task 5 fills it in. `where` is implemented here.

**The `where` descriptor, fixed so it cannot be invented twice.** The region's centroid is placed in thirds of the KEY's bounding-box extent: index `Math.min(2, Math.floor(3 * v / size))`, with `size` of 0 treated as index 0. Labels are `["left", "centre", "right"]` on x, `["front", "middle", "back"]` on y, `["bottom", "middle", "top"]` on z. Middle/centre components are dropped, and the surviving ones are joined in the order **z, y, x** after the words "at the". All three middle gives `"in the middle"`.

- [ ] **Step 1: Write the failing test file**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { groupRegions, describeWhere, scoreSolid } from "./solid.ts";
import { cellsOfSolid } from "../geometry/cells.ts";
import { block, subtractBox } from "../geometry/solid.ts";
import type { Cell } from "../geometry/rotate3.ts";

test("groupRegions puts face-touching cells in one region", () => {
  const r = groupRegions([[0, 0, 0], [1, 0, 0], [2, 0, 0]]);
  assert.equal(r.length, 1);
  assert.equal(r[0].length, 3);
});

test("groupRegions separates cells that do not touch", () => {
  const r = groupRegions([[0, 0, 0], [5, 5, 5]]);
  assert.equal(r.length, 2);
});

test("groupRegions does NOT join cells that touch only at a corner", () => {
  // 6-connectivity, not 26. Two diagonal cells are two separate mistakes and
  // deserve two separate sentences.
  const r = groupRegions([[0, 0, 0], [1, 1, 0]]);
  assert.equal(r.length, 2, "diagonally adjacent cells were merged — that is 26-connectivity");
});

test("groupRegions joins across all three axes", () => {
  const r = groupRegions([[0, 0, 0], [0, 0, 1], [0, 1, 1]]);
  assert.equal(r.length, 1);
});

test("groupRegions on an empty set returns no regions", () => {
  assert.deepEqual(groupRegions([]), []);
});

test("describeWhere names the corner a region sits in", () => {
  // extent is the key's bounding-box size, so thirds of a 9x9x9 part are 3 wide.
  assert.equal(describeWhere([[0, 0, 0]], [9, 9, 9]), "at the bottom front left");
  assert.equal(describeWhere([[8, 8, 8]], [9, 9, 9]), "at the top back right");
});

test("describeWhere drops the axes a region is central on", () => {
  assert.equal(describeWhere([[4, 4, 8]], [9, 9, 9]), "at the top");
  assert.equal(describeWhere([[0, 4, 4]], [9, 9, 9]), "at the left");
});

test("describeWhere says 'in the middle' when a region is central on every axis", () => {
  assert.equal(describeWhere([[4, 4, 4]], [9, 9, 9]), "in the middle");
});

test("scoreSolid calls an identical build perfect", () => {
  const key = cellsOfSolid(subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }, "step"));
  const r = scoreSolid(key, key);
  assert.equal(r.perfect, true);
  assert.deepEqual(r.diff.missing, []);
  assert.deepEqual(r.diff.extra, []);
});

test("scoreSolid ignores where the part sits", () => {
  const key = cellsOfSolid(subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }, "step"));
  const moved: Cell[] = key.map(([x, y, z]) => [x + 7, y + 3, z + 11]);
  assert.equal(scoreSolid(moved, key).perfect, true, "a translated build must score the same");
});

test("scoreSolid reports material the student failed to leave in place", () => {
  const key = cellsOfSolid(block(3, 3, 3));
  const attempt = key.filter((c) => !(c[0] === 0 && c[1] === 0 && c[2] === 0));
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false);
  assert.equal(r.diff.missing.length, 1);
  assert.equal(r.diff.missing[0].cells.length, 1);
  assert.equal(r.diff.extra.length, 0);
});

test("scoreSolid reports material the student left that should be cut away", () => {
  const key = cellsOfSolid(subtractBox(block(3, 3, 3), { x: 0, y: 0, z: 0, w: 1, d: 1, h: 1 }, "nick"));
  const attempt = cellsOfSolid(block(3, 3, 3));
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false);
  assert.equal(r.diff.extra.length, 1);
  assert.equal(r.diff.missing.length, 0);
});

test("scoreSolid groups one contiguous mistake into ONE region, not many cells", () => {
  // The whole reason regions exist: "there is material at the back left" is a
  // sentence a student can act on. "cells (2,2,0), (2,2,1), (2,2,2) are wrong"
  // is a checksum.
  const key = cellsOfSolid(subtractBox(block(3, 3, 3), { x: 2, y: 2, z: 0, w: 1, d: 1, h: 3 }, "post"));
  const attempt = cellsOfSolid(block(3, 3, 3));
  const r = scoreSolid(attempt, key);
  assert.equal(r.diff.extra.length, 1, "three stacked cells are one mistake");
  assert.equal(r.diff.extra[0].cells.length, 3);
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npm test 2>&1 | grep -A 3 'scoring/solid'`
Expected: FAIL — cannot find module `./solid.ts`.

- [ ] **Step 3: Write the implementation**

```ts
/**
 * Scoring a Type B attempt: the student's built solid against the key's.
 *
 * SERVER ONLY, like `score.ts` — it is used alongside answer keys, which never
 * reach the browser (AGENTS.md §5.1).
 *
 * THE VERDICT IS THE PRODUCT (AGENTS.md §1). "14 cells missing, 3 extra" is a
 * checksum, not marking. So the diff is grouped into 6-connected REGIONS and
 * each is described by where it sits and which view actually reveals it —
 * the Type B equivalent of Type A naming the convention a student really used.
 *
 * 6-CONNECTIVITY, NOT 26. Two cells touching only at a corner are two separate
 * mistakes and earn two separate sentences; merging them would describe a
 * region whose centre is in neither of them.
 *
 * There is deliberately NO overall percentage, for the same reason `score.ts`
 * has none: a number teaches nothing.
 *
 * PURE. No I/O.
 */
import { cellKey, normaliseCells } from "../geometry/cells.ts";
import type { Cell } from "../geometry/rotate3.ts";
import type { ViewName } from "./types.ts";

export type CellRegion = {
  cells: Cell[];
  /** Where it sits, in thirds of the key's bounding box. */
  where: string;
  /** Views this region genuinely changes. Never asserted — see Task 5. */
  views: ViewName[];
};

export type SolidDiff = { missing: CellRegion[]; extra: CellRegion[] };

export type SolidScoreResult = {
  ok: true;
  perfect: boolean;
  /**
   * The build differs from the key, yet all three views agree with it. Never
   * true when `perfect` is true. See the engine spec §5.3: a tool that says
   * what is wrong must never tell a student a correct reading is incorrect.
   */
  matchesAllViews: boolean;
  diff: SolidDiff;
};

const NEIGHBOURS: readonly Cell[] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

/** Connected components under face adjacency. */
export function groupRegions(cells: readonly Cell[]): Cell[][] {
  const remaining = new Map<string, Cell>();
  for (const c of cells) remaining.set(cellKey(c), c);

  const out: Cell[][] = [];
  for (const [startKey, startCell] of remaining) {
    if (!remaining.has(startKey)) continue;
    const region: Cell[] = [];
    const stack: Cell[] = [startCell];
    remaining.delete(startKey);
    while (stack.length > 0) {
      const c = stack.pop()!;
      region.push(c);
      for (const [dx, dy, dz] of NEIGHBOURS) {
        const n: Cell = [c[0] + dx, c[1] + dy, c[2] + dz];
        const k = cellKey(n);
        const found = remaining.get(k);
        if (found === undefined) continue;
        remaining.delete(k);
        stack.push(found);
      }
    }
    out.push(region.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]));
  }
  return out;
}

const LABELS: readonly (readonly [string, string, string])[] = [
  ["left", "centre", "right"],
  ["front", "middle", "back"],
  ["bottom", "middle", "top"],
];

function thirdOf(v: number, size: number): number {
  if (size <= 0) return 1;
  return Math.min(2, Math.floor((3 * v) / size));
}

/**
 * Where a region sits, in thirds of the key's bounding-box `extent`. Read in
 * the order a person says it: height, then depth, then side.
 */
export function describeWhere(region: readonly Cell[], extent: Cell): string {
  let sx = 0, sy = 0, sz = 0;
  for (const [x, y, z] of region) { sx += x; sy += y; sz += z; }
  const n = region.length;
  const parts = [
    LABELS[2][thirdOf(sz / n, extent[2])],
    LABELS[1][thirdOf(sy / n, extent[1])],
    LABELS[0][thirdOf(sx / n, extent[0])],
  ].filter((p) => p !== "middle" && p !== "centre");
  return parts.length === 0 ? "in the middle" : `at the ${parts.join(" ")}`;
}

function extentOf(cells: readonly Cell[]): Cell {
  let mx = 0, my = 0, mz = 0;
  for (const [x, y, z] of cells) {
    if (x + 1 > mx) mx = x + 1;
    if (y + 1 > my) my = y + 1;
    if (z + 1 > mz) mz = z + 1;
  }
  return [mx, my, mz];
}

export function scoreSolid(attempt: readonly Cell[], key: readonly Cell[]): SolidScoreResult {
  const a = normaliseCells(attempt);
  const k = normaliseCells(key);
  const extent = extentOf(k);

  const inAttempt = new Set(a.map(cellKey));
  const inKey = new Set(k.map(cellKey));

  const missingCells = k.filter((c) => !inAttempt.has(cellKey(c)));
  const extraCells = a.filter((c) => !inKey.has(cellKey(c)));

  const toRegions = (cells: Cell[]): CellRegion[] =>
    groupRegions(cells).map((region) => ({
      cells: region,
      where: describeWhere(region, extent),
      views: [],
    }));

  const diff: SolidDiff = { missing: toRegions(missingCells), extra: toRegions(extraCells) };
  const perfect = missingCells.length === 0 && extraCells.length === 0;
  return { ok: true, perfect, matchesAllViews: false, diff };
}
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, count risen by 13.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring/solid.ts src/lib/scoring/solid.test.ts
git commit -m "feat(scoring): the Type B occupancy diff, grouped into connected regions"
```

---

### Task 5: Name the view, and the honest outcome

**Files:**
- Modify: `src/lib/scoring/solid.ts`
- Modify: `src/lib/scoring/solid.test.ts` (append)
- Modify: `src/drills/isolation.test.ts:28` — add `scoring/solid` to `SERVER_ONLY`

**Interfaces:**
- Consumes: `generateViewsFromOccupancy` from `../geometry/views.ts`; `occupancyFromCells` from `../geometry/cells.ts`.
- Produces: no new exports. `CellRegion.views` is now populated, and `SolidScoreResult.matchesAllViews` can now be `true`.

**The rule this task exists to honour:** a view is named for a region only when adding (or removing) that region actually changes that view. A region can sit behind other material and change nothing; saying "the top view shows this" when it does not is the parabola-hint failure in a new place (AGENTS.md §6).

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/scoring/solid.test.ts`:

```ts
test("a missing region names the views it actually changes", () => {
  const key = cellsOfSolid(block(3, 3, 3));
  const attempt = key.filter((c) => !(c[0] === 0 && c[1] === 0 && c[2] === 2));
  const r = scoreSolid(attempt, key);
  assert.equal(r.diff.missing.length, 1);
  assert.ok(r.diff.missing[0].views.length > 0, "a missing corner cell must show in some view");
  for (const v of r.diff.missing[0].views) {
    assert.ok(["front", "top", "side"].includes(v), `unexpected view name ${v}`);
  }
});

test("a region names NO view it does not change — the claim is derived, not asserted", () => {
  // A cell buried in the centre of a 3x3x3 block is invisible from outside,
  // but removing it DOES change the views: an internal cavity shows as hidden
  // lines. This test pins that the naming is computed from the views rather
  // than guessed from the region's position, in either direction.
  const key = cellsOfSolid(block(3, 3, 3));
  const attempt = key.filter((c) => !(c[0] === 1 && c[1] === 1 && c[2] === 1));
  const r = scoreSolid(attempt, key);
  assert.equal(r.diff.missing.length, 1);
  const named = r.diff.missing[0].views;
  // Whatever the correct answer is, it must agree with the generator: the
  // named set is exactly the set of views that differ when the region is
  // restored. Recomputed here from the public entry point, independently.
  assert.deepEqual(
    [...named].sort(),
    viewsDifferingWhenRestored(attempt, key).sort(),
    "the named views disagree with the views that actually change",
  );
});

test("matchesAllViews is false for a perfect build", () => {
  const key = cellsOfSolid(block(3, 3, 3));
  assert.equal(scoreSolid(key, key).matchesAllViews, false);
});

test("POSITIVE CONTROL: a wrong build that changes a view is NOT called view-consistent", () => {
  const key = cellsOfSolid(block(3, 3, 3));
  const attempt = key.filter((c) => !(c[0] === 0 && c[1] === 0 && c[2] === 2));
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false);
  assert.equal(r.matchesAllViews, false, "a build whose views differ must not be excused");
});

test("EXHAUSTIVE: on a 2x2x2 grid, do two different parts ever share all three views?", () => {
  // This is a MEASUREMENT as much as a test, and it is the only honest way to
  // exercise §5.3. Enumerate all 256 subsets of a 2x2x2 grid, bucket them by
  // their three generated views, and look for a bucket holding two distinct
  // normalised cell sets. Such a pair is a genuine ambiguity: a student could
  // build either and be right.
  //
  // An earlier draft of this test faked a pair by adding a cell outside the
  // block, which changes the bounding box and therefore the views — it passed
  // through its own else-branch without ever reaching the code it named. Do
  // not replace this with a hand-made pair unless you have verified the views
  // really are identical.
  const buckets = new Map<string, Cell[][]>();
  for (let mask = 1; mask < 256; mask++) {
    const cells: Cell[] = [];
    for (let b = 0; b < 8; b++) {
      if (mask & (1 << b)) cells.push([b & 1, (b >> 1) & 1, (b >> 2) & 1]);
    }
    const norm = normaliseCells(cells);
    const dim = (i: 0 | 1 | 2) => norm.reduce((m, c) => Math.max(m, c[i] + 1), 1);
    const v = generateViewsFromOccupancy(occupancyFromCells(norm, dim(0), dim(1), dim(2)));
    const sig = JSON.stringify([v.front, v.top, v.side]);
    const seen = buckets.get(sig) ?? [];
    if (!seen.some((other) => JSON.stringify(other) === JSON.stringify(norm))) seen.push(norm);
    buckets.set(sig, seen);
  }

  const ambiguous = [...buckets.values()].find((sets) => sets.length > 1);
  if (ambiguous === undefined) {
    // No pair exists on this grid. That is a real finding and it strengthens
    // the premise check in the engine spec §2 — record it, do not skip.
    assert.ok(buckets.size > 0, "no subsets were enumerated — this test is inert");
    return;
  }

  const [key, attempt] = ambiguous;
  const r = scoreSolid(attempt, key);
  assert.equal(r.perfect, false, "the two sets differ, so this is not a perfect build");
  assert.equal(
    r.matchesAllViews, true,
    "these two parts share all three views, so the verdict must say so rather than mark the student wrong",
  );
});

test("matchesAllViews is exactly 'not perfect, and no view differs'", () => {
  // Pins the predicate itself, so §5.3 is covered even on grids where no
  // ambiguous pair exists. Driven through the public entry point on both
  // sides, never recomputed from solid.ts's internals.
  const key = cellsOfSolid(subtractBox(block(3, 3, 2), { x: 0, y: 0, z: 1, w: 1, d: 1, h: 1 }, "nick"));
  const cases: Cell[][] = [
    key,
    key.filter((c) => !(c[0] === 2 && c[1] === 2 && c[2] === 0)),
    cellsOfSolid(block(3, 3, 2)),
  ];
  for (const attempt of cases) {
    const r = scoreSolid(attempt, key);
    const viewsDiffer = viewsDifferingWhenRestored(attempt, key).length > 0;
    assert.equal(
      r.matchesAllViews, !r.perfect && !viewsDiffer,
      `matchesAllViews disagreed with the views for attempt of ${attempt.length} cells`,
    );
  }
});
```

Add this helper near the top of the test file, plus `import { generateViewsFromOccupancy } from "../geometry/views.ts";` and `import { occupancyFromCells, normaliseCells } from "../geometry/cells.ts";`:

```ts
/** Recomputed from the public entry point, independently of solid.ts's internals. */
function viewsDifferingWhenRestored(attempt: readonly Cell[], key: readonly Cell[]): string[] {
  const a = normaliseCells(attempt);
  const k = normaliseCells(key);
  const dim = (cs: readonly Cell[], i: 0 | 1 | 2) => cs.reduce((m, c) => Math.max(m, c[i] + 1), 1);
  const w = Math.max(dim(a, 0), dim(k, 0));
  const d = Math.max(dim(a, 1), dim(k, 1));
  const h = Math.max(dim(a, 2), dim(k, 2));
  const va = generateViewsFromOccupancy(occupancyFromCells(a, w, d, h));
  const vk = generateViewsFromOccupancy(occupancyFromCells(k, w, d, h));
  return (["front", "top", "side"] as const)
    .filter((n) => JSON.stringify(va[n]) !== JSON.stringify(vk[n]));
}
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test 2>&1 | grep -A 5 'names the views'`
Expected: FAIL — `views` is `[]` on every region, and `matchesAllViews` is always `false`.

- [ ] **Step 3: Implement the view naming**

Add these imports to `src/lib/scoring/solid.ts`:

```ts
import { cellKey, normaliseCells, occupancyFromCells } from "../geometry/cells.ts";
import { generateViewsFromOccupancy } from "../geometry/views.ts";
```

Add these helpers above `scoreSolid`:

```ts
const VIEW_NAMES: readonly ViewName[] = ["front", "top", "side"];

/** A grid big enough to hold both cell sets, so the two are comparable. */
function commonGrid(a: readonly Cell[], b: readonly Cell[]): Cell {
  const ea = extentOf(a), eb = extentOf(b);
  return [Math.max(ea[0], eb[0], 1), Math.max(ea[1], eb[1], 1), Math.max(ea[2], eb[2], 1)];
}

function viewsOf(cells: readonly Cell[], grid: Cell): Record<ViewName, string> {
  const v = generateViewsFromOccupancy(occupancyFromCells(cells, grid[0], grid[1], grid[2]));
  return { front: JSON.stringify(v.front), top: JSON.stringify(v.top), side: JSON.stringify(v.side) };
}

function namesDiffering(a: Record<ViewName, string>, b: Record<ViewName, string>): ViewName[] {
  return VIEW_NAMES.filter((n) => a[n] !== b[n]);
}
```

Replace the `toRegions` closure and the return in `scoreSolid` with:

```ts
  const grid = commonGrid(a, k);
  const attemptViews = viewsOf(a, grid);
  const keyViews = viewsOf(k, grid);

  /**
   * Which views a region actually accounts for. Computed by CHANGING the
   * attempt by exactly that region and seeing which views move — never
   * inferred from where the region sits, because a region can be occluded and
   * change nothing. See the engine spec §5.2.
   */
  const viewsFor = (region: readonly Cell[], add: boolean): ViewName[] => {
    const inRegion = new Set(region.map(cellKey));
    const corrected = add
      ? [...a, ...region]
      : a.filter((c) => !inRegion.has(cellKey(c)));
    return namesDiffering(viewsOf(corrected, grid), attemptViews);
  };

  const toRegions = (cells: Cell[], add: boolean): CellRegion[] =>
    groupRegions(cells).map((region) => ({
      cells: region,
      where: describeWhere(region, extent),
      views: viewsFor(region, add),
    }));

  const diff: SolidDiff = {
    missing: toRegions(missingCells, true),
    extra: toRegions(extraCells, false),
  };
  const perfect = missingCells.length === 0 && extraCells.length === 0;
  const matchesAllViews = !perfect && namesDiffering(attemptViews, keyViews).length === 0;
  return { ok: true, perfect, matchesAllViews, diff };
```

- [ ] **Step 4: Close the isolation boundary**

`src/lib/scoring/solid.ts` now imports `geometry/views`, which derives answer keys. `scoring/score` is already treated as key-bearing; this module is the same class. In `src/drills/isolation.test.ts:28`, change:

```ts
const SERVER_ONLY = /from\s+["'][^"']*(drills\/registry|server\/|geometry\/solid|geometry\/views|geometry\/isoedges|geometry\/parabola|scoring\/score|scoring\/assign)/;
```

to add `|scoring\/solid` after `scoring\/score`:

```ts
const SERVER_ONLY = /from\s+["'][^"']*(drills\/registry|server\/|geometry\/solid|geometry\/views|geometry\/isoedges|geometry\/parabola|scoring\/score|scoring\/solid|scoring\/assign)/;
```

The existing `geometry\/solid` alternative does NOT cover this: it matches the import string `../geometry/solid.ts`, whereas a client file reaching this module would import `../lib/scoring/solid.ts`. The two names look alike and match different things, which is exactly why the new alternative is spelled out rather than assumed.

- [ ] **Step 5: Run the tests and verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, count risen by 6.

- [ ] **Step 6: Prove the derivation is real, not decoration**

Temporarily change `viewsFor` to `return [...VIEW_NAMES];` (naming every view for every region). Run `npm test`. The test `a region names NO view it does not change` must FAIL. Revert and confirm green.

- [ ] **Step 7: Commit**

```bash
git add src/lib/scoring/solid.ts src/lib/scoring/solid.test.ts src/drills/isolation.test.ts
git commit -m "feat(scoring): name the view a mistake really shows in, and never one it does not"
```

---

### Task 6: Validate a cell submission

**Files:**
- Modify: `src/lib/scoring/validate.ts`
- Modify: `src/lib/scoring/validate.test.ts` (append)

**Interfaces:**
- Produces:
  - `MAX_CELLS = 4000`
  - `MAX_CELL_COORD = 64`
  - `type CellValidationResult = { ok: true; cells: Cell[] } | { ok: false; reason: ValidationFailure }`
  - `validateCells(input: unknown): CellValidationResult`
- `ValidationFailure` gains `"TOO_MANY_CELLS"` and `"DUPLICATE_CELL"`.

**Caps, and why these numbers.** The largest base block in the catalogue is 9x6x6 = 324 cells; `MAX_CELLS = 4000` is generous against any real build and small enough that the worst case stays cheap. `MAX_CELL_COORD = 64` bounds a single axis well above any drill and well below anything that would make `occupancyFromCells` allocate meaningfully.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/scoring/validate.test.ts`:

```ts
test("validateCells accepts a well-formed cell set and rebuilds it", () => {
  const r = validateCells([[0, 0, 0], [1, 2, 3]]);
  assert.equal(r.ok, true);
  if (r.ok) assert.deepEqual(r.cells, [[0, 0, 0], [1, 2, 3]]);
});

test("validateCells rejects anything that is not an array", () => {
  assert.deepEqual(validateCells({ cells: [] }), { ok: false, reason: "NOT_AN_ARRAY" });
});

test("validateCells rejects a cell that is not a triple", () => {
  assert.deepEqual(validateCells([[0, 0]]), { ok: false, reason: "BAD_SHAPE" });
  assert.deepEqual(validateCells([[0, 0, 0, 0]]), { ok: false, reason: "BAD_SHAPE" });
});

test("validateCells rejects non-integer and non-finite coordinates", () => {
  assert.deepEqual(validateCells([[0, 0, 0.5]]), { ok: false, reason: "NOT_ON_GRID" });
  assert.deepEqual(validateCells([[0, 0, NaN]]), { ok: false, reason: "NOT_A_NUMBER" });
  assert.deepEqual(validateCells([[0, 0, "1"]]), { ok: false, reason: "NOT_A_NUMBER" });
});

test("validateCells rejects a negative coordinate", () => {
  // A cell index is a grid position, never a signed offset — unlike a
  // primitive coordinate, which may legitimately be negative.
  assert.deepEqual(validateCells([[-1, 0, 0]]), { ok: false, reason: "OUT_OF_BOUNDS" });
});

test("validateCells rejects a coordinate past the cap", () => {
  assert.deepEqual(validateCells([[MAX_CELL_COORD + 1, 0, 0]]), { ok: false, reason: "OUT_OF_BOUNDS" });
});

test("validateCells rejects a duplicated cell", () => {
  // A set, submitted as an array. Duplicates would inflate the count past the
  // cap check and mean nothing to a set diff, so they are a client bug.
  assert.deepEqual(validateCells([[1, 1, 1], [1, 1, 1]]), { ok: false, reason: "DUPLICATE_CELL" });
});

test("validateCells rejects an oversized set BEFORE inspecting its contents", () => {
  const huge = Array.from({ length: MAX_CELLS + 1 }, () => "not even a cell");
  assert.deepEqual(validateCells(huge), { ok: false, reason: "TOO_MANY_CELLS" });
});

test("validateCells rebuilds cells rather than passing the caller's arrays through", () => {
  const smuggled: unknown[] = [[0, 0, 0]];
  (smuggled[0] as unknown[]).push("extra");
  assert.deepEqual(validateCells(smuggled), { ok: false, reason: "BAD_SHAPE" });
});

test("validateCells accepts an empty build", () => {
  // A student who has cut everything away submits nothing. That is a wrong
  // answer, not a malformed request, and the scorer says so.
  const r = validateCells([]);
  assert.equal(r.ok, true);
});
```

Update that file's import line to include the new names, e.g.:

```ts
import { validateAttempt, validateCells, MAX_CELLS, MAX_CELL_COORD, MAX_PRIMITIVES, MAX_COORD } from "./validate.ts";
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test 2>&1 | grep -A 3 'validateCells'`
Expected: FAIL — `validateCells` is not exported.

- [ ] **Step 3: Implement**

In `src/lib/scoring/validate.ts`, add `"TOO_MANY_CELLS"` and `"DUPLICATE_CELL"` to `ValidationFailure`, then append:

```ts
/**
 * Caps for a cell submission. The largest base block in the catalogue is
 * 9x6x6 = 324 cells, so 4000 is generous against any real build while keeping
 * the worst case cheap. A single axis is bounded well below anything that
 * would make `occupancyFromCells` allocate meaningfully.
 */
export const MAX_CELLS = 4000;
export const MAX_CELL_COORD = 64;

export type CellValidationResult =
  | { ok: true; cells: Cell[] }
  | { ok: false; reason: ValidationFailure };

/** A cell index is a grid position: a non-negative integer inside the cap. */
function badCellCoord(n: unknown): ValidationFailure | null {
  if (typeof n !== "number" || !Number.isFinite(n)) return "NOT_A_NUMBER";
  if (!Number.isInteger(n)) return "NOT_ON_GRID";
  if (n < 0 || n > MAX_CELL_COORD) return "OUT_OF_BOUNDS";
  return null;
}

/**
 * Validate the occupied-cell set of a Type B attempt.
 *
 * Same trust-boundary discipline as `validateAttempt`: hostile until proven
 * otherwise, all-or-nothing, and every cell REBUILT rather than passed
 * through, so no extra property can ride along into the scorer or back out in
 * a response.
 */
export function validateCells(input: unknown): CellValidationResult {
  if (!Array.isArray(input)) return { ok: false, reason: "NOT_AN_ARRAY" };
  // Before the per-cell loop, for the reason MAX_PRIMITIVES is checked early.
  if (input.length > MAX_CELLS) return { ok: false, reason: "TOO_MANY_CELLS" };

  const cells: Cell[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (!Array.isArray(raw) || raw.length !== 3) return { ok: false, reason: "BAD_SHAPE" };
    for (const v of raw) {
      const bad = badCellCoord(v);
      if (bad !== null) return { ok: false, reason: bad };
    }
    const cell: Cell = [raw[0] as number, raw[1] as number, raw[2] as number];
    const k = `${cell[0]},${cell[1]},${cell[2]}`;
    if (seen.has(k)) return { ok: false, reason: "DUPLICATE_CELL" };
    seen.add(k);
    cells.push(cell);
  }
  return { ok: true, cells };
}
```

Add to the file's imports: `import type { Cell } from "../geometry/rotate3.ts";`

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, count risen by 10.

- [ ] **Step 5: Commit**

```bash
git add src/lib/scoring/validate.ts src/lib/scoring/validate.test.ts
git commit -m "feat(scoring): validate a cell submission at the trust boundary"
```

---

### Task 7: The `build` drill mode, its topic, and two exercises

**Files:**
- Modify: `src/topics/topics.ts` — add the `reading-views` topic
- Modify: `src/drills/registry.ts` — `BuildDrill`, the `Drill` union, `PublicDrill`, `publicHalf`, `answerKey`, `topicPreview`, and two exercises

**Interfaces:**
- Produces:
  - `type BuildDrill = { id; title; prompt; convention: Convention; topicId: TopicId; mode: "build"; addedOn: string; solid: Solid }`
  - `Drill = ViewsDrill | FigureDrill | BuildDrill`
  - `answerKey(drill: BuildDrill): Cell[]` (new overload)
  - `PublicDrill` gains a `mode: "build"` branch carrying `promptViews`, `promptConvention`, `base`, and `topic`
  - `TopicId` gains `"reading-views"`

**The two solids must be box-only, asymmetric, and used by NO other drill** (spec §4, §6). Use:
- `build-corner-step` — `subtractBox(block(5, 4, 3), { x: 3, y: 0, z: 1, w: 2, d: 4, h: 2 }, "step")`
- `build-offset-notch` — `subtractBox(block(6, 4, 3), { x: 0, y: 2, z: 0, w: 2, d: 2, h: 2 }, "notch")`

Task 8's guards will prove both are box-only, well-posed, and non-colliding. **If either guard fails, change the solid here — do not weaken the guard.**

- [ ] **Step 1: Add the topic**

In `src/topics/topics.ts`, extend `TopicId`:

```ts
export type TopicId = "orthographic" | "parabola" | "oblique" | "reading-views";
```

and append to `CATALOGUE`:

```ts
  {
    id: "reading-views",
    title: "Reading three views",
    blurb:
      "Given the front, top and side views of a part, build the part itself. "
      + "The opposite direction to drawing the views, and a different skill.",
    hints: [
      {
        title: "Read all three views before you cut anything",
        body:
          "A single view is a shadow: many different parts cast it. What fixes "
          + "the shape is the three together, and a feature you can only see in "
          + "one of them is the one most often missed. Look at all three, "
          + "decide what the part is, and only then start removing material.",
      },
      {
        title: "A dashed line means material you cannot see from there",
        body:
          "A hidden line marks an edge that is really in the part but is "
          + "blocked from that direction by material in front of it. It is not "
          + "decoration and it is not optional — for many parts the dashed "
          + "lines are the only thing distinguishing the real shape from a "
          + "different part with the same outline.",
      },
      {
        title: "Line up the views to place a feature",
        body:
          "The front and top views share their left-to-right positions, and "
          + "the front and side views share their heights. A feature's position "
          + "in one view therefore tells you where to look for it in another, "
          + "which is how you work out its depth without guessing.",
      },
      {
        title: "Start from the whole block and take material away",
        body:
          "The part begins as the solid block its three views enclose. Every "
          + "step after that removes material, exactly as it would be machined. "
          + "If you cut too far you can put material back, but thinking of it "
          + "as carving keeps the shape you are aiming at in view.",
      },
    ],
  },
```

- [ ] **Step 2: Add the drill type and the exercises**

In `src/drills/registry.ts`, add after `FigureDrill`:

```ts
/**
 * A Type B reverse drill: the student is shown the three views and BUILDS the
 * part. The answer key is the solid's occupied-cell set.
 *
 * BOX-ONLY, and it is forced rather than chosen: `buildOccupancy` ignores
 * cylinder ops, so a bored solid's key would silently omit the bore while the
 * prompt showed a circle plainly, and the student would be marked wrong for
 * the one feature they could read most easily. Enforced by `registry.test.ts`.
 *
 * `convention` places the three views in the PROMPT. Unlike a views drill it
 * is not scored — nothing about where the student's part sits depends on it —
 * but the figure has to be laid out one way or the other, and saying which
 * teaches the difference the app exists to teach.
 */
export type BuildDrill = {
  id: string;
  title: string;
  prompt: string;
  convention: Convention;
  topicId: TopicId;
  mode: "build";
  /** ISO date. Derived content for the update ribbon (AGENTS.md §2.10). */
  addedOn: string;
  /** PRIVATE. The answer key in compressed form. Never serialise this. */
  solid: Solid;
};
```

Change the union to `export type Drill = ViewsDrill | FigureDrill | BuildDrill;` and append these two entries to `CATALOGUE`:

```ts
  {
    id: "build-corner-step",
    title: "Build the stepped bar",
    prompt:
      "The three views below show one part. Build it: start from the full "
      + "block the views enclose and remove material until your part matches "
      + "all three. Count grid squares to read each size, and check every "
      + "feature against more than one view before you cut it.",
    convention: "first_angle",
    topicId: "reading-views",
    mode: "build",
    addedOn: "2026-09-06",
    // Box-only and asymmetric. Used by no other drill — the three views ARE
    // the answer to a Type A exercise on this solid, so sharing it would
    // publish that answer (AGENTS.md §6).
    solid: subtractBox(block(5, 4, 3), { x: 3, y: 0, z: 1, w: 2, d: 4, h: 2 }, "step"),
  },
  {
    id: "build-offset-notch",
    title: "Build the notched block",
    prompt:
      "The three views below show one part. Build it: start from the full "
      + "block the views enclose and remove material until your part matches "
      + "all three. This part's notch does not run the full depth, so the top "
      + "view is the one that tells you how far back it goes.",
    convention: "third_angle",
    topicId: "reading-views",
    mode: "build",
    addedOn: "2026-09-06",
    solid: subtractBox(block(6, 4, 3), { x: 0, y: 2, z: 0, w: 2, d: 2, h: 2 }, "notch"),
  },
```

- [ ] **Step 3: Add the public half and the key**

Add a third branch to `PublicDrill`:

```ts
  | {
      id: string;
      title: string;
      prompt: string;
      mode: "build";
      grid: Readonly<{ width: number; height: number }>;
      /**
       * The three views, laid out — the ENTIRE prompt for a Type B drill.
       * Safe to publish only because the solid behind it is used by no Type A
       * exercise; these views ARE that exercise's answer key. Enforced in
       * registry.test.ts.
       */
      promptViews: readonly Primitive[];
      promptConvention: Convention;
      /**
       * The base block's dimensions. Readable straight off the three views
       * anyway, so supplying them gives nothing away, and it saves the builder
       * UI from re-deriving what the student can already see.
       */
      base: Readonly<{ w: number; d: number; h: number }>;
      topic: PublicTopic;
    };
```

In `publicHalf`, change the two-branch conditional into a three-branch one by inserting, before the existing `drill.mode === "figure"` test:

```ts
  const built: PublicDrill = drill.mode === "build"
    ? Object.freeze({
      id: drill.id,
      title: drill.title,
      prompt: drill.prompt,
      mode: "build",
      grid: SHEET,
      promptViews: freezeArray(viewsFigure(drill.solid, drill.convention)),
      promptConvention: drill.convention,
      base: Object.freeze({ ...drill.solid.base }),
      topic: publicTopic(drill),
    })
    : drill.mode === "figure"
    ? Object.freeze({
      // ... existing figure branch unchanged ...
```

Add an `answerKey` overload above the existing ones and a branch inside:

```ts
/** SERVER ONLY. The answer key for a "build" exercise: its occupied cells. */
export function answerKey(drill: BuildDrill): Cell[];
```

and, at the top of `answerKey`'s body:

```ts
  if (drill.mode === "build") {
    const cached = buildKeyCache.get(drill.id);
    if (cached !== undefined) return cached;
    const built = Object.freeze(cellsOfSolid(drill.solid)) as unknown as Cell[];
    buildKeyCache.set(drill.id, built);
    return built;
  }
```

Declare `const buildKeyCache = new Map<string, Cell[]>();` beside the other caches, widen the implementation signature to `KeyViews | Primitive[] | Cell[]`, and add the imports:

```ts
import { cellsOfSolid } from "../lib/geometry/cells.ts";
import type { Cell } from "../lib/geometry/rotate3.ts";
```

- [ ] **Step 4: Give the topic a preview**

Add before `topicPreview`, and add `"reading-views"` to it:

```ts
/**
 * The reading-views topic card: the three views of a part, which is what the
 * drill actually puts in front of a student.
 *
 * DELIBERATELY A SOLID NO EXERCISE USES — same rule as the parabola diagram's
 * n=3 and the oblique diagram's plain block. Here the rule is not merely
 * pedagogical: these views ARE an answer key, so an exercise's solid on a
 * topic card would publish that exercise's answer to the front page.
 */
const READING_VIEWS_PREVIEW_SOLID = subtractBox(
  block(3, 3, 3), { x: 0, y: 0, z: 2, w: 1, d: 3, h: 1 }, "lip",
);

export const READING_VIEWS_PREVIEW: readonly Primitive[] = Object.freeze(
  viewsFigure(READING_VIEWS_PREVIEW_SOLID, "first_angle"),
);
```

and in `topicPreview`: `if (topicId === "reading-views") return READING_VIEWS_PREVIEW;`

- [ ] **Step 5: Run the suite**

Run: `npm test && npm run lint && npm run typecheck`
Expected: PASS. `registry.test.ts`'s existing checks (every `topicId` resolves, no public half leaks a solid or a spec, asymmetry) now cover the two new drills. If the asymmetry check fails, change the solid rather than the check.

- [ ] **Step 6: Commit**

```bash
git add src/topics/topics.ts src/drills/registry.ts
git commit -m "feat(drills): the build drill mode, the reading-views topic, and two exercises"
```

---

### Task 8: The content guards

**Files:**
- Modify: `src/drills/registry.test.ts` (append, and extend the existing leak test at line 391)

**Interfaces:**
- Consumes: `cellsOfSolid`, `occupancyFromCells` from `../lib/geometry/cells.ts`; `buildOccupancy` from `../lib/geometry/occupancy.ts`; `generateViews`, `generateViewsFromOccupancy` from `../lib/geometry/views.ts`.
- Produces: no exports. Three guards.

- [ ] **Step 1: Write the failing guards**

Append to `src/drills/registry.test.ts`:

```ts
test("a 'build' drill's solid is BOX-ONLY", () => {
  // Not a style rule. `buildOccupancy` drops cylinder ops, so a bored solid's
  // key would silently omit the bore while the prompt shows a circle plainly,
  // and the student would be marked wrong for the feature they could read
  // most easily. Engine spec §4.
  let checked = 0;
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "build") continue;
    checked++;
    for (const op of drill.solid.ops) {
      assert.notEqual(
        op.kind, "cylinder",
        `${id} has a cylinder op — a build drill's key cannot represent a bore`,
      );
    }
  }
  assert.ok(checked > 0, "no build drills found — this test is inert");
});

test("a 'build' drill is WELL-POSED: its three views determine its part", () => {
  // The premise the whole topic rests on. If a student can build something
  // genuinely consistent with all three given views and we mark it wrong, the
  // app teaches a falsehood — worse than a wrong key, because the student's
  // reasoning was correct. Engine spec §2.
  let checked = 0;
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "build") continue;
    checked++;
    const { w, d, h } = drill.solid.base;
    const cells = cellsOfSolid(drill.solid);
    const target = JSON.stringify(generateViews(drill.solid));

    // Probe 1: the visual hull is the maximal cell set consistent with the
    // three silhouettes. If it differs from the key AND generates the same
    // views, a student could legitimately build it instead.
    const occ = buildOccupancy(drill.solid);
    const silF = new Set<string>(), silT = new Set<string>(), silS = new Set<string>();
    for (const [x, y, z] of cells) {
      silF.add(`${x},${z}`); silT.add(`${x},${y}`); silS.add(`${y},${z}`);
    }
    const hull: Cell[] = [];
    for (let k = 0; k < h; k++) for (let j = 0; j < d; j++) for (let i = 0; i < w; i++)
      if (silF.has(`${i},${k}`) && silT.has(`${i},${j}`) && silS.has(`${j},${k}`)) hull.push([i, j, k]);
    if (hull.length !== cells.length) {
      assert.notEqual(
        JSON.stringify(generateViewsFromOccupancy(occupancyFromCells(hull, w, d, h))), target,
        `${id}: its visual hull is a DIFFERENT part with the SAME three views — the exercise is ambiguous`,
      );
    }

    // Probe 2: exhaustive single-cell removal. If any one cell can go with all
    // three views unchanged, ambiguity is proven by an example a student could
    // plausibly build.
    for (const c of cells) {
      const without = cells.filter((o) => !(o[0] === c[0] && o[1] === c[1] && o[2] === c[2]));
      assert.notEqual(
        JSON.stringify(generateViewsFromOccupancy(occupancyFromCells(without, w, d, h))), target,
        `${id}: removing cell ${c.join(",")} leaves all three views unchanged — the exercise is ambiguous`,
      );
    }
    assert.equal(occ.w, w, "sanity: the occupancy matches the base block");
  }
  assert.ok(checked > 0, "no build drills found — this test is inert");
});
```

- [ ] **Step 2: Extend the existing leak test**

At `src/drills/registry.test.ts:391`, the test `a views-prompted drill NEVER shows the answer to a Type A exercise` currently only inspects oblique figure drills. Replace its second loop with one that covers build drills too:

```ts
  let checked = 0;
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    // Every drill whose PROMPT is the three views of a solid, whatever its
    // mode. Type B shows them by definition; oblique wave 2 shows them by
    // choice. Both publish that solid's Type A answer key.
    const shownSolid =
      drill.mode === "build" ? drill.solid
      : drill.mode === "figure" && drill.spec.kind === "oblique" && drill.spec.shownAs.kind === "views"
        ? drill.spec.solid
      : null;
    if (shownSolid === null) continue;
    checked++;
    const shown = JSON.stringify(generateViews(shownSolid));
    const clash = askedFor.get(shown);
    assert.equal(
      clash, undefined,
      `${id} shows the three views of the same part that "${clash}" asks the `
      + `student to DRAW — its prompt is that exercise's answer key`,
    );
  }
```

Add to the file's imports:

```ts
import { cellsOfSolid, occupancyFromCells } from "../lib/geometry/cells.ts";
import { buildOccupancy } from "../lib/geometry/occupancy.ts";
import { generateViewsFromOccupancy } from "../lib/geometry/views.ts";
import type { Cell } from "../lib/geometry/rotate3.ts";
```

- [ ] **Step 3: Run and verify the guards pass on the shipped content**

Run: `npm test 2>&1 | tail -8`
Expected: PASS, count risen by 2. If the well-posedness guard fails, **change the solid in `registry.ts`, never the guard** — a failure means that exercise genuinely is ambiguous.

- [ ] **Step 4: Prove each guard FAILS on a deliberately bad drill**

This step is not optional (AGENTS.md §6: five of eight injected bugs once survived a full property suite).

1. **Box-only:** temporarily change `build-corner-step`'s solid to `subtractCylinder(block(5, 4, 3), "z", 2, 2, 1, "bore")`. Run `npm test`. The box-only guard must FAIL. Revert.
2. **Well-posed:** temporarily change `build-offset-notch`'s solid to `block(6, 4, 3)` with a single interior cell removed via `subtractBox(block(6, 4, 3), { x: 2, y: 1, z: 1, w: 1, d: 1, h: 1 }, "void")` — then check whether the guard fires. If it does not (the cavity shows as hidden lines, so it may legitimately be well-posed), instead force a failure by temporarily changing the guard's `assert.notEqual` to `assert.equal` and confirming it fails on the real content. Revert either way, and record in the commit message which route was used.
3. **Leak rule:** temporarily change `build-corner-step`'s solid to `subtractBox(block(6, 4, 4), { x: 4, y: 0, z: 2, w: 2, d: 4, h: 2 }, "step")` — the `simple-step` Type A solid. Run `npm test`. The leak guard must FAIL naming `simple-step`. Revert.

- [ ] **Step 5: Commit**

```bash
git add src/drills/registry.test.ts
git commit -m "test(drills): box-only, well-posedness and leak guards for build drills"
```

---

### Task 9: Score a cell submission over HTTP

**Files:**
- Modify: `src/server/score.ts`
- Modify: `src/server/score.test.ts` (append)

**Interfaces:**
- Consumes: `validateCells` from `../lib/scoring/validate.ts`; `scoreSolid` from `../lib/scoring/solid.ts`; `answerKey`, `getDrill` from `../drills/registry.ts`.
- Produces: `ScoringLookup` gains `| { found: true; mode: "build"; key: Cell[] }`.

**`kind` already exists as `"views" | "figure"`.** This adds a third value, `"solid"`, carrying `cells` instead of `primitives`. The spec's §8 assumed a larger change than the code actually needs.

**The mode/kind mapping is deliberately not the identity:** a drill's `mode` is `"build"`, a submission's `kind` is `"solid"`. Keep them distinct — the drill's mode says what the exercise asks for, the submission's kind says what shape arrived.

- [ ] **Step 1: Write the failing tests**

Append to `src/server/score.test.ts`, following the existing fixture style in that file:

```ts
test("a correct cell submission scores perfect", () => {
  const key: Cell[] = [[0, 0, 0], [1, 0, 0]];
  const lookup = () => ({ found: true, mode: "build", key } as const);
  const r = handleScoreRequest(
    { drillId: "x", kind: "solid", cells: [[0, 0, 0], [1, 0, 0]] },
    "ip", 0, freshLimiter(), lookup,
  );
  assert.equal(r.status, 200);
  assert.equal((r.body as { perfect: boolean }).perfect, true);
});

test("a wrong cell submission answers 200 with a diff, not an error", () => {
  const key: Cell[] = [[0, 0, 0], [1, 0, 0]];
  const lookup = () => ({ found: true, mode: "build", key } as const);
  const r = handleScoreRequest(
    { drillId: "x", kind: "solid", cells: [[0, 0, 0]] },
    "ip", 0, freshLimiter(), lookup,
  );
  assert.equal(r.status, 200, "a wrong drawing is a scoring outcome, not a transport failure");
  assert.equal((r.body as { perfect: boolean }).perfect, false);
});

test("submitting cells to a views exercise is refused before any scoring", () => {
  const lookup = () => ({ found: true, mode: "views", convention: "first_angle", key: EMPTY_VIEWS } as const);
  const r = handleScoreRequest(
    { drillId: "x", kind: "solid", cells: [[0, 0, 0]] },
    "ip", 0, freshLimiter(), lookup,
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});

test("submitting primitives to a build exercise is refused", () => {
  const lookup = () => ({ found: true, mode: "build", key: [[0, 0, 0]] as Cell[] } as const);
  const r = handleScoreRequest(
    { drillId: "x", kind: "views", primitives: [] },
    "ip", 0, freshLimiter(), lookup,
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});

test("a malformed cell set is rejected with its validation reason", () => {
  const lookup = () => ({ found: true, mode: "build", key: [[0, 0, 0]] as Cell[] } as const);
  const r = handleScoreRequest(
    { drillId: "x", kind: "solid", cells: [[0, 0, 0.5]] },
    "ip", 0, freshLimiter(), lookup,
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "NOT_ON_GRID");
});

test("rate limiting still happens BEFORE validation for a cell submission", () => {
  // The order is a security property, not a style choice: a flood of oversized
  // bodies must not cost full validation per request.
  const limiter = exhaustedLimiter();
  const lookup = () => ({ found: true, mode: "build", key: [[0, 0, 0]] as Cell[] } as const);
  const r = handleScoreRequest(
    { drillId: "x", kind: "solid", cells: "not even an array" },
    "ip", 0, limiter, lookup,
  );
  assert.equal(r.status, 429, "throttling must precede validation");
});

test("an unknown kind is refused", () => {
  const lookup = () => ({ found: true, mode: "build", key: [[0, 0, 0]] as Cell[] } as const);
  const r = handleScoreRequest(
    { drillId: "x", kind: "cells", cells: [] },
    "ip", 0, freshLimiter(), lookup,
  );
  assert.equal(r.status, 400);
  assert.equal((r.body as { reason: string }).reason, "BAD_KIND");
});
```

Reuse whatever limiter helpers that file already defines; if it builds limiters inline, follow that pattern rather than introducing `freshLimiter`/`exhaustedLimiter`. Add `import type { Cell } from "../lib/geometry/rotate3.ts";`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm test 2>&1 | grep -A 3 'cell submission'`
Expected: FAIL — `kind: "solid"` is rejected as `BAD_KIND` by the existing guard.

- [ ] **Step 3: Implement**

In `src/server/score.ts`:

```ts
import { validateAttempt, validateCells } from "../lib/scoring/validate.ts";
import { scoreSolid } from "../lib/scoring/solid.ts";
import type { Cell } from "../lib/geometry/rotate3.ts";
```

Extend `ScoringLookup`:

```ts
export type ScoringLookup = (id: string) =>
  | { found: false }
  | { found: true; mode: "views"; convention: Convention; key: KeyViews }
  | { found: true; mode: "figure"; key: Primitive[] }
  | { found: true; mode: "build"; key: Cell[] };
```

Add to `defaultLookup`, before the figure branch:

```ts
  if (drill.mode === "build") {
    return { found: true, mode: "build", key: answerKey(drill) };
  }
```

Replace the kind check and the scoring tail of `handleScoreRequest`:

```ts
  const { drillId, kind, primitives, cells } = body as Record<string, unknown>;
  if (typeof drillId !== "string") return fail(400, "BAD_DRILL_ID");
  if (kind !== "views" && kind !== "figure" && kind !== "solid") return fail(400, "BAD_KIND");

  const found = lookup(drillId);
  if (!found.found) return fail(404, "NO_SUCH_DRILL");

  // A drill's MODE says what the exercise asks for; a submission's KIND says
  // what shape arrived. They are deliberately different words, and "solid" is
  // the submission shape for a "build" exercise.
  const expectedKind = found.mode === "build" ? "solid" : found.mode;
  if (expectedKind !== kind) return fail(400, "BAD_KIND");

  if (found.mode === "build") {
    const validated = validateCells(cells);
    if (!validated.ok) return fail(400, validated.reason);
    return { status: 200, body: scoreSolid(validated.cells, found.key) };
  }

  const validated = validateAttempt(primitives);
  if (!validated.ok) return fail(400, validated.reason);

  const result = found.mode === "views"
    ? scoreViews(validated.primitives, found.key, found.convention)
    : scoreFigure(validated.primitives, found.key);
  return { status: 200, body: result };
```

- [ ] **Step 4: Run the whole suite**

Run: `npm test && npm run lint && npm run typecheck && npm run build`
Expected: all PASS.

- [ ] **Step 5: Verify against a running server**

```bash
npm run dev &
sleep 5
curl -s localhost:3000/api/drills/build-corner-step | head -c 600; echo
curl -s -X POST localhost:3000/api/score -H 'content-type: application/json' \
  -d '{"drillId":"build-corner-step","kind":"solid","cells":[[0,0,0]]}' | head -c 400; echo
```

Confirm by reading the output, not the exit code (AGENTS.md §6): the public half contains `promptViews`, `promptConvention` and `base`, and contains **no** `solid` and no `cells`; the score response is a 200 with `perfect: false` and a populated `diff`.

- [ ] **Step 6: Commit**

```bash
git add src/server/score.ts src/server/score.test.ts
git commit -m "feat(server): score a cell submission for a build drill"
```

---

### Task 10: Look at it, then open the PR

**Files:** none changed unless a defect is found.

**Why this task exists:** AGENTS.md §4 — *"Reading the rendered page is the single highest-yield check in this project."* Wave 1 has no page, but it does have a figure, and `viewsFigure` output for these two new solids has never been looked at by a person. The engine spec §3.2 committed to one render before this is called done.

- [ ] **Step 1: Render the two prompt figures**

With `npm run dev` running and headless Chrome on `--remote-debugging-port=9222`, use `npm run screenshot` against the landing page (which now renders the `reading-views` topic card and its preview).

- [ ] **Step 2: Read it as a student**

Ask of each prompt figure, in order:
1. Can the three views be told apart, and is each one's outline readable?
2. Are the hidden lines visible as dashed, and distinguishable from solid ones?
3. Is there a grid to count squares against? (The views figure had no grid on its first outing, which made an oblique exercise literally unanswerable — §9's 2026-09-02 entry.)
4. **Would a student who followed the prompt exactly produce the key?**

Record the answers in the session log entry. If any is "no", fix it before the PR.

- [ ] **Step 3: Update AGENTS.md**

- §3 Done list: add Type B wave 1.
- §3 catalogue table: `reading-views` is now 2 of 10, not 0 of 10.
- §4: wave 1 is done; wave 2 is the builder component, hit-testing, the §7.1 isolation relaxation, feedback colours, and the other eight exercises.
- §6: add any gotcha found during this work.
- §9: append a session row.

- [ ] **Step 4: Full verification, then the PR**

```bash
npm test && npm run lint && npm run typecheck && npm run build
git push -u origin feat/type-b-engine
GH_TOKEN=$(gh auth token --user adamafzainizam) gh pr create --fill
```

Then set a real title and body with the REST API, because `gh pr edit` prints a Projects-classic deprecation warning, exits 0, and changes nothing (AGENTS.md §6):

```bash
GH_TOKEN=$(gh auth token --user adamafzainizam) gh api -X PATCH \
  repos/adamafzainizam/orthodrill/pulls/<N> \
  -f title="Type B wave 1: the reverse-drill engine and server" -F body=@body.md
```

**Re-read the PR afterwards to confirm the edit applied.** Verify the result, not the exit code.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §2 premise / well-posedness guard | 8 |
| §3 four viewpoints, rotated occupancy | 1 |
| §3.2 five verification checks | 1 (steps 1, 5) |
| §4 box-only, enforced not trusted | 8 |
| §5.1 diff, translation-invariant | 2, 4 |
| §5.2 regions, `where`, derived view naming | 4, 5 |
| §5.3 the honest outcome | 5 |
| §5.4 `generateViewsFromOccupancy` | 3 |
| §6 leak rule extended to `build` | 8 |
| §7 own topic, hints, preview, `addedOn` | 7 |
| §8 API, `kind` required, cells rebuilt | 6, 9 |
| §9 round trip | 9 |

**Not covered here, deliberately:** the §7.1 isolation relaxation (wave 2 — nothing client-side exists yet to need it), the builder component and hit-testing (wave 2), and the remaining eight exercises (wave 2, where §7's read-as-a-student check can actually be applied).

**Type consistency:** `Cell` is defined once in `rotate3.ts` and imported everywhere else — `cells.ts`, `solid.ts`, `validate.ts`, `registry.ts`, `score.ts`. `QuarterTurn` is used only in `rotate3.ts` in wave 1; wave 2's hit-testing is its first consumer. Drill `mode` is `"build"`; submission `kind` is `"solid"`; Task 9 states why they differ and maps between them in one place.
