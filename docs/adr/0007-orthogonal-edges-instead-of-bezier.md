# ADR-0007: Orthogonal L-shaped edges with short rounded corners

- **Status:** 🟢 accepted
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Transferred from the earlier Git Graph Viewer implementation (commit `fd64b3a`), where
  this decision was already in effect. Restated here in this repository's ADR format for review.
  Consolidates what was first written as two ADRs — the edge shape and the corner style — because
  the second existed only to relax this one's "no arcs" wording, so neither could be accepted
  without the other. The set was renumbered afterwards to run without gaps, so the absorbed ADR has
  no separate record — see *Consolidation history* in [`README.md`](README.md).

## Context

Merge edges connect commits that sit in different columns, so the renderer needs a shape for
cross-column connections. The specification requires that a merge relationship be unambiguous and
that a line's column membership always be readable — in dense areas that is exactly where shapes
start to compete with each other. An earlier bezier-based rendering was replaced after user
feedback that curves were hard to follow.

Two forces pull against each other. Readability wants edges to stay on the grid, which argues for
hard right angles. Appearance wants the bend softened: a hard 90° corner looks harsh next to
comparable products, where the turn is drawn as a small quarter-circle. Whatever the corner looks
like, it must not weaken the property that makes forks and merges tellable apart — and that property
is the *order* of the two segments, not the sharpness of the joint between them.

## Decision

We will render every edge as an **orthogonal L-shape** — two straight segments meeting at a right
angle, no diagonals, and no curve that leaves the grid — and soften the joint with a **short
quadratic curve at the bend**, radius `COL_WIDTH / 2`, control point on the corner.

Three things are being decided here:

1. **Orthogonal, not curved over the length of an edge** — two straight segments, never a diagonal.
2. **An asymmetric direction rule** — which segment comes first depends on whether the child sits to
   the right or the left of its parent. This asymmetry is the whole point: it is what makes a fork
   and a merge tellable apart without reading the commits.
3. **A softened corner** — a short curve at the bend, radius half the column width, control point on
   the corner, so the curve never leaves the grid.

The normative form — which condition produces which shape, and where the bend sits — is stated once,
in the *Edge rendering* section of [`docs/SPECIFICATION.md`](../SPECIFICATION.md). This ADR
deliberately does not restate it: an earlier copy here drifted out of step with the specification's
and produced a rule that contradicted itself.

## Alternatives considered

- **Diagonal straight lines** — simplest to draw, but a diagonal belongs to no column, so in dense
  graphs it is impossible to tell which branch a line belongs to.
- **Bezier curves over the whole edge** — visually the most polished, and what the earlier
  implementation used, but adjacent curves obscure each other in dense areas and the curve leaves
  the grid. That is the problem this ADR exists to solve; reintroducing it reopens it.
- **Hard 90° corners, no curve at all** — nothing to implement and maximally grid-true, but visibly
  harsher than comparable graph viewers.
- **A larger corner radius** — softer still, but as the radius approaches the column width the edge
  stops reading as belonging to a column.
- **Fully routed orthogonal edges (channel routing)** — avoids overlap properly, but requires a
  routing pass with its own cost and complexity; out of proportion at this stage.

## Sources / Prior art

- Pierre Vigier, *Commit Graph Drawing Algorithms* —
  <https://pvigier.github.io/2019/05/06/commit-graph-drawing-algorithms.html>
- Orthogonal graph drawing as a standard style: G. Di Battista, P. Eades, R. Tamassia, I. G. Tollis,
  *Graph Drawing: Algorithms for the Visualization of Graphs* (Prentice Hall, 1998).
- MDN, `CanvasRenderingContext2D.quadraticCurveTo()` —
  <https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/quadraticCurveTo>
- GitKraken's commit graph, where orthogonal edges are drawn with a small corner radius, and
  `git log --graph` as comparable renderings of the same data — <https://www.gitkraken.com/>

## Consequences

- Positive: edges always follow the grid and are easy to trace; no overlapping curves in dense
  areas; the shape is trivial to implement and debug; bends are soft without leaving the grid; and
  the fork/merge direction rule is stated once, in one place, so it cannot drift between documents.
- Negative / trade-offs: less polished than full bezier curves; several merge edges in the same
  region can still overlap, because nothing routes them apart; slightly more drawing work per edge
  (one `quadraticCurveTo`); the corner radius is a magic constant tied to the column width and has
  to be revisited if lane widths become dynamic.
- Follow-ups: a follow-up ADR on edge-layer avoidance if overlapping merge edges become a practical
  problem.
