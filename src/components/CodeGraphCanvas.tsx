import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  Simulation,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity, ZoomBehavior } from "d3-zoom";
import type { GraphEdge, GraphNode, GraphPayload } from "@/lib/sample-graph";
import {
  type GraphMetrics,
  betweennessColor,
  clusteringColor,
  pagerankColor,
} from "@/lib/graph-metrics";

type SimNode = GraphNode & {
  x?: number; y?: number;
  fx?: number | null; fy?: number | null;
  vx?: number; vy?: number;
  degree?: number;
};

type SimLink = {
  source: SimNode | string;
  target: SimNode | string;
  type: GraphEdge["type"] | "contains";
};

type NodeType = GraphNode["type"];
type EdgeType = GraphEdge["type"] | "contains";

// Warm cream palette — stays consistent with the paper design system
const NODE_COLOR: Record<NodeType, string> = {
  file: "hsl(184,68%,34%)",      // teal accent
  class: "hsl(32,82%,44%)",      // warm amber
  function: "hsl(220,38%,44%)",  // muted indigo
};

const EDGE_COLOR: Record<EdgeType, string> = {
  imports: "hsl(184,68%,34%)",
  calls: "hsl(220,38%,44%)",
  include: "hsl(32,82%,44%)",
  contains: "hsl(25,18%,14%)",
};

const EDGE_BASE_OPACITY: Record<EdgeType, number> = {
  imports: 0.5,
  calls: 0.4,
  include: 0.4,
  contains: 0.1,
};

const baseR = (type: NodeType) => (type === "file" ? 5 : type === "class" ? 4 : 3);
const nodeR = (n: SimNode) => baseR(n.type) + Math.sqrt(n.degree ?? 0) * 1.4;

const zoneKey = (file: string): string => {
  if (!file) return "root";
  const parts = file.split("/").filter(Boolean);
  if (parts.length <= 1) return "root";
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
};

const hashHue = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
};

interface PhysicsConfig {
  repel: number;
  linkDistance: number;
  centerStrength: number;
}

const DEFAULT_PHYSICS: PhysicsConfig = { repel: -180, linkDistance: 110, centerStrength: 0.04 };

const PAPER_BG = "hsl(38,36%,96%)";

// Warm glass panels — matches the paper design system
const GLASS: React.CSSProperties = {
  background: "rgba(252,249,244,0.88)",
  borderColor: "rgba(160,138,110,0.28)",
  backdropFilter: "blur(16px)",
};

const GLASS_TEXT = "hsl(25,18%,14%)";
const GLASS_MUTED = "hsl(25,10%,42%)";
const GLASS_BORDER = "rgba(160,138,110,0.22)";

function toggle<T>(set: Set<T>, val: T): Set<T> {
  const next = new Set(set);
  next.has(val) ? next.delete(val) : next.add(val);
  return next;
}

export type AnalysisMode = "none" | "pagerank" | "betweenness" | "clustering";

// Resolve node fill colour based on active analysis overlay
function analysisColor(
  n: SimNode,
  mode: AnalysisMode,
  metrics: GraphMetrics | undefined,
): string {
  if (mode === "none" || !metrics) return NODE_COLOR[n.type];
  if (mode === "pagerank") {
    const pct = metrics.pagerankPercentile.get(n.id) ?? 0;
    return pagerankColor(pct);
  }
  if (mode === "betweenness") {
    const score = metrics.betweenness.get(n.id) ?? 0;
    return betweennessColor(score);
  }
  if (mode === "clustering") {
    const score = metrics.clustering.get(n.id) ?? 0;
    return clusteringColor(score);
  }
  return NODE_COLOR[n.type];
}

// PageRank radius boost on top of degree-based radius
function analysisRadius(n: SimNode, mode: AnalysisMode, metrics: GraphMetrics | undefined): number {
  const base = nodeR(n);
  if (mode === "pagerank" && metrics) {
    const score = metrics.pagerank.get(n.id) ?? 0;
    return base + score * 28;
  }
  return base;
}

