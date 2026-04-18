import type { GraphEdge, GraphNode } from "./sample-graph";

export type CycleInfo = {
  cyclicNodeIds: Set<string>;
  cycles: string[][];
};

export type OrphanInfo = {
  orphanIds: Set<string>;
};

export type GraphMetrics = {
  pagerank: Map<string, number>;
  pagerankPercentile: Map<string, number>;
  betweenness: Map<string, number>;
  clustering: Map<string, number>;
  stats: GraphStats;
  cycles: CycleInfo;
  orphans: OrphanInfo;
};

export type GraphStats = {
  diameter: number;
  avgPathLength: number;
  density: number;
  components: number;
  healthScore: number;
};

// ─── PageRank ────────────────────────────────────────────────────────────────
// Power-iteration. Every edge type treated as a directed link.
export function computePageRank(
  nodes: GraphNode[],
  edges: GraphEdge[],
  iterations = 50,
  damping = 0.85,
): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const N = ids.length;
  if (N === 0) return new Map();

  // out-neighbours
  const out = new Map<string, string[]>();
  for (const id of ids) out.set(id, []);
  for (const e of edges) {
    if (out.has(e.source) && out.has(e.target)) out.get(e.source)!.push(e.target);
  }

  let rank = new Map<string, number>(ids.map((id) => [id, 1 / N]));

  for (let iter = 0; iter < iterations; iter++) {
    const next = new Map<string, number>();
    for (const id of ids) next.set(id, (1 - damping) / N);

    for (const id of ids) {
      const outLinks = out.get(id)!;
      if (outLinks.length === 0) {
        // dangling node: distribute evenly
        const share = (damping * rank.get(id)!) / N;
        for (const tid of ids) next.set(tid, next.get(tid)! + share);
      } else {
        const share = (damping * rank.get(id)!) / outLinks.length;
        for (const t of outLinks) {
          if (next.has(t)) next.set(t, next.get(t)! + share);
        }
      }
    }
    rank = next;
  }

  // normalise to sum=1
  const total = [...rank.values()].reduce((a, b) => a + b, 0);
  if (total > 0) for (const [id, v] of rank) rank.set(id, v / total);
  return rank;
}

// ─── Betweenness Centrality (Brandes) ────────────────────────────────────────
// Undirected version. Normalised to [0,1].
// Optimised: index-based queue (no .shift()), plain object maps, source sampling for big N.
export function computeBetweenness(
  nodes: GraphNode[],
  edges: GraphEdge[],
  maxSources = 200,
): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const N = ids.length;
  if (N < 3) return new Map(ids.map((id) => [id, 0]));

  // build undirected adjacency as plain object (faster than Map for hot loops)
  const adj: Record<string, string[]> = Object.create(null);
  for (const id of ids) adj[id] = [];
  for (const e of edges) {
    if (adj[e.source] && adj[e.target]) {
      adj[e.source].push(e.target);
      adj[e.target].push(e.source);
    }
  }

  const bc: Record<string, number> = Object.create(null);
  for (const id of ids) bc[id] = 0;

  // Sample sources for large graphs; scale up at end.
  const sources = N > maxSources ? sampleNodes(ids, maxSources) : ids;
  const scaleUp = N > maxSources ? N / sources.length : 1;

  for (const s of sources) {
    const stack: string[] = [];
    const pred: Record<string, string[]> = Object.create(null);
    const sigma: Record<string, number> = Object.create(null);
    const dist: Record<string, number> = Object.create(null);
    sigma[s] = 1;
    dist[s] = 0;
    const queue: string[] = [s];
    let head = 0;

    while (head < queue.length) {
      const v = queue[head++];
      stack.push(v);
      const dv = dist[v];
      const sv = sigma[v];
      const nbrs = adj[v];
      for (let k = 0; k < nbrs.length; k++) {
        const w = nbrs[k];
        if (dist[w] === undefined) {
          queue.push(w);
          dist[w] = dv + 1;
        }
        if (dist[w] === dv + 1) {
          sigma[w] = (sigma[w] ?? 0) + sv;
          (pred[w] ??= []).push(v);
        }
      }
    }

    const delta: Record<string, number> = Object.create(null);
    while (stack.length) {
      const w = stack.pop()!;
      const ps = pred[w];
      if (ps) {
        const factor = (1 + (delta[w] ?? 0)) / sigma[w];
        for (let k = 0; k < ps.length; k++) {
          const v = ps[k];
          delta[v] = (delta[v] ?? 0) + sigma[v] * factor;
        }
      }
      if (w !== s) bc[w] += (delta[w] ?? 0) * scaleUp;
    }
  }

  // normalise
  const maxPairs = (N - 1) * (N - 2) / 2;
  const out = new Map<string, number>();
  if (maxPairs > 0) {
    for (const id of ids) out.set(id, bc[id] / (2 * maxPairs));
  } else {
    for (const id of ids) out.set(id, 0);
  }
  return out;
}

