# ADR-0016: Local-by-default frontend — avatars opt-in, hardened WebView surface

- **Status:** 🟢 accepted
- **Date:** 2026-07-31
- **Deciders:** Maintainer
- **Note:** This ADR *changes* current behaviour rather than recording it. The code today fetches
  avatars from a third party unconditionally and ships an unrestricted WebView configuration; both
  were introduced without a decision record. Nothing is implemented until this ADR is accepted.
  Revised on 2026-07-31 before acceptance: the first draft removed the Gravatar integration
  outright; this revision keeps it behind an opt-in setting instead. The WebView hardening is
  unchanged from the first draft.

## Context

[`docs/SPECIFICATION.md`](../SPECIFICATION.md) frames the product as strictly local: the vision is
"a desktop application that opens any local repository", and the **Non-Goals** rule out "hosting-platform
integration" and remote repositories outright. Everything the application needs, it reads from the
filesystem through git2 ([ADR-0012](0012-git2-on-spawn-blocking.md)).

Two things in the tree contradict that framing, and they reinforce each other.

**Egress.** `crates/adapter-git/src/graph.rs` builds a Gravatar URL for every commit's author *and*
committer — `https://www.gravatar.com/avatar/<md5(email)>?d=404&s=80` — and the sidebar loads them as
`<img>` elements. Opening a repository therefore discloses an MD5 hash of every contributor's email
address, plus the reader's IP and timing, to a third party the user never chose. MD5 of an email is
not anonymising: for any address you can guess, you can confirm it. This is the only network traffic
the application generates, and it requires the `md5` crate — a dependency that is itself ADR-gated
(`AGENTS.md` §7).

**WebView surface.** `src-tauri/tauri.conf.json` currently sets:

- `"csp": null` — no Content-Security-Policy at all, so the WebView may load and connect anywhere.
- `assetProtocol.scope: ["**"]` with the protocol enabled — the frontend may read *any* path on the
  filesystem through `asset://`.
- `withGlobalTauri: true` — the whole Tauri API is injected into `window`.

Checking what the frontend actually uses settles most of this: it accesses Tauri exclusively through
ES imports (`@tauri-apps/api/core`, `@tauri-apps/api/event`), and there is **no** use of
`convertFileSrc`, `asset://` or `window.__TAURI__` anywhere in `src-web/`. Two of the three
permissions are therefore granted for functionality nothing requests. The open CSP is the exception:
it is what currently allows the avatar requests to succeed.

The capability set is already minimal (`core:default` only), so the WebView-level configuration is
where the remaining surface sits.

The privacy problem with the avatars is not the feature itself but its unconditional nature: the
disclosure happens on every repository open, without the user ever being asked. Avatars are a real
piece of polish the maintainer wants to keep.

## Decision

We will make the frontend **local by default and grant it nothing it does not use**.

