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
