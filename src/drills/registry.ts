/**
 * The drill catalogue: the private half of every drill, and the functions that
 * split off the public half.
 *
 * SERVER ONLY. NEVER IMPORT THIS FROM A CLIENT COMPONENT.
 *
 * The reason is stronger than "it holds the answer key". It holds the SOLIDS,
 * and a solid IS the answer key — anyone holding one runs `generateViews` and
 * has the three correct views exactly. Shipping the solid to the browser would
 * satisfy the letter of §5.1 while breaking it completely. `isolation.test.ts`
 * enforces that only route handlers import this module.
 *
 * A drill is a file, not a database row (design spec §6.5), and this registry
 * is that file. Lookup goes through a Map, so a drill id is a key in a
 * whitelist and never part of a filesystem path — the path-traversal hazard
 * named in spec §7 cannot arise, because there is no path.
 *
 * Answer keys are DERIVED, never hand-written (AGENTS.md §7).
 */
import { block, subtractBox, subtractCylinder, type Solid } from "../lib/geometry/solid.ts";
import { generateViews } from "../lib/geometry/views.ts";
import { isometricView } from "../lib/geometry/isometric.ts";
import { obliqueKey, type ObliqueSpec } from "../lib/geometry/oblique.ts";
import { viewsFigure } from "../lib/geometry/viewsheet.ts";
import { isometricDimensions, type IsoDim } from "../lib/geometry/isodims.ts";
import type { IsoPrimitive } from "../lib/geometry/isotypes.ts";
import { parabolaKey, type ParabolaSpec } from "../lib/geometry/parabola.ts";
import type { KeyViews } from "../lib/scoring/assign.ts";
import type { Primitive } from "../lib/scoring/primitives.ts";
import type { Convention } from "../lib/scoring/types.ts";
import { getTopic, type Hint, type TopicId } from "../topics/topics.ts";

/**
 * An orthographic drill: draw front/top/side from an isometric prompt. The
 * long-established shape, unchanged by the topics widening below.
 */
export type ViewsDrill = {
  id: string;
  title: string;
  prompt: string;
  convention: Convention;
  topicId: TopicId;
  mode: "views";
  /** PRIVATE. The answer key in compressed form. Never serialise this. */
  solid: Solid;
};

/**
 * A single-figure construction exercise (e.g. the parabola). No convention —
 * there is nothing to place relative to anything else — and no solid: the
 * spec is a flat set of numbers, not a 3D model.
 */
export type FigureDrill = {
  id: string;
  title: string;
  prompt: string;
  topicId: TopicId;
  mode: "figure";
  /**
   * PRIVATE. `parabolaKey(spec)` / `obliqueKey(spec)` derive the answer key
   * with no work at all — they are pure functions anyone could run — so `spec`
   * is exactly as sensitive as `solid` above and must never cross into
   * `publicHalf`. An oblique spec CONTAINS a solid, so this is not a weaker
   * secret than a views drill's; it is the same one.
   */
  spec: FigureSpec;
};

/**
 * Which generator derives a figure's key, TAGGED rather than inferred from
 * which fields happen to be present. `mode`'s own comment above says
 * inference is how the wrong branch gets taken when a shape this catalogue
 * does not yet carry arrives, and that reasoning applies here identically.
 */
export type FigureSpec =
  | ({ kind: "parabola" } & ParabolaSpec)
  | ({ kind: "oblique"; shownAs: ShownAs } & ObliqueSpec);

/**
 * How the part is put in front of the student.
 *
 * A DISCRIMINATED shape rather than two optional fields, so a convention
 * cannot go missing when the views are what is shown — the dependency is
 * structural instead of a rule someone has to remember.
 *
 * This lives on the DRILL rather than in `ObliqueSpec` because it is
 * presentation, not geometry: `obliqueKey` derives the same answer either way,
 * and making the geometry module carry it would force every call site to
 * supply something it has no use for.
 *
 * "views" carries a real security consequence — the three views of a solid ARE
 * the answer key for a Type A exercise on that solid. See `viewsheet.ts`, and
 * the test in `registry.test.ts` that enforces the rule.
 */
export type ShownAs =
  | { kind: "pictorial" }
  | { kind: "views"; convention: Convention };

/**
 * Which scoring mode an exercise uses. Explicit rather than inferred from
 * which private field is present — inference is how the wrong branch gets
 * taken when a mode this catalogue does not yet carry arrives. `mode` is the
 * discriminant TypeScript narrows on below, so `ViewsDrill` and `FigureDrill`
 * must each carry a distinct literal, not just distinct shapes.
 */
export type Drill = ViewsDrill | FigureDrill;

