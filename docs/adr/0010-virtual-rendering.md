# ADR-0010: Virtual rendering — paint only the visible rows

- **Status:** 🟡 proposed
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Transferred from the earlier Git Graph Viewer implementation (commit `fd64b3a`), where
  this decision was already in effect. Restated here in this repository's ADR format for review.

## Context

At the commit limit of 3 000 rows ([ADR-0009](0009-commit-limit-3000.md)) and a row height of 26 px,
the full graph is roughly 78 000 px tall, while the viewport shows a few dozen rows. Painting
every commit and every edge on each frame would cost `O(n)` per frame and cannot hold 60 fps on a
dense graph — even though almost all of that work is invisible.

The specification makes smooth scrolling at the commit limit a success criterion and ties rendering
cost to the visible rows rather than to the repository size.

## Decision

We will tie rendering cost to the **viewport**, not to the size of the history: only the rows
currently visible are painted, so the per-frame cost is `O(visible rows)` however much history is
loaded.

The consequence that is easy to get wrong, and therefore part of the decision: an edge must be drawn
whenever its row span *intersects* the visible range — not only when one of its endpoints is visible.
An edge running from inside the viewport to an off-screen row would otherwise disappear.

The normative form is stated once, in the *Virtual rendering* section of
[`docs/SPECIFICATION.md`](../SPECIFICATION.md); this ADR does not restate it.

## Alternatives considered

- **Painting the whole graph every frame** — simplest, but cost grows with history and the frame
  budget is spent on invisible pixels.
- **Rendering the whole graph once into an offscreen buffer and blitting the visible part** —
  constant cost per frame, but a 78 000 px tall buffer is expensive in memory and has to be
  regenerated on every zoom, theme, or selection change.
- **Tiling the canvas and caching tiles** — a middle ground, but adds cache invalidation for a
  problem that the simple visible-range computation already solves.

## Sources / Prior art

- List virtualisation ("windowing") as the standard technique for long scrollable content, e.g.
  `react-window` — <https://github.com/bvaughn/react-window>
- MDN, *Optimizing canvas* — <https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas>

## Consequences

- Positive: rendering cost is `O(visible rows)` and independent of history size; scrolling stays
  smooth at the commit limit; the same principle keeps future overlays cheap.
- Negative / trade-offs: edges that run from inside the viewport into off-screen rows have to be
  clipped correctly — the `min_row`/`max_row` intersection logic is easy to get subtly wrong; there
  is no code path that renders the complete graph, which a future export or screenshot feature would
  need.
- Follow-ups: an export/screenshot feature would need a follow-up ADR on off-screen rendering of the
  full graph.
