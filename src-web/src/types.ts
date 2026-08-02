export type CommitKind = 'commit' | 'stash' | 'working';

export interface NodeJson {
  row: number;
  col: number;
  kind: CommitKind;
  sha: string;
  shortSha: string;
  message: string;
  author: string;
  authorDate: string;
  authorAvatar: string;
  committer: string;
  date: string;
  committerAvatar: string;
  refs: string[];
  /** Parent SHAs in commit order (first parent first); may include SHAs outside the loaded set. */
  parents: string[];
  /** SHAs of loaded children, newest (lowest row) first. */
  children: string[];
}

export interface Edge {
  sourceRow: number;
  sourceCol: number;
  targetRow: number;
  targetCol: number;
  isBranch: boolean;
  minRow: number;
  maxRow: number;
}

export interface GraphData {
  nodes: NodeJson[];
  edges: Edge[];
}

// ── Repository sidebar (ADR-0021) ──────────────────────────────────────────
// Refs and checkout locations, not history: each entry only carries the commit
// it resolves to, which is all the sidebar needs to navigate there.

export interface LocalBranch {
  name: string;
  sha: string;
  shortSha: string;
  isHead: boolean;
  /** Full upstream name (e.g. `origin/main`), null when none is configured. */
  upstream: string | null;
  /** Position against the upstream as of the last fetch — the viewer never fetches. */
  ahead: number;
  behind: number;
}

export interface RemoteBranch {
  /** Name without the remote prefix — the remote it sits under supplies that. */
  name: string;
  sha: string;
  shortSha: string;
}

export interface Remote {
  name: string;
  branches: RemoteBranch[];
}

export interface Worktree {
  name: string;
  path: string;
  /** Checked-out branch, null for a detached HEAD. */
  branch: string | null;
  sha: string;
  shortSha: string;
  /** The repository's main working tree, which git2 does not list as a worktree. */
  isMain: boolean;
}

export interface Tag {
  name: string;
  sha: string;
  shortSha: string;
}

export interface RepoRefs {
  locals: LocalBranch[];
  remotes: Remote[];
  worktrees: Worktree[];
  tags: Tag[];
}

/** Serde serializes the Rust enum variants camelCase — the statuses arrive lowercase. */
export type FileStatus = 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unknown';

/** Serde serializes the Rust enum variants camelCase — the kinds arrive lowercase. */
export type DiffLineKind = 'add' | 'delete' | 'context' | 'hunk' | 'meta';

export interface DiffLine {
  kind: DiffLineKind;
  content: string;
  oldLineno: number | null;
  newLineno: number | null;
}

export interface FileChange {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
}
