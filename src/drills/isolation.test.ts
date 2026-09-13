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
 *
 * `geometry/isoedges` LEFT this list on 2026-09-13, for the Type B builder,
 * which must draw the student's in-progress solid in the browser. It is pure
 * projection over an `Occupancy` and imports only `occupancy`, `isoproject`
 * and `isotypes` — it holds no key and can derive none.
 *
 * THE RELAXATION IS DELIBERATELY NARROWER THAN THE SPEC ASKED FOR. The parent
 * spec's §7.1 also named `isometric.ts`, and that would have been a real leak:
 * `isometric.ts` imports `validateSolid` from `geometry/views`, the
 * key-DERIVING module, and because this checker reads DIRECT imports only it
 * would never have noticed `views.ts` being pulled into the browser bundle.
 * The builder does not need it — it renders a CELL SET through `isoEdges`, not
 * a `Solid` through `isometricView` — so `isometric.ts` stays reachable from
 * server code alone. Do not add it here to make an import error go away.
 */
const SERVER_ONLY = /from\s+["'][^"']*(drills\/registry|server\/|geometry\/solid|geometry\/views|geometry\/parabola|geometry\/constructions|geometry\/oblique|scoring\/score|scoring\/solid|scoring\/assign)/;

/**
 * Directories permitted to reach for them. Never a client component.
 *
 * Widened from `app/api/` to all of `app/`: a server component (e.g. a page
 * that awaits `params` and renders server-side) is exactly as safe as a route
 * handler — neither ships its imports to the browser. The `"use client"`
 * check above is what actually guards the boundary; this regex only decides
 * whether SERVER code is in a directory allowed to hold it.
 */
const ALLOWED = /^(app[\\/]|lib[\\/]|drills[\\/]|server[\\/])/;

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

test("the checker catches a server-side leak outside any allowed directory", () => {
  // ALLOWED now covers all of app/ (a server component is as safe as a route
  // handler — see the widened regex above), so this can no longer use an
  // app/ path as its offending example. components/ is not, and was never,
  // in ALLOWED, so a non-client file there is still a genuine leak.
  const offending = `import { answerKey } from "../drills/registry.ts";\n`;
  assert.notEqual(
    violation("components/Header.tsx", offending),
    null,
    "a non-client file outside every allowed directory must not pass",
  );
});

test("POSITIVE CONTROL for the 2026-09-13 relaxation: geometry/views is STILL banned", () => {
  // isoedges left the ban list so the builder can draw client-side. This is the
  // check that the relaxation took only what it was supposed to: a client file
  // reaching `geometry/views` — and therefore `generateViews`, which turns a
  // solid into the orthographic answer — must still be refused. A relaxation
  // without a control beside it is how a guard quietly stops guarding.
  const offending = `"use client";\nimport { generateViews } from "../lib/geometry/views.ts";\n`;
  assert.notEqual(
    violation("components/Builder.tsx", offending),
    null,
    "a client component may now reach the key-deriving views generator",
  );
});

test("the relaxation really did happen: a client component MAY import isoedges", () => {
  // The other half of the control. If this fails, the ban list was never
  // narrowed and the builder cannot render — a green suite that silently
  // blocks the feature is as bad as one that silently permits a leak.
  const legitimate = `"use client";\nimport { isoEdges } from "../lib/geometry/isoedges.ts";\n`;
  assert.equal(violation("components/Builder.tsx", legitimate), null);
});

test("a route handler importing the registry is allowed", () => {
  const legitimate = `import { getDrill } from "../../../drills/registry.ts";\n`;
  assert.equal(violation("app/api/score/route.ts", legitimate), null);
});

test("a client-marked page under app/ is still caught", () => {
  const offending = `"use client";\nimport { getDrill } from "@/drills/registry";\n`;
  assert.notEqual(violation("app/drills/[id]/page.tsx", offending), null);
});

test("the checker catches a client component importing the parabola generator directly", () => {
  // parabolaKey(spec) derives a figure's answer key with one call, exactly as
  // generateViews(solid) does for a views exercise — this is the Task 4
  // addition to SERVER_ONLY, and it needs its own positive control rather
  // than riding along on the generic one above.
  const offending = `"use client";\nimport { parabolaKey } from "../lib/geometry/parabola.ts";\n`;
  assert.notEqual(
    violation("components/Sidebar.tsx", offending),
    null,
    "a client component importing the parabola generator must be caught",
  );
});

test("the checker catches a client component importing the construction generator directly", () => {
  // constructionKey(spec) derives a figure's answer key with one call, the
  // same shape as parabolaKey and generateViews above — SERVER_ONLY named
  // parabola but not this one, which shipped the same week (AGENTS.md §6).
  const offending = `"use client";\nimport { constructionKey } from "../lib/geometry/constructions.ts";\n`;
  assert.notEqual(
    violation("components/Sidebar.tsx", offending),
    null,
    "a client component importing the construction generator must be caught",
  );
});

test("the checker catches a client component importing the oblique generator directly", () => {
  const offending = `"use client";\nimport { obliqueKey } from "../lib/geometry/oblique.ts";\n`;
  assert.notEqual(
    violation("components/Sidebar.tsx", offending),
    null,
    "a client component importing the oblique generator must be caught",
  );
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
