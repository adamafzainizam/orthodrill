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
      "80x60x40 block, a 10-deep step off the top-back, and a horizontal " +
      "through-hole on the y axis offset downward. Exercises hidden bore " +
      "lines against a non-trivial silhouette. The step's z-range (3-4) sits " +
      "strictly above the hole's z-range (0-2) so the two features clear " +
      "each other — as adjacent, not tangent, which `validateSolid` treats " +
      "as an overlap it does not model.",
    solid: subtractCylinder(
      subtractBox(block(8, 6, 4), { x: 0, y: 4, z: 3, w: 8, d: 2, h: 1 }),
      "y", 2, 1, 1,
    ),
    source:
      "Not yet matched to a published exercise. Carried as a regression " +
      "fixture only — it pins current behaviour against accidental change and " +
      "must NOT be treated as evidence of correct orientation until cited.",
    status: "UNVERIFIED",
  },
];