// ─── Clustering Coefficient ───────────────────────────────────────────────────
export function computeClusteringCoefficient(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, number> {
  const ids = nodes.map((n) => n.id);
  const adj = new Map<string, Set<string>>();
  for (const id of ids) adj.set(id, new Set());
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }
  }

  const cc = new Map<string, number>();
  for (const id of ids) {
    const nbrs = [...adj.get(id)!];
    const k = nbrs.length;
    if (k < 2) { cc.set(id, 0); continue; }
    let links = 0;
    for (let i = 0; i < nbrs.length; i++) {
      for (let j = i + 1; j < nbrs.length; j++) {
        if (adj.get(nbrs[i])!.has(nbrs[j])) links++;
      }
    }
    cc.set(id, (2 * links) / (k * (k - 1)));
  }
  return cc;
}

// ─── Cycle Detection (DFS, directed, import edges only) ──────────────────────
export function detectCycles(
  nodes: GraphNode[],
  edges: GraphEdge[],
  edgeTypes: Array<GraphEdge["type"]> = ["imports", "include"],
): CycleInfo {
  const ids = nodes.map((n) => n.id);
  const adj = new Map<string, string[]>();
  for (const id of ids) adj.set(id, []);
  for (const e of edges) {
    if (!edgeTypes.includes(e.type)) continue;
    if (adj.has(e.source) && adj.has(e.target))
      adj.get(e.source)!.push(e.target);
  }

  // 0=unvisited, 1=in stack, 2=done
  const color = new Map<string, 0 | 1 | 2>(ids.map((id) => [id, 0]));
  const cyclicNodeIds = new Set<string>();
  const rawCycles: string[][] = [];
  const path: string[] = [];

  function dfs(v: string) {
    color.set(v, 1);
    path.push(v);
    for (const w of adj.get(v)!) {
      if (color.get(w) === 1) {
        const start = path.indexOf(w);
        rawCycles.push(path.slice(start));
      } else if (color.get(w) === 0) {
        dfs(w);
      }
    }
    path.pop();
    color.set(v, 2);
  }

  for (const id of ids) if (color.get(id) === 0) dfs(id);

  // Deduplicate: normalise each cycle so smallest id is first
  const seen = new Set<string>();
  const cycles: string[][] = [];
  for (const c of rawCycles) {
    const minIdx = c.reduce((mi, id, i) => (id < c[mi] ? i : mi), 0);
    const norm = [...c.slice(minIdx), ...c.slice(0, minIdx)];
    const key = norm.join("→");
    if (!seen.has(key)) {
      seen.add(key);
      cycles.push(norm);
      for (const id of norm) cyclicNodeIds.add(id);
    }
  }

  return { cyclicNodeIds, cycles };
}

// ─── Orphan Detection ─────────────────────────────────────────────────────────
// Orphans have no incoming directed edges (excluding "contains").
export function detectOrphans(
  nodes: GraphNode[],
  edges: GraphEdge[],
): OrphanInfo {
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  for (const e of edges) {
    if ((e.type as string) === "contains") continue;
    if (inDegree.has(e.target))
      inDegree.set(e.target, inDegree.get(e.target)! + 1);
  }
  const orphanIds = new Set<string>();
  for (const [id, deg] of inDegree) if (deg === 0) orphanIds.add(id);
  return { orphanIds };
}

// ─── Graph Stats (BFS-based) ──────────────────────────────────────────────────
export function computeGraphStats(
  nodes: GraphNode[],
  edges: GraphEdge[],
  betweenness?: Map<string, number>,
  cycles?: CycleInfo,
): GraphStats {
  const ids = nodes.map((n) => n.id);
  const N = ids.length;
  if (N === 0) return { diameter: 0, avgPathLength: 0, density: 0, components: 0, healthScore: 100 };

  const adj = new Map<string, Set<string>>();
  for (const id of ids) adj.set(id, new Set());
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      adj.get(e.source)!.add(e.target);
      adj.get(e.target)!.add(e.source);
    }
  }

  // BFS shortest paths from a set of source nodes
  const MAX_SOURCES = 60;
  const sources = N <= MAX_SOURCES ? ids : sampleNodes(ids, MAX_SOURCES);

  let diameter = 0;
  let totalPath = 0;
  let pathCount = 0;

  for (const s of sources) {
    const dist = new Map<string, number>([[s, 0]]);
    const queue = [s];
    while (queue.length) {
      const v = queue.shift()!;
      for (const w of adj.get(v)!) {
        if (!dist.has(w)) {
          dist.set(w, dist.get(v)! + 1);
          queue.push(w);
        }
      }
    }
    for (const d of dist.values()) {
      if (d > 0) { totalPath += d; pathCount++; if (d > diameter) diameter = d; }
    }
  }

  const avgPathLength = pathCount > 0 ? totalPath / pathCount : 0;

  // density: undirected unique edges / max possible
  const uniqueEdges = new Set(
    edges.map((e) => [e.source, e.target].sort().join("→"))
  ).size;
  const maxEdges = (N * (N - 1)) / 2;
  const density = maxEdges > 0 ? uniqueEdges / maxEdges : 0;

  // weakly connected components (union-find)
  const parent = new Map(ids.map((id) => [id, id]));
  const find = (x: string): string => {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  };
  for (const e of edges) {
    if (adj.has(e.source) && adj.has(e.target)) {
      const a = find(e.source), b = find(e.target);
      if (a !== b) parent.set(a, b);
    }
  }
  const components = new Set(ids.map(find)).size;

  // health score
  const bc = betweenness ?? computeBetweenness(nodes, edges);
  const maxBC = Math.max(0, ...[...bc.values()]);

  let score = 100;
  if (maxBC > 0.6) score -= 25;
  else if (maxBC > 0.35) score -= 15;
  if (diameter > 10) score -= 15;
  else if (diameter > 7) score -= 10;
  if (components > 1) score -= 20;
  if (density < 0.05 || density > 0.40) score -= 10;
  if (cycles) score -= Math.min(30, cycles.cycles.length * 12);

  return {
    diameter,
    avgPathLength: Math.round(avgPathLength * 10) / 10,
    density,
    components,
    healthScore: Math.max(0, Math.min(100, score)),
  };
}