/** What the sidebar needs, and nothing a hint author did not write by hand. */
export type PublicTopic = { id: TopicId; title: string; hints: Hint[] };

/** Exactly what the browser is allowed to see. */
export type PublicDrill =
  | {
      id: string;
      title: string;
      prompt: string;
      mode: "views";
      convention: Convention;
      grid: Readonly<{ width: number; height: number }>;
      /** Readonly because it is cached and shared across requests. */
      isometric: readonly IsoPrimitive[];
      /** Readonly for the same reason. Derived from the solid, never the
       *  solid itself — see isodims.ts for why that is enough to be
       *  trustworthy. */
      dimensions: readonly IsoDim[];
      topic: PublicTopic;
    }
  | {
      id: string;
      title: string;
      prompt: string;
      mode: "figure";
      grid: Readonly<{ width: number; height: number }>;
      /**
       * A figure exercise MAY carry a pictorial. The parabola does not — its
       * method diagram lives in the sidebar — but oblique does, because §7
       * requires every exercise give the student something to look at and for
       * oblique that is the part being redrawn. Derived from the solid exactly
       * as a views drill derives it; the SOLID itself never crosses this line.
       */
      isometric?: readonly IsoPrimitive[];
      dimensions?: readonly IsoDim[];
      /**
       * The three views, laid out, when the exercise shows those instead of a
       * pictorial. SAFE to publish only because the solid behind it is used by
       * no Type A exercise — these views ARE that exercise's answer key. The
       * rule is enforced in registry.test.ts.
       */
      promptViews?: readonly Primitive[];
      promptConvention?: Convention;
      topic: PublicTopic;
    };

/**
 * ONE SHEET, THE SAME FOR EVERY DRILL.
 *
 * It used to be derived per part, which gave every drill a slightly different
 * canvas — 40x38, 42x38, 44x39, 44x40. Two things were wrong with that. A
 * student had to reacquaint themselves with the drawing area on every
 * exercise, which is friction in the one place the tool should feel familiar.
 * And a derived height could come out ODD: `plate-with-bore` was 44x39, so the
 * quadrant divider sat at 19.5 — half a unit off, between grid lines, which
 * reads exactly as a canvas that does not line up with its own grid.
 *
 * BOTH DIMENSIONS MUST STAY EVEN so the dividers land on grid lines, and both
 * must stay large enough for the biggest part's three views plus the gaps a
 * student leaves between them. The scorer clusters at DEFAULT_CLUSTER_GAP, so
 * the sheet has to be comfortably larger than that or two views read as one.
 * `registry.test.ts` pins all three properties.
 */
export const SHEET: Readonly<{ width: number; height: number }> =
  Object.freeze({ width: 48, height: 40 });

/**
 * The progression: one feature, then two axes of asymmetry, then a bore,
 * then a step-plus-bore combination — that was the whole catalogue until
 * the four exercises after `stepped-plate-bore` widened it to a full 8-12
 * range per the design spec. Each new one earns its place by teaching
 * something the first four do not: a feature invisible in a view (so the
 * hidden-line reasoning cannot be skipped), two features that overlap and
 * interact rather than sitting apart, a bore on the one axis the first two
 * don't exercise, and two corners that look mirror-symmetric but are not.
 * Convention is deliberately split close to evenly across all eight (four
 * first-angle, four third-angle) — see AGENTS.md §7: neither convention is
 * "correct". Each key is generated, so adding a drill is defining a solid.
 */
