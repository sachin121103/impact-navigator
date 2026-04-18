// Meridian – /graph-meta
// Clones a public GitHub repo (tarball, no git binary needed), parses Python/C/notebook
// files into {nodes, edges} matching the FastAPI parser.py contract, and enriches
// file nodes with `loc`, `last_commit`, and `churn_score` from the GitHub commits API.
//
// Request:  GET ?repo=https://github.com/owner/name        (or "owner/name")
// Response: { nodes: GraphNode[], edges: GraphEdge[] }

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

// ---------- Types (mirror parser.py) ---------------------------------------
type NodeType = "file" | "function" | "class";
type EdgeType = "imports" | "calls" | "include";

interface GraphNode {
  id: string;
  type: NodeType;
  file: string;
  name: string;
  loc?: number;
  last_commit?: string | null;
  churn_score?: number;
}
interface GraphEdge {
  source: string;
  target: string;
  type: EdgeType;
}

// ---------- Repo URL parsing ------------------------------------------------
function parseRepoUrl(input: string): { owner: string; name: string } {
  const trimmed = input.trim().replace(/\.git$/, "");
  // Accept "owner/name", "https://github.com/owner/name", "git@github.com:owner/name"
  let m = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+)/i);
  if (m) return { owner: m[1], name: m[2] };
  m = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+)/i);
  if (m) return { owner: m[1], name: m[2] };
  m = trimmed.match(/^([^/\s]+)\/([^/\s]+)$/);
  if (m) return { owner: m[1], name: m[2] };
  throw new Error(`Unrecognised repo: ${input}`);
}

// ---------- Tarball reader (no native deps) --------------------------------
// Reads ustar entries from a gzipped tar stream. Returns [{path, content}]
// for files matching `keepExt`. Skips noisy directories.
const SKIP_DIRS = new Set([
  ".venv", "venv", ".env", "node_modules", "__pycache__",
  ".git", ".github", "site-packages", ".tox", ".eggs", "eggs",
  ".mypy_cache", ".pytest_cache", ".ruff_cache",
  "Images", "images",
  "dist", "build", ".next", ".nuxt", ".turbo", ".cache",
  "out", "coverage", "__tests__", "__mocks__",
]);
const KEEP_EXT = new Set([
  ".py", ".ipynb",
  ".c", ".h", ".cpp", ".hpp", ".cc",
  ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs",
]);

function shouldSkip(rel: string): boolean {
  const parts = rel.split("/");
  if (parts.slice(0, -1).some(
    (p) => SKIP_DIRS.has(p) || (p.startsWith(".") && p.length > 1),
  )) return true;
  const base = parts[parts.length - 1];
  // Skip TS declaration files and tests
  if (base.endsWith(".d.ts")) return true;
  if (/\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(base)) return true;
  return false;
}

function octal(buf: Uint8Array, off: number, len: number): number {
  let s = "";
  for (let i = 0; i < len; i++) {
    const c = buf[off + i];
    if (c === 0 || c === 32) break;
    s += String.fromCharCode(c);
  }
  return s ? parseInt(s, 8) : 0;
}
function tstr(buf: Uint8Array, off: number, len: number): string {
  let end = off;
  const limit = off + len;
  while (end < limit && buf[end] !== 0) end++;
  return new TextDecoder().decode(buf.subarray(off, end));
}

