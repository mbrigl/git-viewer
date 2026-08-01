# ADR-0020: Tag-triggered release pipeline with installers and a Flatpak bundle

- **Status:** 🟡 proposed
- **Date:** 2026-08-01
- **Deciders:** Markus Brigl (maintainer)

## Context

[ADR-0005](0005-versioning-and-releases.md) fixes the release *policy* — SemVer, a Keep-a-Changelog
`CHANGELOG.md`, annotated `vX.Y.Z` tags, and releases as a deliberate human act — but deliberately
deferred automation. There is still no way for a user to *download* GitGraph: every release would
mean building installers for three operating systems by hand, on three machines. The maintainer
wants downloadable releases for Windows, macOS, and Linux, versioned, plus a Flatpak so the Linux
build runs across distributions without chasing each distro's packaging.

Constraints from accepted ADRs: every GitHub Action must be pinned to a full commit SHA with a
version comment, enforced by `check-workflow-pins.sh` and kept current by Dependabot
([ADR-0004](0004-secrets-and-supply-chain.md)); the build toolchain is Bun + cargo via the Tauri
CLI ([ADR-0011](0011-rust-tauri-technology-base.md), [ADR-0017](0017-bun-package-manager.md));
and the release itself must remain a human decision (ADR-0005).

A note on "a Flatpak for the various distros": distribution-independence is Flatpak's core
property. One bundle, built against a fixed runtime, runs on any distribution with Flatpak
installed — there is nothing per-distro to build. The pipeline therefore produces *one*
`.flatpak` file, alongside the distro-native `.deb`/`.rpm`/AppImage that Tauri already bundles.

## Decision

We will add a GitHub Actions workflow, triggered by pushing a `v*` tag, that builds all
installers and attaches them to a **draft** GitHub release named after the version — the
maintainer still reviews and publishes, keeping ADR-0005's human release act intact.

1. **Platform installers via `tauri-apps/tauri-action`** (SHA-pinned), in a matrix:
   macOS on `macos-latest` for both `aarch64-apple-darwin` and `x86_64-apple-darwin` (`.dmg`/
   `.app`), Windows on `windows-latest` (`.msi` and NSIS `.exe`), Linux on `ubuntu-22.04`
   (`.deb`, `.rpm`, AppImage). The action runs `tauri build`, derives the version from
   `tauri.conf.json`, and uploads every bundle to the draft release.
2. **One Flatpak bundle via `flatpak/flatpak-github-actions`** (SHA-pinned): a manifest
   `org.hivevm.gitgraph.yml` in the repository, following the Tauri Flatpak guide — GNOME 46
   runtime/SDK, module installs the `.deb` produced in step 1, `finish-args` limited to what the
   app needs (Wayland/X11 socket, dri, ipc). The job bundles `GitGraph-<version>.flatpak` and
   attaches it to the same draft release.
3. **Unsigned binaries for now.** Code signing (Windows) and signing/notarization (macOS) need
   certificates the project does not have; users see the usual OS warnings. Signing is a
   follow-up decision once certificates exist, not a blocker for shipping downloads.

## Alternatives considered

- **Manual builds on maintainer machines** — three OS environments to maintain by hand, not
  reproducible, and the practical result so far: no downloads at all.
- **A hand-written build workflow instead of `tauri-action`** — full control, but re-implements
  what the official action already does (per-OS system dependencies, bundling, release upload,
  version substitution); more YAML to maintain for no capability gain.
- **Flathub submission instead of a bundled `.flatpak`** — better discoverability and automatic
  updates for users, but it is an external review process in a separate repository and couples
  releases to Flathub's timeline. The in-release bundle ships now; Flathub remains open as a
  follow-up once releases are routine.
- **Per-distro native packages (PPA, AUR, COPR, …) to serve "various distros"** — exactly the
  per-distro maintenance burden Flatpak exists to avoid; the `.deb`/`.rpm` that Tauri bundles
  anyway already cover the two biggest native families.
- **Publishing the release immediately instead of as a draft** — one click less, but it would
  make the *pipeline* the releasing actor, contradicting ADR-0005's decision that a human
  performs releases.

## Sources / Prior art

- Tauri, *GitHub Actions pipeline* — the recommended `tauri-action` matrix (macOS split by
  architecture, `__VERSION__` substitution, draft releases):
  <https://tauri.app/distribute/pipelines/github/>
- Tauri, *Flatpak distribution guide* — GNOME 46 runtime, manifest installing the `.deb`,
  required `finish-args`: <https://github.com/tauri-apps/tauri-docs/blob/v2/src/content/docs/distribute/flatpak.mdx>
- `tauri-apps/tauri-action` — the official build-and-release action:
  <https://github.com/tauri-apps/tauri-action>
- `flatpak/flatpak-github-actions` — the Flatpak project's own builder action:
  <https://github.com/flatpak/flatpak-github-actions>
- Flatpak docs on runtimes as the distribution-independence mechanism:
  <https://docs.flatpak.org/en/latest/basic-concepts.html>

## Consequences

- Positive: pushing a tag yields a complete, versioned set of downloads (dmg ×2 architectures,
  msi, NSIS exe, deb, rpm, AppImage, flatpak) attached to a draft release the maintainer
  publishes; the process is reproducible and runs on clean runners; ADR-0004's pinning rules
  extend unchanged to the new workflow.
- Negative / trade-offs: unsigned binaries trigger Gatekeeper/SmartScreen warnings until signing
  lands; four runner jobs per release cost CI minutes (macOS runners are the expensive ones); the
  Flatpak manifest is one more artefact to keep in step with the app (runtime upgrades, new
  permissions); `tauri-action` and the Flatpak action become supply-chain dependencies —
  mitigated by SHA pinning and Dependabot.
- Follow-ups: code signing and macOS notarization once certificates exist; Flathub submission
  for discoverability; the release section in `CONTRIBUTING.md` gains the "push the tag, then
  publish the draft" step when this ADR is implemented; auto-update (Tauri updater) would be its
  own decision.
