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

function toOrigin(ps: Primitive[]): Primitive[] {
  const box = boundingBox(ps);
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