const CATALOGUE: Drill[] = [
  {
    id: "step-block",
    title: "Stepped block",
    prompt:
      "A rectangular block with a single step cut from one end. Draw the front, "
      + "top and right-side views, and place them according to the convention shown.",
    convention: "first_angle",
    topicId: "orthographic",
    mode: "views",
    solid: subtractBox(block(6, 4, 4), { x: 4, y: 0, z: 2, w: 2, d: 4, h: 2 }, "step"),
  },
  {
    id: "corner-cut",
    title: "Corner cut-out",
    prompt:
      "A block with a rectangular notch removed from one vertical corner. Watch "
      + "which side the notch appears on in each view.",
    convention: "first_angle",
    topicId: "orthographic",
    mode: "views",
    solid: subtractBox(block(8, 4, 4), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 4 }, "notch"),
  },
  {
    id: "plate-with-bore",
    title: "Plate with a through-hole",
    prompt:
      "A flat plate pierced by a single round hole. The hole reads as a circle in "
      + "one view and as a pair of hidden lines in the other two — and every "
      + "circular feature carries its centre lines.",
    convention: "third_angle",
    topicId: "orthographic",
    mode: "views",
    solid: subtractCylinder(block(8, 6, 3), "z", 3, 3, 2, "bore"),
  },
  {
    id: "stepped-plate-bore",
    title: "Stepped plate with a hole",
    prompt:
      "A step and a through-hole on the same part. The hole is bored along the "
      + "depth axis, so it is hidden in two of the three views.",
    convention: "first_angle",
    topicId: "orthographic",
    mode: "views",
    solid: subtractCylinder(
      subtractBox(block(8, 6, 4), { x: 0, y: 4, z: 3, w: 8, d: 2, h: 1 }, "step"),
      "y", 2, 1, 1, "bore",
    ),
  },
  {
    id: "hidden-groove",
    title: "Groove across the top",
    prompt:
      "A rectangular block with a groove milled straight across its top face, "
      + "set back from the front face rather than cut into it. Draw the front, "
      + "top and right-side views. The groove is visible wherever you are "
      + "looking straight into it, and becomes a hidden line wherever the "
      + "block's own material sits between your eye and it.",
    convention: "third_angle",
    topicId: "orthographic",
    mode: "views",
    // Full width (touches both side faces, so the side view sees straight
    // through it) but set back 1 unit from the front face and 3 from the
    // back (asymmetric, and neither margin is 0) — the front view's own
    // material hides it completely, so it shows up there only as a hidden
    // line, which is the entire teaching point. Verified with generateViews
    // during authoring: front view carries exactly one hidden segment.
    solid: subtractBox(block(8, 6, 4), { x: 0, y: 1, z: 2, w: 8, d: 2, h: 2 }, "groove"),
  },
  {
    id: "near-mirror-notches",
    title: "Two corner notches, not the same",
    prompt:
      "A block with a notch cut from each of its two front corners. The two "
      + "notches are not identical — look carefully rather than assuming "
      + "symmetry. Draw the front, top and right-side views exactly as the "
      + "part is shaped, including any hidden lines that a difference "
      + "between the corners produces in a view where it is not directly "
      + "visible.",
    convention: "first_angle",
    topicId: "orthographic",
    mode: "views",
    // Same footprint on both corners (w=2,d=2), but the left notch runs the
    // full height and the right one only halfway. A student who assumes
    // mirror symmetry gets the right corner wrong in every view; the top
    // view is the sharpest test, since the shallow notch never reaches the
    // top face and therefore reads as hidden lines, not an outline.
    solid: subtractBox(
      subtractBox(block(8, 6, 4), { x: 0, y: 0, z: 0, w: 2, d: 2, h: 4 }, "left-notch"),
      { x: 6, y: 0, z: 0, w: 2, d: 2, h: 2 }, "right-notch",
    ),
  },
  {
    id: "bore-along-length",
    title: "Block bored along its length",
    prompt:
      "A rectangular block with a round hole drilled straight through, along "
      + "its length rather than through its thickness. Draw the front, top "
      + "and right-side views, remembering every circular feature carries "
      + "its centre lines, and that the circle itself appears in only one of "
      + "the three views.",
    convention: "third_angle",
    topicId: "orthographic",
    mode: "views",
    // The existing two bores use axis "z" (circle in the top view) and axis
    // "y" (circle in the front view). This one uses axis "x", so the circle
    // appears in the SIDE view instead — a case nothing else in the
    // catalogue exercises. Offset on both plane axes and clear of every
    // face (no tangency), so nothing about its position is symmetric.
    solid: subtractCylinder(block(6, 8, 7), "x", 3, 3, 2, "bore"),
  },
  {
    id: "step-and-notch",
    title: "A step cut into by a notch",
    prompt:
      "A block with a step reducing its height over one end, and a corner "
      + "notch cut into that same end — deep enough to remove material the "
      + "step alone would have left behind. Draw the front, top and "
      + "right-side views, reasoning through where each cut actually leaves "
      + "material and where it does not.",
    convention: "third_angle",
    topicId: "orthographic",
    mode: "views",
    // The notch's footprint overlaps the step's: part of it re-removes
    // material the step already took (a no-op there) and part of it cuts
    // deeper, down to the base, where the step alone would have left a
    // shelf. `validateSolid` only rejects overlapping CYLINDERS, never
    // overlapping boxes, so this compound cut is legal — and it is the
    // reason "one cut removes part of another" cannot be modelled with a
    // single subtractBox call.
    solid: subtractBox(
      subtractBox(block(9, 6, 4), { x: 6, y: 0, z: 2, w: 3, d: 6, h: 2 }, "step"),
      { x: 7, y: 0, z: 0, w: 2, d: 2, h: 4 }, "notch",
    ),
  },
  {
    id: "parabola-rectangle-5",
    title: "Parabola by the rectangle method",
    prompt:
      "Construct a parabolic arc opening upward, using the rectangle (offset) "
      + "method with 5 equal divisions on each side. Place the vertex in the "
      + "lower part of the sheet, leaving room on both sides and above for the "
      + "arms to rise. Draw your rays, division marks and any other scaffolding "
      + "with the Construction line type — the marker ignores construction "
      + "lines and grades the curve as straight segments joining each located "
      + "point to the next, not a hand-smoothed sweep.",
    topicId: "parabola",
    mode: "figure",
    // n=5, apex near the bottom edge, centred horizontally on the 48-wide
    // sheet — the same placement `parabola.test.ts` uses to pin the "fits
    // the sheet" property. PRIVATE: see FigureDrill's `spec` field above.
    spec: { kind: "parabola", n: 5, originX: 24, originY: 38 },
  },
  {
    id: "parabola-rectangle-4",
    title: "Parabola by the rectangle method (fewer divisions)",
    prompt:
      "Construct a parabolic arc opening upward, using the rectangle (offset) "
      + "method with 4 equal divisions on each side. Place the vertex in the "
      + "lower part of the sheet, leaving room on both sides and above for the "
      + "arms to rise. Draw your rays, division marks and any other scaffolding "
      + "with the Construction line type — the marker ignores construction "
      + "lines and grades the curve as straight segments joining each located "
      + "point to the next, not a hand-smoothed sweep.",
    topicId: "parabola",
    mode: "figure",
    // n=4, easier than the seeded n=5 exercise: fewer points to locate, a
    // shorter and squatter rectangle (8 wide, 16 tall against n=5's 10x25).
    // Same apex placement style as parabola-rectangle-5. n=4 != DIAGRAM_N
    // (3) below, so this never coincides with the method diagram — see that
    // constant's docstring before ever picking an n that would.
    spec: { kind: "parabola", n: 4, originX: 24, originY: 38 },
  },
  {
    id: "parabola-rectangle-6",
    title: "Parabola by the rectangle method (more divisions)",
    prompt:
      "Construct a parabolic arc opening upward, using the rectangle (offset) "
      + "method with 6 equal divisions on each side. Place the vertex in the "
      + "lower part of the sheet, leaving room on both sides and above for the "
      + "arms to rise. Draw your rays, division marks and any other scaffolding "
      + "with the Construction line type — the marker ignores construction "
      + "lines and grades the curve as straight segments joining each located "
      + "point to the next, not a hand-smoothed sweep.",
    topicId: "parabola",
    mode: "figure",
    // n=6, harder than the seeded n=5 exercise: more points to locate and a
    // taller rectangle (12 wide, 36 tall) that very nearly fills the
    // sheet's 40-unit height — n=7 does not fit at all (49 tall), which is
    // why 6 is the ceiling. n=6 != DIAGRAM_N (3) below, for the same reason
    // as parabola-rectangle-4 above.
    spec: { kind: "parabola", n: 6, originX: 24, originY: 38 },
  },
  {
    id: "oblique-cavalier-step",
    title: "Stepped bar in cavalier oblique",
    prompt:
      "Redraw this part in CAVALIER oblique, which does not reduce the depth "
      + "at all — six units deep is six diagonals back. "
      + "The 60 dimension is the depth, and it is the one that goes back. "
      + "The face at right angles to it, facing you, is the front face, drawn true shape. "
      + "The depth goes back at 45° up and to the right — one step right and one step up "
      + "per diagonal. "
      + "This is a pictorial, so leave hidden edges out entirely: draw only what you could see. "
      + "Place the drawing anywhere with room around it.",
    topicId: "oblique",
    mode: "figure",
    // Depth 6, and the step spans the whole depth, so every y-coordinate is 0
    // or 6 — a multiple of 1, 2 AND 3. That is what lets this one solid carry
    // all three types, and the comparison across them is the actual teaching.
    spec: {
      kind: "oblique", type: "cavalier", shownAs: { kind: "pictorial" }, originX: 12, originY: 30,
      solid: subtractBox(block(8, 6, 5), { x: 5, y: 0, z: 3, w: 3, d: 6, h: 2 }, "step"),
    },
  },
  {
    id: "oblique-cabinet-step",
    title: "The same bar in cabinet oblique",
    prompt:
      "Redraw the SAME part in CABINET oblique, which halves the depth — six "
      + "units deep is three diagonals back. Compare it with the "
      + "cavalier drawing of this part: only the depth changes. "
      + "The 60 dimension is the depth, and it is the one that goes back. "
      + "The face at right angles to it, facing you, is the front face, drawn true shape. "
      + "The depth goes back at 45° up and to the right — one step right and one step up "
      + "per diagonal. "
      + "This is a pictorial, so leave hidden edges out entirely: draw only what you could see. "
      + "Place the drawing anywhere with room around it.",
    topicId: "oblique",
    mode: "figure",
    spec: {
      kind: "oblique", type: "cabinet", shownAs: { kind: "pictorial" }, originX: 14, originY: 28,
      solid: subtractBox(block(8, 6, 5), { x: 5, y: 0, z: 3, w: 3, d: 6, h: 2 }, "step"),
    },
  },
  {
    id: "oblique-general-step",
    title: "The same bar in general oblique",
    prompt:
      "Redraw the SAME part in GENERAL oblique at two thirds depth — six units "
      + "deep is four diagonals back. It sits between cavalier and cabinet, "
      + "which is the point of it. "
      + "The 60 dimension is the depth, and it is the one that goes back. "
      + "The face at right angles to it, facing you, is the front face, drawn true shape. "
      + "The depth goes back at 45° up and to the right — one step right and one step up "
      + "per diagonal. "
      + "This is a pictorial, so leave hidden edges out entirely: draw only what you could see. "
      + "Place the drawing anywhere with room around it.",
    topicId: "oblique",
    mode: "figure",
    spec: {
      kind: "oblique", type: "general", shownAs: { kind: "pictorial" }, originX: 14, originY: 28,
      solid: subtractBox(block(8, 6, 5), { x: 5, y: 0, z: 3, w: 3, d: 6, h: 2 }, "step"),
    },
  },
  {
    id: "oblique-cabinet-notch",
    title: "Notched plate in cabinet oblique",
    prompt:
      "Redraw this part in CABINET oblique, which halves the depth — four "
      + "units deep is two diagonals back. The notch is cut right through, so it reads on "
      + "the back of the part as well as the front. "
      + "The 40 dimension is the depth, and it is the one that goes back. "
      + "The face at right angles to it, facing you, is the front face, drawn true shape. "
      + "The depth goes back at 45° up and to the right — one step right and one step up "
      + "per diagonal. "
      + "This is a pictorial, so leave hidden edges out entirely: draw only what you could see. "
      + "Place the drawing anywhere with room around it.",
    topicId: "oblique",
    mode: "figure",
    // A different shape, so the type is not welded to one solid in the
    // student's mind. Depth 4: legal for cabinet (step 2), and deliberately
    // NOT legal for general (step 3) — validateObliqueSolid would reject it.
    spec: {
      kind: "oblique", type: "cabinet", shownAs: { kind: "pictorial" }, originX: 14, originY: 28,
      solid: subtractBox(block(9, 4, 5), { x: 0, y: 0, z: 0, w: 2, d: 4, h: 2 }, "notch"),
    },
  },
  {
    id: "oblique-from-views-cavalier",
    title: "From three views to cavalier oblique",
    prompt:
      "You are given the three orthographic views of a part, in FIRST ANGLE. "
      + "Read them, then draw the part in CAVALIER oblique, which does not "
      + "reduce the depth at all — six units deep is six diagonals back. "
      + "The front view tells you the shape of the front face, which is drawn "
      + "true shape; the top view tells you the depth. "
      + "The depth goes back at 45° up and to the right — one step right and "
      + "one step up per diagonal. "
      + "This is a pictorial, so leave hidden edges out entirely: draw only "
      + "what you could see. "
      + "Place the drawing anywhere with room around it.",
    topicId: "oblique",
    mode: "figure",
    // A solid NO Type A exercise uses. Showing its three views publishes the
    // answer to any orthographic drill that asks for them, which is why
    // `registry.test.ts` enforces that no solid is used both ways.
    spec: {
      kind: "oblique", type: "cavalier",
      shownAs: { kind: "views", convention: "first_angle" },
      originX: 12, originY: 30,
      solid: subtractBox(block(7, 6, 4), { x: 0, y: 0, z: 2, w: 3, d: 6, h: 2 }, "rebate"),
    },
  },
  {
    id: "oblique-from-views-cabinet",
    title: "From three views to cabinet oblique",
    prompt:
      "You are given the three orthographic views of a part, in THIRD ANGLE — "
      + "check the arrangement before you read them. Draw the part in CABINET "
      + "oblique, which halves the depth — six units deep is three diagonals "
      + "back. "
      + "The front view tells you the shape of the front face, which is drawn "
      + "true shape; the top view tells you the depth. "
      + "The depth goes back at 45° up and to the right — one step right and "
      + "one step up per diagonal. "
      + "This is a pictorial, so leave hidden edges out entirely: draw only "
      + "what you could see. "
      + "Place the drawing anywhere with room around it.",
    topicId: "oblique",
    mode: "figure",
    // Third angle deliberately, so the pair covers both conventions — neither
    // is "correct" (AGENTS.md §7) and a student who only ever sees one has
    // learned half the topic.
    spec: {
      kind: "oblique", type: "cabinet",
      shownAs: { kind: "views", convention: "third_angle" },
      originX: 14, originY: 28,
      solid: subtractBox(block(6, 6, 6), { x: 4, y: 0, z: 0, w: 2, d: 6, h: 3 }, "step"),
    },
  },
];

