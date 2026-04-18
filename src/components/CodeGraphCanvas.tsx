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

export const CodeGraphCanvas = ({
  data,
  selectedId,
  onSelect,
  search = "",
}: {
  data: GraphPayload;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  search?: string;
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const nodeRefs = useRef<Map<string, SVGGElement>>(new Map());
  const linkRefs = useRef<Map<string, SVGLineElement>>(new Map());

  const [size, setSize] = useState({ w: 800, h: 640 });
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [tickCount, setTickCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showZones, setShowZones] = useState(true);
  const [nodeTypeFilters, setNodeTypeFilters] = useState<Set<NodeType>>(
    new Set(["file", "class", "function"]),
  );
  const [edgeTypeFilters, setEdgeTypeFilters] = useState<Set<EdgeType>>(
    new Set(["imports", "calls", "include", "contains"]),
  );
  const [physics, setPhysics] = useState<PhysicsConfig>(DEFAULT_PHYSICS);

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
      .force("collide", forceCollide<SimNode>().radius((d) => nodeR(d) + 8))
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

    let lastZone = 0;

    sim.on("tick", () => {
      for (const n of nodes) {
        if (n.x == null) continue;
        nodeRefs.current
          .get(n.id)
          ?.setAttribute("transform", `translate(${n.x},${n.y})`);
      }
      for (let i = 0; i < links.length; i++) {
        const el = linkRefs.current.get(String(i));
        if (!el) continue;
        const l = links[i];
        const s = l.source as SimNode;
        const t = l.target as SimNode;
        if (s.x == null || t.x == null) continue;
        const dx = t.x - s.x;
        const dy = t.y - s.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const tr = l.type === "contains" ? 0 : nodeR(t) + 2;
        el.setAttribute("x1", String(s.x));
        el.setAttribute("y1", String(s.y));
        el.setAttribute("x2", String(t.x - (dx / dist) * tr));
        el.setAttribute("y2", String(t.y - (dy / dist) * tr));
      }
      const now = Date.now();
      if (now - lastZone > 80) {
        lastZone = now;
        setTickCount((n) => n + 1);
      }
    });

    simRef.current = sim;
    return () => { sim.stop(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, size.w, size.h, zoneAnchors, zoneByNodeId, physics]);

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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const zoneRects = useMemo(() => {
    if (!showZones) return [];
    return zoneList.flatMap((z) => {
      const pts = z.members.filter((m) => m.x != null && m.y != null);
      if (!pts.length) return [];
      const PAD = 32;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        const r = nodeR(p) + 2;
        if (p.x! - r < minX) minX = p.x! - r;
        if (p.y! - r < minY) minY = p.y! - r;
        if (p.x! + r > maxX) maxX = p.x! + r;
        if (p.y! + r > maxY) maxY = p.y! + r;
      }
      return [{ key: z.key, hue: z.hue, members: z.members,
        x: minX - PAD, y: minY - PAD,
        w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 }];
    });
  }, [zoneList, showZones, tickCount]); // tickCount triggers positional recompute

  const showFileLabels = zoomLevel > 0.5;
  const showClassLabels = zoomLevel > 0.9;
  const showFnLabels = zoomLevel > 1.4;

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
            {zoneRects.map((z) => {
              const dim = finalHighlight && !z.members.some((m) => finalHighlight.has(m.id));
              return (
                <g key={z.key} style={{ transition: "opacity 200ms" }} opacity={dim ? 0.2 : 1}>
                  <rect
                    x={z.x} y={z.y} width={z.w} height={z.h}
                    rx={18} ry={18}
                    fill={`hsl(${z.hue},38%,92%,0.55)`}
                    stroke={`hsl(${z.hue},30%,65%)`}
                    strokeWidth={1}
                    strokeDasharray="4 5"
                    strokeOpacity={0.4}
                  />
                  <text
                    x={z.x + 12} y={z.y + 18}
                    fontSize={9} fontFamily="var(--font-mono)"
                    fill={`hsl(${z.hue},30%,36%)`}
                    opacity={0.75}
                    style={{ textTransform: "uppercase", letterSpacing: "0.1em" }}
                  >
                    {z.key}
                  </text>
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
              const lit = finalHighlight
                ? finalHighlight.has(s.id) && finalHighlight.has(t.id)
                : true;
              const base = EDGE_BASE_OPACITY[l.type];
              const opacity = isContains
                ? (finalHighlight ? (lit ? 0.15 : 0.02) : 0.1)
                : lit
                  ? (finalHighlight ? Math.min(0.9, base * 1.6) : base)
                  : (finalHighlight ? 0.04 : base * 0.5);
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
                  filter={lit && !isContains ? "url(#edge-highlight)" : undefined}
                  style={{ transition: "opacity 150ms" }}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((n) => {
              const r = nodeR(n);
              const isSelected = selectedId === n.id;
              const isHovered = hoveredId === n.id;
              const isActive = isSelected || isHovered;
              const isDim = finalHighlight ? !finalHighlight.has(n.id) : false;
              const isMatch = searchMatches ? searchMatches.has(n.id) : false;
              const color = NODE_COLOR[n.type];
              const showLabel =
                n.type === "file" ? showFileLabels
                  : n.type === "class" ? showClassLabels
                    : showFnLabels;

              return (
                <g
                  key={n.id}
                  ref={(el) => {
                    if (el) nodeRefs.current.set(n.id, el as SVGGElement);
                    else nodeRefs.current.delete(n.id);
                  }}
                  style={{
                    cursor: "pointer",
                    opacity: isDim ? 0.15 : 1,
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
                  {/* Node */}
                  <circle
                    r={r}
                    fill={color}
                    stroke="hsl(38,36%,96%)"
                    strokeWidth={1.5}
                    filter={isActive ? "url(#node-shadow-active)" : "url(#node-shadow)"}
                    opacity={isActive ? 1 : 0.88}
                  />
                  {/* Label */}
                  {(showLabel || isActive) && (
                    <text
                      x={r + 5}
                      y={4}
                      fontSize={isActive ? 10.5 : n.type === "file" ? 9 : 8}
                      fontFamily="var(--font-mono)"
                      fontWeight={isActive ? 600 : 400}
                      fill={isActive ? GLASS_TEXT : "hsl(25,12%,28%)"}
                      opacity={isActive ? 1 : 0.72}
                      style={{ pointerEvents: "none", userSelect: "none", transition: "opacity 200ms" }}
                    >
                      {n.type === "file" ? n.file.split("/").pop() : n.name}
                    </text>
                  )}
                </g>
              );
            })}
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
        <LegendDot color={NODE_COLOR.file} label="file" />
        <LegendDot color={NODE_COLOR.class} label="class" />
        <LegendDot color={NODE_COLOR.function} label="fn" />
        <span className="h-3 w-px mx-1" style={{ background: GLASS_BORDER }} />
        <LegendLine color={EDGE_COLOR.imports} solid label="imports" />
        <LegendLine color={EDGE_COLOR.calls} solid={false} label="calls" />
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
