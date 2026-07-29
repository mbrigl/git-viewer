# ADR-0019: Stashes and uncommitted changes as synthetic nodes in the graph

- **Status:** 🟡 proposed
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Records a decision already embodied in the code — `CommitKind::{Stash, Working}`,
  `WORKDIR_SHA`, `load_stashes()`, `working_dir_node()` and their glyphs in `GraphCanvas.svelte` — but
  never written down. It also introduces a term the specification's vocabulary does not yet have, so
  acceptance carries a specification change (see Consequences).

## Context

The specification defines a **node** as "one commit's position in the commit graph, wrapping the
commit's data (SHA, message, author, committer date, parents)". Everything drawn is a commit.

Two things a developer looks for in a history view are not commits in that sense:

- **Stash entries.** They *are* commits objectwise, but they hang off `refs/stash` with a reflog, and
  each has internal index and untracked-files parents that are implementation detail. Walking them
  like ordinary refs drags that machinery into the graph.
- **Uncommitted work.** The most relevant "row" for someone reading their own repository is often the
  state that is not committed yet. It has no object id at all.

Leaving both out is defensible and was the earlier behaviour. But then a dirty worktree is invisible
in the very view meant to answer "where am I", and stashed work simply does not exist. The
specification's Non-Goals also have to be respected: "**Not a git client.** The viewer reads history;
it does not commit, stage, branch, merge, rebase, fetch, or push." Showing uncommitted changes is
reading, not writing — but it does widen what "history" means, so it needs to be a decision on the
record rather than an unremarked addition.

## Decision

We will surface both as **synthetic nodes**: entries that occupy a row and a column in the commit
graph and carry a marker distinguishing them from commits.

- A `kind` field on every serialized node takes one of `commit`, `stash`, `working`, and is part of
  the frontend contract.
- **Stash nodes.** Collected through the stash reflog, one node per entry, labelled `stash@{n}`.
  `refs/stash` is skipped during the ordinary ref walk, and **only the first parent** — the base
  commit the stash was made on — is kept, so the internal index and untracked parents never enter the
  graph.
- **The working-directory node.** A single node, present only when `HEAD` resolves and the worktree
  or index is dirty (ignored files excluded). It has no real object id; the reserved sentinel
  `WORKING_DIRECTORY` stands in, its parent is `HEAD`, and its timestamp is "now" so the temporal sort
  of [ADR-0006](0006-pvigier-layout-algorithm.md) places it at row 0. The UI shows "Uncommitted
  changes" in place of a SHA.
- **Selecting them yields a diff like any other node**: for the working-directory node, `HEAD`
  against the worktree with the index included and untracked files listed; for a stash node, the
  ordinary first-parent diff.
- **They are visually distinct, not disguised as commits**: a diamond for a stash, a dashed outline
  for the working-directory node, against a filled circle for a commit.
- **The commit limit applies to the whole graph.** Synthetic nodes count towards the `MAX_COMMITS`
  bound of [ADR-0009](0009-commit-limit-3000.md); they are not appended past it.

## Alternatives considered

- **Show neither — commits only** — the strictest reading of the specification's node definition, and
  the simplest data model. Rejected because it hides the two states a developer most often wants to
  locate, and because the viewer already reads the worktree for diffs anyway.
- **Show stashes but not uncommitted changes** — avoids the node without an object id, which is the
  one genuinely irregular case. Rejected: the dirty worktree is the more useful of the two, and the
  sentinel confines the irregularity to a single well-named constant.
- **Show them outside the graph — a separate list or a status line** — keeps the graph purely
  commit-shaped, honouring the vocabulary exactly. Rejected because it loses what makes the graph
  useful here: the *topological* relation, that uncommitted work sits on top of `HEAD` and a stash
  hangs off its base commit. A list cannot show that.
- **Walk `refs/stash` as an ordinary ref** — no special-casing at all. Rejected outright: it pulls the
  index and untracked-files commits into the graph as visible nodes, which is noise no user asked for.
- **Give the working-directory node a synthetic timestamp far in the future instead of "now"** — would
  pin it to row 0 unconditionally. Rejected as a lie in the data that every date-based comparison then
  has to work around; "now" achieves the same placement honestly.

## Sources / Prior art

- `git stash` and the structure of stash commits (index and untracked parents) —
  <https://git-scm.com/docs/git-stash>
- `git status` semantics for what counts as dirty — <https://git-scm.com/docs/git-status>
- GitKraken and `gitk`, which both surface a "working directory" / "local uncommitted changes" row at
  the top of the graph — <https://www.gitkraken.com/>
- libgit2's `stash_foreach` and `diff_tree_to_workdir_with_index` — <https://libgit2.org/>

## Consequences

- Positive: the two states a developer looks for are visible where they look for them, in topological
  relation to the commits they belong to; the diff path is uniform, so selecting any node behaves the
  same way; the marker keeps them honest rather than dressing them up as commits; stash internals stay
  out of the graph.
- Negative / trade-offs: the node type is no longer "a commit", so every consumer must handle `kind`,
  and code that assumes a valid object id has to special-case the sentinel — the frontend already
  suppresses the short SHA for it; the working-directory node's timestamp is wall-clock, so it is the
  one part of the graph that is not a pure function of repository state, which weakens the
  determinism of specification Goal 9 for that single row; and a repository can gain or lose that row
  without any commit changing.
- Follow-ups: this decision **carried a specification change**, which the maintainer directed be made
  ahead of acceptance rather than together with it: `Core Concepts & Vocabulary` now defines
  *synthetic node* with its two kinds, the node, row, ref-chip and commit-limit definitions admit
  them, the "Not a git client" non-goal states that reading the working tree is in scope, and Goal 9
  records the working-directory row as its single exception. **If this ADR is rejected, those
  specification edits have to be reverted together with the code** — they describe shipped behaviour,
  not an accepted decision. The `MAX_COMMITS` ordering defect noted above was fixed separately, so the
  cap now bounds the whole graph as decided here.
