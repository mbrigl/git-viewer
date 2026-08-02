# ADR-0021: Repository sidebar — a navigable tree of branches, remotes, worktrees, and tags

- **Status:** 🟡 proposed
- **Date:** 2026-08-01
- **Deciders:** Markus Brigl (maintainer)

## Context

[`docs/SPECIFICATION.md`](../SPECIFICATION.md) covers refs in exactly one direction. Goal 5 —
"local branches, remote branches, and tags are visible as ref chips on the commits they point at" —
answers *"which refs does this commit carry"*. It does not answer the inverse, *"which refs exist,
and where is one of them"*: a branch whose tip lies a thousand rows down is invisible until the user
scrolls onto it, and a branch that exists but is not near any commit currently on screen cannot be
found at all except by name search. The Vision names exactly this gap as the growth direction —
"around that stable core, the project grows towards navigation and exploration".

The maintainer asked for a left-hand view listing local branches, remote branches with their
commits, worktrees, and tags — the panel every comparable client offers.

Forces from accepted decisions:

- **Non-Goal "Not a git client"** — the panel may read and navigate, never act. No checkout, fetch,
  prune, create, or delete, however much the comparable clients invite it.
- **Non-Goal "No hosting-platform integration"** — rules out the pull-request, issue, team, and
  cloud-patch sections those clients place in the same panel. Only the four sections asked for are
  in scope, and the rest are not deferred but excluded.
- **[ADR-0016](0016-local-only-no-egress-hardened-webview.md)** — no egress. Every number in the
  panel, ahead/behind included, is computed from refs already on disk; nothing fetches.
- **[ADR-0012](0012-git2-on-spawn-blocking.md)** and
  **[ADR-0018](0018-adapter-git-as-separate-crate.md)** — git reads go through `git2` on a blocking
  thread, and the reading lives in `adapter-git`, not in the Tauri layer.
- **[ADR-0009](0009-commit-limit-3000.md)** — the commit limit means a ref can point at a commit
  that was never loaded. The panel must handle that rather than jumping nowhere.
- **[ADR-0019](0019-synthetic-stash-and-workdir-nodes.md)** — stashes and uncommitted changes were
  given synthetic *nodes*; this ADR deliberately does not extend that pattern (see Alternatives).

`git2` 0.20 already provides everything required — `Repository::worktrees`, `find_worktree`,
`branches`, `tag_names`, `remotes`, and `graph_ahead_behind` — so no new dependency is involved.

## Decision

We will add a read-only **repository sidebar** to the left of the commit graph, listing local
branches, remote branches grouped by remote, linked worktrees, and tags; selecting an entry reveals
and selects the commit it points at.

1. **One payload, one load lifecycle.** `adapter-git` gains `load_repo_refs(&Path) -> RepoRefs`,
   read on the same blocking thread stage as the history and emitted as its own `load-refs` event
   next to `load-graph`. Refs and graph therefore always describe the same read of the repository,
   and refreshing one refreshes the other.
2. **The `RepoRefs` payload** carries four lists, serialized camelCase like every other payload:
   - `locals` — name, target SHA, whether it is `HEAD`, its configured upstream, and `ahead`/
     `behind` counts against that upstream when one exists;
   - `remotes` — one entry per configured remote, each holding its remote-tracking branches;
   - `worktrees` — the linked worktrees reported by `Repository::worktrees`, each with its name,
     path, and checked-out branch and commit;
   - `tags` — name and target SHA, peeled so an annotated tag resolves to its commit.
3. **Navigation only.** Selecting an entry calls the existing reveal-and-select path used by the
   search results and the detail sidebar's parent/child links. An entry whose target lies outside
   the loaded set is rendered inert and says so, rather than silently doing nothing.
4. **Sections are collapsible and carry a count**, mirroring how the panel is used: a repository
   with 300 remote branches must not push the tags out of view.

## Alternatives considered

- **Extend the graph payload with the ref tree instead of a second event** — one message less, but
  it welds two concerns together: the sidebar would only ever refresh by rebuilding the whole
  layout, and the graph payload would carry data the renderer never reads.
- **A command the frontend invokes after the graph arrives** — more flexible in theory, but it
  creates a second load path that can disagree with the first, for data that is cheap and always
  wanted. The event keeps "the repository was read" a single event in time.
- **No sidebar; rely on the existing search** — search already matches ref names, but it answers a
  lookup ("where is `release/2.1`"), not a discovery question ("what branches are there"). The two
  are complementary, and only search exists today.
- **Surface worktrees as synthetic nodes in the graph**, extending
  [ADR-0019](0019-synthetic-stash-and-workdir-nodes.md) — rejected: a stash and the working
  directory *are* points in history and earn a row; a worktree is a checkout location, repository
  state rather than history, and putting it in the graph would misrepresent both.
- **Include the sections comparable clients place alongside these four** (pull requests, issues,
  teams) — excluded by the "No hosting-platform integration" Non-Goal, not merely postponed.

## Sources / Prior art

- [`git2::Repository`](https://docs.rs/git2/latest/git2/struct.Repository.html) and
  [`git2::Worktree`](https://docs.rs/git2/latest/git2/struct.Worktree.html) — the APIs the reader
  is built on; `worktrees()` reports **linked** worktrees only, so the main working tree is not one
  of them and must be presented separately if it is to appear at all.
- [`git worktree`](https://git-scm.com/docs/git-worktree) — the feature's own documentation, and
  the source of the term adopted below.
- GitKraken's left panel, and the equivalent in Fork and Sourcetree — the established shape for
  this view: collapsible sections per ref category, counts per section, the checked-out branch
  marked, ahead/behind shown as arrow counts.

## Consequences

- Positive: refs become discoverable instead of only recognisable; a branch tip far down the
  history is one click away; the panel is pure navigation, so it cannot violate the "Not a git
  client" Non-Goal. Nothing new is fetched or sent — ADR-0016 holds unchanged.
- Negative / trade-offs: a second payload and a second event to keep in step with the graph; a
  fourth pane competing for horizontal space with the graph and the commit detail; ahead/behind
  reflects the last fetch and can be stale, with no in-app way to refresh it — a direct consequence
  of the "Not a git client" Non-Goal that the panel must not paper over.
- **Specification impact (requires a human decision):** the constitution's vocabulary has no entry
  for **worktree**, and none for the panel itself. Accepting this ADR should come with adding both
  terms to `docs/SPECIFICATION.md`, and with extending Goal 5 to cover the inverse direction —
  refs being reachable, not only visible. The specification wins over this ADR (`AGENTS.md` §3), so
  that edit is the maintainer's, not the agent's.
- Follow-ups: whether the main working tree belongs in the worktrees section alongside the linked
  ones; whether the panel gains a filter field once section sizes justify it; whether stashes
  deserve a fifth section, given they already have graph nodes.
