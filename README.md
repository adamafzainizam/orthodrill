# orthodrill

> **Working name** — placeholder, expected to change.

**Practise technical drawing and get marked.** You draw on a snapping grid; it knows the answer, and tells you exactly what you got wrong.

Two topics today:

- **Orthographic projection** — given a dimensioned isometric view of a part, draw its front, top and side views. It marks the content of each view *and* whether you placed them in the right projection convention, which are different mistakes and deserve different answers.
- **Parabola construction** — build a parabolic arc by the rectangle method. Your construction lines are working lines and are ignored; the curve is what is marked.

More of technical drawing is on the way. The marking engine doesn't know or care what the lines depict, so a topic is content rather than a rewrite.

## Why

If you are learning technical drawing, you cannot practise it alone. Producing a correct drawing is the skill that is drilled hardest and failed most — and without an answer key or an instructor, there is no way to know whether your attempt is right.

What exists today splits cleanly and leaves the gap open:

- **Drawing tools** let you *create* drawings. They do not know what a correct answer is, so they cannot mark anything.
- **Courses** give feedback by human critique — expensive, scheduled, and unavailable the night before an assessment.

This gives immediate, specific feedback. Not "78% similar" — *"your top view is missing the hidden line for the bore,"* or *"every view is correct, but they are placed as third-angle projection and this drill asks for first."*

## What it does not do

It does not assess draughtsmanship. Input snaps to a grid, so it tests whether you understand the drawing, not whether you can strike a clean line. That narrowing is deliberate: it is what makes the marking honest and specific rather than fuzzy.

It also sets a real limit on which topics are possible. Because everything snaps to whole grid points, a topic whose correct answer lands on irrational coordinates cannot be drawn here at all — measured, not assumed: tangent points from an external point to a circle landed on the lattice in **0 of 162** configurations tried. Tangents and ellipses therefore wait on a tolerance-based scoring mode rather than on someone finding the time to author them.

## Both projection conventions

First-angle projection dominates Europe and Asia. Third-angle dominates the United States and Japan. **Neither is correct.** Whichever you were taught, the other one is what someone else means by "the standard" — so this supports both and teaches the difference rather than picking a side.

## Status

**Design approved, nothing built.** See [`AGENTS.md`](AGENTS.md) for current status and [the design spec](docs/superpowers/specs/2026-08-20-orthographic-drill-design.md) for the reasoning behind it.

## License

MIT — see `LICENSE`.
