import { test } from "node:test";
import assert from "node:assert/strict";
import { getDrill, listDrillIds, publicHalf, answerKey, DRILL_IDS, SHEET, getUpdateRibbon, getUpdateNotes } from "./registry.ts";
import { getTopic, TOPIC_IDS } from "../topics/topics.ts";
import { generateViews, generateViewsFromOccupancy } from "../lib/geometry/views.ts";
import { cellsOfSolid, occupancyFromCells } from "../lib/geometry/cells.ts";
import type { Cell } from "../lib/geometry/rotate3.ts";
import { block, type Solid } from "../lib/geometry/solid.ts";
import { DEPTH_FACTOR } from "../lib/geometry/oblique.ts";
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

test("an oblique prompt only names a dimension its pictorial actually shows", () => {
  // AGENTS.md §6's hazard class: authored prose is graded content and nothing
  // verifies it. This one CAN be verified, so it is.
  //
  // The defect this catches was real. A prompt named the front face as "the 80
  // by 50 face", but the dimension chain splits the width at the step and
  // drops the redundant overall figure (PR #14), so the pictorial shows
  // 60/50/30/30/20 and there is no 80 anywhere on it. A student would have
  // hunted for a number that is not there.
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "figure" || drill.spec.kind !== "oblique") continue;
    // Only exercises shown as a PICTORIAL name a dimension; the ones shown as
    // three views point at the views instead and are checked separately below.
    if (drill.spec.shownAs.kind !== "pictorial") continue;
    const pub = publicHalf(drill);
    assert.notEqual(pub.dimensions, undefined, `${id} has no pictorial to check against`);
    const shown = (pub.dimensions ?? []).map((d) => d.label);
    const claimed = drill.prompt.match(/The (\d+) dimension is the depth/);
    assert.ok(claimed, `${id}'s prompt does not name the depth dimension at all`);
    assert.ok(
      shown.includes(claimed[1]),
      `${id}'s prompt names "${claimed[1]}" as the depth, but the pictorial `
      + `only shows [${shown.join(", ")}] — the student cannot find it`,
    );
  }
});

test("an oblique prompt's stated diagonal count matches the type's depth factor", () => {
  // "six units deep is three diagonals back" is the one number a student
  // actually counts, so it must equal k*d. Getting it wrong would fail them
  // for following the prompt — the parabola-hint failure in a new place.
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "figure" || drill.spec.kind !== "oblique") continue;
    const m = drill.prompt.match(/(\w+) units deep is (\w+) diagonals back/);
    assert.ok(m, `${id}'s prompt does not state the diagonal count`);
    const words: Record<string, number> = {
      two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
    };
    const statedDepth = words[m[1]] ?? Number(m[1]);
    const statedDiagonals = words[m[2]] ?? Number(m[2]);
    assert.equal(statedDepth, drill.spec.solid.base.d, `${id} misstates the depth`);
    assert.equal(
      statedDiagonals,
      DEPTH_FACTOR[drill.spec.type] * drill.spec.solid.base.d,
      `${id} states ${statedDiagonals} diagonals, but ${drill.spec.type} of a `
      + `${drill.spec.solid.base.d}-deep part is `
      + `${DEPTH_FACTOR[drill.spec.type] * drill.spec.solid.base.d}`,
    );
  }
});

test("a views-prompted drill NEVER shows the answer to a Type A exercise", () => {
  // AGENTS.md §5.1 in new clothes. The three views of a solid ARE the answer
  // key for an orthographic exercise on that solid, so a drill that SHOWS the
  // views of S publishes the answer to any Type A drill that ASKS for them.
  //
  // Compared by the GENERATED VIEWS rather than by the solid's fields: two
  // solids described differently can still produce identical views, and it is
  // the views that leak, not the description.
  const askedFor = new Map<string, string>();
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "views") continue;
    askedFor.set(JSON.stringify(generateViews(drill.solid)), id);
  }

  let checked = 0;
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    // Every drill whose PROMPT is the three views of a solid, whatever its
    // mode. Type B shows them by definition; oblique wave 2 shows them by
    // choice. Both publish that solid's Type A answer key.
    const shownSolid =
      drill.mode === "build" ? drill.solid
      : drill.mode === "figure" && drill.spec.kind === "oblique" && drill.spec.shownAs.kind === "views"
        ? drill.spec.solid
      : null;
    if (shownSolid === null) continue;
    checked++;
    const shown = JSON.stringify(generateViews(shownSolid));
    const clash = askedFor.get(shown);
    assert.equal(
      clash, undefined,
      `${id} shows the three views of the same part that "${clash}" asks the `
      + `student to DRAW — its prompt is that exercise's answer key`,
    );
  }
  // A test that never runs proves nothing (AGENTS.md §6): fail loudly if the
  // catalogue stops containing the thing this guards.
  assert.ok(checked > 0, "no views-prompted drills found — this test is inert");
});

