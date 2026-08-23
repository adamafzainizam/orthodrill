# Generator (Views) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure generator that turns a solid model — a base block plus axis-aligned subtractive features — into the three orthographic views the scorer consumes as an answer key.

**Architecture:** Nine pure modules under `src/lib/geometry/`. The solid is rasterised into a 3D occupancy grid; each view walks that grid along its line of sight, emitting unit-length boundary edges tagged visible or hidden, which are then merged into segments. Cylindrical holes bypass the grid entirely and are emitted analytically.

**Tech Stack:** TypeScript, `node --test` with native type stripping. No new dependencies.

## Global Constraints

- **Purity.** Nothing in `src/lib/geometry/` may import a framework, touch the filesystem, or perform I/O. `AGENTS.md` §2 constraint 3.
- **The generator must never produce a wrong answer key.** `AGENTS.md` §5.2. When in doubt, prefer throwing over guessing.
- **Coordinates are integers.** Grid-snapped. Radii are positive integers.
- **Screen y increases downward**, matching the scorer.
- **"Side" means the right-side view.** Fixed by `src/lib/scoring/placement.ts`.
- **Import the scorer's vocabulary**, never redeclare it: `Primitive`, `Segment`, `Circle` from `src/lib/scoring/primitives.ts`; `KeyViews` from `src/lib/scoring/assign.ts`; `ViewName` from `src/lib/scoring/types.ts`.
- **English only.** No i18n.
- **Git:** this plan is one branch (`feat/generator`), atomic commits per task, PR at the end.
- **Every task runs `npm test`, `npm run lint` AND `npm run typecheck` before committing.** `npm test` strips types without checking them, so a type error survives a green suite. Run `npm run build` once first if typecheck reports a spurious `TS2304: Cannot find name 'LayoutProps'`.
- Read the design spec `docs/superpowers/specs/2026-08-21-generator-views-design.md` before starting. Read `AGENTS.md` §5 and §6.

## Precondition

**PR #1 (`feat/scorer`) must be merged to `main` before Task 2.** This branch was cut from `main` before the scorer landed, so `src/lib/scoring/` does not exist here yet. Task 1 Step 1 merges it in. If PR #1 is still open, stop and say so — do not vendor or stub the scorer's types.

## Refinement to the spec, applied throughout

The spec (§11) accepted that cylinders would staircase in the occupancy grid. **They do not, because they never enter it.** The grid is built from box operations only. Cylinder primitives are emitted analytically by `bore.ts` and consult the box-only grid for occlusion.

This removes the staircase limitation entirely and is strictly better than what the spec accepted. The cost is that seeing *through* one hole to a feature behind it is not modelled — already excluded by the approved spec, and now enforced by a validation error rather than left implicit (Task 7).

---

## File Structure

Two modules here are not in the design's §9 table. `viewspec.ts` splits the
coordinate table out of `project.ts`, because it is the highest-risk code in the
generator and deserves its own file and its own tests. `merge.ts` answers the
design's §12 open question — collinear merging is its own module, not part of
projection, because it is pure list manipulation with no geometry in it.

| File | Responsibility |
|---|---|
| `src/lib/geometry/solid.ts` | the `Solid` model and its immutable builders |
| `src/lib/geometry/features.ts` | `step`/`notch`/`slot`/`opening` authoring helpers |
| `src/lib/geometry/occupancy.ts` | 3D grid from box ops; `isSolid`, `sizeAlong` |
| `src/lib/geometry/viewspec.ts` | the three view definitions — the coordinate table from §7 |
| `src/lib/geometry/project.ts` | grid + view → unit-length edges tagged visible/hidden |
| `src/lib/geometry/merge.ts` | collinear unit edges → lattice segments |
| `src/lib/geometry/bore.ts` | cylinder projections: circle, cross, bore lines, centre line |
| `src/lib/geometry/views.ts` | compose everything into `KeyViews`; validation |
| `src/lib/geometry/fixtures/` | golden parts, each with its citation and status |
| `scripts/verification-sheet.ts` | dev-only SVG sheet. NOT library code, NOT pure |

---

### Task 1: Branch preparation and the solid model

**Files:**
- Modify: none (merge only)
- Create: `src/lib/geometry/solid.ts`
- Test: `src/lib/geometry/solid.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Axis = "x" | "y" | "z"`
  - `type Box = { x: number; y: number; z: number; w: number; d: number; h: number }`
  - `type BoxOp = { kind: "box"; box: Box; name?: string }`
  - `type CylinderOp = { kind: "cylinder"; axis: Axis; u: number; v: number; r: number; name?: string }`
  - `type Op = BoxOp | CylinderOp`
  - `type Solid = { base: { w: number; d: number; h: number }; ops: Op[] }`
  - `block(w: number, d: number, h: number): Solid`
  - `subtractBox(s: Solid, box: Box, name?: string): Solid`
  - `subtractCylinder(s: Solid, axis: Axis, u: number, v: number, r: number, name?: string): Solid`

- [ ] **Step 1: Merge the scorer into this branch**

```bash
cd /home/adom/Documents/orthodrill
git checkout feat/generator
git fetch origin
git merge origin/main
ls src/lib/scoring/primitives.ts
```

Expected: `src/lib/scoring/primitives.ts` exists. If it does not, PR #1 has not merged — STOP and report that, do not continue.

- [ ] **Step 2: Write the failing tests**

Create `src/lib/geometry/solid.test.ts`:

```typescript
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./solid.ts`.

- [ ] **Step 4: Write the implementation**

Create `src/lib/geometry/solid.ts`:

```typescript
/**
 * The solid model: a base block plus an ordered list of subtractive operations,
 * all axis-aligned on an integer grid.
 *
 * TWO operations, not five. The approved spec names step, notch, slot and
 * rectangular opening as separate feature types; under an occupancy model they
 * are all "remove an axis-aligned box" and differ only in where the box sits.
 * The five names survive as authoring helpers in features.ts. Four near-identical
 * code paths would be four places for a wrong answer key to hide.
 *
 * PURE. No I/O. See AGENTS.md §2 constraint 3.
 */

export type Axis = "x" | "y" | "z";

/** Half-open cell region: x..x+w, y..y+d, z..z+h. */
export type Box = {
  x: number; y: number; z: number;
  w: number; d: number; h: number;
};

export type BoxOp = { kind: "box"; box: Box; name?: string };

/**
 * A through-hole spanning the whole block along `axis`.
 *
 * `u` and `v` are the centre coordinates IN THE PLANE PERPENDICULAR TO `axis`,
 * taken in the order the remaining two axes appear in x -> y -> z:
 *   axis "x" -> (u, v) = (y, z)
 *   axis "y" -> (u, v) = (x, z)
 *   axis "z" -> (u, v) = (x, y)
 * Named u/v rather than cx/cy because "cx" would be ambiguous for two of the
 * three axes, and a silently transposed hole centre survives property tests.
 */
export type CylinderOp = {
  kind: "cylinder";
  axis: Axis; u: number; v: number; r: number;
  name?: string;
};

export type Op = BoxOp | CylinderOp;

export type Solid = {
  base: { w: number; d: number; h: number };
  ops: Op[];
};

function requireInteger(label: string, ...values: number[]): void {
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`${label} must be an integer, got ${v}`);
  }
}

function requirePositive(label: string, ...values: number[]): void {
  for (const v of values) {
    if (v <= 0) throw new Error(`${label} must be positive, got ${v}`);
  }
}

export function block(w: number, d: number, h: number): Solid {
  requireInteger("block dimensions", w, d, h);
  requirePositive("block dimensions", w, d, h);
  return { base: { w, d, h }, ops: [] };
}

export function subtractBox(s: Solid, box: Box, name?: string): Solid {
  requireInteger("box coordinates", box.x, box.y, box.z, box.w, box.d, box.h);
  requirePositive("box dimensions", box.w, box.d, box.h);
  return { base: s.base, ops: [...s.ops, { kind: "box", box, name }] };
}

export function subtractCylinder(
  s: Solid, axis: Axis, u: number, v: number, r: number, name?: string,
): Solid {
  requireInteger("cylinder centre", u, v);
  requireInteger("cylinder radius", r);
  requirePositive("cylinder radius", r);
  return { base: s.base, ops: [...s.ops, { kind: "cylinder", axis, u, v, r, name }] };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 9 new tests in this file.

- [ ] **Step 6: Commit**

```bash
git add src/lib/geometry/solid.ts src/lib/geometry/solid.test.ts
git commit -m "feat: the solid model as a base block plus subtractive operations

