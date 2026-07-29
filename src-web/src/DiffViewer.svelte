<script lang="ts">
  interface DiffLine {
    kind: 'Add' | 'Delete' | 'Context' | 'Hunk' | 'Meta';
    content: string;
    oldLineno: number | null;
    newLineno: number | null;
  }

  interface Props {
    lines: DiffLine[];
    filePath: string;
    onClose: () => void;
  }

  let { lines, filePath, onClose }: Props = $props();

  function fileName(path: string): string {
    return path.split('/').pop() ?? path;
  }
</script>

<div class="diff-panel">
  <div class="diff-header">
    <span class="diff-filepath">
      <span class="diff-dir">{filePath.includes('/') ? filePath.slice(0, filePath.lastIndexOf('/') + 1) : ''}</span>
      <span class="diff-filename">{fileName(filePath)}</span>
    </span>
    <button class="diff-close" onclick={onClose} title="Close diff">✕</button>
  </div>

  <div class="diff-body">
    {#if lines.length === 0}
      <div class="diff-empty">No changes</div>
    {:else}
      <table class="diff-table">
        <tbody>
          {#each lines as line}
            {#if line.kind === 'Hunk'}
              <tr class="hunk-row">
                <td class="ln ln-old"></td>
                <td class="ln ln-new"></td>
                <td class="hunk-header">{line.content}</td>
              </tr>
            {:else}
              <tr class="line-row {line.kind.toLowerCase()}">
                <td class="ln ln-old">{line.oldLineno ?? ''}</td>
                <td class="ln ln-new">{line.newLineno ?? ''}</td>
                <td class="line-content">
                  <span class="line-sign">
                    {#if line.kind === 'Add'}+{:else if line.kind === 'Delete'}-{:else} {/if}
                  </span><span class="line-text">{line.content}</span>
                </td>
              </tr>
            {/if}
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .diff-panel {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--bg-panel);
    overflow: hidden;
  }

  .diff-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    height: 36px;
    background: var(--bg-chrome);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    gap: 8px;
  }

  .diff-filepath {
    font-family: 'Cascadia Code', 'Fira Code', monospace;
    font-size: 12px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diff-dir      { color: var(--text-dimmer); }
  .diff-filename { color: var(--text-2); font-weight: 600; }

  .diff-close {
    background: none;
    border: none;
    color: var(--text-dimmer);
    cursor: pointer;
    font-size: 13px;
    padding: 2px 6px;
    border-radius: 3px;
    flex-shrink: 0;
    line-height: 1;
  }
  .diff-close:hover { background: var(--bg-elev); color: var(--text-2); }

  .diff-body {
    flex: 1;
    overflow: auto;
  }

  .diff-empty {
    padding: 20px;
    color: var(--text-dimmer);
    font-size: 12px;
    text-align: center;
  }

  .diff-table {
    border-collapse: collapse;
    width: 100%;
    font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
    font-size: 12px;
    line-height: 20px;
    white-space: pre;
    table-layout: fixed;
  }

  .ln {
    width: 44px;
    min-width: 44px;
    padding: 0 8px;
    text-align: right;
    color: var(--text-faint);
    user-select: none;
    border-right: 1px solid var(--border);
    background: var(--diff-gutter-bg);
    vertical-align: top;
  }

  .line-content {
    padding: 0 0 0 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: pre;
    vertical-align: top;
  }

  .line-sign {
    display: inline-block;
    width: 14px;
    user-select: none;
  }

  .line-text {
    color: var(--text-2);
  }

  /* Add rows */
  .line-row.add .ln          { background: var(--diff-add-bg); color: var(--diff-add-gutter); border-right-color: var(--diff-add-border); }
  .line-row.add .line-content { background: var(--diff-add-bg); }
  .line-row.add .line-sign   { color: var(--accent); }
  .line-row.add .line-text   { color: var(--diff-add-text); }

  /* Delete rows */
  .line-row.delete .ln          { background: var(--diff-del-bg); color: var(--diff-del-gutter); border-right-color: var(--diff-del-border); }
  .line-row.delete .line-content { background: var(--diff-del-bg); }
  .line-row.delete .line-sign   { color: var(--red); }
  .line-row.delete .line-text   { color: var(--diff-del-text); }

  /* Context rows */
  .line-row.context .line-content { background: var(--bg-panel); }
  .line-row.context .line-sign    { color: var(--text-faint); }

  /* Hunk header */
  .hunk-row .hunk-header {
    padding: 0 8px;
    background: var(--diff-hunk-bg);
    color: var(--diff-hunk-text);
    font-style: italic;
    white-space: pre;
  }
  .hunk-row .ln { background: var(--diff-hunk-gutter-bg); }
</style>