// ─── Compute All ─────────────────────────────────────────────────────────────
export function computeAllMetrics(
  nodes: GraphNode[],
  edges: GraphEdge[],
): GraphMetrics {
  const pagerank = computePageRank(nodes, edges);
  const betweenness = computeBetweenness(nodes, edges);
  const clustering = computeClusteringCoefficient(nodes, edges);
  const cycles = detectCycles(nodes, edges);
  const orphans = detectOrphans(nodes, edges);
  const stats = computeGraphStats(nodes, edges, betweenness, cycles);
  const pagerankPercentile = buildPercentileMap(pagerank);
  return { pagerank, pagerankPercentile, betweenness, clustering, stats, cycles, orphans };
}

// Build an O(1) percentile lookup map from a value map.
export function buildPercentileMap(map: Map<string, number>): Map<string, number> {
  const sorted = [...map.values()].sort((a, b) => a - b);
  const N = sorted.length;
  const out = new Map<string, number>();
  for (const [id, val] of map) {
    let lo = 0, hi = N;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < val) lo = mid + 1;
      else hi = mid;
    }
    out.set(id, N > 1 ? lo / (N - 1) : 0);
  }
  return out;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function sampleNodes(ids: string[], n: number): string[] {
  if (ids.length <= n) return ids;
  const step = ids.length / n;
  const out: string[] = [];
  for (let i = 0; i < n; i++) out.push(ids[Math.floor(i * step)]);
  return out;
}

// Interpolate between two HSL stops
function lerpHSL(
  h1: number, s1: number, l1: number,
  h2: number, s2: number, l2: number,
  t: number,
): string {
  const h = h1 + (h2 - h1) * t;
  const s = s1 + (s2 - s1) * t;
  const l = l1 + (l2 - l1) * t;
  return `hsl(${Math.round(h)},${Math.round(s)}%,${Math.round(l)}%)`;
}

// 4-stop PageRank colour: grey → teal → deep teal → burnt orange
export function pagerankColor(normalised: number): string {
  // normalised = percentile rank [0,1]
  if (normalised < 0.4)
    return lerpHSL(38, 25, 72, 184, 55, 44, normalised / 0.4);
  if (normalised < 0.7)
    return lerpHSL(184, 55, 44, 184, 70, 30, (normalised - 0.4) / 0.3);
  if (normalised < 0.9)
    return lerpHSL(184, 70, 30, 25, 85, 42, (normalised - 0.7) / 0.2);
  return lerpHSL(25, 85, 42, 6, 80, 40, (normalised - 0.9) / 0.1);
}

// Betweenness: green → amber → red
export function betweennessColor(score: number): string {
  if (score < 0.4) return lerpHSL(142, 38, 38, 32, 88, 50, score / 0.4);
  return lerpHSL(32, 88, 50, 6, 70, 48, (score - 0.4) / 0.6);
}

// Clustering: indigo → amber
export function clusteringColor(score: number): string {
  return lerpHSL(220, 38, 44, 32, 82, 44, score);
}

// Sort map by value descending, return top N entries
export function topN(map: Map<string, number>, n: number): [string, number][] {
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

// Compute percentile rank for a value in a map (0 = lowest, 1 = highest)
export function percentileRank(map: Map<string, number>, id: string): number {
  const val = map.get(id) ?? 0;
  const all = [...map.values()].sort((a, b) => a - b);
  const idx = all.findIndex((v) => v >= val);
  return all.length > 1 ? idx / (all.length - 1) : 0;
}