Two geometric operations, not the spec's five feature types. Step, notch, slot
and opening are all 'remove an axis-aligned box' and differ only in placement;
collapsing them removes three near-duplicate code paths from the one part of
the system that must never be wrong."
```

---

### Task 2: The occupancy grid

**Files:**
- Create: `src/lib/geometry/occupancy.ts`
- Test: `src/lib/geometry/occupancy.test.ts`

**Interfaces:**
- Consumes: `Solid`, `Axis` from `./solid.ts`
- Produces:
  - `type Occupancy = { w: number; d: number; h: number; isSolid(i: number, j: number, k: number): boolean }`
  - `buildOccupancy(s: Solid): Occupancy`
  - `sizeAlong(o: Occupancy, axis: Axis): number`

**Cylinder operations are deliberately ignored here.** Including them would
staircase the bore, and the generator would then be unable to emit the exact
`Circle` primitive the scorer compares against. Holes are handled analytically in
Task 6.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/occupancy.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildOccupancy, sizeAlong } from "./occupancy.ts";
import { block, subtractBox, subtractCylinder } from "./solid.ts";

test("a plain block is solid everywhere inside and empty outside", () => {
  const o = buildOccupancy(block(2, 2, 2));
  assert.equal(o.isSolid(0, 0, 0), true);
  assert.equal(o.isSolid(1, 1, 1), true);
  assert.equal(o.isSolid(2, 0, 0), false);
  assert.equal(o.isSolid(-1, 0, 0), false);
});

test("sizeAlong reports the extent on each axis", () => {
  const o = buildOccupancy(block(6, 4, 2));
  assert.equal(sizeAlong(o, "x"), 6);
  assert.equal(sizeAlong(o, "y"), 4);
  assert.equal(sizeAlong(o, "z"), 2);
});

test("a subtracted box removes exactly its cells", () => {
  const o = buildOccupancy(
    subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 2, w: 2, d: 4, h: 2 }),
  );
  assert.equal(o.isSolid(0, 0, 2), false); // removed
  assert.equal(o.isSolid(1, 3, 3), false); // removed
  assert.equal(o.isSolid(2, 0, 2), true);  // outside the removed box
  assert.equal(o.isSolid(0, 0, 1), true);  // below the removed box
});

test("subtractions apply in order and overlap harmlessly", () => {
  const o = buildOccupancy(
    subtractBox(
      subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 2 }),
      { x: 1, y: 1, z: 1, w: 2, d: 2, h: 2 },
    ),
  );
  assert.equal(o.isSolid(0, 0, 0), false);
  assert.equal(o.isSolid(2, 2, 2), false);
  assert.equal(o.isSolid(3, 3, 3), true);
});

// This is the refinement in this plan's header, pinned by a test so nobody
// "fixes" it later: cylinders must NOT rasterise into the grid.
test("a cylinder does not affect the occupancy grid", () => {
  const withHole = subtractCylinder(block(6, 6, 2), "z", 3, 3, 2);
  const plain = buildOccupancy(block(6, 6, 2));
  const holed = buildOccupancy(withHole);
  for (let i = 0; i < 6; i++) {
    for (let j = 0; j < 6; j++) {
      assert.equal(holed.isSolid(i, j, 0), plain.isSolid(i, j, 0));
    }
  }
});

test("a box removed entirely outside the block changes nothing", () => {
  const o = buildOccupancy(
    subtractBox(block(2, 2, 2), { x: 10, y: 10, z: 10, w: 2, d: 2, h: 2 }),
  );
  assert.equal(o.isSolid(0, 0, 0), true);
  assert.equal(o.isSolid(1, 1, 1), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./occupancy.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/occupancy.ts`:

```typescript
/**
 * Rasterise a solid into a 3D occupancy grid.
 *
 * WHY A GRID. Whether an edge is drawn solid or dashed depends on the whole
 * solid, not on the feature that produced it: a hole's bore lines are hidden
 * inside a block, but cut a notch away in front of them and they become visible.
 * Enumerating feature-interaction cases by hand is where wrong answer keys come
 * from. On a grid, visibility reduces to one question with one correct answer:
 * is this the first material along the ray?
 *
 * CYLINDERS ARE DELIBERATELY IGNORED. Rasterising a bore would staircase it, and
 * the generator could then never emit the exact Circle primitive the scorer
 * compares against. Holes are projected analytically in bore.ts, which consults
 * this grid only to ask what is in front of them.
 *
 * PURE. No I/O.
 */
import type { Axis, Solid } from "./solid.ts";

export type Occupancy = {
  w: number; d: number; h: number;
  isSolid(i: number, j: number, k: number): boolean;
};

export function sizeAlong(o: Occupancy, axis: Axis): number {
  return axis === "x" ? o.w : axis === "y" ? o.d : o.h;
}

export function buildOccupancy(s: Solid): Occupancy {
  const { w, d, h } = s.base;
  const cells = new Uint8Array(w * d * h).fill(1);
  const index = (i: number, j: number, k: number) => (k * d + j) * w + i;

  for (const op of s.ops) {
    if (op.kind !== "box") continue; // cylinders never enter the grid
    const b = op.box;
    const i0 = Math.max(0, b.x), i1 = Math.min(w, b.x + b.w);
    const j0 = Math.max(0, b.y), j1 = Math.min(d, b.y + b.d);
    const k0 = Math.max(0, b.z), k1 = Math.min(h, b.z + b.h);
    for (let k = k0; k < k1; k++)
      for (let j = j0; j < j1; j++)
        for (let i = i0; i < i1; i++) cells[index(i, j, k)] = 0;
  }

  return {
    w, d, h,
    isSolid(i, j, k) {
      if (i < 0 || j < 0 || k < 0 || i >= w || j >= d || k >= h) return false;
      return cells[index(i, j, k)] === 1;
    },
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 6 new tests in this file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/occupancy.ts src/lib/geometry/occupancy.test.ts
git commit -m "feat: rasterise the solid into an occupancy grid

Visibility is a property of the whole solid, not of the feature that produced
an edge, so it is answered by asking the grid what is first along the ray
rather than by enumerating feature-interaction cases by hand.

Cylinders deliberately never enter the grid. Rasterising a bore would staircase
it and make the exact Circle primitive unemittable; holes stay analytic."
```

---

### Task 3: View specifications

**Files:**
- Create: `src/lib/geometry/viewspec.ts`
- Test: `src/lib/geometry/viewspec.test.ts`

**Interfaces:**
- Consumes: `Axis` from `./solid.ts`; `ViewName` from `../scoring/types.ts`
- Produces:
  - `type ViewSpec = { name: ViewName; depth: Axis; nearIsLow: boolean; su: Axis; suSign: 1 | -1; sv: Axis; svSign: 1 | -1 }`
  - `const VIEW_SPECS: Record<ViewName, ViewSpec>`

This is the coordinate table from §7 of the design, encoded as data for the same
reason `CONVENTIONS` is data: it is the single most likely place for a silent
mirror error, and it must be correctable without touching an algorithm.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/viewspec.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { VIEW_SPECS } from "./viewspec.ts";

test("each view looks along a different axis", () => {
  const axes = [VIEW_SPECS.front.depth, VIEW_SPECS.top.depth, VIEW_SPECS.side.depth];
  assert.deepEqual([...new Set(axes)].sort(), ["x", "y", "z"]);
});

test("the front view maps model x to screen x and model z upward", () => {
  const s = VIEW_SPECS.front;
  assert.equal(s.depth, "y");
  assert.equal(s.nearIsLow, true);
  assert.deepEqual([s.su, s.suSign], ["x", 1]);
  assert.deepEqual([s.sv, s.svSign], ["z", -1]);
});

test("the top view is seen from above, so nearer means larger z", () => {
  const s = VIEW_SPECS.top;
  assert.equal(s.depth, "z");
  assert.equal(s.nearIsLow, false);
  assert.deepEqual([s.su, s.suSign], ["x", 1]);
  assert.deepEqual([s.sv, s.svSign], ["y", -1]);
});

test("the side view is the RIGHT-side view, so nearer means larger x", () => {
  const s = VIEW_SPECS.side;
  assert.equal(s.depth, "x");
  assert.equal(s.nearIsLow, false);
  assert.deepEqual([s.su, s.suSign], ["y", 1]);
  assert.deepEqual([s.sv, s.svSign], ["z", -1]);
});

// Both follow from the table and neither is obvious; see design §7.
test("front-of-object sits at the bottom of the top view", () => {
  const s = VIEW_SPECS.top;
  const front = s.svSign * 0;   // model y = 0
  const back = s.svSign * 10;   // model y = 10
  assert.ok(front > back, "smaller model y must map to LARGER screen y (lower)");
});

test("front-of-object sits at the left of the right-side view", () => {
  const s = VIEW_SPECS.side;
  const front = s.suSign * 0;
  const back = s.suSign * 10;
  assert.ok(front < back, "smaller model y must map to SMALLER screen x (further left)");
});

