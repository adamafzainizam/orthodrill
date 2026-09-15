"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Notifications } from "./Notifications";
import { isoEdges } from "@/lib/geometry/isoedges";
import { isoPickList } from "@/lib/geometry/isopick";
import { occupancyFromCells } from "@/lib/geometry/cells";
import { rotatedOccupancy } from "@/lib/geometry/rotate3";
import { clientToViewBox, faceAt } from "@/lib/canvas/picking";
import { unrotateCell } from "@/lib/geometry/rotate3";
import { canRedo, canUndo } from "@/lib/canvas/history";
import { builderCells, initBuilder, reduceBuilder, type BuilderState } from "@/lib/canvas/builder";
import { noticesForBuild, type Notice } from "@/lib/canvas/messages";
import { submitBuild } from "@/lib/canvas/submit";
import type { PickFace } from "@/lib/geometry/isopick";

/**
 * The Type B builder: read three views, carve the part.
 *
 * SAFE TO RUN IN THE BROWSER, and narrowly so. It reaches `isoedges`,
 * `isopick`, `cells` and `rotate3` — all pure projection over an occupancy,
 * holding no answer key and able to derive none. It deliberately does NOT
 * touch `isometric.ts`, which imports `validateSolid` from the key-deriving
 * `geometry/views`; `isolation.test.ts` reads DIRECT imports only, so that
 * would have pulled the views generator into the browser bundle unnoticed.
 * See that file's SERVER_ONLY docblock.
 *
 * THE PAINT PROGRAM IS ORDER-DEPENDENT. Faces are opaque fills in the PAPER
 * colour, and a nearer fill painting over a farther face's strokes is the
 * entire hidden-line mechanism. Never sort, filter or dedupe `program`.
 * AGENTS.md §6.
 *
 * PICKING IS DONE IN JS, NOT BY SVG HIT-TESTING. `faceAt` is pure and tested,
 * and it reads the same back-to-front order the painter does — so what a
 * student clicks is what a student sees. Letting the DOM decide would be a
 * second, untested answer to the same question.
 */

// Hand-duplicated rather than imported, for the reason Editor.tsx gives: the
// registry module also exports key-bearing types, so importing PublicDrill
// from it would trip isolation.test.ts.
export type PublicBuildDrill = {
  id: string;
  title: string;
  prompt: string;
  mode: "build";
  base: { w: number; d: number; h: number };
};

/**
 * Must equal the ground the faces are painted on, exactly — see §6. It does,
 * by construction: this same constant is the container's background and every
 * face's fill, and both now resolve from one custom property, so the chosen
 * paper moves them together.
 */
const PAPER = "var(--paper)";
const INK = "var(--ink)";
const PAD = 1.2;

type Overlay = { missing: string[]; extra: string[] };

