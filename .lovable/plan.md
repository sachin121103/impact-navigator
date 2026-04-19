
## Goal
Eliminate the lag spike when the cursor sweeps through dense clusters of small nodes on `/code-graph`.

## Root cause
Every small node has its own `onMouseEnter`/`onMouseLeave` that calls `setHoveredId(...)`. Sweeping through a cluster fires this **dozens of times per second**, and each one triggers:
1. A full React re-render of the canvas tree (thousands of `<g>` nodes).
2. Recompute of `highlight` neighbour set + `visibleLabelIds` (sorts all N nodes).
3. `useEffect` → `__restart` wakes the simulation back up to `alpha 0.1`.
4. Edge overlay path rebuild.

So a 200ms cursor sweep across 30 tiny nodes = ~60 full re-renders + 60 sim restarts = visible freeze.

## Approach (your instinct is right — debounce + smarter pick)

### 1. Debounce hover state (the main fix)
Replace the per-node React `onMouseEnter`/`Leave` with a **single `pointermove` listener on the SVG**, plus a small debounce (~40ms) before committing to `setHoveredId`. Mid-sweep transitions never reach React state — only the node the cursor actually rests on does.

### 2. Spatial hit-testing instead of per-node handlers
On `pointermove`, convert client coords → graph coords using the current zoom transform, then find the nearest node within `r + 4px` using a quick scan (or a cached quadtree if N > 1000). Drop the per-node mouse handlers entirely. This also means:
- Fewer event listeners attached to the DOM (tiny memory + paint win).
- Hit area can be slightly inflated for small nodes (currently ~3px radius is hard to hit anyway — bonus UX).

### 3. Don't restart the simulation on hover
The `useEffect` at line 619 calls `__restart` whenever `finalHighlight` changes. Hover changes shouldn't wake physics — only the overlay path needs repainting. Split into:
- Hover change → directly rebuild the edge overlay path via ref (no sim restart, no React tree rerender of nodes).
- Selection / search change → keep the restart (these legitimately want a tick).

### 4. Skip hover entirely on tiny nodes when zoomed out
When `zoomLevel < 0.6`, function-type nodes are visually <2px and hovering them is unintentional. Disable hover pickup for `type === "function"` below that zoom — only files/classes respond. Removes the worst-case cluster (function clumps) from the hot path.

### 5. requestAnimationFrame coalescing
The pointermove listener writes to a `pendingHoverId` ref. A single rAF loop reads it and only calls `setHoveredId` when the value differs from the current state. This guarantees max one update per frame regardless of mouse sample rate (some mice fire 1000Hz).

## Files
- **edit** `src/components/CodeGraphCanvas.tsx`
  - Add SVG-level `onPointerMove` with rAF-coalesced + 40ms debounced hover pick.
  - Build a simple spatial index (rebuilt on `layoutVersion`) for nearest-node lookup.
  - Remove `onMouseEnter`/`onMouseLeave` from each node `<g>`.
  - Split the `__restart` effect: hover doesn't restart, selection/search still does.
  - Gate hover on `function` nodes when `zoomLevel < 0.6`.

## Out of scope
- SentinelGraphCanvas (different scale, not reported).
- Touch/click behaviour — unchanged.
- Visual styling of hover ring.

## Verification
1. Sweep cursor rapidly through a dense cluster of small function nodes — no visible jank, no simulation re-energising.
2. Hovering a single node still highlights it + neighbours within ~50ms.
3. Click selection still works exactly as before.
4. At low zoom, sweeping across function clumps is silent; files/classes still respond.
