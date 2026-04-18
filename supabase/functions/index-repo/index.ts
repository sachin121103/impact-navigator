/**
 * Impact Radar — Repo Indexer
 *
 * POST /index-repo  { repoUrl?: string }   // defaults to psf/requests
 *
 * Downloads the GitHub tarball for a public Python repo, walks .py files,
 * extracts symbols (modules, classes, functions, methods) and call/import
 * edges via lightweight regex parsing, then bulk-inserts into the database.
 *
 * Not a full AST — but fast, dependency-free, and good enough to power a
 * realistic blast-radius demo. Resolves calls by short name within the repo.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import tar from "npm:tar-stream@3.1.7";
import { Buffer } from "node:buffer";
import { gunzipSync } from "node:zlib";
import { Readable } from "node:stream";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Symbol = {
  qualified_name: string;
  name: string;
  kind: "module" | "class" | "function" | "method";
  file_path: string;
  line_number: number;
  docstring: string | null;
  // populated after insert
  id?: string;
};

type Edge = { source_qn: string; target_name: string; kind: "call" | "import" };

const PY_KEYWORDS = new Set([
  "if", "elif", "else", "for", "while", "with", "try", "except", "finally",
  "return", "yield", "raise", "import", "from", "as", "in", "is", "not",
  "and", "or", "lambda", "def", "class", "pass", "break", "continue",
  "True", "False", "None", "self", "cls", "print", "len", "range", "list",
  "dict", "set", "tuple", "str", "int", "float", "bool", "type", "isinstance",
  "super", "open", "format", "sorted", "map", "filter", "zip", "enumerate",
  "any", "all", "min", "max", "sum", "abs", "round", "repr", "hasattr",
  "getattr", "setattr", "delattr", "callable", "iter", "next", "globals",
  "locals", "vars", "dir", "id", "hash", "object", "Exception",
]);

const C_KEYWORDS = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default", "break",
  "continue", "return", "goto", "sizeof", "typedef", "struct", "union", "enum",
  "static", "extern", "const", "volatile", "register", "auto", "inline",
  "void", "char", "short", "int", "long", "float", "double", "signed", "unsigned",
  "_Bool", "bool", "true", "false", "NULL",
  "printf", "scanf", "fprintf", "sprintf", "snprintf", "puts", "putchar",
  "malloc", "calloc", "realloc", "free", "memcpy", "memset", "memmove",
  "strlen", "strcpy", "strncpy", "strcmp", "strncmp", "strcat", "strchr",
  "fopen", "fclose", "fread", "fwrite", "fgets", "fputs", "exit", "abort",
  "assert",
]);

function moduleFromPath(path: string): string {
  // Strip leading "<repo>-<sha>/" and "src/" prefixes; convert to dotted module
  const parts = path.split("/").slice(1); // drop top-level extracted dir
  const cleaned = parts[0] === "src" ? parts.slice(1) : parts;
  const file = cleaned.join("/").replace(/\.py$/, "");
  return file.replace(/\//g, ".").replace(/\.__init__$/, "");
}

function moduleFromCPath(path: string): string {
  const parts = path.split("/").slice(1);
  return parts.join("/").replace(/\.(c|h|cpp|cc|cxx|hpp|hh|hxx)$/i, "");
}

function extractSymbolsAndCalls(filePath: string, source: string): {
  symbols: Symbol[];
  edges: Edge[];
} {
  const moduleName = moduleFromPath(filePath);
  const symbols: Symbol[] = [];
  const edges: Edge[] = [];

  // Module symbol
  symbols.push({
    qualified_name: moduleName,
    name: moduleName.split(".").pop() || moduleName,
    kind: "module",
    file_path: filePath,
    line_number: 1,
    docstring: null,
  });

  const lines = source.split("\n");
  // Stack of (indent, qualifiedName, kind) for nesting
  const stack: { indent: number; qn: string; kind: "class" | "function" | "method" }[] = [];
  let currentFnQn: string | null = moduleName; // calls at module top-level attributed to module

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith("#")) continue;
    const indent = raw.length - raw.trimStart().length;

    // Pop stack on dedent
    while (stack.length && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }
    currentFnQn = stack.length ? stack[stack.length - 1].qn : moduleName;

    const line = raw.trim();

    // class / def
    const classMatch = line.match(/^class\s+([A-Za-z_]\w*)\s*[\(:]/);
    const defMatch = line.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/);

    if (classMatch) {
      const name = classMatch[1];
      const parentQn = stack.length ? stack[stack.length - 1].qn : moduleName;
      const qn = `${parentQn}.${name}`;
      symbols.push({
        qualified_name: qn,
        name,
        kind: "class",
        file_path: filePath,
        line_number: i + 1,
        docstring: null,
      });
      stack.push({ indent, qn, kind: "class" });
      continue;
    }

    if (defMatch) {
      const name = defMatch[1];
      const parentInClass = stack.length && stack[stack.length - 1].kind === "class";
      const parentQn = stack.length ? stack[stack.length - 1].qn : moduleName;
      const qn = `${parentQn}.${name}`;
      symbols.push({
        qualified_name: qn,
        name,
        kind: parentInClass ? "method" : "function",
        file_path: filePath,
        line_number: i + 1,
        docstring: null,
      });
      stack.push({ indent, qn, kind: parentInClass ? "method" : "function" });
      continue;
    }

    // import / from-import → record edges from current scope to imported names
    const importMatch = line.match(/^import\s+([A-Za-z_][\w\.]*)/);
    const fromMatch = line.match(/^from\s+([A-Za-z_][\w\.]*)\s+import\s+(.+)/);
    if (importMatch) {
      edges.push({ source_qn: currentFnQn, target_name: importMatch[1].split(".").pop()!, kind: "import" });
    } else if (fromMatch) {
      const names = fromMatch[2].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
      for (const n of names) {
        if (n === "*") continue;
        edges.push({ source_qn: currentFnQn, target_name: n, kind: "import" });
      }
    }

    // Calls: foo(...), Bar.baz(...), self.method(...)
    const callRegex = /([A-Za-z_]\w*)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = callRegex.exec(line)) !== null) {
      const callee = m[1];
      if (PY_KEYWORDS.has(callee)) continue;
      // skip when preceded by 'def ' or 'class ' on this line (already captured)
      const before = line.slice(0, m.index).trimEnd();
      if (/(?:^|\s)(def|class)$/.test(before)) continue;
      edges.push({ source_qn: currentFnQn!, target_name: callee, kind: "call" });
    }
  }

  return { symbols, edges };
}

/**
 * C / C++ extractor — strips comments + literals, then uses brace-tracking
 * to find function definitions and call sites within them. Also captures
 * #include edges as imports.
 */
