# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), versioning follows
[SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) — see [ADR-0005](docs/adr/0005-versioning-and-releases.md).
Update the **Unreleased** section in the same change as any user-visible modification.

## [Unreleased]

### Added

- A **repository sidebar** on the left (ADR-0021) listing what a repository contains rather than
  only what the visible commits carry: local branches with their ahead/behind counts, remote
  branches grouped per remote, working trees (the main one included), and tags. The checked-out
  branch is marked three ways over — a tick glyph, an accent row, and a "checked out" badge that
  says it in words — and the folders leading down to it are tinted, so a collapsed folder cannot
  hide it. Names with slashes are grouped into folders, a filter field narrows every section at
  once, and selecting an entry reveals and selects the commit it points at. Refs pointing outside
  the loaded history are shown but inert, since there is no row to reveal. The sidebar reads and
  navigates only — it does not check out, fetch, or write anything. It minimises to a narrow rail
  of section icons that gives the width back to the graph; clicking an icon expands it again on
  that section, and the choice is remembered across sessions.
- A **Submodules section** in that sidebar (ADR-0022), listing every configured submodule with the
  commit the superproject pins it to and whether its working copy still sits on that commit —
  *modified* when it has drifted, *not initialized* when it was never checked out. Nothing is
  cloned to find out; an uninitialized submodule is reported, not fetched.
- **Moving between the repositories a project is made of.** Selecting a submodule opens it, and
  selecting a working tree switches to that checkout — its `HEAD`, its checked-out branch, its
  uncommitted changes. Both are reversible: the sidebar shows the repository one level up — the
  superproject, or the main working tree — as a row above the sections. That parent is read from
  git rather than remembered from the way in, so it is there even when the submodule was opened
  straight from the folder picker. The working tree being viewed is marked and inert.
- A **release pipeline** (ADR-0020): pushing a `v*` tag builds installers for Windows (`.msi`,
  NSIS `.exe`), macOS (`.dmg` for Apple Silicon and Intel), and Linux (`.deb`, `.rpm`, AppImage)
  plus one distribution-independent **Flatpak bundle**, and attaches them all to a draft GitHub
  release for the maintainer to publish. Binaries are unsigned until certificates exist.
- **Merge commits carry a double-circle marker** in the graph — an inner ring inside the node
  glyph whenever a commit has more than one parent.
- The diff viewer offers a **side-by-side view** next to the unified one, switchable in the diff
  header and remembered across sessions. Deleted lines run on the left against added lines on the
  right, paired within each change block; the longer side runs against empty cells, and context
  lines appear on both sides.
- Clicking the SHA in the commit detail **copies it to the clipboard**, with a brief "copied"
  badge as feedback. The working-directory node has no object id and stays a plain label.
- When a load stops at the commit limit, the status bar now says so — "3000 commits — commit
  limit reached, older history not shown" — instead of presenting the cut-off as the whole
  history (ADR-0009).
- The search shows a **results panel** while the field is focused: each hit as a row with short
  SHA, message, and author; click to jump, the current match highlighted and kept in view while
  cycling with `Enter`. Rendering is capped at 200 rows with a "+N more" footer — the full set
  stays reachable by cycling or refining the query.
- **Keyboard navigation** in the graph: `↑`/`↓` walk the commit rows (starting at the newest when
  nothing is selected), and `Escape` closes the diff overlay first, then deselects the commit —
  which also lifts the ancestry dim. Shortcuts stay out of the way while typing in a text field.
- A **search field** in the toolbar (focus with `Ctrl`/`Cmd+F`) filters history by message, author,
  committer, SHA, or ref name — case-insensitive substring matching. `Enter` jumps to the next
  match, `Shift+Enter` to the previous (wrapping around, with chevron buttons as alternative), the
  field shows the match count and current position, and `Escape` clears it.
- Selecting a commit now **highlights its lineage**: the selected commit, all its loaded
  ancestors, all its descendants, and the edges between them keep full colour while every other
  row and edge is dimmed. Reloading a repository clears the selection, since rows are reassigned
  on every load.
