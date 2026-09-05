<script lang="ts">
  // The repository sidebar (ADR-0021): local branches, remote branches grouped
  // by remote, working trees, and tags. It navigates and nothing else — the
  // specification's "Not a git client" Non-Goal rules out checkout, fetch, and
  // every other write, however much the layout invites them.
  import { countLeaves, filterByName, groupByFolder } from './refTree.ts';
  import type { RefFolder } from './refTree.ts';
  import type { RepoRefs } from './types.ts';

  interface Props {
    repoRefs: RepoRefs | null;
    /** SHAs present in the loaded graph; a ref outside it has nowhere to jump to. */
    loadedShas: Set<string>;
    onJump: (sha: string) => void;
  }
  let { repoRefs, loadedShas, onJump }: Props = $props();

  // Glyphs as bare path data: the collapsed rail shows nothing but these, so
  // every one of them has to be recognisable without its label next to it.
  const ICON_BRANCH =
    'M11.5 2a2.5 2.5 0 00-.86 4.85A2.5 2.5 0 018.15 9H6.5a2.5 2.5 0 00-1.5.5V6.35a2.5 2.5 0 10-1 0v3.3a2.5 2.5 0 101 .17A1.5 1.5 0 016.5 10h1.65a3.5 3.5 0 003.48-3.15A2.5 2.5 0 0011.5 2z';
  const ICON_CLOUD = 'M4.5 12a3.5 3.5 0 01-.36-6.98A4.5 4.5 0 0112.9 6.1 3 3 0 0112.5 12h-8z';
  const ICON_TREE =
    'M1.5 3A1.5 1.5 0 013 1.5h10A1.5 1.5 0 0114.5 3v7a1.5 1.5 0 01-1.5 1.5H9.5V13h2v1h-7v-1h2v-1.5H3A1.5 1.5 0 011.5 10V3z';
  const ICON_TAG =
    'M2 2h5.2a1.5 1.5 0 011.06.44l5.3 5.3a1.5 1.5 0 010 2.12l-3.7 3.7a1.5 1.5 0 01-2.12 0l-5.3-5.3A1.5 1.5 0 012 7.2V2zm2.75 1.5a1.25 1.25 0 100 2.5 1.25 1.25 0 000-2.5z';
  const ICON_FOLDER =
    'M1.5 3.5A1.5 1.5 0 013 2h3l1.5 1.5H13A1.5 1.5 0 0114.5 5v6.5A1.5 1.5 0 0113 13H3a1.5 1.5 0 01-1.5-1.5v-8z';

  /** One row of the sidebar, whatever ref category it came from. */
  interface Entry {
    /** Full slash-separated name — what grouping and filtering work on. */
    name: string;
    sha: string;
    shortSha: string;
    /** Marks the checked-out branch. */
    isHead: boolean;
    /** Trailing annotation: ahead/behind counts, or a worktree's branch. */
    badge: string;
    /** Tooltip: the upstream, or a worktree's path. */
    title: string;
    /** Glyph path, so a row reads as its category without its section in view. */
    icon: string;
  }

  function entry(name: string, sha: string, shortSha: string, rest: Partial<Entry> = {}): Entry {
    return { name, sha, shortSha, isHead: false, badge: '', title: '', icon: ICON_BRANCH, ...rest };
  }

  // Ahead/behind is only meaningful where there is an upstream, and a branch
  // level with it earns no badge at all — zeros would be noise on every row.
  function trackingBadge(ahead: number, behind: number): string {
    const parts: string[] = [];
    if (ahead > 0) parts.push(`${ahead}↑`);
    if (behind > 0) parts.push(`${behind}↓`);
    return parts.join(' ');
  }

  const locals = $derived(
    (repoRefs?.locals ?? []).map(b =>
      entry(b.name, b.sha, b.shortSha, {
        isHead: b.isHead,
        badge: trackingBadge(b.ahead, b.behind),
        title: b.upstream ? `tracks ${b.upstream}` : 'no upstream configured',
      }),
    ),
  );

  const remotes = $derived(
    (repoRefs?.remotes ?? []).map(remote => ({
      name: remote.name,
      entries: remote.branches.map(b => entry(b.name, b.sha, b.shortSha)),
    })),
  );

  const worktrees = $derived(
    (repoRefs?.worktrees ?? []).map(w =>
      entry(w.name, w.sha, w.shortSha, {
        badge: w.branch ?? 'detached',
        title: w.path,
        icon: ICON_TREE,
      }),
    ),
  );

  const tags = $derived(
    (repoRefs?.tags ?? []).map(t => entry(t.name, t.sha, t.shortSha, { icon: ICON_TAG })),
  );

  // ── Filter ────────────────────────────────────────────────────────────────
  let filter = $state('');

  function visible(entries: Entry[]): Entry[] {
    return filterByName(entries, filter);
  }

  function tree(entries: Entry[]): RefFolder<Entry> {
    return groupByFolder(visible(entries));
  }

  // ── Sections ──────────────────────────────────────────────────────────────
  // Titles, glyphs and counts in one place: the expanded headers and the
  // collapsed rail render the same four sections and must not drift apart.
  const sections = $derived([
    { key: 'local', title: 'Local', icon: ICON_BRANCH, count: visible(locals).length },
    {
      key: 'remote',
      title: 'Remote',
      icon: ICON_CLOUD,
      count: remotes.reduce((n, r) => n + visible(r.entries).length, 0),
    },
    { key: 'worktrees', title: 'Worktrees', icon: ICON_TREE, count: visible(worktrees).length },
    { key: 'tags', title: 'Tags', icon: ICON_TAG, count: visible(tags).length },
  ]);

  // ── Minimised state ───────────────────────────────────────────────────────
  // Minimising trades the lists for a rail of section glyphs, so the graph gets
  // the width back without losing the way back in. Remembered across sessions,
  // like the diff viewer's layout choice.
  const storedCollapsed =
    typeof localStorage !== 'undefined' ? localStorage.getItem('sidebar') : null;
  let collapsed = $state(storedCollapsed === 'collapsed');

  $effect(() => {
    try {
      localStorage.setItem('sidebar', collapsed ? 'collapsed' : 'expanded');
    } catch {
      /* ignore */
    }
  });

  function toggleCollapsed(): void {
    collapsed = !collapsed;
    // The filter field goes away with the lists, and a filter nobody can see
    // must not silently thin the rail's counts.
    if (collapsed) filter = '';
  }

  /** From the rail, a glyph is the only way back — so it expands *and* opens. */
  function openFromRail(key: string): void {
    collapsed = false;
    openSections[key] = true;
  }

  // ── Collapse state ────────────────────────────────────────────────────────
  // Local branches are what a user reaches for first, so that section starts
  // open and the rest stay out of the way until asked for.
  let openSections = $state<Record<string, boolean>>({
    local: true,
    remote: false,
    worktrees: false,
    tags: false,
  });

  // Folders and remotes are open unless explicitly closed, so a fresh repository
  // shows its structure rather than a wall of collapsed rows.
  let closed = $state<Record<string, boolean>>({});

  function toggleSection(key: string): void {
    openSections[key] = !openSections[key];
  }

  function toggleGroup(key: string): void {
    closed[key] = !closed[key];
  }

  /** A filter hides the collapse state: every match should be visible at once. */
  function groupOpen(key: string): boolean {
    return filter.trim() !== '' || !closed[key];
  }

  function canJump(sha: string): boolean {
    return sha !== '' && loadedShas.has(sha);
  }

  function jump(sha: string): void {
    if (canJump(sha)) onJump(sha);
  }
