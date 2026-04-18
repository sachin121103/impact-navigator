// Sentinel Graph data layer — curated sample with files, functions, and tests.

export type SGExt = "ts" | "tsx" | "js" | "py" | "css" | "other";
export type SGKind = "file" | "function" | "test";
export type SGEdgeKind = "imports" | "calls" | "covers";

export interface SGNode {
  id: string;
  label: string;
  kind: SGKind;
  ext?: SGExt;
  path: string;
  /** for tests: estimated runtime in ms */
  avgMs?: number;
}

export interface SGEdge {
  from: string;
  to: string;
  kind: SGEdgeKind;
}

export interface SGGraph {
  nodes: SGNode[];
  edges: SGEdge[];
}

// ---------- Sample graph ----------
// A small but realistic web-app + python-utils repo with a clear dead file.
export const sampleGraph: SGGraph = {
  nodes: [
    // Files (ts/tsx/css/py)
    { id: "f_app", label: "App.tsx", kind: "file", ext: "tsx", path: "src/App.tsx" },
    { id: "f_router", label: "router.ts", kind: "file", ext: "ts", path: "src/router.ts" },
    { id: "f_dashboard", label: "Dashboard.tsx", kind: "file", ext: "tsx", path: "src/pages/Dashboard.tsx" },
    { id: "f_login", label: "Login.tsx", kind: "file", ext: "tsx", path: "src/pages/Login.tsx" },
    { id: "f_session", label: "session.ts", kind: "file", ext: "ts", path: "src/auth/session.ts" },
    { id: "f_jwt", label: "jwt.ts", kind: "file", ext: "ts", path: "src/lib/jwt.ts" },
    { id: "f_api", label: "api.ts", kind: "file", ext: "ts", path: "src/lib/api.ts" },
    { id: "f_utils", label: "utils.ts", kind: "file", ext: "ts", path: "src/lib/utils.ts" },
    { id: "f_styles", label: "globals.css", kind: "file", ext: "css", path: "src/styles/globals.css" },
    { id: "f_legacy", label: "legacy-helpers.ts", kind: "file", ext: "ts", path: "src/lib/legacy-helpers.ts" }, // DEAD
    { id: "f_pyutils", label: "stats.py", kind: "file", ext: "py", path: "scripts/stats.py" },
    { id: "f_pyrun", label: "run.py", kind: "file", ext: "py", path: "scripts/run.py" },

    // Functions
    { id: "fn_refresh", label: "refreshToken()", kind: "function", ext: "ts", path: "src/auth/session.ts:refreshToken" },
    { id: "fn_issue", label: "issueToken()", kind: "function", ext: "ts", path: "src/lib/jwt.ts:issueToken" },
    { id: "fn_verify", label: "verifyToken()", kind: "function", ext: "ts", path: "src/lib/jwt.ts:verifyToken" },
    { id: "fn_fetch", label: "fetchJson()", kind: "function", ext: "ts", path: "src/lib/api.ts:fetchJson" },
    { id: "fn_login", label: "login()", kind: "function", ext: "tsx", path: "src/pages/Login.tsx:login" },
    { id: "fn_loadDash", label: "loadDashboard()", kind: "function", ext: "tsx", path: "src/pages/Dashboard.tsx:loadDashboard" },
    { id: "fn_compute", label: "computeStats()", kind: "function", ext: "py", path: "scripts/stats.py:computeStats" },

    // Tests
    { id: "t_jwt", label: "jwt.test.ts", kind: "test", ext: "ts", path: "tests/jwt.test.ts", avgMs: 320 },
    { id: "t_session", label: "session.test.ts", kind: "test", ext: "ts", path: "tests/session.test.ts", avgMs: 540 },
    { id: "t_api", label: "api.test.ts", kind: "test", ext: "ts", path: "tests/api.test.ts", avgMs: 410 },
    { id: "t_login", label: "login.test.tsx", kind: "test", ext: "tsx", path: "tests/login.test.tsx", avgMs: 880 },
    { id: "t_stats", label: "stats_test.py", kind: "test", ext: "py", path: "tests/stats_test.py", avgMs: 1200 },
  ],
  edges: [
    // imports (file → file)
    { from: "f_app", to: "f_router", kind: "imports" },
    { from: "f_app", to: "f_styles", kind: "imports" },
    { from: "f_router", to: "f_dashboard", kind: "imports" },
    { from: "f_router", to: "f_login", kind: "imports" },
    { from: "f_dashboard", to: "f_api", kind: "imports" },
    { from: "f_dashboard", to: "f_session", kind: "imports" },
    { from: "f_login", to: "f_session", kind: "imports" },
    { from: "f_session", to: "f_jwt", kind: "imports" },
    { from: "f_api", to: "f_utils", kind: "imports" },
    { from: "f_session", to: "f_api", kind: "imports" },
    { from: "f_pyrun", to: "f_pyutils", kind: "imports" },

    // calls (function → function)
    { from: "fn_refresh", to: "fn_issue", kind: "calls" },
    { from: "fn_refresh", to: "fn_verify", kind: "calls" },
    { from: "fn_login", to: "fn_refresh", kind: "calls" },
    { from: "fn_loadDash", to: "fn_fetch", kind: "calls" },
    { from: "fn_loadDash", to: "fn_refresh", kind: "calls" },
    { from: "fn_fetch", to: "fn_verify", kind: "calls" },

    // function-in-file (treat as imports for blast propagation)
    { from: "f_session", to: "fn_refresh", kind: "imports" },
    { from: "f_jwt", to: "fn_issue", kind: "imports" },
    { from: "f_jwt", to: "fn_verify", kind: "imports" },
    { from: "f_api", to: "fn_fetch", kind: "imports" },
    { from: "f_login", to: "fn_login", kind: "imports" },
    { from: "f_dashboard", to: "fn_loadDash", kind: "imports" },
    { from: "f_pyutils", to: "fn_compute", kind: "imports" },

    // covers (test → target)
    { from: "t_jwt", to: "fn_issue", kind: "covers" },
    { from: "t_jwt", to: "fn_verify", kind: "covers" },
    { from: "t_session", to: "fn_refresh", kind: "covers" },
    { from: "t_api", to: "fn_fetch", kind: "covers" },
    { from: "t_login", to: "fn_login", kind: "covers" },
    { from: "t_login", to: "f_login", kind: "covers" },
    { from: "t_stats", to: "fn_compute", kind: "covers" },
  ],
};