test("a views-prompted drill publishes its views and NOT its solid", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "figure" || drill.spec.kind !== "oblique") continue;
    if (drill.spec.shownAs.kind !== "views") continue;
    const pub = publicHalf(drill);
    // Narrowed rather than cast: promptViews lives only on the figure branch.
    assert.equal(pub.mode, "figure");
    if (pub.mode !== "figure") continue;
    assert.ok(pub.promptViews !== undefined, `${id} shows views but publishes none`);
    assert.equal(pub.promptConvention, drill.spec.shownAs.convention);
    assert.equal("spec" in pub, false, `${id} leaked its spec`);
    assert.equal("solid" in pub, false, `${id} leaked its solid`);
  }
});

test("a 'build' drill's solid is BOX-ONLY", () => {
  // Not a style rule. `buildOccupancy` drops cylinder ops, so a bored solid's
  // key would silently omit the bore while the prompt shows a circle plainly,
  // and the student would be marked wrong for the feature they could read
  // most easily. Engine spec §4.
  let checked = 0;
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "build") continue;
    checked++;
    for (const op of drill.solid.ops) {
      assert.notEqual(
        op.kind, "cylinder",
        `${id} has a cylinder op — a build drill's key cannot represent a bore`,
      );
    }
  }
  assert.ok(checked > 0, "no build drills found — this test is inert");
});

test("a 'build' drill is WELL-POSED: its three views determine its part", () => {
  // The premise the whole topic rests on. If a student can build something
  // genuinely consistent with all three given views and we mark it wrong, the
  // app teaches a falsehood — worse than a wrong key, because the student's
  // reasoning was correct. Engine spec §2.
  //
  // This is NOT belt-and-braces: exhaustive enumeration of a 2x2x2 grid found
  // two buckets of genuinely different parts sharing all three views, so
  // ambiguity is real and has to be excluded per part.
  let checked = 0;
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "build") continue;
    checked++;
    const { w, d, h } = drill.solid.base;
    const cells = cellsOfSolid(drill.solid);
    const target = JSON.stringify(generateViews(drill.solid));

    // Probe 1: the visual hull is the maximal cell set consistent with the
    // three silhouettes. If it differs from the key AND generates the same
    // views, a student could legitimately build it instead.
    const silF = new Set<string>(), silT = new Set<string>(), silS = new Set<string>();
    for (const [x, y, z] of cells) {
      silF.add(`${x},${z}`); silT.add(`${x},${y}`); silS.add(`${y},${z}`);
    }
    const hull: Cell[] = [];
    for (let k = 0; k < h; k++) for (let j = 0; j < d; j++) for (let i = 0; i < w; i++)
      if (silF.has(`${i},${k}`) && silT.has(`${i},${j}`) && silS.has(`${j},${k}`)) hull.push([i, j, k]);
    if (hull.length !== cells.length) {
      assert.notEqual(
        JSON.stringify(generateViewsFromOccupancy(occupancyFromCells(hull, w, d, h))), target,
        `${id}: its visual hull is a DIFFERENT part with the SAME three views — the exercise is ambiguous`,
      );
    }

    // Probe 2: exhaustive single-cell removal. If any one cell can go with all
    // three views unchanged, ambiguity is proven by an example a student could
    // plausibly build.
    for (const c of cells) {
      const without = cells.filter((o) => !(o[0] === c[0] && o[1] === c[1] && o[2] === c[2]));
      assert.notEqual(
        JSON.stringify(generateViewsFromOccupancy(occupancyFromCells(without, w, d, h))), target,
        `${id}: removing cell ${c.join(",")} leaves all three views unchanged — the exercise is ambiguous`,
      );
    }
  }
  assert.ok(checked > 0, "no build drills found — this test is inert");
});

test("a construction prompt sizes everything in SQUARES, never in 'units'", () => {
  // On a 45-degree line a square and a unit differ by sqrt(2), so "reaching 5
  // units either side" describes a point about 3.5 squares out — off the grid,
  // and therefore literally undrawable, since validate.ts rejects a
  // non-integer coordinate. A student following the prompt exactly would be
  // marked wrong for it.
  //
  // This slipped through THREE TIMES in one authoring pass and was caught each
  // time only by reading the rendered page, so it is mechanical now. The rule:
  // if any segment of the key is diagonal, the prompt talks in SQUARES.
  // The rule is UNIFORM rather than conditional on the key's geometry, and
  // deliberately so: an earlier version of this test only policed prompts
  // whose answer contained a diagonal, and immediately hit a prompt where the
  // ARMS were axis-aligned (units correct) and only the BISECTOR was diagonal.
  // Teaching the guard to tell which phrase describes which element is far
  // harder than removing the trap — on a grid, everything is squares.
  let checked = 0, diagonal = 0;
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "figure" || drill.spec.kind !== "construction") continue;
    checked++;
    if (answerKey(drill).some((p) => p.kind === "segment" && p.x1 !== p.x2 && p.y1 !== p.y2)) {
      diagonal++;
    }
    // Case-INSENSITIVE, and that matters: the first version of this guard was
    // case-sensitive, and a mutation test writing "FIVE UNITS" walked straight
    // past it. A guard that only catches the lowercase spelling of a mistake
    // is most of the way to not being a guard.
    assert.doesNotMatch(
      drill.prompt, /\bunits?\b/i,
      `${id}'s prompt sizes something in "units". On a diagonal a unit is `
      + `sqrt(2) out from the squares a student counts, so the point it `
      + `describes is not on the grid — say squares instead`,
    );
    assert.match(drill.prompt, /\bsquares?\b/i, `${id}'s prompt never says how many squares`);
  }
  assert.ok(checked > 0, "no construction drills found — this test is inert");
  assert.ok(diagonal > 0, "no construction has a diagonal answer — this test guards nothing");
});

