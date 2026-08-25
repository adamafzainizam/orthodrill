# Isometric Prompt Image Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the pure generator that turns a solid model into the isometric pictorial the student is shown — a clean line drawing from a fixed front-top-right viewpoint.

**Architecture:** Five pure modules under `src/lib/geometry/`, reusing the existing occupancy grid unchanged. Hidden-line removal reduces to a near-to-far walk along the lattice diagonal `(1,-1,1)`, structurally identical to what `project.ts` already does along an axis. Holes are emitted analytically as ellipses. The output vocabulary is deliberately incompatible with the scorer's.

**Tech Stack:** TypeScript, `node --test` with native type stripping. No new dependencies.

## Global Constraints

- **Purity.** Nothing in `src/lib/geometry/` may import a framework, touch the filesystem, or perform I/O. `AGENTS.md` §2 constraint 3.
- **Every task runs `npm test`, `npm run lint` AND `npm run typecheck` before committing.** `npm test` strips types without checking them, so a type error survives a green suite. Run `npm run build` once first if typecheck reports a spurious `TS2304: Cannot find name 'LayoutProps'`.
- **Relative imports carry an explicit `.ts` extension.**
- **The isometric vocabulary must NOT be assignable to the scorer's.** This is the security boundary — Task 1. Never "simplify" by reusing `Segment` or `Primitive`.
- **The primitives carry no pixel scale and no viewport.** Coordinates are abstract projection units; the renderer fits them to the space the layout leaves.
- **Nothing here is scored.** A defect is a visible picture defect, not a wrong answer key. The verification regime is deliberately lighter than the views generator's — see design §8.
- **Git:** one branch (`feat/isometric`), atomic commits per task, PR at the end.
- Read `docs/superpowers/specs/2026-08-24-isometric-prompt-design.md` first. Read `AGENTS.md` §5 and §6.

## Derived constants, verified numerically during design

Do not re-derive these. They were checked and are correct.

**Screen basis** (model +x right, +y back, +z up; screen y increases downward):

```
u =  (x + y) / Math.SQRT2
v = -(-x + y + 2 * z) / Math.sqrt(6)
```

**Unit axis screen vectors:** `+x → (0.7071, 0.4082)`, `+y → (0.7071, -0.4082)`, `+z → (0, -0.8165)`. All three have length `0.8165` — equal foreshortening is what makes the projection isometric.

**Viewer-facing faces:** `+x` (right), `-y` (front), `+z` (top). No others.

**View diagonal:** `(1, -1, 1)`, the unique invariant unit lattice step. Larger `n` along it means nearer the viewer.

**Isometric ellipse for a circle of radius `r`:** major radius `r`, minor radius `r / Math.sqrt(3)` ≈ `0.5774 * r` — the textbook √3 ratio. Major-axis rotation from screen +x, in degrees:

| Hole axis | Emerges on | Rotation |
|---|---|---|
| `"z"` | top face | `0` |
| `"y"` | front face | `60` |
| `"x"` | right face | `120` |

**Expected edge counts.** The block case is independently known — a rectangular box drawn isometrically always shows nine edges, six of the hexagonal outline plus three meeting at the near corner. The other two were obtained from a reference implementation that reproduces the block case correctly.

| Solid | Merged edges |
|---|---|
| `block(w,d,h)` for ANY w, d, h | **9** |
| `subtractBox(block(6,4,4), {x:0,y:0,z:2,w:3,d:4,h:2})` — L-block | 18 |
| `subtractBox(block(4,4,4), {x:0,y:0,z:2,w:2,d:2,h:2})` — cut corner | 22 |

---

## A step the design did not call for

Design §6 describes cancelling shared coplanar faces. That is necessary and **not sufficient**. After cancellation a `2×1×1` block still yields **12** edges rather than 9, because each long side of the merged top face survives as *two collinear unit segments*.

**Collinear merging is required**, exactly as `merge.ts` does for the orthographic views. It is folded into Task 3 rather than given its own module: it operates on 3D lattice edges and is about fifteen lines.

This was found while writing the plan, by running the counts. Without it every edge-count test in this plan would be wrong.

---

## File Structure

`isotypes.ts` is not in the design's §9 module table. The design defines those
types but does not say where they live; giving them their own file keeps the
docblock explaining the trust boundary next to the thing it protects, rather
than buried in a module that also does geometry.

| File | Responsibility |
|---|---|
| `src/lib/geometry/isotypes.ts` | the `IsoPrimitive` vocabulary, and why it is separate |
| `src/lib/geometry/isoproject.ts` | screen basis, and the diagonal visibility walk |
| `src/lib/geometry/isoedges.ts` | visible faces → cancel → collinear-merge → `IsoLine[]` |
| `src/lib/geometry/isobore.ts` | hole → `IsoEllipse`, with visibility |
| `src/lib/geometry/isometric.ts` | compose into `IsoPrimitive[]` |
| `src/lib/geometry/isometric.properties.test.ts` | invariants across a corpus |
| `scripts/verification-sheet.ts` | extended to render the pictorial |

---

### Task 1: The isometric primitive vocabulary

**Files:**
- Create: `src/lib/geometry/isotypes.ts`
- Test: `src/lib/geometry/isotypes.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type IsoLine = { kind: "iso-line"; x1: number; y1: number; x2: number; y2: number }`
  - `type IsoEllipse = { kind: "iso-ellipse"; cx: number; cy: number; rx: number; ry: number; rotation: number }`
  - `type IsoPrimitive = IsoLine | IsoEllipse`

The smallest task here and the one with the clearest security purpose. The property being protected is that the **compiler** refuses to mix these with the scorer's primitives, so the test is a type-level test verified by `npm run typecheck`, not by assertions at runtime.

- [ ] **Step 1: Write the failing test**

