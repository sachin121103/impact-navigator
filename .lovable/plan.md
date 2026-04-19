
The user is on `/code-graph` and wants to reduce visual clutter via layers of abstraction. Let me look at the current graph rendering to design a concrete plan.
<lov-tool-use id="toolu_vrtx_01BAjouBAGaJkwqZg5w2NrUY" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/CodeGraph.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_0144jMnH3ktfjwo4UxgdKg39" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/CodeGraphCanvas.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Fo7QdjvDfmce3AGi4Xz1tT" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/sample-graph.ts\", \"lines\": \"1-80\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01XhDVy8Z1mLBn2v1eSskGEF" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/CodeGraph.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01F26xoMN9EX8fHoNQiPMKnL" name="code--view" integration-id="code" data="{\"file_path\": \"src/components/CodeGraphCanvas.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_014SyDGvNrCW6fbiAkYika6u" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/sample-graph.ts\", \"lines\": \"1-80\"}">
</lov-tool-use>
I have enough context. Let me present the plan.

<lov-plan>

## Goal
Reduce visual clutter in the Code Graph by introducing **layers of abstraction** — start at a high-level "module" view and let users drill down progressively into files, then classes/functions.

## The 3 Abstraction Levels

```text
Level 1 — MODULES        Level 2 — FILES          Level 3 — SYMBOLS
(folders/zones)          (current default-ish)    (full detail)

   ┌─────────┐               ●───●                    ●─●─●
   │ src/api │──┐         ●──●   ●──●               ●─◆─●─●─●
   └─────────┘  │         │      │                    ╱│╲
   ┌─────────┐  │         ●──●───●──●               ●─●─●─●
   │src/utils│──┘                                      │
   └─────────┘                                      ●──●──●
```

- **Level 1 (Modules)**: collapse every folder (e.g. `src/api`, `src/utils`, `tests`) into a single bubble. Edge weight = number of cross-folder imports/calls. ~10 nodes total — instantly readable.
- **Level 2 (Files)**: expand to file nodes only. Hide all class/function nodes. Show only `imports`/`include` edges between files. This is the "architecture" view.
- **Level 3 (Symbols)**: today's full graph — files + classes + functions + calls.

User switches via a **3-position segmented control** in the top toolbar (next to "Structure / Influence / Bottleneck Risk"). Level persists per session.

## Progressive disclosure
- **Default opens at Level 1** (Modules). Far less overwhelming on first paint.
- **Click a module → zooms into Level 2** filtered to that module's files (others fade to 8% opacity).
- **Click a file at Level 2 → zooms into Level 3** showing only that file's internal symbols + 1-hop neighbours.
- A **breadcrumb pill** (`All › src/api › graph.py`) appears top-center so the user always knows where they are and can jump back.

## How it's built (technical)

1. **New module: `src/lib/graph-layers.ts`**
   - `collapseToModules(payload)` → groups nodes by `zoneKey(file)` (already exists in `CodeGraphCanvas.tsx`), aggregates edges, returns a tiny `GraphPayload` with synthetic `module:src/api` ids and an `edgeWeight` field.
   - `collapseToFiles(payload)` → keeps only `type === "file"` nodes and `imports`/`include` edges.
   - `focusSubgraph(payload, rootId, hops)` → BFS from a root node, returns nodes within N hops.

2. **`CodeGraphCanvas.tsx` — minor additions**
   - Accept a new prop `abstractionLevel: "module" | "file" | "symbol"` and `focusRootId?: string`.
   - When level changes, the existing `useMemo` that builds `nodes`/`links` runs through the corresponding collapse helper before feeding the simulation. No physics changes needed.
   - Module nodes render as larger rounded rectangles with the folder name; edge stroke width scales with `edgeWeight`.
   - Wire `onSelect` so clicking a module/file at higher levels triggers level transition rather than just selection.

3. **`src/pages/CodeGraph.tsx` — UI additions**
   - Add `abstractionLevel` and `focusStack: string[]` state.
   - Add segmented control (`Modules | Files | Symbols`) next to the existing Analysis Mode toggle, styled to match.
   - Add breadcrumb pill (top-center, below analysis toggle) showing `focusStack` with click-to-pop behaviour.
   - Selecting a module from the click handler pushes onto `focusStack` and steps level down.

4. **Search behaviour**
   - Typing in the search box auto-jumps to Level 3 (Symbols) so matches are always visible. Cleared search returns to the user's last manual level.

## What stays the same
- All metrics (PageRank, betweenness, etc.) keep computing on the full graph in the worker — abstraction is purely a render-layer concern.
- Zone backgrounds, node tooltips, drawer, Architecture Health panel — unchanged.
- No changes to edge functions or backend.

## Files touched
- `src/lib/graph-layers.ts` (new)
- `src/components/CodeGraphCanvas.tsx` (accept level/focus, branch in nodes/links memo, render module shape)
- `src/pages/CodeGraph.tsx` (level state, segmented control, breadcrumb)

## Out of scope
- No changes to indexing, edge functions, or DB schema.
- No new dependencies.

