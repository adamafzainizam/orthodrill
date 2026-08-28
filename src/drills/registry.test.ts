import { test } from "node:test";
import assert from "node:assert/strict";
import { getDrill, listDrillIds, publicHalf, answerKey, DRILL_IDS } from "./registry.ts";
import { getTopic } from "../topics/topics.ts";
import { generateViews } from "../lib/geometry/views.ts";
import { block, type Solid } from "../lib/geometry/solid.ts";
import { boundingBox, type Primitive } from "../lib/scoring/primitives.ts";
import type { KeyViews } from "../lib/scoring/assign.ts";

/**
 * Same mirroring technique `fixtures/golden.test.ts` uses to guard against a
 * mirrored generator, duplicated locally rather than imported because that
 * file's helpers are private to it and this check is scoped differently:
 * golden's test demands EVERY view asymmetric in BOTH directions (needed to
 * pin orientation); this one only needs ONE view, ONE direction, ANYWHERE in
 * the solid, which is the weaker content requirement AGENTS.md actually
 * states ("ASYMMETRIC on at least one axis").
 *
 * DELIBERATELY NOT a straight copy of golden.test.ts's key functions. Those
 * build a segment's key from `(x1,y1,x2,y2)` in whatever order the generator
 * happened to emit the endpoints, and a mirror swaps which endpoint comes
 * first only along the axis being mirrored — so a vertical edge mirrored
 * left-right keeps its own y1/y2 order while its true mirror partner (an
 * edge the generator emitted independently) may have been authored with the
 * opposite y1/y2 order. The two strings then disagree for reasons that have
 * nothing to do with geometry. Caught here, not by inspection: the positive
 * control below (a plain, obviously symmetric block) came back "asymmetric"
 * on the first draft of this file, which is exactly the failure a positive
 * control exists to catch, per AGENTS.md's own account of the property-test
 * failure mode. Fixed by canonicalising each segment's endpoint order before
 * building its key, so direction of authorship cannot affect the string.
 * Harmless for golden.test.ts's own use — its fixtures are asymmetric by
 * construction, so a spurious "not equal" there lands on the correct verdict
 * by accident — but wrong for a check whose whole job is telling
 * SYMMETRIC apart from NOT, which needs this fix to be trustworthy.
 */
function segKey(x1: number, y1: number, x2: number, y2: number, type: string): string {
  const [ax, ay, bx, by] = x1 < x2 || (x1 === x2 && y1 <= y2) ? [x1, y1, x2, y2] : [x2, y2, x1, y1];
  return `s:${ax},${ay},${bx},${by},${type}`;
}

const plainKey = (ps: Primitive[]) =>
  ps
    .map((p) => p.kind === "circle" ? `c:${p.cx},${p.cy},${p.r},${p.type}` : segKey(p.x1, p.y1, p.x2, p.y2, p.type))
    .sort()
    .join("|");

const hMirrorKey = (ps: Primitive[]) => {
  const b = boundingBox(ps);
  if (b === null) return "";
  return ps
    .map((p) =>
      p.kind === "circle"
        ? `c:${b.maxX - (p.cx - b.minX)},${p.cy},${p.r},${p.type}`
        : segKey(b.maxX - (p.x1 - b.minX), p.y1, b.maxX - (p.x2 - b.minX), p.y2, p.type),
    )
    .sort()
    .join("|");
};

const vMirrorKey = (ps: Primitive[]) => {
  const b = boundingBox(ps);
  if (b === null) return "";
  return ps
    .map((p) =>
      p.kind === "circle"
        ? `c:${p.cx},${b.maxY - (p.cy - b.minY)},${p.r},${p.type}`
        : segKey(p.x1, b.maxY - (p.y1 - b.minY), p.x2, b.maxY - (p.y2 - b.minY), p.type),
    )
    .sort()
    .join("|");
};

const VIEW_NAMES = ["front", "top", "side"] as const;

/**
 * True when at least one of the three views is asymmetric in at least one
 * direction. A solid that fails this check would sail through a mirror bug
 * in EVERY view on EVERY axis undetected — it verifies nothing about
 * handedness anywhere.
 */
function isAsymmetricSomewhere(solid: Solid): boolean {
  const views: KeyViews = generateViews(solid);
  for (const name of VIEW_NAMES) {
    const ps = views[name];
    const plain = plainKey(ps);
    if (hMirrorKey(ps) !== plain || vMirrorKey(ps) !== plain) return true;
  }
  return false;
}

test("a known drill id resolves", () => {
  const id = DRILL_IDS[0];
  assert.notEqual(getDrill(id), null);
});

test("an unknown drill id resolves to null, never a thrown error", () => {
  assert.equal(getDrill("no-such-drill"), null);
});

test("a path-traversal id resolves to null", () => {
  assert.equal(getDrill("../../etc/passwd"), null);
  assert.equal(getDrill("../private/keys"), null);
});

