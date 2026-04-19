
## Goal
Push `/code-graph` and `/sentinel-graph` past the previous optimization pass — go from "smooth on 1k nodes" to "smooth on 3k+ nodes" without a full Canvas/WebGL rewrite.

## What's still expensive (after the last pass)

1. **Every tick still touches every node.** The simulation tick loop calls `setAttribute('cx'|'cy', …)` on N circles + N labels + M lines, ~12×/sec. At 2k nodes that's 6k DOM writes/frame triggering style recalc on the whole `<svg>` subtree.
2. **Edges are individual `<line>` elements.** Each one is a separate layer in the SVG render tree. 3k edges = 3k DOM nodes the browser repaints on any pan/zoom.
3. **Labels render even when zoomed out.** Tiny text below the legibility threshold still costs a text layout per label per frame.
4. **Pan/zoom re-applies a transform on the root `<g>`** — fine — but anything inside that uses non-transform animations (rings, ripples) forces full repaints inside the transformed layer.
5. **No viewport culling.** Nodes/edges off-screen are still in the DOM and still get tick updates.
6. **Sentinel ripples** keep `AnimatePresence` + 3 infinite `motion.circle` per selection, which Framer re-evaluates each frame.

## Approach

### A. Single-path edges (biggest win)
Replace the per-edge `<line>` elements with **one `<path>` per edge-style** (one for `imports`, one for `calls`, one for `contains`, etc.). Each tick, we rebuild a single `d="M x1 y1 L x2 y2 …"` string and assign it once. Going from 3000 DOM nodes → 3 DOM nodes for edges typically cuts paint by 5–10×.
- File: `src/components/CodeGraphCanvas.tsx`, `src/components/SentinelGraphCanvas.tsx`
- Highlighted/blast edges go in a separate overlay `<path>` so we don't touch the bulk path on hover.

### B. Transform-based node positioning
Switch each node group from `setAttribute('cx', …)` on `<circle>` + `setAttribute('x', …)` on `<text>` to a single `setAttribute('transform', 'translate(x,y)')` on the wrapping `<g>`. One write per node instead of 3–4, and `transform` updates skip layout — only compositing.

### C. Viewport culling
Track current pan/zoom (already in state). Each tick, for each node compute "is on screen with margin?". If off-screen:
- Hide the node `<g>` via `display: none` (not just opacity — `display:none` skips paint entirely).
- Skip its segment in the edges path.
Re-evaluate culling only every ~4 ticks (cheap diff) to keep the per-frame cost low.

### D. Zoom-tiered LOD
Three tiers driven by `zoom`:
- **z < 0.4** (zoomed out): no labels, no rings, no shadows; nodes drawn as flat circles only.
- **0.4 ≤ z < 0.9**: labels only on hovered/selected/search-matched/top-N important nodes (already partly there — tighten the cap from current threshold to a hard top-50).
- **z ≥ 0.9**: full detail.

### E. Stop animating on idle
After simulation `alpha < 0.02` for >500ms, stop the rAF tick entirely. Restart it on: hover, drag, zoom, data change, selection. Currently the loop keeps running at low alpha doing tiny no-op writes.

### F. Sentinel-specific
- Replace per-edge `<line>` with grouped `<path>` (3 paths: imports / calls / covers).
- Cap ripple rings to **1** instead of 3 (visually nearly identical, 3× cheaper).
- Disable the dead-glow filter entirely above 150 nodes (already partially done) and use a static red stroke instead.

### G. Will-change hint, sparingly
On the pan/zoom root `<g>`, add `style={{ willChange: 'transform' }}`. Do **not** apply it to nodes — that would balloon GPU memory.

## Files
- **edit** `src/components/CodeGraphCanvas.tsx` — grouped-path edges, transform-based node updates, viewport culling, LOD tiers, idle-stop tick loop.
- **edit** `src/components/SentinelGraphCanvas.tsx` — grouped-path edges, single ripple ring, transform-based nodes.
- No new deps. No worker changes. No metric changes.

## Out of scope
- Canvas/WebGL rendering (separate proposal if SVG ceiling is still hit at 5k+).
- Server-side layout precomputation.

## Verification
1. `/code-graph` with `facebook/react`-scale repo: pan/zoom stays at 60fps once cool; switching analysis modes no longer repaints the whole edge layer.
2. `/sentinel-graph` with sample data: ripple still visible, no jank on selection.
3. DOM node count for `<svg>` subtree drops by ~edge-count (verifiable via DevTools Elements panel).