test("every construction key is integral and fits the sheet", () => {
  // validate.ts rejects a non-integer coordinate outright, so an off-grid key
  // would make the correct answer undrawable — the §1.1 lattice check's whole
  // point, enforced here on the shipped content rather than trusted.
  let checked = 0;
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    if (drill.mode !== "figure" || drill.spec.kind !== "construction") continue;
    checked++;
    for (const p of answerKey(drill)) {
      assert.equal(p.kind, "segment", `${id} emitted a non-segment primitive`);
      if (p.kind !== "segment") continue;
      for (const v of [p.x1, p.y1, p.x2, p.y2]) {
        assert.ok(Number.isInteger(v), `${id} has an off-grid coordinate ${v}`);
      }
      for (const [a, b] of [[p.x1, p.x2], [p.y1, p.y2]] as const) {
        assert.ok(Math.min(a, b) >= 0, `${id} runs off the top or left of the sheet`);
      }
      assert.ok(Math.max(p.x1, p.x2) <= SHEET.width, `${id} runs off the right of the sheet`);
      assert.ok(Math.max(p.y1, p.y2) <= SHEET.height, `${id} runs off the bottom of the sheet`);
    }
  }
  assert.ok(checked > 0, "no construction drills found — this test is inert");
});

test("every drill has an addedOn date, shaped like an ISO date", () => {
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    assert.match(
      drill.addedOn, /^\d{4}-\d{2}-\d{2}$/,
      `${id}'s addedOn is missing or not shaped like YYYY-MM-DD`,
    );
  }
});

test("no drill's addedOn is dated in the future", () => {
  // One day of slack against the test machine's clock, so a drill dated
  // TODAY cannot fail on a machine whose timezone has not rolled over yet.
  // String comparison is safe and deliberate here: two YYYY-MM-DD strings
  // compare lexicographically in the same order as the dates themselves, so
  // there is no Date parsing and no timezone conversion to get wrong.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const cutoff = tomorrow.toISOString().slice(0, 10);
  for (const id of listDrillIds()) {
    const drill = getDrill(id)!;
    assert.ok(
      drill.addedOn <= cutoff,
      `${id}'s addedOn (${drill.addedOn}) is in the future`,
    );
  }
});

test("getUpdateRibbon's date is the maximum addedOn across the real registry", () => {
  const dates = listDrillIds().map((id) => getDrill(id)!.addedOn);
  const maxDate = dates.reduce((max, d) => (d > max ? d : max), dates[0]);
  assert.equal(getUpdateRibbon()!.date, maxDate);
});

test("getUpdateRibbon's count matches the number of drills at that date", () => {
  const ribbon = getUpdateRibbon()!;
  const atThatDate = listDrillIds().filter((id) => getDrill(id)!.addedOn === ribbon.date);
  assert.equal(ribbon.count, atThatDate.length);
});

test("getUpdateNotes accounts for every drill exactly once", () => {
  const total = getUpdateNotes().reduce((n, b) => n + b.count, 0);
  assert.equal(total, listDrillIds().length);
});

test("getUpdateNotes' dates run newest-first, with no date appearing twice", () => {
  const dates = getUpdateNotes().map((b) => b.date);
  for (let i = 1; i < dates.length; i++) {
    assert.ok(
      dates[i - 1] > dates[i],
      `${dates[i - 1]} should come strictly after ${dates[i]}`,
    );
  }
});

test("every batch's breakdown sums to its own count, on the real catalogue", () => {
  for (const batch of getUpdateNotes()) {
    assert.equal(
      batch.byTopic.reduce((n, t) => n + t.count, 0), batch.count,
      `${batch.date}'s breakdown does not sum to its own count`,
    );
  }
});

test("every topic named in the notes is a real topic with a non-empty title", () => {
  // NOT `title === getTopic(topicId)!.title`. getUpdateNotes computes the
  // title with that exact expression, so asserting it would recompute the
  // subject and pass against any join, right or wrong — AGENTS.md §6's
  // tautological-assertion failure, the one the generator's bounding-box
  // test shipped with. What is checkable without recomputing: the id is one
  // the catalogue knows, and the title is not empty.
  for (const batch of getUpdateNotes()) {
    for (const topic of batch.byTopic) {
      assert.ok(TOPIC_IDS.includes(topic.topicId), `${topic.topicId} is not a known topic`);
      assert.ok(topic.title.length > 0, `${topic.topicId} has an empty title`);
    }
  }
});
