

## Goal
Make the Code Graph (`/code-graph`) work for JavaScript/TypeScript repos (like `sachin121103/impact-navigator`), which currently return 0 nodes because the parser only handles Python/C/C++.

## Root cause
`supabase/functions/graph-meta/index.ts` filters files with:
```
KEEP_EXT = {.py, .ipynb, .c, .h, .cpp, .hpp, .cc}
```
Any TS/JS-only repo therefore yields `file_count: 0` → empty graph.

## Approach
Extend `graph-meta` to also parse `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`, `.cjs`. Reuse the same node/edge contract (`file`, `function`, `class`, `imports`, `calls`).

### Changes to `supabase/functions/graph-meta/index.ts`

1. **File filter** — add JS/TS extensions to `KEEP_EXT`. Also skip `.d.ts`, `node_modules`, `dist`, `build`, `.next`, test files (`*.test.*`, `*.spec.*`, `__tests__`).

2. **JS/TS parser** (`parseJs`) — regex-based, mirroring `parsePy`:
   - Strip block & line comments and string/template literals before scanning (avoids false matches).
   - Detect:
     - `function name(...)` and `async function name(...)`
     - `class Name { ... }` with method declarations inside
     - `const name = (...) => { ... }` / `const name = function(...) {}` arrow & expression functions
     - `import ... from 'x'` / `import 'x'` / dynamic `import('x')` / CommonJS `require('x')`
   - Track nesting (brace depth) to attribute calls to the innermost containing function — same shape as the Python pass.

3. **Import resolution** — for relative imports (`./foo`, `../bar/baz`), resolve against the importer's directory and try extensions `.ts, .tsx, .js, .jsx, .mjs, .cjs` plus `/index.*`. Emit an `imports` edge if the resolved path matches a known file node. Bare imports (e.g. `react`) are ignored.

4. **Call resolution** — same deferred pass as Python: store `[callerId, calleeBareName]`, then resolve via `fnIndex` after all files are parsed.

5. **No schema, no UI changes** — graph response shape stays identical, so `CodeGraphCanvas` renders TS repos with no further edits.

### Files
- **edit** `supabase/functions/graph-meta/index.ts` — add JS/TS extensions, parser, import/call resolution.
- **deploy** `graph-meta` edge function after edit.

### Verification
After deploy, hit:
```
GET /functions/v1/graph-meta?repo=https://github.com/sachin121103/impact-navigator
```
Expect `_meta.file_count > 0` and a populated `nodes`/`edges` array, then load `/code-graph` and confirm the visualization renders.

## Out of scope
- Type-aware resolution (TS compiler API) — overkill for a regex parser.
- Bare-import resolution to `node_modules` — irrelevant for an in-repo call graph.
- Vue/Svelte/Go/Rust — can be added later in the same pattern.

