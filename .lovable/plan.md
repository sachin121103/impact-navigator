

## Current language coverage in `graph-meta`

After the recent Java addition, the parser supports:

| Language | Extensions | Status |
|---|---|---|
| Python | `.py`, `.ipynb` | ✅ |
| JS/TS | `.js .jsx .ts .tsx .mjs .cjs` | ✅ |
| C/C++ | `.c .cpp .h .hpp` | ✅ |
| Java | `.java` | ✅ (just added) |

## What's missing (ranked by real-world repo prevalence)

Based on GitHub's annual language rankings + typical user repos:

| Rank | Language | Why it matters | Parse difficulty |
|---|---|---|---|
| 1 | **Go** (`.go`) | Top 5 on GitHub, dominant in backend/infra/CLI tools. `package` + `func` + `import (...)` blocks are very regex-friendly. | Easy — similar to Java |
| 2 | **Rust** (`.rs`) | Fast-growing, common in systems/CLI. `mod`/`fn`/`use` declarations. | Easy-medium |
| 3 | **Ruby** (`.rb`) | Rails repos still common. `class`/`def`/`require`. | Easy |
| 4 | **C#** (`.cs`) | Huge enterprise + Unity footprint. `namespace`/`class`/`using`. Structurally close to Java. | Easy (reuse Java logic) |
| 5 | **PHP** (`.php`) | Still ~15% of all websites. `class`/`function`/`use`/`require`. | Medium (mixed HTML) |
| 6 | **Kotlin** (`.kt`) | Android default. Similar to Java. | Easy (reuse Java logic) |
| 7 | **Swift** (`.swift`) | iOS/macOS. `class`/`struct`/`func`/`import`. | Easy-medium |

**Below the cut** (worth mentioning, not urgent): Scala, Dart, Elixir, Haskell, Lua, Zig.

**Config/markup formats** (different category — would need a separate "dependency graph" mode): `pom.xml`, `build.gradle`, `Cargo.toml`, `package.json`, `requirements.txt`, `go.mod`. These give you cross-module edges that source parsing misses.

## My recommendation — what to add next

**Priority 1 (one PR, biggest coverage win): Go + Rust + C#**
- Go and Rust together cover the modern backend/systems crowd that Meridian is currently blind to.
- C# is nearly free since the Java parser already handles `class { method() {} }` brace structure — mostly a tokenizer tweak + extension dispatch.
- All three follow the same regex-based pattern as the existing parsers (~60-100 lines each in `graph-meta/index.ts`).

**Priority 2 (after Pri 1 ships): Ruby + Kotlin**
- Ruby covers the Rails ecosystem.
- Kotlin is essentially "Java with `fun` instead of method-decl syntax" — a small extension of the Java parser.

**Priority 3 (separate, larger effort): Manifest-file dependency edges**
- Parse `package.json`, `pom.xml`, `Cargo.toml`, `go.mod`, `requirements.txt` to draw **external dependency** nodes.
- This is what makes the graph feel "complete" for any repo regardless of language — even a 1-file project shows its ecosystem.

## What I'd skip (for now)

- **Swift** — high parse complexity (modules, extensions, protocols), small audience overlap with web devs using Lovable.
- **PHP** — mixed HTML/PHP files break naive regex parsing; needs proper tokenizer.
- **Scala/Haskell/Elixir** — niche; revisit only on user request.

## Suggested next step

Implement **Go + Rust + C#** in one pass to graph-meta, mirroring the Java pattern (file/class/function nodes + imports/calls edges + extend `KEEP_EXT` + dispatch in `buildGraph`). Update the `CodeGraph.tsx` subtitle to reflect new coverage. Roughly 250 lines total, no new dependencies, no client-side changes beyond the subtitle.

Want me to ship that?

