
## Goal
Group nodes visually by their top-level folder. Render a soft, lightly-coloured "zone" behind each folder's cluster of bubbles. Bubbles still float and connect as today — zones are a calm background layer.

## Approach

### 1. Derive folders from node paths
For each node, take the directory of its `file` (e.g. `src/api/impact.py` → folder `src/api`). Use the **first 2 path segments** as the zone key (so `src/api/*` and `src/utils/*` are distinct zones, but a flat repo with just `src/*` still groups). Files at root get a `"root"` zone.

Assign each zone a stable, light pastel colour by hashing the folder string into a hue, then rendering at very low saturation/high lightness (e.g. `hsl(H 35% 92% / 0.55)` on the paper texture) so it reads as a tint, not a fill.

### 2. Pull each zone together with d3 forces
Replace the single global `forceX/forceY` (which centres everything) with **per-zone X/Y forces** anchored at zone centroids. Centroids are arranged on a grid (or a circle) around the canvas centre, sized by zone node count, so zones don't overlap heavily.

```text
   ┌─ src/api ─┐   ┌─ src/utils ─┐
   │  • • •    │   │  • •        │
   └───────────┘   └─────────────┘
   ┌─ src ─────────────┐  ┌─ tests ─┐
   │  • • • • •        │  │ • •     │
   └───────────────────┘  └─────────┘
```

Forces:
- `forceX(zoneCx).strength(0.18)` and `forceY(zoneCy).strength(0.18)` per node based on its zone — strong enough to cluster, weak enough that `link` and `charge` still shape the layout.
- Keep existing link/charge/collide forces unchanged.
- Drop the global center force (zone forces replace it).

### 3. Render zone hulls behind everything
On every tick, compute each zone's bounding shape from its current node positions and draw it as the **first** child of the zoomed `<g>` (so it sits behind edges and nodes). Two options, picking the simpler:

- **Rounded bounding rect with padding** (chosen): for each zone, compute min/max x,y of its nodes, expand by ~28px, render `<rect rx="20">` with the zone's pastel fill + 1px dashed border in a slightly darker tint. Add a tiny `<text>` label in the top-left of the rect with the folder name in mono uppercase.

This is cheap, reads clearly, and avoids convex-hull jitter. (We can upgrade to `d3.polygonHull` later if requested.)

### 4. Layering & interaction
- Z-order inside `<g ref={gRef}>`: `zones` → `edges` → `nodes`.
- Zones are non-interactive (`pointerEvents: none`) so clicks still hit nodes / empty canvas.
- Highlight behaviour unchanged. When a node is selected, dim non-neighbour zones slightly (opacity 0.4 → 0.2) for focus.
- Add a small toggle in the bottom-right controls: `▦` to show/hide zones (default on).

### 5. Legend update
Add a "zones · folders" hint to the legend, with 2-3 small coloured swatches for the most populated folders.

## Files
- **edit** `src/components/CodeGraphCanvas.tsx` — folder derivation, per-zone forces, zone rect rendering, toggle, layering.

No backend, schema, or sample-data changes. Works for both the sample graph and live indexed repos.
