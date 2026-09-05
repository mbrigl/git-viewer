# ADR-0022: Submodules, and switching the viewed repository from the sidebar

- **Status:** 🟡 proposed
- **Date:** 2026-09-05
- **Deciders:** Markus Brigl (maintainer)

## Context

[ADR-0021](0021-repository-sidebar-ref-tree.md) gave the repository sidebar four sections — local
branches, remote branches, working trees, and tags — and its Decision fixes both the section list
and the `RepoRefs` payload at exactly those four lists. The maintainer asked for submodules to be
shown "like the working trees", which is a fifth section and therefore beyond that ADR rather than
an implementation detail inside it.

The request is a natural one: a submodule is repository *state* in the same sense a worktree is —
something the repository contains and points at, invisible in a view that only draws history. Both
answer "what does this repository consist of", which is the discovery direction ADR-0021 opened.

One asymmetry decides the shape of this ADR. A worktree's `HEAD` is a commit in *this* repository's
object database, so ADR-0021's third Decision clause — selecting an entry reveals and selects the
commit it points at — applies to it directly. A submodule's recorded id is a commit in the
*submodule's* object database. It will never be a row in this graph, and never a member of the
loaded-SHA set the sidebar tests against. Under the current contract every submodule row would be
permanently inert and would explain itself with the wrong reason ("outside the loaded history"
rather than "in another repository"). The reveal contract does not extend to submodules; something
has to take its place.

On review of the first draft the maintainer decided what that is, and extended it: selecting a
submodule **opens** it, selecting a working tree **switches to** it, and both must be reversible —
there has to be a way back to the parent module. That makes "which repository is being viewed" a
thing the user moves through rather than a single choice made in the folder picker, and it changes
the worktrees section, which today reveals a commit. Hence this ADR covers repository switching as
a whole and not only the new section.

Forces from accepted decisions and the specification:

- **Non-Goal "Not a git client"** — reading `.gitmodules`, the index entry, a submodule's
  checked-out commit, and another working tree's `HEAD` is reading. `git submodule init`, `update`,
  `sync`, `deinit`, and `git worktree add/prune` are writes and stay out, however much a row showing
  "not initialized" invites offering the fix.
- **[ADR-0016](0016-local-only-no-egress-hardened-webview.md)** — no egress. An uninitialized
  submodule is shown as uninitialized; cloning it to fill the row would be a network request the
  application must not make.
- **[ADR-0009](0009-commit-limit-3000.md)** — the loaded-history test that makes an ordinary ref
  inert is not the reason a submodule cannot be revealed. The two must not be conflated in the UI.
- **[ADR-0012](0012-git2-on-spawn-blocking.md)** and
  **[ADR-0018](0018-adapter-git-as-separate-crate.md)** — the reads go through `git2` on the
  blocking stage, inside `adapter-git`.
- **[ADR-0019](0019-synthetic-stash-and-workdir-nodes.md)** and ADR-0021's rejection of worktrees as
  synthetic nodes — the precedent that repository state does not become graph rows.

`git2` 0.20 already provides `Repository::submodules`, `Submodule::{name, path, url, head_id,
workdir_id}`, and — for finding the way back — `Repository::{is_worktree, commondir, discover}`, so
no new dependency is involved, the same reasoning ADR-0021 recorded for worktrees. The Tauri layer
needs nothing new either: `open_repo(path)` already accepts any local path and runs the whole load
lifecycle, so switching repositories is a call the sidebar can already make.

## Decision

We will add a fifth read-only section, **Submodules**, and make the sidebar able to **switch which
repository is being viewed** — into a submodule, between working trees, and back up to the parent
module — through the existing `open_repo` load lifecycle.

1. **The `RepoRefs` payload gains a fifth list**, `submodules`, read in the same `load_repo_refs`
   pass and delivered by the same `load-refs` event. ADR-0021's first Decision clause — one payload,
   one load lifecycle — is extended, not amended: refs, submodules, and graph still describe one and
   the same read.
2. **Each submodule entry carries** its name and path, the working copy's absolute path, its
   configured URL, the commit id recorded in the superproject (`head_id`), the commit actually
   checked out (`workdir_id`), and a state derived from the two: *uninitialized* (no working copy on
   disk), *modified* (checked out at a different commit than the superproject records), or in sync.
3. **Selecting a submodule opens it as the repository being viewed.** Its working directory is a
   repository on disk and opening it is a read. An uninitialized submodule has no working directory,
   so its row is inert and says why — the fallback the first draft proposed for every row now
   applies only where there is genuinely nothing to open.
4. **Selecting a working tree switches to that working tree**, replacing ADR-0021's reveal-the-commit
   behaviour for that section — the only clause of ADR-0021 this ADR revises. Linked worktrees share
   the object database with the main one, so the history is the same; what changes is `HEAD`, the
   branch marked as checked out, and the working-directory node from
   [ADR-0019](0019-synthetic-stash-and-workdir-nodes.md). The working tree currently being viewed is
   marked and inert, like a branch that is already `HEAD`.
5. **The payload names the parent**, so the way back is a fact read from git rather than a trail the
   UI remembers: for a linked worktree, the main working tree found through `commondir`; for a
   submodule, the superproject found by discovering upwards from the working copy and confirming
   that one of *its* submodules resolves to this path. The confirmation is what keeps an unrelated
   repository that merely happens to sit above this one from being presented as its parent. The
   sidebar renders the parent as a row above the sections, and it is absent when there is none.
