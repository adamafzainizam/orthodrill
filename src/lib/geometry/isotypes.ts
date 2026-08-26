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

/**
 * One visible face, as a closed polygon in projection units.
 *
 * Rendered as an OPAQUE fill in the page background colour, not as an outline.
 * Fills are what make hidden-line removal work: the emitted array is ordered
 * back to front, so a nearer face's fill paints over a farther face's strokes.
 * See the design document §6.
 */
export type IsoFace = {
  kind: "iso-face";
  points: [number, number][];
};

export type IsoPrimitive = IsoFace | IsoLine | IsoEllipse;