Create `src/lib/geometry/isotypes.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import type { IsoLine, IsoEllipse, IsoPrimitive } from "./isotypes.ts";
import type { Primitive, Segment } from "../scoring/primitives.ts";

// The isometric is the PUBLIC half of a drill; the scorer's primitives are the
// PRIVATE half (the answer key) and must never reach the browser. These two
// assertions are the compiler-enforced part of that boundary. They are
// @ts-expect-error rather than runtime checks because if the types ever become
// mutually assignable the expected error stops happening and typecheck fails.
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
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./isotypes.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/isotypes.ts`:

```typescript
/**
 * The vocabulary of the isometric prompt image.
 *
 * DELIBERATELY NOT the scorer's `Primitive`, and the reason is the security
 * invariant rather than tidiness. The isometric is the PUBLIC half of a drill
 * and goes to the browser; the three orthographic views are the PRIVATE half
 * and must never leave the server (AGENTS.md §5.1, which also warns that this
 * bug class reappears in new clothes).
 *
 * A same-shaped alias would not help — TypeScript is structurally typed, so a
 * hand-rolled line with the same fields as `Segment` is freely assignable to
 * it. A DIFFERENT DISCRIMINANT does help: because `kind` is "iso-line" rather
 * than "segment", the two unions are genuinely incompatible and the compiler
 * refuses to let key geometry flow into a public payload, or an isometric into
 * `compareView`. Discriminated unions are how TypeScript gets nominal typing.
 *
 * Two consequences worth keeping:
 *   - `IsoEllipse` never enters src/lib/scoring/, so `normalise`, `positionKey`,
 *     `translate`, `boundingBox` and every exhaustive `kind` switch stay free of
 *     a shape no student can draw.
 *   - Coordinates here are FLOATS. Isometric projection is irrational by
 *     construction. The scorer's primitives carry a grid-snapped-integer
 *     invariant its exact comparison depends on; keeping them apart keeps that
 *     invariant true.
 *
 * Coordinates carry NO pixel scale and NO viewport. The renderer fits them to
 * whatever space the page layout leaves.
 *
 * PURE. No I/O.
 */

export type IsoLine = {
  kind: "iso-line";
  x1: number; y1: number; x2: number; y2: number;
};

export type IsoEllipse = {
  kind: "iso-ellipse";
  cx: number; cy: number;
  /** Major radius. Equals the hole's true radius under isometric projection. */
  rx: number;
  /** Minor radius. Always rx / sqrt(3). */
  ry: number;
  /** Major-axis rotation from screen +x, in degrees. */
  rotation: number;
};

export type IsoPrimitive = IsoLine | IsoEllipse;
```

- [ ] **Step 4: Run the tests and the typecheck**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 3 new tests pass, typecheck clean. **If typecheck reports "Unused '@ts-expect-error' directive", the two types have become assignable and the security boundary is broken** — that is the failure this task exists to prevent. Do not delete the directive to make it pass; fix the types.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/isotypes.ts src/lib/geometry/isotypes.test.ts
git commit -m "feat: the isometric primitive vocabulary, deliberately incompatible with the scorer's

The pictorial is the public half of a drill and the views are the private half.
A different discriminant makes the compiler refuse to let key geometry flow into
a public payload; a same-shaped alias would not, since TypeScript is structural."
```

---

### Task 2: Projection and the diagonal visibility walk

**Files:**
- Create: `src/lib/geometry/isoproject.ts`
- Test: `src/lib/geometry/isoproject.test.ts`

**Interfaces:**
- Consumes: `Occupancy` from `./occupancy.ts`
- Produces:
  - `type Point2 = { u: number; v: number }`
  - `project(x: number, y: number, z: number): Point2`
  - `isVisible(o: Occupancy, i: number, j: number, k: number): boolean`
  - `const VIEW_STEP: readonly [1, -1, 1]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/isoproject.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { project, isVisible, VIEW_STEP } from "./isoproject.ts";
import { buildOccupancy } from "./occupancy.ts";
import { block, subtractBox } from "./solid.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test("the origin projects to the origin", () => {
  const p = project(0, 0, 0);
  assert.ok(near(p.u, 0) && near(p.v, 0));
});

// Verified during design. A wrong sign here mirrors every prompt image.
test("the unit axes project to their known screen vectors", () => {
  const x = project(1, 0, 0), y = project(0, 1, 0), z = project(0, 0, 1);
  assert.ok(near(x.u, 0.7071067811865475) && near(x.v, 0.4082482904638631), "+x");
  assert.ok(near(y.u, 0.7071067811865475) && near(y.v, -0.4082482904638631), "+y");
  assert.ok(near(z.u, 0) && near(z.v, -0.816496580927726), "+z");
});

test("all three axes foreshorten equally, which is what makes it isometric", () => {
  const len = (p: { u: number; v: number }) => Math.hypot(p.u, p.v);
  const a = len(project(1, 0, 0)), b = len(project(0, 1, 0)), c = len(project(0, 0, 1));
  assert.ok(near(a, b) && near(b, c), `${a} ${b} ${c}`);
});

test("translating along the view step leaves the projection unchanged", () => {
  const [dx, dy, dz] = VIEW_STEP;
  for (const [x, y, z] of [[0, 0, 0], [3, 1, 2], [5, 5, 5]]) {
    const a = project(x, y, z), b = project(x + dx, y + dy, z + dz);
    assert.ok(near(a.u, b.u) && near(a.v, b.v), `${x},${y},${z}`);
  }
});

test("no other unit step is invariant, so the view diagonal is unique", () => {
  const steps = [[1,0,0],[0,1,0],[0,0,1],[1,1,0],[1,0,1],[0,1,1],[1,1,1],[1,-1,0],[0,-1,1]];
  const o = project(0, 0, 0);
  for (const [x, y, z] of steps) {
    const p = project(x, y, z);
    assert.ok(!(near(p.u, o.u) && near(p.v, o.v)), `${x},${y},${z} must not be invariant`);
  }
});

