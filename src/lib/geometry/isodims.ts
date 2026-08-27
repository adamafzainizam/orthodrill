/**
 * Dimensions for the isometric prompt image: the figures a real textbook
 * exercise prints on its pictorial, without which sizes are unknowable.
 *
 * DELIBERATELY NOT the scorer's `Primitive`, nor `IsoPrimitive` — a distinct
 * discriminant ("iso-dim") keeps this vocabulary out of src/lib/scoring/ and
 * out of anything that gets compared, the same reasoning isotypes.ts gives for
 * IsoLine/IsoFace/IsoEllipse. See that file's docblock before changing this one.
 *
 * WHAT GETS DIMENSIONED, derived straight from the solid so it can never
 * disagree with the answer key:
 *   - the base block's overall width (x), depth (y) and height (z) — always
 *     exactly three dimensions, one per axis;
 *   - each BoxOp: a SIZE dimension along any axis it does not span fully
 *     (an axis it does span fully needs no dimension — the overall figure
 *     already says so), and, on that axis, a POSITION dimension locating its
 *     near face from the origin, but only if that face is not already flush
 *     with the origin (a flush cut needs no locating figure either);
 *   - each CylinderOp: a diameter figure (prefixed with the SI diameter
 *     symbol) plus two POSITION dimensions locating its centre from the
 *     origin along the two axes perpendicular to the hole.
 * 1 grid unit = 10 mm, the convention scripts/verification-sheet.ts already
 * uses. Figures themselves are printed as BARE NUMBERS — no repeated "mm" —
 * matching a real drawing's convention of stating the unit once, in a title
 * block or caption, rather than on every figure; Pictorial.tsx carries that
 * single caption. The diameter symbol is kept on diameter figures because it
 * is not a unit, it is which KIND of size the figure names.
 *
 * PLACEMENT RULE. Every dimension belongs to a "family" keyed by which axis
 * it measures (x, y or z), and every dimension in a family is anchored to the
 * SAME reference edge of the base block and pushed out in the SAME direction,
 * regardless of whether it is an overall dimension, a feature's size, a
 * feature's position, or a hole's diameter:
 *   - x-family (width):  reference edge y=0,z=0 (front-bottom), pushed further
 *     below the block (projected v increases downward);
 *   - y-family (depth):  reference edge x=w,z=0 (right-bottom), pushed further
 *     right of the block (projected u increases rightward);
 *   - z-family (height): reference edge x=0,y=0 (front-left vertical),
 *     pushed further left of the block (projected u decreases leftward).
 * Each successive dimension drawn in a family is pushed out FARTHER than the
 * last (a growing margin, indexed by how many dimensions that family has
 * already placed) — that is the staggering the plan asks for, and it is also
 * what keeps every dimension LINE, its arrowheads and its label strictly
 * outside the base block's own projected bounding box: since a solid's ops
 * only remove material, that bounding box always contains the true silhouette,
 * so "outside the base block's projection" is always at least as safe as
 * "outside the actual picture's projection".
 *
 * A dimension's EXTENSION lines are the exception on purpose: they run from
 * the feature being measured out to the dimension line, so by definition they
 * may cross into the block's silhouette — that is their entire job, exactly
 * as it is in a hand-drawn dimensioned pictorial. Nothing else may.
 *
 * The extension-line-to-dimension-line connector is drawn as a single
 * straight segment in already-projected (2D) space rather than as a further
 * 3D projection — a deliberate simplification of real isometric dimensioning
 * practice, which sometimes runs a witness line in two straight segments
 * parallel to the isometric axes. Worth a second look once this has been seen
 * rendered; nothing about the type or the invariants above depends on it.
 *
 * LABEL PLACEMENT. A label centred exactly on its dimension line has the
 * stroke run straight through the glyphs — the first thing a real render
 * caught. Every family's dimension line is axis-aligned in PROJECTED space
 * (constant projected v for the x-family, constant projected u for y/z — see
 * FAMILY below), so clearing the stroke reduces to one perpendicular offset
 * per family, decided once and reused by every dimension in that family:
 *   - x-family (dimension line is ~horizontal): the label is centred on the
 *     line horizontally and sits ABOVE it — smaller projected v, using the
 *     text's own alphabetic baseline (not vertical-centred) so the WHOLE
 *     glyph sits above the line, not straddling it.
 *   - y/z-family (dimension line is ~vertical): the label is centred on the
 *     line vertically, but anchored so it reads entirely to the far side of
 *     the line (text-anchor "start" for y, pushed further right; "end" for
 *     z, pushed further left) — this clears the stroke regardless of how
 *     wide the figure's text turns out to be, without this module needing to
 *     know anything about font metrics.
 * `labelAnchor`/`labelBaseline` carry that decision to the renderer as SVG
 * `text-anchor`/`dominant-baseline` values, so Pictorial.tsx does not have to
 * re-derive it.
 *
 * PURE. No I/O.
 */
