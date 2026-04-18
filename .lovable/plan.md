
## Sentinel Graph — replace Code Star

A new page that turns the existing `/code-star` route into `/sentinel-graph`, with three connected features: a color-coded dependency graph, a BFS "ripple" impact analysis, and a Blast Radius Test Orchestrator.

### What gets built

**1. New page `src/pages/SentinelGraph.tsx`** (replaces `CodeStar.tsx`, route `/sentinel-graph`, with `/code-star` redirecting there). Nav link in `Index.tsx` updated from "Code Star" → "Sentinel Graph".

**2. Graph data layer `src/lib/sentinel-graph.ts`**
- TypeScript types: `SGNode { id, label, kind: 'file'|'function'|'test', ext?: 'ts'|'tsx'|'js'|'py'|'css'|'other', path }`, `SGEdge { from, to, kind: 'imports'|'calls'|'covers' }`.
- Built-in JSON sample (~25 nodes including 5 test nodes, realistic ts/py/css mix, one obvious dead file).
- Helpers: `bfsDownstream(graph, startId)` → ordered array with depth, `findDeadNodes(graph)` → nodes with zero incoming non-test edges, `testsForBlast(graph, blastIds)` → unique test nodes whose `covers` edge lands in the blast set.
- `estimateTestTime(tests)` — each test node carries an `avgMs` (seeded), full-suite total = sum of all tests; saved = full − selected.

**3. Graph canvas `src/components/SentinelGraphCanvas.tsx`** (SVG, no new deps)
- Force-ish deterministic layout (seeded radial + small relaxation, similar approach to existing `CodeGraphCanvas`).
- Node color by ext: ts/tsx = teal accent, py = amber, css = sage, test = ink with flask icon, other = muted. Dead nodes get a red ring + slow pulsing glow (`animate-pulse` + drop-shadow filter).
- Edge styles: imports = thin solid, calls = dashed, covers (test→target) = dotted accent.
- Click handler → sets `selectedId`, triggers Impact Mode.
- Framer Motion ripple: on selection, render concentric `<motion.circle>` rings expanding from the node (scale 0→4, opacity 0.4→0, staggered by depth). Downstream nodes fade non-blast nodes to 20% opacity and pulse blast nodes in BFS depth order using `transition={{ delay: depth * 0.08 }}`.
- Legend chip row at bottom (file types, dead, test, blast).

**4. Side panel (right column of `SubPageShell`'s `panel` slot)**
- Three modes via tabs: **Overview**, **Impact**, **Blast Radius**.
- Overview: counts (files, tests, dead nodes), "Toggle Dead Code Mode" switch (highlights dead in canvas).
- Impact: shown when a node is selected. Lists downstream nodes grouped by depth with risk pill (depth 1 = HIGH, 2 = MED, 3+ = LOW), reusing the visual language from Impact Radar.
- Blast Radius: "Mark as modified" button on selection → computes blast set + impacted tests. Shows:
  - Test Execution Plan table (test name, file path, est. ms, covers count).
  - Stats row: `X / Y tests` to run, `Estimated time` vs `Full suite`, `Time saved` (ms + %), with a thin progress bar.
  - "Copy plan" button (copies test paths as a `pytest`/`vitest`-style command).

**5. Framer Motion** — already not in deps; install `framer-motion`. Use only for ripple rings and node fade/pulse — keep bundle impact small.

### Files
- **add** `src/pages/SentinelGraph.tsx`
- **add** `src/components/SentinelGraphCanvas.tsx`
- **add** `src/lib/sentinel-graph.ts` (with embedded sample JSON)
- **edit** `src/App.tsx` — add `/sentinel-graph` route, keep `/code-star` as redirect to `/sentinel-graph`
- **edit** `src/pages/Index.tsx` — rename nav entry "Code Star" → "Sentinel Graph", update link target
- **delete** `src/pages/CodeStar.tsx` (no longer referenced)
- **add dep** `framer-motion`

### Out of scope (this pass)
- Real repo parsing for Sentinel Graph (uses curated JSON sample so the killer feature is demoable instantly). A "Paste repo" hookup to the existing `graph-meta` function can come next — noted but not built now.
- Persisting modified-node selections across reloads.
- Actually executing tests — the orchestrator outputs a plan only.

### Verification
1. `/sentinel-graph` loads, graph renders with colored nodes; one dead file glows red.
2. Click any node → ripple animates outward, downstream nodes pulse in order, Impact tab populates.
3. Switch to Blast Radius tab → table lists only tests connected to the blast set, with time-saved stats matching `full − sum(selected)`.
4. Toggle Dead Code Mode → red glow intensifies; non-dead nodes desaturate.
