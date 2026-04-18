

## Goal
Drastically reduce lag on `/code-graph` (and similarly `/sentinel-graph`) for large repos by fixing the worst rendering and metric hotspots, while keeping the same visuals.

## Root causes (measured by code reading)
1. **Re-render storm during simulation.** `setTickCount` every 80ms re-renders thousands of `<g>` nodes, `<line>` edges, zone rects, AND re-runs `visibleLabelIds` (O(n²) collision check) and `zoneRects`. Already mutating DOM directly via refs makes the React rerender pure waste.
2. **`percentileRank` is O(n log n) per call**, and is called per-node twice per render (`analysisColor` + outer ring). Effectively O(n² log n) per render in PageRank mode.
3. **`computeBetweenness` uses `queue.shift()`** (O(n)) inside Brandes → O(n³ log n) overall. Also `computeAllMetrics` re-walks adjacency 4× and `computeGraphStats` calls `computeBetweenness` again if not cached (it is, fine — but pagerank/betweenness still dominate).
4. **`zoneRects` recomputed every tick** (~12×/s), iterating every node.
5. **Per-node SVG filters** (`url(#node-shadow)`) on thousands of nodes are very expensive in browsers.

## Approach (no UI changes)

### A. Stop re-rendering during simulation
- Remove `setTickCount` driven re-renders. Update zone rects and label positions via direct DOM mutation in the tick loop, the same way nodes/edges already are.
- Keep one cheap rAF-throttled state update only when zoom changes (already separate).
- Recompute `visibleLabelIds` and `zoneRects` only when: data changes, zoom crosses a threshold, selection/hover/search changes — never on every tick. Compute them on a debounced "simulation settled" callback (`alpha < 0.05`) plus on demand.

### B. Cache percentile arrays
- Precompute, once per `metrics` change: sorted pagerank values + an `id → percentile` Map, and store on the metrics object (or in a `useMemo` next to it). Replace `percentileRank(metrics.pagerank, n.id)` lookups with O(1) map reads.

### C. Faster Brandes
- Replace `queue.shift()` with an index pointer (`while (head < queue.length)` `queue[head++]`). That alone makes betweenness ~10–50× faster on 500+ node graphs.
- Avoid pre-seeding Maps with every id every iteration; use plain objects keyed by string and only set what's needed.
- For graphs with N > ~600, sample sources (already done in stats; do same for betweenness with a configurable cap, e.g. 200 sources, then upscale).

### D. Drop heavy SVG filters at scale
- For node count > 400, disable `url(#node-shadow)` on non-active nodes (use a flat `stroke` instead). Keep the active/hover shadow only on the focused node. This is the single biggest paint win.
- Disable `edge-highlight` blur filter when N edges > 800.

### E. Render budget
- When `nodes.length > 1500`, hide labels entirely except for active/hover/search matches and top-N important. Also drop the per-node animated rings (cycle/orphan/PageRank pulse) for non-active nodes — keep the colour ring instead.
- Skip rendering edges of type `contains` when N > 1000 (they add the most visual noise and DOM load with little signal).

### F. Move heavy metric compute off the main thread (optional, gated)
- Wrap `computeAllMetrics` in a Web Worker (Vite supports `new Worker(new URL(...), { type: "module" })`). Show the graph immediately with `metrics = undefined`; populate when worker resolves. Cancel previous worker on new data.
- This keeps the main thread responsive while metrics crunch.

## Files
- **edit** `src/components/CodeGraphCanvas.tsx` — kill `setTickCount`, mutate zone rects/labels via refs, gate filters & rings by node count, cache percentile map.
- **edit** `src/lib/graph-metrics.ts` — index-based BFS queue in Brandes, source-sampling for big N, expose `pagerankPercentile: Map<string, number>` on `GraphMetrics`.
- **edit** `src/pages/CodeGraph.tsx` — wrap `computeAllMetrics` in a worker (`src/lib/metrics.worker.ts`), show partial UI while pending.
- **add** `src/lib/metrics.worker.ts` — worker entry that imports from `graph-metrics.ts` and posts results back.
- **edit** `src/components/SentinelGraphCanvas.tsx` — same scale gating (skip per-node animated rings beyond a threshold) so it stays smooth for bigger graphs too.

## Verification
1. Load `/code-graph`, paste a large repo (e.g. `vercel/next.js` subset or `facebook/react`), confirm:
   - Initial layout still animates without UI freeze.
   - Switching to **Influence / Bottleneck Risk** modes no longer hangs the tab.
   - Pan/zoom stays at 60fps once simulation cools.
2. `/sentinel-graph` still demos smoothly with sample data (no regression).
3. Profile with `browser--performance_profile` before/after — confirm long-task count drops.

## Out of scope
- Switching to canvas/WebGL rendering (would be a much bigger rewrite — propose later if SVG ceiling is still hit at 5k+ nodes).
- Server-side metric precomputation in `graph-meta`.

