/**
 * Structural enforcement of AGENTS.md §5.1: answer keys never reach the client.
 *
 * The rule is easy to state and easy to break by accident — one import in a
 * component and the solids are in the browser bundle, where any student can run
 * the generator against them. A comment cannot prevent that; this test can.
 *
 * POSITIVE CONTROL: `catches a violation` builds a deliberately offending file
 * in memory and asserts the checker rejects it. Without that, this file would
 * be a suite that passes because it inspects nothing — the failure mode
 * AGENTS.md §6 records for property tests.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

const SRC = fileURLToPath(new URL("../", import.meta.url));

/**
 * Modules that hold, or can derive, an answer key. `server/` is in the list
 * deliberately: the checker reads direct imports only, so treating the whole
 * server directory as key-bearing is what closes the transitive hole — a client
 * file importing `server/score.ts` is caught without the checker having to
 * resolve the import graph.
 */
const SERVER_ONLY = /from\s+["'][^"']*(drills\/registry|server\/|geometry\/solid|geometry\/views|geometry\/isoedges|scoring\/score|scoring\/assign)/;

/** Directories permitted to reach for them. Never a client component. */
const ALLOWED = /^(app[\\/]api[\\/]|lib[\\/]|drills[\\/]|server[\\/])/;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(entry) && !entry.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

/** Returns the reason a file violates the split, or null if it is clean. */
function violation(relPath: string, source: string): string | null {
  const isClient = /^\s*["']use client["']/m.test(source);
  const reaches = SERVER_ONLY.test(source);
  if (!reaches) return null;
  if (isClient) return `${relPath} is a client component and imports a key-bearing module`;
  if (!ALLOWED.test(relPath)) return `${relPath} imports a key-bearing module but is not server code`;
  return null;
}

test("no client component can reach a module that holds or derives an answer key", () => {
  const found: string[] = [];
  for (const file of sourceFiles(SRC)) {
    const rel = relative(SRC, file);
    const v = violation(rel, readFileSync(file, "utf8"));
    if (v !== null) found.push(v);
  }
  assert.deepEqual(found, [], `§5.1 violated:\n${found.join("\n")}`);
});

test("the checker catches a violation — positive control", () => {
  const offending = `"use client";\nimport { getDrill } from "../drills/registry.ts";\n`;
  assert.notEqual(
    violation("components/Canvas.tsx", offending),
    null,
    "the checker passed a client component importing the registry, so it guards nothing",
  );
});

test("the checker catches a server-side leak outside a route handler", () => {
  const offending = `import { answerKey } from "../drills/registry.ts";\n`;
  assert.notEqual(
    violation("app/page.tsx", offending),
    null,
    "a page component importing the registry must not pass",
  );
});

test("a route handler importing the registry is allowed", () => {
  const legitimate = `import { getDrill } from "../../../drills/registry.ts";\n`;
  assert.equal(violation("app/api/score/route.ts", legitimate), null);
});

test("the checker catches a client component reaching server code transitively", () => {
  const offending = `"use client";\nimport { handleScoreRequest } from "../server/score.ts";\n`;
  assert.notEqual(
    violation("components/Canvas.tsx", offending),
    null,
    "importing server/ from the client must be caught, since server/ imports the registry",
  );
});

test("a file that imports nothing key-bearing is allowed anywhere", () => {
  assert.equal(violation("components/Grid.tsx", `"use client";\nimport React from "react";\n`), null);
});
