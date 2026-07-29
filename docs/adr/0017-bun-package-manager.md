# ADR-0017: Bun as the JavaScript package manager and task runner

- **Status:** 🟡 proposed
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Records a decision already embodied in the tree — `bun run` in
  `src-tauri/tauri.conf.json`, the `bun:1` Dev Container Feature, a `bun.lock`, and `@types/bun` as a
  dev dependency — but never written down, and currently contradicted by `README.md`, which documents
  `npm` and Node.js. Documented retroactively so the ADR set matches the tree.

## Context

[ADR-0002](0002-dev-container-runtime.md) (accepted) deliberately ships **no** language toolchain in
the base image and obliges each project to add its own and to record the choice: its Follow-ups say
"each project records its own toolchain choice (a new ADR if it constrains future choices)".
[ADR-0011](0011-rust-tauri-technology-base.md) discharged that duty for Rust and Vite;
[ADR-0015](0015-svelte-frontend-framework.md) did it for the component framework. The JavaScript
package manager was never recorded, even though it is the one tool that decides how the frontend is
installed, locked and built.

It is not a free choice, because three constraints are already fixed:

- **Tauri drives it.** `tauri.conf.json` invokes `bun run --cwd src-web dev` and
  `bun run --cwd src-web build` as `beforeDevCommand` / `beforeBuildCommand`, so whatever runs those
  scripts must exist wherever the app is built — including CI.
- **`AGENTS.md` §7 / [ADR-0004](0004-secrets-and-supply-chain.md) require a committed lockfile** and
  a frozen install in CI. Which lockfile is authoritative therefore has to be stated, and today
  neither `bun.lock` nor the root `Cargo.lock` is tracked at all — a live violation of that rule.
- **`README.md` is the single source for build commands** (`AGENTS.md` §6). It presently documents
  `npm install` and "Node.js 22+ with npm", which does not match how the project actually builds.
  One of the two has to give.

The workload is small and unremarkable: install a handful of dev dependencies, run Vite, run a type
check. Nothing here needs a heavy toolchain.

## Decision

We will use **Bun** as the JavaScript package manager and task runner, provisioned by the
`ghcr.io/devcontainers-extra/features/bun:1` Dev Container Feature, and we will:

- keep `bun run --cwd src-web …` as the Tauri `beforeDevCommand` / `beforeBuildCommand`;
- treat **`bun.lock` as the authoritative JavaScript lockfile**, commit it, and install from it with
  a frozen install (`bun install --frozen-lockfile`) in CI, alongside the root `Cargo.lock` for the
  Rust side;
- rewrite the **Build, Test & Run** section of [`README.md`](../../README.md) to the Bun commands, so
  the documented commands are the ones that actually work;
- add no second package manager: there is no `package-lock.json`, no `yarn.lock`, no `pnpm-lock.yaml`.

## Alternatives considered

- **npm** — what the README currently claims and the most universally available option, with the
  largest install base and no extra Dev Container Feature needed (Node ships one). Rejected because
  Bun is already wired into `tauri.conf.json` and the Dev Container, is markedly faster on cold
  installs, and covers install, script running and a TypeScript-aware runtime in one tool; switching
  to npm would be a change, not a simplification. This is the alternative to revisit if Bun's
  ecosystem compatibility ever bites.
- **pnpm** — efficient disk use through a content-addressed store and strict dependency resolution
  that catches phantom dependencies. Rejected: its main advantages target large multi-package
  repositories, and this project has one small frontend workspace.
- **Yarn (Berry)** — mature workspaces and a strong plug'n'play mode, but its configuration surface
  is out of proportion to a single frontend package.
- **No package manager at all — vendored dependencies or import maps from a CDN** — removes the
  install step entirely, but forgoes a lockfile (against ADR-0004) and, for the CDN variant, would
  reintroduce exactly the third-party egress that
  [ADR-0016](0016-local-only-no-egress-hardened-webview.md) removes.

## Sources / Prior art

- Bun — package manager, script runner, and `--frozen-lockfile` install: <https://bun.sh/docs>
- The `bun` Dev Container Feature: <https://github.com/devcontainers-extra/features>
- Tauri, *Configuration* — `beforeDevCommand` / `beforeBuildCommand`: <https://tauri.app/reference/config/>
- npm, pnpm and Yarn as the alternatives weighed above — <https://docs.npmjs.com/>,
  <https://pnpm.io/motivation>, <https://yarnpkg.com/features/pnp>

## Consequences

- Positive: one tool for installing, locking and running scripts; fast cold installs, which matters
  most in a fresh Dev Container and in CI; the documented build commands and the real build commands
  become the same thing; the lockfile question from `AGENTS.md` §7 gets a concrete answer instead of
  an unmet rule.
- Negative / trade-offs: Bun is younger than npm and its ecosystem compatibility is occasionally
  imperfect, so a dependency may need a workaround; contributors must install one more tool outside
  the Dev Container; `bun.lock` is Bun-specific, so a later move to another manager means
  regenerating the lockfile and re-reviewing the resolved tree.
- Follow-ups: CI still has to grow a real build/test/lint job — it is currently an inert skeleton on
  `workflow_dispatch` — and that job must install Bun and use the frozen install decided here, with
  every action pinned to a commit SHA per ADR-0004. Whether CI gains that job is not this ADR's
  decision; wiring it up correctly is.
