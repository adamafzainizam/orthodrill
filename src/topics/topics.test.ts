import { test } from "node:test";
import assert from "node:assert/strict";
import { getTopic, TOPIC_IDS } from "./topics.ts";

test("every id in TOPIC_IDS resolves, and each topic's own id matches its key", () => {
  for (const id of TOPIC_IDS) {
    const topic = getTopic(id);
    assert.notEqual(topic, null, `${id} is listed but does not resolve`);
    assert.equal(topic?.id, id);
  }
});

test("an unknown id resolves to null, never a thrown error", () => {
  assert.equal(getTopic("no-such-topic"), null);
});

test("an inherited property name cannot masquerade as a topic", () => {
  // A plain-object lookup would hand back Object.prototype's members here.
  for (const id of ["__proto__", "constructor", "toString", "valueOf", "hasOwnProperty"]) {
    assert.equal(getTopic(id), null, `${id} must not resolve to a topic`);
  }
});

test("every topic has at least one hint, and every hint has a non-empty title and body", () => {
  for (const id of TOPIC_IDS) {
    const topic = getTopic(id)!;
    assert.ok(topic.hints.length > 0, `${id} has no hints`);
    for (const hint of topic.hints) {
      assert.ok(hint.title.trim().length > 0, `${id} has a hint with an empty title`);
      assert.ok(hint.body.trim().length > 0, `${id} has a hint with an empty body`);
    }
  }
});

test("there is more than one topic, which is the whole point of this abstraction", () => {
  assert.ok(TOPIC_IDS.length >= 2);
});