- The commit detail sidebar lists a commit's **parents and children** as clickable short SHAs that
  select the target commit and scroll it into view, completing Specification success criterion 6.
  Parents outside the loaded commit limit are shown but not clickable. The graph payload's node
  objects carry two new fields for this: `parents` (SHAs in commit order) and `children` (loaded
  children, newest first).
- A test suite where there was none, covering what the specification requires to be testable without
  a repository window or a running UI: 13 Rust tests over row assignment, column assignment, edge
  building, determinism and the commit limit, and 8 frontend tests over the changed-files tree. Run
  with `cargo test` and `bun test src-web`.
- CI now enforces the Definition of Done on every pull request — build, both test suites, clippy with
  `-D warnings`, and a format check — instead of the inert placeholder workflow.
- ADR-0006 … ADR-0019 (status `proposed`): commit graph layout (rows and columns), orthogonal edges
  with rounded corners, index arena, commit limit, virtual rendering, Rust/Tauri as the technology
  base, git2 on `spawn_blocking`, diff overlay, flat/tree file view, theming, Svelte as the frontend
  framework, a local-only frontend with a hardened WebView, Bun as the package manager, the
  `adapter-git` crate split, and synthetic stash/working-directory nodes.
- Initial template: agent governance (`AGENTS.md`, specification, ADRs), Dev Container without
  host Docker access, documentation and convention CI checks, git conventions, supply-chain
  pinning, and this changelog.

### Changed

- Branch and tag badges moved out of the description into a **"Branch / Tag" column of their own**,
  to the left of the graph, so a commit's refs no longer eat into the space its message gets. The
  badges sit flush against the lanes, so one is always directly left of the commit it marks, and
  refs that do not fit collapse into a `+N` badge instead of vanishing. A single badge wider than
  the column is truncated instead of bleeding into the graph lanes.
- The **checked-out branch is marked in the graph too**: its badge carries a tick, its own colours
  and a heavier outline, and it is laid out first so it is never the one that collapses into the
  `+N` count. A row whose badges do not all fit now keeps a name on it — previously a commit
  carrying one long branch name could degrade to a bare `+3`, which named nothing at all.
- The graph rows **drop the Author and Date columns**: branch/tag, graph, SHA and description are
  what a row needs, and the description takes the freed width. Author, committer and date are
  unchanged in the commit detail panel.
- **Avatars are opt-in, default off** (ADR-0016): Gravatar images load only after the toggle in
  the status bar is switched on, so a fresh installation makes no network requests at all; the
  avatar hash uses SHA-256 (the ADR-gated `md5` crate is gone). The WebView is hardened to match:
  a restrictive CSP whose only external origin is `img-src https://www.gravatar.com`, the asset
  protocol disabled, and `withGlobalTauri` off.
- The product is called **GitGraph** everywhere: the bundle identifier is `org.hivevm.gitgraph`, the
  cargo package, binary and npm package are `gitgraph` (`gitgraph_lib` for the library, `gitgraph-web`
  for the frontend workspace), and the window title and in-app name follow.
- `README.md` now documents the Bun commands that actually build the project, the real chip colours,
  both themes, and the `crates/adapter-git` layout; the CI badge points at this repository.
- Lockfiles are committed as `AGENTS.md` §7 requires: the workspace-root `Cargo.lock` and `bun.lock`.
  The stray `src-tauri/Cargo.lock` is gone — cargo ignores a member lockfile in a workspace, so it
  pinned nothing.

### Fixed

- The diff viewer renders hunk headers and the `+`/`-` line signs again: the Rust enum serializes
  its line kinds camelCase (`add`, `hunk`, …), but the viewer compared against capitalized names,
  so those branches never matched.
- The column header now lines up with the rows below it.
  It previously spanned the full window — including the right sidebar — with a hard-coded graph
  column width; it now lives inside the graph pane and mirrors the canvas geometry, including the
  lane area's dynamic width.
