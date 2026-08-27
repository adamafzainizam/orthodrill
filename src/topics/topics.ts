/**
 * The topic catalogue: titles, blurbs and hand-authored hints.
 *
 * PUBLIC. Safe to import from a client component — nothing here is, or
 * derives, an answer key. This module must stay free of anything key-bearing:
 * no imports from `drills/`, `server/`, `geometry/`, or `scoring/`. That is
 * what makes it safe to put in a sidebar the student actually reads.
 *
 * A hint is a teaching judgement, not a derivable fact, so unlike an answer
 * key it is hand-authored on purpose (AGENTS.md §7 is about keys, not prose).
 * A hint belongs to the TOPIC, never to one exercise — anything narrow enough
 * to give away a specific exercise's answer belongs in that exercise's prompt
 * instead.
 *
 * Lookup goes through a Map, so a topic id is a whitelist key and an
 * inherited property name (`__proto__`, `constructor`, ...) cannot masquerade
 * as a topic. Same pattern as `drills/registry.ts`'s `getDrill`.
 */

export type TopicId = "orthographic" | "parabola";

export type Hint = { title: string; body: string };

export type Topic = {
  id: TopicId;
  title: string;
  blurb: string;
  hints: Hint[];
};

const CATALOGUE: Topic[] = [
  {
    id: "orthographic",
    title: "Orthographic projection",
    blurb:
      "Given an isometric view of a part, draw its front, top and right-side "
      + "views and get specific, immediate feedback on what is wrong.",
    hints: [
      {
        title: "Hidden edges are dashed, not solid",
        body:
          "An edge you cannot see from that view — because material in front "
          + "of it blocks the line of sight — is still drawn, but as a dashed "
          + "line, never a solid one. Leaving it out is as wrong as drawing it "
          + "solid: both claim something about the part that isn't true.",
      },
      {
        title: "Every circular feature gets centre lines",
        body:
          "A hole or a boss is marked with a thin centre line through its axis "
          + "in every view — a cross in the view that shows it as a circle, and "
          + "a long-short-long line along its length in the views that show it "
          + "edge-on. This is true whether the circle is visible or hidden.",
      },
      {
        title: "First-angle and third-angle place views differently",
        body:
          "The same three views go in different positions depending on the "
          + "convention: in first-angle the top view sits below the front view; "
          + "in third-angle it sits above it. Check which convention the drill "
          + "states before you start placing views, not after.",
      },
      {
        title: "The three views must line up with each other",
        body:
          "Front and top share the same width and stay aligned on the same "
          + "vertical lines; front and side share the same height and stay "
          + "aligned on the same horizontal lines. If a feature drifts sideways "
          + "between the front and top view, one of them is wrong.",
      },
      {
        title: "A view shows an outline, not a surface",
        body:
          "Draw the silhouette and every edge where two faces meet at an "
          + "angle — not a flat face just because it faces the viewer. A flat "
          + "face with nothing crossing it contributes no interior lines at "
          + "all, even though it fills most of the view.",
      },
      {
        title: "Count the edges before you commit to the drawing",
        body:
          "Before drawing a view, count how many distinct edges the part "
          + "should show from that direction — including hidden ones. A step "
          + "or a notch adds edges in some views and none in others; if your "
          + "count doesn't match what the isometric implies, look again before "
          + "you draw.",
      },
    ],
  },
  {
    id: "parabola",
    title: "Parabola construction",
    blurb:
      "Construct a parabolic arc geometrically using the rectangle (offset) "
      + "method — no equation, just a grid of construction lines and points.",
    hints: [
      {
        title: "Divide half-width and height into the SAME number of parts",
        body:
          "Split the base into equal divisions along the axis and the same "
          + "number of divisions up the height. The method only produces a "
          + "true parabola when both counts match — four divisions across "
          + "needs four divisions up, not three or five.",
      },
      {
        title: "Construction lines are working lines, not the answer",
        body:
          "The grid of offset lines and the points they locate exist to find "
          + "the curve — they are not part of the final drawing. The graded "
          + "shape is the smooth arc through the located points, drawn as its "
          + "own line.",
      },
      {
        title: "Number the divisions consistently on both sides",
        body:
          "Label the height divisions 1, 2, 3... from the vertex outward, and "
          + "use the same numbering on the base divisions. Point 2 on the "
          + "height line only connects to point 2 on the base — mismatched "
          + "numbering is the most common way this construction goes wrong.",
      },
      {
        title: "The curve passes through every located point, in order",
        body:
          "Connect the points with a single smooth curve, working outward "
          + "from the vertex. Do not connect them with straight segments — the "
          + "construction locates points ON the parabola, and the curve "
          + "between them is still curved, not faceted.",
      },
    ],
  },
];

const BY_ID: ReadonlyMap<string, Topic> = new Map(CATALOGUE.map((t) => [t.id, t]));

export const TOPIC_IDS: readonly TopicId[] = CATALOGUE.map((t) => t.id);

/** Null rather than a throw: an unknown id is a 404, not a server fault. */
export function getTopic(id: string): Topic | null {
  return BY_ID.get(id) ?? null;
}