test("an inherited property name cannot masquerade as a drill", () => {
  // A plain-object lookup would hand back Object.prototype's members here.
  for (const id of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
    assert.equal(getDrill(id), null, `${id} must not resolve to a drill`);
  }
});

test("every listed id resolves, and every drill's id matches its key", () => {
  for (const id of listDrillIds()) {
    const d = getDrill(id);
    assert.notEqual(d, null, `${id} is listed but does not resolve`);
    assert.equal(d?.id, id);
  }
});

test("the public half carries no solid and no answer key", () => {
  for (const id of listDrillIds()) {
    const pub = publicHalf(getDrill(id)!);
    const keys = Object.keys(pub);
    assert.ok(!keys.includes("solid"), `${id} public half leaks the solid`);
    assert.ok(!keys.includes("key"), `${id} public half leaks the key`);
    assert.ok(!keys.includes("views"), `${id} public half leaks the views`);
    // Serialised, because that is what actually crosses the wire.
    const wire = JSON.stringify(pub);
    assert.ok(!wire.includes('"solid"'), `${id} serialises a solid`);
    assert.ok(!wire.includes('"ops"'), `${id} serialises the feature operations`);
  }
});

test("a 'figure' drill's public half leaks no spec and nothing that trivially yields the key", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "figure") continue;
    const pub = publicHalf(drill);
    const keys = Object.keys(pub);
    assert.ok(!keys.includes("spec"), `${id} public half leaks the spec`);
    assert.ok(!keys.includes("n"), `${id} public half leaks n`);
    assert.ok(!keys.includes("originX"), `${id} public half leaks originX`);
    assert.ok(!keys.includes("originY"), `${id} public half leaks originY`);
    assert.ok(!keys.includes("bounds"), `${id} public half leaks bounds`);
    // Serialised, because that is what actually crosses the wire. parabolaKey
    // is a pure function anyone could run, so ANY field it needs as input —
    // n, originX, originY, or a bounds figure n is trivially recovered from
    // (bounds.width === 2n) — must not appear on the wire in any form.
    const wire = JSON.stringify(pub);
    assert.ok(!wire.includes('"spec"'), `${id} serialises a spec`);
    assert.ok(!wire.includes('"originX"'), `${id} serialises originX`);
    assert.ok(!wire.includes('"originY"'), `${id} serialises originY`);
    assert.ok(!wire.includes('"bounds"'), `${id} serialises bounds`);
  }
});

test("the public half of a 'views' drill carries what the question needs", () => {
  const pub = publicHalf(getDrill(DRILL_IDS[0])!);
  assert.equal(typeof pub.id, "string");
  assert.equal(typeof pub.title, "string");
  assert.equal(typeof pub.prompt, "string");
  assert.equal(pub.mode, "views");
  if (pub.mode !== "views") return;
  assert.ok(pub.convention === "first_angle" || pub.convention === "third_angle");
  assert.ok(pub.isometric.length > 0, "no pictorial to show the student");
  assert.ok(pub.dimensions.length > 0, "no dimensions to show the student");
  assert.ok(pub.grid.width > 0 && pub.grid.height > 0);
});

test("the public half of a 'figure' drill carries what the question needs", () => {
  const figureId = listDrillIds().find((id) => getDrill(id)!.mode === "figure");
  assert.notEqual(figureId, undefined, "no figure drill in the catalogue to test");
  const pub = publicHalf(getDrill(figureId!)!);
  assert.equal(typeof pub.id, "string");
  assert.equal(typeof pub.title, "string");
  assert.equal(typeof pub.prompt, "string");
  assert.equal(pub.mode, "figure");
  assert.ok(pub.grid.width > 0 && pub.grid.height > 0);
  assert.ok(pub.topic.hints.length > 0, "no hints for the sidebar to show");
});

test("every public half carries its topic's id, title and hints", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    const pub = publicHalf(drill);
    assert.equal(pub.topic.id, drill.topicId);
    assert.equal(typeof pub.topic.title, "string");
    assert.ok(pub.topic.hints.length > 0, `${id}'s topic has no hints`);
  }
});

test("a cached public half's dimensions are frozen too", () => {
  const pub = publicHalf(getDrill(DRILL_IDS[0])!);
  if (pub.mode !== "views") throw new Error("expected DRILL_IDS[0] to be a 'views' drill");
  assert.throws(() => { (pub.dimensions as unknown as unknown[]).push({}); });
});

test("every 'views' drill yields three non-empty views as its key", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "views") continue;
    const key = answerKey(drill);
    for (const view of ["front", "top", "side"] as const) {
      assert.ok(key[view].length > 0, `${id} has an empty ${view} view`);
    }
  }
});

test("every 'figure' drill yields a non-empty key", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "figure") continue;
    assert.ok(answerKey(drill).length > 0, `${id} has an empty key`);
  }
});

test("there is at least one 'views' drill and one 'figure' drill", () => {
  const modes = listDrillIds().map((id) => getDrill(id)!.mode);
  assert.ok(modes.includes("views"), "no 'views' drill in the catalogue");
  assert.ok(modes.includes("figure"), "no 'figure' drill in the catalogue");
});

