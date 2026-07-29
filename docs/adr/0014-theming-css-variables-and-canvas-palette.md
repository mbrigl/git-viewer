# ADR-0014: Dark/light theming via CSS variables and a canvas palette

- **Status:** 🟡 proposed
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Transferred from the earlier Git Graph Viewer implementation (commit `fd64b3a`), where
  this decision was already in effect. Restated here in this repository's ADR format for review.

## Context

Colors were hardcoded as hex literals throughout the UI components and inside the canvas drawing
code. Adding a light mode requires a single source of truth for colors — but the application draws
in two fundamentally different ways: DOM chrome styled with CSS, and the commit graph drawn
imperatively on a `<canvas>`, which cannot cheaply read CSS custom properties per frame.

## Decision

We will introduce two coordinated mechanisms, switched together by a toggle in the status bar that
flips a `theme` state (`'dark' | 'light'`):

1. **DOM — CSS custom properties.** A token set is defined on `:root` (dark as the default) and
   overridden under `:root[data-theme='light']`. All component styles reference `var(--token)`. The
   active theme is written to `document.documentElement.dataset.theme` and persisted in
   `localStorage`; an inline script in `index.html` applies the stored theme before first paint to
   avoid a flash.
2. **Canvas — palette object.** The graph renderer keeps two explicit palette objects
   (`PALETTES.dark` / `PALETTES.light`) and selects one from a `theme` prop. `theme` is part of the
   render effect's dependencies, so the graph repaints on a switch. Branch colors are deliberately
   identical in both themes.

## Alternatives considered

- **Reading CSS variables from the canvas via `getComputedStyle`** — a single source of truth, but
  it forces a style resolution per read; caching it just reintroduces a second copy, only implicitly.
- **Following the OS setting via `prefers-color-scheme` only** — no toggle to build, but users often
  want the viewer to differ from their system theme, and the setting could not be overridden.
- **A CSS-only theme with the canvas left dark** — least work, but the graph is the main content;
  leaving it dark inside a light UI looks broken.

## Sources / Prior art

- MDN, *Using CSS custom properties* —
  <https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_cascading_variables/Using_CSS_custom_properties>
- MDN, `prefers-color-scheme` —
  <https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme>
- The Catppuccin palette family (Mocha as the dark default) —
  <https://github.com/catppuccin/catppuccin>

## Consequences

- Positive: one token vocabulary drives all DOM chrome, and light mode is a single override block;
  canvas and DOM stay visually consistent across themes; the theme survives a restart with no
  startup flash.
- Negative / trade-offs: colors are defined twice — CSS variables for the DOM and a JS palette for
  the canvas — and the two have to be kept in sync by hand; adding a third theme means touching both
  the `:root` overrides and the palette objects.
- Follow-ups: a follow-up ADR if the theme should additionally follow the OS setting by default.
