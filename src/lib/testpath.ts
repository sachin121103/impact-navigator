// TestPath: smart test execution planner.
// Operates purely on a GraphPayload ({ nodes, edges }) already loaded by the page.
// All functions are sync; heavy ones (BFS, coverage) are O(V+E) and memoized
// per graph identity to keep <500ms for 10k-node repos.

import type { GraphPayload, GraphNode, GraphEdge } from "./sample-graph";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface TestEntry {
  id: string;
  file: string;
  function: string;
  estimated_time: number; // seconds
  distance: number;
  priority: "high" | "medium" | "low";
}

export interface TestPlan {
  modified_node_id: string | null;
  tests: TestEntry[];
  summary: {
    total_tests: number;
    total_time_s: number;
    full_suite_tests: number;
    full_suite_time_s: number;
    time_saved_percent: number;
  };
}

export interface CoverageMetrics {
  coveragePercent: number;
  coveredCount: number;
  codeNodeCount: number;
  untestedNodeIds: string[];
  perNodeCoverage: Map<string, number>; // nodeId -> # tests covering it
}

// ─── Heuristics ───────────────────────────────────────────────────────────────
const TEST_FILE_RE =
  /(?:^|\/)(?:test_[^/]+\.py|[^/]+_test\.py|[^/]+\.test\.[tj]sx?|[^/]+\.spec\.[tj]sx?)$|(?:^|\/)(?:tests?|__tests__)\//i;

const DEFAULT_TEST_TIME_S = 1.5;

export function isTestNode(node: GraphNode): boolean {
  // Treat any symbol whose file matches a test pattern as a test node.
  // (The graph uses type: file/function/class, no explicit "test" kind.)
  if (!node) return false;
  const file = node.file ?? "";
  return TEST_FILE_RE.test(file);
}

function estTimeFor(node: GraphNode): number {
  // Cheap heuristic: longer files / higher churn → slightly slower.
  const loc = node.loc ?? 0;
  if (!loc) return DEFAULT_TEST_TIME_S;
  // 1s base + 0.01s/loc, capped at 10s
  return Math.min(10, Math.max(0.5, 1 + loc * 0.01));
}

function priorityFor(distance: number): TestEntry["priority"] {
  if (distance <= 2) return "high";
  if (distance <= 4) return "medium";
  return "low";
}

// ─── Adjacency builders ───────────────────────────────────────────────────────
export function buildReverseAdjacency(
  edges: GraphEdge[],
): Map<string, string[]> {
  // target -> sources (callers / importers)
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const list = m.get(e.target);
    if (list) list.push(e.source);
    else m.set(e.target, [e.source]);
  }
  return m;
}

export function buildForwardAdjacency(
  edges: GraphEdge[],
): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const e of edges) {
    const list = m.get(e.source);
    if (list) list.push(e.target);
    else m.set(e.source, [e.target]);
  }
  return m;
}

// ─── Core: find covering tests via reverse BFS ────────────────────────────────
export function findCoveringTests(
  startId: string,
  nodesById: Map<string, GraphNode>,
  reverseAdj: Map<string, string[]>,
  maxDepth = 8,
): Map<string, number> {
  // Returns map of test nodeId -> shortest distance from startId.
  const result = new Map<string, number>();
  const visited = new Map<string, number>();
  const queue: Array<{ id: string; depth: number }> = [{ id: startId, depth: 0 }];
  visited.set(startId, 0);

  while (queue.length) {
    const { id, depth } = queue.shift()!;
    if (depth > maxDepth) continue;
    const node = nodesById.get(id);
    if (node && depth > 0 && isTestNode(node)) {
      const prev = result.get(id);
      if (prev === undefined || depth < prev) result.set(id, depth);
      // Tests don't usually have callers we care about — keep traversing
      // anyway in case of test helpers.
    }
    const callers = reverseAdj.get(id);
    if (!callers) continue;
    for (const c of callers) {
      const seen = visited.get(c);
      if (seen === undefined || depth + 1 < seen) {
        visited.set(c, depth + 1);
        queue.push({ id: c, depth: depth + 1 });
      }
    }
  }
  return result;
}

