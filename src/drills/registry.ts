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
import { isometricDimensions, type IsoDim } from "../lib/geometry/isodims.ts";
import type { IsoPrimitive } from "../lib/geometry/isotypes.ts";
import type { KeyViews } from "../lib/scoring/assign.ts";
import type { Convention } from "../lib/scoring/types.ts";
import type { TopicId } from "../topics/topics.ts";

export type Drill = {
  id: string;
  title: string;
  prompt: string;
  convention: Convention;
  /** Which topic's sidebar and hints this exercise belongs under. */
  topicId: TopicId;
  /**
   * Which scoring mode this exercise uses. Explicit rather than inferred from
   * the presence of `solid` — inference is how the wrong branch gets taken
   * when a mode this catalogue does not yet carry (e.g. "figure", for a
   * single-drawing construction exercise) arrives. Every drill here is
   * "views" today; nothing in this catalogue is figure-mode yet.
   */
  mode: "views";
  /** PRIVATE. The answer key in compressed form. Never serialise this. */
  solid: Solid;
};

/** Exactly what the browser is allowed to see. */
export type PublicDrill = {
  id: string;
  title: string;
  prompt: string;
  convention: Convention;
  grid: Readonly<{ width: number; height: number }>;
  /** Readonly because it is cached and shared across requests. */
  isometric: readonly IsoPrimitive[];
  /** Readonly for the same reason. Derived from the solid, never the solid
   *  itself — see isodims.ts for why that is enough to be trustworthy. */
  dimensions: readonly IsoDim[];
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
 * The starter progression: one feature, then two axes of asymmetry, then a
 * bore. Deliberately short — the design spec asks for 8-12 drills, and the
 * remainder is content work for the builder rather than something to invent
 * here. Each key is generated, so adding a drill is defining a solid.
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
const publicCache = new Map<string, PublicDrill>();

/** One level deep is enough: these hold arrays of plain primitive records. */
function freezeViews<T extends Record<string, readonly unknown[]>>(v: T): T {
  for (const list of Object.values(v)) Object.freeze(list);
  return Object.freeze(v);
}

/** The half that may cross the wire. Built by naming fields, never by omission. */
export function publicHalf(drill: Drill): PublicDrill {
  const cached = publicCache.get(drill.id);
  if (cached !== undefined) return cached;

  const built: PublicDrill = Object.freeze({
    id: drill.id,
    title: drill.title,
    prompt: drill.prompt,
    convention: drill.convention,
    grid: SHEET,
    isometric: Object.freeze(isometricView(drill.solid)),
    dimensions: Object.freeze(isometricDimensions(drill.solid)),
  });
  publicCache.set(drill.id, built);
  return built;
}

/** SERVER ONLY. The answer key, derived from the solid and cached. */
export function answerKey(drill: Drill): KeyViews {
  const cached = keyCache.get(drill.id);
  if (cached !== undefined) return cached;

  const built = freezeViews(generateViews(drill.solid));
  keyCache.set(drill.id, built);
  return built;
}