/** A Map, so an id is a whitelist key and inherited names resolve to nothing. */
const BY_ID: ReadonlyMap<string, Drill> = new Map(CATALOGUE.map((d) => [d.id, d]));

export const DRILL_IDS: readonly string[] = CATALOGUE.map((d) => d.id);

export function listDrillIds(): readonly string[] {
  return DRILL_IDS;
}

/** Null rather than a throw: an unknown id is a 404, not a server fault. */
export function getDrill(id: string): Drill | null {
  return BY_ID.get(id) ?? null;
}

/**
 * Generated output is cached per drill and frozen.
 *
 * CACHED because both projections are pure functions of a fixed solid, and
 * without this every scored submission re-runs the whole view generator and
 * every drill load re-runs the isometric projection. On a free tier that is
 * paid-for CPU on each request, and it hands an attacker cost amplification
 * that the rate limit then has to absorb alone.
 *
 * FROZEN because a cache turns any mutation by one caller into corruption for
 * every caller after it — including a wrong answer key, which is the one
 * failure §5.2 exists to prevent. Nothing mutates these today; freezing means
 * nothing can start to.
 */
const keyCache = new Map<string, KeyViews>();
const figureKeyCache = new Map<string, Primitive[]>();
const publicCache = new Map<string, PublicDrill>();

