
## Goal
Make Impact Radar actually work: user types a function name → backend resolves it in an indexed repo → returns ranked downstream callers → radar visualizes them.

## Approach

### 1. New edge function `impact-analyze` (synchronous, fast)
The earlier plan suggested background jobs, but BFS over the `edges` table is cheap (single SQL per depth, capped). Keep it synchronous for snappy UX.

Input: `{ repoUrl?, repoId?, query }`

Steps:
1. Resolve `repo_id` from `repos` (by `id` or `url`). Require `status='ready'`. 404 otherwise.
2. Resolve target symbol: exact match on `name` or `qualified_name` within repo → fallback `ilike '%query%'` → pick highest `fan_in`. 404 if none.
3. **BFS upstream** (callers) up to depth 4, capped at 200 nodes total. Query `edges` where `target_id IN (frontier)` per level, dedupe, track `depth` and `edgeKind`.
4. Fetch symbol metadata for collected ids.
5. Score: `risk = 0.5*(1/depth) + 0.3*norm(fan_in) + 0.2*norm(churn)`. Bucket high>0.66 / med>0.33 / low.
6. Persist row in `impact_runs` (best-effort).
7. Return `{ target, affected[], summary:{high,med,low,total,depthMax} }`.

CORS + zod validation + `verify_jwt=false` config block.

### 2. Frontend wiring

**`ImpactInput.tsx`** — make controlled: add `value`, `onChange`, `onSubmit`, `loading` props. Disable + spinner when loading.

**`ImpactRadar.tsx`** — add state (`repoUrl`, `query`, `result`, `loading`, `error`):
- Small repo URL field above prompt (persisted to `localStorage`).
- Submit → `supabase.functions.invoke('impact-analyze', ...)`.
- Right panel switches between: empty hint → loading → ranked list grouped High/Med/Low (name, file:line, depth chip, mini risk bar) → error message.
- Legend pill shows real counts when result present.

**New `ImpactRadarVisual.tsx`** — replaces decorative `RadarVisual` once a result exists:
- 4 concentric rings = depth 1..4 (closest = most directly impacted).
- Each affected symbol = dot at `angle = hash(id) % 360`, radius scales with `risk`, color by bucket (`--risk-high/med/low`).
- Center node = target function (label below).
- One-shot sweep animation on new result; pulse on highest-risk dot.
- Hover dot ↔ highlight row in panel via shared `selectedId`.

### 3. States
- No repo indexed → inline note "Index this repo on Code Graph first →".
- No match → "No symbol matching `xxx` found".
- Loading → dim radar + "Analyzing impact…" pill.

## Files
- **new** `supabase/functions/impact-analyze/index.ts`
- **new** `src/components/ImpactRadarVisual.tsx`
- **edit** `src/components/ImpactInput.tsx`
- **edit** `src/pages/ImpactRadar.tsx`
- **edit** `supabase/config.toml` (add `[functions.impact-analyze] verify_jwt = false`)

No DB migrations — all tables/RLS already in place.
