

## Why your graph looks disjoint and messy

I pulled the actual file tree for `AnirudhT28/Music-Artist-Reccomender`. Your repo is **mostly Java**, with one Python file:

```
data_generation/crawler.py        ← Python (only file the parser handles)
src/main/java/.../SpotifyGraphServiceApplication.java
src/main/java/.../controller/ArtistController.java
src/main/java/.../model/Artist.java
src/main/java/.../repository/ArtistRepository.java
src/main/resources/static/index.html
src/test/java/.../SpotifyGraphServiceApplication.java
pom.xml, Dockerfile, README.md, artist_graph.db
```

The `graph-meta` edge function only knows **Python, C/C++, and JS/TS** (`.py .ipynb .c .cpp .h .ts .tsx .js .jsx .mjs .cjs`). Java, XML, properties, HTML, .db, Dockerfile are all silently dropped at the file-filter (`KEEP_EXT` in `graph-meta/index.ts:54`).

That's why the network response shows literally only:
- 1 file node: `data_generation/crawler.py`
- 1 function node: `build_and_save_graph`
- **0 edges**

A 2-node graph with no edges has nothing to attract the nodes together — the force simulation lays them out as two isolated dots floating in space. That's the "disjoint and messy" effect: there's no graph to draw, just orphans.

## Two real causes

1. **Java is not parsed at all** → ~95% of this repo is invisible to Meridian.
2. **Even on supported repos**, files with no imports/calls become floating islands because the only thing pulling nodes together is the link force. With weak/no edges → no clustering → looks scattered.

## Plan — make the graph render meaningfully on mixed/Java repos

### Step 1: Add a Java parser to `graph-meta`
Mirror the existing C/C++ extractor pattern. Java is structurally similar (braces, methods inside classes, `import x.y.Z;` statements). Implement:
- File-level node per `.java`
- Class node per `class Foo { }`
- Method node per method declaration inside a class body
- `imports` edges from `import a.b.C;` resolved against other `.java` files in the repo by class name
- `calls` edges from `methodName(...)` inside method bodies, resolved by short name (same fallback the JS/Python paths use)

Add `.java` to `KEEP_EXT` and dispatch in `buildGraph` alongside `.cpp`/`.ts`.

### Step 2: Tell the user when their repo is mostly unsupported
In the `_meta` response, include `parsed_file_count` vs `file_count` and a `skipped_extensions` summary (e.g. `{ ".java": 6, ".xml": 2 }`). On the client (`CodeGraph.tsx`), if `parsed_file_count < 3` show a soft banner: *"Only N source files recognised in this repo — Meridian currently parses Python, JS/TS, C/C++, and Java. Other files are shown as orphans."*

### Step 3: Stop orphan files from floating in empty space
In `CodeGraphCanvas.tsx`, when a file node has **zero edges** in either direction, snap it into a small "unconnected" cluster in a corner (extra `forceX/Y` anchor with `degree===0` files pulled to e.g. lower-right). Prevents the "stars scattered randomly" look on small/sparse repos.

### Step 4 (optional): Surface the parser whitelist on the input field
Add a small subtitle under the repo URL input: *"Supports Python, JS/TS, C/C++, Java"* so users don't waste time on Go/Rust/Ruby repos and assume the tool is broken.

## Files
- **edit** `supabase/functions/graph-meta/index.ts` — add Java parser (~80 lines, mirrors `cFnBodies` + `parseJs` patterns), extend `KEEP_EXT`, extend `buildGraph` dispatch, add `_meta.parsed_file_count` / `_meta.skipped_extensions`.
- **edit** `src/pages/CodeGraph.tsx` — add the "mostly unsupported" banner + parser-support subtitle on the input.
- **edit** `src/components/CodeGraphCanvas.tsx` — corner-cluster anchor for fully-isolated file nodes.

## Out of scope
- Go, Rust, Ruby, Kotlin, Swift parsers (separate proposal — same pattern as Java).
- Maven/Gradle dependency graph from `pom.xml`.
- Notebook/markdown content extraction beyond what already exists.

## Verification
1. Re-index `AnirudhT28/Music-Artist-Reccomender` — see ~7 nodes (5 Java files + 1 Python + class/method nodes), with `imports` edges between `ArtistController`, `Artist`, `ArtistRepository`, and `SpotifyGraphServiceApplication` forming a coherent cluster.
2. Index a Python-only repo (e.g. `psf/requests`) — unchanged behaviour, same edge counts as before.
3. Index a Go-only repo — see banner *"0 source files recognised"* instead of a confusing scatter.