export const CodeGraphCanvas = ({
  data,
  selectedId,
  onSelect,
  search = "",
  metrics,
  analysisMode = "none",
}: {
  data: GraphPayload;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  search?: string;
  metrics?: GraphMetrics;
  analysisMode?: AnalysisMode;
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());
  // One <path> per edge style — bulk geometry. Hover overlay is separate.
  const edgePathRefs = useRef<Map<EdgeType, SVGPathElement>>(new Map());
  const edgeOverlayRef = useRef<SVGPathElement | null>(null);
  const zoneRectRefs = useRef<Map<string, SVGRectElement>>(new Map());
  const zoneLabelRefs = useRef<Map<string, SVGGElement>>(new Map());
  // Pan/zoom transform for viewport culling.
  const transformRef = useRef<{ k: number; x: number; y: number }>({ k: 1, x: 0, y: 0 });
  // Track which nodes are off-screen (for culling).
  const culledRef = useRef<Set<string>>(new Set());
  // Active highlight set, kept in a ref so the tick loop can rebuild the overlay
  // path without re-subscribing to the simulation.
  const highlightRef = useRef<Set<string> | null>(null);

  const [size, setSize] = useState({ w: 800, h: 640 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  // Bumped only on simulation settle / data change — NOT every tick.
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [nodeTypeFilters, setNodeTypeFilters] = useState<Set<NodeType>>(
    new Set(["file", "class", "function"]),
  );
  const [edgeTypeFilters, setEdgeTypeFilters] = useState<Set<EdgeType>>(
    new Set(["imports", "calls", "include", "contains"]),
  );
  const [physics, setPhysics] = useState<PhysicsConfig>(DEFAULT_PHYSICS);

  // Scale-based perf gating
  const HEAVY_NODE_COUNT = 400;
  const VERY_HEAVY_NODE_COUNT = 1500;
  const HEAVY_EDGE_COUNT = 800;

  const { nodes, links, neighborMap, zoneList, zoneByNodeId } = useMemo(() => {
    const visibleNodes = data.nodes.filter((n) => nodeTypeFilters.has(n.type));
    const nodes: SimNode[] = visibleNodes.map((n) => ({ ...n, degree: 0 }));
    const idx = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = [];
    const neighborMap = new Map<string, Set<string>>();

    if (edgeTypeFilters.has("contains")) {
      const fileById = new Map<string, SimNode>();
      for (const n of nodes) if (n.type === "file") fileById.set(n.file, n);
      for (const n of nodes) {
        if (n.type === "file") continue;
        const parent = fileById.get(n.file);
        if (parent && parent.id !== n.id)
          links.push({ source: parent, target: n, type: "contains" });
      }
    }

    for (const e of data.edges) {
      if (!edgeTypeFilters.has(e.type)) continue;
      const s = idx.get(e.source);
      const t = idx.get(e.target);
      if (!s || !t) continue;
      links.push({ source: s, target: t, type: e.type });
      s.degree = (s.degree ?? 0) + 1;
      t.degree = (t.degree ?? 0) + 1;
      if (!neighborMap.has(s.id)) neighborMap.set(s.id, new Set());
      if (!neighborMap.has(t.id)) neighborMap.set(t.id, new Set());
      neighborMap.get(s.id)!.add(t.id);
      neighborMap.get(t.id)!.add(s.id);
    }

    const zoneMembers = new Map<string, SimNode[]>();
    for (const n of nodes) {
      const k = zoneKey(n.file);
      if (!zoneMembers.has(k)) zoneMembers.set(k, []);
      zoneMembers.get(k)!.push(n);
    }
    const zoneList = Array.from(zoneMembers.entries())
      .map(([key, members]) => ({ key, members, hue: hashHue(key) }))
      .sort((a, b) => b.members.length - a.members.length);
    const zoneByNodeId = new Map<string, string>();
    for (const z of zoneList) for (const m of z.members) zoneByNodeId.set(m.id, z.key);

    return { nodes, links, neighborMap, zoneList, zoneByNodeId };
  }, [data, nodeTypeFilters, edgeTypeFilters]);

  useEffect(() => {
    if (!svgRef.current) return;
    const el = svgRef.current.parentElement!;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setSize({ w: Math.max(400, r.width), h: Math.max(400, r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoneAnchors = useMemo(() => {
    const anchors = new Map<string, { cx: number; cy: number }>();
    const n = zoneList.length;
    if (!n) return anchors;
    const cols = Math.ceil(Math.sqrt(n * (size.w / size.h)));
    const cellW = size.w / cols;
    const cellH = size.h / Math.ceil(n / cols);
    zoneList.forEach((z, i) => {
      anchors.set(z.key, {
        cx: cellW * (i % cols + 0.5),
        cy: cellH * (Math.floor(i / cols) + 0.5),
      });
    });
    return anchors;
  }, [zoneList, size.w, size.h]);

  // Simulation with direct DOM mutation on tick
  useEffect(() => {
    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => (l.type === "contains" ? 20 : physics.linkDistance))
          .strength((l) =>
            l.type === "contains" ? 1.2 : l.type === "imports" ? 0.5 : 0.3,
          ),
      )
      .force("charge", forceManyBody().strength(physics.repel))
      .force("collide", forceCollide<SimNode>().radius((d) => nodeR(d) + 14))
      .force(
        "x",
        forceX<SimNode>((d) => {
          const k = zoneByNodeId.get(d.id);
          return (k && zoneAnchors.get(k)?.cx) ?? size.w / 2;
        }).strength(physics.centerStrength),
      )
      .force(
        "y",
        forceY<SimNode>((d) => {
          const k = zoneByNodeId.get(d.id);
          return (k && zoneAnchors.get(k)?.cy) ?? size.h / 2;
        }).strength(physics.centerStrength),
      )
      .alpha(1)
      .alphaDecay(0.025);

    // Build zone-member index once per (re-)build for fast bbox recompute.
    const zoneMembersByKey = new Map<string, SimNode[]>();
    for (const z of zoneList) zoneMembersByKey.set(z.key, z.members);

    // Pre-bucket links by type so we can build one path per type per tick.
    const linksByType = new Map<EdgeType, SimLink[]>();
    for (const l of links) {
      const arr = linksByType.get(l.type);
      if (arr) arr.push(l);
      else linksByType.set(l.type, [l]);
    }

    let lastZone = 0;
    let lastCull = 0;
    let tickCounter = 0;
    let settledTimer: ReturnType<typeof setTimeout> | null = null;
    let idleTimer: ReturnType<typeof setTimeout> | null = null;

    const updateZoneRects = () => {
      if (!showZones) return;
      const PAD = 32;
      for (const [key, members] of zoneMembersByKey) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        let any = false;
        for (const p of members) {
          if (p.x == null || p.y == null) continue;
          const r = nodeR(p) + 2;
          any = true;
          if (p.x - r < minX) minX = p.x - r;
          if (p.y - r < minY) minY = p.y - r;
          if (p.x + r > maxX) maxX = p.x + r;
          if (p.y + r > maxY) maxY = p.y + r;
        }
        if (!any) continue;
        const x = minX - PAD, y = minY - PAD;
        const w = maxX - minX + PAD * 2, h = maxY - minY + PAD * 2;
        const rect = zoneRectRefs.current.get(key);
        if (rect) {
          rect.setAttribute("x", String(x));
          rect.setAttribute("y", String(y));
          rect.setAttribute("width", String(w));
          rect.setAttribute("height", String(h));
        }
        const lbl = zoneLabelRefs.current.get(key);
        if (lbl) lbl.setAttribute("transform", `translate(${x},${y})`);
      }
    };

    // Compute viewport-cull set using current pan/zoom transform.
    const updateCulling = () => {
      const culled = culledRef.current;
      const t = transformRef.current;
      // Convert screen viewport to graph coords: graphX = (screenX - tx) / k
      const k = t.k || 1;
      const margin = 80; // px buffer in screen space
      const x0 = (-t.x - margin) / k;
      const y0 = (-t.y - margin) / k;
      const x1 = (size.w - t.x + margin) / k;
      const y1 = (size.h - t.y + margin) / k;
      const next = new Set<string>();
      for (const n of nodes) {
        if (n.x == null || n.y == null) continue;
        if (n.x < x0 || n.x > x1 || n.y < y0 || n.y > y1) next.add(n.id);
      }
      // Diff-apply display:none.
      for (const id of next) {
        if (!culled.has(id)) {
          const el = nodeRefs.current.get(id);
          if (el) el.style.display = "none";
        }
      }
      for (const id of culled) {
        if (!next.has(id)) {
          const el = nodeRefs.current.get(id);
          if (el) el.style.display = "";
        }
      }
      culledRef.current = next;
    };

    const buildEdgePath = (arr: SimLink[]) => {
      // Simple line segments concatenated into one path.
      let d = "";
      for (let i = 0; i < arr.length; i++) {
        const l = arr[i];
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        if (s.x == null || t.x == null) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const tr = l.type === "contains" ? 0 : nodeR(t) + 2;
        const tx = t.x - (dx / dist) * tr;
        const ty = t.y - (dy / dist) * tr;
        d += `M${s.x.toFixed(1)},${s.y.toFixed(1)}L${tx.toFixed(1)},${ty.toFixed(1)}`;
      }
      return d;
    };

    const updateEdgePaths = () => {
      const skipContains = nodes.length > 1000;
      for (const [type, arr] of linksByType) {
        if (type === "contains" && skipContains) continue;
        const el = edgePathRefs.current.get(type);
        if (!el) continue;
        el.setAttribute("d", buildEdgePath(arr));
      }
      // Highlight overlay
      const overlay = edgeOverlayRef.current;
      if (overlay) {
        const hl = highlightRef.current;
        if (!hl) {
          overlay.setAttribute("d", "");
        } else {
          let d = "";
          for (const l of links) {
            const s = l.source as SimNode;
            const t = l.target as SimNode;
            if (s.x == null || t.x == null) continue;
            if (!hl.has(s.id) || !hl.has(t.id)) continue;
            if (l.type === "contains") continue;
            const dx = t.x - s.x;
            const dy = t.y - s.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const tr = nodeR(t) + 2;
            const tx = t.x - (dx / dist) * tr;
            const ty = t.y - (dy / dist) * tr;
            d += `M${s.x.toFixed(1)},${s.y.toFixed(1)}L${tx.toFixed(1)},${ty.toFixed(1)}`;
          }
          overlay.setAttribute("d", d);
        }
      }
    };

    const onTick = () => {
      tickCounter++;
      for (const n of nodes) {
        if (n.x == null) continue;
        nodeRefs.current
          .get(n.id)
          ?.setAttribute("transform", `translate(${n.x},${n.y})`);
      }
      updateEdgePaths();

      const now = Date.now();
      if (now - lastZone > 120) {
        lastZone = now;
        updateZoneRects();
      }
      // Re-evaluate culling every 4 ticks (cheap diff).
      if (tickCounter % 4 === 0 && now - lastCull > 80) {
        lastCull = now;
        updateCulling();
      }

      // Trigger a single React rerender after the simulation cools — this is
      // when label collision dedupe is recomputed.
      if (settledTimer) clearTimeout(settledTimer);
      if (sim.alpha() < 0.05) {
        settledTimer = setTimeout(() => {
          updateZoneRects();
          updateCulling();
          setLayoutVersion((v) => v + 1);
        }, 200);
      }

      // Idle-stop: when alpha is very low for 500ms, stop the simulation entirely.
      if (idleTimer) clearTimeout(idleTimer);
      if (sim.alpha() < 0.02) {
        idleTimer = setTimeout(() => sim.stop(), 500);
      }
    };

    sim.on("tick", onTick);

    // Expose a restart hook on the sim for external triggers (zoom/hover).
    (sim as unknown as { __restart?: () => void }).__restart = () => {
      if (sim.alpha() < 0.05) sim.alpha(0.1).restart();
    };

    simRef.current = sim;
    return () => {
      sim.stop();
      if (settledTimer) clearTimeout(settledTimer);
      if (idleTimer) clearTimeout(idleTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, size.w, size.h, zoneAnchors, zoneByNodeId, physics, showZones, zoneList]);

  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);
    const g = select(gRef.current);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 8])
      .on("zoom", (e) => {
        g.attr("transform", e.transform.toString());
        setZoomLevel(e.transform.k);
      });
    zoomRef.current = z;
    svg.call(z as never);
    return () => { svg.on(".zoom", null); };
  }, []);

  const doZoom = (factor: number) => {
    if (svgRef.current && zoomRef.current)
      select(svgRef.current)
        .transition()
        .duration(200)
        .call(zoomRef.current.scaleBy as never, factor);
  };

  const resetZoom = () => {
    if (svgRef.current && zoomRef.current)
      select(svgRef.current)
        .transition()
        .duration(500)
        .call(zoomRef.current.transform as never, zoomIdentity);
  };

  const activeId = hoveredId ?? selectedId;
  const highlight = useMemo(() => {
    if (!activeId) return null;
    const set = new Set<string>([activeId]);
    neighborMap.get(activeId)?.forEach((id) => set.add(id));
    return set;
  }, [activeId, neighborMap]);

  const searchMatches = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    const set = new Set<string>();
    for (const n of nodes)
      if (n.name.toLowerCase().includes(q) || n.file.toLowerCase().includes(q))
        set.add(n.id);
    return set;
  }, [search, nodes]);

  const finalHighlight = searchMatches ?? highlight;

  // Top-N most-connected nodes per zone get persistent labels
  const importantIds = useMemo(() => {
    const set = new Set<string>();
    const limits: Record<NodeType, number> = { file: 3, class: 2, function: 1 };
    for (const z of zoneList) {
      const byType: Record<NodeType, SimNode[]> = { file: [], class: [], function: [] };
      for (const m of z.members) byType[m.type].push(m);
      (Object.keys(byType) as NodeType[]).forEach((t) => {
        byType[t]
          .sort((a, b) => (b.degree ?? 0) - (a.degree ?? 0))
          .slice(0, limits[t])
          .forEach((n) => set.add(n.id));
      });
    }
    return set;
  }, [zoneList]);

  // Stable zone descriptor list. Positions/sizes are mutated via refs in the
  // sim tick loop — never recomputed on every React render.
  const zoneDescriptors = useMemo(() => {
    if (!showZones) return [];
    return zoneList.map((z) => ({ key: z.key, hue: z.hue, members: z.members }));
  }, [zoneList, showZones]);

  const showFileLabels = zoomLevel > 0.7;
  const showClassLabels = zoomLevel > 1.2;
  const showFnLabels = zoomLevel > 1.8;

  // Per-tick label collision dedupe — produces set of node ids whose labels render.
  // Re-runs on data / selection / zoom / settled-layout — NOT every tick.
  const visibleLabelIds = useMemo(() => {
    const result = new Set<string>();
    type Box = { x: number; y: number; w: number; h: number };
    const placed: Box[] = [];
    const overlaps = (a: Box, b: Box) =>
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

    // At very high node counts, only show labels for active/hover/search +
    // top-N important nodes.
    const veryHeavy = nodes.length > VERY_HEAVY_NODE_COUNT;

    // Priority order: active > neighbours > important > zoom-threshold
    const ordered = [...nodes].sort((a, b) => {
      const score = (n: SimNode) => {
        if (activeId === n.id) return 1000;
        if (finalHighlight?.has(n.id)) return 500;
        if (importantIds.has(n.id)) return 100 + (n.degree ?? 0);
        return n.degree ?? 0;
      };
      return score(b) - score(a);
    });

    for (const n of ordered) {
      if (n.x == null || n.y == null) continue;
      const isActive = activeId === n.id;
      const inHighlight = finalHighlight?.has(n.id);
      const isDim = finalHighlight ? !inHighlight : false;
      if (isDim) continue;

      const zoomShow =
        n.type === "file" ? showFileLabels
          : n.type === "class" ? showClassLabels
            : showFnLabels;
      const baseEligible = isActive || inHighlight || importantIds.has(n.id) || zoomShow;
      const eligible = veryHeavy
        ? (isActive || inHighlight || importantIds.has(n.id))
        : baseEligible;
      if (!eligible) continue;

      const text = n.type === "file" ? n.file.split("/").pop() ?? n.name : n.name;
      const fontSize = isActive ? 10.5 : n.type === "file" ? 9 : 8;
      const r = analysisRadius(n, analysisMode, metrics);
      const w = text.length * fontSize * 0.58 + 8;
      const h = fontSize + 4;
      const box: Box = { x: n.x + r + 5, y: n.y - h / 2, w, h };

      if (!isActive && placed.some((p) => overlaps(p, box))) continue;
      placed.push(box);
      result.add(n.id);
    }
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, layoutVersion, activeId, finalHighlight, importantIds, showFileLabels, showClassLabels, showFnLabels, analysisMode, metrics]);

  return (
    <div className="relative h-full w-full texture-paper">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="h-full w-full select-none"
        onClick={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
      >
        <defs>
          {/* Soft paper shadow for nodes */}
          <filter id="node-shadow" x="-60%" y="-60%" width="220%" height="220%">
            <feDropShadow dx="0" dy="1" stdDeviation="2.5"
              floodColor="hsl(25,18%,14%)" floodOpacity="0.14" />
          </filter>
          <filter id="node-shadow-active" x="-80%" y="-80%" width="260%" height="260%">
            <feDropShadow dx="0" dy="2" stdDeviation="5"
              floodColor="hsl(25,18%,14%)" floodOpacity="0.2" />
          </filter>
          <filter id="edge-highlight" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          {/* Arrowhead markers */}
          {(["imports", "calls", "include"] as const).map((t) => (
            <marker
              key={t}
              id={`arrow-${t}`}
              markerWidth="5" markerHeight="5"
              refX="4" refY="2.5"
              orient="auto"
            >
              <path d="M0,0 L0,5 L5,2.5 z"
                fill={EDGE_COLOR[t]}
                opacity={EDGE_BASE_OPACITY[t] * 1.3}
              />
            </marker>
          ))}
        </defs>

        <g ref={gRef}>
          {/* Zone backgrounds */}
          <g pointerEvents="none">
            {zoneDescriptors.map((z) => {
              const dim = finalHighlight && !z.members.some((m) => finalHighlight.has(m.id));
              const labelW = z.key.length * 5.6 + 14;
              return (
                <g key={z.key} style={{ transition: "opacity 200ms" }} opacity={dim ? 0.2 : 1}>
                  <rect
                    ref={(el) => {
                      if (el) zoneRectRefs.current.set(z.key, el);
                      else zoneRectRefs.current.delete(z.key);
                    }}
                    x={0} y={0} width={0} height={0}
                    rx={18} ry={18}
                    fill={`hsl(${z.hue},38%,92%,0.55)`}
                    stroke={`hsl(${z.hue},30%,65%)`}
                    strokeWidth={1}
                    strokeDasharray="4 5"
                    strokeOpacity={0.4}
                  />
                  {/* Zone label pill — translated as a group via ref */}
                  <g
                    ref={(el) => {
                      if (el) zoneLabelRefs.current.set(z.key, el);
                      else zoneLabelRefs.current.delete(z.key);
                    }}
                  >
                    <rect
                      x={8} y={6}
                      width={labelW} height={14}
                      rx={7} ry={7}
                      fill={PAPER_BG}
                      fillOpacity={0.92}
                      stroke={`hsl(${z.hue},30%,65%)`}
                      strokeOpacity={0.35}
                      strokeWidth={0.6}
                    />
                    <text
                      x={15} y={16}
                      fontSize={9} fontFamily="var(--font-mono)"
                      fill={`hsl(${z.hue},35%,32%)`}
                      opacity={0.85}
                      style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
                    >
                      {z.key}
                    </text>
                  </g>
                </g>
              );
            })}
          </g>

          {/* Edges */}
          <g>
            {links.map((l, i) => {
              const s = l.source as SimNode;
              const t = l.target as SimNode;
              const isContains = l.type === "contains";
              // Skip "contains" edges entirely on very large graphs — they add the
              // most DOM with the least signal.
              if (isContains && nodes.length > 1000) return null;
              const lit = finalHighlight
                ? finalHighlight.has(s.id) && finalHighlight.has(t.id)
                : true;
              const base = EDGE_BASE_OPACITY[l.type];
              const focusHide = focusMode && finalHighlight && !lit;
              const opacity = focusHide
                ? 0.03
                : isContains
                ? (finalHighlight ? (lit ? 0.15 : 0.02) : 0.1)
                : lit
                  ? (finalHighlight ? Math.min(0.9, base * 1.6) : base)
                  : (finalHighlight ? 0.04 : base * 0.5);
              const useEdgeFilter = lit && !isContains && links.length <= HEAVY_EDGE_COUNT;
              return (
                <line
                  key={i}
                  ref={(el) => {
                    if (el) linkRefs.current.set(String(i), el);
                    else linkRefs.current.delete(String(i));
                  }}
                  x1={0} y1={0} x2={0} y2={0}
                  stroke={EDGE_COLOR[l.type]}
                  strokeWidth={isContains ? 0.4 : l.type === "imports" ? 1.2 : 0.8}
                  strokeDasharray={l.type === "calls" ? "4 3" : undefined}
                  opacity={opacity}
                  markerEnd={!isContains ? `url(#arrow-${l.type})` : undefined}
                  filter={useEdgeFilter ? "url(#edge-highlight)" : undefined}
                  style={{ transition: "opacity 150ms" }}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {(() => {
              const heavy = nodes.length > HEAVY_NODE_COUNT;
              const veryHeavy = nodes.length > VERY_HEAVY_NODE_COUNT;
              return nodes.map((n) => {
                const r = analysisRadius(n, analysisMode, metrics);
                const isSelected = selectedId === n.id;
                const isHovered = hoveredId === n.id;
                const isActive = isSelected || isHovered;
                const isDim = finalHighlight ? !finalHighlight.has(n.id) : false;
                const isMatch = searchMatches ? searchMatches.has(n.id) : false;
                const color = analysisColor(n, analysisMode, metrics);
                const labelVisible = visibleLabelIds.has(n.id);
                const focusHide = focusMode && finalHighlight && isDim;
                const nodeOpacity = focusHide ? 0.05 : isDim ? 0.15 : 1;
                const labelText = n.type === "file" ? (n.file.split("/").pop() ?? n.name) : n.name;
                const fontSize = isActive ? 10.5 : n.type === "file" ? 9 : 8;
                const labelW = labelText.length * fontSize * 0.58 + 8;
                // PageRank top-10%: outer glow ring
                const prPct = analysisMode === "pagerank" && metrics
                  ? (metrics.pagerankPercentile.get(n.id) ?? 0) : 0;
                const isTopPR = prPct >= 0.9;
                // Betweenness warning threshold
                const btScore = analysisMode === "betweenness" && metrics
                  ? (metrics.betweenness.get(n.id) ?? 0) : 0;
                const isBtWarn = btScore > 0.5;
                // Structural anomalies — always visible regardless of mode
                const isCyclic = metrics?.cycles.cyclicNodeIds.has(n.id) ?? false;
                const isOrphan = metrics?.orphans.orphanIds.has(n.id) ?? false;

                // Heavy graphs: drop per-node animated rings (keep them only on
                // active node) — they're the single biggest paint cost.
                const showAnimatedRings = !veryHeavy || isActive;
                // Heavy graphs: only the active/hovered node gets the SVG drop
                // shadow filter — flat stroke for everyone else.
                const nodeFilter = isActive
                  ? "url(#node-shadow-active)"
                  : heavy
                    ? undefined
                    : "url(#node-shadow)";

                return (
                  <g
                    key={n.id}
                    ref={(el) => {
                      if (el) nodeRefs.current.set(n.id, el as SVGGElement);
                      else nodeRefs.current.delete(n.id);
                    }}
                    style={{
                      cursor: "pointer",
                      opacity: nodeOpacity,
                      transition: "opacity 150ms",
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect(n.id === selectedId ? null : n.id);
                    }}
                    onMouseEnter={() => setHoveredId(n.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    onMouseDown={(e) => {
                      const sim = simRef.current;
                      if (!sim || !svgRef.current) return;
                      const pt = svgRef.current.createSVGPoint();
                      const ctm = (gRef.current as SVGGElement).getScreenCTM()!;
                      sim.alphaTarget(0.3).restart();
                      n.fx = n.x; n.fy = n.y;
                      const move = (ev: MouseEvent) => {
                        pt.x = ev.clientX; pt.y = ev.clientY;
                        const p = pt.matrixTransform(ctm.inverse());
                        n.fx = p.x; n.fy = p.y;
                      };
                      const up = () => {
                        sim.alphaTarget(0);
                        n.fx = null; n.fy = null;
                        window.removeEventListener("mousemove", move);
                        window.removeEventListener("mouseup", up);
                      };
                      window.addEventListener("mousemove", move);
                      window.addEventListener("mouseup", up);
                      e.preventDefault();
                    }}
                  >
                    {/* Selection / hover ring */}
                    {isActive && (
                      <circle
                        r={r + 10}
                        fill="none"
                        stroke={color}
                        strokeWidth={1.2}
                        opacity={0.35}
                        style={{ animation: isSelected ? "radar-pulse 2.4s ease-out infinite" : undefined }}
                      />
                    )}
                    {/* Search match ring */}
                    {isMatch && !isActive && (
                      <circle
                        r={r + 7}
                        fill="none"
                        stroke="hsl(32,82%,44%)"
                        strokeWidth={1.2}
                        opacity={0.6}
                        style={{ animation: "radar-pulse 2s ease-out infinite" }}
                      />
                    )}
                    {/* PageRank top-10% outer pulse ring */}
                    {isTopPR && !isActive && showAnimatedRings && (
                      <circle
                        r={r + 14}
                        fill="none"
                        stroke="hsl(25,85%,42%)"
                        strokeWidth={1}
                        opacity={0.3}
                        style={{ animation: "radar-pulse 2.8s ease-out infinite" }}
                      />
                    )}
                    {/* Cycle ring — red dashed, always visible */}
                    {isCyclic && !isActive && showAnimatedRings && (
                      <circle
                        r={r + 6}
                        fill="none"
                        stroke="hsl(6,72%,50%)"
                        strokeWidth={1.2}
                        strokeDasharray="3 2"
                        opacity={0.65}
                      />
                    )}
                    {/* Orphan ring — grey dotted, always visible */}
                    {isOrphan && !isCyclic && !isActive && showAnimatedRings && (
                      <circle
                        r={r + 4}
                        fill="none"
                        stroke="hsl(25,10%,62%)"
                        strokeWidth={1}
                        strokeDasharray="2 2"
                        opacity={0.5}
                      />
                    )}
                    {/* Node */}
                    <circle
                      r={r}
                      fill={color}
                      stroke={PAPER_BG}
                      strokeWidth={1.5}
                      filter={nodeFilter}
                      opacity={isActive ? 1 : 0.88}
                    />
                    {/* Betweenness warning icon */}
                    {isBtWarn && (
                      <text
                        x={r + 2} y={-r - 2}
                        fontSize={8} textAnchor="middle"
                        fill="hsl(6,70%,48%)" opacity={0.85}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >⚠</text>
                    )}
                    {/* Label with background pill */}
                    {labelVisible && (
                      <g style={{ pointerEvents: "none", transition: "opacity 200ms" }}>
                        <rect
                          x={r + 3}
                          y={-fontSize / 2 - 2}
                          width={labelW}
                          height={fontSize + 4}
                          rx={3}
                          ry={3}
                          fill={PAPER_BG}
                          fillOpacity={isActive ? 0.95 : 0.85}
                        />
                        <text
                          x={r + 5}
                          y={4}
                          fontSize={fontSize}
                          fontFamily="var(--font-mono)"
                          fontWeight={isActive ? 600 : 400}
                          fill={isActive ? GLASS_TEXT : "hsl(25,12%,28%)"}
                          opacity={isActive ? 1 : 0.78}
                          style={{ userSelect: "none" }}
                        >
                          {labelText}
                        </text>
                      </g>
                    )}
                  </g>
                );
              });
            })()}
          </g>
        </g>
      </svg>

      {/* Zoom + view controls */}
      <div
        className="absolute right-4 bottom-28 flex flex-col gap-0.5 rounded-xl border p-1.5 shadow-paper"
        style={GLASS}
      >
        <Btn onClick={() => doZoom(1.4)} label="Zoom in">+</Btn>
        <Btn onClick={() => doZoom(0.7)} label="Zoom out">−</Btn>
        <Btn onClick={resetZoom} label="Reset zoom" className="text-[9px]">⤧</Btn>
        <div className="my-0.5 h-px w-full" style={{ background: GLASS_BORDER }} />
        <Btn onClick={() => setShowZones((v) => !v)} label="Zones" active={showZones} className="text-[9px]">▦</Btn>
        <Btn onClick={() => setFocusMode((v) => !v)} label="Focus mode (isolate selection)" active={focusMode} className="text-[11px]">◉</Btn>
        <Btn onClick={() => setShowSettings((v) => !v)} label="Settings" active={showSettings} className="text-[11px]">⚙</Btn>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-2xl border p-5 shadow-lift"
          style={{ ...GLASS, width: 520, zIndex: 30 }}
        >
          <div className="flex gap-6">
            <div className="flex-1 min-w-0">
              <SectionLabel>Node types</SectionLabel>
              <div className="flex flex-wrap gap-1.5 mb-4">
                {(["file", "class", "function"] as NodeType[]).map((t) => (
                  <FilterChip
                    key={t} label={t} color={NODE_COLOR[t]}
                    active={nodeTypeFilters.has(t)}
                    onClick={() => setNodeTypeFilters((prev) => toggle(prev, t))}
                  />
                ))}
              </div>
              <SectionLabel>Edge types</SectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {(["imports", "calls", "include", "contains"] as EdgeType[]).map((t) => (
                  <FilterChip
                    key={t} label={t} color={EDGE_COLOR[t]}
                    active={edgeTypeFilters.has(t)}
                    onClick={() => setEdgeTypeFilters((prev) => toggle(prev, t))}
                  />
                ))}
              </div>
            </div>
            <div className="w-px" style={{ background: GLASS_BORDER }} />
            <div className="flex-1 min-w-0">
              <SectionLabel>Forces</SectionLabel>
              <Slider
                label="Repel" value={-physics.repel} min={20} max={500}
                onChange={(v) => setPhysics((p) => ({ ...p, repel: -v }))}
              />
              <Slider
                label="Link distance" value={physics.linkDistance} min={20} max={300}
                onChange={(v) => setPhysics((p) => ({ ...p, linkDistance: v }))}
              />
              <Slider
                label="Center force" value={Math.round(physics.centerStrength * 100)} min={0} max={50}
                onChange={(v) => setPhysics((p) => ({ ...p, centerStrength: v / 100 }))}
              />
            </div>
          </div>
        </div>
      )}

      {/* Legend */}
      <div
        className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full border px-3 py-1.5 font-mono text-[10px] shadow-paper"
        style={{ ...GLASS, color: GLASS_MUTED }}
      >
        {analysisMode === "none" ? (
          <>
            <LegendDot color={NODE_COLOR.file} label="file" />
            <LegendDot color={NODE_COLOR.class} label="class" />
            <LegendDot color={NODE_COLOR.function} label="fn" />
            <span className="h-3 w-px mx-1" style={{ background: GLASS_BORDER }} />
            <LegendLine color={EDGE_COLOR.imports} solid label="imports" />
            <LegendLine color={EDGE_COLOR.calls} solid={false} label="calls" />
          </>
        ) : (
          <MetricLegend mode={analysisMode} />
        )}
      </div>
    </div>
  );
};

const Btn = ({
  onClick, label, children, active, className,
}: {
  onClick: () => void; label: string; children: React.ReactNode;
  active?: boolean; className?: string;
}) => (
  <button
    className={`h-7 w-7 rounded flex items-center justify-center font-mono transition-colors ${className ?? ""}`}
    style={{
      color: active ? "hsl(184,68%,34%)" : GLASS_MUTED,
      background: active ? "hsl(184,68%,34%,0.1)" : "transparent",
    }}
    onClick={onClick}
    aria-label={label}
  >
    {children}
  </button>
);

const FilterChip = ({ label, color, active, onClick }: {
  label: string; color: string; active: boolean; onClick: () => void;
}) => (
  <button
    onClick={onClick}
    className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10px] transition-all"
    style={{
      borderColor: active ? color : GLASS_BORDER,
      background: active ? `${color}18` : "transparent",
      color: active ? color : GLASS_MUTED,
    }}
  >
    <span className="h-1.5 w-1.5 rounded-full"
      style={{ background: active ? color : "hsl(25,10%,72%)" }} />
    {label}
  </button>
);

const Slider = ({ label, value, min, max, onChange }: {
  label: string; value: number; min: number; max: number; onChange: (v: number) => void;
}) => (
  <div className="mb-3">
    <div className="flex justify-between mb-1 font-mono text-[10px]"
      style={{ color: GLASS_MUTED }}>
      <span>{label}</span>
      <span style={{ color: "hsl(25,10%,58%)" }}>{value}</span>
    </div>
    <input
      type="range" min={min} max={max} value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full h-1 rounded-full appearance-none cursor-pointer"
      style={{ accentColor: "hsl(184,68%,34%)" }}
    />
  </div>
);

const SectionLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-2 font-mono text-[9px] uppercase tracking-widest"
    style={{ color: "hsl(25,10%,55%)" }}>
    {children}
  </p>
);

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    {label}
  </span>
);

const LegendLine = ({ color, solid, label }: { color: string; solid: boolean; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="inline-block h-px w-4"
      style={solid ? { background: color } : { borderTop: `1px dashed ${color}` }} />
    {label}
  </span>
);

const METRIC_GRADIENT: Record<string, { stops: string[]; low: string; high: string }> = {
  pagerank: {
    stops: ["hsl(38,25%,72%)", "hsl(184,55%,44%)", "hsl(184,70%,30%)", "hsl(25,85%,42%)"],
    low: "low influence",
    high: "high influence",
  },
  betweenness: {
    stops: ["hsl(142,38%,38%)", "hsl(32,88%,50%)", "hsl(6,70%,48%)"],
    low: "no bottleneck",
    high: "critical bridge",
  },
  clustering: {
    stops: ["hsl(220,38%,44%)", "hsl(32,82%,44%)"],
    low: "isolated",
    high: "tightly coupled",
  },
};

const MetricLegend = ({ mode }: { mode: string }) => {
  const cfg = METRIC_GRADIENT[mode];
  if (!cfg) return null;
  const gradient = `linear-gradient(to right, ${cfg.stops.join(", ")})`;
  return (
    <span className="flex items-center gap-2">
      <span className="font-mono text-[9px]" style={{ color: GLASS_MUTED }}>{cfg.low}</span>
      <span
        className="inline-block h-2 w-20 rounded-full"
        style={{ background: gradient }}
      />
      <span className="font-mono text-[9px]" style={{ color: GLASS_MUTED }}>{cfg.high}</span>
    </span>
  );
};
