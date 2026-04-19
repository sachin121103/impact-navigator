
## Goal
Make the **initial render** of `/code-graph` (and `/sentinel-graph`) look smooth and intentional instead of the current "explode then settle" jitter. Users can wait an extra 1–2s — they just need it to look composed.

## Why it's jittery now
1. Nodes start at **random positions** (d3 default), so the first ~30 ticks look like a violent firework before forces pull things into place.
2. The simulation begins at `alpha=1` and ticks render straight to the DOM — every chaotic intermediate frame is visible.
3. `alphaDecay=0.025` means ~150 ticks before settle. Combined with random init, that's ~12 seconds of visible churn.
4. There's no opacity fade-in — nodes/edges pop in at full strength while still in their wrong positions.
5. Zone rects update every tick during this chaos, expanding and contracting visibly.

## Approach (no UI redesign, just choreography)

### A. Pre-warm the simulation off-screen
Before the first paint, run **N silent ticks** in a `for` loop (no DOM writes) so positions are already near-settled by the time the user sees anything. d3 supports this — `sim.tick(n)` advances without firing the `tick` event handler.
- For ≤500 nodes: pre-run 120 ticks.
- For 500–2000: pre-run 80 ticks.
- For >2000: pre-run 50 ticks (cap, otherwise startup feels slow).
- Wrap in `requestIdleCallback` / `setTimeout(0)` so the loading state can render first.

### B. Deterministic seeded initial layout
Replace d3's random init with a **seeded radial placement by zone**: each node starts inside a small jittered circle around its zone anchor (already computed in `zoneAnchors`). This gives the pre-warm a sane starting point and means even the first visible frame already has the cluster structure.

### C. Fade-in choreography
- Hold the `<svg>` content at `opacity: 0` until pre-warm completes.
- Then crossfade to `opacity: 1` over 600ms via CSS transition on the root `<g>`.
- During the fade-in, run the simulation at a **lower alpha** (`0.3`) and slower decay so the small remaining motion looks like a gentle "breathe into place" instead of a snap.

### D. Loading scrim during pre-warm
Show a lightweight loading state ("Composing graph…") over the canvas area while pre-warm runs. Reuses existing glass panel style. Disappears in the same fade as the graph appears.

### E. Suppress zone rects until settled
Don't render zone rects during the initial fade-in — they currently morph wildly. Render them only after the first `setLayoutVersion` bump (already triggered when `alpha < 0.05`).

### F. Same treatment for SentinelGraphCanvas
Apply A, B, C to `SentinelGraphCanvas.tsx` — the radial placement and pre-warm tick loop are the same pattern.

## Files
- **edit** `src/components/CodeGraphCanvas.tsx` — seeded radial init, pre-warm tick loop, opacity fade-in, loading scrim, gate zone rects on settle.
- **edit** `src/components/SentinelGraphCanvas.tsx` — same pattern.

## Out of scope
- Changing the simulation forces or visual style.
- Animated entrance per-node (would re-introduce per-node React work).
- WebGL.

## Verification
1. Reload `/code-graph` with a large repo — see "Composing graph…" briefly, then the graph **fades in already-arranged**, with only gentle settling motion.
2. No more "explosion then collapse" first impression.
3. `/sentinel-graph` opens with nodes in their final clusters from frame 1.