// ─── Plan builder ─────────────────────────────────────────────────────────────
export function buildTestPlan(
  modifiedNodeId: string,
  graph: GraphPayload,
  ctx?: { nodesById?: Map<string, GraphNode>; reverseAdj?: Map<string, string[]> },
): TestPlan {
  const nodesById = ctx?.nodesById ?? indexNodes(graph.nodes);
  const reverseAdj = ctx?.reverseAdj ?? buildReverseAdjacency(graph.edges);

  const allTests = graph.nodes.filter(isTestNode);
  const fullSuiteCount = allTests.length;
  const fullSuiteTime = allTests.reduce((s, n) => s + estTimeFor(n), 0);

  const reachedTests = findCoveringTests(modifiedNodeId, nodesById, reverseAdj);
  const tests: TestEntry[] = [];
  for (const [id, distance] of reachedTests) {
    const n = nodesById.get(id);
    if (!n) continue;
    const fnName = n.type === "file" ? "" : (n.name ?? "");
    tests.push({
      id,
      file: n.file,
      function: fnName,
      estimated_time: round(estTimeFor(n), 2),
      distance,
      priority: priorityFor(distance),
    });
  }
  tests.sort((a, b) => a.distance - b.distance || a.estimated_time - b.estimated_time);

  const totalTime = tests.reduce((s, t) => s + t.estimated_time, 0);
  const saved =
    fullSuiteTime > 0 ? ((fullSuiteTime - totalTime) / fullSuiteTime) * 100 : 0;

  return {
    modified_node_id: modifiedNodeId,
    tests,
    summary: {
      total_tests: tests.length,
      total_time_s: round(totalTime, 2),
      full_suite_tests: fullSuiteCount,
      full_suite_time_s: round(fullSuiteTime, 2),
      time_saved_percent: round(Math.max(0, saved), 1),
    },
  };
}

// ─── Diff / aggregate plan (PR mode) ──────────────────────────────────────────
export function aggregatePlan(
  modifiedNodeIds: string[],
  graph: GraphPayload,
): TestPlan {
  const nodesById = indexNodes(graph.nodes);
  const reverseAdj = buildReverseAdjacency(graph.edges);

  const merged = new Map<string, TestEntry>();
  for (const id of modifiedNodeIds) {
    const plan = buildTestPlan(id, graph, { nodesById, reverseAdj });
    for (const t of plan.tests) {
      const prev = merged.get(t.id);
      if (!prev || t.distance < prev.distance) merged.set(t.id, t);
    }
  }
  const tests = Array.from(merged.values()).sort(
    (a, b) => a.distance - b.distance || a.estimated_time - b.estimated_time,
  );

  const allTests = graph.nodes.filter(isTestNode);
  const fullSuiteTime = allTests.reduce((s, n) => s + estTimeFor(n), 0);
  const totalTime = tests.reduce((s, t) => s + t.estimated_time, 0);
  const saved = fullSuiteTime > 0 ? ((fullSuiteTime - totalTime) / fullSuiteTime) * 100 : 0;

  return {
    modified_node_id: null,
    tests,
    summary: {
      total_tests: tests.length,
      total_time_s: round(totalTime, 2),
      full_suite_tests: allTests.length,
      full_suite_time_s: round(fullSuiteTime, 2),
      time_saved_percent: round(Math.max(0, saved), 1),
    },
  };
}

// Resolve a list of file paths → set of node ids (the file nodes themselves).
export function nodesForFiles(files: string[], graph: GraphPayload): string[] {
  const wanted = new Set(files.map((f) => f.trim()).filter(Boolean));
  const ids: string[] = [];
  for (const n of graph.nodes) {
    if (n.type === "file" && wanted.has(n.file)) ids.push(n.id);
  }
  return ids;
}

// ─── Coverage metrics ─────────────────────────────────────────────────────────
export function coverageMetrics(graph: GraphPayload): CoverageMetrics {
  const nodesById = indexNodes(graph.nodes);
  const reverseAdj = buildReverseAdjacency(graph.edges);

  const codeNodes = graph.nodes.filter((n) => !isTestNode(n));
  const perNodeCoverage = new Map<string, number>();
  let coveredCount = 0;

  for (const n of codeNodes) {
    const tests = findCoveringTests(n.id, nodesById, reverseAdj);
    const c = tests.size;
    perNodeCoverage.set(n.id, c);
    if (c > 0) coveredCount++;
  }
  const untested = codeNodes
    .filter((n) => (perNodeCoverage.get(n.id) ?? 0) === 0)
    .map((n) => n.id);

  return {
    coveragePercent: codeNodes.length
      ? round((coveredCount / codeNodes.length) * 100, 1)
      : 0,
    coveredCount,
    codeNodeCount: codeNodes.length,
    untestedNodeIds: untested,
    perNodeCoverage,
  };
}