test("an empty cell is never visible", () => {
  assert.equal(isVisible(buildOccupancy(block(2, 2, 2)), 5, 5, 5), false);
});

test("a lone voxel is visible", () => {
  assert.equal(isVisible(buildOccupancy(block(1, 1, 1)), 0, 0, 0), true);
});

// The whole point of the diagonal: a voxel is hidden by one nearer along it.
test("a voxel is hidden by a solid voxel one step along the view diagonal", () => {
  const o = buildOccupancy(block(2, 2, 2));
  assert.equal(isVisible(o, 1, 0, 1), true, "the near one is visible");
  assert.equal(isVisible(o, 0, 1, 0), false, "the far one is hidden by it");
});

test("removing the blocker makes the far voxel visible again", () => {
  const o = buildOccupancy(subtractBox(block(2, 2, 2), { x: 1, y: 0, z: 1, w: 1, d: 1, h: 1 }));
  assert.equal(isVisible(o, 0, 1, 0), true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./isoproject.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/isoproject.ts`:

```typescript
/**
 * The isometric projection, and visibility under it.
 *
 * The viewpoint is fixed: the viewer sits front-top-right, so the direction
 * from the object to the viewer is (+1, -1, +1) with +x right, +y back, +z up.
 * The three faces that can face the viewer are therefore +x, -y and +z.
 *
 * WHY VISIBILITY IS EASY HERE. The projection direction is a LATTICE DIAGONAL:
 * two voxels project to the same point exactly when they differ by a multiple
 * of (1, -1, 1), and no other unit step is invariant. Cubes project to hexagons
 * that tile the plane, one hexagon per diagonal line of voxels. So a voxel is
 * visible if and only if no voxel nearer along that diagonal is solid — the
 * same near-to-far walk project.ts does along an axis, and exact for the same
 * reason rather than an approximation.
 *
 * A wrong sign in `project` produces a picture that is perfectly self-consistent
 * and perfectly MIRRORED. The constants below were verified numerically during
 * design and are pinned by tests.
 *
 * PURE. No I/O.
 */
import type { Occupancy } from "./occupancy.ts";

export type Point2 = { u: number; v: number };

/** The unit lattice step from a voxel toward the viewer. */
export const VIEW_STEP = [1, -1, 1] as const;

export function project(x: number, y: number, z: number): Point2 {
  return {
    u: (x + y) / Math.SQRT2,
    v: -(-x + y + 2 * z) / Math.sqrt(6),
  };
}

/**
 * Is this cell solid AND unobstructed along the view diagonal?
 *
 * Walks toward the viewer one diagonal step at a time. Leaving the grid means
 * nothing further can obstruct it.
 */
export function isVisible(o: Occupancy, i: number, j: number, k: number): boolean {
  if (!o.isSolid(i, j, k)) return false;
  const [dx, dy, dz] = VIEW_STEP;
  for (let n = 1; ; n++) {
    const a = i + n * dx, b = j + n * dy, c = k + n * dz;
    if (a >= o.w || b < 0 || c >= o.h) return true;
    if (o.isSolid(a, b, c)) return false;
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 9 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/isoproject.ts src/lib/geometry/isoproject.test.ts
git commit -m "feat: isometric projection and diagonal visibility

The projection direction is a lattice diagonal, uniquely so, which reduces
hidden-surface removal to the same near-to-far walk project.ts already does
along an axis - exact rather than approximate."
```

---

### Task 3: Visible edges

**Files:**
- Create: `src/lib/geometry/isoedges.ts`
- Test: `src/lib/geometry/isoedges.test.ts`

**Interfaces:**
- Consumes: `Occupancy` from `./occupancy.ts`; `project`, `isVisible` from `./isoproject.ts`; `IsoLine` from `./isotypes.ts`
- Produces: `isoEdges(o: Occupancy): IsoLine[]`

**The algorithm, stated once so the steps make sense.**

1. For every **visible** voxel, consider its three viewer-facing directions `+x`, `-y`, `+z`. If the neighbour in that direction is solid, the face is interior — skip it. Otherwise the face is part of the visible surface.
2. Emit each surviving face's four boundary edges, tagged with that face's normal.
3. **Cancel** any edge appearing exactly twice with the SAME normal — two coplanar faces continuing across it, so no line is drawn. Edges appearing once, or twice with different normals (a crease), survive.
4. **Merge collinear runs.** Group surviving lattice edges by (axis, the two fixed coordinates) and join contiguous runs. Without this a `2×1×1` block yields 12 edges instead of 9.
5. Project each merged lattice edge to 2D and emit an `IsoLine`, dropping anything that projects to zero length.

Because visibility is decided per diagonal and hexagons tile exactly, a visible voxel's faces are *wholly* visible — there is no partial face occlusion to handle. That is what makes this tractable.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/isoedges.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { isoEdges } from "./isoedges.ts";
import { buildOccupancy } from "./occupancy.ts";
import { block, subtractBox, subtractCylinder, type Solid } from "./solid.ts";

const count = (s: Solid) => isoEdges(buildOccupancy(s)).length;

// The load-bearing test. A rectangular box drawn isometrically shows exactly
// nine edges - the six of the hexagonal outline plus three meeting at the near
// corner - whatever its dimensions. It fails if coplanar faces are not
// cancelled, and it fails if collinear runs are not merged.
test("every plain block yields exactly nine edges, whatever its size", () => {
  for (const [w, d, h] of [[1,1,1],[2,1,1],[2,2,2],[6,4,2],[8,3,5]]) {
    assert.equal(count(block(w, d, h)), 9, `block(${w},${d},${h})`);
  }
});

test("a step adds edges beyond the nine", () => {
  assert.equal(count(subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 })), 18);
});

test("a cut corner adds more still", () => {
  assert.equal(count(subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 2, w: 2, d: 2, h: 2 })), 22);
});

// Cylinders never enter the occupancy grid, so they cannot affect the edges.
test("a through-hole does not change the edge count", () => {
  assert.equal(count(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2)), 9);
});

test("every emitted line has finite coordinates and non-zero length", () => {
  for (const p of isoEdges(buildOccupancy(block(3, 2, 2)))) {
    for (const n of [p.x1, p.y1, p.x2, p.y2]) assert.ok(Number.isFinite(n));
    assert.ok(Math.hypot(p.x2 - p.x1, p.y2 - p.y1) > 1e-9);
  }
});

test("every emitted primitive is an iso-line", () => {
  for (const p of isoEdges(buildOccupancy(block(3, 2, 2)))) assert.equal(p.kind, "iso-line");
});

test("an empty solid yields no edges", () => {
  const gone = subtractBox(block(2, 2, 2), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 2 });
  assert.deepEqual(isoEdges(buildOccupancy(gone)), []);
});

test("output is stable across runs", () => {
  const o = buildOccupancy(block(4, 3, 2));
  assert.deepEqual(isoEdges(o), isoEdges(o));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./isoedges.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/isoedges.ts`:

```typescript
/**
 * The visible edges of a solid, seen isometrically.
 *
 * Only the exposed, viewer-facing faces of VISIBLE voxels contribute. Because
 * the projection direction is a lattice diagonal and visibility is decided per
 * diagonal, a visible voxel's faces are wholly visible — there is no partial
 * face occlusion to handle, which is what makes this tractable.
 *
 * Two reductions turn faces into a line drawing:
 *   - CANCEL an edge shared by two coplanar faces: the surface continues across
 *     it and no line is drawn. An edge shared by faces with different normals is
 *     a crease and survives.
 *   - MERGE collinear runs. Cancelling alone leaves a flat 2x1 top with two
 *     collinear unit segments per long side, so a 2x1x1 block would emit twelve
 *     edges instead of the correct nine.
 *
 * PURE. No I/O.
 */
import type { Occupancy } from "./occupancy.ts";
import { project, isVisible } from "./isoproject.ts";
import type { IsoLine } from "./isotypes.ts";

type Corner = [number, number, number];

/** The three directions that can face the viewer, each with a stable name. */
const FACES: { name: string; d: Corner }[] = [
  { name: "+x", d: [1, 0, 0] },
  { name: "-y", d: [0, -1, 0] },
  { name: "+z", d: [0, 0, 1] },
];

/** The four lattice corners of one face of the voxel at (x, y, z). */
function faceCorners(name: string, x: number, y: number, z: number): Corner[] {
  if (name === "+x") {
    return [[x + 1, y, z], [x + 1, y + 1, z], [x + 1, y + 1, z + 1], [x + 1, y, z + 1]];
  }
  if (name === "-y") {
    return [[x, y, z], [x + 1, y, z], [x + 1, y, z + 1], [x, y, z + 1]];
  }
  return [[x, y, z + 1], [x + 1, y, z + 1], [x + 1, y + 1, z + 1], [x, y + 1, z + 1]];
}

const cornerKey = (c: Corner) => `${c[0]},${c[1]},${c[2]}`;
const edgeKey = (a: Corner, b: Corner) => [cornerKey(a), cornerKey(b)].sort().join("|");

export function isoEdges(o: Occupancy): IsoLine[] {
  // Steps 1-2: collect face edges, keyed by position AND normal, and count them.
  const tally = new Map<string, number>();
  for (let z = 0; z < o.h; z++) {
    for (let y = 0; y < o.d; y++) {
      for (let x = 0; x < o.w; x++) {
        if (!isVisible(o, x, y, z)) continue;
        for (const f of FACES) {
          if (o.isSolid(x + f.d[0], y + f.d[1], z + f.d[2])) continue; // interior face
          const c = faceCorners(f.name, x, y, z);
          for (let i = 0; i < 4; i++) {
            const key = `${edgeKey(c[i], c[(i + 1) % 4])}#${f.name}`;
            tally.set(key, (tally.get(key) ?? 0) + 1);
          }
        }
      }
    }
  }

  // Step 3: an edge seen twice with the same normal is interior to a flat region.
  const surviving = new Set<string>();
  for (const [key, n] of tally) {
    if (n !== 2) surviving.add(key.split("#")[0]);
  }

  // Step 4: merge collinear runs, grouped by the axis the edge runs along and
  // the two coordinates that stay fixed along it.
  const runs = new Map<string, number[]>();
  for (const key of surviving) {
    const [p, q] = key.split("|").map((t) => t.split(",").map(Number));
    const axis = [0, 1, 2].findIndex((i) => p[i] !== q[i]);
    if (axis < 0) continue; // degenerate
    const fixed = [0, 1, 2].filter((i) => i !== axis).map((i) => p[i]);
    const gk = `${axis}:${fixed.join(",")}`;
    const start = Math.min(p[axis], q[axis]);
    const g = runs.get(gk);
    if (g) g.push(start); else runs.set(gk, [start]);
  }

  // Step 5: project each merged run.
  const out: IsoLine[] = [];
  for (const [gk, startsRaw] of runs) {
    const [axisText, fixedText] = gk.split(":");
    const axis = Number(axisText);
    const fixed = fixedText.split(",").map(Number);
    const rest = [0, 1, 2].filter((i) => i !== axis);
    const starts = [...startsRaw].sort((a, b) => a - b);

    const at = (t: number): Corner => {
      const c: Corner = [0, 0, 0];
      c[axis] = t;
      c[rest[0]] = fixed[0];
      c[rest[1]] = fixed[1];
      return c;
    };

    const emit = (from: number, to: number) => {
      const a = at(from), b = at(to);
      const pa = project(a[0], a[1], a[2]);
      const pb = project(b[0], b[1], b[2]);
      if (Math.hypot(pb.u - pa.u, pb.v - pa.v) < 1e-9) return;
      out.push({ kind: "iso-line", x1: pa.u, y1: pa.v, x2: pb.u, y2: pb.v });
    };

    let runStart = starts[0];
    let prev = starts[0];
    for (let i = 1; i < starts.length; i++) {
      if (starts[i] === prev + 1) { prev = starts[i]; continue; }
      emit(runStart, prev + 1);
      runStart = starts[i];
      prev = starts[i];
    }
    emit(runStart, prev + 1);
  }

  // Deterministic order so tests and fixtures are stable.
  return out.sort((a, b) => a.y1 - b.y1 || a.x1 - b.x1 || a.y2 - b.y2 || a.x2 - b.x2);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 8 new tests pass. **If the nine-edge test fails, do not change the expected number** — nine is independently known to be correct for a rectangular box. Debug the cancel step first, then the merge step.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/isoedges.ts src/lib/geometry/isoedges.test.ts
