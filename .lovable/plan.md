
## Goal
Stop the small (function-type) nodes from clumping at zone centers and rapidly jittering once the graph is "settled".

## Why it's happening
1. **Collide radius is the same for all nodes** (`nodeR(d) + 14`). For tiny degree-0 function nodes (`r ≈ 3`), the collider is 17px — but `forceX/Y` keeps pulling them all to the same zone anchor with equal strength, so they pack into a tight circle and oscillate against each other and the centering force.
2. **`forceX/Y` strength is uniform** (`physics.centerStrength = 0.04`). High-degree nodes get pulled into place by their many links and stop moving. Low-degree nodes have nothing else acting on them, so the centering force keeps fighting collide → constant micro-jitter.
3. **`velocityDecay` is at d3 default (0.4)** which is too low for our setup — residual velocity bounces around the collide perimeter.
4. **Idle-stop only triggers below `alpha < 0.02`**, but the centering↔collide tug keeps alpha hovering around 0.03–0.04 indefinitely on dense zones, so the sim never actually stops.
5. The initial "breathe" restart at `alpha 0.3` with `alphaDecay 0.05` re-energizes this oscillation right after the pre-warm.

## Approach (CodeGraphCanvas only — no UI/visual changes)

### A. Higher velocity decay
Set `sim.velocityDecay(0.6)` (up from default 0.4). This dampens residual motion fast and is the single biggest jitter killer for orbital clumping.

### B. Per-node alphaMin gate via stronger idle-stop
Lower the idle-stop threshold to `alpha < 0.05` (currently 0.02) and shorten the timer to 300ms. The graph is visually settled well before 0.02; we're just paying for invisible motion. This is safe because the existing `__restart` hook re-energizes on hover/zoom/drag.

### C. Tapered centering for low-degree nodes
Make `forceX/forceY` strength scale inversely with degree:
```
strength = base * (0.3 + 0.7 / (1 + degree * 0.5))
```
Wait — that's backwards for the problem. The fix is the opposite: **reduce** centering strength on low-degree nodes so they're not constantly pulled into the pile. Use:
```
strength = base * (degree === 0 ? 0.15 : Math.min(1, 0.4 + degree * 0.1))
```
Low-degree nodes drift gently outward and find a stable spot against the collider; high-degree (already anchored by links) keep their pull.

### D. Slightly smaller collide padding for tiny nodes
Change `forceCollide.radius` from `nodeR(d) + 14` to `nodeR(d) + (d.degree ? 8 : 5)`. Lonely small nodes don't need a 14px personal bubble — that's what's forcing them to orbit. Tighter packing = stable contact instead of jittering.

### E. Cap minimum alpha during the "breathe" phase
After pre-warm, instead of `alpha(0.3).alphaDecay(0.05)`, use `alpha(0.2).alphaDecay(0.08).alphaMin(0.05)`. Decays roughly as fast visually but hits the stop threshold cleanly.

## Files
- **edit** `src/components/CodeGraphCanvas.tsx` — sections A–E above. All in the existing simulation builder block (lines ~300–340 + idle-stop at ~498).

## Out of scope
- SentinelGraphCanvas (different layout, no jitter complaint).
- Visual styling, colors, sizes.
- Force model rewrite.

## Verification
1. Reload `/code-graph` with the current repo. After pre-warm fade-in completes, watch a dense cluster of small function nodes — they should settle and **stop moving** within ~1s instead of jittering indefinitely.
2. Hover/drag/zoom still re-energizes the simulation correctly (existing `__restart` hook).
3. No visible change to final node positions — just stillness.