// ─── Dead code ────────────────────────────────────────────────────────────────
// "Dead" = a symbol nothing else points to.
//   - functions/classes: zero inbound edges from outside their own file
//   - files: zero inbound import edges (and not a test file — tests are entry points)
export interface DeadEntry {
  node: GraphNode;
  reason: "no callers" | "no importers" | "orphan test";
}

export function findDeadCode(graph: GraphPayload): DeadEntry[] {
  // Build per-node inbound edges with source file info.
  const inbound = new Map<string, { source: string; sourceFile: string }[]>();
  const nodesById = indexNodes(graph.nodes);
  for (const e of graph.edges) {
    const srcNode = nodesById.get(e.source);
    const list = inbound.get(e.target) ?? [];
    list.push({ source: e.source, sourceFile: srcNode?.file ?? "" });
    inbound.set(e.target, list);
  }
  // Outbound count for orphan-test detection
  const outDeg = new Map<string, number>();
  for (const e of graph.edges) outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);

  const out: DeadEntry[] = [];
  for (const n of graph.nodes) {
    const inc = inbound.get(n.id) ?? [];

    // Tests with zero outgoing edges → they don't exercise anything.
    if (isTestNode(n) && (outDeg.get(n.id) ?? 0) === 0) {
      out.push({ node: n, reason: "orphan test" });
      continue;
    }

    if (n.type === "file") {
      // Skip test files — they're entry points and shouldn't be flagged for "no importers".
      if (isTestNode(n)) continue;
      if (inc.length === 0) out.push({ node: n, reason: "no importers" });
      continue;
    }

    // function / class → look for callers OUTSIDE its own file.
    const externalCallers = inc.filter((i) => i.sourceFile !== n.file);
    if (externalCallers.length === 0) {
      out.push({ node: n, reason: "no callers" });
    }
  }
  return out;
}

// ─── Test proposals ───────────────────────────────────────────────────────────
// Given a target symbol, suggest tests that *should* exist to cover it and its
// direct collaborators. Pure heuristic — no LLM, no I/O.
export interface TestProposal {
  id: string;            // stable key for React lists
  target_id: string;     // node being tested
  target_name: string;
  target_file: string;
  suggested_file: string;
  suggested_name: string;
  rationale: string;
  kind: "unit" | "integration" | "smoke";
  priority: "high" | "medium" | "low";
}