test("drill ids are unique", () => {
  const ids = listDrillIds();
  assert.equal(new Set(ids).size, ids.length);
});

test("there is more than one drill, so the catalogue is a real progression", () => {
  assert.ok(listDrillIds().length >= 3, "a single drill is a demo, not a drill set");
});

test("an answer key is generated once per drill, not once per request", () => {
  const d = getDrill(DRILL_IDS[0])!;
  if (d.mode !== "views") throw new Error("expected DRILL_IDS[0] to be a 'views' drill");
  assert.equal(answerKey(d), answerKey(d), "each call re-ran the generator");
});

test("a public half is built once per drill, not once per request", () => {
  const d = getDrill(DRILL_IDS[0])!;
  assert.equal(publicHalf(d), publicHalf(d), "each call re-ran the isometric projection");
});

test("a cached key is frozen, so one caller cannot corrupt every later score", () => {
  const d = getDrill(DRILL_IDS[0])!;
  if (d.mode !== "views") throw new Error("expected DRILL_IDS[0] to be a 'views' drill");
  const key = answerKey(d);
  assert.throws(() => { (key.front as unknown as unknown[]).push({}); });
  assert.ok(Object.isFrozen(key.front));
});

test("a figure drill's cached key is frozen too", () => {
  const figureId = listDrillIds().find((id) => getDrill(id)!.mode === "figure");
  assert.notEqual(figureId, undefined, "no figure drill in the catalogue to test");
  const d = getDrill(figureId!)!;
  if (d.mode !== "figure") throw new Error("expected a 'figure' drill");
  const key = answerKey(d);
  assert.throws(() => { (key as unknown as unknown[]).push({}); });
  assert.ok(Object.isFrozen(key));
});

test("a cached public half is frozen too", () => {
  const pub = publicHalf(getDrill(DRILL_IDS[0])!);
  if (pub.mode !== "views") throw new Error("expected DRILL_IDS[0] to be a 'views' drill");
  assert.throws(() => { (pub.isometric as unknown as unknown[]).push({}); });
});

test("every drill uses the same sheet, so nothing has to be relearned per exercise", () => {
  const sizes = listDrillIds().map((id) => publicHalf(getDrill(id)!).grid);
  const first = sizes[0];
  for (const g of sizes) {
    assert.deepEqual(g, first, "drills disagree about the sheet size");
  }
});

test("the sheet's dimensions are even, so the quadrant dividers land on grid lines", () => {
  // An odd dimension puts a divider on a half-unit, which reads as a canvas
  // that is subtly out of alignment with its own grid.
  const g = publicHalf(getDrill(DRILL_IDS[0])!).grid;
  assert.equal(g.width % 2, 0, `sheet width ${g.width} is odd`);
  assert.equal(g.height % 2, 0, `sheet height ${g.height} is odd`);
});

test("every exercise's topicId resolves to a real topic", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    assert.notEqual(getTopic(drill.topicId), null, `${id} has an unresolvable topicId`);
  }
});

test("the sheet is big enough for every 'views' drill's three views plus gaps", () => {
  // Guards a future drill silently outgrowing a now-fixed sheet.
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "views") continue;
    const { w, d, h } = drill.solid.base;
    const g = publicHalf(drill).grid;
    assert.ok(w + d < g.width, `${id} needs ${w + d} across, sheet is ${g.width}`);
    assert.ok(h + d < g.height, `${id} needs ${h + d} down, sheet is ${g.height}`);
  }
});

// POSITIVE CONTROL, run first so a broken check is caught before it is
// trusted below. A bare block with no features is symmetric in every view,
// in both directions — mirroring a plain rectangle onto itself is the
// definition of symmetric — so `isAsymmetricSomewhere` MUST return false
// here. Without this, a check that always returned `true` (e.g. a typo'd
// comparison) would pass the real test below by never actually looking.
test("the asymmetry check itself correctly flags a deliberately symmetric solid", () => {
  const plainBlock = block(6, 4, 4);
  assert.equal(
    isAsymmetricSomewhere(plainBlock),
    false,
    "a plain block with no features registered as asymmetric — the check is broken",
  );
});

test("every orthographic exercise's solid is asymmetric on at least one axis", () => {
  // AGENTS.md's stated content requirement (a symmetric part cannot catch a
  // mirrored view, this project's most feared failure class), and nothing
  // enforced it before this test. Weaker than fixtures/golden.test.ts's
  // "every view, both directions" — that test exists to pin ORIENTATION for
  // a small trusted reference set; this one only guards the CONTENT
  // requirement that every shipped exercise gives a mirror bug somewhere to
  // be caught, which is what the design spec and AGENTS.md actually ask for.
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "views") continue;
    assert.ok(
      isAsymmetricSomewhere(drill.solid),
      `${id} is symmetric in every view, in both directions — a mirrored `
      + `generator would produce an identical-looking wrong answer for it`,
    );
  }
});