/** One level deep is enough: these hold arrays of plain primitive records. */
function freezeViews<T extends Record<string, readonly unknown[]>>(v: T): T {
  for (const list of Object.values(v)) Object.freeze(list);
  return Object.freeze(v);
}

/**
 * Freeze a bare array in place, keeping its declared type `T[]` rather than
 * the `readonly T[]` `Object.freeze`'s array overload would otherwise force
 * on every caller downstream (`scoreFigure`, `ScoringLookup`, `compareView`
 * all take `Primitive[]`, none of them mutate it, and widening every one of
 * them to `readonly` is a bigger ripple than this one honest cast deserves).
 * The freeze itself is real — this only affects what TypeScript believes.
 */
function freezeArray<T>(arr: T[]): T[] {
  Object.freeze(arr);
  return arr;
}

/**
 * The topic half the sidebar needs. Looked up by `topicId`, never carried on
 * the drill itself — `topics.ts` is the one place a hint is authored, so a
 * drill can only ever point at a real topic (`registry.test.ts` pins that
 * every `topicId` resolves) rather than duplicate its title and hints.
 */
function publicTopic(drill: Drill): PublicTopic {
  const topic = getTopic(drill.topicId);
  // Cannot happen for any drill in CATALOGUE (pinned by test), but a topic
  // lookup that silently produced `undefined` fields would be a worse bug
  // than a loud one, so this fails clearly rather than serialising `null`s.
  if (topic === null) throw new Error(`drill ${drill.id} points at unknown topic ${drill.topicId}`);
  return { id: topic.id, title: topic.title, hints: topic.hints };
}

