<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { onMount } from 'svelte';
  import GraphCanvas, { EMPTY_GRAPH_WIDTH, REFS_WIDTH, graphAreaWidth } from './GraphCanvas.svelte';
  import DiffViewer from './DiffViewer.svelte';
  import SearchBox from './SearchBox.svelte';
  import CommitDetail from './CommitDetail.svelte';
  import RepoSidebar from './RepoSidebar.svelte';
  import StatusBar, { READY_STATUS } from './StatusBar.svelte';
  import { lineageRows } from './ancestry.ts';
  import type { GraphData, NodeJson, FileChange, DiffLine, RepoRefs } from './types.ts';

  // ── Theme ────────────────────────────────────────────────────────────────
  type Theme = 'dark' | 'light';
  const storedTheme = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
  let theme = $state<Theme>(storedTheme === 'light' ? 'light' : 'dark');

  $effect(() => {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('theme', theme); } catch { /* ignore */ }
  });

  function toggleTheme(): void {
    theme = theme === 'dark' ? 'light' : 'dark';
  }

  // ── Avatars — opt-in, default off (ADR-0016) ─────────────────────────────
  const storedAvatars = typeof localStorage !== 'undefined' ? localStorage.getItem('avatars') : null;
  let showAvatars = $state(storedAvatars === 'on');

  $effect(() => {
    try { localStorage.setItem('avatars', showAvatars ? 'on' : 'off'); } catch { /* ignore */ }
  });

  function toggleAvatars(): void {
    showAvatars = !showAvatars;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let graphData       = $state<GraphData | null>(null);
  let repoRefs        = $state<RepoRefs | null>(null);
  let status          = $state(READY_STATUS);
  let repoLabel       = $state('(no repository)');
  let currentRepoPath = $state<string | null>(null);
  let selectedNode    = $state<NodeJson | null>(null);
  let graphCanvas     = $state<{ revealRow: (row: number) => void; clearSelection: () => void } | null>(null);
  let searchBox       = $state<{ focusSearch: () => void } | null>(null);
  const nodeBySha     = $derived(new Map((graphData?.nodes ?? []).map(n => [n.sha, n])));
  const nodeByRow     = $derived(new Map((graphData?.nodes ?? []).map(n => [n.row, n])));
  // Lineage highlight: rows of the selected commit, its loaded ancestors, and
  // its descendants; null (no selection) means nothing is dimmed.
  const highlightRows = $derived(selectedNode ? lineageRows(selectedNode, nodeBySha) : null);
  // Width of the graph lane area — the column header mirrors the canvas layout.
  const graphColWidth = $derived.by(() => {
    const nodes = graphData?.nodes ?? [];
    if (nodes.length === 0) return EMPTY_GRAPH_WIDTH;
    let maxCol = 0;
    for (const n of nodes) if (n.col > maxCol) maxCol = n.col;
    return graphAreaWidth(maxCol);
  });
  let changedFiles    = $state<FileChange[]>([]);

  let diffLines       = $state<DiffLine[]>([]);
  let diffFile        = $state<string | null>(null);
  let diffLoading     = $state(false);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  /** True when the key event targets a text-editing element — those keep
      their native key handling and are excluded from graph shortcuts. */
  function isEditableTarget(e: KeyboardEvent): boolean {
    const t = e.target as HTMLElement | null;
    return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  }

  /** Escape: deselect the commit, which also lifts the ancestry dim. */
  function clearSelection(): void {
    selectedNode = null;
    changedFiles = [];
    diffFile = null;
    diffLines = [];
    graphCanvas?.clearSelection();
  }

  /** ↑/↓: step the selection one row; ↓ with nothing selected starts at row 0. */
  function moveSelection(delta: 1 | -1): void {
    if (!graphData || graphData.nodes.length === 0) return;
    const node = nodeByRow.get(selectedNode ? selectedNode.row + delta : 0);
    if (!node) return;
    graphCanvas?.revealRow(node.row);
    onSelectCommit(node.sha);
  }

  /** Global shortcuts: Ctrl/Cmd+F focuses the search field; Escape closes the
      diff overlay, then clears the selection; ↑/↓ walk the commit rows. */
  function onWindowKeydown(e: KeyboardEvent): void {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      searchBox?.focusSearch();
      return;
    }
    if (isEditableTarget(e)) return;
    if (e.key === 'Escape') {
      if (diffFile !== null) closeDiff();
      else clearSelection();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveSelection(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveSelection(-1);
    }
  }

  // ── Tauri event listeners ──────────────────────────────────────────────────
  onMount(() => {
    const unlisten = Promise.all([
      listen<string>('load-graph', (e) => {
        try {
          graphData = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
          // Rows are reassigned on every load, so a selection from the previous
          // graph would point at the wrong node (and dim the wrong ancestry).
          selectedNode = null;
          changedFiles = [];
        } catch {
          status = 'Error parsing graph data';
        }
      }),
      // Refs come from the same repository read as the graph (ADR-0021), so the
      // sidebar never describes a different state than the commits on screen.
      listen<string>('load-refs', (e) => {
        try {
          repoRefs = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
        } catch {
          repoRefs = null;
        }
      }),
      listen<string>('set-status',     (e) => { status = e.payload; }),
      listen<string>('commit-files', (e) => {
        try {
          changedFiles = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
        } catch { changedFiles = []; }
      }),
      listen<string>('set-repo-label', (e) => {
        repoLabel       = e.payload || '(no repository)';
        currentRepoPath = e.payload;
      }),
    ]);
    return () => { unlisten.then(fns => fns.forEach(fn => fn())); };
  });

  // ── Actions ────────────────────────────────────────────────────────────────
  async function browseRepo(): Promise<void> {
    status = 'Selecting repository…';
    await invoke('browse_repo').catch((e: unknown) => { status = 'Error: ' + e; });
  }

  async function refreshRepo(): Promise<void> {
    if (!currentRepoPath) return;
    status = 'Refreshing…';
    await invoke('open_repo', { path: currentRepoPath }).catch((e: unknown) => { status = 'Error: ' + e; });
  }

  function onSelectCommit(sha: string): void {
    const node = nodeBySha.get(sha) ?? null;
    selectedNode = node;
    changedFiles = [];
    diffFile = null;
    diffLines = [];
    invoke('select_commit', { sha }).catch(() => {});
  }

  /** Jump to a node from the sidebar's parent/child links or a search hit. */
  function jumpToSha(sha: string): void {
    const node = nodeBySha.get(sha);
    if (!node) return;
    graphCanvas?.revealRow(node.row);
    onSelectCommit(sha);
  }

  async function onSelectFile(file: FileChange): Promise<void> {
    if (!selectedNode) return;
    diffFile = file.path;
    diffLines = [];
    diffLoading = true;
    try {
      const json = await invoke<string>('get_file_diff', { sha: selectedNode.sha, filePath: file.path });
      diffLines = typeof json === 'string' ? JSON.parse(json) : json;
    } catch (e) {
      diffLines = [];
    } finally {
      diffLoading = false;
    }
  }

  function closeDiff(): void {
    diffFile = null;
    diffLines = [];
  }
</script>

<!-- ── Titlebar / Toolbar ─────────────────────────────────────────────────── -->
<div id="titlebar">
  <div id="titlebar-left">
    <svg class="logo-icon" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" stroke="#4caf7d" stroke-width="2"/>
      <circle cx="12" cy="8"  r="2"  fill="#4caf7d"/>
      <circle cx="7"  cy="14" r="2"  fill="#89b4fa"/>
      <circle cx="17" cy="14" r="2"  fill="#fab387"/>
      <line x1="12" y1="10" x2="7"  y2="14" stroke="#4caf7d" stroke-width="1.5"/>
      <line x1="12" y1="10" x2="17" y2="14" stroke="#4caf7d" stroke-width="1.5"/>
    </svg>
    <span class="app-name">GitGraph</span>
  </div>

  <div id="titlebar-center">
    <button class="tb-btn primary" onclick={browseRepo}>
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M1 3.5A1.5 1.5 0 012.5 2h3.672a1.5 1.5 0 011.06.44l.94.94H13.5A1.5 1.5 0 0115 5v7.5a1.5 1.5 0 01-1.5 1.5h-11A1.5 1.5 0 011 12.5v-9z"/>
      </svg>
      Open Repo
    </button>
    <button class="tb-btn" onclick={refreshRepo}>
      <svg viewBox="0 0 16 16" fill="currentColor">
        <path d="M11.534 7h3.932a.25.25 0 01.192.41l-1.966 2.36a.25.25 0 01-.384 0l-1.966-2.36a.25.25 0 01.192-.41zm-11 2h3.932a.25.25 0 00.192-.41L2.692 6.23a.25.25 0 00-.384 0L.342 8.59A.25.25 0 00.534 9z"/>
        <path fill-rule="evenodd" d="M8 3c-1.552 0-2.94.707-3.857 1.818a.5.5 0 11-.771-.636A6.002 6.002 0 0113.917 7H12.9A5.002 5.002 0 008 3zM3.1 9a5.002 5.002 0 008.757 2.182.5.5 0 11.771.636A6.002 6.002 0 012.083 9H3.1z"/>
      </svg>
      Refresh
    </button>

    <div class="repo-breadcrumb">
      <svg viewBox="0 0 16 16" fill="#4caf7d" class="repo-icon">
        <path d="M2.6 10.59L8 5.207l5.4 5.38.8-.795-6.2-6.187-6.2 6.187.8.795z"/>
      </svg>
      <span class="repo-path">{repoLabel}</span>
    </div>
  </div>

  <div id="titlebar-right">
    <SearchBox bind:this={searchBox} nodes={graphData?.nodes ?? []} onJump={jumpToSha} />
  </div>
</div>

<svelte:window onkeydown={onWindowKeydown} />

<!-- ── Main content area ──────────────────────────────────────────────────── -->
<div id="main">
  <div id="top-pane">
    <RepoSidebar {repoRefs} loadedShas={new Set(nodeBySha.keys())} onJump={jumpToSha} />

    <div id="graph-pane">
      <!-- Column header — inside the graph pane so it shares the canvas width,
           with the graph column tracking the canvas's dynamic lane width. -->
      <div id="col-header">
        <span class="col-refs" style="width: {REFS_WIDTH}px">Branch / Tag</span>
        <span class="col-graph" style="width: {graphColWidth + 8}px">Graph</span>
        <span class="col-sha">SHA</span>
        <span class="col-desc">Description</span>
      </div>

      <div id="canvas-container">
        <GraphCanvas bind:this={graphCanvas} {graphData} {onSelectCommit} {theme} {highlightRows} />

        {#if diffFile !== null}
          <div id="diff-overlay">
            {#if diffLoading}
              <div class="diff-loading">
                <div class="spinner"></div>
                <span>Loading diff…</span>
              </div>
            {:else}
              <DiffViewer lines={diffLines} filePath={diffFile} onClose={closeDiff} />
            {/if}
          </div>
        {/if}
      </div>
    </div><!-- end #graph-pane -->

    <CommitDetail
      node={selectedNode}
      {nodeBySha}
      {showAvatars}
      {changedFiles}
      {diffFile}
      {onSelectFile}
      onJumpToSha={jumpToSha}
    />
  </div><!-- end #top-pane -->
</div><!-- end #main -->

<StatusBar
  {status}
  {theme}
  {showAvatars}
  onToggleTheme={toggleTheme}
  onToggleAvatars={toggleAvatars}
/>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  /* ── Theme tokens (dark default) ───────────────────────────────────────── */
  :global(:root) {
    --bg-app: #1a1d23;
    --bg-chrome: #13151a;
    --bg-panel: #0f1117;
    --bg-hover: #1e2128;
    --bg-elev: #2a2d35;
    --bg-sel: #1a2535;

    --border: #2a2d35;
    --border-strong: #383b45;
    --border-hover: #4a4d58;
    --btn-hover-bg: #33363f;
    --shadow: #00000070;

    --text-brightest: #e8eaf0;
    --text-bright: #e0e3e9;
    --text: #d0d3d9;
    --text-2: #c0c3ca;
    --text-muted: #8b8fa8;
    --text-dim: #5a5e6e;
    --text-dimmer: #4a4e5e;
    --text-faint: #3a3e4e;

    --accent: #4caf7d;
    --accent-bright: #5cc48d;
    --accent-bg: #1a3a22;
    --accent-border: #2a5a34;
    --accent-bg-strong: #1e4d32;
    --accent-border-strong: #2d6e47;
    --accent-bg-strong-hover: #235a3a;
    --accent-border-strong-hover: #3a8057;

    --blue: #6b9fff;       --blue-bg: #162338;  --blue-border: #1f3a5a;
    --amber: #e8a94a;      --amber-bg: #2e2412; --amber-border: #4a3a1a;
    --red: #e06b75;        --red-bg: #3a1a1a;
    --teal: #4ec9c9;       --teal-bg: #1a2a3a;
    --error: #e05a5a;

    /* diff viewer */
    --diff-gutter-bg: #0d0f14;
    --diff-add-bg: #0d2318;   --diff-add-gutter: #2a5a34; --diff-add-border: #1a3a22; --diff-add-text: #b8f0c8;
    --diff-del-bg: #2a0d0d;   --diff-del-gutter: #5a2a2a; --diff-del-border: #3a1a1a; --diff-del-text: #f0b8bc;
    --diff-hunk-bg: #111827;  --diff-hunk-text: #4a6080;  --diff-hunk-gutter-bg: #0a0d14;
  }

  /* ── Light theme overrides ─────────────────────────────────────────────── */
  :global(:root[data-theme='light']) {
    --bg-app: #ffffff;
    --bg-chrome: #f3f4f6;
    --bg-panel: #ffffff;
    --bg-hover: #eceef2;
    --bg-elev: #e6e8ec;
    --bg-sel: #e3edff;

    --border: #d8dbe0;
    --border-strong: #cbd0d8;
    --border-hover: #b5bcc7;
    --btn-hover-bg: #e6e8ec;
    --shadow: #00000026;

    --text-brightest: #14171c;
    --text-bright: #24272e;
    --text: #2e333d;
    --text-2: #3a3f4a;
    --text-muted: #5d6470;
    --text-dim: #767c8a;
    --text-dimmer: #969cab;
    --text-faint: #b3b9c4;

    --accent: #2e9e63;
    --accent-bright: #258a55;
    --accent-bg: #e3f6ea;
    --accent-border: #b7e4c8;
    --accent-bg-strong: #d8f0e0;
    --accent-border-strong: #aadcbf;
    --accent-bg-strong-hover: #cdead6;
    --accent-border-strong-hover: #93cfa9;

    --blue: #2d6fdb;       --blue-bg: #e4edfb;  --blue-border: #bcd4f5;
    --amber: #b5791f;      --amber-bg: #fbf0d8; --amber-border: #ecd6a6;
    --red: #d23f4a;        --red-bg: #fbe4e6;
    --teal: #1f9b9b;       --teal-bg: #def2f2;
    --error: #d23f4a;

    /* diff viewer */
    --diff-gutter-bg: #f4f5f8;
    --diff-add-bg: #e6f6ec;   --diff-add-gutter: #6aa67f; --diff-add-border: #c0e4ce; --diff-add-text: #14692f;
    --diff-del-bg: #fbe9eb;   --diff-del-gutter: #c98a90; --diff-del-border: #f1cdd1; --diff-del-text: #9a2530;
    --diff-hunk-bg: #eef2fb;  --diff-hunk-text: #4a6890;  --diff-hunk-gutter-bg: #e9ebf1;
  }

  :global(body) {
    background: var(--bg-app);
    color: var(--text);
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  /* ── Titlebar ────────────────────────────────────────────────────────────── */
  #titlebar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 44px;
    padding: 0 12px;
    background: var(--bg-chrome);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 12px;
  }

  #titlebar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .logo-icon {
    width: 22px;
    height: 22px;
  }

  .app-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-brightest);
    letter-spacing: 0.02em;
  }

  #titlebar-center {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  #titlebar-right {
    flex-shrink: 0;
    display: flex;
    justify-content: flex-end;
  }

  .tb-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    height: 28px;
    padding: 0 10px;
    background: var(--bg-elev);
    color: var(--text-2);
    border: 1px solid var(--border-strong);
    border-radius: 5px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    transition: background 0.12s, border-color 0.12s;
    flex-shrink: 0;
  }

  .tb-btn svg {
    width: 13px;
    height: 13px;
    flex-shrink: 0;
  }

  .tb-btn:hover {
    background: var(--btn-hover-bg);
    border-color: var(--border-hover);
    color: var(--text-bright);
  }

  .tb-btn.primary {
    background: var(--accent-bg-strong);
    border-color: var(--accent-border-strong);
    color: var(--accent);
  }

  .tb-btn.primary:hover {
    background: var(--accent-bg-strong-hover);
    border-color: var(--accent-border-strong-hover);
    color: var(--accent-bright);
  }

  .repo-breadcrumb {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-left: 8px;
    padding: 4px 10px;
    background: var(--bg-hover);
    border: 1px solid var(--border);
    border-radius: 5px;
    overflow: hidden;
    max-width: 420px;
  }

  .repo-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
  }

  .repo-path {
    font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ── Column header ───────────────────────────────────────────────────────── */
  #col-header {
    display: flex;
    align-items: center;
    height: 24px;
    background: var(--bg-chrome);
    border-bottom: 1px solid var(--border);
    font-size: 10px;
    font-weight: 600;
    color: var(--text-dim);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    flex-shrink: 0;
  }

  /* Column starts mirror the canvas layout in GraphCanvas.svelte: branch/tag
     chips first, then the graph lanes, then sha at refs-width + lane-width + 8,
     with the description taking the rest of the row. Both leading columns take
     their width inline — the refs column from the shared constant, the graph
     column because its lane area grows with the graph. The refs header is
     right-aligned because the chips below it hug the graph lanes. */
  .col-refs  { flex-shrink: 0; padding-right: 8px; text-align: right; }
  .col-graph { flex-shrink: 0; padding-left: 8px; }
  .col-sha   { width: 80px; flex-shrink: 0; font-family: monospace; }
  .col-desc  { flex: 1;     min-width: 0; padding-right: 8px; }

  /* ── Main layout ─────────────────────────────────────────────────────────── */
  #main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  #top-pane {
    display: flex;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  #graph-pane {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  #canvas-container {
    flex: 1;
    overflow: hidden;
    position: relative;
    min-height: 0;
  }

  #diff-overlay {
    position: absolute;
    inset: 0; /* cover the commit-tree canvas */
    background: var(--bg-panel);
    box-shadow: 0 0 32px var(--shadow);
    z-index: 100;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .diff-loading {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    height: 100%;
    color: var(--text-dimmer);
    font-size: 12px;
  }

  .spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