</script>

<!-- A leaf row. Rows whose commit is outside the loaded graph stay inert: at the
     commit limit a ref can point at history that was never read (ADR-0009), and
     a button that silently does nothing is worse than one that says why. -->
{#snippet leafRow(label: string, item: Entry, depth: number)}
  {@const reachable = canJump(item.sha)}
  <button
    class="row leaf"
    class:head={item.isHead}
    class:unreachable={!reachable}
    style="padding-left: {8 + depth * 12}px"
    disabled={!reachable}
    title={reachable
      ? [item.name, item.title].filter(Boolean).join(' — ')
      : `${item.name} — outside the loaded history`}
    onclick={() => jump(item.sha)}
  >
    <svg class="glyph" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d={item.icon} />
    </svg>
    <span class="label">{label}</span>
    {#if item.badge}<span class="badge">{item.badge}</span>{/if}
    <span class="sha">{item.shortSha}</span>
  </button>
{/snippet}

<!-- Recursive: a folder renders its subfolders, then its own entries. -->
{#snippet folderTree(folder: RefFolder<Entry>, keyPrefix: string, depth: number)}
  {#each folder.folders as sub (sub.path)}
    {@const key = `${keyPrefix}/${sub.path}`}
    <button
      class="row folder"
      style="padding-left: {8 + depth * 12}px"
      onclick={() => toggleGroup(key)}
    >
      <span class="caret" class:open={groupOpen(key)}>›</span>
      <svg class="glyph" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
        <path d={ICON_FOLDER} />
      </svg>
      <span class="label">{sub.name}</span>
      <span class="count">{countLeaves(sub)}</span>
    </button>
    {#if groupOpen(key)}
      {@render folderTree(sub, key, depth + 1)}
    {/if}
  {/each}

  {#each folder.leaves as leaf (leaf.item.name)}
    {@render leafRow(leaf.label, leaf.item, depth)}
  {/each}
{/snippet}

{#snippet section(key: string)}
  {@const meta = sections.find(s => s.key === key)!}
  <button class="row section" onclick={() => toggleSection(key)}>
    <span class="caret" class:open={openSections[key]}>›</span>
    <svg class="glyph" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d={meta.icon} />
    </svg>
    <span class="label">{meta.title}</span>
    <span class="count">{meta.count}</span>
  </button>
{/snippet}

<aside id="repo-sidebar" class:collapsed>
  <div class="bar">
    {#if !collapsed}
      <div class="filter">
        <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path
            fill-rule="evenodd"
            d="M11.5 7a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zm-.82 4.74a6 6 0 111.06-1.06l2.79 2.79-1.06 1.06-2.79-2.79z"
          />
        </svg>
        <input type="text" placeholder="Filter" bind:value={filter} aria-label="Filter refs" />
      </div>
    {/if}
    <button
      class="collapse-btn"
      onclick={toggleCollapsed}
      title={collapsed ? 'Expand the sidebar' : 'Minimise the sidebar'}
      aria-label={collapsed ? 'Expand the sidebar' : 'Minimise the sidebar'}
      aria-expanded={!collapsed}
    >
      <span class="chevron" class:flipped={collapsed}>‹</span>
    </button>
  </div>

  {#if collapsed}
    <!-- Minimised: glyphs only. Each is a way back in — it expands the sidebar
         and opens its own section, so the rail is never a dead end. -->
    <div class="rail">
      {#each sections as item (item.key)}
        <button
          class="rail-btn"
          onclick={() => openFromRail(item.key)}
          title="{item.title} ({item.count})"
          aria-label="{item.title} ({item.count})"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d={item.icon} />
          </svg>
          {#if item.count > 0}<span class="rail-count">{item.count}</span>{/if}
        </button>
      {/each}
    </div>
  {:else}
  <div class="sections">
    {@render section('local')}
    {#if openSections.local}
      {@render folderTree(tree(locals), 'local', 1)}
    {/if}

    {@render section('remote')}
    {#if openSections.remote}
      {#each remotes as remote (remote.name)}
        {@const key = `remote/${remote.name}`}
        <button class="row folder" style="padding-left: 20px" onclick={() => toggleGroup(key)}>
          <span class="caret" class:open={groupOpen(key)}>›</span>
          <svg class="glyph" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d={ICON_CLOUD} />
          </svg>
          <span class="label">{remote.name}</span>
          <span class="count">{visible(remote.entries).length}</span>
        </button>
        {#if groupOpen(key)}
          {@render folderTree(tree(remote.entries), key, 2)}
        {/if}
      {/each}
    {/if}

    {@render section('worktrees')}
    {#if openSections.worktrees}
      {#each visible(worktrees) as wt (wt.name)}
        {@render leafRow(wt.name, wt, 1)}
      {/each}
    {/if}

    {@render section('tags')}
    {#if openSections.tags}
      {@render folderTree(tree(tags), 'tags', 1)}
    {/if}
  </div>
  {/if}
</aside>

<style>
  #repo-sidebar {
    width: 240px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border-right: 1px solid var(--border);
    overflow: hidden;
    transition: width var(--transition);
  }

  /* Minimised: wide enough for a glyph and its count, nothing more. */
  #repo-sidebar.collapsed {
    width: 40px;
  }

  .bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px;
    flex-shrink: 0;
  }

  .collapse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 26px;
    flex-shrink: 0;
    background: none;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-dim);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
  }

  .collapse-btn:hover {
    background: var(--bg-hover);
    color: var(--text-bright);
  }

  .chevron {
    display: inline-block;
    transition: transform var(--transition);
  }

  .chevron.flipped {
    transform: rotate(180deg);
  }

  /* ── Minimised rail ─────────────────────────────────────────────────────── */
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }

  .rail-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    background: none;
    border: none;
    border-radius: var(--radius-md);
    color: var(--text-muted);
    cursor: pointer;
  }

  .rail-btn:hover {
    background: var(--bg-hover);
    color: var(--text-bright);
  }

  .rail-btn svg {
    width: 15px;
    height: 15px;
  }

  /* The count rides the glyph's corner — the rail has no room for a column. */
  .rail-count {
    position: absolute;
    right: 1px;
    bottom: 1px;
    font-size: 8px;
    line-height: 1;
    padding: 1px 2px;
    border-radius: var(--radius-xs);
    background: var(--bg-elev);
    color: var(--text-dim);
  }

  .filter {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
    min-width: 0;
    padding: 0 8px;
    height: 26px;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
  }

  .filter svg {
    width: 12px;
    height: 12px;
    color: var(--text-dim);
    flex-shrink: 0;
  }

  .filter input {
    flex: 1;
    min-width: 0;
    background: none;
    border: none;
    outline: none;
    color: var(--text);
    font-family: inherit;
    font-size: 12px;
  }

  .filter input::placeholder {
    color: var(--text-dim);
  }

  .sections {
    flex: 1;
    overflow-y: auto;
    padding-bottom: 8px;
  }

  .row {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    height: 24px;
    padding: 0 8px;
    background: none;
    border: none;
    color: var(--text-2);
    font-family: inherit;
    font-size: 12px;
    text-align: left;
    cursor: pointer;
  }

  .row:hover:not(:disabled) {
    background: var(--bg-hover);
  }

  .row.section {
    height: 26px;
    color: var(--text-dim);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    border-top: 1px solid var(--border);
    margin-top: 4px;
  }

  .row.folder {
    color: var(--text-muted);
  }

  .row.head {
    background: var(--accent-bg);
    color: var(--accent);
    font-weight: 600;
  }

  .row.head:hover:not(:disabled) {
    background: var(--accent-bg-strong);
  }

  /* A ref beyond the commit limit has no row to reveal — say so by greying it
     out rather than offering a click that cannot do anything. */
  .row.unreachable {
    color: var(--text-faint);
    cursor: default;
  }

  .caret {
    display: inline-block;
    width: 10px;
    flex-shrink: 0;
    color: var(--text-dim);
    transition: transform 0.12s;
  }

  .caret.open {
    transform: rotate(90deg);
  }

  .glyph {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    color: var(--text-dim);
  }

  .row.head .glyph {
    color: var(--accent);
  }

  .label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge,
  .count,
  .sha {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--text-dim);
  }

  .sha {
    font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
    color: var(--text-dimmer);
  }

  .row.head .badge {
    color: var(--accent);
  }
</style>