// ---------- Helpers ----------

export interface BfsHit {
  id: string;
  depth: number;
}

/** BFS over outgoing imports/calls edges (covers excluded — tests don't propagate impact). */
export function bfsDownstream(graph: SGGraph, startId: string): BfsHit[] {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    if (e.kind === "covers") continue;
    if (!adj.has(e.from)) adj.set(e.from, []);
    adj.get(e.from)!.push(e.to);
  }
  const seen = new Set<string>([startId]);
  const out: BfsHit[] = [];
  let frontier: string[] = [startId];
  let depth = 0;
  while (frontier.length) {
    const next: string[] = [];
    for (const id of frontier) {
      if (depth > 0) out.push({ id, depth });
      for (const n of adj.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
    depth++;
    if (depth > 12) break;
  }
  return out;
}

/** Files with zero incoming non-test edges. Tests don't count as "users". */
export function findDeadNodes(graph: SGGraph): SGNode[] {
  const incoming = new Map<string, number>();
  for (const e of graph.edges) {
    if (e.kind === "covers") continue;
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1);
  }
  return graph.nodes.filter((n) => n.kind === "file" && (incoming.get(n.id) ?? 0) === 0 && n.id !== "f_app");
}

export function testsForBlast(graph: SGGraph, blastIds: Set<string>): SGNode[] {
  const testIds = new Set<string>();
  for (const e of graph.edges) {
    if (e.kind !== "covers") continue;
    if (blastIds.has(e.to)) testIds.add(e.from);
  }
  return graph.nodes.filter((n) => n.kind === "test" && testIds.has(n.id));
}

export function estimateTestTime(tests: SGNode[]): number {
  return tests.reduce((acc, t) => acc + (t.avgMs ?? 0), 0);
}

export function fullSuiteTime(graph: SGGraph): number {
  return estimateTestTime(graph.nodes.filter((n) => n.kind === "test"));
}
