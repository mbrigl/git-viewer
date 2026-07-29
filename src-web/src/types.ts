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

export type FileStatus = 'Added' | 'Modified' | 'Deleted' | 'Renamed' | 'Copied' | 'Unknown';

export interface FileChange {
  path: string;
  oldPath: string | null;
  status: FileStatus;
  additions: number;
  deletions: number;
}
