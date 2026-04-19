// Graph abstraction-layer utilities.
// Pure functions that transform a GraphPayload into a sparser version
// for higher-level visual abstraction (modules / files / symbols).

import type { GraphEdge, GraphNode, GraphPayload } from "@/lib/sample-graph";
import type { GraphMetrics } from "@/lib/graph-metrics";

export type AbstractionLevel = "module" | "file" | "symbol";

// Mirrors the zoneKey logic in CodeGraphCanvas so module ids stay consistent.
export const moduleKey = (file: string): string => {
  if (!file) return "root";
  const parts = file.split("/").filter(Boolean);
  if (parts.length <= 1) return "root";
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
};

export const moduleNodeId = (key: string) => `module:${key}`;

// Edge with an aggregate weight (used for module-level edges).
export type WeightedEdge = GraphEdge & { weight?: number };

/**
 * Collapse a full symbol-level graph into a module-level graph.
 * Each top-level folder becomes a single synthetic "module" node.
 * Edges between modules are aggregated; weight = number of underlying edges.
 */
export function collapseToModules(payload: GraphPayload): GraphPayload {
  const fileToModule = new Map<string, string>();
  const moduleSet = new Map<string, { fileCount: number; symbolCount: number }>();

  for (const n of payload.nodes) {
    const k = moduleKey(n.file);
    fileToModule.set(n.id, k);
    if (!moduleSet.has(k)) moduleSet.set(k, { fileCount: 0, symbolCount: 0 });
    const m = moduleSet.get(k)!;
    if (n.type === "file") m.fileCount += 1;
    else m.symbolCount += 1;
  }

  const nodes: GraphNode[] = Array.from(moduleSet.entries()).map(([k, info]) => ({
    id: moduleNodeId(k),
    type: "file",
    file: k,
    name: k,
    loc: info.symbolCount,
    churn_score: info.fileCount,
  }));

  // Aggregate cross-module edges.
  const edgeAgg = new Map<string, { source: string; target: string; type: GraphEdge["type"]; weight: number }>();
  for (const e of payload.edges) {
    const sMod = fileToModule.get(e.source);
    const tMod = fileToModule.get(e.target);
    if (!sMod || !tMod || sMod === tMod) continue;
    const key = `${sMod}→${tMod}|${e.type}`;
    const prev = edgeAgg.get(key);
    if (prev) prev.weight += 1;
    else edgeAgg.set(key, { source: moduleNodeId(sMod), target: moduleNodeId(tMod), type: e.type, weight: 1 });
  }

  const edges: GraphEdge[] = Array.from(edgeAgg.values()).map((e) => ({
    source: e.source,
    target: e.target,
    type: e.type,
  }));

  return { nodes, edges };
}

/**
 * Collapse to file-level: keep only file nodes and import/include edges
 * between files. Drops classes, functions, and call edges.
 */
export function collapseToFiles(payload: GraphPayload): GraphPayload {
  const fileNodeIds = new Set<string>();
  const nodes: GraphNode[] = [];
  for (const n of payload.nodes) {
    if (n.type === "file") {
      fileNodeIds.add(n.id);
      nodes.push(n);
    }
  }

  const seen = new Set<string>();
  const edges: GraphEdge[] = [];
  for (const e of payload.edges) {
    if (e.type !== "imports" && e.type !== "include") continue;
    if (!fileNodeIds.has(e.source) || !fileNodeIds.has(e.target)) continue;
    const key = `${e.source}→${e.target}|${e.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    edges.push(e);
  }
  return { nodes, edges };
}

/**
 * BFS subgraph centred on rootId, expanding `hops` levels in either direction.
 * Used for "focus on module/file" drill-down.
 */
export function focusSubgraph(payload: GraphPayload, rootId: string, hops = 1): GraphPayload {
  const adj = new Map<string, Set<string>>();
  for (const e of payload.edges) {
    if (!adj.has(e.source)) adj.set(e.source, new Set());
    if (!adj.has(e.target)) adj.set(e.target, new Set());
    adj.get(e.source)!.add(e.target);
    adj.get(e.target)!.add(e.source);
  }

  const visited = new Set<string>([rootId]);
  let frontier: string[] = [rootId];
  for (let i = 0; i < hops; i++) {
    const next: string[] = [];
    for (const id of frontier) {
      const ns = adj.get(id);
      if (!ns) continue;
      for (const nb of ns) {
        if (!visited.has(nb)) {
          visited.add(nb);
          next.push(nb);
        }
      }
    }
    frontier = next;
  }

  const nodes = payload.nodes.filter((n) => visited.has(n.id));
  const edges = payload.edges.filter((e) => visited.has(e.source) && visited.has(e.target));
  return { nodes, edges };
}

/**
 * Filter a symbol-level payload to a single module's contents (all files and
 * symbols whose file falls under the moduleKey), plus 1-hop external nodes.
 */
export function focusOnModule(payload: GraphPayload, modKey: string): GraphPayload {
  const inMod = new Set<string>();
  for (const n of payload.nodes) {
    if (moduleKey(n.file) === modKey) inMod.add(n.id);
  }
  // Include 1-hop neighbours so we can see how the module connects out.
  const neighbours = new Set<string>(inMod);
  for (const e of payload.edges) {
    if (inMod.has(e.source)) neighbours.add(e.target);
    if (inMod.has(e.target)) neighbours.add(e.source);
  }
  const nodes = payload.nodes.filter((n) => neighbours.has(n.id));
  const edges = payload.edges.filter((e) => neighbours.has(e.source) && neighbours.has(e.target));
  return { nodes, edges };
}

/**
 * Apply the requested abstraction level + optional focus root.
 * `focusStack`: ordered drill-down — [moduleKey, fileId?]
 */
export function applyAbstraction(
  full: GraphPayload,
  level: AbstractionLevel,
  focusStack: string[] = [],
): GraphPayload {
  // Drill into a module first if focused.
  let working = full;
  const focusedModule = focusStack[0];
  const focusedFile = focusStack[1];

  if (focusedModule) {
    working = focusOnModule(full, focusedModule);
  }

  if (level === "module") {
    return collapseToModules(working);
  }
  if (level === "file") {
    return collapseToFiles(working);
  }
  // symbol level — optionally narrow to the focused file's neighbourhood.
  if (focusedFile) {
    return focusSubgraph(working, focusedFile, 1);
  }
  return working;
}
