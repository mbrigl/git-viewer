use serde::{Deserialize, Serialize};

/// Distinguishes regular commits from the synthetic nodes we surface in the
/// graph (a stash entry, or the working-directory "uncommitted changes" node).
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum CommitKind {
    Commit,
    Stash,
    Working, // uncommitted working-directory changes (no real OID)
}

/// Raw commit data as loaded from git2, before any layout is assigned.
#[derive(Debug, Clone)]
pub struct CommitData {
    pub sha: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub author_time: i64, // Unix epoch seconds — when the change was written
    pub committer_name: String,
    pub committer_email: String,
    pub commit_time: i64, // Unix epoch seconds — when the commit was created (drives layout/sort)
    pub refs: Vec<String>,
    pub parent_shas: Vec<String>,
    pub kind: CommitKind,
}

/// A commit enriched with graph layout coordinates.
/// Uses Vec<usize> for adjacency (index-based, not object references).
#[derive(Debug, Clone)]
pub struct Node {
    pub commit: CommitData,
    pub row: i32,                   // -1 = unassigned; 0 = newest
    pub col: i32,                   // -1 = unassigned; 0 = leftmost
    pub source_indices: Vec<usize>, // parent nodes (older, higher row)
    pub target_indices: Vec<usize>, // child nodes (newer, lower row)
}

/// A connection between a child commit and one of its parents.
/// `is_branch` marks a BRANCH edge (the first parent, staying in one column);
/// otherwise it is a MERGE edge, which crosses columns.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Edge {
    pub source_row: i32,
    pub source_col: i32,
    pub target_row: i32,
    pub target_col: i32,
    pub is_branch: bool,
    pub min_row: i32,
    pub max_row: i32,
}

/// The serializable form of a node sent to the frontend.
/// The camelCase field names are the contract the canvas renderer reads.
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeJson {
    pub row: i32,
    pub col: i32,
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub author: String,
    pub author_date: String,
    pub author_avatar: String, // Gravatar URL (empty if no email); 404s when no avatar exists
    pub committer: String,
    pub date: String, // committer date
    pub committer_avatar: String,
    pub refs: Vec<String>,
    pub kind: CommitKind,
}

/// The complete laid-out graph: every node with its row and column, plus all edges.
#[derive(Debug, Serialize)]
pub struct Graph {
    pub nodes: Vec<NodeJson>,
    pub edges: Vec<Edge>,
}

#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum FileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
    Unknown,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum DiffLineKind {
    Add,
    Delete,
    Context,
    Hunk,
    Meta,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffLine {
    pub kind: DiffLineKind,
    pub content: String,
    pub old_lineno: Option<u32>,
    pub new_lineno: Option<u32>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub old_path: Option<String>, // only set for renames
    pub status: FileStatus,
    pub additions: u32,
    pub deletions: u32,
}
