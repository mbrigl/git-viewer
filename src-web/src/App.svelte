<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { listen } from '@tauri-apps/api/event';
  import { onMount } from 'svelte';
  import GraphCanvas, { EMPTY_GRAPH_WIDTH, graphAreaWidth } from './GraphCanvas.svelte';
  import DiffViewer from './DiffViewer.svelte';
  import FileTree from './FileTree.svelte';
  import { buildFileTree } from './fileTree.ts';
  import type { GraphData, NodeJson, FileChange } from './types.ts';

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
  let status          = $state('Ready — open a repository to start');
  let repoLabel       = $state('(no repository)');
  let currentRepoPath = $state<string | null>(null);
  let selectedNode    = $state<NodeJson | null>(null);
  // Width of the graph lane area — the column header mirrors the canvas layout.
  const graphColWidth = $derived.by(() => {
    const nodes = graphData?.nodes ?? [];
    if (nodes.length === 0) return EMPTY_GRAPH_WIDTH;
    let maxCol = 0;
    for (const n of nodes) if (n.col > maxCol) maxCol = n.col;
    return graphAreaWidth(maxCol);
  });
  let changedFiles    = $state<FileChange[]>([]);
  let fileViewMode    = $state<'flat' | 'tree'>('tree');
  const fileTree      = $derived(buildFileTree(changedFiles));

  interface DiffLine { kind: string; content: string; oldLineno: number | null; newLineno: number | null; }
  let diffLines       = $state<DiffLine[]>([]);
  let diffFile        = $state<string | null>(null);
  let diffLoading     = $state(false);

  // ── Tauri event listeners ──────────────────────────────────────────────────
  onMount(() => {
    const unlisten = Promise.all([
      listen<string>('load-graph', (e) => {
        try {
          graphData = typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
        } catch {
          status = 'Error parsing graph data';
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
    const node = graphData?.nodes.find(n => n.sha === sha) ?? null;
    selectedNode = node;
    changedFiles = [];
    diffFile = null;
    diffLines = [];
    invoke('select_commit', { sha }).catch(() => {});
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
    <!-- placeholder for future actions -->
  </div>
</div>

<!-- ── Main content area ──────────────────────────────────────────────────── -->
<div id="main">
  <div id="top-pane">
    <div id="graph-pane">
      <!-- Column header — inside the graph pane so it shares the canvas width,
           with the graph column tracking the canvas's dynamic lane width. -->
      <div id="col-header">
        <span class="col-graph" style="width: {graphColWidth + 8}px">Graph</span>
        <span class="col-sha">SHA</span>
        <span class="col-desc">Description</span>
        <span class="col-author">Author</span>
        <span class="col-date">Date</span>
      </div>

      <div id="canvas-container">
        <GraphCanvas {graphData} {onSelectCommit} {theme} />

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

  <!-- ── Right sidebar: commit detail ────────────────────────────────────── -->
  <div id="sidebar">
    <div class="sidebar-section-header">COMMIT</div>

    {#if selectedNode}
      {@const node = selectedNode}
      <div class="detail-block">
        <div class="detail-sha">{node.kind === 'working' ? 'Uncommitted changes' : node.sha}</div>

        {#if node.refs.length > 0}
          <div class="detail-refs">
            {#each node.refs as ref}
              <span class="ref-chip {ref.startsWith('🏷') ? 'tag' : ref.includes('/') ? 'remote' : 'local'}">
                {ref}
              </span>
            {/each}
          </div>
        {/if}

        <div class="detail-message">{node.message}</div>
      </div>

      <div class="sidebar-divider"></div>
      <div class="sidebar-section-header">AUTHOR</div>
      <div class="detail-block detail-author-row">
        <div class="detail-author-avatar">
          {node.author.charAt(0).toUpperCase()}
          {#if showAvatars && node.authorAvatar}
            <img
              class="avatar-img"
              src={node.authorAvatar}
              alt=""
              onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
            />
          {/if}
        </div>
        <div class="detail-author-info">
          <div class="detail-author-name">{node.author}</div>
          <div class="detail-date">{node.authorDate}</div>
        </div>
      </div>

      {#if node.kind !== 'working' && (node.committer !== node.author || node.date !== node.authorDate)}
        <div class="sidebar-divider"></div>
        <div class="sidebar-section-header">COMMITTER</div>
        <div class="detail-block detail-author-row">
          <div class="detail-author-avatar">
            {node.committer.charAt(0).toUpperCase()}
            {#if showAvatars && node.committerAvatar}
              <img
                class="avatar-img"
                src={node.committerAvatar}
                alt=""
                onerror={(e) => ((e.currentTarget as HTMLImageElement).style.display = 'none')}
              />
            {/if}
          </div>
          <div class="detail-author-info">
            <div class="detail-author-name">{node.committer}</div>
            <div class="detail-date">{node.date}</div>
          </div>
        </div>
      {/if}

      <div class="sidebar-divider"></div>
      <div class="sidebar-section-header">
        <span>FILES CHANGED</span>
        {#if changedFiles.length > 0}
          <span class="file-count">{changedFiles.length}</span>
        {/if}
        <div class="view-toggle">
          <button
            class="view-toggle-btn {fileViewMode === 'flat' ? 'active' : ''}"
            title="Flat view"
            aria-label="Flat view"
            onclick={() => (fileViewMode = 'flat')}
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="3"  width="12" height="1.6" rx="0.8" />
              <rect x="2" y="7.2" width="12" height="1.6" rx="0.8" />
              <rect x="2" y="11.4" width="12" height="1.6" rx="0.8" />
            </svg>
          </button>
          <button
            class="view-toggle-btn {fileViewMode === 'tree' ? 'active' : ''}"
            title="Tree view"
            aria-label="Tree view"
            onclick={() => (fileViewMode = 'tree')}
          >
            <svg viewBox="0 0 16 16" fill="currentColor">
              <rect x="2" y="3"  width="10" height="1.6" rx="0.8" />
              <rect x="5" y="7.2" width="9" height="1.6" rx="0.8" />
              <rect x="5" y="11.4" width="9" height="1.6" rx="0.8" />
            </svg>
          </button>
        </div>
      </div>

      {#if changedFiles.length === 0}
        <div class="files-loading">
          <div class="spinner"></div>
        </div>
      {:else if fileViewMode === 'tree'}
        <div class="file-list">
          <FileTree nodes={fileTree} {diffFile} {onSelectFile} />
        </div>
      {:else}
        <div class="file-list">
          {#each changedFiles as file}
            <div
              class="file-row {diffFile === file.path ? 'selected' : ''}"
              onclick={() => onSelectFile(file)}
              role="button"
              tabindex="0"
              onkeydown={(e) => e.key === 'Enter' && onSelectFile(file)}
            >
              <span class="file-status {file.status.toLowerCase()}">{file.status[0]}</span>
              <span class="file-path" title={file.path}>
                {#if file.oldPath}
                  <span class="file-old-path">{file.oldPath}</span>
                  <span class="rename-arrow">→</span>
                {/if}
                {file.path}
              </span>
              {#if file.additions > 0 || file.deletions > 0}
                <span class="file-stats">
                  {#if file.additions > 0}<span class="stat-add">+{file.additions}</span>{/if}
                  {#if file.deletions > 0}<span class="stat-del">-{file.deletions}</span>{/if}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {:else}
      <div class="sidebar-empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="12" cy="12" r="3"/>
          <path d="M3 12h3m12 0h3M12 3v3m0 12v3"/>
        </svg>
        <p>Select a commit to view details</p>
      </div>
    {/if}
  </div><!-- end #sidebar -->
  </div><!-- end #top-pane -->
</div><!-- end #main -->

<!-- ── Status bar ──────────────────────────────────────────────────────────── -->
<div id="statusbar">
  <div class="status-left">
    <span class="status-dot {status.startsWith('Error') ? 'error' : status === 'Ready — open a repository to start' ? 'idle' : 'active'}"></span>
    <span id="status">{status}</span>
  </div>
  <div class="status-right">
    <span class="status-hint">Scroll to navigate · Click to select</span>
    <button
      class="theme-toggle avatar-toggle"
      class:on={showAvatars}
      onclick={toggleAvatars}
      title={showAvatars
        ? 'Avatars on — loaded from gravatar.com. Click to stop.'
        : 'Avatars off — click to load them from gravatar.com'}
      aria-label="Toggle loading avatars from Gravatar"
      aria-pressed={showAvatars}
    >
      <!-- person -->
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
        <circle cx="8" cy="5" r="2.6" />
        <path d="M2.8 13.6a5.3 5.3 0 0 1 10.4 0" stroke-linecap="round" />
      </svg>
    </button>
    <button
      class="theme-toggle"
      onclick={toggleTheme}
      title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-label="Toggle color theme"
    >
      {#if theme === 'dark'}
        <!-- sun -->
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3">
          <circle cx="8" cy="8" r="3.2" />
          <path d="M8 1v1.6M8 13.4V15M1 8h1.6M13.4 8H15M3 3l1.1 1.1M11.9 11.9L13 13M13 3l-1.1 1.1M4.1 11.9L3 13" stroke-linecap="round" />
        </svg>
      {:else}
        <!-- moon -->
        <svg viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.2 1.8a6.2 6.2 0 108 8 5 5 0 01-8-8z" />
        </svg>
      {/if}
    </button>
  </div>
</div>

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
    width: 80px;
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

  /* Column starts mirror the canvas text layout in GraphCanvas.svelte:
     sha at lane-width + 8, refs/message filling the middle, author at
     width − 298, date at width − 138 (all border-box). The graph column's
     width is set inline because the lane area grows with the graph. */
  .col-graph  { flex-shrink: 0; padding-left: 8px; }
  .col-sha    { width: 80px;  flex-shrink: 0; font-family: monospace; }
  .col-desc   { flex: 1;      min-width: 0; }
  .col-author { width: 160px; flex-shrink: 0; }
  .col-date   { width: 138px; flex-shrink: 0; padding-right: 8px; }

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

  /* ── Right sidebar ───────────────────────────────────────────────────────── */
  #sidebar {
    width: 280px;
    flex-shrink: 0;
    background: var(--bg-chrome);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .sidebar-section-header {
    padding: 10px 14px 6px;
    font-size: 10px;
    font-weight: 700;
    color: var(--text-dimmer);
    letter-spacing: 0.08em;
    flex-shrink: 0;
  }

  .sidebar-divider {
    height: 1px;
    background: var(--border);
    margin: 8px 0;
    flex-shrink: 0;
  }

  .detail-block {
    padding: 4px 14px 10px;
    flex-shrink: 0;
  }

  .detail-sha {
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 11px;
    color: var(--blue);
    word-break: break-all;
    margin-bottom: 8px;
    line-height: 1.5;
  }

  .detail-refs {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 10px;
  }

  .ref-chip {
    display: inline-flex;
    align-items: center;
    padding: 2px 7px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 500;
    line-height: 16px;
    white-space: nowrap;
  }

  .ref-chip.local  { background: var(--accent-bg); color: var(--accent); border: 1px solid var(--accent-border); }
  .ref-chip.remote { background: var(--blue-bg); color: var(--blue); border: 1px solid var(--blue-border); }
  .ref-chip.tag    { background: var(--amber-bg); color: var(--amber); border: 1px solid var(--amber-border); }

  .detail-message {
    font-size: 13px;
    color: var(--text);
    line-height: 1.55;
    word-break: break-word;
  }

  .detail-author-avatar {
    position: relative;
    overflow: hidden;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent-bg-strong), var(--accent-border-strong));
    color: var(--accent);
    font-size: 15px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 8px;
    flex-shrink: 0;
  }

  .detail-author-avatar .avatar-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .detail-author-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .detail-author-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text);
  }

  .detail-date {
    font-size: 11px;
    color: var(--text-dim);
    font-family: monospace;
  }

  .detail-author-row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sidebar-section-header {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .file-count {
    background: var(--bg-elev);
    color: var(--text-dim);
    font-size: 9px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 8px;
    letter-spacing: 0;
    line-height: 14px;
  }

  .view-toggle {
    display: flex;
    gap: 2px;
    margin-left: auto;
  }

  .view-toggle-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 18px;
    padding: 0;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 4px;
    color: var(--text-dimmer);
    cursor: pointer;
  }

  .view-toggle-btn svg {
    width: 13px;
    height: 13px;
  }

  .view-toggle-btn:hover {
    background: var(--bg-hover);
    color: var(--text-muted);
  }

  .view-toggle-btn.active {
    background: var(--accent-bg);
    border-color: var(--accent-border);
    color: var(--accent);
  }

  .files-loading {
    display: flex;
    justify-content: center;
    padding: 16px;
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

  .file-list {
    display: flex;
    flex-direction: column;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .file-row {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 14px;
    font-size: 11px;
    cursor: pointer;
    min-width: 0;
  }

  .file-row:hover {
    background: var(--bg-hover);
  }

  .file-row.selected {
    background: var(--bg-sel);
    border-left: 2px solid var(--accent);
    padding-left: 12px;
  }

  .file-status {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    font-size: 9px;
    font-weight: 700;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    text-transform: uppercase;
  }

  .file-status.added    { background: var(--accent-bg); color: var(--accent); }
  .file-status.modified { background: var(--blue-bg); color: var(--blue); }
  .file-status.deleted  { background: var(--red-bg); color: var(--red); }
  .file-status.renamed  { background: var(--amber-bg); color: var(--amber); }
  .file-status.copied   { background: var(--teal-bg); color: var(--teal); }
  .file-status.unknown  { background: var(--bg-elev); color: var(--text-dim); }

  .file-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--text-2);
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 10.5px;
  }

  .file-old-path {
    color: var(--text-dim);
    text-decoration: line-through;
  }

  .rename-arrow {
    color: var(--text-dimmer);
    margin: 0 2px;
  }

  .file-stats {
    display: flex;
    gap: 3px;
    flex-shrink: 0;
    font-family: monospace;
    font-size: 10px;
  }

  .stat-add { color: var(--accent); }
  .stat-del { color: var(--red); }

  .sidebar-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text-faint);
    padding: 40px 20px;
    text-align: center;
  }

  .sidebar-empty svg {
    width: 32px;
    height: 32px;
    color: var(--border);
  }

  .sidebar-empty p {
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-dimmer);
  }

  /* ── Status bar ──────────────────────────────────────────────────────────── */
  #statusbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 22px;
    padding: 0 10px;
    background: var(--bg-chrome);
    border-top: 1px solid var(--border);
    flex-shrink: 0;
  }

  .status-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .status-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .status-dot.idle   { background: var(--text-faint); }
  .status-dot.active { background: var(--accent); }
  .status-dot.error  { background: var(--error); }

  #status {
    font-size: 11px;
    color: var(--text-dim);
  }

  .status-hint {
    font-size: 11px;
    color: var(--text-faint);
  }

  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 16px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 3px;
    color: var(--text-dim);
    cursor: pointer;
  }

  .theme-toggle svg {
    width: 13px;
    height: 13px;
  }

  .theme-toggle:hover {
    background: var(--bg-hover);
    color: var(--accent);
  }

  .avatar-toggle.on {
    color: var(--accent);
  }
</style>