1. **Avatars become opt-in, default off.** A UI toggle ("Load avatars from Gravatar") controls
   whether the sidebar renders avatar `<img>` elements at all; while the toggle is off — the
   default — no avatar URL is ever dereferenced, so opening a repository generates zero network
   traffic. The setting persists in `localStorage`, the same mechanism the theme toggle already
   uses, so no new settings surface is required. The initials rendering remains the default and
   the fallback. The avatar hash switches from MD5 to **SHA-256**, which Gravatar supports
   natively; the ADR-gated `md5` crate is replaced by `sha2`. (SHA-256 does not change the
   disclosure — an email hash still identifies a guessable address — but the disclosure now only
   happens with the user's explicit consent.)
2. **Enforce a restrictive CSP** instead of `null`, permitting what the bundled frontend needs
   (its own scripts, styles and inline theme bootstrap) and exactly one external origin:
   `img-src https://www.gravatar.com`, the single grant the opt-in feature needs.
3. **Disable the asset protocol**, since nothing uses it. Should a future feature need file access
   from the WebView, it is re-enabled with a scope narrowed to that feature — never `**`.
4. **Set `withGlobalTauri: false`**, since the frontend imports the API as modules.

The rule this establishes: the WebView is granted a capability only when a concrete, present feature
needs it, and the grant is scoped to that need. The Gravatar origin in the CSP is such a grant — it
permits image loads and nothing else, and no load occurs unless the user turns the feature on.

## Alternatives considered

- **Remove the Gravatar integration entirely** — the first draft of this ADR. Simplest possible
  privacy story (provably zero network traffic) and it drops the CSP exception too. Rejected: the
  avatars are a deliberate piece of polish the maintainer wants to keep, and the opt-in default
  achieves the same at-rest behaviour — a fresh install makes no requests — while preserving the
  feature for users who choose it.
- **Keep Gravatar unconditionally and document the exception** — no work, and avatars stay. But it
  makes a local-only tool phone home about third parties who never consented, on every repository
  open. The disclosure is the problem; documenting it does not obtain consent.
- **Proxy the avatar requests through the Rust backend** — keeps the WebView CSP entirely free of
  external origins, but hides the reader's IP behind nothing (the backend makes the same request)
  and adds an HTTP client to a local application. The CSP `img-src` grant is narrower than a new
  network-capable dependency.
- **Hash with something stronger than MD5 as the privacy fix** — a misreading of the problem. The
  disclosure is the issue, not the hash function. The switch to SHA-256 decided above is a
  dependency cleanup (dropping the ADR-gated `md5` crate), not a privacy measure.
- **Keep `assetProtocol` and `withGlobalTauri` as they are** — costs nothing today and might save a
  configuration change later. Rejected: they are live permissions for absent features, and "we might
  need it" is exactly the speculative justification `AGENTS.md` §1 rules out.

## Sources / Prior art

- Tauri, *Security* — capabilities, the CSP configuration and the asset-protocol scope:
  <https://tauri.app/security/>
- MDN, *Content-Security-Policy* —
  <https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy>
- Gravatar's protocol: the account identifier is a hash of the lowercased email address; both MD5
  and SHA-256 are supported — <https://docs.gravatar.com/api/avatars/images/>
- OWASP, *Least privilege* as applied to browser-hosted UIs —
  <https://cheatsheetseries.owasp.org/cheatsheets/Secure_Product_Design_Cheat_Sheet.html>

## Consequences

- Positive: a fresh install makes no network requests at all, which matches the specification's
  local framing and is a property that can be tested (open a repository with the toggle off,
  observe zero requests); contributor email hashes leave the machine only after explicit user
  consent; a strict CSP turns a future accidental egress into a visible failure instead of silent
  traffic — the only permitted external load is Gravatar images; the WebView loses filesystem-wide
  read access and an injected global API it never used; the ADR-gated `md5` dependency disappears
  (replaced by `sha2`).
- Negative / trade-offs: the CSP permits the Gravatar origin permanently, even while the setting is
  off — accepted because an origin permission without a rendered `<img>` produces no request, and a
  toggle-conditional CSP is not expressible in a static `tauri.conf.json`; users who enable the
  toggle accept the disclosure the Context describes, and the toggle's labelling must make that
  plain; the CSP must be maintained as the frontend grows, and a too-strict policy fails at runtime
  in ways that are easy to misdiagnose; re-enabling the asset protocol later is a configuration
  change plus a new scope decision.
- Follow-ups: a user-visible change, so the `[Unreleased]` section of
  [`CHANGELOG.md`](../../CHANGELOG.md) records the opt-in default and the hardening when this is
  implemented ([ADR-0005](0005-versioning-and-releases.md)). The specification's Non-Goals gain a
  clarification that the opt-in avatar fetch is the application's only network communication and
  that the default is none. If avatars ever need a richer settings surface (per-repository,
  size options), that is a new decision, not a revert of this one.