async function readTarGz(
  url: string,
  maxFiles = 600,
): Promise<{ path: string; content: string }[]> {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) {
    throw new Error(`Tarball fetch failed: ${res.status}`);
  }
  // Pre-flight: refuse very large repos before we even decompress
  const contentLength = Number(res.headers.get("content-length") ?? 0);
  if (contentLength && contentLength > 25 * 1024 * 1024) {
    throw new Error(
      `Repo tarball is ${(contentLength / 1024 / 1024).toFixed(0)} MB — too large to map (limit 25 MB). Try a smaller repo.`,
    );
  }
  const decompressed = res.body.pipeThrough(new DecompressionStream("gzip"));
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = decompressed.getReader();
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.byteLength;
      if (total > 35 * 1024 * 1024) {
        try { await reader.cancel(); } catch { /* noop */ }
        throw new Error("Repo too large to map (>35 MB decompressed). Try a smaller repo.");
      }
    }
  }
  const buf = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    buf.set(c, o);
    o += c.byteLength;
  }

  const out: { path: string; content: string }[] = [];
  let pos = 0;
  let longName: string | null = null;
  const td = new TextDecoder("utf-8", { fatal: false });
  while (pos + 512 <= buf.length) {
    const header = buf.subarray(pos, pos + 512);
    // empty block = end
    let allZero = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        allZero = false;
        break;
      }
    }
    if (allZero) break;

    let name = tstr(header, 0, 100);
    const prefix = tstr(header, 345, 155);
    if (prefix) name = prefix + "/" + name;
    if (longName !== null) {
      name = longName;
      longName = null;
    }
    const size = octal(header, 124, 12);
    const typeflag = String.fromCharCode(header[156]);
    pos += 512;
    const dataLen = size;
    const padded = Math.ceil(dataLen / 512) * 512;
    const data = buf.subarray(pos, pos + dataLen);
    pos += padded;

    if (typeflag === "L") {
      longName = td.decode(data).replace(/\0+$/, "");
      continue;
    }
    if (typeflag !== "0" && typeflag !== "\0" && typeflag !== "") continue;

    // strip leading "<repo>-<sha>/" component
    const rel = name.split("/").slice(1).join("/");
    if (!rel || rel.endsWith("/")) continue;
    if (shouldSkip(rel)) continue;
    const dot = rel.lastIndexOf(".");
    const ext = dot >= 0 ? rel.slice(dot).toLowerCase() : "";
    if (!KEEP_EXT.has(ext)) continue;

    out.push({ path: rel, content: td.decode(data) });
    if (out.length >= maxFiles) break;
  }
  return out;
}

