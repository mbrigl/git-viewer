# Specification — GitGraph

> The **specification** of this project: the problem it solves, where it is going, and the
> vocabulary everyone (humans and agents) must use. This document is the **constitution** —
> every Architecture Decision Record in [`adr/`](adr/) derives from it and must not contradict it.

## Problem

A git repository's history is a directed acyclic graph, but the tools most developers reach for
present it as a flat list. `git log --graph` draws the topology in ASCII, yet becomes unreadable as
soon as several branches are active in parallel: lines wander between columns, a branch does not
keep a stable position, and there is no way to jump from a line to the full commit detail. Graphical
clients that solve this well are largely proprietary, and their layout algorithms are not open to
inspection or reuse.

Developers who need to answer questions like *"which branch did this commit come from"*, *"what was
merged into what, and when"*, or *"what happened around this release"* therefore either squint at
ASCII art or leave their toolchain for a closed product.

## Mission

Render the commit history of a local git repository as a readable commit graph — every branch a
straight vertical line, every merge an unambiguous connection — with an open, documented layout
algorithm.

## Vision

GitGraph is a desktop application that opens any local repository and shows its history the
way a developer thinks about it: time running downwards, each branch owning a column, merges drawn
as clean orthogonal connections, refs marked directly on the commits that carry them. Loading a
large repository stays responsive because history is read in the background and only the visible
part of the graph is ever painted.

The layout logic is the durable core of the project. It is specified independently of any UI
toolkit, so it can be reasoned about, tested, and changed without touching the rendering layer.
Around that stable core, the project grows towards navigation and exploration: searching and
filtering history, highlighting a commit's ancestry, and inspecting what a commit changed.

## Strategy

- **Adopt a published, proven layout approach.** The layout follows the algorithms described in
  Pierre Vigier's article
  [*Commit Graph Drawing Algorithms*](https://pvigier.github.io/2019/05/06/commit-graph-drawing-algorithms.html)
  rather than an invented one, so behaviour is explainable and reviewable.
- **Separate layout from rendering.** Loading history, computing the layout, and painting it are
  distinct stages. The layout stage produces plain positional data (rows, columns, edges) and knows
  nothing about the UI toolkit that draws it.
- **Keep the layout testable in isolation.** Row assignment, column assignment, and edge building
  operate on plain data and are covered by tests that need no repository window and no running UI.
- **Stay responsive by construction.** Reading history never blocks the UI, progress is reported
  while loading, and rendering cost is tied to what is visible, not to the size of the repository.
- **Bound the problem.** History loading is capped at a fixed commit limit so that worst-case
  behaviour stays predictable.
- **Record structural choices as ADRs.** Every decision that constrains the above — layout
  algorithm, edge shape, data representation, rendering strategy, limits — is written down in
  [`adr/`](adr/).

## Core Concepts & Vocabulary

Define the key terms of the domain. Use these exact words consistently in code, comments,
documentation, and ADRs.

- **Commit graph** — the directed acyclic graph of all loaded nodes and their parent relationships,
  laid out on a 2D grid.
- **Node** — one entry's position in the commit graph, wrapping its data (SHA, message, author,
  committer date, parents) together with its assigned row and column. Almost every node is a commit;
  the exceptions are the **synthetic nodes** below.
- **Synthetic node** — a node that is not an ordinary commit but occupies a row and a column like
  one, and is marked so that it is never mistaken for a commit. There are two kinds:
  - **Stash node** — one per stash entry. Only the base commit the stash was created on is kept as
    its parent, so the stash's internal index and untracked-files parents stay out of the graph.
  - **Working-directory node** — a single node for uncommitted changes, present only while the
    working tree or index is dirty. It has no object id and hangs off `HEAD`.
- **Row** — the time axis. Row 0 is the newest node; higher row numbers are older. A parent always
  has a higher row number than each of its children.
- **Column** (also **lane**) — the branch axis. All commits belonging to the same branch line share
  one column, which is what makes branches render as straight vertical lines.
- **Edge** — a connection between a child commit and one of its parents. An edge has exactly one of
  two types:
  - **BRANCH edge** — the connection to a commit's *first* parent; the straight continuation of a
    branch line within one column.
  - **MERGE edge** — the connection to a commit's *additional* (non-first) parents; crosses columns.
- **Branch child** — relative to a commit `c`, a child for which `c` is the *first* parent.
- **Merge child** — relative to a commit `c`, a child for which `c` is a *non-first* parent.
- **Active branches** — the list of column slots, one entry per column, each holding the node whose
  branch line is currently "live" in that column. A slot is either occupied or free.
- **Forbidden columns J(c)** — for a merge commit `c`, the set of columns already occupied by a
  branch line that spans the row range of the incoming merge edge. Placing a merge parent in such a
  column would make edges overlap.
- **Ref chip** — a label drawn on the node a ref points at: a local branch, a remote branch, or a
  tag. A stash node carries a chip of the same kind, labelled `stash@{n}`.
- **Commit limit** — the maximum number of nodes loaded from a repository in one pass. Synthetic
  nodes count towards it.

### Temporal topological sort — assigning rows

