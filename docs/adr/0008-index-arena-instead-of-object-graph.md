# ADR-0008: Index arena instead of a reference-linked object graph

- **Status:** 🟢 accepted
- **Date:** 2026-07-29
- **Deciders:** Maintainer
- **Note:** Transferred from the earlier Git Graph Viewer implementation (commit `fd64b3a`), where
  this decision was already in effect. Restated here in this repository's ADR format for review.

## Context

The layout algorithm needs to walk the commit graph in both directions: from a commit to its parents
(older commits) and to its children (newer commits). That is a cyclic reference structure, and it is
mutated in place while rows and columns are assigned.

In Rust, a graph of nodes holding mutable references to each other cannot be expressed directly —
the borrow checker rejects it. How the graph is represented therefore has to be decided once, up
front, because every part of the layout code reads and writes it.

## Decision

We will store all nodes in a flat arena — a `Vec<Node>` — and express every reference to another
node as a `usize` index into that arena:

```rust
pub struct Node {
    pub source_indices: Vec<usize>, // parent nodes (older commits)
    pub target_indices: Vec<usize>, // child nodes (newer commits)
    // ...
}
```

A `HashMap<String, usize>` (`sha_to_idx`) maps commit SHAs to arena indices while the graph is being
wired up and is dropped afterwards.

## Alternatives considered

- **`Rc<RefCell<Node>>`** — allows reference cycles, but moves borrow checking to runtime, adds
  per-node allocation and refcount overhead, and can panic on an aliasing mistake instead of failing
  to compile.
- **`Arc<Mutex<Node>>`** — the thread-safe variant of the above; far heavier than needed for an
  algorithm that runs single-threaded on one owned data structure.
- **`petgraph` or another graph crate** — a proven representation, but adds a dependency and a
  general-purpose API for a graph we build once, traverse twice, and then serialise.
- **`unsafe` raw pointers between nodes** — fastest in theory, but trades a whole class of
  compile-time guarantees for an optimisation nothing demands.

## Sources / Prior art

- N. Matsakis, *Modeling graphs in Rust using vector indices* —
  <https://smallcultfollowing.com/babysteps/blog/2015/04/06/modeling-graphs-in-rust-using-vector-indices/>
- The `petgraph` crate, which uses the same index-based representation internally —
  <https://docs.rs/petgraph>
- *The Rust Programming Language*, ch. 15.6 on reference cycles and `Rc<RefCell<T>>` —
  <https://doc.rust-lang.org/book/ch15-06-reference-cycles.html>

## Consequences

- Positive: no `unsafe`, no `Rc`/`RefCell` overhead, no runtime borrow panics; nodes lie contiguously
  in memory, which is cache-friendly for the row and column passes; the borrow checker is worked
  with rather than around.
- Negative / trade-offs: the algorithm reads as index arithmetic rather than object navigation; an
  index carries no type-level guarantee that it points at a live node (only the standard bounds
  check protects it); `sha_to_idx` has to be maintained separately during construction.
- Follow-ups: none.