/**
 * The half that may cross the wire. Built by naming fields, never by
 * omission — each branch below lists exactly what a "views" or "figure"
 * exercise is allowed to reveal, so a field added to `Drill` later does not
 * cross the wire just by existing.
 *
 * A figure exercise's `spec` (the `n`/origin that `parabolaKey` turns into
 * the exact answer with one call, per FigureDrill's docstring) never appears
 * here, on either branch, in any form — not as a nested object, not as a
 * `bounds` derived from it, nothing an attacker or a script could feed back
 * into `parabolaKey` to reconstruct the key. What the student needs — which
 * construction to draw and roughly where on the sheet to put it — is carried
 * in `prompt`, authored as prose, not as machine-readable numbers.
 */
export function publicHalf(drill: Drill): PublicDrill {
  const cached = publicCache.get(drill.id);
  if (cached !== undefined) return cached;

  const built: PublicDrill = drill.mode === "figure"
    ? Object.freeze({
      id: drill.id,
      title: drill.title,
      prompt: drill.prompt,
      mode: "figure",
      grid: SHEET,
      // Oblique redraws a part, so it needs the part on screen — either as a
      // pictorial or as the three views to read it from. The parabola has
      // nothing to depict and carries none of these.
      ...(drill.spec.kind === "oblique"
        ? drill.spec.shownAs.kind === "pictorial"
          ? {
            isometric: Object.freeze(isometricView(drill.spec.solid)),
            dimensions: Object.freeze(isometricDimensions(drill.spec.solid)),
          }
          : {
            promptViews: freezeArray(
              viewsFigure(drill.spec.solid, drill.spec.shownAs.convention),
            ),
            promptConvention: drill.spec.shownAs.convention,
          }
        : {}),
      topic: publicTopic(drill),
    })
    : Object.freeze({
      id: drill.id,
      title: drill.title,
      prompt: drill.prompt,
      mode: "views",
      convention: drill.convention,
      grid: SHEET,
      isometric: Object.freeze(isometricView(drill.solid)),
      dimensions: Object.freeze(isometricDimensions(drill.solid)),
      topic: publicTopic(drill),
    });
  publicCache.set(drill.id, built);
  return built;
}

