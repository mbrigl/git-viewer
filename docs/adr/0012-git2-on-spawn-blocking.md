# ADR-0012: git2 on `spawn_blocking` instead of an async git library

- **Status:** 🟢 accepted
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Transferred from the earlier Git Graph Viewer implementation (commit `fd64b3a`), where
  this decision was already in effect. Restated here in this repository's ADR format for review.

## Context

The backend runs on Tokio, which Tauri requires ([ADR-0011](0011-rust-tauri-technology-base.md)).
Loading a repository is I/O-bound and can take a noticeable amount of time — up to the commit limit
of 3 000 commits ([ADR-0009](0009-commit-limit-3000.md)) — and the specification requires that this
never blocks the UI and that progress is reported while it runs.

The git library therefore has to be chosen together with the way it is called from async code.

## Decision

We will use **`git2`** (bindings to libgit2) and run every git2 call on Tokio's blocking thread pool
via **`tokio::task::spawn_blocking`**:

```rust
let commits = tokio::task::spawn_blocking(move || {
    git::load_repository(&path, Some(progress_tx))
}).await??;
```

Progress is sent from the blocking thread to the async context through a `tokio::sync::mpsc`
channel and emitted to the frontend as a `set-status` event.

## Alternatives considered

- **`gitoxide`** — pure Rust, no C dependency, and async-capable, which would remove the need for
  `spawn_blocking` entirely; but it is less mature and less documented for the ref-walking and
  diffing this project needs.
- **Calling the `git` CLI and parsing its output** — no library dependency at all and trivially
  async, but it makes the application depend on an external binary and on the stability of its
  output format.
- **Running `git2` directly inside the async task** — least code, but it blocks a runtime worker
  thread for the whole load, which is exactly the failure the requirement rules out.

## Sources / Prior art

- The `git2` crate and libgit2 — <https://docs.rs/git2> and <https://libgit2.org/>
- `gitoxide` — <https://github.com/Byron/gitoxide>
- Tokio, *`spawn_blocking`* and the guidance on CPU-bound and blocking work —
  <https://docs.rs/tokio/latest/tokio/task/fn.spawn_blocking.html>

## Consequences

- Positive: `git2` is battle-tested and covers everything the viewer needs; the UI stays responsive
  while a repository loads; `spawn_blocking` is the idiomatic Tokio pattern for synchronous I/O.
- Negative / trade-offs: a blocking task costs a thread-pool slot (negligible for a one-shot load);
  the progress channel has to be sent to from synchronous context (`blocking_send`), which is easy
  to break during refactoring; linking against libgit2 makes cross-compilation more involved than a
  pure-Rust solution would be.
- Follow-ups: revisit if `gitoxide` matures enough to remove the C dependency.
