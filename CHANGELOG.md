# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), versioning follows
[SemVer 2.0.0](https://semver.org/spec/v2.0.0.html) — see [ADR-0005](docs/adr/0005-versioning-and-releases.md).
Update the **Unreleased** section in the same change as any user-visible modification.

## [Unreleased]

### Changed

- The product is called **GitGraph** everywhere: the bundle identifier is `org.hivevm.gitgraph`, the
  cargo package, binary and npm package are `gitgraph` (`gitgraph_lib` for the library, `gitgraph-web`
  for the frontend workspace), and the window title and in-app name follow.
- `README.md` now documents the Bun commands that actually build the project, the real chip colours,
  both themes, and the `crates/adapter-git` layout; the CI badge points at this repository.
- Lockfiles are committed as `AGENTS.md` §7 requires: the workspace-root `Cargo.lock` and `bun.lock`.
  The stray `src-tauri/Cargo.lock` is gone — cargo ignores a member lockfile in a workspace, so it
  pinned nothing.

### Fixed

- The column header (Graph, SHA, Description, Author, Date) now lines up with the rows below it.
  It previously spanned the full window — including the right sidebar — with a hard-coded graph
  column width; it now lives inside the graph pane and mirrors the canvas geometry, including the
  lane area's dynamic width.

### Added

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
