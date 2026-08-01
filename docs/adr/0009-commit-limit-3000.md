# ADR-0009: Commit limit of 3 000 per repository load

- **Status:** 🟢 accepted
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Transferred from the earlier Git Graph Viewer implementation (commit `fd64b3a`), where
  this decision was already in effect. Restated here in this repository's ADR format for review.

## Context

Repositories can contain hundreds of thousands of commits. Loading walks every ref and reads commit
metadata; the layout then assigns a row and a column to each commit at `O(n·log n + m)`. Without an
upper bound, both the load time and the layout time grow with the repository, and the worst case is
set by whatever repository the user happens to open.

The specification states the bound as a deliberate strategy ("bound the problem") and phrases its
performance criteria in terms of that limit rather than in absolute repository size.

## Decision

We will load at most **3 000 commits** per repository, expressed as a single named constant
(`MAX_COMMITS`). The revwalk is started with topological + time sorting and stopped once the limit
is reached, so the most recent history has priority. The constant can be changed without touching
anything else.

## Alternatives considered

- **No limit** — complete history, but unbounded load time and layout cost; a large repository would
  freeze the application for minutes.
- **Paging / lazy loading of older history** — the better long-term answer, but it makes rows,
  columns, and edges incremental, which touches the whole layout; disproportionate before the basic
  viewer exists.
- **A time-based window (e.g. "last 12 months")** — bounds nothing: an active repository can produce
  far more commits in a year than a dormant one in a decade.
- **A user-configurable limit in the UI** — worth having later, but it is a setting on top of this
  decision, not a replacement for it.

## Sources / Prior art

- `git log --max-count` — git's own bounded-history primitive:
  <https://git-scm.com/docs/git-log>
- Graph viewers such as GitKraken and `gitk` load history incrementally in windows rather than all
  at once — <https://www.gitkraken.com/>

## Consequences

- Positive: load and layout time are predictable regardless of repository size; the interaction stays
  responsive; performance criteria become testable against a fixed worst case.
- Negative / trade-offs: older history is simply not shown — there is no paging; in large
  repositories a branch's history can appear truncated; 3 000 is a compromise value, too low for
  deep histories and possibly too high on slow machines.
- Follow-ups: a follow-up ADR on paging or lazy loading of older history, which would supersede the
  fixed limit.