git commit -m "feat: extract the visible edges of an isometric view

Exposed viewer-facing faces of visible voxels, with coplanar shared edges
cancelled and collinear runs merged. Merging is not cosmetic: without it a
2x1x1 block emits twelve edges where a rectangular box always shows nine."
```

---

### Task 4: The bore ellipse

**Files:**
- Create: `src/lib/geometry/isobore.ts`
- Test: `src/lib/geometry/isobore.test.ts`

**Interfaces:**
- Consumes: `Axis`, `CylinderOp` from `./solid.ts`; `Occupancy`, `sizeAlong` from `./occupancy.ts`; `project`, `isVisible` from `./isoproject.ts`; `IsoEllipse` from `./isotypes.ts`
- Produces: `isoBore(op: CylinderOp, o: Occupancy): IsoEllipse | null`

Only the **near rim** is drawn — the rim on the visible face the hole emerges through: the top for a `z` hole, the front for a `y` hole, the right face for an `x` hole. Returns `null` when that face is occluded.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/isobore.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { isoBore } from "./isobore.ts";
import { buildOccupancy, type Occupancy } from "./occupancy.ts";
import { block, subtractCylinder, type Axis, type CylinderOp } from "./solid.ts";

const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

function setup(axis: Axis, u: number, v: number, r: number): {
  op: CylinderOp; o: Occupancy;
} {
  const s = subtractCylinder(block(8, 8, 8), axis, u, v, r);
  return { op: s.ops[0] as CylinderOp, o: buildOccupancy(s) };
}

test("a hole yields one ellipse", () => {
  const { op, o } = setup("z", 4, 4, 2);
  const e = isoBore(op, o);
  assert.ok(e !== null);
  assert.equal(e.kind, "iso-ellipse");
});

// The textbook isometric ellipse ratio. Verified numerically during design.
test("the major radius is the true radius and the minor is r over root three", () => {
  const { op, o } = setup("z", 4, 4, 2);
  const e = isoBore(op, o)!;
  assert.ok(near(e.rx, 2), `rx ${e.rx}`);
  assert.ok(near(e.ry, 2 / Math.sqrt(3)), `ry ${e.ry}`);
  assert.ok(near(e.rx / e.ry, Math.sqrt(3)), "ratio must be root three");
});

test("the major axis rotation depends on which face the hole emerges through", () => {
  const z = setup("z", 4, 4, 2);
  const y = setup("y", 4, 4, 2);
  const x = setup("x", 4, 4, 2);
  assert.ok(near(isoBore(z.op, z.o)!.rotation, 0), "z hole");
  assert.ok(near(isoBore(y.op, y.o)!.rotation, 60), "y hole");
  assert.ok(near(isoBore(x.op, x.o)!.rotation, 120), "x hole");
});

test("the ellipse centre is finite", () => {
  const { op, o } = setup("z", 3, 5, 1);
  const e = isoBore(op, o)!;
  assert.ok(Number.isFinite(e.cx) && Number.isFinite(e.cy));
});

test("moving the hole moves the ellipse", () => {
  const a = setup("z", 2, 2, 1);
  const b = setup("z", 6, 6, 1);
  const ea = isoBore(a.op, a.o)!, eb = isoBore(b.op, b.o)!;
  assert.ok(!near(ea.cx, eb.cx) || !near(ea.cy, eb.cy));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./isobore.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/isobore.ts`:

