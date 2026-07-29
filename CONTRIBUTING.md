# Contributing

Thanks for your interest in contributing. This project is **specification- and ADR-driven**, and the
same rules apply to humans and coding agents alike. For coding agents, the full instructions and
agent-specific details live in [`AGENTS.md`](AGENTS.md).

## Before you start

Read, in this order:

1. [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md) — the constitution: problem, goals, and vocabulary.
2. [`docs/adr/`](docs/adr/) — the Architecture Decision Records. **Accepted ADRs are binding.**
3. [`AGENTS.md`](AGENTS.md) — the working rules (these govern coding agents, but the workflow is the
   same for human contributors).

Authority runs **specification → accepted ADRs → individual change**.

## Workflow

1. **Open an issue first** for anything non-trivial, so scope and intent can be agreed before work
   starts.
2. **Architecture-relevant decisions need an ADR.** Adding a dependency, designing a public
   interface, choosing a protocol/data format or a persistence strategy — copy
   [`docs/adr/template.md`](docs/adr/template.md), set status `proposed`, and wait for a maintainer
   to accept it before implementing, and list the ADR in the index in
   [`docs/adr/README.md`](docs/adr/README.md) as part of the same change. See that file for the full
   process. Not every change needs an ADR — see the calibration rule in [`AGENTS.md`](AGENTS.md).
3. **Keep changes small and reviewable.** Reference the relevant ADR(s) in commits and the pull
   request (e.g. `Implements ADR-NNNN`).
4. **Open a pull request** against `main`. Fill in the PR template and link the issue/ADR. PRs are
   **squash-merged**, so the PR title must itself be a valid Conventional Commit subject — it
   becomes the permanent commit on `main`.

## Conventions

- **All artifacts in the repository are written in English** — code, comments, commit messages,
  documentation, ADRs, and PRs. You may discuss in any language, but what lands in the repo is
  English.
- Use the **project vocabulary** from the specification consistently.
- Build, test, and formatting commands: see the **Build, Test & Run** section in
  [`README.md`](README.md).
- **Branch names, commit subjects, and PR titles follow the git conventions** in
  [`AGENTS.md`](AGENTS.md) §6 (branches `type/short-topic`, Conventional Commit subjects). Checked
  in CI on every PR; run [`scripts/check-git-conventions.sh`](scripts/check-git-conventions.sh)
  locally before pushing.
- **Documentation consistency is checked in CI** (ADR index integrity, relative links, and
  §-section references into `AGENTS.md`) via
  [`scripts/check-docs.sh`](scripts/check-docs.sh), and **GitHub Actions must be SHA-pinned**
  ([`scripts/check-workflow-pins.sh`](scripts/check-workflow-pins.sh)). Run both locally before
  opening a pull request — they need only bash and coreutils, already in the Dev Container.

## Releases

Releases are performed manually by a maintainer (never by an agent — see
[`AGENTS.md`](AGENTS.md) §6), versioned with [SemVer 2.0.0](https://semver.org/spec/v2.0.0.html)
per [ADR-0005](docs/adr/0005-versioning-and-releases.md). Before 1.0.0, minor versions may contain
breaking changes.

1. Move the content of `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) into a new
   `## [X.Y.Z] - YYYY-MM-DD` section (leave `[Unreleased]` in place, empty).
2. Commit (`chore: release vX.Y.Z`) and merge via the normal PR workflow.
3. Tag the release commit: `git tag -a vX.Y.Z -m "vX.Y.Z"` and push the tag.
4. Create the GitHub release from the changelog section: `gh release create vX.Y.Z`.

## Reporting security issues

Do **not** open a public issue for vulnerabilities. Follow [`SECURITY.md`](SECURITY.md).
