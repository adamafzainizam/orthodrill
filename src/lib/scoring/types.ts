/** Shared result shapes. PURE — types only, no logic, no I/O. */
import type { Primitive } from "./primitives.ts";

/** The right line in the right place, drawn in the wrong line style. */
export type WrongType = { expected: Primitive; drawn: Primitive };

export type ViewDiff = {
  correct: Primitive[];
  missing: Primitive[];
  extra: Primitive[];
  wrongType: WrongType[];
  /**
   * Where the attempt's view sat. Every primitive in this diff is
   * origin-normalised; add this offset to place one in the coordinates the
   * student actually submitted. Anchored on the object exactly as `toOrigin`
   * anchors, so the two can never disagree.
   */
  anchor: { dx: number; dy: number };
};

export type ViewName = "front" | "top" | "side";

/** Relative direction of one view from the front view. */
export type Direction = "above" | "below" | "left" | "right";

export type Convention = "first_angle" | "third_angle";