```typescript
/**
 * A cylindrical through-hole, seen isometrically.
 *
 * A circle in a principal plane projects to an ellipse: major radius equal to
 * the true radius, minor radius r/sqrt(3), with the major axis perpendicular to
 * the hole's axis in projection. Those constants were verified numerically
 * during design and are pinned by tests.
 *
 * Only the NEAR rim is drawn — the one on the visible face the hole emerges
 * through. The far rim and the cylindrical bore wall are omitted: visible
 * omissions in a picture, never a wrong answer, and this image is never scored.
 *
 * PURE. No I/O.
 */
import type { Axis, CylinderOp } from "./solid.ts";
import { sizeAlong, type Occupancy } from "./occupancy.ts";
import { project, isVisible } from "./isoproject.ts";
import type { IsoEllipse } from "./isotypes.ts";

/** Major-axis rotation in degrees, by the axis the hole runs along. */
const ROTATION: Record<Axis, number> = { z: 0, y: 60, x: 120 };

/** The two axes perpendicular to `axis`, in x -> y -> z order. */
function planeAxes(axis: Axis): [Axis, Axis] {
  const all: Axis[] = ["x", "y", "z"];
  const [a, b] = all.filter((x) => x !== axis);
  return [a, b];
}

export function isoBore(op: CylinderOp, o: Occupancy): IsoEllipse | null {
  const [pu, pv] = planeAxes(op.axis);

  // The near rim sits on the visible face the hole emerges through: the top for
  // a z hole, the front (y = 0) for a y hole, the right face for an x hole.
  const rim: Record<Axis, number> = { x: 0, y: 0, z: 0 };
  rim[pu] = op.u;
  rim[pv] = op.v;
  rim[op.axis] = op.axis === "y" ? 0 : sizeAlong(o, op.axis);

  // Is that part of the face actually visible? Test the voxel just inside it.
  const inside: Record<Axis, number> = { ...rim };
  inside[pu] = Math.min(Math.max(Math.floor(op.u), 0), sizeAlong(o, pu) - 1);
  inside[pv] = Math.min(Math.max(Math.floor(op.v), 0), sizeAlong(o, pv) - 1);
  inside[op.axis] = op.axis === "y" ? 0 : sizeAlong(o, op.axis) - 1;
  if (!isVisible(o, inside.x, inside.y, inside.z)) return null;

  const c = project(rim.x, rim.y, rim.z);
  return {
    kind: "iso-ellipse",
    cx: c.u,
    cy: c.v,
    rx: op.r,
    ry: op.r / Math.sqrt(3),
    rotation: ROTATION[op.axis],
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 5 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/isobore.ts src/lib/geometry/isobore.test.ts
git commit -m "feat: project a through-hole as an isometric ellipse

Major radius equals the true radius, minor is r/sqrt(3) - the textbook ratio,
verified numerically. Only the near rim is drawn; the far rim and bore wall are
visible omissions in a picture that is never scored."
```