// ---------- Python parser (regex-based; AST not available in Deno) ---------
const RE_PY_DEF = /^[ \t]*(?:async[ \t]+)?def[ \t]+([A-Za-z_]\w*)\s*\(/gm;
const RE_PY_CLASS = /^[ \t]*class[ \t]+([A-Za-z_]\w*)\s*[(:]?/gm;
const RE_PY_IMPORT_FROM = /^[ \t]*from[ \t]+([\w.]+)[ \t]+import\b/gm;
const RE_PY_IMPORT = /^[ \t]*import[ \t]+([\w.]+(?:[ \t]*,[ \t]*[\w.]+)*)/gm;
const RE_PY_CALL = /\b([A-Za-z_]\w*)\s*\(/g;

interface PyParsed {
  functions: string[];
  classes: string[];
  imports: string[];
  // [callerName, calleeBare]
  calls: [string, string][];
}

function parsePy(src: string): PyParsed {
  const out: PyParsed = { functions: [], classes: [], imports: [], calls: [] };

  // Functions & classes (top-level + nested, qualified by indent ladder)
  const lines = src.split(/\r?\n/);
  type Frame = { kind: "class" | "def"; name: string; indent: number };
  const stack: Frame[] = [];
  const fnRanges: { qname: string; start: number; end: number; indent: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m =
      line.match(/^(\s*)(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/) ||
      line.match(/^(\s*)class\s+([A-Za-z_]\w*)\s*[(:]?/);
    if (!m) continue;
    const indent = m[1].length;
    const name = m[2];
    const isClass = /^\s*class\b/.test(line);
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const qual = isClass
      ? name
      : stack.filter((s) => s.kind === "class").map((s) => s.name).concat(name).join(".");
    if (isClass) {
      out.classes.push(name);
    } else {
      out.functions.push(qual);
      // find end of function by indent
      let end = lines.length;
      for (let j = i + 1; j < lines.length; j++) {
        const lj = lines[j];
        if (lj.trim() === "") continue;
        const ind = lj.match(/^\s*/)?.[0].length ?? 0;
        if (ind <= indent) {
          end = j;
          break;
        }
      }
      fnRanges.push({ qname: qual, start: i + 1, end, indent });
    }
    stack.push({ kind: isClass ? "class" : "def", name, indent });
  }

  // Calls per function range (innermost wins)
  for (const r of fnRanges) {
    const body = lines.slice(r.start, r.end).join("\n");
    let m: RegExpExecArray | null;
    const re = new RegExp(RE_PY_CALL.source, "g");
    while ((m = re.exec(body)) !== null) {
      const callee = m[1];
      // skip Python keywords & builtins that look like calls
      if (PY_RESERVED.has(callee)) continue;
      out.calls.push([r.qname, callee]);
    }
  }

  // Imports
  let m: RegExpExecArray | null;
  const reFrom = new RegExp(RE_PY_IMPORT_FROM.source, "gm");
  while ((m = reFrom.exec(src)) !== null) out.imports.push(m[1]);
  const reImp = new RegExp(RE_PY_IMPORT.source, "gm");
  while ((m = reImp.exec(src)) !== null) {
    for (const part of m[1].split(",")) {
      out.imports.push(part.trim().split(/\s+as\s+/)[0]);
    }
  }
  return out;
}

const PY_RESERVED = new Set([
  "if", "elif", "else", "for", "while", "try", "except", "finally", "with",
  "def", "class", "return", "yield", "import", "from", "as", "in", "is",
  "and", "or", "not", "lambda", "pass", "break", "continue", "raise",
  "global", "nonlocal", "True", "False", "None", "print", "len", "range",
  "str", "int", "float", "bool", "list", "dict", "tuple", "set", "type",
  "isinstance", "super", "self", "cls",
]);

// ---------- Notebook source extractor --------------------------------------
function notebookSource(content: string): string | null {
  try {
    const nb = JSON.parse(content);
    const blocks: string[] = [];
    for (const cell of nb.cells ?? []) {
      if (cell.cell_type !== "code") continue;
      const src = Array.isArray(cell.source) ? cell.source.join("") : cell.source ?? "";
      const clean = src.split("\n").filter((l: string) => !/^\s*[%!]/.test(l));
      if (clean.length) blocks.push(clean.join("\n"));
    }
    return blocks.length ? blocks.join("\n\n") : null;
  } catch {
    return null;
  }
}

// ---------- C / C++ parser -------------------------------------------------
const C_KEYWORDS = new Set([
  "if", "else", "while", "for", "switch", "do", "return", "break",
  "continue", "sizeof", "typeof", "alignof", "offsetof",
  "typedef", "struct", "enum", "union", "goto", "case", "default",
  "extern", "static", "inline", "const", "volatile", "register", "auto",
  "NULL", "true", "false",
]);
const C_FN_RE = /\b([A-Za-z_]\w*)\s*\([^;)]*\)\s*\{/g;
const C_CALL_RE = /\b([A-Za-z_]\w*)\s*\(/g;
const C_INC_RE = /#\s*include\s+\"([^\"]+)\"/g;

function cFnBodies(src: string): { name: string; body: string }[] {
  const out: { name: string; body: string }[] = [];
  const re = new RegExp(C_FN_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    if (C_KEYWORDS.has(name)) continue;
    let depth = 0;
    let i = m.index + m[0].length - 1;
    while (i < src.length) {
      const c = src[i];
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        if (depth === 0) {
          out.push({ name, body: src.slice(m.index + m[0].length, i) });
          break;
        }
      }
      i++;
    }
  }
  return out;
}

// ---------- JS / TS parser -------------------------------------------------
const JS_RESERVED = new Set([
  "if", "else", "for", "while", "do", "switch", "case", "default",
  "return", "break", "continue", "throw", "try", "catch", "finally",
  "function", "class", "const", "let", "var", "new", "delete", "typeof",
  "instanceof", "in", "of", "void", "yield", "await", "async", "static",
  "public", "private", "protected", "readonly", "extends", "implements",
  "interface", "type", "enum", "namespace", "module", "import", "export",
  "from", "as", "true", "false", "null", "undefined", "this", "super",
  "console", "require", "Promise", "Array", "Object", "String", "Number",
  "Boolean", "Math", "JSON", "Date", "Error", "Set", "Map", "RegExp",
  "parseInt", "parseFloat", "isNaN", "isFinite", "setTimeout", "setInterval",
  "clearTimeout", "clearInterval", "fetch", "Symbol",
]);

function stripJsNoise(src: string): string {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const c2 = src[i + 1];
    if (c === "/" && c2 === "/") {
      while (i < n && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && c2 === "*") {
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      const q = c;
      out += " ";
      i++;
      while (i < n && src[i] !== q) {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "\n") break;
        i++;
      }
      i++;
      continue;
    }
    if (c === "`") {
      i++;
      out += " ";
      while (i < n && src[i] !== "`") {
        if (src[i] === "\\") { i += 2; continue; }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2;
          let depth = 1;
          while (i < n && depth > 0) {
            if (src[i] === "{") depth++;
            else if (src[i] === "}") depth--;
            if (depth > 0) out += src[i];
            i++;
          }
          continue;
        }
        if (src[i] === "\n") out += "\n";
        i++;
      }
      i++;
      continue;
    }
    out += c;
    i++;
  }
  return out;
}

interface JsParsed {
  functions: string[];
  classes: string[];
  imports: string[];
  calls: [string, string][];
}

const JS_CALL_RE = /\b([A-Za-z_$][\w$]*)\s*\(/g;

function matchBrace(s: string, openIdx: number): number {
  let depth = 0;
  for (let j = openIdx; j < s.length; j++) {
    if (s[j] === "{") depth++;
    else if (s[j] === "}") {
      depth--;
      if (depth === 0) return j;
    }
  }
  return s.length;
}

function parseJs(rawSrc: string): JsParsed {
  const src = stripJsNoise(rawSrc);
  const out: JsParsed = { functions: [], classes: [], imports: [], calls: [] };

  const reImpFrom = /\bimport\b[^;'"`]*?\bfrom\s*['"]([^'"]+)['"]/g;
  const reImpBare = /(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g;
  const reImpDyn = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  const reReq = /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  for (const re of [reImpFrom, reImpBare, reImpDyn, reReq]) {
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) out.imports.push(m[1]);
  }

  type Decl = {
    qname: string;
    name: string;
    kind: "function" | "class" | "method";
    bodyStart: number;
    bodyEnd: number;
  };
  const decls: Decl[] = [];

  const reFn = /\b(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)[^{]*\{/g;
  let m: RegExpExecArray | null;
  while ((m = reFn.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchBrace(src, open);
    decls.push({ qname: m[1], name: m[1], kind: "function", bodyStart: open, bodyEnd: close });
  }

  const reArrow = /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::\s*[^=;]+)?=\s*(?:async\s+)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*(?::\s*[^=>]+)?=>\s*\{/g;
  while ((m = reArrow.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchBrace(src, open);
    decls.push({ qname: m[1], name: m[1], kind: "function", bodyStart: open, bodyEnd: close });
  }

  const reFnExpr = /\b(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*\*?\s*[A-Za-z_$\w$]*\s*\([^)]*\)[^{]*\{/g;
  while ((m = reFnExpr.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = matchBrace(src, open);
    decls.push({ qname: m[1], name: m[1], kind: "function", bodyStart: open, bodyEnd: close });
  }

  const reCls = /\b(?:export\s+)?(?:default\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)[^{]*\{/g;
  while ((m = reCls.exec(src)) !== null) {
    const clsName = m[1];
    out.classes.push(clsName);
    const open = m.index + m[0].length - 1;
    const close = matchBrace(src, open);
    const body = src.slice(open + 1, close);
    const reMethod = /(?:^|[\n;{}])\s*(?:public\s+|private\s+|protected\s+|static\s+|readonly\s+|async\s+|\*\s*)*([A-Za-z_$][\w$]*)\s*\([^)]*\)[^{};=]*\{/g;
    let mm: RegExpExecArray | null;
    while ((mm = reMethod.exec(body)) !== null) {
      const mname = mm[1];
      if (JS_RESERVED.has(mname)) continue;
      const localOpen = mm.index + mm[0].length - 1;
      const absOpen = open + 1 + localOpen;
      const absClose = matchBrace(src, absOpen);
      decls.push({
        qname: `${clsName}.${mname}`,
        name: mname,
        kind: "method",
        bodyStart: absOpen,
        bodyEnd: absClose,
      });
    }
  }

  decls.sort((a, b) => a.bodyStart - b.bodyStart);
  for (const d of decls) out.functions.push(d.qname);

  // Attribute calls to innermost containing decl
  for (const d of decls) {
    const re = new RegExp(JS_CALL_RE.source, "g");
    re.lastIndex = d.bodyStart + 1;
    let cm: RegExpExecArray | null;
    while ((cm = re.exec(src)) !== null) {
      if (cm.index >= d.bodyEnd) break;
      const callee = cm[1];
      if (JS_RESERVED.has(callee)) continue;
      // Skip if this call lies inside a more deeply nested decl
      let innermost = d;
      for (const e of decls) {
        if (e === d) continue;
        if (e.bodyStart > d.bodyStart && e.bodyEnd <= d.bodyEnd &&
            e.bodyStart <= cm.index && cm.index < e.bodyEnd) {
          if (e.bodyStart > innermost.bodyStart) innermost = e;
        }
      }
      if (innermost === d) out.calls.push([d.qname, callee]);
    }
  }

  return out;
}

function resolveJsImport(
  importerPath: string,
  spec: string,
  allFiles: Set<string>,
): string | null {
  if (!spec.startsWith(".")) return null;
  const dir = importerPath.split("/").slice(0, -1).join("/");
  const segs = (dir ? dir.split("/") : []).concat(spec.split("/"));
  const stack: string[] = [];
  for (const s of segs) {
    if (s === "" || s === ".") continue;
    if (s === "..") { stack.pop(); continue; }
    stack.push(s);
  }
  const base = stack.join("/");
  const exts = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
  if (allFiles.has(base)) return base;
  for (const ext of exts) {
    if (allFiles.has(base + ext)) return base + ext;
  }
  for (const ext of exts) {
    const candidate = `${base}/index${ext}`;
    if (allFiles.has(candidate)) return candidate;
  }
  return null;
}

// ---------- Build graph ----------------------------------------------------
function buildGraph(files: { path: string; content: string }[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const allNodeIds = new Set<string>();
  // First pass: file nodes
  for (const f of files) {
    nodes.push({
      id: f.path,
      type: "file",
      file: f.path,
      name: f.path,
      loc: f.content.split("\n").length,
    });
    allNodeIds.add(f.path);
  }

  const fnIndex: Record<string, string> = {};
  const pendingCalls: [string, string][] = [];

  for (const f of files) {
    const ext = f.path.slice(f.path.lastIndexOf(".")).toLowerCase();
    if (ext === ".py" || ext === ".ipynb") {
      const src = ext === ".ipynb" ? notebookSource(f.content) : f.content;
      if (!src) continue;
      const p = parsePy(src);
      for (const qn of p.functions) {
        const id = `${f.path}::${qn}`;
        nodes.push({ id, type: "function", file: f.path, name: qn });
        fnIndex[qn] = id;
        const bare = qn.split(".").pop()!;
        if (!(bare in fnIndex)) fnIndex[bare] = id;
      }
      for (const cls of p.classes) {
        nodes.push({
          id: `${f.path}::${cls}`,
          type: "class",
          file: f.path,
          name: cls,
        });
      }
      for (const mod of new Set(p.imports)) {
        const modRel = mod.replaceAll(".", "/") + ".py";
        if (allNodeIds.has(modRel) && !edges.some(
          (e) => e.source === f.path && e.target === modRel && e.type === "imports",
        )) {
          edges.push({ source: f.path, target: modRel, type: "imports" });
        }
      }
      for (const [caller, callee] of p.calls) {
        pendingCalls.push([`${f.path}::${caller}`, callee]);
      }
    } else if (ext === ".c" || ext === ".cpp" || ext === ".cc") {
      const bodies = cFnBodies(f.content);
      for (const { name, body } of bodies) {
        const id = `${f.path}::${name}`;
        if (!nodes.some((n) => n.id === id)) {
          nodes.push({ id, type: "function", file: f.path, name });
          fnIndex[name] = id;
        }
        const re = new RegExp(C_CALL_RE.source, "g");
        let m: RegExpExecArray | null;
        while ((m = re.exec(body)) !== null) {
          const callee = m[1];
          if (!C_KEYWORDS.has(callee)) pendingCalls.push([id, callee]);
        }
      }
      const incRe = new RegExp(C_INC_RE.source, "g");
      let m: RegExpExecArray | null;
      while ((m = incRe.exec(f.content)) !== null) {
        const inc = m[1];
        const incBase = inc.split("/").pop()!;
        const incNorm = inc.replace(/^\.\//, "");
        const matched = [...allNodeIds].find(
          (nid) => nid.endsWith(incNorm) || nid.split("/").pop() === incBase,
        );
        if (matched && !edges.some(
          (e) => e.source === f.path && e.target === matched && e.type === "include",
        )) {
          edges.push({ source: f.path, target: matched, type: "include" });
        }
      }
    }
    // .h / .hpp: file node only
  }

  // Resolve deferred calls
  for (const [callerId, calleeBare] of pendingCalls) {
    const calleeId = fnIndex[calleeBare];
    if (!calleeId || calleeId === callerId) continue;
    if (!edges.some(
      (e) => e.source === callerId && e.target === calleeId && e.type === "calls",
    )) {
      edges.push({ source: callerId, target: calleeId, type: "calls" });
    }
  }

  return { nodes, edges };
}

// ---------- GitHub commits → churn & last_commit ---------------------------
async function enrichWithGitMeta(
  owner: string,
  name: string,
  nodes: GraphNode[],
): Promise<void> {
  const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "meridian-graph-meta",
  };
  const tok = Deno.env.get("GITHUB_TOKEN");
  if (tok) headers.Authorization = `Bearer ${tok}`;

  const lastCommit: Record<string, string> = {};
  const churn: Record<string, number> = {};

  const DETAIL_BATCH = 10;
  for (let page = 1; page <= 3; page++) {
    const url = `https://api.github.com/repos/${owner}/${name}/commits?per_page=100&page=${page}`;
    const r = await fetch(url, { headers });
    if (!r.ok) break;
    const list = (await r.json()) as Array<{ sha: string; commit: { author: { date: string } } }>;
    if (!list.length) break;

    // Fetch commit details in parallel batches to avoid 300 sequential API calls
    for (let i = 0; i < list.length; i += DETAIL_BATCH) {
      const batch = list.slice(i, i + DETAIL_BATCH);
      const results = await Promise.all(
        batch.map(async (c) => {
          const res = await fetch(
            `https://api.github.com/repos/${owner}/${name}/commits/${c.sha}`,
            { headers },
          );
          if (!res.ok) return null;
          return { meta: c, detail: (await res.json()) as { files?: Array<{ filename: string }> } };
        }),
      );
      for (const result of results) {
        if (!result) continue;
        const { meta, detail } = result;
        const date = meta.commit.author.date;
        const ts = new Date(date).getTime();
        for (const f of detail.files ?? []) {
          if (!(f.filename in lastCommit)) lastCommit[f.filename] = date.slice(0, 10);
          if (ts >= cutoff) churn[f.filename] = (churn[f.filename] ?? 0) + 1;
        }
      }
    }

    if (list.length < 100) break;
  }

  for (const n of nodes) {
    if (n.type !== "file") continue;
    n.last_commit = lastCommit[n.file] ?? null;
    n.churn_score = churn[n.file] ?? 0;
  }
}

// ---------- HTTP entrypoint ------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const repo = url.searchParams.get("repo");
    if (!repo) {
      return new Response(JSON.stringify({ error: "Missing ?repo=" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { owner, name } = parseRepoUrl(repo);

    // Try main, then master
    let files: { path: string; content: string }[] = [];
    let usedBranch = "main";
    for (const branch of ["main", "master"]) {
      try {
        const tarUrl = `https://codeload.github.com/${owner}/${name}/tar.gz/refs/heads/${branch}`;
        files = await readTarGz(tarUrl);
        usedBranch = branch;
        break;
      } catch (e) {
        if (branch === "master") throw e;
      }
    }

    const { nodes, edges } = buildGraph(files);

    // Best-effort enrichment; skip on big repos to avoid CPU limit
    if (files.length <= 250) {
      try {
        await enrichWithGitMeta(owner, name, nodes);
      } catch (e) {
        console.warn("git meta failed", e);
      }
    }

    return new Response(
      JSON.stringify({ nodes, edges, _meta: { owner, name, branch: usedBranch, file_count: files.length } }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("graph-meta error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