function extractCSymbolsAndCalls(filePath: string, source: string): {
  symbols: Symbol[];
  edges: Edge[];
} {
  const moduleName = moduleFromCPath(filePath);
  const symbols: Symbol[] = [];
  const edges: Edge[] = [];

  symbols.push({
    qualified_name: moduleName,
    name: moduleName.split("/").pop() || moduleName,
    kind: "module",
    file_path: filePath,
    line_number: 1,
    docstring: null,
  });

  // Strip block + line comments and string/char literals (replace with spaces
  // so line numbers stay correct).
  const cleaned = source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/"(?:\\.|[^"\\\n])*"/g, (m) => " ".repeat(m.length))
    .replace(/'(?:\\.|[^'\\\n])*'/g, (m) => " ".repeat(m.length));

  // #include → import edges from file scope
  const includeRe = /^[ \t]*#\s*include\s*[<"]([^>"]+)[>"]/gm;
  let inc: RegExpExecArray | null;
  while ((inc = includeRe.exec(cleaned)) !== null) {
    const incName = inc[1].split("/").pop()!.replace(/\.(h|hpp|hh|hxx)$/i, "");
    if (incName) edges.push({ source_qn: moduleName, target_name: incName, kind: "import" });
  }

  // Function definitions: returnType ... name(args) { ... }
  const fnHeaderRe =
    /(^|\n)[ \t]*(?:(?:static|inline|extern|const|virtual|explicit|constexpr|[A-Za-z_][\w:*&<>\s,]*?)\s+)+([A-Za-z_]\w*)\s*\(([^)]*)\)\s*(?:const\s*)?(?:noexcept\s*)?\{/g;

  let h: RegExpExecArray | null;
  while ((h = fnHeaderRe.exec(cleaned)) !== null) {
    const fnName = h[2];
    if (C_KEYWORDS.has(fnName)) continue;
    if (["if", "for", "while", "switch", "do"].includes(fnName)) continue;

    const headerStart = h.index + h[1].length;
    const openBrace = cleaned.indexOf("{", h.index + h[0].length - 1);
    if (openBrace === -1) continue;

    // Walk braces to find body end
    let depth = 1;
    let p = openBrace + 1;
    while (p < cleaned.length && depth > 0) {
      const ch = cleaned[p];
      if (ch === "{") depth++;
      else if (ch === "}") depth--;
      p++;
    }
    const bodyEnd = p;
    const lineNumber = cleaned.slice(0, headerStart).split("\n").length;
    const qn = `${moduleName}::${fnName}`;

    symbols.push({
      qualified_name: qn,
      name: fnName,
      kind: "function",
      file_path: filePath,
      line_number: lineNumber,
      docstring: null,
    });

    // Extract call sites in body
    const body = cleaned.slice(openBrace + 1, bodyEnd - 1);
    const callRe = /([A-Za-z_]\w*)\s*\(/g;
    let c: RegExpExecArray | null;
    while ((c = callRe.exec(body)) !== null) {
      const callee = c[1];
      if (C_KEYWORDS.has(callee)) continue;
      if (callee === fnName) continue;
      edges.push({ source_qn: qn, target_name: callee, kind: "call" });
    }

    fnHeaderRe.lastIndex = bodyEnd;
  }

  return { symbols, edges };
}

const isPython = (p: string) => p.endsWith(".py");
const isCFamily = (p: string) => /\.(c|h|cpp|cc|cxx|hpp|hh|hxx)$/i.test(p);

async function fetchTarball(owner: string, repo: string, branch: string): Promise<Uint8Array> {
  const url = `https://codeload.github.com/${owner}/${repo}/tar.gz/refs/heads/${branch}`;
  const res = await fetch(url, { headers: { "User-Agent": "impact-radar-indexer" } });
  if (!res.ok) throw new Error(`Failed to download tarball (${branch}): ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  return new Uint8Array(gunzipSync(Buffer.from(buf)));
}

async function resolveDefaultBranch(owner: string, repo: string, fallback: string): Promise<string> {
  try {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { "User-Agent": "impact-radar-indexer", Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return fallback;
    const j = await res.json();
    return j.default_branch || fallback;
  } catch {
    return fallback;
  }
}

async function* walkSourceFiles(tarBytes: Uint8Array) {
  const extract = tar.extract();
  Readable.from(Buffer.from(tarBytes)).pipe(extract);

  const queue: { path: string; content: string }[] = [];
  let done = false;
  let error: Error | null = null;
  let resolveNext: (() => void) | null = null;
  const wake = () => { if (resolveNext) { resolveNext(); resolveNext = null; } };

  extract.on("entry", (header: any, stream: any, next: any) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => {
      const path: string = header.name;
      if (
        header.type === "file" &&
        (isPython(path) || isCFamily(path)) &&
        !path.includes("/tests/") &&
        !path.includes("/test_") &&
        !path.includes("/.")
      ) {
        queue.push({ path, content: Buffer.concat(chunks).toString("utf-8") });
        wake();
      }
      next();
    });
    stream.on("error", (e: Error) => { error = e; wake(); next(); });
    stream.resume();
  });
  extract.on("finish", () => { done = true; wake(); });
  extract.on("error", (e: Error) => { error = e; done = true; wake(); });

  while (true) {
    if (queue.length) { yield queue.shift()!; continue; }
    if (error) throw error;
    if (done) return;
    await new Promise<void>((r) => { resolveNext = r; });
  }
}

async function chunkInsert<T>(
  client: ReturnType<typeof createClient>,
  table: string,
  rows: T[],
  size = 500,
) {
  for (let i = 0; i < rows.length; i += size) {
    const slice = rows.slice(i, i + size);
    const { error } = await client.from(table).insert(slice as any);
    if (error) throw new Error(`Insert ${table} failed: ${error.message}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json().catch(() => ({}));
    const repoUrl: string = body.repoUrl ?? "https://github.com/psf/requests";
    const match = repoUrl.match(/github\.com\/([^\/]+)\/([^\/]+?)(?:\.git)?(?:\/)?$/);
    if (!match) throw new Error("Invalid GitHub URL");
    const [, owner, name] = match;

    // Resolve real default branch via GitHub API; fall back to main → master
    const branch: string = body.branch ?? (await resolveDefaultBranch(owner, name, "main"));

    // Upsert repo row → indexing
    const { data: repoRow, error: repoErr } = await supabase
      .from("repos")
      .upsert(
        { url: repoUrl, owner, name, default_branch: branch, status: "indexing", status_message: "Downloading…" },
        { onConflict: "url" },
      )
      .select()
      .single();
    if (repoErr || !repoRow) throw new Error(repoErr?.message || "Failed to create repo row");
    const repoId = (repoRow as any).id as string;

    // Wipe previous data for this repo
    await supabase.from("symbols").delete().eq("repo_id", repoId);

    // Download tarball, with master fallback
    let tarBytes: Uint8Array;
    try {
      tarBytes = await fetchTarball(owner, name, branch);
    } catch {
      tarBytes = await fetchTarball(owner, name, "master");
    }
    await supabase.from("repos").update({ status_message: "Parsing source files…" }).eq("id", repoId);

    const allSymbols: Symbol[] = [];
    const allEdges: Edge[] = [];
    const seenQn = new Set<string>();
    let fileCount = 0;

    for await (const file of walkSourceFiles(tarBytes)) {
      fileCount++;
      const { symbols, edges } = isCFamily(file.path)
        ? extractCSymbolsAndCalls(file.path, file.content)
        : extractSymbolsAndCalls(file.path, file.content);
      for (const s of symbols) {
        if (seenQn.has(s.qualified_name)) continue;
        seenQn.add(s.qualified_name);
        allSymbols.push(s);
      }
      allEdges.push(...edges);
    }

    // Insert symbols (chunked) and read back with IDs
    await chunkInsert(
      supabase,
      "symbols",
      allSymbols.map((s) => ({ ...s, repo_id: repoId })),
    );
    const { data: dbSymbols, error: symErr } = await supabase
      .from("symbols")
      .select("id, qualified_name, name")
      .eq("repo_id", repoId);
    if (symErr) throw symErr;

    const idByQn = new Map<string, string>();
    const idsByName = new Map<string, string[]>();
    for (const s of dbSymbols!) {
      idByQn.set((s as any).qualified_name, (s as any).id);
      const arr = idsByName.get((s as any).name) ?? [];
      arr.push((s as any).id);
      idsByName.set((s as any).name, arr);
    }

    // Resolve edges: source by qualified name, target by short name (best-effort within repo)
    const edgeRows: { repo_id: string; source_id: string; target_id: string; kind: string }[] = [];
    const seenEdge = new Set<string>();
    for (const e of allEdges) {
      const sourceId = idByQn.get(e.source_qn);
      if (!sourceId) continue;
      const candidates = idsByName.get(e.target_name);
      if (!candidates || candidates.length === 0) continue;
      // If multiple, prefer functions/classes over modules; just take first deterministically
      for (const targetId of candidates.slice(0, 1)) {
        if (sourceId === targetId) continue;
        const k = `${sourceId}|${targetId}|${e.kind}`;
        if (seenEdge.has(k)) continue;
        seenEdge.add(k);
        edgeRows.push({ repo_id: repoId, source_id: sourceId, target_id: targetId, kind: e.kind });
      }
    }

    await chunkInsert(supabase, "edges", edgeRows);

    // Update fan-in / fan-out via SQL would be ideal; do a quick client-side aggregation
    const fanIn = new Map<string, number>();
    const fanOut = new Map<string, number>();
    for (const e of edgeRows) {
      fanOut.set(e.source_id, (fanOut.get(e.source_id) ?? 0) + 1);
      fanIn.set(e.target_id, (fanIn.get(e.target_id) ?? 0) + 1);
    }
    // Bulk update in small batches
    const updates: { id: string; fan_in: number; fan_out: number }[] = [];
    for (const s of dbSymbols!) {
      const id = (s as any).id;
      updates.push({ id, fan_in: fanIn.get(id) ?? 0, fan_out: fanOut.get(id) ?? 0 });
    }
    for (let i = 0; i < updates.length; i += 200) {
      const slice = updates.slice(i, i + 200);
      await Promise.all(
        slice.map((u) =>
          supabase.from("symbols").update({ fan_in: u.fan_in, fan_out: u.fan_out }).eq("id", u.id),
        ),
      );
    }

    await supabase.from("repos").update({
      status: "ready",
      status_message: null,
      symbol_count: allSymbols.length,
      edge_count: edgeRows.length,
      file_count: fileCount,
      indexed_at: new Date().toISOString(),
    }).eq("id", repoId);

    return new Response(
      JSON.stringify({
        ok: true,
        repoId,
        files: fileCount,
        symbols: allSymbols.length,
        edges: edgeRows.length,
        durationMs: Date.now() - startedAt,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Indexer error:", err);
    return new Response(
      JSON.stringify({ ok: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