---

### Task 5: Composing the isometric view

**Files:**
- Create: `src/lib/geometry/isometric.ts`
- Test: `src/lib/geometry/isometric.test.ts`

**Interfaces:**
- Consumes: `buildOccupancy` from `./occupancy.ts`; `isoEdges` from `./isoedges.ts`; `isoBore` from `./isobore.ts`; `validateSolid` from `./views.ts`; `CylinderOp`, `Solid` from `./solid.ts`; `IsoPrimitive` from `./isotypes.ts`
- Produces: `isometricView(s: Solid): IsoPrimitive[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/geometry/isometric.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { isometricView } from "./isometric.ts";
import { block, subtractBox, subtractCylinder } from "./solid.ts";
import type { IsoPrimitive } from "./isotypes.ts";

const lines = (ps: IsoPrimitive[]) => ps.filter((p) => p.kind === "iso-line");
const ellipses = (ps: IsoPrimitive[]) => ps.filter((p) => p.kind === "iso-ellipse");

test("a plain block is nine lines and no ellipse", () => {
  const v = isometricView(block(6, 4, 2));
  assert.equal(lines(v).length, 9);
  assert.equal(ellipses(v).length, 0);
});

test("a through-hole adds exactly one ellipse", () => {
  const v = isometricView(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2));
  assert.equal(ellipses(v).length, 1);
  assert.equal(lines(v).length, 9);
});

test("two holes add two ellipses", () => {
  const v = isometricView(
    subtractCylinder(subtractCylinder(block(12, 8, 4), "z", 3, 4, 1), "z", 9, 4, 1),
  );
  assert.equal(ellipses(v).length, 2);
});

test("a stepped solid has more than the nine edges of a block", () => {
  const v = isometricView(subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 }));
  assert.equal(lines(v).length, 18);
});

// Same rule the views generator applies: refuse what v1 cannot model rather
// than emit a confident picture of something wrong.
test("an invalid solid is rejected rather than drawn", () => {
  const bad = subtractCylinder(subtractCylinder(block(8, 8, 4), "z", 3, 4, 2), "z", 4, 4, 2);
  assert.throws(() => isometricView(bad), /overlap/i);
});

test("every primitive carries an isometric discriminant", () => {
  for (const p of isometricView(subtractCylinder(block(8, 8, 4), "z", 4, 4, 2))) {
    assert.ok(p.kind === "iso-line" || p.kind === "iso-ellipse", p.kind);
  }
});

test("output is stable across runs", () => {
  const s = subtractCylinder(block(8, 8, 4), "z", 4, 4, 2);
  assert.deepEqual(isometricView(s), isometricView(s));
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot find module `./isometric.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/geometry/isometric.ts`:

```typescript
/**
 * The isometric prompt image: the picture a student is shown.
 *
 * This is the PUBLIC half of a drill. It is never compared against anything and
 * never scored, which is why its primitives are deliberately incompatible with
 * the scorer's — see isotypes.ts.
 *
 * Coordinates carry no pixel scale and no viewport. The renderer fits them to
 * whatever space the page layout leaves.
 *
 * PURE. No I/O.
 */
import { buildOccupancy } from "./occupancy.ts";
import { isoEdges } from "./isoedges.ts";
import { isoBore } from "./isobore.ts";
import { validateSolid } from "./views.ts";
import type { CylinderOp, Solid } from "./solid.ts";
import type { IsoPrimitive } from "./isotypes.ts";

