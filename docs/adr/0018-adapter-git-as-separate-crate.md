# ADR-0018: The git and layout core lives in a separate `adapter-git` crate

- **Status:** 🟡 proposed
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Records a decision already embodied in the tree — a Cargo workspace with `src-tauri` and
  `crates/adapter-git` as members — but never written down, and currently misdescribed by
  `README.md`, whose Project Layout places `models.rs`, `git.rs` and `graph.rs` under `src-tauri/src/`.
  Documented retroactively so the ADR set matches the tree.

## Context

The specification makes the separation of layout from rendering a *strategy*, not a preference:

> **Separate layout from rendering.** … The layout stage produces plain positional data (rows,
> columns, edges) and knows nothing about the UI toolkit that draws it.
>
> **Keep the layout testable in isolation.** Row assignment, column assignment, and edge building
> operate on plain data and are covered by tests that need no repository window and no running UI.

[ADR-0011](0011-rust-tauri-technology-base.md) describes "Backend (Rust)" as a single thing and does
not say how it is organised. If the layout lived inside the `src-tauri` crate, nothing would stop it
from reaching for a `tauri::Window` or an `AppHandle`, and the specification's requirement would rest
on discipline alone. A crate boundary turns it into a compile error instead.

A second force is platform reach. `src-tauri`'s library is built as `staticlib` and `cdylib` next to
`rlib`, which is the shape mobile targets need, and `git2` is already declared only for
non-mobile targets:

```toml
[target.'cfg(not(any(target_os = "android", target_os = "ios")))'.dependencies]
git2 = "0.20"
```

Where the git backend can vary by platform, it needs to be a unit that can be swapped — which is
what the name `adapter-git` says.

## Decision

We will keep the git access and the layout algorithms in their **own workspace crate,
`crates/adapter-git`**, depended on by `src-tauri` through the workspace, with a one-way dependency:

- **`adapter-git` must not depend on `tauri`.** It exposes `git` (repository loading and diffs),
  `graph` (the two layout phases of [ADR-0006](0006-pvigier-layout-algorithm.md)) and `models` (the
  plain data types), and it knows nothing about windows, events or commands.
- **`src-tauri` owns everything Tauri.** Commands, the app state, event emission and the
  `spawn_blocking` bridge of [ADR-0012](0012-git2-on-spawn-blocking.md) live there, and it depends on
  `adapter-git` — never the reverse.
- The serialized types (`NodeJson`, `Edge`, `Graph`, `FileChange`, `DiffLine`) are the boundary
  between the two, and are also the frontend contract.

The crate boundary is the enforcement mechanism for the specification's "layout knows nothing about
the UI toolkit". It is not an anticipation of future reuse; it is what makes the current requirement
checkable.

## Alternatives considered

- **Modules inside the `src-tauri` crate** — one crate, simpler workspace, faster to navigate, and
  what `README.md` currently describes. Rejected because nothing would then prevent layout code from
  taking a Tauri dependency, and the specification's "no repository window and no running UI" test
  requirement would be unverifiable: a test binary would still link the whole Tauri stack.
- **Splitting further — separate `git`, `layout` and `models` crates** — maximum enforcement of the
  pipeline stages and the purest expression of the specification's three stages. Rejected as
  premature for roughly 800 lines of Rust: three crates' worth of manifests and version coordination
  for boundaries that one crate plus module privacy already expresses.
- **A trait-based git abstraction inside one crate** (`trait GitBackend`, a git2 implementation behind
  it) — would allow platform-specific backends without a workspace split. Rejected for now as
  indirection with no second implementation to justify it (`AGENTS.md` §1, YAGNI); the crate split
  already gives the swappable unit.
- **Keeping layout in Rust but moving it to the frontend in TypeScript** — would remove the boundary
  question entirely, but puts an `O(n·log n + m)` pass in the WebView on the critical path for the
  "loads without freezing the UI" goal, and abandons the typing and speed that ADR-0011 chose Rust
  for.

## Sources / Prior art

- The Cargo Book, *Workspaces* — <https://doc.rust-lang.org/cargo/reference/workspaces.html>
- The Cargo Book, *Platform-specific dependencies* —
  <https://doc.rust-lang.org/cargo/reference/specifying-dependencies.html#platform-specific-dependencies>
- Tauri, *Mobile* — why the app library is built as `staticlib`/`cdylib`: <https://tauri.app/develop/>
- The hexagonal / ports-and-adapters framing that the crate's name follows, as the general form of
  "core does not depend on its surroundings" — A. Cockburn, *Hexagonal Architecture*:
  <https://alistair.cockburn.us/hexagonal-architecture/>

## Consequences

- Positive: the specification's separation of layout from rendering is enforced by the compiler
  rather than by review; the layout can be unit-tested without linking Tauri, which is exactly what
  the specification demands and what the test suite still owes; a platform-specific git backend
  becomes a change inside one crate; build times improve, because touching a Tauri command does not
  recompile the layout.
- Negative / trade-offs: two manifests and a workspace to keep in sync; the serialized types must be
  public, so the boundary is wider than module privacy would be; contributors have one more level of
  structure to learn; and the win is only real as long as the one-way rule holds — a single
  `tauri` dependency added to `adapter-git` silently undoes it.
- Follow-ups: **the mobile gating is currently incomplete and must not be mistaken for working
  support.** `git2` is excluded for Android and iOS, but `git.rs` imports and uses it
  unconditionally, so those targets would fail to compile. Either the module gets platform gates and
  a fallback backend, or the target-specific dependency should be dropped until mobile is actually
  pursued — a follow-up ADR if a mobile backend is chosen. Separately, `README.md`'s Project Layout
  has to be corrected to show `crates/adapter-git/`.
