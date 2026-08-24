/**
 * Set-diff one drawn view against one key view.
 *
 * Translation-invariant: both sides are normalised so their bounding boxes
 * start at the origin. A correct view drawn ten units to the right is still a
 * correct view — WHERE it sits is judged by placement.ts, because placement is
 * a separate skill (first- vs third-angle) and deserves its own verdict.
 *
 * PURE. No I/O.
 */
import {
  boundingBox, positionKey, translate, type Primitive,
} from "./primitives.ts";
import type { ViewDiff, WrongType } from "./types.ts";

/**
 * Shift a view so it starts at the origin, ANCHORED ON THE OBJECT rather than
 * on everything drawn.
 *
 * Centre lines legitimately extend past the feature they mark, and by how much
 * is a presentation choice, not part of the answer. If they were allowed into
 * the anchor, a student who drew the part perfectly but ran their centre lines
 * a unit longer would shift the entire view relative to the key, and every
 * primitive would come back wrong — a total failure caused by a cosmetic
 * difference. Anchoring on the object makes the cost of that mistake one
 * primitive, which is what it is worth.
 *
 * Every primitive, centre lines included, is still translated by the same
 * offset; only the choice of anchor changes.
 */
function toOrigin(ps: Primitive[]): Primitive[] {
  const object = ps.filter((p) => p.type !== "centre");
  // A view of nothing but centre lines has no object to anchor on; fall back
  // to anchoring on itself so it still normalises rather than vanishing.
  const box = boundingBox(object.length > 0 ? object : ps);
  if (box === null) return [];
  return ps.map((p) => translate(p, -box.minX, -box.minY));
}

export function compareView(attempt: Primitive[], key: Primitive[]): ViewDiff {
  const a = toOrigin(attempt);
  const k = toOrigin(key);

  const attemptByPos = new Map(a.map((p) => [positionKey(p), p]));
  const keyByPos = new Map(k.map((p) => [positionKey(p), p]));

  const correct: Primitive[] = [];
  const missing: Primitive[] = [];
  const extra: Primitive[] = [];
  const wrongType: WrongType[] = [];

  for (const [pos, expected] of keyByPos) {
    const drawn = attemptByPos.get(pos);
    if (drawn === undefined) missing.push(expected);
    else if (drawn.type === expected.type) correct.push(expected);
    else wrongType.push({ expected, drawn });
  }

  for (const [pos, drawn] of attemptByPos) {
    if (!keyByPos.has(pos)) extra.push(drawn);
  }

  return { correct, missing, extra, wrongType };
}

export function isPerfect(d: ViewDiff): boolean {
  return d.missing.length === 0 && d.extra.length === 0 && d.wrongType.length === 0;
}

/** Lower is better. Used by assign.ts to pick between candidate assignments. */
export function diffCost(d: ViewDiff): number {
  return d.missing.length + d.extra.length + d.wrongType.length;
}