import { project, type Point2 } from "./isoproject.ts";
import type { Axis, Solid } from "./solid.ts";

const MM_PER_UNIT = 10;
/** Gap from the base block's own projected bounding box to the FIRST
 *  (innermost) dimension line placed in a family. */
const FAMILY_MARGIN_BASE = 1.0;
/**
 * Extra gap between successive dimension lines sharing a family. Must clear
 * not just the previous LINE but the previous dimension's own LABEL — this
 * was the second real-render bug: at the old value (0.6) adjacent stacked
 * figures' text ran together. Sized generously against Pictorial.tsx's
 * SCALE/font-size, not derived from them (this module has no rendering
 * concerns of its own).
 */
const FAMILY_STAGGER = 1.15;
const ARROW_LEN = 0.14;
const ARROW_WIDTH = 0.07;
/** Gap between a dimension line and the start of its own label. */
const LABEL_CLEARANCE = 0.3;

export type IsoDimSeg = { x1: number; y1: number; x2: number; y2: number };

export type IsoDim = {
  kind: "iso-dim";
  /** Witness lines from the measured feature out to `line`. May cross the
   *  silhouette — see the module docblock. */
  extension: [IsoDimSeg, IsoDimSeg];
  /** The calibrated line, arrowhead tip to arrowhead tip. */
  line: IsoDimSeg;
  /** A small filled triangle at each end of `line`, tip at the line's own
   *  endpoint, pointing outward. */
  arrows: [[number, number][], [number, number][]];
  /** The printed figure, a bare number in millimetres, e.g. "60" or "⌀40" —
   *  see the module docblock for why the unit is not repeated here. */
  label: string;
  /** Where to draw `label`; already clear of `line` regardless of the
   *  label's own text width — see labelAnchor. */
  labelAt: { x: number; y: number };
  /** SVG text-anchor to use when drawing `label` at `labelAt`. */
  labelAnchor: "start" | "middle" | "end";
  /** SVG dominant-baseline to use when drawing `label` at `labelAt`. */
  labelBaseline: "auto" | "middle";
};

function project3(x: number, y: number, z: number): Point2 {
  return project(x, y, z);
}

function seg(a: Point2, b: Point2): IsoDimSeg {
  return { x1: a.u, y1: a.v, x2: b.u, y2: b.v };
}

function fmtLinear(units: number): string {
  return `${units * MM_PER_UNIT}`;
}

function fmtDiameter(diameterUnits: number): string {
  return `⌀${diameterUnits * MM_PER_UNIT}`;
}

type BBox = { minU: number; maxU: number; minV: number; maxV: number };

function baseBBox(base: Solid["base"]): BBox {
  const us: number[] = [];
  const vs: number[] = [];
  for (const x of [0, base.w]) {
    for (const y of [0, base.d]) {
      for (const z of [0, base.h]) {
        const p = project3(x, y, z);
        us.push(p.u);
        vs.push(p.v);
      }
    }
  }
  return {
    minU: Math.min(...us), maxU: Math.max(...us),
    minV: Math.min(...vs), maxV: Math.max(...vs),
  };
}