export function isometricView(s: Solid): IsoPrimitive[] {
  // The same gate the views generator uses: a solid v1 cannot model should be
  // refused, not drawn confidently.
  validateSolid(s);

  const occ = buildOccupancy(s);
  const out: IsoPrimitive[] = [...isoEdges(occ)];

  for (const op of s.ops) {
    if (op.kind !== "cylinder") continue;
    const ellipse = isoBore(op as CylinderOp, occ);
    if (ellipse !== null) out.push(ellipse);
  }

  return out;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 7 new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/geometry/isometric.ts src/lib/geometry/isometric.test.ts
git commit -m "feat: compose the isometric prompt image

Validates the solid on the same terms as the views generator, then emits the
visible edges plus one ellipse per visible hole rim."
```

---

### Task 6: Property tests and one orientation pin

**Files:**
- Create: `src/lib/geometry/isometric.properties.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces: no exports; tests only

Nothing here is scored, so the regime is lighter than the views generator's. But **a mirrored pictorial would mislead students while every structural test stayed green** — the exact failure the golden set exists to catch — so one asymmetric solid has its extreme points pinned against coordinates derived from the projection basis rather than from the generator.

- [ ] **Step 1: Write the tests**

Create `src/lib/geometry/isometric.properties.test.ts`:

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { isometricView } from "./isometric.ts";
import { block, subtractBox, subtractCylinder, type Solid } from "./solid.ts";
import { project } from "./isoproject.ts";
import type { IsoLine } from "./isotypes.ts";

function corpus(): Solid[] {
  return [
    block(4, 4, 4), block(6, 4, 2), block(8, 3, 5),
    subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 }),
    subtractBox(block(4, 4, 4), { x: 0, y: 0, z: 2, w: 2, d: 2, h: 2 }),
    subtractCylinder(block(8, 8, 4), "z", 4, 4, 2),
    subtractCylinder(block(8, 8, 8), "y", 4, 4, 2),
    subtractBox(subtractCylinder(block(8, 8, 8), "x", 6, 4, 2),
      { x: 2, y: 0, z: 0, w: 4, d: 3, h: 3 }),
  ];
}

test("every coordinate is finite", () => {
  for (const s of corpus()) {
    for (const p of isometricView(s)) {
      const ns = p.kind === "iso-line"
        ? [p.x1, p.y1, p.x2, p.y2]
        : [p.cx, p.cy, p.rx, p.ry, p.rotation];
      for (const n of ns) assert.ok(Number.isFinite(n), p.kind);
    }
  }
});

test("no line has zero length", () => {
  for (const s of corpus()) {
    for (const p of isometricView(s)) {
      if (p.kind !== "iso-line") continue;
      assert.ok(Math.hypot(p.x2 - p.x1, p.y2 - p.y1) > 1e-9);
    }
  }
});

test("every ellipse keeps the isometric ratio", () => {
  for (const s of corpus()) {
    for (const p of isometricView(s)) {
      if (p.kind !== "iso-ellipse") continue;
      assert.ok(Math.abs(p.rx / p.ry - Math.sqrt(3)) < 1e-9, `ratio ${p.rx / p.ry}`);
    }
  }
});

// The bound is derived from the block's own corners via the projection basis,
// NOT from the primitives under test, so it can actually fail.
test("every line lies within the projected bounds of the base block", () => {
  for (const s of corpus()) {
    const { w, d, h } = s.base;
    let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
    for (const x of [0, w]) for (const y of [0, d]) for (const z of [0, h]) {
      const p = project(x, y, z);
      minU = Math.min(minU, p.u); maxU = Math.max(maxU, p.u);
      minV = Math.min(minV, p.v); maxV = Math.max(maxV, p.v);
    }
    const eps = 1e-9;
    for (const p of isometricView(s)) {
      if (p.kind !== "iso-line") continue;
      for (const [u, v] of [[p.x1, p.y1], [p.x2, p.y2]]) {
        assert.ok(u >= minU - eps && u <= maxU + eps, `u ${u} outside ${minU}..${maxU}`);
        assert.ok(v >= minV - eps && v <= maxV + eps, `v ${v} outside ${minV}..${maxV}`);
      }
    }
  }
});

// The one test that pins ORIENTATION. Every other test in this file is
// mirror-invariant: a mirrored picture still has finite coordinates, non-zero
// lines and correct ellipse ratios. This solid is asymmetric on both horizontal
// axes, and its extreme points are compared against the projection basis.
test("an asymmetric solid's extreme points match the projection basis", () => {
  const s = subtractBox(block(6, 4, 4), { x: 0, y: 0, z: 2, w: 3, d: 4, h: 2 });
  const ls = isometricView(s).filter((p): p is IsoLine => p.kind === "iso-line");
  const us = ls.flatMap((l) => [l.x1, l.x2]);
  const vs = ls.flatMap((l) => [l.y1, l.y2]);
  const eps = 1e-9;

  // Leftmost silhouette point is the front-left vertical edge at (0, 0);
  // rightmost is the back-right edge at (6, 4).
  assert.ok(Math.abs(Math.min(...us) - project(0, 0, 0).u) < eps, "leftmost");
  assert.ok(Math.abs(Math.max(...us) - project(6, 4, 0).u) < eps, "rightmost");

  // The step was cut from the top-front-left, so the highest surviving corner
  // is the top-back-right at (6, 4, 4). Lowest is the bottom-front-right (6,0,0).
  assert.ok(Math.abs(Math.min(...vs) - project(6, 4, 4).v) < eps, "topmost");
  assert.ok(Math.abs(Math.max(...vs) - project(6, 0, 0).v) < eps, "lowest");
});

test("generating the same solid twice gives identical output", () => {
  for (const s of corpus()) assert.deepEqual(isometricView(s), isometricView(s));
});
```

- [ ] **Step 2: Run the tests**

```bash
npm test
npm run typecheck
npm run lint
```

Expected: 6 new tests pass.

If the orientation test fails, **do not adjust its expected values** — they come from the projection basis, not from the generator. A failure means a sign is wrong in `isoproject.ts`, which is exactly what this test exists to catch.

- [ ] **Step 3: Commit**

```bash
git add src/lib/geometry/isometric.properties.test.ts
git commit -m "test: invariants for the isometric view, plus one orientation pin

