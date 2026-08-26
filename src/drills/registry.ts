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
import type { IsoPrimitive } from "../lib/geometry/isotypes.ts";
import type { KeyViews } from "../lib/scoring/assign.ts";
import type { Convention } from "../lib/scoring/types.ts";

export type Drill = {
  id: string;
  title: string;
  prompt: string;
  convention: Convention;
  /** PRIVATE. The answer key in compressed form. Never serialise this. */
  solid: Solid;
};

/** Exactly what the browser is allowed to see. */
export type PublicDrill = {
  id: string;
  title: string;
  prompt: string;
  convention: Convention;
  grid: { width: number; height: number };
  isometric: IsoPrimitive[];
};

/**
 * Room for the three views plus the gaps a student leaves between them. The
 * scorer clusters at DEFAULT_CLUSTER_GAP, so the grid has to be comfortably
 * larger than that or two views would be read as one.
 */
const VIEW_GAP = 10;

function gridFor(solid: Solid): { width: number; height: number } {
  const { w, d, h } = solid.base;
  return { width: w + d + VIEW_GAP * 3, height: h + d + VIEW_GAP * 3 };
}

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
    solid: subtractBox(block(6, 4, 4), { x: 4, y: 0, z: 2, w: 2, d: 4, h: 2 }, "step"),
  },
  {
    id: "corner-cut",
    title: "Corner cut-out",
    prompt:
      "A block with a rectangular notch removed from one vertical corner. Watch "
      + "which side the notch appears on in each view.",
    convention: "first_angle",
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
    solid: subtractCylinder(block(8, 6, 3), "z", 3, 3, 2, "bore"),
  },
  {
    id: "stepped-plate-bore",
    title: "Stepped plate with a hole",
    prompt:
      "A step and a through-hole on the same part. The hole is bored along the "
      + "depth axis, so it is hidden in two of the three views.",
    convention: "first_angle",
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

/** The half that may cross the wire. Built by naming fields, never by omission. */
export function publicHalf(drill: Drill): PublicDrill {
  return {
    id: drill.id,
    title: drill.title,
    prompt: drill.prompt,
    convention: drill.convention,
    grid: gridFor(drill.solid),
    isometric: isometricView(drill.solid),
  };
}

/** SERVER ONLY. The answer key, derived from the solid on demand. */
export function answerKey(drill: Drill): KeyViews {
  return generateViews(drill.solid);
}
