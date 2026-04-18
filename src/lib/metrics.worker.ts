/// <reference lib="webworker" />
import type { GraphEdge, GraphNode } from "./sample-graph";
import { computeAllMetrics } from "./graph-metrics";

export type WorkerRequest = {
  id: number;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

export type WorkerResponse = {
  id: number;
  pagerank: Array<[string, number]>;
  betweenness: Array<[string, number]>;
  clustering: Array<[string, number]>;
  pagerankPercentile: Array<[string, number]>;
  stats: ReturnType<typeof computeAllMetrics>["stats"];
  cycles: { cyclicNodeIds: string[]; cycles: string[][] };
  orphans: { orphanIds: string[] };
};

self.addEventListener("message", (ev: MessageEvent<WorkerRequest>) => {
  const { id, nodes, edges } = ev.data;
  const m = computeAllMetrics(nodes, edges);

  // Build pagerank percentile map once
  const sorted = [...m.pagerank.values()].sort((a, b) => a - b);
  const N = sorted.length;
  const pct = new Map<string, number>();
  for (const [nodeId, val] of m.pagerank) {
    // binary search for index
    let lo = 0, hi = N;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (sorted[mid] < val) lo = mid + 1;
      else hi = mid;
    }
    pct.set(nodeId, N > 1 ? lo / (N - 1) : 0);
  }

  const out: WorkerResponse = {
    id,
    pagerank: [...m.pagerank.entries()],
    betweenness: [...m.betweenness.entries()],
    clustering: [...m.clustering.entries()],
    pagerankPercentile: [...pct.entries()],
    stats: m.stats,
    cycles: {
      cyclicNodeIds: [...m.cycles.cyclicNodeIds],
      cycles: m.cycles.cycles,
    },
    orphans: { orphanIds: [...m.orphans.orphanIds] },
  };
  (self as unknown as Worker).postMessage(out);
});
