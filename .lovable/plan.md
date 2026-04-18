
The current /code-graph page has three competing zones (toolbar, big canvas, dense sidebar with stats + selection), all framed in cards with similar weight. Visual hierarchy is flat, the canvas is boxed-in, and the sidebar splits attention from the graph itself.

## Redesign goals
1. **One hero**: the graph itself, edge-to-edge, full viewport.
2. **Chrome dissolves**: toolbar + stats become floating, glassy overlays on top of the canvas — not boxes beside it.
3. **Detail on demand**: selection panel slides in only when a node is clicked.
4. **Empty-state breathing room** with a single, calm input at the centre when no repo is loaded.

## Layout

```text
┌─────────────────────────────────────────────────────────────┐
│  Compass  Meridian. / code graph              [stats pill]  │  ← thin floating top bar
│                                                             │
│                                                             │
│                  ◯ ── ◯ ─── ◯                              │
│              ◯       ╲     ╱                                │
│            ◯ ── ◯ ─── ●                FULL-BLEED CANVAS    │
│                  ╲   ╱                                      │
│                   ◯                                         │
│                                                             │
│                                                             │
│  [legend pill]                          [zoom controls]     │  ← bottom-corner floats
└─────────────────────────────────────────────────────────────┘
                                          ╲
                                           └─ slide-in detail
                                              drawer (right)
                                              when node selected
```

## Concrete changes

**`src/pages/CodeGraph.tsx`** — restructure to a single full-bleed shell:
- Remove the two-column grid. Canvas becomes `fixed inset-0` with the page as one layer.
- **Top bar** (floating, translucent): logo + breadcrumb on left; compact repo input (icon-only until focused, expands on click) + "Map repo" on right. Hide "Use sample" inside a small overflow menu.
- **Stats pill** (top-right, under the bar): one horizontal row — `142 files · 38 classes · 410 fns · 612 edges` in mono micro-type. No card, just a subtle backdrop-blur pill.
- **Selection drawer** (right side, `w-[360px]`, slides in via `animate-slide-in-right` only when `selected`): contains the existing detail content (type chip, name, file path, LOC/churn meta, connections list). Close button to dismiss.
- **Empty state** (when `data === SAMPLE_GRAPH` and no repo loaded yet): centred prompt "Map a repository" with the input front-and-centre, behind a faint version of the sample graph at low opacity — invites action without clutter.
- Remove the heavy stats card and combined sidebar entirely.

**`src/components/CodeGraphCanvas.tsx`** — small polish to support the new layout:
- Reduce the legend to a single-line pill with smaller dots, positioned with safer offsets so it doesn't overlap the drawer.
- Move zoom controls to bottom-right (away from top-right where the stats pill now lives).
- Drop the `cg-glow` background rectangle — let the page's paper texture show through for a calmer feel.
- Increase node label legibility for selected/file nodes (slight weight bump); dim non-highlighted edges further on selection (0.05) for stronger focus.

**No changes** to data layer, edge function, or routing.

## Visual tokens (reuse existing)
- Floating panels: `bg-card/70 backdrop-blur border border-border/60 shadow-paper rounded-full` (pills) or `rounded-lg` (drawer).
- Drawer entrance: existing `animate-slide-in-right` from tailwind config.
- Accent stays deep teal; risk colours unchanged.

## Result
- Graph fills the screen → maximum visual impact.
- Three small, quiet floats (bar, stats, legend/zoom) instead of four heavy cards.
- Detail appears contextually, not permanently — clutter drops by ~60%.
