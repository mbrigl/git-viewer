# GitGraph

[![Docs & ADR checks](https://github.com/mbrigl/git-viewer/actions/workflows/docs-check.yml/badge.svg)](https://github.com/mbrigl/git-viewer/actions/workflows/docs-check.yml)

A **GitKraken-style** commit graph viewer for local git repositories: every branch a straight
vertical column, every merge an orthogonal connection, the newest commit at the top. The work is
driven by a written **specification** ([`docs/SPECIFICATION.md`](docs/SPECIFICATION.md)) and
**Architecture Decision Records** ([`docs/adr/`](docs/adr/)), so intent and the reasoning behind
every structural choice stay explicit and reviewable.

> For agent instructions, see [`AGENTS.md`](AGENTS.md) — the single source of truth for all coding agents.

> [!NOTE]
> **Repository setup.** Some settings cannot be enforced by repository files and must be configured
> in the GitHub repository settings: a **ruleset on `main`** that requires pull requests, requires the
> **Docs & ADR checks** and **Convention checks** status checks, and blocks force pushes and branch
> deletion; **secret scanning with push protection**; and **private vulnerability reporting**
> (see [`SECURITY.md`](SECURITY.md)).

## Overview

Git history is a directed acyclic graph, but the usual tools flatten it into a list or draw it as
ASCII art that becomes unreadable once several branches run in parallel. GitGraph draws that
graph properly: time runs downwards, each branch line keeps its own column, and merges are drawn as
unambiguous orthogonal edges.

```
 ● abc1234   main   Fix login bug                    Alice      2024-01-12 14:30
 ●─┐ def567         Merge feature/oauth into main    Bob        2024-01-11 09:15
 │ ● ghi890  feat   Add OAuth2 support               Carol      2024-01-10 17:42
 │ ● jkl012         Refactor auth module             Carol      2024-01-09 11:20
 ●─┘ mno345         Update dependencies              Alice      2024-01-08 16:05
 ● pqr678           Initial commit                   Dave       2024-01-01 10:00
```

The layout follows the algorithms described in Pierre Vigier's article
[*Commit Graph Drawing Algorithms*](https://pvigier.github.io/2019/05/06/commit-graph-drawing-algorithms.html).
The full problem statement, the algorithms, and the project vocabulary live in
[`docs/SPECIFICATION.md`](docs/SPECIFICATION.md).

### Features

| Feature                | Details                                                              |
| ---------------------- | -------------------------------------------------------------------- |
| **Straight branches**  | All commits of a branch line share one vertical column                |
| **Merge lines**        | Orthogonal L-shaped lines for merge edges                             |
| **Branch/tag chips**   | Colored pill labels (green = local, blue = remote, amber = tag)       |
| **Dark & light theme** | Switchable from the status bar; branch colors stay identical          |
| **Stash & WIP rows**   | Stash entries and uncommitted changes appear as marked graph nodes     |
| **Virtual rendering**  | Only visible rows are painted — smooth on large repositories          |
| **Commit detail**      | Select a row to see full SHA, message, author, date, and committer     |
| **Background loading** | History loads off the UI thread; the UI stays responsive              |
| **Commit limit**       | Up to 3 000 commits per load                                          |

### Implementation

The application is a Rust/Tauri desktop app. Loading history and computing the layout happen in
Rust; the graph is drawn by a TypeScript frontend on a canvas inside the Tauri WebView.

| Component       | Details                                                            |
| --------------- | ------------------------------------------------------------------ |
| **UI**          | Svelte 5 + TypeScript + Vite in a Tauri shell                      |
| **Git backend** | git2 (libgit2 bindings), called on Tokio's blocking pool           |
| **Graph model** | `Node` (wraps `CommitData`), `Edge` — index arena, no object graph  |
| **Layout**      | `crates/adapter-git/src/graph.rs`                                  |
| **Git loading** | `crates/adapter-git/src/git.rs`                                    |

The layout logic is specified independently of the UI toolkit — see
[`docs/SPECIFICATION.md`](docs/SPECIFICATION.md) — so it can be reasoned about and tested without
starting the application.

## Prerequisites

- [VS Code](https://code.visualstudio.com/) with the
  [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)
  extension — or any DevContainer-compatible IDE
- Docker / Podman (rootless) available on the host

For building the application:

- Rust 1.96+ (see [`rust-toolchain.toml`](rust-toolchain.toml))
- [Bun](https://bun.sh/) — the JavaScript package manager and task runner
  ([ADR-0017](docs/adr/0017-bun-package-manager.md)); provided inside the Dev Container
- The [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS
  (WebView2 on Windows, webkit2gtk on Linux)

## Getting Started

1. Open the repository in VS Code and choose **Reopen in Container** — the Dev Container and
   preconfigured agent extensions build automatically.
2. Authenticate your coding agent inside the container (for Claude Code: `claude login`).
3. Start working with the agent — drive the work from the specification and the ADRs.

## Build, Test & Run

<!-- This section is the single source for build/test/run commands — both humans and agents rely
     on it (AGENTS.md links here). -->

```bash
# Install dependencies from the lockfile (first time, and after dependency changes)
bun install --frozen-lockfile

# Development mode — hot-reloading frontend + Rust backend
bun run tauri dev

# Production build
bun run tauri build

# Frontend build on its own (compiles the Svelte components)
bun run --cwd src-web build

# Test & lint
cargo test
bun test src-web
cargo clippy --all-targets -- -D warnings
cargo fmt --all --check
```

CI runs exactly these commands on every pull request
([`.github/workflows/ci.yml`](.github/workflows/ci.yml)) — keep the two in step.

## Usage

Start the application (`bun run tauri dev`, or the binary produced by `bun run tauri build`) and
open a repository — either via the folder picker in the toolbar or by passing a path.

The graph loads in the background, with progress shown in the status bar. Scroll through the
history; branch and tag chips mark the commits the refs point at. Select any row to see the commit
detail — SHA, message, author, date and committer — plus the files it changed, in a flat or tree
view; selecting a file opens its diff over the graph.

> Specification Goal 6 additionally asks for a commit's **parents and children** in that detail
> panel. That part is not implemented yet: the serialized node carries no parent or child field.

## Roadmap

Direction beyond the current feature set, roughly in priority order. Anything here that turns out to
constrain the architecture gets an ADR before it is implemented.

1. **Edge layer avoidance** — route edges to prevent crossings instead of always using a plain
   L-shape (starting points: Sugiyama-style layered layout, edge bundling).
2. **Performance** — profile rendering on large repositories; optimise column assignment for very
   wide graphs.
3. **Merge commit visualisation** — mark merge commits distinctly (e.g. diamond or double circle).
4. **Interactive exploration** — search and filter by author, message, or date range; highlight a
   commit's ancestry and descendants; filter by branch or tag.
5. **Column width and zoom** — dynamic lane width, horizontal zoom and pan.
6. **Better ref display** — tooltips or a separate ref legend instead of inline chips only.
7. **Export** — save the visible graph as PNG or SVG.
8. **Multiple repositories** — side-by-side comparison.
9. **Theming** — configurable fonts and branch colors on top of the existing dark/light themes.
10. **Commit statistics** — commits per author, density heatmap.

## Project Layout

```
README.md             # overview & setup for humans
AGENTS.md             # single source of truth for coding agents
docs/SPECIFICATION.md # the specification: problem, goals, algorithms, vocabulary
docs/adr/             # Architecture Decision Records (+ template)
crates/adapter-git/   # git access + layout — no Tauri dependency (ADR-0018)
  src/models.rs       #   data types: CommitData, Node, Edge, NodeJson, Graph
  src/git.rs          #   git2 integration — discover repo, walk refs, load commits
  src/graph.rs        # ★ layout algorithms — temporal sort, straight branches, edges
src-tauri/            # Tauri shell (binary `gitgraph`, lib `gitgraph_lib`)
  src/commands.rs     #   Tauri commands: open_repo, browse_repo, select_commit
  src/lib.rs          #   Tauri app setup — plugins, command wiring
src-web/              # Svelte 5 + TypeScript + Vite frontend, canvas rendering
.devcontainer/        # Dev Container definition (base image + Features)
.vscode/              # shared editor settings
.claude/CLAUDE.md     # pointer for Claude Code to read AGENTS.md
.claude/settings.json # Claude Code permissions: prompt before git/gh writes
```

## Dev Container

The environment is defined entirely in [`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json):
it starts from a prebuilt base image and layers Dev Container Features and VS Code extensions on top —
no Dockerfile or Compose file required. Customise the environment by adding Features, switching the
base image, or adding extensions.

### Host container management

The Dev Container deliberately has **no access to the host Docker daemon** — the socket is not mounted
([ADR-0002](docs/adr/0002-dev-container-runtime.md)). To manage the host's containers from VS
Code, run the **Container Tools** extension (`ms-azuretools.vscode-containers`) on the **host** side:
install it in your host VS Code. [`.vscode/settings.json`](.vscode/settings.json) already pins it to
run locally via `remote.extensionKind`, so it keeps talking to the host engine even when this folder
is reopened in the container.

## Coding Agents

This Dev Container preinstalls the **Claude Code** and **Mistral Vibe** VS Code extensions (see
[`.devcontainer/devcontainer.json`](.devcontainer/devcontainer.json)); other agents (OpenAI Codex,
Cursor, OpenCode, GitHub Copilot) work too once you add them. Authenticate your agent inside the
container (for Claude Code: `claude login`).

The rules every agent follows live in [`AGENTS.md`](AGENTS.md); how each agent is wired to read them
is recorded in [ADR-0001](docs/adr/0001-agent-governance-model.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the workflow (specification- and ADR-driven, small
reviewable changes) and [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) for the community standards we
expect of everyone taking part. Security issues: please follow [`SECURITY.md`](SECURITY.md) instead
of opening a public issue.

## License

Released under the MIT License — see [`LICENSE`](LICENSE).
