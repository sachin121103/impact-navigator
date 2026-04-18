

## Goal
Make the Code Graph easier to read by reducing label overlap and visual noise — without redesigning the layout. Focus on **labels**, **density**, and **focus mode**.

## Why it's cluttered today
- All file/class labels show by default and sit to the right of every node — neighbouring bubbles overlap their label text.
- Even with a selection, dimmed nodes/edges still draw text at full size.
- Zone labels and node labels can collide near zone borders.
- Default `linkDistance: 80` + `repel: -180` packs nodes tightly at typical zoom.

## Approach (small, targeted changes — single file)

### 1. Smarter label visibility (biggest win)
Instead of "show all labels above zoom X", show labels by **importance + interaction**:
- **Always show:** selected/hovered node + its direct neighbours (already partly done; extend it).
- **Show by degree:** only show labels for the top N most-connected nodes per zone (e.g. top 3 files, top 2 classes, top 1 fn) at default zoom. Reveal more as user zooms in.
- **Hide labels on dimmed nodes** entirely when something is selected/searched (currently they still render).
- Raise label size threshold for functions to `zoomLevel > 1.8` (was 1.4) — function labels are the densest tier.

### 2. Collision-aware label placement
Cheap trick: after each tick, for each visible label, check if its bounding box overlaps a previously-placed label in the same frame; if so, hide it (or flip to left side). Implementation: maintain an array of placed `{x,y,w,h}` rects per tick, skip rendering text when a collision is detected. No external lib needed; runs only for labels that pass step 1's filter, so it's cheap.

### 3. Label background pill for readability
Wrap each visible label in a tiny rounded `<rect>` with the paper background colour at ~85% opacity behind the text. Makes text legible when it crosses an edge or another node.

### 4. Looser default density
- Bump `DEFAULT_PHYSICS.linkDistance` from `80` → `110`.
- Bump `forceCollide` radius padding from `+8` → `+14`.
- Slightly weaker `centerStrength` (0.06 → 0.04) so zones spread out more.

This gives labels more room without changing the layout style.

### 5. Focus mode toggle
Add a `◉` button to the right-side control stack: when on, the canvas only renders the selected node, its 1-hop neighbours, and the edges between them — everything else fades to ~5% opacity. Effectively a "isolate" mode for tracing one symbol's relationships. Defaults off.

### 6. Hover affordance
Show a small label even for nodes below the visibility threshold when hovered (already works for selected — extend to hover with a slight fade-in). Already partially done; verify no regression after step 1.

### 7. Zone label tweak
Move zone labels into a small pill at the top-left corner of each rect with the paper-tone background, so they don't blend into node labels nearby.

## Files
- **edit** `src/components/CodeGraphCanvas.tsx` — label filter logic, per-tick collision dedupe, label pills, default physics tweaks, focus-mode toggle + button, zone label pill.

No backend, schema, or other component changes.

## Out of scope (can add later if needed)
- Full force-directed label layout (e.g. `d3-labeler`) — overkill for now.
- Edge bundling.
- Per-zone collapse/expand into a single super-node.

