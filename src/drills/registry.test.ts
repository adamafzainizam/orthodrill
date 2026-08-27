import { test } from "node:test";
import assert from "node:assert/strict";
import { getDrill, listDrillIds, publicHalf, answerKey, DRILL_IDS } from "./registry.ts";
import { getTopic } from "../topics/topics.ts";

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
