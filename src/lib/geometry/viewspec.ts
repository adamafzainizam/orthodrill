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