test("every view uses two distinct screen axes, neither of them the depth axis", () => {
  for (const s of Object.values(VIEW_SPECS)) {
    assert.notEqual(s.su, s.sv);
    assert.notEqual(s.su, s.depth);
    assert.notEqual(s.sv, s.depth);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./viewspec.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/viewspec.ts`:

```typescript
/**
 * How each of the three views maps model space onto screen space.
 *
 * Model space is right-handed: +x right, +y back (away from the front viewer),
 * +z up. Screen space follows the scorer: y increases DOWNWARD.
 *
 * THIS TABLE IS THE MOST DANGEROUS CODE IN THE GENERATOR. A wrong sign produces
 * a view that is perfectly self-consistent and perfectly MIRRORED, and no
 * property test can catch that — symmetry invariants stay green under a mirror,
 * because that is what symmetry means. It is data rather than branching logic
 * for the same reason CONVENTIONS in placement.ts is: so it can be corrected
 * against a reference without touching an algorithm.
 *
 * Verified against golden fixtures, which exist chiefly to pin this table and
 * must therefore be ASYMMETRIC. See the design document §8.
 *
 * PURE. No I/O.
 */
import type { Axis } from "./solid.ts";
import type { ViewName } from "../scoring/types.ts";

export type ViewSpec = {
  name: ViewName;
  /** The axis along the line of sight. */
  depth: Axis;
  /** True when the nearest material has the SMALLEST coordinate on `depth`. */
  nearIsLow: boolean;
  su: Axis; suSign: 1 | -1;
  sv: Axis; svSign: 1 | -1;
};

export const VIEW_SPECS: Record<ViewName, ViewSpec> = {
  // Seen from the front, at -y looking toward +y. Nearest material is at low y.
  front: { name: "front", depth: "y", nearIsLow: true, su: "x", suSign: 1, sv: "z", svSign: -1 },
  // Seen from above, at +z looking down. Nearest material is at HIGH z.
  // svSign -1 puts the front of the object at the bottom of the view.
  top: { name: "top", depth: "z", nearIsLow: false, su: "x", suSign: 1, sv: "y", svSign: -1 },
  // The RIGHT-side view, at +x looking toward -x. Nearest material is at HIGH x.
  // suSign +1 puts the front of the object at the left of the view.
  side: { name: "side", depth: "x", nearIsLow: false, su: "y", suSign: 1, sv: "z", svSign: -1 },
};
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 7 new tests in this file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/viewspec.ts src/lib/geometry/viewspec.test.ts
git commit -m "feat: the three view specifications as a data table

A wrong sign here produces a perfectly self-consistent, perfectly mirrored view,
and no property test can catch it: symmetry invariants stay green under a mirror.
Encoded as data, like the conventions table, so it can be corrected against a
reference without touching an algorithm."
```

---

### Task 4: Edge extraction with visibility

**Files:**
- Create: `src/lib/geometry/project.ts`
- Test: `src/lib/geometry/project.test.ts`

**Interfaces:**
- Consumes: `Occupancy`, `sizeAlong` from `./occupancy.ts`; `ViewSpec` from `./viewspec.ts`; `Axis` from `./solid.ts`
- Produces:
  - `type UnitEdge = { u: number; v: number; along: "u" | "v"; hidden: boolean }`
  - `extractEdges(o: Occupancy, spec: ViewSpec): UnitEdge[]`

**The algorithm, stated once so the steps below make sense.**

Faces perpendicular to the line of sight project to areas, not lines, so they
draw nothing. Only faces *parallel* to the line of sight become edges. Such a
face sits on the boundary between two adjacent cell columns.

For each boundary line, walk the depth axis from nearest to farthest:
- a **face** exists at depth `t` when exactly one of the two adjacent columns has
  material at `t`;
- the line becomes **occluded** from depth `t` onward when *both* adjacent columns
  have material at `t`, because it is then buried inside solid;
- the edge is **visible** if the first face found is not yet occluded, and
  **hidden** otherwise. Only the first face matters — occlusion never reverses.

Only the two adjacent columns can cover the line, which is why this is exact
rather than an approximation.

Lattice coordinates: `u` runs `0..U` and `v` runs `0..V` where `U`/`V` are cell
counts. `along: "u"` is the unit segment from `(u, v)` to `(u+1, v)`, sitting on
the `v` boundary between cell rows `v-1` and `v`. `along: "v"` is from `(u, v)`
to `(u, v+1)` on the `u` boundary between cell columns `u-1` and `u`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/project.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { extractEdges, type UnitEdge } from "./project.ts";
import { buildOccupancy } from "./occupancy.ts";
import { VIEW_SPECS } from "./viewspec.ts";
import { block, subtractBox } from "./solid.ts";

const visible = (es: UnitEdge[]) => es.filter((e) => !e.hidden);
const hidden = (es: UnitEdge[]) => es.filter((e) => e.hidden);

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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./project.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/project.ts`:

```typescript
/**
 * Project an occupancy grid along one line of sight into unit-length edges,
 * each tagged visible or hidden.
 *
 * Faces perpendicular to the line of sight project to areas, not lines, and so
 * draw nothing. Only faces PARALLEL to the line of sight become edges, and every
 * such face sits on the boundary between two adjacent cell columns.
 *
 * For each boundary line, walking from nearest to farthest:
 *   - a FACE exists at depth t when exactly one adjacent column has material;
 *   - the line becomes OCCLUDED from t onward when BOTH adjacent columns have
 *     material, because it is then buried inside solid;
 *   - the edge is visible when the first face found is not yet occluded.
 * Only the first face matters, because occlusion never reverses.
 *
 * This is exact rather than approximate: only the two adjacent columns can
 * cover the line.
 *
 * PURE. No I/O.
 */
import { sizeAlong, type Occupancy } from "./occupancy.ts";
import type { ViewSpec } from "./viewspec.ts";
import type { Axis } from "./solid.ts";

export type UnitEdge = { u: number; v: number; along: "u" | "v"; hidden: boolean };

/** Is the cell at screen column (a, b) and depth index t solid? */
function cellAt(o: Occupancy, spec: ViewSpec, a: number, b: number, t: number): boolean {
  const T = sizeAlong(o, spec.depth);
  const depthIndex = spec.nearIsLow ? t : T - 1 - t;
  const coord: Record<Axis, number> = { x: 0, y: 0, z: 0 };
  coord[spec.su] = a;
  coord[spec.sv] = b;
  coord[spec.depth] = depthIndex;
  return o.isSolid(coord.x, coord.y, coord.z);
}

/**
 * Walk one boundary line from near to far.
 * Returns null when the line carries no face at all.
 */
function classify(
  T: number,
  lo: (t: number) => boolean, hi: (t: number) => boolean,
): boolean | null {
  let occluded = false;
  for (let t = 0; t < T; t++) {
    const a = lo(t), b = hi(t);
    if (a !== b) return occluded;   // first face decides
    if (a && b) occluded = true;    // buried from here on
  }
  return null;
}

export function extractEdges(o: Occupancy, spec: ViewSpec): UnitEdge[] {
  const U = sizeAlong(o, spec.su);
  const V = sizeAlong(o, spec.sv);
  const T = sizeAlong(o, spec.depth);
  const edges: UnitEdge[] = [];

  // Edges running along u, sitting on v boundaries 0..V.
  for (let b = 0; b <= V; b++) {
    for (let a = 0; a < U; a++) {
      const h = classify(T,
        (t) => (b > 0 ? cellAt(o, spec, a, b - 1, t) : false),
        (t) => (b < V ? cellAt(o, spec, a, b, t) : false));
      if (h !== null) edges.push({ u: a, v: b, along: "u", hidden: h });
    }
  }

  // Edges running along v, sitting on u boundaries 0..U.
  for (let a = 0; a <= U; a++) {
    for (let b = 0; b < V; b++) {
      const h = classify(T,
        (t) => (a > 0 ? cellAt(o, spec, a - 1, b, t) : false),
        (t) => (a < U ? cellAt(o, spec, a, b, t) : false));
      if (h !== null) edges.push({ u: a, v: b, along: "v", hidden: h });
    }
  }

  return edges;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 7 new tests in this file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/project.ts src/lib/geometry/project.test.ts
git commit -m "feat: extract visible and hidden edges by walking the occupancy grid

Only faces parallel to the line of sight become edges, and each sits between two
adjacent columns. Walking from near to far, the first face decides visibility
and occlusion never reverses. Exact rather than approximate, because only those
two columns can cover the line."
```

---

### Task 5: Merging unit edges into segments

**Files:**
- Create: `src/lib/geometry/merge.ts`
- Test: `src/lib/geometry/merge.test.ts`

**Interfaces:**
- Consumes: `UnitEdge` from `./project.ts`
- Produces:
  - `type LatticeSegment = { u1: number; v1: number; u2: number; v2: number; hidden: boolean }`
  - `mergeEdges(es: UnitEdge[]): LatticeSegment[]`

A 4-unit-wide face arrives as four unit edges and must leave as one segment. A
drawing of unit dashes would compare as dozens of wrong primitives against a key
of whole lines.

Merging groups by line and visibility, then joins runs that touch. Visible and
hidden runs never merge with each other, because they are different primitives.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/merge.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeEdges } from "./merge.ts";
import type { UnitEdge } from "./project.ts";

const u = (uu: number, v: number, hidden = false): UnitEdge =>
  ({ u: uu, v, along: "u", hidden });
const v = (uu: number, vv: number, hidden = false): UnitEdge =>
  ({ u: uu, v: vv, along: "v", hidden });

test("adjacent unit edges on one line become a single segment", () => {
  const out = mergeEdges([u(0, 0), u(1, 0), u(2, 0)]);
  assert.deepEqual(out, [{ u1: 0, v1: 0, u2: 3, v2: 0, hidden: false }]);
});

test("input order does not matter", () => {
  const out = mergeEdges([u(2, 0), u(0, 0), u(1, 0)]);
  assert.deepEqual(out, [{ u1: 0, v1: 0, u2: 3, v2: 0, hidden: false }]);
});

test("a gap splits a line into two segments", () => {
  const out = mergeEdges([u(0, 0), u(1, 0), u(3, 0)]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { u1: 0, v1: 0, u2: 2, v2: 0, hidden: false });
  assert.deepEqual(out[1], { u1: 3, v1: 0, u2: 4, v2: 0, hidden: false });
});

// Different primitives; merging them would erase the distinction the scorer
// exists to report.
test("visible and hidden runs never merge with each other", () => {
  const out = mergeEdges([u(0, 0, false), u(1, 0, true)]);
  assert.equal(out.length, 2);
  assert.equal(out.find((s) => s.hidden === false)!.u2, 1);
  assert.equal(out.find((s) => s.hidden === true)!.u1, 1);
});

test("edges on different lines stay separate", () => {
  const out = mergeEdges([u(0, 0), u(0, 1)]);
  assert.equal(out.length, 2);
});

test("edges running along v merge along v", () => {
  const out = mergeEdges([v(0, 0), v(0, 1)]);
  assert.deepEqual(out, [{ u1: 0, v1: 0, u2: 0, v2: 2, hidden: false }]);
});

test("u-edges and v-edges crossing the same point do not merge", () => {
  const out = mergeEdges([u(0, 0), v(0, 0)]);
  assert.equal(out.length, 2);
});

test("no edges produce no segments", () => {
  assert.deepEqual(mergeEdges([]), []);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./merge.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/merge.ts`:

```typescript
/**
 * Join runs of unit-length edges into whole segments.
 *
 * A four-unit face arrives as four unit edges. Emitting it as four primitives
 * would compare as four wrong answers against a key holding one line, so the
 * merge is not cosmetic — it is part of being correct.
 *
 * Visible and hidden runs are never merged together. They are different
 * primitives, and collapsing them would erase exactly the distinction the
 * scorer exists to report.
 *
 * PURE. No I/O.
 */
import type { UnitEdge } from "./project.ts";

export type LatticeSegment = {
  u1: number; v1: number; u2: number; v2: number; hidden: boolean;
};

export function mergeEdges(es: UnitEdge[]): LatticeSegment[] {
  // Group by the line an edge lies on, and by visibility.
  const groups = new Map<string, UnitEdge[]>();
  for (const e of es) {
    // For along "u" the line is identified by v; for along "v" by u.
    const line = e.along === "u" ? e.v : e.u;
    const key = `${e.along}:${line}:${e.hidden ? "h" : "v"}`;
    const g = groups.get(key);
    if (g) g.push(e); else groups.set(key, [e]);
  }

  const out: LatticeSegment[] = [];
  for (const g of groups.values()) {
    const along = g[0].along;
    // Position along the line, which is the other coordinate.
    const pos = (e: UnitEdge) => (along === "u" ? e.u : e.v);
    const sorted = [...g].sort((a, b) => pos(a) - pos(b));

    let start = pos(sorted[0]);
    let end = start + 1;
    const flush = () => {
      const line = along === "u" ? sorted[0].v : sorted[0].u;
      out.push(along === "u"
        ? { u1: start, v1: line, u2: end, v2: line, hidden: sorted[0].hidden }
        : { u1: line, v1: start, u2: line, v2: end, hidden: sorted[0].hidden });
    };

    for (let i = 1; i < sorted.length; i++) {
      const p = pos(sorted[i]);
      if (p === end) { end = p + 1; continue; }
      flush();
      start = p; end = p + 1;
    }
    flush();
  }

  // Deterministic order so tests and fixtures are stable.
  return out.sort((a, b) => a.v1 - b.v1 || a.u1 - b.u1 || a.v2 - b.v2 || a.u2 - b.u2);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 8 new tests in this file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/merge.ts src/lib/geometry/merge.test.ts
git commit -m "feat: merge unit edges into whole segments

Not cosmetic. A four-unit face emitted as four primitives would compare as four
wrong answers against a key holding one line. Visible and hidden runs never
merge together, because that distinction is what the scorer reports."
```

---

### Task 6: Cylindrical through-hole projections

**Files:**
- Create: `src/lib/geometry/bore.ts`
- Test: `src/lib/geometry/bore.test.ts`

**Interfaces:**
- Consumes: `CylinderOp`, `Axis` from `./solid.ts`; `Occupancy`, `sizeAlong` from `./occupancy.ts`; `ViewSpec` from `./viewspec.ts`; `Primitive` from `../scoring/primitives.ts`
- Produces:
  - `const CENTRE_OVERSHOOT = 2`
  - `borePrimitives(op: CylinderOp, o: Occupancy, spec: ViewSpec): Primitive[]`

Emitted in **model lattice coordinates**, not screen coordinates. Task 7 applies
the sign flip and normalisation, so this module never worries about which way is
up.

Down the hole axis: one exact `Circle` plus a centre cross of two `centre`
segments overshooting the radius by `CENTRE_OVERSHOOT`. In the other two views:
two bore lines spanning the block along the axis, plus one `centre` line along
the axis. Bore lines are hidden wherever material lies in front of them, which
is asked of the occupancy grid rather than reasoned about.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/bore.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { borePrimitives, CENTRE_OVERSHOOT } from "./bore.ts";
import { buildOccupancy } from "./occupancy.ts";
import { VIEW_SPECS } from "./viewspec.ts";
import { block, subtractBox, subtractCylinder, type CylinderOp } from "./solid.ts";
import type { Circle, Segment } from "../scoring/primitives.ts";

const holed = subtractCylinder(block(8, 8, 4), "z", 4, 4, 2);
const op = holed.ops[0] as CylinderOp;
const occ = buildOccupancy(holed);

const circles = (ps: { kind: string }[]) => ps.filter((p) => p.kind === "circle");
const segments = (ps: { kind: string }[]) => ps.filter((p) => p.kind === "segment");

test("looking down the axis gives exactly one circle", () => {
  const ps = borePrimitives(op, occ, VIEW_SPECS.top);
  assert.equal(circles(ps).length, 1);
  const c = circles(ps)[0] as Circle;
  assert.equal(c.r, 2);
  assert.equal(c.type, "visible");
});

test("the circle carries a centre cross of two centre-type segments", () => {
  const ps = borePrimitives(op, occ, VIEW_SPECS.top);
  const centres = segments(ps).filter((s) => (s as Segment).type === "centre");
  assert.equal(centres.length, 2);
});

test("the centre cross overshoots the circle, as convention requires", () => {
  const ps = borePrimitives(op, occ, VIEW_SPECS.top);
  const centres = segments(ps).filter((s) => (s as Segment).type === "centre") as Segment[];
  const span = Math.max(...centres.map((s) => Math.max(
    Math.abs(s.x2 - s.x1), Math.abs(s.y2 - s.y1))));
  assert.equal(span, 2 * (2 + CENTRE_OVERSHOOT));
});

test("the other two views each get exactly two bore lines", () => {
  for (const spec of [VIEW_SPECS.front, VIEW_SPECS.side]) {
    const ps = borePrimitives(op, occ, spec);
    const bore = segments(ps).filter((s) => (s as Segment).type !== "centre");
    assert.equal(bore.length, 2, `${spec.name} should have two bore lines`);
    assert.equal(circles(ps).length, 0, `${spec.name} should have no circle`);
  }
});

test("bore lines are hidden when the hole is buried in material", () => {
  const ps = borePrimitives(op, occ, VIEW_SPECS.front);
  const bore = segments(ps).filter((s) => (s as Segment).type !== "centre") as Segment[];
  assert.ok(bore.every((s) => s.type === "hidden"));
});

// The case that makes visibility a global property rather than a per-feature one.
test("bore lines become visible where a notch removes the material in front", () => {
  const notched = subtractBox(holed, { x: 0, y: 0, z: 0, w: 8, d: 2, h: 4 }, "notch");
  const ps = borePrimitives(op, buildOccupancy(notched), VIEW_SPECS.front);
  const bore = segments(ps).filter((s) => (s as Segment).type !== "centre") as Segment[];
  assert.ok(bore.some((s) => s.type === "visible"),
    "removing the material in front of a bore must expose it");
});

test("every view carries a centre line for the hole", () => {
  for (const spec of Object.values(VIEW_SPECS)) {
    const ps = borePrimitives(op, occ, spec);
    const centres = segments(ps).filter((s) => (s as Segment).type === "centre");
    assert.ok(centres.length >= 1, `${spec.name} must carry a centre line`);
  }
});

test("a hole on the x axis puts its circle in the side view", () => {
  const xHoled = subtractCylinder(block(4, 8, 8), "x", 4, 4, 2);
  const xOp = xHoled.ops[0] as CylinderOp;
  const xOcc = buildOccupancy(xHoled);
  assert.equal(circles(borePrimitives(xOp, xOcc, VIEW_SPECS.side)).length, 1);
  assert.equal(circles(borePrimitives(xOp, xOcc, VIEW_SPECS.front)).length, 0);
  assert.equal(circles(borePrimitives(xOp, xOcc, VIEW_SPECS.top)).length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./bore.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/bore.ts`:

```typescript
/**
 * Project a cylindrical through-hole.
 *
 * Holes never enter the occupancy grid, because rasterising one would staircase
 * it and make the exact Circle primitive unemittable. They are projected
 * analytically here instead, and consult the grid only to ask what lies in front
 * of them.
 *
 * Down the axis: one circle and a centre cross. In the other two views: two bore
 * lines spanning the block, plus a centre line along the axis. Bore-line
 * visibility is asked of the grid rather than reasoned about, because a notch
 * cut in front of a bore exposes it and no per-feature rule would know that.
 *
 * Output is in MODEL LATTICE coordinates. views.ts applies the screen mapping.
 *
 * PURE. No I/O.
 */
import { sizeAlong, type Occupancy } from "./occupancy.ts";
import type { ViewSpec } from "./viewspec.ts";
import type { Axis, CylinderOp } from "./solid.ts";
import type { Primitive } from "../scoring/primitives.ts";

/** How far a centre line extends past the feature it marks. */
export const CENTRE_OVERSHOOT = 2;

/** The two axes perpendicular to `axis`, in x -> y -> z order. */
function planeAxes(axis: Axis): [Axis, Axis] {
  const all: Axis[] = ["x", "y", "z"];
  const [a, b] = all.filter((x) => x !== axis);
  return [a, b];
}

/** The hole's centre expressed as a full model coordinate on the two plane axes. */
function centreOn(op: CylinderOp, axis: Axis): number {
  const [pu, pv] = planeAxes(op.axis);
  if (axis === pu) return op.u;
  if (axis === pv) return op.v;
  throw new Error(`axis ${axis} is the hole axis, not a plane axis`);
}

const seg = (
  x1: number, y1: number, x2: number, y2: number, type: "visible" | "hidden" | "centre",
): Primitive => ({ kind: "segment", type, x1, y1, x2, y2 });

export function borePrimitives(
  op: CylinderOp, o: Occupancy, spec: ViewSpec,
): Primitive[] {
  // Looking straight down the hole: a circle plus a centre cross.
  if (spec.depth === op.axis) {
    const cu = centreOn(op, spec.su);
    const cv = centreOn(op, spec.sv);
    const reach = op.r + CENTRE_OVERSHOOT;
    return [
      { kind: "circle", type: "visible", cx: cu, cy: cv, r: op.r },
      seg(cu - reach, cv, cu + reach, cv, "centre"),
      seg(cu, cv - reach, cu, cv + reach, "centre"),
    ];
  }

  // Otherwise the hole axis lies in the plane of the view. One screen axis runs
  // ALONG the bore; the other is the one the bore lines are offset on.
  const alongScreen: "u" | "v" = spec.su === op.axis ? "u" : "v";
  const acrossAxis: Axis = alongScreen === "u" ? spec.sv : spec.su;
  const cAcross = centreOn(op, acrossAxis);
  const lengthAlong = sizeAlong(o, op.axis);

  const depthSize = sizeAlong(o, spec.depth);
  const cDepth = centreOn(op, spec.depth);

  /**
   * Is there material between the viewer and the bore, `t` along its length?
   * Asked of the grid rather than reasoned about: a notch cut in front of a
   * bore exposes it, and no per-feature rule would know that.
   */
  const solidInFront = (t: number, acrossCol: number): boolean => {
    for (let depthIndex = 0; depthIndex < depthSize; depthIndex++) {
      const nearerThanHole = spec.nearIsLow
        ? depthIndex < cDepth - op.r
        : depthIndex >= cDepth + op.r;
      if (!nearerThanHole) continue;
      const coord: Record<Axis, number> = { x: 0, y: 0, z: 0 };
      coord[op.axis] = t;
      coord[acrossAxis] = acrossCol;
      coord[spec.depth] = depthIndex;
      if (o.isSolid(coord.x, coord.y, coord.z)) return true;
    }
    return false;
  };

  /**
   * A bore line sits at a lattice coordinate, i.e. BETWEEN two cell columns,
   * so both must be consulted — it is buried only when material lies in front
   * in both. Sampling the single column `across` would treat the two bore
   * lines differently: `c - r` would sample a column inside the hole footprint
   * and `c + r` one outside it, so a notch cut symmetrically in front of a
   * symmetric hole would expose one bore line and bury the other.
   *
   * This is the same rule project.ts applies to its boundary lines, and the
   * two modules must agree. No clamping: isSolid bounds-checks to false, which
   * is the correct answer for a hole tangent to a face — clamping would report
   * the block's own silhouette bore line as hidden.
   */
  const occludedAt = (t: number, across: number): boolean =>
    solidInFront(t, across - 1) && solidInFront(t, across);

  const makeSeg = (
    a: number, b: number, acrossPos: number, isHidden: boolean,
  ): Primitive => {
    const type = isHidden ? "hidden" : "visible";
    return alongScreen === "u"
      ? seg(a, acrossPos, b, acrossPos, type)
      : seg(acrossPos, a, acrossPos, b, type);
  };

  const out: Primitive[] = [];

  for (const offset of [-op.r, op.r]) {
    const across = cAcross + offset;
    // Walk the bore's length and merge runs of equal visibility into segments.
    let runStart = 0;
    let runHidden = occludedAt(0, across);
    for (let t = 1; t <= lengthAlong; t++) {
      const h = t < lengthAlong ? occludedAt(t, across) : !runHidden; // force a flush
      if (h === runHidden) continue;
      out.push(makeSeg(runStart, t, across, runHidden));
      runStart = t;
      runHidden = h;
    }
  }

  // One centre line running the length of the bore.
  const reach = CENTRE_OVERSHOOT;
  out.push(alongScreen === "u"
    ? seg(-reach, cAcross, lengthAlong + reach, cAcross, "centre")
    : seg(cAcross, -reach, cAcross, lengthAlong + reach, "centre"));

  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 8 new tests in this file. If the notch test fails, the occlusion
walk in `occludedAt` is the thing to debug — do NOT weaken the test, since that
case is the entire justification for the grid.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/bore.ts src/lib/geometry/bore.test.ts
git commit -m "feat: project cylindrical through-holes analytically

Holes never enter the occupancy grid, so the circle stays exact rather than
staircased. Bore-line visibility is asked of the grid rather than reasoned
about: a notch cut in front of a bore exposes it, and no per-feature rule
would know that."
```

---

### Task 7: Composing the three views

**Files:**
- Create: `src/lib/geometry/views.ts`
- Test: `src/lib/geometry/views.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces:
  - `generateViews(s: Solid): KeyViews`
  - `validateSolid(s: Solid): void` — throws on overlapping holes and features

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/views.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { generateViews, validateSolid } from "./views.ts";
import { block, subtractBox, subtractCylinder } from "./solid.ts";
import { boundingBox } from "../scoring/primitives.ts";

test("a plain block gives three rectangular outlines", () => {
  const v = generateViews(block(6, 4, 2));
  assert.equal(v.front.length, 4);
  assert.equal(v.top.length, 4);
  assert.equal(v.side.length, 4);
});

test("each view starts at the origin", () => {
  const v = generateViews(block(6, 4, 2));
  for (const view of [v.front, v.top, v.side]) {
    const b = boundingBox(view)!;
    assert.equal(b.minX, 0);
    assert.equal(b.minY, 0);
  }
});

test("view extents match the block's dimensions", () => {
  const v = generateViews(block(6, 4, 2));
  const f = boundingBox(v.front)!;
  assert.deepEqual([f.maxX, f.maxY], [6, 2]); // width x height
  const t = boundingBox(v.top)!;
  assert.deepEqual([t.maxX, t.maxY], [6, 4]); // width x depth
  const s = boundingBox(v.side)!;
  assert.deepEqual([s.maxX, s.maxY], [4, 2]); // depth x height
});

// The orientation check property tests structurally cannot make. A notch at one
// named corner must appear on one named side.
test("a notch at the left end appears on the left of the front view", () => {
  const notched = subtractBox(block(8, 4, 4), { x: 0, y: 0, z: 2, w: 2, d: 4, h: 2 });
  const v = generateViews(notched);
  const b = boundingBox(v.front)!;
  // The removed corner is top-left: no primitive should occupy that corner.
  const topLeftOccupied = v.front.some((p) =>
    p.kind === "segment" && p.x1 < 2 && p.x2 <= 2 && p.y1 === b.minY && p.y2 === b.minY);
  assert.equal(topLeftOccupied, false, "the top-left corner was cut away");
});

test("a through-hole yields exactly one circle, in the view down its axis", () => {
  const v = generateViews(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2));
  assert.equal(v.top.filter((p) => p.kind === "circle").length, 1);
  assert.equal(v.front.filter((p) => p.kind === "circle").length, 0);
  assert.equal(v.side.filter((p) => p.kind === "circle").length, 0);
});

test("a hole overlapping a subtracted box is rejected rather than guessed at", () => {
  const bad = subtractBox(
    subtractCylinder(block(8, 8, 4), "z", 4, 4, 2),
    { x: 3, y: 3, z: 0, w: 2, d: 2, h: 4 },
  );
  assert.throws(() => validateSolid(bad), /overlap/i);
});

test("two overlapping holes are rejected", () => {
  const bad = subtractCylinder(
    subtractCylinder(block(8, 8, 4), "z", 3, 4, 2), "z", 4, 4, 2);
  assert.throws(() => validateSolid(bad), /overlap/i);
});

test("generateViews validates before generating", () => {
  const bad = subtractCylinder(
    subtractCylinder(block(8, 8, 4), "z", 3, 4, 2), "z", 4, 4, 2);
  assert.throws(() => generateViews(bad), /overlap/i);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./views.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/views.ts`:

```typescript
/**
 * Compose the three orthographic views from a solid.
 *
 * Each view is emitted AT ITS OWN ORIGIN. The generator deliberately does not
 * lay the views out according to a projection convention: the scorer compares
 * translation-invariantly and judges placement separately, and placing the views
 * is the skill being tested. Laying them out would compute a fourth answer
 * nobody consumes.
 *
 * PURE. No I/O. Must never be imported into a client component: it produces
 * answer keys, which never reach the browser (AGENTS.md §5.1).
 */
import { buildOccupancy } from "./occupancy.ts";
import { extractEdges } from "./project.ts";
import { mergeEdges } from "./merge.ts";
import { borePrimitives } from "./bore.ts";
import { VIEW_SPECS, type ViewSpec } from "./viewspec.ts";
import type { Axis, CylinderOp, Solid } from "./solid.ts";
import { boundingBox, translate, type Primitive } from "../scoring/primitives.ts";
import type { KeyViews } from "../scoring/assign.ts";
import type { ViewName } from "../scoring/types.ts";

/** Axis-aligned span of a cylinder on one of its plane axes. */
function cylinderSpan(op: CylinderOp, axis: Axis): [number, number] | null {
  const all: Axis[] = ["x", "y", "z"];
  const [pu, pv] = all.filter((a) => a !== op.axis);
  if (axis === pu) return [op.u - op.r, op.u + op.r];
  if (axis === pv) return [op.v - op.r, op.v + op.r];
  return null; // the hole axis: spans the whole block
}

function overlaps1D(a: [number, number], b: [number, number]): boolean {
  return a[0] < b[1] && b[0] < a[1];
}

/**
 * Reject solids whose features overlap.
 *
 * The approved spec excludes overlapping features from v1. Enforcing that here
 * turns an implicit assumption into a loud failure: a hole partially cut away by
 * a box has a bore silhouette this generator does not model, and emitting a
 * confident wrong key would be far worse than refusing (AGENTS.md §5.2).
 */
export function validateSolid(s: Solid): void {
  const cylinders = s.ops.filter((o): o is CylinderOp => o.kind === "cylinder");

  for (let i = 0; i < cylinders.length; i++) {
    for (let j = i + 1; j < cylinders.length; j++) {
      const a = cylinders[i], b = cylinders[j];
      if (a.axis !== b.axis) continue;
      const dist = Math.hypot(a.u - b.u, a.v - b.v);
      if (dist < a.r + b.r) {
        throw new Error("two cylindrical holes overlap, which v1 does not model");
      }
    }
  }

  for (const cyl of cylinders) {
    for (const op of s.ops) {
      if (op.kind !== "box") continue;
      const b = op.box;
      const boxSpan = (axis: Axis): [number, number] =>
        axis === "x" ? [b.x, b.x + b.w]
        : axis === "y" ? [b.y, b.y + b.d]
        : [b.z, b.z + b.h];
      const all: Axis[] = ["x", "y", "z"];
      const hit = all.every((axis) => {
        const cs = cylinderSpan(cyl, axis);
        return cs === null ? true : overlaps1D(cs, boxSpan(axis));
      });
      if (hit) {
        throw new Error("a cylindrical hole overlaps a subtracted box, which v1 does not model");
      }
    }
  }
}

function buildView(s: Solid, spec: ViewSpec): Primitive[] {
  const occ = buildOccupancy(s);
  const lattice = mergeEdges(extractEdges(occ, spec));

  const out: Primitive[] = lattice.map((l) => ({
    kind: "segment",
    type: l.hidden ? "hidden" : "visible",
    x1: spec.suSign * l.u1, y1: spec.svSign * l.v1,
    x2: spec.suSign * l.u2, y2: spec.svSign * l.v2,
  }));

  for (const op of s.ops) {
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

  const box = boundingBox(out);
  if (box === null) return [];
  return out.map((p) => translate(p, -box.minX, -box.minY));
}

export function generateViews(s: Solid): KeyViews {
  validateSolid(s);
  const views = {} as Record<ViewName, Primitive[]>;
  for (const name of ["front", "top", "side"] as ViewName[]) {
    views[name] = buildView(s, VIEW_SPECS[name]);
  }
  return { front: views.front, top: views.top, side: views.side };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 8 new tests in this file.

- [ ] **Step 5: Verify the whole suite and all gates**

```bash
npm test
npm run build
npm run typecheck
npm run lint
```

Expected: all pass. `typecheck` MUST run after `build` — see `AGENTS.md` §6.

- [ ] **Step 6: Commit**

```bash
git add src/lib/geometry/views.ts src/lib/geometry/views.test.ts
git commit -m "feat: compose the three orthographic views from a solid

Each view is emitted at its own origin. The generator does not lay views out by
convention: the scorer judges placement separately, and placing them is the
skill being tested.

Overlapping features are rejected rather than guessed at. The approved spec
excludes them from v1, and a confident wrong key is far worse than a refusal."
```

---

### Task 8: Authoring helpers

**Files:**
- Create: `src/lib/geometry/features.ts`
- Test: `src/lib/geometry/features.test.ts`

**Interfaces:**
- Consumes: `Solid`, `subtractBox` from `./solid.ts`
- Produces:
  - `step(s: Solid, corner: Corner, w: number, d: number, h: number): Solid`
  - `notch(s: Solid, edge: "front" | "back" | "left" | "right", offset: number, width: number, depth: number): Solid`
  - `slot(s: Solid, axis: "x" | "y", u: number, width: number, depth: number): Solid`
  - `opening(s: Solid, axis: Axis, u: number, v: number, w: number, h: number): Solid`
  - `type Corner = "top-left-front" | "top-right-front" | "top-left-back" | "top-right-back"`

These are ergonomics, not geometry: each computes a box and delegates to
`subtractBox`, recording its own name as metadata. Nothing consumes the metadata
yet; it is kept because it costs one optional field and drill authoring will want
it for difficulty tagging.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/features.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { step, notch, slot, opening } from "./features.ts";
import { block } from "./solid.ts";
import { buildOccupancy } from "./occupancy.ts";

test("a step at the top-left-front removes that corner and nothing else", () => {
  const s = step(block(6, 6, 6), "top-left-front", 2, 2, 2);
  const o = buildOccupancy(s);
  assert.equal(o.isSolid(0, 0, 5), false, "the corner is gone");
  assert.equal(o.isSolid(5, 5, 5), true, "the far top corner remains");
  assert.equal(o.isSolid(0, 0, 0), true, "the bottom is untouched");
});

test("a step at the top-right-front removes the opposite corner", () => {
  const o = buildOccupancy(step(block(6, 6, 6), "top-right-front", 2, 2, 2));
  assert.equal(o.isSolid(5, 0, 5), false);
  assert.equal(o.isSolid(0, 0, 5), true);
});

test("helpers record their own name as metadata", () => {
  assert.equal(step(block(6, 6, 6), "top-left-front", 2, 2, 2).ops[0].name, "step");
  assert.equal(notch(block(6, 6, 6), "front", 2, 2, 2).ops[0].name, "notch");
  assert.equal(slot(block(6, 6, 6), "x", 2, 2, 2).ops[0].name, "slot");
  assert.equal(opening(block(6, 6, 6), "y", 2, 2, 2, 2).ops[0].name, "opening");
});

test("a notch on the front edge cuts inward from y = 0", () => {
  const o = buildOccupancy(notch(block(6, 6, 6), "front", 2, 2, 2));
  assert.equal(o.isSolid(2, 0, 5), false);
  assert.equal(o.isSolid(2, 3, 5), true, "the notch does not reach the back");
});

test("a slot runs the full length of its axis", () => {
  const o = buildOccupancy(slot(block(6, 6, 6), "x", 2, 2, 2));
  assert.equal(o.isSolid(0, 2, 5), false);
  assert.equal(o.isSolid(5, 2, 5), false, "the slot spans the whole x extent");
});

test("an opening passes all the way through its axis", () => {
  const o = buildOccupancy(opening(block(6, 6, 6), "y", 2, 2, 2, 2));
  assert.equal(o.isSolid(2, 0, 2), false);
  assert.equal(o.isSolid(2, 5, 2), false, "it goes right through");
});

test("every helper produces exactly one box operation", () => {
  for (const s of [
    step(block(6, 6, 6), "top-left-front", 2, 2, 2),
    notch(block(6, 6, 6), "front", 2, 2, 2),
    slot(block(6, 6, 6), "x", 2, 2, 2),
    opening(block(6, 6, 6), "y", 2, 2, 2, 2),
  ]) {
    assert.equal(s.ops.length, 1);
    assert.equal(s.ops[0].kind, "box");
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./features.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/features.ts`:

```typescript
/**
 * Authoring helpers. Ergonomics, not geometry.
 *
 * The approved spec names five feature types; four of them are the same
 * operation — remove an axis-aligned box — differing only in where the box
 * sits. These helpers keep the vocabulary without duplicating the geometry, so
 * there is exactly one code path a wrong answer key could come from.
 *
 * Each records its own name as metadata. Nothing reads it yet; it costs one
 * optional field and drill authoring will want it for difficulty tagging.
 *
 * PURE. No I/O.
 */
import { subtractBox, type Axis, type Solid } from "./solid.ts";

export type Corner =
  | "top-left-front" | "top-right-front" | "top-left-back" | "top-right-back";

export function step(s: Solid, corner: Corner, w: number, d: number, h: number): Solid {
  const x = corner.includes("right") ? s.base.w - w : 0;
  const y = corner.includes("back") ? s.base.d - d : 0;
  const z = s.base.h - h; // "top" is the only vertical option in v1
  return subtractBox(s, { x, y, z, w, d, h }, "step");
}

export function notch(
  s: Solid, edge: "front" | "back" | "left" | "right",
  offset: number, width: number, depth: number,
): Solid {
  const h = s.base.h;
  switch (edge) {
    case "front":
      return subtractBox(s, { x: offset, y: 0, z: 0, w: width, d: depth, h }, "notch");
    case "back":
      return subtractBox(s, { x: offset, y: s.base.d - depth, z: 0, w: width, d: depth, h }, "notch");
    case "left":
      return subtractBox(s, { x: 0, y: offset, z: 0, w: depth, d: width, h }, "notch");
    case "right":
      return subtractBox(s, { x: s.base.w - depth, y: offset, z: 0, w: depth, d: width, h }, "notch");
  }
}

/** A channel running the full length of `axis`, cut down from the top. */
export function slot(
  s: Solid, axis: "x" | "y", u: number, width: number, depth: number,
): Solid {
  const z = s.base.h - depth;
  return axis === "x"
    ? subtractBox(s, { x: 0, y: u, z, w: s.base.w, d: width, h: depth }, "slot")
    : subtractBox(s, { x: u, y: 0, z, w: width, d: s.base.d, h: depth }, "slot");
}

/** A rectangular hole passing all the way through `axis`. */
export function opening(
  s: Solid, axis: Axis, u: number, v: number, w: number, h: number,
): Solid {
  switch (axis) {
    case "x": return subtractBox(s, { x: 0, y: u, z: v, w: s.base.w, d: w, h }, "opening");
    case "y": return subtractBox(s, { x: u, y: 0, z: v, w, d: s.base.d, h }, "opening");
    case "z": return subtractBox(s, { x: u, y: v, z: 0, w, d: h, h: s.base.h }, "opening");
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS, 7 new tests in this file.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/features.ts src/lib/geometry/features.test.ts
git commit -m "feat: authoring helpers for the four rectangular feature types

Ergonomics, not geometry. Each computes a box and delegates, so the spec's
vocabulary survives without four near-duplicate code paths."
```

---

### Task 9: Property tests

**Files:**
- Create: `src/lib/geometry/properties.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces: no exports; tests only

These are the invariants from §9.2 of the approved spec. **They cannot catch a
mirrored generator** — that is what Task 10 exists for — but they catch
systematic errors across many shapes at once.

- [ ] **Step 1: Write the property tests**

Create `src/lib/geometry/properties.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the tests**

Run: `npm test`
Expected: PASS, 6 new tests. If the symmetry test fails, suspect `merge.ts`
ordering or a sign in `viewspec.ts` before suspecting the test.

- [ ] **Step 3: Commit**

```bash
git add src/lib/geometry/properties.test.ts
git commit -m "test: invariants that must hold for any generated solid

From §9.2 of the approved spec. These catch systematic errors across shapes but
provably cannot catch a mirrored generator, since symmetry invariants stay green
under a mirror. That gap is what the golden fixtures are for."
```

---

### Task 10: Golden fixtures and the verification sheet

**Files:**
- Create: `src/lib/geometry/fixtures/golden.ts`
- Create: `src/lib/geometry/fixtures/golden.test.ts`
- Create: `scripts/verification-sheet.ts`
- Modify: `package.json` — add the `verify:sheet` script

**Interfaces:**
- Consumes: `Solid` builders; `generateViews`
- Produces:
  - `type GoldenPart = { id: string; description: string; solid: Solid; source: string; status: "UNVERIFIED" | "VERIFIED"; verifiedBy?: string }`
  - `const GOLDEN_PARTS: GoldenPart[]`

**Every fixture must be ASYMMETRIC.** A symmetric part cannot detect the mirror
error these fixtures exist to catch, and choosing one would be the most natural
mistake to make here. This is enforced by a test.

- [ ] **Step 1: Write the fixtures with their citations**

Create `src/lib/geometry/fixtures/golden.ts`:

```typescript
/**
 * Golden parts for verifying the generator's ORIENTATION AND HANDEDNESS.
 *
 * These exist because no property test can catch a mirrored generator: symmetry
 * invariants stay green under a mirror, because that is what symmetry means. A
 * mirrored generator passes every invariant in the spec and is wrong on every
 * drill it ever produces.
 *
 * It follows that EVERY FIXTURE MUST BE ASYMMETRIC. A symmetric golden part
 * verifies almost nothing. golden.test.ts enforces this.
 *
 * STATUS. A part is UNVERIFIED until a human or a cited published answer
 * confirms its views. Unverified parts still run — they pin behaviour against
 * regression — but no drill may ship from an unverified generator path.
 * See AGENTS.md §7 and the design document §8.
 *
 * PURE. No I/O.
 */
import { block, subtractBox, subtractCylinder, type Solid } from "../solid.ts";

export type GoldenPart = {
  id: string;
  description: string;
  solid: Solid;
  /** Where the expected answer comes from. Never "I think so". */
  source: string;
  status: "UNVERIFIED" | "VERIFIED";
  verifiedBy?: string;
};

export const GOLDEN_PARTS: GoldenPart[] = [
  {
    id: "L-block",
    description:
      "60x40x40 block with a 30x40x20 step removed from the top-front-left. " +
      "The classic first exercise: asymmetric on two axes at once.",
    solid: subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 }),
    source:
      "Engineering LibreTexts, Illinois Institute of Technology, " +
      "Introduction to Engineering Drawing and Design, Module B §2.7 Exercises",
    status: "UNVERIFIED",
  },
  {
    id: "corner-notch",
    description:
      "80x40x40 block with a 20x20x40 notch cut from the front-right edge. " +
      "Distinguishes left from right in the top and side views.",
    solid: subtractBox(block(8, 4, 4), { x: 6, y: 0, z: 0, w: 2, d: 2, h: 4 }),
    source: "Orthographic Projection Exercises (olaengineering), exercise sheet 1",
    status: "UNVERIFIED",
  },
  {
    id: "offset-through-hole",
    description:
      "80x80x40 plate with a vertical through-hole of radius 20 offset toward " +
      "the front-left. Offset deliberately: a centred hole would be symmetric " +
      "and would verify nothing about handedness.",
    solid: subtractCylinder(block(8, 8, 4), "z", 3, 3, 2),
    source: "Engineering Graphics and Design Grade 12, third-angle castings worksheets",
    status: "UNVERIFIED",
  },
  {
    id: "stepped-plate-with-hole",
    description:
      "80x60x40 block, a 20-deep step off the back, and a horizontal " +
      "through-hole on the y axis offset upward. Exercises hidden bore lines " +
      "against a non-trivial silhouette.",
    solid: subtractCylinder(
      subtractBox(block(8, 6, 4), { x: 0, y: 4, z: 2, w: 8, d: 2, h: 2 }),
      "y", 2, 1, 1,
    ),
    source:
      "Not yet matched to a published exercise. Carried as a regression " +
      "fixture only — it pins current behaviour against accidental change and " +
      "must NOT be treated as evidence of correct orientation until cited.",
    status: "UNVERIFIED",
  },
];
```

- [ ] **Step 2: Write the fixture tests**

Create `src/lib/geometry/fixtures/golden.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { GOLDEN_PARTS } from "./golden.ts";
import { generateViews } from "../views.ts";
import { boundingBox, type Primitive } from "../../scoring/primitives.ts";

const mirrorKey = (ps: Primitive[]) => {
  const b = boundingBox(ps);
  if (b === null) return "";
  return ps.map((p) => p.kind === "circle"
    ? `c:${b.maxX - (p.cx - b.minX)},${p.cy},${p.r},${p.type}`
    : `s:${b.maxX - (p.x2 - b.minX)},${p.y1},${b.maxX - (p.x1 - b.minX)},${p.y2},${p.type}`)
    .sort().join("|");
};
const plainKey = (ps: Primitive[]) => ps.map((p) => p.kind === "circle"
  ? `c:${p.cx},${p.cy},${p.r},${p.type}`
  : `s:${p.x1},${p.y1},${p.x2},${p.y2},${p.type}`).sort().join("|");

// The single most important test in this file. A symmetric fixture cannot
// detect the mirror error these fixtures exist to catch.
test("every golden part is asymmetric in its front view", () => {
  for (const part of GOLDEN_PARTS) {
    const front = generateViews(part.solid).front;
    assert.notEqual(mirrorKey(front), plainKey(front),
      `${part.id} is left-right symmetric and therefore verifies nothing`);
  }
});

test("every golden part cites a source", () => {
  for (const part of GOLDEN_PARTS) {
    assert.ok(part.source.length > 10, `${part.id} has no usable source`);
  }
});

test("every golden part generates without throwing", () => {
  for (const part of GOLDEN_PARTS) {
    const v = generateViews(part.solid);
    assert.ok(v.front.length > 0, `${part.id} front view is empty`);
    assert.ok(v.top.length > 0, `${part.id} top view is empty`);
    assert.ok(v.side.length > 0, `${part.id} side view is empty`);
  }
});

test("golden output is stable across runs", () => {
  for (const part of GOLDEN_PARTS) {
    assert.deepEqual(generateViews(part.solid), generateViews(part.solid));
  }
});
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: PASS, 4 new tests. If "every golden part is asymmetric" fails, the
fixture is wrong, not the test — replace the part with an asymmetric one.

- [ ] **Step 4: Write the verification sheet script**

Create `scripts/verification-sheet.ts`:

```typescript
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
```

- [ ] **Step 5: Add the script to `package.json`**

In the `scripts` block, after the `test` line, add:

```json
    "verify:sheet": "node --experimental-strip-types scripts/verification-sheet.ts",
```

- [ ] **Step 6: Generate the sheet and look at it**

```bash
npm run verify:sheet
```

Expected: writes `verification-sheet.html`. **Open it and look at every part.**
This is the one manual gate in the plan. Confirm each part's features appear on
the side the description says. If anything looks mirrored, stop — that is the
failure this whole apparatus exists to catch, and the fix belongs in
`viewspec.ts`.

- [ ] **Step 7: Ignore the generated sheet**

```bash
echo "verification-sheet.html" >> .gitignore
```

- [ ] **Step 8: Run everything**

```bash
npm test
npm run build
npm run typecheck
npm run lint
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: golden fixtures and a human verification sheet

Fixtures exist to pin orientation and handedness, which property tests
structurally cannot: symmetry invariants stay green under a mirror. Every
fixture is therefore asymmetric, and a test enforces that.

All four are UNVERIFIED and cite where their expected answer will come from.
Shipping drills is gated on sign-off; merging this code is not."
```

---

### Task 11: Documentation and the pull request

**Files:**
- Modify: `AGENTS.md`
- Modify: `docs/decision-log.md`

- [ ] **Step 1: Update `AGENTS.md` section 3**

Replace the phase line with:

```markdown
**Phase:** scorer and views generator complete. Isometric prompt and canvas not started.
```

Add to the `Done` list:

```markdown
- [x] The views generator — solid model, occupancy grid, projection, holes, golden fixtures
```

- [ ] **Step 2: Update `AGENTS.md` section 4**

Replace the generator entry with the two remaining items, renumbered:

```markdown
1. **The isometric prompt image.** Solid → the isometric view a student is shown. Rendering only; never scored.
2. **The canvas.** Snap-to-grid primitive input, then feedback rendering.
```

- [ ] **Step 3: Add a gotcha to `AGENTS.md` section 6**

Under **Found in this repo**, add:

```markdown
- **A mirrored view passes every property test.** Symmetry invariants stay green under a global mirror — that is what symmetry means. *Symptom:* all tests green, every drill wrong on the left/right axis. *Guard:* `src/lib/geometry/fixtures/golden.ts` parts are all asymmetric, enforced by a test, and `npm run verify:sheet` renders them for human review. If view geometry ever looks wrong, suspect the signs in `viewspec.ts` first.
```

- [ ] **Step 4: Append to the section 9 session log**

```markdown
| 2026-08-21 | (whoever) | Built the views generator: solid model, occupancy grid, edge extraction with visibility, collinear merging, analytic through-holes, view composition. Property tests plus four asymmetric golden fixtures, all **UNVERIFIED**. Cylinders deliberately never enter the occupancy grid, removing the staircase limitation the spec had accepted. |
```

- [ ] **Step 5: Append to `docs/decision-log.md`**

```markdown
## 2026-08-21 — the views generator

**Cylinders never enter the occupancy grid.** The design accepted that bores would staircase at cell resolution. They do not, because the grid is built from box operations only and holes are projected analytically, consulting the grid solely to ask what lies in front of them. This removes an accepted limitation rather than adding one. The cost is that seeing through one hole to a feature behind is unmodelled — already excluded by the approved spec, and now a thrown error rather than an implicit assumption.

**Visibility is decided by walking, not by rules.** For each boundary line the generator walks from near to far; the first face found decides, and occlusion never reverses. Only the two adjacent columns can cover the line, so this is exact rather than approximate. The alternative — per-feature occlusion rules — would have been hand-written O(n²) cases in the one part of the system that must never be wrong.

**Overlapping features throw.** A confident wrong answer key is far worse than a refusal (§5.2), so `validateSolid` rejects what v1 does not model instead of guessing.

**Golden fixtures are asymmetric, and that is enforced.** Their purpose is narrower than the spec framed it: they exist to pin orientation and handedness, which property tests structurally cannot check, because symmetry invariants stay green under a mirror. A symmetric fixture would verify almost nothing, so a test rejects one.
```

- [ ] **Step 6: Commit, push and open the PR**

```bash
git add -A
git commit -m "docs: record views generator completion"
git push -u origin feat/generator
gh pr create --base main --head feat/generator \
  --title "The views generator: solid model to answer keys" \
  --body "Implements plan 2 of 3. Pure, no browser, no content, no database.

A solid is a base block plus subtractive operations, rasterised into an
occupancy grid. Visibility is decided by walking each boundary line from near
to far rather than by per-feature rules. Cylindrical holes never enter the grid,
so the circle stays exact.

Golden fixtures are deliberately asymmetric, because no property test can catch
a mirrored generator. All four are UNVERIFIED; \`npm run verify:sheet\` renders
them for review. Shipping drills is gated on sign-off, merging this is not.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

---

## Next plans (not written yet)

- **Plan 3 — the isometric prompt image.** Solid → the isometric view the student is shown, including elliptical bores. Rendering only, never scored.
- **Plan 4 — the canvas and route handler.** Snap-to-grid primitive input, server-side scoring endpoint with the security requirements from spec §7, feedback rendering.
- **Optional — the FreeCAD cross-check harness.** An independent implementation to verify the generator over hundreds of parts rather than four. See design §8, Tier 2.
