# orthodrill

> **Working name** — placeholder, expected to change.

A browser drill for **orthographic projection**. You get an isometric view of a part. You draw the front, top and side views. It tells you exactly what you got wrong.

## Why

If you are learning technical drawing, you cannot practise projection alone. Producing the correct three views from a 3D part is the skill that is drilled hardest and failed most — and without an answer key or an instructor, there is no way to know whether your attempt is right.

What exists today splits cleanly and leaves the gap open:

- **Drawing tools** let you *create* drawings. They do not know what a correct answer is, so they cannot mark anything.
- **Courses** give feedback by human critique — expensive, scheduled, and unavailable the night before an assessment.

This gives immediate, specific feedback. Not "78% similar" — *"your top view is missing the hidden line for the bore."*

## What it does not do

It does not assess draughtsmanship. Input snaps to a grid, so it tests whether you understand the projection, not whether you can strike a clean line. That narrowing is deliberate: it is what makes the marking honest and specific rather than fuzzy.

## Both projection conventions

First-angle projection dominates Europe and Asia. Third-angle dominates the United States and Japan. **Neither is correct.** Whichever you were taught, the other one is what someone else means by "the standard" — so this supports both and teaches the difference rather than picking a side.

## Status

**Design approved, nothing built.** See [`AGENTS.md`](AGENTS.md) for current status and [the design spec](docs/superpowers/specs/2026-08-20-orthographic-drill-design.md) for the reasoning behind it.

## License

MIT — see `LICENSE`.
