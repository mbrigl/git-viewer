# ADR-0006: Commit graph layout after Pvigier — temporal topological sort and straight branches

- **Status:** 🟢 accepted
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Transferred from the earlier Git Graph Viewer implementation (commit `fd64b3a`), where
  this decision was already in effect. Restated here in this repository's ADR format for review.
  Consolidates what was first written as two ADRs — the choice of algorithm and its row-assignment
  phase — because the second decided a sub-phase of the first while citing it as its own source, so
  the two could not be reviewed independently. The set was renumbered afterwards to run without
  gaps, so the absorbed ADR has no separate record — see *Consolidation history* in
  [`README.md`](README.md).

## Context

The core challenge of a commit graph viewer is placing commits in 2D: every commit must be assigned
a **row** (temporal order) and a **column** (branch membership) such that the result is immediately
readable — no diagonals, no spaghetti lines, and a branch that stays in one place. The specification
in [`docs/SPECIFICATION.md`](../SPECIFICATION.md) makes straight branch lines and orthogonal merge
edges a success criterion, so the layout approach decides whether the product works at all.

Both phases need a tie-breaker that is *visible to the user*. A commit graph has no unique
topological order — at every merge, several orderings are valid — and something has to decide which
commit appears where. The same is true of columns: several free columns may be available, and the
choice decides whether a branch line stays straight.

The layout runs on every repository load and is therefore on the critical path for the "loads
without freezing the UI" goal.

## Decision

We will adopt the algorithm described in Pierre Vigier's article *Commit Graph Drawing Algorithms*,
in two phases that run in order.

### Phase 1 — Temporal topological sort (rows)

Rows come from a depth-first traversal whose *start commits are visited in committer-date order*,
with rows assigned in post-order. That single trick is what makes the resulting topological order
date-consistent as well, and it is why this beats a plain topological sort. Two choices inside it are
decisions in their own right:

- **Committer date, not author date, is the sort key** — it reflects the shape of the history as it
  exists in *this* repository, rather than when a change was originally written.
- **The traversal is iterative, with an explicit work stack** — not recursion, so that deep histories
  cannot exhaust the call stack.

### Phase 2 — Straight branches (columns)

Columns are assigned top to bottom, reusing the column of the leftmost branch child wherever possible
so that a branch line keeps one column for its whole length. The decision that carries the weight
here is the **forbidden column set `J(c)`**: a column occupied by a branch line spanning the row range
of an incoming merge edge is excluded, because placing the commit there would make edges overlap.
Without it, straightness would be achieved at the cost of unreadable crossings.

### Where the steps live

The normative step-by-step form of both phases is stated once, in the *Temporal topological sort* and
*Straight branches* sections of [`docs/SPECIFICATION.md`](../SPECIFICATION.md), which is what
implementations follow — consistent with the authority chain in `AGENTS.md` §3, where the
specification is the constitution and this ADR derives from it. This ADR deliberately does not restate
those steps: an earlier copy here drifted out of step with the specification's, which is how a
seeding step came to exist in one document and not the other.

## Alternatives considered

- **A custom heuristic** — full freedom, but trial-and-error tuning, no reference to compare
  against, and no complexity guarantee.
- **Generic graph layout frameworks (Sugiyama layered layout, Graphviz `dot`)** — general-purpose
  and well studied, but they optimise for crossing minimisation over layers, not for keeping a
  branch in a single column; the result does not look like a git graph and pulls in a heavy
  dependency.
- **Pure topological sort (e.g. Kahn's algorithm) for the rows** — correct with respect to topology,
  but the order among independent commits is arbitrary and unrelated to time, so the graph does not
  read as a history.
- **Sorting by timestamp alone, without topological guarantees** — trivial, but rebases,
  cherry-picks, and clock skew produce parents above their children, which makes edges point
  upwards.
- **Sorting by author date instead of committer date** — closer to "when was this written", but
  further from the shape of the history as it exists in this repository.
- **Assigning columns by first-free-slot only, without the forbidden set** — simpler, but a merge
  parent can land in a column already spanned by another branch line, and the merge edge then
  overlaps it.

## Sources / Prior art

- Pierre Vigier, *Commit Graph Drawing Algorithms* —
  <https://pvigier.github.io/2019/05/06/commit-graph-drawing-algorithms.html>
- K. Sugiyama, S. Tagawa, M. Toda, *Methods for Visual Understanding of Hierarchical System
  Structures* (IEEE Trans. SMC, 1981) — the classic layered-layout framework, considered and
  rejected above.
- A. B. Kahn, *Topological sorting of large networks*, Communications of the ACM 5(11), 1962 — the
  classic alternative considered above.
- `git log --topo-order` / `--date-order` — git's own answer to the same tie-breaking question:
  <https://git-scm.com/docs/git-log>
- Graphviz `dot` layout engine — <https://graphviz.org/>
- GitKraken as the comparable product whose graph readability sets the bar —
  <https://www.gitkraken.com/>

## Consequences

- Positive: a proven, documented algorithm instead of trial and error; straight branch lines by
  construction; deterministic, time-consistent ordering with the newest commits at the top, matching
  what git users expect; near-linear runtime `O(n·log n + m)` for `n` commits and `m` parent
  relationships; both phases stated once, in one place, so rows and columns cannot drift apart
  across documents.
- Negative / trade-offs: the algorithm avoids node-position overlap but gives no protection against
  edge crossings; commits with manipulated or skewed timestamps can appear in positions that look
  unintuitive; the two-pass row implementation (mark reachable, then assign rows) is more code than a
  plain breadth-first pass; we depend on an externally specified, informally documented algorithm, so
  later improvements have to extend it rather than replace it.
- Follow-ups: a follow-up ADR on reducing edge crossings in the layout, should the specification's
  "no global edge-crossing minimisation" non-goal stop being acceptable in practice.
