<script module lang="ts">
  // Graph-lane geometry, exported so the column header in App.svelte can
  // mirror the canvas layout exactly instead of guessing widths.
  const COL_WIDTH  = 20;
  const GRAPH_LEFT = 10;

  /** Lane-area width shown while no repository is loaded. */
  export const EMPTY_GRAPH_WIDTH = 180;

  /** Width of the graph lane area for a graph whose rightmost column is `maxCol`. */
  export function graphAreaWidth(maxCol: number): number {
    return GRAPH_LEFT + (maxCol + 1) * COL_WIDTH + GRAPH_LEFT;
  }
</script>

<script lang="ts">
  import type { GraphData, NodeJson, Edge } from './types.ts';

  // ── Props ──────────────────────────────────────────────────────────────────
  interface Props {
    graphData: GraphData | null;
    onSelectCommit?: (sha: string) => void;
    theme?: 'dark' | 'light';
    /** Rows of the selected commit's ancestry; when set, all other rows are dimmed. */
    highlightRows?: Set<number> | null;
  }
  let { graphData, onSelectCommit, theme = 'dark', highlightRows = null }: Props = $props();

  // Dim levels while an ancestry highlight is active: edges and node glyphs
  // fade strongly so the highlighted lines pop; text stays readable.
  const DIM_GRAPH = 0.22;
  const DIM_TEXT  = 0.45;

  // ── Layout constants ───────────────────────────────────────────────────────
  const ROW_HEIGHT  = 26;
  const NODE_RADIUS = 5;
  const LINE_WIDTH  = 1.5;

  const W_SHA    = 80;
  const W_REFS   = 190;
  const W_AUTHOR = 160;
  const W_DATE   = 130;

  // GitKraken-style branch colors
  const BRANCH_COLORS = [
    '#4caf7d', // green  (primary / HEAD)
    '#6b9fff', // blue
    '#e8a94a', // amber
    '#e06b75', // red/pink
    '#b48efe', // purple
    '#4ec9c9', // teal
    '#f0a070', // peach
    '#60c0e0', // sky
    '#a0d060', // lime
    '#e080b0', // rose
  ];

  function branchColor(col: number): string {
    return BRANCH_COLORS[col % BRANCH_COLORS.length];
  }

  // ── Theme palettes (canvas can't read CSS vars cheaply per frame) ──────────
  interface Chip { bg: string; text: string; border: string; }
  interface Palette {
    bg: string; emptyTitle: string; emptySub: string;
    rowSel: string; accent: string; rowHover: string; rowSep: string;
    separator: string; nodeFill: string;
    shaSel: string; sha: string; msgSel: string; msg: string;
    author: string; date: string;
    chipTag: Chip; chipRemote: Chip; chipLocal: Chip;
  }
  const PALETTES: Record<'dark' | 'light', Palette> = {
    dark: {
      bg: '#1a1d23', emptyTitle: '#3a3e4e', emptySub: '#2a2d35',
      rowSel: '#1e2a3a', accent: '#4caf7d', rowHover: '#1e2128', rowSep: '#1e2128',
      separator: '#2a2d35', nodeFill: '#1a1d23',
      shaSel: '#6b9fff', sha: '#4a5070', msgSel: '#e8eaf0', msg: '#c0c3ca',
      author: '#5a5e6e', date: '#4a4e5e',
      chipTag:    { bg: '#2e2412', text: '#e8a94a', border: '#4a3a1a' },
      chipRemote: { bg: '#162338', text: '#6b9fff', border: '#1f3a5a' },
      chipLocal:  { bg: '#1a3a22', text: '#4caf7d', border: '#2a5a34' },
    },
    light: {
      bg: '#ffffff', emptyTitle: '#b3b9c4', emptySub: '#cbd0d8',
      rowSel: '#e3edff', accent: '#2e9e63', rowHover: '#eceef2', rowSep: '#eef0f3',
      separator: '#d8dbe0', nodeFill: '#ffffff',
      shaSel: '#2d6fdb', sha: '#969cab', msgSel: '#14171c', msg: '#3a3f4a',
      author: '#767c8a', date: '#969cab',
      chipTag:    { bg: '#fbf0d8', text: '#b5791f', border: '#ecd6a6' },
      chipRemote: { bg: '#e4edfb', text: '#2d6fdb', border: '#bcd4f5' },
      chipLocal:  { bg: '#e3f6ea', text: '#2e9e63', border: '#b7e4c8' },
    },
  };
  const pal: Palette = $derived(PALETTES[theme]);

  // ── Local state ────────────────────────────────────────────────────────────
  let scrollY     = $state(0);
  let hoveredRow  = $state(-1);
  let selectedRow = $state(-1);

  // ── Canvas element + context ───────────────────────────────────────────────
  let canvas = $state<HTMLCanvasElement | null>(null);
  let ctx: CanvasRenderingContext2D | null = $derived(canvas?.getContext('2d') ?? null);

  // ── Layout helpers ─────────────────────────────────────────────────────────
  function nodeX(col: number): number { return GRAPH_LEFT + col * COL_WIDTH + COL_WIDTH / 2; }
  function nodeY(row: number): number { return row * ROW_HEIGHT + ROW_HEIGHT / 2; }

  // ── Row index, rebuilt only when the graph changes ─────────────────────────
  // Rendering must cost O(visible rows), not O(history) — see "Virtual rendering"
  // in docs/SPECIFICATION.md. Scanning every node and edge per frame would make it
  // O(n), so nodes are indexed by row and edges are bucketed by their first row.
  // Edges spanning more than a viewport's worth of rows are kept in a separate
  // list, so a bounded bucket window plus that short list covers every edge that
  // can intersect the viewport.
  const MAX_SHORT_SPAN = 256;

  const index = $derived.by(() => {
    const nodes = graphData?.nodes ?? [];
    const edges = graphData?.edges ?? [];
    const rowCount = nodes.length;

    const nodesByRow: (NodeJson | undefined)[] = new Array(rowCount);
    let maxCol = 0;
    for (const n of nodes) {
      if (n.row >= 0 && n.row < rowCount) nodesByRow[n.row] = n;
      if (n.col > maxCol) maxCol = n.col;
    }

    const shortByFirstRow: Edge[][] = Array.from({ length: rowCount }, () => []);
    const longEdges: Edge[] = [];
    for (const e of edges) {
      if (e.minRow < 0 || e.minRow >= rowCount || e.maxRow - e.minRow > MAX_SHORT_SPAN) {
        longEdges.push(e);
      } else {
        shortByFirstRow[e.minRow].push(e);
      }
    }

    return {
      nodesByRow,
      shortByFirstRow,
      longEdges,
      rowCount,
      width: rowCount === 0 ? EMPTY_GRAPH_WIDTH : graphAreaWidth(maxCol),
    };
  });

  function totalContentHeight(): number {
    return index.rowCount * ROW_HEIGHT;
  }

  // ── Canvas sizing ──────────────────────────────────────────────────────────
  function resizeCanvas(): void {
    if (!canvas) return;
    const container = canvas.parentElement!;
    canvas.width  = container.clientWidth;
    canvas.height = container.clientHeight;
    render();
  }

  $effect(() => {
    if (!canvas) return;
    const observer = new ResizeObserver(() => resizeCanvas());
    observer.observe(canvas.parentElement!);
    resizeCanvas();
    return () => observer.disconnect();
  });

  $effect(() => {
    const _ = [graphData, scrollY, hoveredRow, selectedRow, theme, highlightRows];
    render();
  });

  $effect(() => {
    if (graphData) {
      scrollY     = 0;
      hoveredRow  = -1;
      selectedRow = -1;
    }
  });

  // ── Main render ────────────────────────────────────────────────────────────
  function render(): void {
    if (!canvas || !ctx) return;
    const W = canvas.width;
    const H = canvas.height;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = pal.bg;
    ctx.fillRect(0, 0, W, H);

    if (index.rowCount === 0) {
      ctx.fillStyle = pal.emptyTitle;
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Open a Git repository to get started', W / 2, H / 2 - 10);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = pal.emptySub;
      ctx.fillText('Use "Open Repo" in the toolbar above', W / 2, H / 2 + 12);
      ctx.textAlign = 'left';
      return;
    }

    const maxScroll = Math.max(0, totalContentHeight() - H);
    scrollY = Math.min(Math.max(scrollY, 0), maxScroll);

    const visRowMin = Math.max(0, Math.floor(scrollY / ROW_HEIGHT));
    const visRowMax = Math.min(index.rowCount - 1, Math.ceil((scrollY + H) / ROW_HEIGHT));
    const gw = index.width;

    // Row backgrounds
    for (let r = visRowMin; r <= visRowMax; r++) {
      const y = r * ROW_HEIGHT - scrollY;
      if (r === selectedRow) {
        ctx.fillStyle = pal.rowSel;
        ctx.fillRect(0, y, W, ROW_HEIGHT);
        // left accent bar for selected
        ctx.fillStyle = pal.accent;
        ctx.fillRect(0, y, 2, ROW_HEIGHT);
      } else if (r === hoveredRow) {
        ctx.fillStyle = pal.rowHover;
        ctx.fillRect(0, y, W, ROW_HEIGHT);
      }
      // subtle separator between rows
      ctx.strokeStyle = pal.rowSep;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + ROW_HEIGHT - 0.5);
      ctx.lineTo(W, y + ROW_HEIGHT - 0.5);
      ctx.stroke();
    }

    // Graph/info separator
    ctx.strokeStyle = pal.separator;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(gw, 0);
    ctx.lineTo(gw, H);
    ctx.stroke();

    // Edges — orthogonal L-shapes with a short curve at the corner.
    // An edge is drawn when its row span intersects the visible range, so edges
    // running in from off-screen rows are still drawn.
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const bucketFrom = Math.max(0, visRowMin - MAX_SHORT_SPAN);
    for (let r = bucketFrom; r <= visRowMax; r++) {
      for (const edge of index.shortByFirstRow[r]) {
        if (edge.maxRow < visRowMin) continue;
        drawEdge(edge);
      }
    }
    for (const edge of index.longEdges) {
      if (edge.maxRow < visRowMin || edge.minRow > visRowMax) continue;
      drawEdge(edge);
    }

    // Nodes — one row lookup per visible row, already in row order
    for (let r = visRowMin; r <= visRowMax; r++) {
      const node = index.nodesByRow[r];
      if (node) drawNode(node, gw, W);
    }
  }

  // ── Edge rendering with short corner curves (GitKraken style) ────────────
  function drawEdge(edge: Edge): void {
    // An edge is on the ancestry path iff both endpoints are: every loaded
    // parent of an ancestry node is itself ancestry, so child→parent edges
    // inside the set stay bright and everything else fades.
    const dimmed =
      highlightRows !== null &&
      !(highlightRows.has(edge.sourceRow) && highlightRows.has(edge.targetRow));
    if (dimmed) ctx!.globalAlpha = DIM_GRAPH;

    const x1 = nodeX(edge.sourceCol);
    const y1 = nodeY(edge.sourceRow) - scrollY;
    const x2 = nodeX(edge.targetCol);
    const y2 = nodeY(edge.targetRow) - scrollY;

    const color = branchColor(edge.isBranch ? edge.targetCol : edge.sourceCol);
    ctx!.strokeStyle = color;
    ctx!.beginPath();
    ctx!.moveTo(x1, y1);

    if (x1 === x2) {
      // Straight vertical
      ctx!.lineTo(x2, y2);
    } else {
      const r = COL_WIDTH / 2;
      const dx = x2 > x1 ? 1 : -1; // direction: +1 right, -1 left
      const dy = y2 > y1 ? 1 : -1; // direction: +1 down,  -1 up

      if (x2 > x1) {
        // Left → right: horizontal first, then vertical.
        // Bend sits at the target column (x2), at the source row (y1).
        ctx!.lineTo(x2 - dx * r, y1);
        ctx!.quadraticCurveTo(x2, y1, x2, y1 + dy * r);
        ctx!.lineTo(x2, y2);
      } else {
        // Right → left: vertical first, then horizontal.
        // Bend sits at the source column (x1), at the target row (y2).
        ctx!.lineTo(x1, y2 - dy * r);
        ctx!.quadraticCurveTo(x1, y2, x1 + dx * r, y2);
        ctx!.lineTo(x2, y2);
      }
    }
    ctx!.stroke();
    ctx!.globalAlpha = 1;
  }

  // ── Node rendering ─────────────────────────────────────────────────────────
  function drawNode(node: NodeJson, gw: number, canvasW: number): void {
    const cx = nodeX(node.col);
    const cy = nodeY(node.row) - scrollY;
    const color = branchColor(node.col);
    const isSelected = node.row === selectedRow;
    const dimmed = highlightRows !== null && !highlightRows.has(node.row);
    if (dimmed) ctx!.globalAlpha = DIM_GRAPH;

    // Node outer glow for selected
    if (isSelected) {
      ctx!.beginPath();
      ctx!.arc(cx, cy, NODE_RADIUS + 3, 0, Math.PI * 2);
      ctx!.fillStyle = color + '33';
      ctx!.fill();
    }

    // Node glyph — circle for commits, diamond for stashes, dashed for WIP
    if (node.kind === 'stash') {
      const r = NODE_RADIUS + 0.5;
      ctx!.beginPath();
      ctx!.moveTo(cx, cy - r);
      ctx!.lineTo(cx + r, cy);
      ctx!.lineTo(cx, cy + r);
      ctx!.lineTo(cx - r, cy);
      ctx!.closePath();
      ctx!.fillStyle = isSelected ? color : pal.nodeFill;
      ctx!.fill();
      ctx!.strokeStyle = color;
      ctx!.lineWidth = isSelected ? 2 : 1.5;
      ctx!.stroke();
    } else if (node.kind === 'working') {
      ctx!.beginPath();
      ctx!.arc(cx, cy, NODE_RADIUS, 0, Math.PI * 2);
      ctx!.fillStyle = pal.nodeFill;
      ctx!.fill();
      ctx!.setLineDash([2, 2]);
      ctx!.strokeStyle = color;
      ctx!.lineWidth = isSelected ? 2 : 1.5;
      ctx!.stroke();
      ctx!.setLineDash([]);
    } else {
      // Node fill
      ctx!.beginPath();
      ctx!.arc(cx, cy, NODE_RADIUS, 0, Math.PI * 2);
      ctx!.fillStyle = isSelected ? color : pal.nodeFill;
      ctx!.fill();

      // Node border
      ctx!.beginPath();
      ctx!.arc(cx, cy, NODE_RADIUS, 0, Math.PI * 2);
      ctx!.strokeStyle = color;
      ctx!.lineWidth = isSelected ? 2 : 1.5;
      ctx!.stroke();

      // Merge commits (more than one parent) get an inner ring — the
      // "double circle" from the README roadmap.
      if (node.parents.length > 1) {
        ctx!.beginPath();
        ctx!.arc(cx, cy, NODE_RADIUS - 2.5, 0, Math.PI * 2);
        ctx!.strokeStyle = isSelected ? pal.nodeFill : color;
        ctx!.lineWidth = 1;
        ctx!.stroke();
      }
    }
    ctx!.lineWidth = LINE_WIDTH;
    if (dimmed) ctx!.globalAlpha = DIM_TEXT;

    const baseY  = node.row * ROW_HEIGHT - scrollY;
    const textY  = baseY + Math.round((ROW_HEIGHT + 11) / 2) - 1;
    let x = gw + 8;

    // SHA
    ctx!.font = '11px "Cascadia Code", "Fira Code", "JetBrains Mono", monospace';
    ctx!.fillStyle = isSelected ? pal.shaSel : pal.sha;
    ctx!.fillText(node.shortSha, x, textY);
    x += W_SHA;

    // Refs
    x = drawRefChips(node.refs, x, baseY);

    // Dynamic message width: fills space between refs and author
    const msgEnd = canvasW - W_AUTHOR - W_DATE - 8;
    const msgW   = Math.max(60, msgEnd - x);

    ctx!.font = isSelected
      ? '500 12px "Segoe UI", system-ui, sans-serif'
      : '12px "Segoe UI", system-ui, sans-serif';
    ctx!.fillStyle = isSelected ? pal.msgSel : pal.msg;
    ctx!.fillText(truncateText(node.message, msgW - 8), x, textY);
    x = msgEnd;

    // Author
    ctx!.font = '11px "Segoe UI", system-ui, sans-serif';
    ctx!.fillStyle = pal.author;
    ctx!.fillText(truncateText(node.author, W_AUTHOR - 8), x, textY);
    x += W_AUTHOR;

    // Date
    ctx!.fillStyle = pal.date;
    ctx!.fillText(node.date, x, textY);
    ctx!.globalAlpha = 1;
  }

  // ── Ref chip rendering ─────────────────────────────────────────────────────
  function drawRefChips(refs: string[], startX: number, rowY: number): number {
    if (!refs || refs.length === 0) return startX;
    let x = startX;
    const chipH = 15;
    const chipY = rowY + (ROW_HEIGHT - chipH) / 2;
    const arc = 3;

    ctx!.font = '10px "Segoe UI", system-ui, sans-serif';
    for (const ref of refs) {
      if (x > startX + W_REFS - 10) break;
      const isTag    = ref.startsWith('🏷');
      const isRemote = ref.includes('/');

      const chip = isTag ? pal.chipTag : isRemote ? pal.chipRemote : pal.chipLocal;
      const chipBg = chip.bg, textColor = chip.text, borderColor = chip.border;

      const chipW = ctx!.measureText(ref).width + 12;
      ctx!.fillStyle = chipBg;
      roundRect(x, chipY, chipW, chipH, arc);
      ctx!.fill();
      ctx!.strokeStyle = borderColor;
      ctx!.lineWidth = 0.75;
      roundRect(x, chipY, chipW, chipH, arc);
      ctx!.stroke();
      ctx!.lineWidth = LINE_WIDTH;
      ctx!.fillStyle = textColor;
      ctx!.fillText(ref, x + 6, chipY + chipH - 3.5);
      x += chipW + 4;
    }
    return Math.max(x, startX + W_REFS);
  }

  function roundRect(x: number, y: number, w: number, h: number, r: number): void {
    ctx!.beginPath();
    ctx!.moveTo(x + r, y);
    ctx!.lineTo(x + w - r, y);
    ctx!.arcTo(x + w, y,     x + w, y + r,     r);
    ctx!.lineTo(x + w, y + h - r);
    ctx!.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx!.lineTo(x + r, y + h);
    ctx!.arcTo(x,     y + h, x,     y + h - r, r);
    ctx!.lineTo(x,     y + r);
    ctx!.arcTo(x,     y,     x + r, y,         r);
    ctx!.closePath();
  }

  function truncateText(text: string, maxWidth: number): string {
    if (!text) return '';
    if (ctx!.measureText(text).width <= maxWidth) return text;
    let t = text;
    while (t.length > 1 && ctx!.measureText(t + '…').width > maxWidth) t = t.slice(0, -1);
    return t + '…';
  }

  // ── Mouse events ───────────────────────────────────────────────────────────
  function onMouseMove(e: MouseEvent): void {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const row = Math.floor((e.clientY - rect.top + scrollY) / ROW_HEIGHT);
    if (row !== hoveredRow) hoveredRow = row;
  }

  function onMouseLeave(): void {
    hoveredRow = -1;
  }

  function onClick(e: MouseEvent): void {
    const rect = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
    const row = Math.floor((e.clientY - rect.top + scrollY) / ROW_HEIGHT);
    if (row < 0 || row >= index.rowCount) return;
    selectedRow = row;
    const node = index.nodesByRow[row];
    if (node) onSelectCommit?.(node.sha);
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    scrollY += e.deltaY;
  }

  /// Clears the row selection (Escape in App.svelte); the ancestry dim is
  /// driven by the selection in App.svelte and lifts with it.
  export function clearSelection(): void {
    selectedRow = -1;
  }

  /// Selects a row from outside (e.g. the detail sidebar's parent/child links)
  /// and scrolls it into view when it is off-screen. render() clamps scrollY.
  export function revealRow(row: number): void {
    if (row < 0 || row >= index.rowCount) return;
    selectedRow = row;
    const H = canvas?.height ?? 0;
    const top = row * ROW_HEIGHT;
    if (top < scrollY || top + ROW_HEIGHT > scrollY + H) {
      scrollY = top - H / 2 + ROW_HEIGHT / 2;
    }
  }
</script>

<canvas
  bind:this={canvas}
  onmousemove={onMouseMove}
  onmouseleave={onMouseLeave}
  onclick={onClick}
  onwheel={onWheel}
></canvas>

<style>
  canvas {
    display: block;
    cursor: default;
    width: 100%;
    height: 100%;
  }
</style>
