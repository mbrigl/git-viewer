# ADR-0013: Inspecting a commit's changes — diff over the canvas, flat and tree file list

- **Status:** 🟢 accepted
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Transferred from the earlier Git Graph Viewer implementation (commit `fd64b3a`), where
  these decisions were already in effect. Restated here in this repository's ADR format for review.
  Consolidates what was first written as two ADRs — where the diff appears, and how the changed-files
  list is represented — because both decide one workflow and neither is reversible without the other.
  The set was renumbered afterwards to run without gaps, so the absorbed ADR has no separate record —
  see *Consolidation history* in [`README.md`](README.md).

## Context

The specification makes inspecting a commit a goal: selecting a commit shows its full detail, and the
project grows "towards navigation and exploration … and inspecting what a commit changed". In
practice that is a loop, not a single view: **pick a file, read it, pick the next.** Every layout
question below follows from that loop.

Two things stood in its way.

**Where the diff appeared.** The diff was shown in a `position: fixed` panel pinned to the bottom of
the window, spanning the full width — including the right sidebar — at a fixed height of 42 %. It
split attention between two areas and, worse, covered the list of changed files, so moving to the
next file meant closing the diff first. The loop was broken at its most frequent step.

**How the file list was represented.** The changed files were a flat, alphabetically ordered list.
For commits touching many files across deep directory structures that is hard to scan: paths share
long prefixes, and the list gives no sense of *where* in the project a change is concentrated. A tree
is the obvious answer for structure — but a flat list is faster to scan for small changesets, which
are the common case, so replacing one with the other trades one weakness for another.

## Decision

We will lay the workflow out around the list staying reachable at all times.

**The diff covers only the graph canvas.** It is rendered inside the canvas container — which is
already `position: relative` — filling it with `position: absolute; inset: 0`. The right sidebar with
the "Files changed" list stays visible and interactive.

- Selecting a file opens the diff over the graph canvas.
- The sidebar list stays usable, so the next file can be picked directly.
- Closing the diff clears it and reveals the canvas again.

**The file list offers two interchangeable views,** switchable at any time from two buttons in the
section header. The mode is held in state (`'flat' | 'tree'`), with `'tree'` as the default.

- **Flat view** — a single-level list, alphabetically ordered.
- **Tree view** — a directory tree derived from the flat list of changes, rendered recursively with
  collapsible folders, where single-child folder chains are collapsed (`src/web` rather than `src` ›
  `web`) to reduce depth, each folder carries a recursive count badge of the changed files below it,
  and the tree is rebuilt when the selected commit changes.

## Alternatives considered

*On where the diff appears:*

- **Keeping the fixed bottom panel** — familiar from terminal-style tools, but it wastes width, fixes
  the height, and covers the file list, which is the one thing the loop needs.
- **A separate diff window** — full space for the diff, but window management becomes the user's
  problem and the connection to the selected commit is lost.
- **Splitting the canvas area vertically (graph above, diff below)** — keeps both visible, but at
  typical window sizes neither gets enough room, and the graph is not what the user is reading while a
  diff is open.

*On the file list:*

- **Tree only** — one code path, but worse than a flat list for the common small changeset.
- **Flat only, with the common prefix stripped** — cheap, and it removes some noise, but it still
  gives no structure and breaks down as soon as changes span several top-level directories.
- **Grouping by directory without nesting (one heading per directory)** — simpler than a tree, but in
  deep hierarchies it produces almost as many headings as files.

## Sources / Prior art

- GitKraken and Sourcetree, where the diff takes over the main content area while the file list stays
  in a side panel — <https://www.gitkraken.com/>
- GitHub's pull request "Files changed" view, which offers the same flat/tree toggle.
- VS Code's Explorer and SCM views, including the `explorer.compactFolders` setting that inspired
  collapsing single-child chains — <https://code.visualstudio.com/docs/getstarted/settings>
- MDN, *CSS positioning* and containing blocks —
  <https://developer.mozilla.org/en-US/docs/Web/CSS/position>

## Consequences

- Positive: the loop works — the file list stays reachable while a diff is open, so the next file is
  one click away; the diff gets the full height of the graph area instead of a fixed 42 %; no
  full-width fixed panel overlaps unrelated chrome; the directory structure makes large changesets
  navigable and per-folder counts show where changes are concentrated, while the flat view is
  preserved for those who prefer it.
- Negative / trade-offs: the commit graph is completely hidden while a diff is open — acceptable,
  because the sidebar still shows the selected commit's context; file-row markup and styles now exist
  in two places (the flat sidebar list and the recursive tree component) and have to be kept visually
  in sync; the recursive component adds some rendering complexity.
- Follow-ups: none.