/** SERVER ONLY. The answer key for a "views" exercise, derived from the solid and cached. */
export function answerKey(drill: ViewsDrill): KeyViews;
/** SERVER ONLY. The answer key for a "figure" exercise, derived from the spec and cached. */
export function answerKey(drill: FigureDrill): Primitive[];
export function answerKey(drill: Drill): KeyViews | Primitive[] {
  if (drill.mode === "figure") {
    const cached = figureKeyCache.get(drill.id);
    if (cached !== undefined) return cached;
    const built = freezeArray(
      drill.spec.kind === "parabola" ? parabolaKey(drill.spec) : obliqueKey(drill.spec),
    );
    figureKeyCache.set(drill.id, built);
    return built;
  }

  const cached = keyCache.get(drill.id);
  if (cached !== undefined) return cached;

  const built = freezeViews(generateViews(drill.solid));
  keyCache.set(drill.id, built);
  return built;
}

/**
 * A worked METHOD DIAGRAM for the parabola topic: a small figure showing how
 * the rectangle method locates a point, not an answer to any exercise.
 *
 * DELIBERATELY AT A DIFFERENT n FROM ANY EXERCISE. The seeded parabola drill
 * (`parabola-rectangle-5` above) uses n=5; this diagram uses n=DIAGRAM_N=3.
 * Do NOT change this to "helpfully" match whichever exercise is on screen —
 * that would turn a textbook illustration of the METHOD into the answer key
 * for the INSTANCE, exactly the leak `publicHalf` is written to avoid. If a
 * second figure exercise is ever added at n=3, this diagram still must not
 * be changed to match it; pick a value that matches no shipped exercise.
 *
 * Reuses `parabolaKey` for the curve itself (same function, different spec —
 * n=3 here is not secret; only a specific EXERCISE's spec is) and derives the
 * rectangle/division/ray/offset construction lines algebraically alongside
 * it. The derivation: a ray from the apex to the i-th mark on a side divided
 * into n EQUAL parts (at height i*n above the apex) crosses the vertical
 * raised from the i-th mark on the half-width (also divided into n equal
 * parts, at distance i from the apex) at height i*n * (i/n) = i² — exactly
 * `parabolaKey`'s point(k=i) = (i, -i²). Worth re-deriving by hand before
 * touching either half of this function; the two must keep agreeing or the
 * diagram stops matching the thing it explains.
 */
const DIAGRAM_N = 3;

function buildParabolaMethodDiagram(): Primitive[] {
  const n = DIAGRAM_N;
  const originX = n;
  const originY = n * n;
  const spec: ParabolaSpec = { n, originX, originY };

  const seg = (x1: number, y1: number, x2: number, y2: number, type: Primitive["type"]): Primitive =>
    ({ kind: "segment", type, x1, y1, x2, y2 });

  const primitives: Primitive[] = [
    // The enclosing rectangle: 2n wide, n^2 tall, apex at the mid-point of its base.
    seg(originX - n, originY, originX + n, originY, "construction"),
    seg(originX - n, originY - n * n, originX + n, originY - n * n, "construction"),
    seg(originX - n, originY, originX - n, originY - n * n, "construction"),
    seg(originX + n, originY, originX + n, originY - n * n, "construction"),
    // The axis of symmetry, through the apex.
    seg(originX, originY, originX, originY - n * n, "centre"),
  ];

  for (const sign of [1, -1] as const) {
    const edgeX = originX + sign * n;
    for (let i = 1; i <= n; i++) {
      const markY = originY - i * n;
      // Ray from the apex to the i-th equal division of the side.
      primitives.push(seg(originX, originY, edgeX, markY, "construction"));
      // Vertical raised from the i-th equal division of the half-width, up
      // to where it meets that ray — the located point.
      const pointX = originX + sign * i;
      const pointY = originY - i * i;
      primitives.push(seg(pointX, originY, pointX, pointY, "construction"));
    }
  }

  // The curve itself: straight segments joining consecutive located points,
  // exactly as the student is asked to draw it (see parabola.ts).
  primitives.push(...parabolaKey(spec));

  return primitives;
}

