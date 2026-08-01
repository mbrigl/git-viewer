# Architecture Decision Records

This directory contains all Architecture Decision Records (ADRs) for this project.
Accepted ADRs are **binding** for humans and coding agents alike (see [`AGENTS.md`](../../AGENTS.md)
in the repository root). ADRs derive from the specification in [`docs/SPECIFICATION.md`](../SPECIFICATION.md).

## Process

1. Copy [`template.md`](template.md) to `NNNN-short-title.md` (next free number).
2. Fill in context, decision, alternatives, and consequences. Set status `proposed`.
3. A human reviewer accepts or rejects the ADR. **Only humans change the status.**
4. Add the ADR to the index below, with its status shown via the colored bullet from the legend.
5. A decision is changed by a *new* ADR that supersedes the old one — never by editing an
   accepted ADR.
6. **Once this template is in use, ADRs are immutable and their numbers are permanent.** Never
   renumber, delete, or merge ADRs — other ADRs, commits (`Implements ADR-NNNN`), and code may
   reference a number. Superseded ADRs stay as historical record (status `superseded by ADR-NNNN`);
   filter active ones via the Status column. To curb sprawl, supersede — do not consolidate. (The
   template itself may still consolidate its own seed ADRs before any project builds on them, since
   nothing external references those numbers yet.)
7. **Never reference an ADR number that does not exist yet.** Every `ADR-NNNN` reference must point
   to a file that is already present in this directory. Anticipated follow-up decisions are
   described by topic (e.g., "a follow-up ADR on session storage") in the Consequences section —
   the concrete number is cited only once that ADR file exists.

## Index

**Status legend:** 🟢 accepted · 🟡 proposed · 🔴 rejected · ⚪ superseded

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-agent-governance-model.md) | Specification + ADRs governed through a single `AGENTS.md` | 🟢 accepted |
| [0002](0002-dev-container-runtime.md) | Debian Dev Container without host Docker access | 🟢 accepted |
| [0003](0003-git-conventions.md) | Git conventions: branches, Conventional Commits, squash merge | 🟢 accepted |
| [0004](0004-secrets-and-supply-chain.md) | Secrets handling and supply-chain pinning | 🟢 accepted |
| [0005](0005-versioning-and-releases.md) | Versioning and release process | 🟢 accepted |
| [0006](0006-pvigier-layout-algorithm.md) | Commit graph layout after Pvigier — rows and columns | 🟢 accepted |
| [0007](0007-orthogonal-edges-instead-of-bezier.md) | Orthogonal L-shaped edges with short rounded corners | 🟢 accepted |
| [0008](0008-index-arena-instead-of-object-graph.md) | Index arena instead of a reference-linked object graph | 🟢 accepted |
| [0009](0009-commit-limit-3000.md) | Commit limit of 3 000 per repository load | 🟢 accepted |
| [0010](0010-virtual-rendering.md) | Virtual rendering — paint only the visible rows | 🟢 accepted |
| [0011](0011-rust-tauri-technology-base.md) | Rust + Tauri as the implementation technology | 🟢 accepted |
| [0012](0012-git2-on-spawn-blocking.md) | git2 on `spawn_blocking` instead of an async git library | 🟢 accepted |
| [0013](0013-diff-overlay-covers-canvas.md) | Inspecting a commit's changes — diff overlay, flat and tree file list | 🟢 accepted |
| [0014](0014-theming-css-variables-and-canvas-palette.md) | Dark/light theming via CSS variables and a canvas palette | 🟢 accepted |
| [0015](0015-svelte-frontend-framework.md) | Svelte 5 as the frontend framework | 🟢 accepted |
| [0016](0016-local-only-no-egress-hardened-webview.md) | Local-only frontend — no third-party egress, hardened WebView | 🟢 accepted |
| [0017](0017-bun-package-manager.md) | Bun as the JavaScript package manager and task runner | 🟢 accepted |
| [0018](0018-adapter-git-as-separate-crate.md) | The git and layout core lives in a separate `adapter-git` crate | 🟢 accepted |
| [0019](0019-synthetic-stash-and-workdir-nodes.md) | Stashes and uncommitted changes as synthetic nodes | 🟢 accepted |

**Consolidation history.** While every ADR involved was still `proposed`, and while nothing outside
this directory referenced their numbers, three pairs were consolidated and the set was then renumbered
so that it runs without gaps — the exemption in Process item 6.

- Row assignment was folded into [ADR-0006](0006-pvigier-layout-algorithm.md), which now covers both
  layout phases.
- The edge corner style was folded into
  [ADR-0007](0007-orthogonal-edges-instead-of-bezier.md), which now states the edge shape once.
- The changed-files list was folded into
  [ADR-0013](0013-diff-overlay-covers-canvas.md), which now covers the whole
  inspect-a-commit workflow.

The numbering above is the result; the three absorbed ADRs have no separate record.

**The exemption is spent — this was the last renumbering.** Item 6 applies in full from here:
numbers are permanent, and neither renumbering nor consolidation is available again. A decision is
changed only by a new ADR that supersedes it.

**Where the procedures live.** These ADRs record *decisions* — what was chosen, what was rejected,
and what follows. The normative step-by-step behaviour of the layout, the edge shapes and the
rendering window lives once, in [`docs/SPECIFICATION.md`](../SPECIFICATION.md), which is the
constitution (`AGENTS.md` §3). ADRs point at it instead of restating it: two copies of a procedure
drift, and that is exactly how earlier contradictions between the specification and the ADRs arose.

