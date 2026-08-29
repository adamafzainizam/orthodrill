import { MethodDiagram } from "./MethodDiagram";
import type { Primitive } from "@/lib/scoring/primitives";

/**
 * An ambient layer of technical drawings drifting across the page.
 *
 * The topic figures used to sit in a column beside the hero text, where they
 * read as an awkward pair of illustrations competing with the sentence next
 * to them. As drifting texture they do the same job — showing that this is
 * about drawing, and about more than one kind of it — without asking to be
 * looked at.
 *
 * SCATTER IS DETERMINISTIC, NOT RANDOM. `Math.random()` here would produce
 * different values on the server and on the client and break hydration. A
 * small integer hash of the figure's index gives a scatter that looks
 * arbitrary and is identical on both sides of the wire, which is what this
 * actually needs — "unpredictable to a reader", not "unpredictable to the
 * renderer".
 *
 * FIGURES ARRIVE AS PROPS, never fetched here. `drills/registry` holds the
 * solids and specs, which ARE the answer keys, so only server code under
 * `app/` may touch it — `isolation.test.ts` caught an earlier version of this
 * file importing it directly and was right to. The caller resolves the
 * figures and hands over plain primitives, exactly as `Pictorial` receives
 * its paint program.
 *
 * Pure CSS animation, so this stays a server component with no JavaScript
 * shipped for it at all. `prefers-reduced-motion` freezes the drift and keeps
 * the scatter (see globals.css): a full-width moving background is exactly
 * what that preference exists to stop, and the figures still say what they
 * need to say standing still.
 */

/** Deterministic pseudo-random in [0,1) from an integer seed. */
function scatter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

export function DriftingFigures({
  figures, count = 7,
}: {
  figures: readonly (readonly Primitive[])[];
  count?: number;
}) {
  if (figures.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
    >
      {Array.from({ length: count }, (_, i) => {
        const pick = figures[i % figures.length];
        // Three independent draws per figure, from three different seeds, so
        // vertical position, size and speed do not correlate into a pattern.
        const top = scatter(i + 1) * 92;
        const scale = 0.5 + scatter(i + 17) * 0.85;
        const seconds = 90 + scatter(i + 41) * 110;
        // A negative delay starts each figure part-way along its own path, so
        // the screen is populated on first paint rather than filling up from
        // the left edge over the first two minutes.
        const delay = -scatter(i + 71) * seconds;

        return (
          <div
            key={i}
            className="drift absolute"
            style={{
              top: `${top}%`,
              opacity: 0.055 + scatter(i + 101) * 0.05,
              transform: `scale(${scale.toFixed(3)})`,
              animationDuration: `${seconds.toFixed(1)}s`,
              animationDelay: `${delay.toFixed(1)}s`,
            }}
          >
            <MethodDiagram primitives={pick} caption="" variant="blend" />
          </div>
        );
      })}
    </div>
  );
}
