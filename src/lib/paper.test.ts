import { test } from "node:test";
import assert from "node:assert/strict";
import { PAPERS, PAPER_KEY, parsePaper } from "./paper.ts";

test("there are exactly three papers, white first", () => {
  assert.deepEqual(PAPERS, ["white", "warm", "dark"]);
});

test("every valid id parses back to itself", () => {
  for (const p of PAPERS) assert.equal(parsePaper(p), p);
});

test("an absent preference is white", () => {
  // localStorage.getItem returns null when nothing is stored, and the very
  // first visitor is the common case — not an edge one.
  assert.equal(parsePaper(null), "white");
});

test("an unrecognised value is white, not a crash and not a blank sheet", () => {
  // A stored value can be anything: an older build's vocabulary, a hand-edited
  // devtools entry, a truncated write. Falling back beats trusting it — an
  // unknown id would select no token block and leave the sheet mid-theme.
  assert.equal(parsePaper("sepia"), "white");
  assert.equal(parsePaper(""), "white");
});

test("parsing is case-SENSITIVE, matching what the writer stores", () => {
  // Deliberate: the only writer is the settings page, which stores exactly
  // one of PAPERS. Accepting "Dark" would mean the inline script in
  // layout.tsx has to lower-case too, and the two would drift apart.
  assert.equal(parsePaper("Dark"), "white");
});

test("the storage key is namespaced, like the ribbon's", () => {
  // Same origin as the ribbon's dismissal key, so a bare "paper" could
  // collide with anything else that ever stores under this origin.
  assert.ok(PAPER_KEY.startsWith("orthodrill:"), `${PAPER_KEY} is not namespaced`);
});
