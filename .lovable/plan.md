

## Why the graph looks like garbage on `resile`

`resile` is a Lovable-style React/TS repo: ~50 shadcn UI files in `src/components/ui/*`, big page components with heavy hooks/JSX, a single commit, and very few real cross-file imports outside `@/components/ui/*`. The current TS/JS parser was built around Python-style call graphs and falls over on this shape:

1. **shadcn boilerplate dominates** — ~50 `src/components/ui/*` files are kept as nodes but barely connect to anything, producing a big disconnected island.
2. **JSX is invisible** — `<Button />` / `<Card>…</Card>` are not parsed as edges, so the *real* component dependencies don't show up.
3. **Call regex catches everything that looks like `Ident(…)`** — `useState()`, `useMemo()`, `cn()`, `z.string()`, even types — and resolves callees by *bare name* against `fnIndex`. With many same-named helpers across files, calls resolve to the wrong file → fake spaghetti.
4. **Path-alias `@/…` imports aren't resolved** — `resolveJsImport` only handles relative `./`. So 90% of imports in a Lovable repo (`import { Button } from "@/components/ui/button"`) silently produce zero edges.
5. **Generated/config files included** — `tailwind.config.ts`, `vite.config.ts`, `src/integrations/supabase/types.ts`, `src/hooks/use-*` add visual noise without structure.
6. **No churn data** — single-commit repo → all file dots grey/uniform → the layout reads as a flat blob.

## Fix (scoped to `supabase/functions/graph-meta/index.ts`)

Five small, targeted changes — no UI work, no schema changes.

### 1. Resolve `@/…` and `~/…` path aliases
In `resolveJsImport`, if the spec starts with `@/` or `~/`, rewrite to `src/<rest>` (and try both `src/` and project-root) before walking extensions/index files. Detect alias prefix from `tsconfig.json` / `vite.config.ts` if present; fall back to `src/`.
**Effect**: connects the entire app — pages → components → ui primitives.

### 2. Capture JSX usage as `calls` edges
In `parseJs`, after `stripJsNoise`, scan for `<Capitalized` tag opens (excluding HTML tags via lowercase rule + a small allowlist of known DOM tags). Emit one `(containingFn → ComponentName)` per occurrence. Resolve via the import map built from this file's imports (spec → resolved file → that file's exported component name) — *not* via the global `fnIndex`.
**Effect**: real component dependency graph appears.

### 3. Resolve calls through the per-file import map, not bare-name guess
Build `importBindings: Map<localName, resolvedFilePath>` per file from the parsed `import { X, Y as Z } from "..."` specs. When emitting a call edge for callee `X`, prefer `importBindings[X]` → that file's `X` symbol. Only fall back to global `fnIndex[bare]` when nothing imports it (prevents wrong-file wiring).
**Effect**: kills the fake cross-file edges that make things look incoherent.

### 4. Filter React/JSX noise from `JS_CALL_RE` matches
Extend `JS_RESERVED` with: `useState`, `useEffect`, `useMemo`, `useCallback`, `useRef`, `useContext`, `useReducer`, `useLayoutEffect`, `useImperativeHandle`, `useId`, `useTransition`, `useDeferredValue`, `useSyncExternalStore`, `forwardRef`, `memo`, `lazy`, `Suspense`, `Fragment`, `cn`, `clsx`, `twMerge`, `cva`, `z`, `Object`, `Array`, `Number`, `String`, `JSON`, `Math`, `Promise`, `Date`, `Boolean`, `Error`, `Symbol`, `Map`, `Set`, `WeakMap`, `WeakSet`, `parseInt`, `parseFloat`, `Number`, `Boolean`, `Array`, `Object`, plus type-only call shapes like `useToast` / `useNavigate` if you want to keep router noise out.
**Effect**: cuts ~80% of phantom calls in TS repos.

### 5. Skip generated / config noise
Add to `SKIP_DIRS`: `src/components/ui`, `src/integrations`, `supabase` (the user's *own* `supabase/` folder when they map a Lovable app — it's generated edge-function glue from the user's perspective), `src/hooks` only when files match `use-toast|use-mobile` (allowlist by name, not a blanket dir skip).
Add to per-file skip in `shouldSkip`: `tailwind.config.*`, `postcss.config.*`, `vite.config.*`, `eslint.config.*`, `*.config.{js,ts,mjs,cjs}`.
**Effect**: removes ~70 boilerplate file nodes; remaining graph reads as the actual app.

### 6. (Tiny UI nudge) Show *why* it's sparse when no churn
In `CodeGraph.tsx`, when `meta.parsed_file_count > 0` and every node has `churn_score === 0`, render a one-line hint under the search bar: `Single-commit repo — heatmap disabled.` so users know it's not broken.

## Files touched
- `supabase/functions/graph-meta/index.ts` — items 1–5
- `src/pages/CodeGraph.tsx` — item 6 (one tiny hint banner)

## Out of scope
- Real TS AST parsing (would need swc/oxc — heavy)
- Type-aware import resolution from `tsconfig.json` paths beyond `@/`
- Dedicated React component layer (could be a follow-up: collapse JSX into a "uses component" edge type)