export function Builder({ drill }: { drill: PublicBuildDrill }) {
  const [state, setState] = useState<BuilderState>(() => initBuilder(drill.base));
  const [notices, setNotices] = useState<Notice[]>([]);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [hover, setHover] = useState<PickFace | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  const cells = builderCells(state);

  const { program, picks, view } = useMemo(() => {
    const occ = rotatedOccupancy(
      occupancyFromCells(cells, drill.base.w, drill.base.d, drill.base.h),
      state.q,
    );
    const prog = isoEdges(occ);
    const pk = isoPickList(occ);
    // Fit to the FULL block's projection, not the current build's, so the
    // drawing does not jump and rescale every time a block is removed.
    const full = rotatedOccupancy(
      occupancyFromCells(
        Array.from({ length: drill.base.w * drill.base.d * drill.base.h }, (_, i) => {
          const x = i % drill.base.w;
          const y = Math.floor(i / drill.base.w) % drill.base.d;
          const z = Math.floor(i / (drill.base.w * drill.base.d));
          return [x, y, z] as [number, number, number];
        }),
        drill.base.w, drill.base.d, drill.base.h,
      ),
      state.q,
    );
    const pts = isoPickList(full).flatMap((f) => f.points);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const minX = Math.min(...xs) - PAD, maxX = Math.max(...xs) + PAD;
    const minY = Math.min(...ys) - PAD, maxY = Math.max(...ys) + PAD;
    return { program: prog, picks: pk, view: { minX, minY, w: maxX - minX, h: maxY - minY } };
  }, [cells, state.q, drill.base]);

  // Letterboxing is the whole subtlety here, and it is not optional: the SVG
  // is capped by max-height, so its box and its viewBox have different aspect
  // ratios and the drawing is scaled uniformly and CENTRED inside empty bands.
  // `clientToViewBox` is pure and tested; do not reinline a naive
  // width-ratio version, which reads as correct and silently misses every
  // click. See picking.ts.
  const clientToModel = useCallback((clientX: number, clientY: number): [number, number] => {
    const r = svgRef.current?.getBoundingClientRect();
    if (r === undefined) return [view.minX, view.minY];
    return clientToViewBox(clientX, clientY, r, view) as [number, number];
  }, [view]);

  const act = useCallback((clientX: number, clientY: number, remove: boolean) => {
    const face = faceAt(picks, clientToModel(clientX, clientY));
    if (face === null) return;
    setOverlay(null);
    setState((s) => reduceBuilder(s, remove ? { kind: "remove", face } : { kind: "add", face }));
  }, [picks, clientToModel]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t !== null && ["INPUT", "SELECT", "TEXTAREA"].includes(t.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        setState((s) => reduceBuilder(s, { kind: e.shiftKey ? "redo" : "undo" }));
      } else if (e.key === "[") setState((s) => reduceBuilder(s, { kind: "rotate", delta: -1 }));
      else if (e.key === "]") setState((s) => reduceBuilder(s, { kind: "rotate", delta: 1 }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function onSubmit() {
    setSubmitting(true);
    const result = await submitBuild(drill.id, cells);
    setSubmitting(false);
    if ("ok" in result && result.ok === false) {
      setNotices([{ id: "fail", tone: "bad", text: `Could not submit (${result.reason}).` }]);
      return;
    }
    const r = result as Parameters<typeof noticesForBuild>[0];
    setNotices(noticesForBuild(r));
    // Diff cells arrive NORMALISED to the bounding-box origin, so they must be
    // translated back into the student's own coordinates before being drawn
    // over their model — see the wave 2 plan.
    const min = cells.reduce(
      (m, c) => [Math.min(m[0], c[0]), Math.min(m[1], c[1]), Math.min(m[2], c[2])] as [number, number, number],
      [Infinity, Infinity, Infinity] as [number, number, number],
    );
    const shift = (cs: readonly (readonly [number, number, number])[]) =>
      cs.map((c) => `${c[0] + (Number.isFinite(min[0]) ? min[0] : 0)},`
        + `${c[1] + (Number.isFinite(min[1]) ? min[1] : 0)},`
        + `${c[2] + (Number.isFinite(min[2]) ? min[2] : 0)}`);
    setOverlay({
      missing: r.diff.missing.flatMap((g) => shift(g.cells)),
      extra: r.diff.extra.flatMap((g) => shift(g.cells)),
    });
  }

  const btn = "rounded-[var(--radius-sm)] border px-3 py-1.5 t-small disabled:opacity-40";
  const btnStyle = { background: "var(--bg-raised)", borderColor: "var(--border-subtle)", color: "var(--text-primary)" };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className={btn} style={btnStyle} onClick={() => setState((s) => reduceBuilder(s, { kind: "rotate", delta: -1 }))}>↺ Turn left</button>
        <button className={btn} style={btnStyle} onClick={() => setState((s) => reduceBuilder(s, { kind: "rotate", delta: 1 }))}>Turn right ↻</button>
        <span className="t-label" style={{ color: "var(--text-tertiary)" }}>corner {state.q + 1} of 4</span>
        <span className="flex-1" />
        <button className={btn} style={btnStyle} disabled={!canUndo(state.history)} onClick={() => setState((s) => reduceBuilder(s, { kind: "undo" }))}>Undo</button>
        <button className={btn} style={btnStyle} disabled={!canRedo(state.history)} onClick={() => setState((s) => reduceBuilder(s, { kind: "redo" }))}>Redo</button>
        <button className={btn} style={btnStyle} onClick={() => { setOverlay(null); setState((s) => reduceBuilder(s, { kind: "reset" })); }}>Reset</button>
        <button className={btn} style={{ ...btnStyle, background: "var(--accent, #2c6bed)", color: "#fff" }} disabled={submitting} onClick={onSubmit}>
          {submitting ? "Checking…" : "Submit"}
        </button>
      </div>

      <p className="t-small" style={{ color: "var(--text-secondary)" }}>
        Click a face to cut that block away. Hold Alt and click to put a block back.
        Use Turn left/right to walk around the part — a feature on the far side cannot be reached from here.
      </p>

      <div className="rounded-[var(--radius-lg)] border p-4" style={{ background: PAPER, borderColor: "var(--border-subtle)" }}>
        <svg
          ref={svgRef}
          viewBox={`${view.minX} ${view.minY} ${view.w} ${view.h}`}
          className="max-w-full h-auto w-full"
          // Capped so the block does not dominate a page whose real content is
          // the three views above it. The student manipulates this; they READ
          // those.
          style={{ touchAction: "manipulation", maxHeight: "26rem" }}
          onContextMenu={(e) => { e.preventDefault(); act(e.clientX, e.clientY, false); }}
          onMouseMove={(e) => setHover(faceAt(picks, clientToModel(e.clientX, e.clientY)))}
          onMouseLeave={() => setHover(null)}
          onClick={(e) => act(e.clientX, e.clientY, !e.altKey)}
          role="img"
          aria-label={`Your part, seen from corner ${state.q + 1} of 4`}
        >
          {program.map((p, i) =>
            p.kind === "iso-face"
              ? <polygon key={i} points={p.points.map((q) => q.join(",")).join(" ")} fill={PAPER} stroke={PAPER} strokeWidth={0.02} />
              : p.kind === "iso-line"
                ? <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={INK} strokeWidth={0.06} strokeLinecap="round" />
                : null,
          )}
          {/* THE CELL LATTICE, and it is not decoration.
              isoedges.ts correctly cancels the shared edges between coplanar
              faces, so a solid block renders as ONE featureless box — which
              means a student cannot see the 60 cells they are being asked to
              carve, and a click removes an invisible sixtieth of the part.
              Found by rendering the page and reading it as a student; no test
              could have seen it.
              Drawn from `picks`, so the outlines a student sees ARE the faces
              a click can land on — they cannot drift apart. */}
          {picks.map((f, i) => (
            <polygon
              key={`g${i}`}
              points={f.points.map((q) => q.join(",")).join(" ")}
              fill="none" stroke={INK} strokeOpacity={0.18} strokeWidth={0.02}
              pointerEvents="none"
            />
          ))}
          {/* A pick face's cell is in ROTATED coordinates; the overlay's cells
              are in the student's own. Comparing them directly is correct at
              q=0 and highlights the WRONG blocks at every other viewpoint —
              the same trap the builder reducer guards against. */}
          {overlay !== null && picks
            .filter((f) => overlay.extra.includes(
              unrotateCell(f.cell, state.q, drill.base.w, drill.base.d).join(","),
            ))
            .map((f, i) => <polygon key={`x${i}`} points={f.points.map((q) => q.join(",")).join(" ")} fill="#d4380d" fillOpacity={0.38} />)}
          {hover !== null && (
            <polygon
              points={hover.points.map((q) => q.join(",")).join(" ")}
              fill="#2c6bed" fillOpacity={0.22} pointerEvents="none"
            />
          )}
        </svg>
      </div>

      {overlay !== null && overlay.missing.length > 0 && (
        <p className="t-small" style={{ color: "var(--text-secondary)" }}>
          Material is missing from your part; the sentences below say where. Missing blocks
          cannot be shaded on a part that does not contain them — put material back with
          Alt-click and submit again.
        </p>
      )}

      <Notifications notices={notices} />
    </div>
  );
}
