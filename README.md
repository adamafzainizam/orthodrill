# orthodrill

> **Working name** — placeholder, expected to change.

**Practise technical drawing and get marked.** You draw on a snapping grid; it knows the answer, and tells you exactly what you got wrong.

Three topics today, 17 exercises:

- **Orthographic projection** (8) — given a dimensioned isometric view of a part, draw its front, top and side views. It marks the content of each view *and* whether you placed them in the right projection convention, which are different mistakes and deserve different answers.
- **Parabola construction** (3) — build a parabolic arc by the rectangle method. Your construction lines are working lines and are ignored; the curve is what is marked.
- **Oblique projection** (6) — redraw a part as a pictorial with its front face true shape and its depth receding at 45°. Cavalier, cabinet and general oblique on the same solid, so the difference between them is something you see rather than something you are told. Some exercises give you a pictorial to redraw; others give you the three orthographic views and ask you to read them first.

More of technical drawing is on the way. The marking engine doesn't know or care what the lines depict, so a topic is content rather than a rewrite.

## Why

If you are learning technical drawing, you cannot practise it alone. Producing a correct drawing is the skill that is drilled hardest and failed most — and without an answer key or an instructor, there is no way to know whether your attempt is right.

What exists today splits cleanly and leaves the gap open:

- **Drawing tools** let you *create* drawings. They do not know what a correct answer is, so they cannot mark anything.
- **Courses** give feedback by human critique — expensive, scheduled, and unavailable the night before an assessment.

This gives immediate, specific feedback. Not "78% similar" — *"your top view is missing the hidden line for the bore,"* or *"every view is correct, but they are placed as third-angle projection and this drill asks for first."*

## What it does not do

It does not assess draughtsmanship. Input snaps to a grid, so it tests whether you understand the drawing, not whether you can strike a clean line. That narrowing is deliberate: it is what makes the marking honest and specific rather than fuzzy.

It also sets a real limit on which topics are possible, and the limit is measured rather than guessed. Because everything snaps to whole grid points, a construction whose correct answer lands on irrational coordinates cannot be drawn here at all:

| | On the lattice |
|---|---|
| Parabola by the rectangle method | all points, exactly |
| Oblique, all three types | 27104 of 27104 corners |
| Tangent from an external point to a circle | **0 of 162** configurations |
| A line at exactly 60° (isometric) | none — the nearest is 60.2551° |
| Rotating a drawing by anything but 90° | **4 of 360** whole degrees |

So tangents, ellipses and isometric *drawing* wait on a tolerance-based scoring mode, rather than on someone finding the time to author them. And the rotate tool offers four stops rather than eight, because the other four cannot exist on a grid — rotating a shape 45° and rounding back turns a 4-unit edge into 2.83 and a right angle into 78.7°, which is a drawing tool quietly damaging your work.

## Both projection conventions

First-angle projection dominates Europe and Asia. Third-angle dominates the United States and Japan. **Neither is correct.** Whichever you were taught, the other one is what someone else means by "the standard" — so this supports both and teaches the difference rather than picking a side.

## Status

**Working, run locally, not deployed.** Three topics mark real attempts end to end; 454 tests. The one thing not yet done is the test that matters most: a student who has never seen the app completing a drill cold and agreeing the feedback is right.

Run it with `npm install && npm run dev`.

See [`AGENTS.md`](AGENTS.md) for current status and what is next, [`docs/decision-log.md`](docs/decision-log.md) for why things are the way they are, and [the design specs](docs/superpowers/specs/) for the reasoning in the order it was written.

## License

MIT — see `LICENSE`.
