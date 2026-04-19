

## Goal
The Functions (symbol) level dumps every class/function from every file into one giant hairball. Reduce what's drawn so it stays readable, without losing the ability to explore detail on demand.

## Strategy: "Show what matters, hide the rest"

Three combined techniques, each cheap to implement:

### 1. Default to a focused subgraph instead of the whole repo
At the Functions level with **no file focused**, today we render every symbol in the repo. Change the default behaviour:

- If the user lands on Functions level globally (no `focusStack` file), show only the **top N most important symbols** (by PageRank / degree, already computed in the worker) — e.g. top 80 symbols + their direct edges.
- A small badge in the toolbar reads: `Showing top 80 of 412 functions` with a `Show all` link to opt into the full view.

This is the single biggest win — turns 400+ nodes into ~80.

### 2. Collapse low-signal symbols into their parent file
Many files have 10+ tiny helpers (1-line getters, private utilities) that clutter the view. Roll them up:

- For each file, keep symbols that are **either**: (a) called from outside the file, (b) in the top X% by PageRank, or (c) above a LOC threshold.
- Remaining symbols collapse into a single `+ N more` chip attached to the file node. Clicking the chip expands that file's full symbol list inline.

### 3. Hide leaf "calls" edges by default
At Functions level, `calls` edges create most of the spaghetti. Render only:
- `contains` edges (file → its visible symbols), always.
- `calls` edges only **between visible symbols** (cross-file or high-importance).

Intra-file low-signal calls disappear unless that file is focused.

## UI additions

- **Toolbar density slider** (3 stops): `Essential · Balanced · All`. Controls N in technique #1 and the threshold in #2.
- **Per-file expand chip** rendered next to file nodes when symbols are hidden.
- **Tooltip hint** on hidden-count badge: "Hidden symbols are still searchable" — typing in search reveals matches even if they were collapsed.

## How it's built

1. **`src/lib/graph-layers.ts`** — add:
   - `topKSymbols(payload, metrics, k)` → returns subgraph of top-k symbol nodes + their files + edges between them.
   - `collapseLowSignalSymbols(payload, metrics, opts)` → returns `{ payload, hiddenByFile: Map<fileId, string[]> }`.

2. **`src/pages/CodeGraph.tsx`**:
   - Add `density: "essential" | "balanced" | "all"` state (default `balanced`).
   - When `abstractionLevel === "symbol"` and no file is focused, pipe `displayData` through `topKSymbols` then `collapseLowSignalSymbols` using the metrics already available from the worker.
   - Render density slider + hidden-count badge in the existing toolbar row.

3. **`src/components/CodeGraphCanvas.tsx`**:
   - Accept `hiddenByFile` prop. For each file node with hidden symbols, render a small `+N` chip (group with rect + text) positioned near the node.
   - Click chip → call new `onExpandFile(fileId)` callback that pushes the file into `focusStack` (existing drill-down path already works).

4. **Search integration**: when search is non-empty, bypass collapsing/top-K so matches always appear (extends the existing "search jumps to Functions level" rule).

## What stays the same
- All abstraction-level logic, breadcrumb, module/file collapse, ComposingScrim, worker metrics — untouched.
- No backend or schema changes.

## Files touched
- `src/lib/graph-layers.ts` (add 2 helpers)
- `src/pages/CodeGraph.tsx` (density state, slider, wiring)
- `src/components/CodeGraphCanvas.tsx` (render `+N` chips, expand callback)

## Out of scope
- Manual hide/show per node, saved density per repo, animated expand transitions.