6. **The section behaves like the other four**: collapsible, counted, filtered by the shared filter
   field, present in the collapsed rail with its own glyph. Submodules are listed one level, as the
   superproject configures them; the sidebar does not recurse, since opening one shows its own.

## Alternatives considered

- **Inert, information-only submodule rows** — the smallest change and the strictest reading of
  ADR-0021's navigation contract: show name, path, and pinned commit, and let a click do nothing.
  Rejected by the maintainer on review: a whole section of dead rows is a poor answer to "show them
  like the working trees", and the submodule *is* reachable — a repository in a known local
  directory. It survives only for the uninitialized case.
- **A navigation stack in the frontend** — remember where the user came from and offer "back".
  Simpler, and it cannot be wrong, but it only helps when the user arrived by clicking: a submodule
  opened straight from the folder picker would have no way up, even though git knows its
  superproject. Deriving the parent answers the question the same way however the repository was
  reached. A stack could still be added on top later for multi-step history.
- **Reveal the pinned commit in the current graph** — impossible rather than undesirable: the id
  belongs to the submodule's object database. Attempting it produces a jump that silently misses,
  which ADR-0021 explicitly set out to avoid.
- **Load the submodule's history into the superproject's graph**, drawing its commits alongside —
  rejected: two object databases in one graph misrepresent both. The superproject's history records
  *which* commit is pinned, not the submodule's development; merging them would invent ancestry that
  does not exist.
- **Synthetic nodes for submodules**, extending ADR-0019 — rejected for the reason ADR-0021 gave for
  worktrees: a submodule is a location and a pin, not a point in this repository's history.
- **Keeping the worktree rows on reveal-the-commit and adding a separate "switch" affordance** —
  two actions per row, for a target whose commit is nearly always reachable through its branch in
  the Local section anyway. The maintainer chose switching as the row's meaning.
- **Read `.gitmodules` directly instead of going through `git2`** — the file names the configured
  submodules but not what is checked out, and it disagrees with the index for a submodule that is
  configured but not initialized. `git2` reads both sides and is already a dependency.
- **A separate command or event for submodules** — rejected for the reason ADR-0021 rejected it for
  refs: a second load path can disagree with the first, for data that is cheap and always wanted.

## Sources / Prior art

- [`git2::Repository::submodules`](https://docs.rs/git2/latest/git2/struct.Repository.html#method.submodules)
  and [`git2::Submodule`](https://docs.rs/git2/latest/git2/struct.Submodule.html) — the API the
  reader is built on; `head_id` is the id recorded in the superproject's `HEAD` tree, `workdir_id`
  the one actually checked out, and the difference between them is what "modified" means.
- [`git2::Repository::commondir`](https://docs.rs/git2/latest/git2/struct.Repository.html#method.commondir)
  — the shared git directory a linked worktree points at, and therefore the route from any worktree
  back to the main one.
- [`git rev-parse --show-superproject-working-tree`](https://git-scm.com/docs/git-rev-parse) — git's
  own answer to "which repository contains this one as a submodule", and the behaviour clause 5
  reproduces through the public `git2` API.
- [`git submodule`](https://git-scm.com/docs/git-submodule) and
  [`gitmodules`](https://git-scm.com/docs/gitmodules) — the feature's own documentation and the
  configuration format behind it.
- GitKraken's left panel, and the submodule sections in Fork and Sourcetree — all list submodules as
  their own section next to worktrees, and all treat selecting one as "open that repository" rather
  than as navigation inside the current graph.

## Consequences

- Positive: a submodule stops being invisible — the panel shows that it exists, which commit it is
  pinned to, and whether the working copy has drifted from that pin, all read from disk with no
  fetch. Moving between the parts of a repository — into a submodule, across working trees, back up —
  becomes navigation instead of a trip through the folder picker, and the parent row makes it
  reversible from wherever the user landed. The section reuses the sidebar's existing filter, counts,
  collapse, and rail machinery, and both reads are loaders in the pass ADR-0021 already established.
- Negative / trade-offs: the sidebar's click verb is no longer uniform — three sections reveal a
  commit, two switch the repository — which the rows must carry through their glyph, tooltip, and
  the fact that switching visibly reloads. Switching also discards the current selection and scroll
  position, because it is a full load. Submodule state is read from the working copy, so it is a
  snapshot like ahead/behind and goes stale the same way. The parent lookup opens one repository
  above the current one on every load; it is bounded and cheap, but it is filesystem work that a
  purely in-repository read did not do before.
- Follow-ups: a recent-repositories list, or a multi-step back stack, would extend the single parent
  hop this ADR decides — worth its own decision once the panel is in use. Opening a submodule
  *at its pinned commit*, rather than at its `HEAD`, needs a jump that survives a load and is
  deliberately not decided here. Whether the graph should mark commits that change a submodule pin
  is a separate question.
- **Specification impact (requires a human decision):** as with ADR-0021's *worktree*, the
  constitution's vocabulary has no entry for **submodule**, and it describes the application as
  showing "a repository" without saying that the view can move between related ones. Accepting this
  ADR should come with adding the term and that sentence to `docs/SPECIFICATION.md`. That edit is
  the maintainer's, not the agent's (`AGENTS.md` §3).