/**
 * PUBLIC, unlike `answerKey` above: this never varies per drill and reveals
 * nothing about any exercise's spec — see the docstring above. Computed once
 * at module load (deterministic and cheap) and frozen, like the isometric
 * pictorial's cached output, so every request shares the same array.
 */
/**
 * A small illustrative three-view figure for the orthographic topic's card.
 *
 * ILLUSTRATIVE, NEVER AN ANSWER. Built from a solid that is deliberately not
 * any exercise's — the same rule the parabola method diagram follows: show a
 * student what the topic looks like without solving anything they will be
 * asked. Computed once at module load, server-side, and it reaches the client
 * only as plain primitives, exactly as the pictorial's paint program does.
 *
 * The three views are laid out in first angle purely so the picture reads as
 * a real sheet; nothing scores it, and the topic card is not the place to
 * teach placement.
 */
function buildOrthographicPreview(): Primitive[] {
  const views = generateViews(subtractBox(block(4, 3, 3), { x: 2, y: 0, z: 2, w: 2, d: 3, h: 1 }));

  const shift = (ps: readonly Primitive[], dx: number, dy: number): Primitive[] =>
    ps.map((q) => (q.kind === "circle"
      ? { ...q, cx: q.cx + dx, cy: q.cy + dy }
      : { ...q, x1: q.x1 + dx, y1: q.y1 + dy, x2: q.x2 + dx, y2: q.y2 + dy }));

  const GAP = 2;
  return [
    ...shift(views.front, 0, 0),
    ...shift(views.top, 0, 3 + GAP),
    ...shift(views.side, -(3 + GAP), 0),
  ];
}

export const ORTHOGRAPHIC_PREVIEW: readonly Primitive[] = Object.freeze(buildOrthographicPreview());

/**
 * What each topic shows on its card. A topic with no preview renders none
 * rather than borrowing another topic's, which would teach the wrong thing.
 */
export function topicPreview(topicId: string): readonly Primitive[] | null {
  if (topicId === "orthographic") return ORTHOGRAPHIC_PREVIEW;
  if (topicId === "parabola") return PARABOLA_METHOD_DIAGRAM;
  if (topicId === "oblique") return OBLIQUE_METHOD_DIAGRAM;
  return null;
}

/**
 * A worked METHOD DIAGRAM for the oblique topic: a small block drawn in
 * cavalier oblique, with a horizontal reference line at the front bottom-right
 * corner so the 45° of the receding axis is visible as an ANGLE rather than
 * merely asserted in prose.
 *
 * DELIBERATELY A SOLID NO EXERCISE USES — a plain 4x3x3 block, where every
 * shipped exercise has a feature and a different size. Same rule as the
 * parabola diagram's n=3: an illustration of the METHOD must never become the
 * answer to an INSTANCE. If a plain 4x3x3 block is ever shipped as an
 * exercise, change THIS, not that.
 *
 * Depth 3 is legal for cavalier (step 1) and would be illegal for cabinet
 * (step 2) — which is fine, the diagram only ever draws cavalier, and
 * `obliqueKey` would throw rather than draw it wrongly if that changed.
 */
const DIAGRAM_SOLID = block(4, 3, 3);

function buildObliqueMethodDiagram(): Primitive[] {
  const drawing = obliqueKey({
    solid: DIAGRAM_SOLID, type: "cavalier", originX: 0, originY: 6,
  });

  // The front bottom-right corner, where the receding axis leaves the front
  // face. A horizontal from there makes the 45° readable.
  const seg = (x1: number, y1: number, x2: number, y2: number): Primitive =>
    ({ kind: "segment", type: "construction", x1, y1, x2, y2 });

  return [
    ...drawing,
    seg(4, 6, 9, 6),   // horizontal reference
    seg(7, 3, 9, 1),   // the receding axis, carried past the solid
  ];
}

export const OBLIQUE_METHOD_DIAGRAM: readonly Primitive[] =
  Object.freeze(buildObliqueMethodDiagram());

export const PARABOLA_METHOD_DIAGRAM: readonly Primitive[] = Object.freeze(buildParabolaMethodDiagram());