type Family = {
  /** The reference edge: fixes the other two coordinates, varies this axis. */
  ref: (t: number, base: Solid["base"]) => [number, number, number];
  push: "u" | "v";
  /** +1 pushes beyond the bbox maximum; -1 pushes beyond the bbox minimum. */
  dir: 1 | -1;
};

const FAMILY: Record<Axis, Family> = {
  x: { ref: (t) => [t, 0, 0], push: "v", dir: 1 },
  y: { ref: (t, base) => [base.w, t, 0], push: "u", dir: 1 },
  z: { ref: (t) => [0, 0, t], push: "u", dir: -1 },
};

function arrow(tip: Point2, towardU: number, towardV: number): [number, number][] {
  const baseU = tip.u + towardU * ARROW_LEN;
  const baseV = tip.v + towardV * ARROW_LEN;
  const perpU = -towardV;
  const perpV = towardU;
  return [
    [tip.u, tip.v],
    [baseU + perpU * ARROW_WIDTH, baseV + perpV * ARROW_WIDTH],
    [baseU - perpU * ARROW_WIDTH, baseV - perpV * ARROW_WIDTH],
  ];
}

/**
 * Assembles the dimension from its two feature points and its two (already
 * pushed-out) dimension-line points. Shared by every dimension family and by
 * the diameter dimension, which supplies its own p1/p2.
 *
 * `axis` decides label placement, not the points themselves — see the module
 * docblock's LABEL PLACEMENT section. A family's dimension line is always
 * axis-aligned in projected space (constant v for the x-family's push="v",
 * constant u for y/z's push="u"), so d1 and d2 always agree on that pushed
 * coordinate; `d1`'s value of it is used as "the line's position" below.
 */
function buildDim(axis: Axis, p1: Point2, p2: Point2, d1: Point2, d2: Point2, label: string): IsoDim {
  const dirU = d2.u - d1.u;
  const dirV = d2.v - d1.v;
  const len = Math.hypot(dirU, dirV) || 1;
  const ux = dirU / len;
  const uy = dirV / len;

  const midLine = { u: (d1.u + d2.u) / 2, v: (d1.v + d2.v) / 2 };
  const fam = FAMILY[axis];

  const labelAt = fam.push === "v"
    ? { x: midLine.u, y: d1.v - LABEL_CLEARANCE } // always "above": smaller v
    : { x: d1.u + fam.dir * LABEL_CLEARANCE, y: midLine.v }; // further from the line, whichever way it was pushed
  const labelAnchor: IsoDim["labelAnchor"] = fam.push === "v" ? "middle" : (fam.dir === 1 ? "start" : "end");
  const labelBaseline: IsoDim["labelBaseline"] = fam.push === "v" ? "auto" : "middle";

  return {
    kind: "iso-dim",
    extension: [seg(p1, d1), seg(p2, d2)],
    line: seg(d1, d2),
    arrows: [arrow(d1, ux, uy), arrow(d2, -ux, -uy)],
    label,
    labelAt,
    labelAnchor,
    labelBaseline,
  };
}

function placeDim(
  axis: Axis, bbox: BBox, p1: Point2, p2: Point2, stagger: number, label: string,
): IsoDim {
  const fam = FAMILY[axis];
  const margin = FAMILY_MARGIN_BASE + stagger * FAMILY_STAGGER;
  const target = fam.dir === 1
    ? (fam.push === "u" ? bbox.maxU : bbox.maxV) + margin
    : (fam.push === "u" ? bbox.minU : bbox.minV) - margin;
  const d1: Point2 = fam.push === "u" ? { u: target, v: p1.v } : { u: p1.u, v: target };
  const d2: Point2 = fam.push === "u" ? { u: target, v: p2.v } : { u: p2.u, v: target };
  return buildDim(axis, p1, p2, d1, d2, label);
}

