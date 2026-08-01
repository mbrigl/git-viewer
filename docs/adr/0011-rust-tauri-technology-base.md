# ADR-0011: Rust + Tauri as the implementation technology

- **Status:** 🟢 accepted
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Transferred from the earlier Git Graph Viewer implementation (commit `fd64b3a`), where
  this decision was already in effect. Restated here in this repository's ADR format for review;
  Rust/Tauri is the only implementation.

## Context

GitGraph is a desktop application that reads a local repository and draws a graph. That puts
three requirements on the technology base: fast, direct access to the local filesystem and to git;
a rendering surface flexible enough for a custom canvas-drawn graph with interactive overlays; and
distribution as a desktop application that a user can install without a separate runtime.

The choice constrains everything downstream — the git library, the rendering model, packaging, and
CI — so it belongs in an ADR before any code depends on it.

## Decision

We will build the application on **Rust + Tauri**:

- **Backend (Rust)** — repository loading and the layout algorithms; talks to git through a native
  library (see [ADR-0012](0012-git2-on-spawn-blocking.md)).
- **Frontend (TypeScript + Vite)** — canvas rendering and the surrounding UI, running in the Tauri
  WebView and communicating with the backend through Tauri commands and events. The component
  framework is not decided here; see [ADR-0015](0015-svelte-frontend-framework.md).

## Alternatives considered

- **Electron** — the same web-UI flexibility and a much larger ecosystem, but it ships a full
  Chromium per application: a large download and a heavy resident footprint for a graph viewer.
- **A native Rust GUI toolkit (egui, iced, GTK bindings)** — no WebView dependency and one language
  throughout, but the toolkits are less mature for rich text, diff views, and CSS-level styling, and
  each brings its own platform quirks.
- **A pure web application** — no installation at all, but the browser cannot read a local git
  repository directly, which defeats the purpose.

## Sources / Prior art

- Tauri — architecture and platform requirements: <https://tauri.app/>
- Electron — <https://www.electronjs.org/>
- Comparison of WebView-based shells and their footprint, from the Tauri documentation's
  *Why Tauri* material.

## Consequences

- Positive: a native desktop application with no separate runtime for the user, and a small binary
  compared with a bundled Chromium; the web frontend gives full freedom for canvas rendering and
  overlay UI; the Rust backend keeps loading and layout fast and typed.
- Negative / trade-offs: two languages and a serialisation boundary between them; the WebView is the
  system's, so rendering can differ across platforms and OS versions; Tauri's platform prerequisites
  (WebView2, webkit2gtk) must be present on developer and CI machines.
- Follow-ups: packaging and release artefacts per platform will need their own decision once the
  application is shipped.
