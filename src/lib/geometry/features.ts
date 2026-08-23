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