Assign a row to every commit such that a parent always receives a higher row number than each of its
children, while keeping commits ordered by committer date (newest at the top). Complexity is
`O(n·log n + m)` for `n` commits and `m` parent relationships.

The key insight is to traverse depth-first, but to visit start commits in committer-date order —
which makes the resulting topological order date-consistent as well.

1. Iterate over all loaded commits sorted by committer date, descending. The loaded set is what the
   repository's refs reach, bounded by the commit limit, so every ref is covered without a separate
   seeding step.
2. For every not-yet-visited commit, run an iterative depth-first traversal that assigns row indices
   in post-order.
3. Children (newer commits) receive lower row numbers, parents (older commits) higher ones.

The traversal is iterative — it uses an explicit work stack rather than recursion — so that deep
histories cannot exhaust the call stack.

### Straight branches — assigning columns

Assign a column to every commit so that all commits on the same branch line occupy the same column,
which produces perfectly straight vertical branch lines.

Commits are processed top to bottom (row 0 first). For each commit `c`:

1. Determine its branch children and merge children.
2. Compute the forbidden columns J(c) from the active branches that span the row range of the
   incoming merge edges.
3. Choose the column: reuse the column of the leftmost branch child if it is not forbidden;
   otherwise take the first free, non-forbidden slot, appending a new column if none exists.
4. Release the slots of all other branch children that are no longer needed.

### Edge rendering

Edges that cross columns are drawn as **orthogonal L-shapes** — no diagonals, and no curve that
leaves the grid — so that a line's column membership is never ambiguous:

An edge runs from a commit (the **source**: the older parent, further down) to one of its children
(the **target**: newer, further up). The direction rule is deliberately asymmetric, so that forks and
merges stay distinguishable at a glance:

| Edge type | Condition                    | Shape                                   | Bend sits at  |
| --------- | ---------------------------- | --------------------------------------- | ------------- |
| Fork      | child column > parent column | horizontal segment first, then vertical | target column |
| Merge     | child column < parent column | vertical segment first, then horizontal | source column |
| Straight  | same column                  | a single vertical line, no bend         | —             |

The bend is softened by a short curve at the corner rather than drawn as a hard right angle, with a
radius of half the column width and the control point on the corner. The curve is confined to the
corner, so an edge still belongs unambiguously to a column over its whole length. The **Non-Goals**
below rule out curves that span a whole edge, not this local bend.

### Virtual rendering

Only the rows inside the current viewport are painted. The renderer derives the visible row range
from the scroll position and the row height, then iterates over those rows and their edges only.
Rendering cost is therefore `O(visible rows)` and independent of the total number of loaded commits.

1. Derive the visible row range from the scroll position and the viewport height.
2. Skip nodes outside that range entirely.
3. Draw an edge when its row span intersects the visible range, so edges that cross the viewport from
   off-screen rows are still drawn correctly.

### Pipeline

Loading, layout, and rendering form one pipeline, and each stage hands plain data to the next:

```
git history  →  commits (SHA, message, author, committer date, parents)
             →  layout   (rows via temporal topological sort, columns via straight branches, edges)
             →  rendering (virtual paint of the visible row window)
```

History is read off the UI thread; progress is reported periodically while loading so the
application stays interactive on large repositories.

## Goals / Success Criteria

1. Opening a local repository shows its commit graph, with the newest commit at the top and one
   column per branch line.
2. All commits of a branch line share a single column — a branch renders as an unbroken straight
   vertical line.
3. Merge relationships render as orthogonal L-shaped edges that do not overlap other branch lines.
4. Rows respect topology (a parent is always below its children) *and* committer date order.
5. Local branches, remote branches, and tags are visible as ref chips on the commits they point at.
6. Selecting a commit shows its full detail: SHA, message, author, date, parents, and children.
7. Repositories up to the commit limit load without freezing the UI, and loading progress is
   reported while it runs.
8. Scrolling stays smooth at the commit limit, because painting cost depends on the visible rows
   only.
9. The layout is deterministic: the same repository state always yields the same rows, columns, and
   edges. The working-directory node is the single exception — it is timestamped when the repository
   is read, so its own row reflects the moment of loading rather than repository state alone.

## Non-Goals

- **Not a git client.** The viewer reads history; it does not commit, stage, branch, merge, rebase,
  fetch, or push. Reading the working tree to show *what* is uncommitted is still reading, and is in
  scope; acting on it is not.
- **No history rewriting** of any kind.
- **No hosting-platform integration** — no pull requests, issues, or reviews from a forge.
- **No unlimited history.** Loading is deliberately capped by the commit limit rather than paged
  indefinitely.
- **No free-form curved or diagonal edges.** Edge shapes are restricted to vertical and horizontal
  segments joined at a right angle. The bend may be softened by a short curve at the corner, but
  nothing curves over the length of an edge.
- **No global edge-crossing minimisation.** The layout optimises for straight branches, not for the
  provably minimal number of crossings.
- **No remote repositories.** Only repositories already present on the local filesystem are opened.
- **No network communication by default.** Everything the application needs it reads from the local
  filesystem. The single exception is the avatar display, which fetches images from Gravatar — and
  only after the user explicitly turns it on; the default is off, and a fresh installation makes no
  network requests at all (see ADR-0016).