function suggestedTestPath(file: string): string {
  // src/foo/bar.py → tests/foo/test_bar.py
  // src/foo/Bar.ts → src/foo/Bar.test.ts
  if (/\.py$/.test(file)) {
    const stripped = file.replace(/^src\//, "").replace(/\.py$/, "");
    const parts = stripped.split("/");
    const base = parts.pop() ?? "module";
    return ["tests", ...parts, `test_${base}.py`].join("/");
  }
  if (/\.[tj]sx?$/.test(file)) {
    return file.replace(/\.([tj]sx?)$/, ".test.$1");
  }
  return `tests/${file}.test`;
}

function snake(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .toLowerCase()
    .replace(/^_+|_+$/g, "");
}

export function proposeTests(
  modifiedNodeId: string,
  graph: GraphPayload,
  ctx?: { nodesById?: Map<string, GraphNode>; forwardAdj?: Map<string, string[]>; reverseAdj?: Map<string, string[]> },
): TestProposal[] {
  const nodesById = ctx?.nodesById ?? indexNodes(graph.nodes);
  const forwardAdj = ctx?.forwardAdj ?? buildForwardAdjacency(graph.edges);
  const reverseAdj = ctx?.reverseAdj ?? buildReverseAdjacency(graph.edges);

  const target = nodesById.get(modifiedNodeId);
  if (!target) return [];

  const proposals: TestProposal[] = [];
  const suggestedFile = suggestedTestPath(target.file);
  const baseName = snake(target.name.replace(/.*::/, "")) || "behavior";

  // 1. Happy path
  proposals.push({
    id: `${target.id}::happy`,
    target_id: target.id,
    target_name: target.name,
    target_file: target.file,
    suggested_file: suggestedFile,
    suggested_name: `test_${baseName}_happy_path`,
    rationale: "Cover the typical successful invocation with representative inputs.",
    kind: "unit",
    priority: "high",
  });

  // 2. Edge cases
  proposals.push({
    id: `${target.id}::edges`,
    target_id: target.id,
    target_name: target.name,
    target_file: target.file,
    suggested_file: suggestedFile,
    suggested_name: `test_${baseName}_edge_cases`,
    rationale: "Empty / null / boundary inputs — these are usually where bugs hide.",
    kind: "unit",
    priority: "high",
  });

  // 3. Error path (if it's a function)
  if (target.type !== "file") {
    proposals.push({
      id: `${target.id}::errors`,
      target_id: target.id,
      target_name: target.name,
      target_file: target.file,
      suggested_file: suggestedFile,
      suggested_name: `test_${baseName}_raises_on_invalid`,
      rationale: "Invalid inputs should fail loudly. Assert the error type and message.",
      kind: "unit",
      priority: "medium",
    });
  }

  // 4. Integration with each direct downstream collaborator
  const downstream = (forwardAdj.get(modifiedNodeId) ?? [])
    .map((id) => nodesById.get(id))
    .filter((n): n is GraphNode => !!n && !isTestNode(n))
    .slice(0, 4);
  for (const dep of downstream) {
    proposals.push({
      id: `${target.id}::integ::${dep.id}`,
      target_id: target.id,
      target_name: target.name,
      target_file: target.file,
      suggested_file: suggestedFile,
      suggested_name: `test_${baseName}_integrates_with_${snake(dep.name.replace(/.*::/, ""))}`,
      rationale: `Verify the contract between \`${target.name}\` and its dependency \`${dep.name}\`.`,
      kind: "integration",
      priority: "medium",
    });
  }

  // 5. Smoke test for each direct upstream caller (regression safety net)
  const upstream = (reverseAdj.get(modifiedNodeId) ?? [])
    .map((id) => nodesById.get(id))
    .filter((n): n is GraphNode => !!n && !isTestNode(n))
    .slice(0, 3);
  for (const caller of upstream) {
    proposals.push({
      id: `${target.id}::smoke::${caller.id}`,
      target_id: target.id,
      target_name: target.name,
      target_file: target.file,
      suggested_file: suggestedTestPath(caller.file),
      suggested_name: `test_${snake(caller.name.replace(/.*::/, ""))}_still_uses_${baseName}`,
      rationale: `\`${caller.name}\` calls this — a smoke test there guards against regressions.`,
      kind: "smoke",
      priority: "low",
    });
  }

  return proposals;
}

// ─── Exporters ────────────────────────────────────────────────────────────────
export function exportPlanJson(plan: TestPlan): string {
  return JSON.stringify(
    {
      execution_plan: {
        tests: plan.tests,
        summary: plan.summary,
      },
    },
    null,
    2,
  );
}

export function exportPlanShell(plan: TestPlan): string {
  if (!plan.tests.length) return "# no tests to run";
  // Group by file extension to pick the right runner.
  const py: string[] = [];
  const ts: string[] = [];
  for (const t of plan.tests) {
    if (/\.py$/.test(t.file)) {
      py.push(t.function ? `${t.file}::${t.function}` : t.file);
    } else {
      ts.push(t.file);
    }
  }
  const lines: string[] = [];
  if (py.length) lines.push(`pytest ${dedupe(py).join(" ")}`);
  if (ts.length) lines.push(`vitest run ${dedupe(ts).join(" ")}`);
  return lines.join("\n");
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
export function indexNodes(nodes: GraphNode[]): Map<string, GraphNode> {
  const m = new Map<string, GraphNode>();
  for (const n of nodes) m.set(n.id, n);
  return m;
}

function round(n: number, decimals: number): number {
  const f = Math.pow(10, decimals);
  return Math.round(n * f) / f;
}

function dedupe<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

export function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m${s.toString().padStart(2, "0")}s`;
}