function axisDim(
  axis: Axis, base: Solid["base"], bbox: BBox,
  start: number, end: number, stagger: number, label: string,
): IsoDim {
  const [x1, y1, z1] = FAMILY[axis].ref(start, base);
  const [x2, y2, z2] = FAMILY[axis].ref(end, base);
  return placeDim(axis, bbox, project3(x1, y1, z1), project3(x2, y2, z2), stagger, label);
}

/** The two axes perpendicular to `axis`, in x -> y -> z order — the same
 *  convention solid.ts's CylinderOp uses for its own u/v fields. */
function planeAxes(axis: Axis): [Axis, Axis] {
  const all: Axis[] = ["x", "y", "z"];
  const [a, b] = all.filter((v) => v !== axis) as [Axis, Axis];
  return [a, b];
}

/** The visible face a hole along `axis` emerges through, matching the near
 *  rim isobore.ts draws: top for a z hole, front for a y hole, right for an
 *  x hole. */
function visibleFaceValue(axis: Axis, base: Solid["base"]): number {
  if (axis === "x") return base.w;
  if (axis === "y") return 0;
  return base.h;
}

const BOX_FIELD: Record<Axis, { pos: "x" | "y" | "z"; size: "w" | "d" | "h"; base: "w" | "d" | "h" }> = {
  x: { pos: "x", size: "w", base: "w" },
  y: { pos: "y", size: "d", base: "d" },
  z: { pos: "z", size: "h", base: "h" },
};

/**
 * Generate every dimension for a solid: three overall dimensions, then one
 * group per op, in `solid.ops` order — the same order the solid itself is
 * defined in, so the result is a pure, deterministic function of the solid.
 */
export function isometricDimensions(solid: Solid): IsoDim[] {
  const { base } = solid;
  const bbox = baseBBox(base);
  const stagger: Record<Axis, number> = { x: 0, y: 0, z: 0 };
  const next = (axis: Axis): number => stagger[axis]++;

  const dims: IsoDim[] = [];

  const AXES: Axis[] = ["x", "y", "z"];
  for (const axis of AXES) {
    const size = base[BOX_FIELD[axis].base];
    dims.push(axisDim(axis, base, bbox, 0, size, next(axis), fmtLinear(size)));
  }

  for (const op of solid.ops) {
    if (op.kind === "box") {
      for (const axis of AXES) {
        const f = BOX_FIELD[axis];
        const start = op.box[f.pos];
        const size = op.box[f.size];
        const baseSize = base[f.base];
        if (size === baseSize) continue; // spans the whole axis: implied by the overall dimension
        if (start !== 0) {
          dims.push(axisDim(axis, base, bbox, 0, start, next(axis), fmtLinear(start)));
        }
        dims.push(axisDim(axis, base, bbox, start, start + size, next(axis), fmtLinear(size)));
      }
    } else {
      const [pu, pv] = planeAxes(op.axis);
      dims.push(axisDim(pu, base, bbox, 0, op.u, next(pu), fmtLinear(op.u)));
      dims.push(axisDim(pv, base, bbox, 0, op.v, next(pv), fmtLinear(op.v)));

      const face = visibleFaceValue(op.axis, base);
      const rim1: [number, number, number] = [0, 0, 0];
      const rim2: [number, number, number] = [0, 0, 0];
      rim1[axisIndex(op.axis)] = face;
      rim2[axisIndex(op.axis)] = face;
      rim1[axisIndex(pu)] = op.u - op.r;
      rim2[axisIndex(pu)] = op.u + op.r;
      rim1[axisIndex(pv)] = op.v;
      rim2[axisIndex(pv)] = op.v;
      const p1 = project3(...rim1);
      const p2 = project3(...rim2);
      dims.push(placeDim(pu, bbox, p1, p2, next(pu), fmtDiameter(2 * op.r)));
    }
  }

  return dims;
}

function axisIndex(axis: Axis): 0 | 1 | 2 {
  return axis === "x" ? 0 : axis === "y" ? 1 : 2;
}
