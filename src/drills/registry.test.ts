import { test } from "node:test";
import assert from "node:assert/strict";
import { getDrill, listDrillIds, publicHalf, answerKey, DRILL_IDS } from "./registry.ts";

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

test("the public half carries what the question needs", () => {
  const pub = publicHalf(getDrill(DRILL_IDS[0])!);
  assert.equal(typeof pub.id, "string");
  assert.equal(typeof pub.title, "string");
  assert.equal(typeof pub.prompt, "string");
  assert.ok(pub.convention === "first_angle" || pub.convention === "third_angle");
  assert.ok(pub.isometric.length > 0, "no pictorial to show the student");
  assert.ok(pub.grid.width > 0 && pub.grid.height > 0);
});

test("every drill yields three non-empty views as its key", () => {
  for (const id of listDrillIds()) {
    const key = answerKey(getDrill(id)!);
    for (const view of ["front", "top", "side"] as const) {
      assert.ok(key[view].length > 0, `${id} has an empty ${view} view`);
    }
  }
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
  assert.equal(answerKey(d), answerKey(d), "each call re-ran the generator");
});

test("a public half is built once per drill, not once per request", () => {
  const d = getDrill(DRILL_IDS[0])!;
  assert.equal(publicHalf(d), publicHalf(d), "each call re-ran the isometric projection");
});

test("a cached key is frozen, so one caller cannot corrupt every later score", () => {
  const key = answerKey(getDrill(DRILL_IDS[0])!);
  assert.throws(() => { (key.front as unknown as unknown[]).push({}); });
  assert.ok(Object.isFrozen(key.front));
});

test("a cached public half is frozen too", () => {
  const pub = publicHalf(getDrill(DRILL_IDS[0])!);
  assert.throws(() => { (pub.isometric as unknown as unknown[]).push({}); });
});
