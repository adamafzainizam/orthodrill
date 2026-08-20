import { test } from "node:test";
import assert from "node:assert/strict";

test("the test harness runs TypeScript and strips types", () => {
  const typed: number = 2 + 2;
  assert.equal(typed, 4);
});
