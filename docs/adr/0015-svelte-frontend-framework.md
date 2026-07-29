# ADR-0015: Svelte 5 as the frontend framework

- **Status:** 🟡 proposed
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Records a decision already embodied in the code — `src-web/*.svelte`, `svelte ^5` and
  `@sveltejs/vite-plugin-svelte ^7` in `src-web/package.json` — but never written down. Documented
  retroactively so the ADR set matches the tree.

## Context

[ADR-0011](0011-rust-tauri-technology-base.md) fixed the technology base and described the frontend
as "**TypeScript + Vite** — canvas rendering and the surrounding UI". That names a language and a
bundler but no component model, and the gap has consequences: two ADRs already decided things that
only a component framework provides.

- [ADR-0013](0013-diff-overlay-covers-canvas.md) decides the file tree is "rendered recursively" and
  that the view mode "is held in state".
- [ADR-0014](0014-theming-css-variables-and-canvas-palette.md) decides the canvas palette is
  "selected from a `theme` prop" and that "`theme` is part of the render effect's dependencies".

Components, props, state and reactive effects are not part of "TypeScript + Vite". So either those
two ADRs rest on infrastructure nothing decided, or the framework choice has to be recorded. This
ADR records it.

The requirement is narrow and worth stating precisely, because it rules most candidates in or out.
The application's main content — the commit graph — is drawn imperatively on a `<canvas>` and must
not be re-rendered by a framework at all; the frame budget belongs to the canvas
([ADR-0010](0010-virtual-rendering.md)). What actually needs a component model is the surrounding
chrome: toolbar, the commit-detail sidebar, the changed-files list in two representations, the diff
viewer, the status bar and the theme toggle. That is ordinary stateful DOM, plus one genuinely
recursive view (the directory tree) and one place where a state change must trigger an imperative
repaint (the theme switch).

## Decision

We will build the frontend as **Svelte 5 single-file components**, compiled by
`@sveltejs/vite-plugin-svelte` inside the Vite build that ADR-0011 already established, using
Svelte 5's runes (`$state`, `$derived`, `$effect`, `$props`) for reactivity and `<script lang="ts">`
so TypeScript covers component code as well.

This complements ADR-0011 rather than replacing it: the technology base — Rust backend, Tauri shell,
TypeScript, Vite — is unchanged, and this ADR fills in the component model that decision left open.

The division of labour is part of the decision:

- **Svelte owns the DOM chrome** — sidebar, file list and recursive tree, diff viewer, toolbar,
  status bar, theme toggle.
- **Svelte does not own the graph.** The commit graph stays imperative canvas drawing. The framework
  passes it props and re-runs one effect when they change; it never diffs the graph itself.

## Alternatives considered

- **Vanilla TypeScript + Vite, no framework** — literally what ADR-0011 says, and it avoids a
  dependency entirely. But the chrome is stateful and grows: the recursive directory tree of
  ADR-0013 and the coordinated theme switch of ADR-0014 would be hand-written DOM construction and
  hand-tracked invalidation — precisely the code a compiler generates more reliably. The dependency
  buys removal of code, not addition.
- **React** — the largest ecosystem and the most available knowledge. But its virtual DOM is pure
  overhead for an application whose main surface is an imperatively drawn canvas, and it carries a
  runtime into a bundle where the graph, not the chrome, should own the budget.
- **Solid** — the closest competitor on the merits: fine-grained reactivity, no virtual DOM, very
  similar mental model to runes. Rejected on ecosystem size and because JSX adds a markup layer that
  Svelte's single-file components cover directly, with scoped styles that suit ADR-0014's token
  approach.
- **Vue** — a mature single-file-component model with comparable ergonomics, but a larger runtime
  than Svelte's compiled output and no advantage for a canvas-centric application.
- **Lit / native web components** — standards-based and minimal runtime, but no compile-time
  reactivity, and its templating is markedly more verbose for the tree and diff views.

## Sources / Prior art

- Svelte — the compiler-based approach (no virtual DOM) and Svelte 5 runes: <https://svelte.dev/>
- `@sveltejs/vite-plugin-svelte` — the supported Svelte/Vite integration:
  <https://github.com/sveltejs/vite-plugin-svelte>
- Solid — fine-grained reactivity without a virtual DOM, the closest alternative considered:
  <https://www.solidjs.com/>
- React — <https://react.dev/> · Vue — <https://vuejs.org/> · Lit — <https://lit.dev/>
- Tauri, *Frontend Configuration* — Tauri is frontend-agnostic and documents Svelte among the
  supported setups: <https://tauri.app/>

## Consequences

- Positive: ADR-0013's recursive tree and ADR-0014's repaint-on-theme-change are a few lines each
  instead of hand-rolled DOM plumbing; the compiled output ships no virtual-DOM runtime, so the
  frame budget stays with the canvas; single-file components keep each panel's markup, styles and
  logic together, and Svelte's scoped styles compose with the CSS custom properties from ADR-0014;
  `lang="ts"` extends type checking into the views.
- Negative / trade-offs: a framework dependency and a compile step that ADR-0011 did not foresee;
  runes are specific to Svelte 5, so a future major version is a migration rather than an upgrade;
  a smaller ecosystem and hiring pool than React; and the codebase deliberately runs two interaction
  models side by side — declarative chrome and an imperative canvas — which contributors have to
  keep straight.
- Follow-ups: the package manager and task runner that drives this build is decided in
  [ADR-0017](0017-bun-package-manager.md), and the split of the Rust backend in
  [ADR-0018](0018-adapter-git-as-separate-crate.md).
