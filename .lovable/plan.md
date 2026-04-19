

## Why TestPath finds "dead" functions in psf/requests

Let me read the TestPath logic to understand the dead-function detection.
<lov-tool-use id="toolu_vrtx_01WFjphZaqFPzvTpCmFr1yLb" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/testpath.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01JR12KgfHk1n3z6zE4YnsEY" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/TestPath.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01NsVbjS2Fu47TzirX43fLHT" name="code--view" integration-id="code" data="{\"file_path\": \"src/lib/testpath.ts\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01R9uevwcbEqQqHfdzfXoXHm" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/TestPath.tsx\"}">
</lov-tool-use>
I have enough context. The dead code detection in `findDeadCode` is naive: it flags ANY function with zero inbound graph edges as "no callers". For Python repos like `psf/requests`, this misses tons of real usage:

1. **Public API exports** — `requests.get`, `requests.post`, etc. are called by external users, not internal code. Zero inbound edges in the graph ≠ dead.
2. **Methods called via instance/duck typing** — `session.get()`, `response.json()` — the parser likely doesn't resolve these to the class method symbol.
3. **Magic methods** — `__init__`, `__enter__`, `__exit__`, `__repr__`, `__getattr__`, etc. are called by Python itself, never appear as explicit callees in the graph.
4. **Decorators / hooks / overrides** — `@property`, `@classmethod`, fixture functions, `setUp`/`tearDown` — invoked by frameworks, not by name.
5. **Re-exports in `__init__.py`** — symbols imported and re-exposed but never "called" inside the repo.
6. **Same-file calls invisible** — current parser may emit inbound edges only across files; intra-file callers don't count if `parseJs`/`parsePy` skips them.

<lov-plan>

## Why TestPath flags so many "dead" functions on `psf/requests`

`findDeadCode()` (in `src/lib/testpath.ts`) marks any function/class with **zero inbound graph edges** as dead. That's far too aggressive for a real library — especially a Python one like `requests` — because the dependency graph cannot see several legitimate callers:

1. **Public API surface** — `requests.get/post/put/delete/...`, `Session.request`, etc. are called by *consumers of the library*, not by code inside the repo. Zero internal callers ≠ unused.
2. **Dunder / magic methods** — `__init__`, `__enter__`, `__exit__`, `__iter__`, `__repr__`, `__getattr__`, `__call__`, `__del__` are invoked by the Python runtime itself, never as explicit calls in source.
3. **Method dispatch** — calls like `session.get(...)` or `response.json()` don't resolve to a specific class method in the graph (the parser only knows the bare name "get", which collides), so the inbound edge is dropped or misrouted.
4. **Framework / decorator hooks** — `@property`, `@classmethod`, pytest fixtures, `setUp`/`tearDown`, `urllib3` adapter overrides — invoked by name from outside, not by direct call sites.
5. **Re-exports** — symbols imported into `requests/__init__.py` and re-exposed are "imported but not called" → flagged.
6. **Test-only callers excluded** — if a function is only exercised by tests, that should make it *covered*, not *dead*.

## Fix — make `findDeadCode` evidence-based, not absence-based

Scoped to **`src/lib/testpath.ts`** (one file, no edge-function or schema changes).

### 1. Skip dunder methods entirely
Bail before flagging when `node.name` matches `/^__[a-z]+__$/` (or ends with `::__name__`). These are runtime-invoked.

### 2. Treat public-API symbols as "exported, not dead"
A function is considered **public** when any of:
- File ends in `__init__.py` and the symbol name doesn't start with `_`.
- The symbol is referenced by an `imports` edge from another file inside the repo (re-export).
- File is `setup.py`, `conftest.py`, `cli.py`, `__main__.py`, or in a `bin/` folder.
- Name is in a small allowlist of conventional entry points (`main`, `cli`, `app`, `handler`, `lambda_handler`, `wsgi`, `asgi`, `application`).

Public symbols never appear in the dead list.

### 3. Treat test-covered functions as alive
Reuse `findCoveringTests`. If any test reaches a symbol via reverse-BFS, it is **not** dead — even if no production code calls it. (Currently coverage and dead-code lists overlap, which is the worst of both worlds.)

### 4. Down-rank methods (don't drop, but mark "likely dispatch")
For symbols whose qualified name contains `::` AND whose parent class has any inbound edges, classify the method as `likely-dispatch` rather than dead. Render it in a separate, smaller "low confidence" section (or hide behind a toggle), since `instance.method()` calls aren't resolved by the parser.

### 5. Skip framework hook names
Allowlist of common hook names that are called by frameworks/runtimes by introspection: `setUp`, `tearDown`, `setUpClass`, `tearDownClass`, `setup_method`, `teardown_method`, `pytest_*`, `before_*`, `after_*`, `on_*` (event handlers), `dispatch`, `get_queryset`, `form_valid`, `clean`, `ready`, `handle` (Django mgmt), `lifespan`. Match by exact name or prefix.

### 6. Update the new `DeadEntry.reason` set
Add `"likely-dispatch"` so the UI can label the soft section. No new shape changes — `reason` stays a string.

### 7. Tiny UI nudge (`src/pages/TestPath.tsx`)
- Split the dead list into two sections: **`Dead`** (high-confidence) and **`Possibly unused`** (`likely-dispatch` only), collapsed by default.
- Update the helper copy under the Dead tab from "Functions or classes that nothing else calls from outside their own file" to: "Functions with no callers, no tests, and no exports. Public APIs and dunder methods are excluded."

## Expected impact on `requests`
- All `__init__.py` re-exports of `get/post/put/delete/...` → no longer flagged.
- `Session.__enter__/__exit__/__repr__` and similar → no longer flagged.
- `Response.iter_content/iter_lines` (called via instance) → moved to "Possibly unused" rather than "Dead".
- The remaining list should be small and actually actionable.

## Files touched
- `src/lib/testpath.ts` — items 1–6
- `src/pages/TestPath.tsx` — item 7 (split list + copy tweak)

## Out of scope
- Real method-resolution (would need type inference or a Python AST pass)
- Cross-package usage analysis (PyPI consumers)
- Rewriting the indexer to emit `dispatch` edges