Most of these are mirror-invariant by nature, so one test compares an asymmetric
solid's extreme points against coordinates derived from the projection basis
rather than from the generator. That is the only one that can catch a mirror."
```

---

### Task 7: Verification sheet, documentation and the pull request

**Files:**
- Modify: `scripts/verification-sheet.ts`
- Modify: `AGENTS.md`
- Modify: `docs/decision-log.md`

- [ ] **Step 1: Render the pictorial on the verification sheet**

In `scripts/verification-sheet.ts`, add these imports alongside the existing ones:

```typescript
import { isometricView } from "../src/lib/geometry/isometric.ts";
import type { IsoPrimitive } from "../src/lib/geometry/isotypes.ts";
```

Then add this renderer beside the existing `renderView`:

```typescript
function renderIsometric(ps: IsoPrimitive[], label: string): string {
  if (ps.length === 0) return `<div class="view"><em>${label}: empty</em></div>`;
  const xs = ps.flatMap((p) => p.kind === "iso-line" ? [p.x1, p.x2] : [p.cx - p.rx, p.cx + p.rx]);
  const ys = ps.flatMap((p) => p.kind === "iso-line" ? [p.y1, p.y2] : [p.cy - p.rx, p.cy + p.rx]);
  const minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  const S = 26; // pixels per projection unit — presentation only
  const w = (maxX - minX) * S + PAD * 2;
  const h = (maxY - minY) * S + PAD * 2;
  const px = (n: number) => (n - minX) * S + PAD;
  const py = (n: number) => (n - minY) * S + PAD;

  const body = ps.map((p) => p.kind === "iso-line"
    ? `<line x1="${px(p.x1)}" y1="${py(p.y1)}" x2="${px(p.x2)}" y2="${py(p.y2)}" stroke="#111" stroke-width="2"/>`
    : `<ellipse cx="${px(p.cx)}" cy="${py(p.cy)}" rx="${p.rx * S}" ry="${p.ry * S}" fill="none" stroke="#111" stroke-width="2" transform="rotate(${p.rotation} ${px(p.cx)} ${py(p.cy)})"/>`
  ).join("\n      ");

  return `<div class="view">
    <h4>${label}</h4>
    <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
      ${body}
    </svg>
  </div>`;
}
```

In the section builder, render it first so a reviewer sees the picture before the views that should agree with it:

```typescript
    ${renderIsometric(isometricView(part.solid), "Isometric (prompt)")}
    ${renderView(v.front, "Front")}
```

- [ ] **Step 2: Generate the sheet and look at it**

```bash
npm run verify:sheet
```

Open `verification-sheet.html`. **Confirm by eye, for every part:** the pictorial shows the same part the three views describe; features appear on the side the description says; the ellipse sits on the face the hole passes through; nothing is drawn through a face that should hide it. If anything looks mirrored, stop — suspect the signs in `isoproject.ts`.

- [ ] **Step 3: Update `AGENTS.md`**

In section 3, replace the phase line with:

```markdown
**Phase:** scorer, views generator and isometric prompt complete. Canvas not started.
```

Add to the Done list:

```markdown
- [x] The isometric prompt image — diagonal visibility walk, analytic bore ellipse
```

In section 4, remove the isometric entry so only the canvas remains, renumbered as step 1.

Append to the section 9 session log:

```markdown
| 2026-08-24 | (whoever) | Built the isometric prompt image: projection basis, visibility by walking the lattice diagonal (1,-1,1), face cancellation plus collinear merging, analytic bore ellipse at the textbook root-three ratio. Its primitives use a distinct discriminant from the scorer's, so the compiler enforces the public/private split. Verification sheet now renders the pictorial beside the three views. |
```

- [ ] **Step 4: Append to `docs/decision-log.md`**

```markdown
## 2026-08-24 — the isometric prompt image

**Hidden-line removal reduced to a walk already written.** The isometric projection direction (1, -1, 1) is a lattice diagonal, and uniquely so among unit steps — verified numerically before the design was accepted. Voxels projecting to the same point are exactly those on that diagonal, so a voxel is visible if and only if none nearer along it is solid. That is the same near-to-far walk `project.ts` performs along an axis, exact for the same reason rather than an approximation. The alternative — projecting every face to a polygon and clipping edges against nearer polygons — is correct for any geometry and far more machinery than an axis-aligned voxel solid needs.

**Cancelling coplanar faces is necessary and not sufficient.** Writing the plan surfaced that a 2x1x1 block still emits twelve edges after cancellation, because each long side of the merged top survives as two collinear unit segments. Collinear merging was added, after which every rectangular block emits exactly nine edges regardless of dimensions — the textbook isometric box. That count is now the load-bearing test, and it fails if either reduction is missing.

**The isometric's primitives are deliberately incompatible with the scorer's.** The pictorial is the public half of a drill and the three views are the private half that must never leave the server. A shared type would mean a function typed `Primitive[]` accepts either, which is how "hidden in the UI but shipped to the client" mistakes happen. A same-shaped alias would not help, because TypeScript is structurally typed. A different discriminant does: `kind: "iso-line"` is not assignable to `kind: "segment"`, so the compiler refuses the mix. The boundary is pinned by `@ts-expect-error` tests, which fail if the types ever become compatible.

**A lighter verification regime, and why that is legitimate.** The views generator carried the full apparatus because a wrong answer key teaches an incorrect drawing silently. Nothing here is scored, so a defect is a picture that looks wrong. But one orientation test is still pinned against coordinates derived from the projection basis rather than from the generator, because a mirrored pictorial would mislead students while every structural test stayed green — the same failure the golden set exists to catch.
```

- [ ] **Step 5: Run everything, commit, and open the PR**

```bash
npm test
npm run lint
npm run typecheck
npm run build
git add -A
git commit -m "docs: record the isometric prompt image"
git push -u origin feat/isometric
```

Then open the PR against `main` through the GitHub web UI. **Do not use `gh`** — a `GITHUB_TOKEN` set deliberately for a separate project takes precedence over its stored credentials and has no access to this repository. That is expected and must not be "fixed". Git over SSH works normally.

---

## Next plans (not written yet)

- **The canvas and route handler.** Snap-to-grid primitive input, server-side scoring with the security requirements from spec §7, feedback rendering, and the reserved-but-empty ad slots recorded in the decision log for 2026-08-24.
