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

export type TopicId = "orthographic" | "constructions" | "oblique" | "reading-views";

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
    id: "constructions",
    title: "Geometric constructions",
    blurb:
      "Straightedge-and-compass work on a grid: bisectors, equal divisions, "
      + "parallels, squares, and the parabola by the rectangle method. Draw "
      + "your construction lines, and the marker grades the result.",
    hints: [
      {
        title: "Construction lines are drawn, not hidden",
        body:
          "The arcs and rays you use to find a point are part of the drawing, "
          + "not scaffolding to rub out. Draw them with the Construction line "
          + "type: the marker ignores that type entirely, so they cost you "
          + "nothing and they show your method.",
      },
      {
        title: "Only some constructions land on a grid",
        body:
          "This tool marks exact positions, so an exercise can only ask for a "
          + "construction whose answer sits on whole grid points. Bisecting a "
          + "right angle works, because 45° is a grid direction. Bisecting 45° "
          + "does not, because 22.5° is not — and a regular hexagon never "
          + "does. That is why you will not find those here.",
      },
      {
        title: "A bisector needs an even span",
        body:
          "The midpoint of a line spanning an odd number of squares falls "
          + "half-way between two grid points, where you cannot place it. "
          + "Every line you are asked to bisect here spans an even number for "
          + "that reason — count the squares before you look for the centre.",
      },
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
          + "the curve — they are not part of the final drawing. What is "
          + "graded is the curve itself, drawn as its own line through the "
          + "located points, not the scaffolding that found them.",
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
        title: "On this sheet, join the points with straight segments, not a smooth sweep",
        body:
          "On paper you would blend the located points into one smooth arc "
          + "by eye. Here, draw a straight line from each point to the next, "
          + "in order out from the vertex — that is what the marker compares "
          + "your drawing against, point for point, so a hand-smoothed curve "
          + "will not match it. This is a property of the tool, not of the "
          + "geometry: more divisions make the joined segments read as a "
          + "smoother curve on the sheet, even though every one of them is "
          + "still a straight line underneath.",
      },
    ],
  },
  {
    id: "oblique",
    title: "Oblique projection",
    blurb:
      "Redraw a part as a pictorial with its front face true shape and its "
      + "depth receding at 45°. Compare cavalier, cabinet and general oblique "
      + "on the same solid and see what each does to the shape.",
    hints: [
      {
        title: "The front face is drawn true shape",
        body:
          "That is the whole point of oblique, and what makes it quicker to "
          + "draw than isometric: the face you put at the front keeps its real "
          + "widths and heights, so a square stays a square and a circle would "
          + "stay a circle. Choose the face with the most detail to sit at the "
          + "front. Every exercise here states which face that is.",
      },
      {
        title: "The three types differ only in how much depth you draw",
        body:
          "Cavalier does not reduce the depth at all, cabinet halves it, and "
          + "general oblique takes a fraction in between — two thirds here. "
          + "Nothing else changes: same front face, same 45° axis. Cavalier "
          + "looks too deep because the eye expects foreshortening; cabinet "
          + "looks closest to right. Drawing the same part in all three is the "
          + "fastest way to see why.",
      },
      {
        title: "Depth goes one grid diagonal per unit",
        body:
          "The receding axis runs at 45°, so one unit of depth is one step "
          + "right and one step up — the diagonal of one grid square. For "
          + "cabinet, two units of depth make one diagonal; for general "
          + "oblique, three units make two. Count diagonals along the axis, "
          + "not squares across.",
      },
      {
        title: "Hidden edges are left out of a pictorial",
        body:
          "This is the opposite of the rule for orthographic views, and it is "
          + "easy to carry the wrong habit across. A pictorial shows the part "
          + "as it looks, so an edge you could not see is simply not drawn — "
          + "no dashed lines. Draw only what is visible from the front, above "
          + "and the right.",
      },
      {
        title: "Only 45° works on a grid, and that is not a limitation of the method",
        body:
          "On squared paper the receding axis has to run corner to corner "
          + "through the squares, which is 45°. Other angles are used in "
          + "practice — 30° and 60° are common on plain paper — but they do "
          + "not land on grid intersections, so every exercise here uses 45°.",
      },
    ],
  },
  {
    id: "reading-views",
    title: "Reading three views",
    blurb:
      "Given the front, top and side views of a part, build the part itself. "
      + "The opposite direction to drawing the views, and a different skill.",
    hints: [
      {
        title: "Read all three views before you cut anything",
        body:
          "A single view is a shadow: many different parts cast it. What fixes "
          + "the shape is the three together, and a feature you can only see in "
          + "one of them is the one most often missed. Look at all three, "
          + "decide what the part is, and only then start removing material.",
      },
      {
        title: "A dashed line means material you cannot see from there",
        body:
          "A hidden line marks an edge that is really in the part but is "
          + "blocked from that direction by material in front of it. It is not "
          + "decoration and it is not optional — for many parts the dashed "
          + "lines are the only thing distinguishing the real shape from a "
          + "different part with the same outline.",
      },
      {
        title: "Line up the views to place a feature",
        body:
          "The front and top views share their left-to-right positions, and "
          + "the front and side views share their heights. A feature's position "
          + "in one view therefore tells you where to look for it in another, "
          + "which is how you work out its depth without guessing.",
      },
      {
        title: "Start from the whole block and take material away",
        body:
          "The part begins as the solid block its three views enclose. Every "
          + "step after that removes material, exactly as it would be machined. "
          + "If you cut too far you can put material back, but thinking of it "
          + "as carving keeps the shape you are aiming at in view.",
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
