import { useEffect, useMemo, useRef, useState } from "react";
import {
  forceCenter,
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
  x?: number;
  y?: number;
  fx?: number | null;
  fy?: number | null;
  vx?: number;
  vy?: number;
  degree?: number;
};

type SimLink = {
  source: SimNode | string;
  target: SimNode | string;
  type: GraphEdge["type"] | "contains";
};

// Derive a stable zone key from a file path: first 2 segments.
const zoneKeyForFile = (file: string): string => {
  if (!file) return "root";
  const parts = file.split("/").filter(Boolean);
  if (parts.length <= 1) return "root";
  return parts.slice(0, Math.min(2, parts.length - 1)).join("/");
};

// Stable hash → hue
const hashHue = (s: string): number => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
};

const NODE_RADIUS = {
  file: 7,
  class: 5,
  function: 3.6,
} as const;

const NODE_FILL = {
  file: "hsl(var(--accent))",
  class: "hsl(var(--foreground))",
  function: "hsl(var(--muted-foreground))",
} as const;

const EDGE_STROKE = {
  imports: "hsl(var(--accent) / 0.55)",
  calls: "hsl(var(--foreground) / 0.22)",
  include: "hsl(var(--accent) / 0.4)",
  contains: "hsl(var(--foreground) / 0.18)",
} as const;

export const CodeGraphCanvas = ({
  data,
  selectedId,
  onSelect,
}: {
  data: GraphPayload;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const gRef = useRef<SVGGElement | null>(null);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null);
  const [size, setSize] = useState({ w: 800, h: 640 });
  const [, force] = useState(0);
  const [showZones, setShowZones] = useState(true);

  // Compute degree per node (drives node size emphasis)
  const { nodes, links, neighborMap } = useMemo(() => {
    const nodes: SimNode[] = data.nodes.map((n) => ({ ...n, degree: 0 }));
    const idx = new Map(nodes.map((n) => [n.id, n]));
    const links: SimLink[] = [];
    const neighborMap = new Map<string, Set<string>>();

    // Implicit "contains" edges: file → its classes/functions (by file path)
    const fileById = new Map<string, SimNode>();
    for (const n of nodes) {
      if (n.type === "file") fileById.set(n.file, n);
    }
    for (const n of nodes) {
      if (n.type === "file") continue;
      const parent = fileById.get(n.file);
      if (parent && parent.id !== n.id) {
        links.push({ source: parent, target: n, type: "contains" });
      }
    }

    for (const e of data.edges) {
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

    // Compute zones (folder groupings) from file paths
    const zoneMembers = new Map<string, SimNode[]>();
    for (const n of nodes) {
      const key = zoneKeyForFile(n.file);
      if (!zoneMembers.has(key)) zoneMembers.set(key, []);
      zoneMembers.get(key)!.push(n);
    }
    const zoneList = Array.from(zoneMembers.entries())
      .map(([key, members]) => ({ key, members, hue: hashHue(key) }))
      .sort((a, b) => b.members.length - a.members.length);
    const zoneByNodeId = new Map<string, string>();
    for (const z of zoneList) {
      for (const m of z.members) zoneByNodeId.set(m.id, z.key);
    }

    return { nodes, links, neighborMap, zoneList, zoneByNodeId };
  }, [data]);

  // Resize observer
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

  // Compute zone centroid anchors (grid layout) based on size + zone count
  const zoneAnchors = useMemo(() => {
    const anchors = new Map<string, { cx: number; cy: number }>();
    const n = zoneList.length;
    if (n === 0) return anchors;
    const cols = Math.ceil(Math.sqrt(n * (size.w / size.h)));
    const rows = Math.ceil(n / cols);
    const cellW = size.w / cols;
    const cellH = size.h / rows;
    zoneList.forEach((z, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      anchors.set(z.key, {
        cx: cellW * (col + 0.5),
        cy: cellH * (row + 0.5),
      });
    });
    return anchors;
  }, [zoneList, size.w, size.h]);

  // Build & run simulation
  useEffect(() => {
    const sim = forceSimulation<SimNode, SimLink>(nodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(links)
          .id((d) => d.id)
          .distance((l) => {
            if (l.type === "contains") return 18;
            if (l.type === "imports") return 110;
            return 50; // calls
          })
          .strength((l) => {
            if (l.type === "contains") return 1.2;
            if (l.type === "imports") return 0.45;
            return 0.2; // calls
          }),
      )
      .force("charge", forceManyBody().strength(-140))
      .force(
        "collide",
        forceCollide<SimNode>().radius(
          (d) => (NODE_RADIUS[d.type] ?? 4) + 4,
        ),
      )
      .force(
        "x",
        forceX<SimNode>((d) => {
          const k = zoneByNodeId.get(d.id);
          return (k && zoneAnchors.get(k)?.cx) ?? size.w / 2;
        }).strength(0.18),
      )
      .force(
        "y",
        forceY<SimNode>((d) => {
          const k = zoneByNodeId.get(d.id);
          return (k && zoneAnchors.get(k)?.cy) ?? size.h / 2;
        }).strength(0.18),
      )
      .alpha(1)
      .alphaDecay(0.035);

    sim.on("tick", () => force((n) => n + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, size.w, size.h, zoneAnchors, zoneByNodeId]);

  // Zoom & pan
  useEffect(() => {
    if (!svgRef.current || !gRef.current) return;
    const svg = select(svgRef.current);
    const g = select(gRef.current);
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 5])
      .on("zoom", (e) => g.attr("transform", e.transform.toString()));
    zoomRef.current = z;
    svg.call(z as never);
    return () => {
      svg.on(".zoom", null);
    };
  }, []);

  const resetZoom = () => {
    if (svgRef.current && zoomRef.current) {
      select(svgRef.current)
        .transition()
        .duration(500)
        .call(zoomRef.current.transform as never, zoomIdentity);
    }
  };

  // Highlight set: selected node + neighbors
  const highlight = useMemo(() => {
    if (!selectedId) return null;
    const set = new Set<string>([selectedId]);
    neighborMap.get(selectedId)?.forEach((id) => set.add(id));
    return set;
  }, [selectedId, neighborMap]);

  return (
    <div className="relative h-full w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${size.w} ${size.h}`}
        className="h-full w-full select-none"
        onClick={(e) => {
          if (e.target === e.currentTarget) onSelect(null);
        }}
      >
        <defs>
          <radialGradient id="cg-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.25" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </radialGradient>
          <filter id="cg-soft" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
        </defs>

        {/* canvas left intentionally bare — paper texture shows through */}

        <g ref={gRef}>
          {/* Edges */}
          <g>
            {links.map((l, i) => {
              const s = l.source as SimNode;
              const t = l.target as SimNode;
              if (s.x == null || t.x == null) return null;
              const dim =
                highlight && !(highlight.has(s.id) && highlight.has(t.id));
              return (
                <line
                  key={i}
                  x1={s.x}
                  y1={s.y}
                  x2={t.x}
                  y2={t.y}
                  stroke={EDGE_STROKE[l.type]}
                  strokeWidth={
                    l.type === "imports" ? 1 : l.type === "contains" ? 0.5 : 0.6
                  }
                  strokeDasharray={l.type === "calls" ? "2 3" : undefined}
                  opacity={dim ? 0.05 : l.type === "contains" ? 0.55 : 1}
                  style={{ transition: "opacity 200ms" }}
                />
              );
            })}
          </g>

          {/* Nodes */}
          <g>
            {nodes.map((n) => {
              if (n.x == null || n.y == null) return null;
              const r =
                (NODE_RADIUS[n.type] ?? 4) +
                (n.type === "file" ? Math.min(4, (n.churn_score ?? 0) * 0.4) : 0);
              const isSelected = selectedId === n.id;
              const dim = highlight && !highlight.has(n.id);
              return (
                <g
                  key={n.id}
                  transform={`translate(${n.x},${n.y})`}
                  style={{
                    cursor: "pointer",
                    opacity: dim ? 0.18 : 1,
                    transition: "opacity 200ms",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(n.id === selectedId ? null : n.id);
                  }}
                  onMouseDown={(e) => {
                    // simple drag
                    const sim = simRef.current;
                    if (!sim) return;
                    const svg = svgRef.current!;
                    const pt = svg.createSVGPoint();
                    const ctm = (gRef.current as SVGGElement).getScreenCTM()!;
                    sim.alphaTarget(0.3).restart();
                    n.fx = n.x;
                    n.fy = n.y;
                    const move = (ev: MouseEvent) => {
                      pt.x = ev.clientX;
                      pt.y = ev.clientY;
                      const p = pt.matrixTransform(ctm.inverse());
                      n.fx = p.x;
                      n.fy = p.y;
                    };
                    const up = () => {
                      sim.alphaTarget(0);
                      n.fx = null;
                      n.fy = null;
                      window.removeEventListener("mousemove", move);
                      window.removeEventListener("mouseup", up);
                    };
                    window.addEventListener("mousemove", move);
                    window.addEventListener("mouseup", up);
                    e.preventDefault();
                  }}
                >
                  {isSelected && (
                    <circle
                      r={r + 8}
                      fill="none"
                      stroke="hsl(var(--accent))"
                      strokeWidth={1}
                      opacity={0.6}
                      style={{ animation: "radar-pulse 2.4s ease-out infinite" }}
                    />
                  )}
                  <circle
                    r={r}
                    fill={NODE_FILL[n.type]}
                    stroke="hsl(var(--background))"
                    strokeWidth={1.2}
                    filter="url(#cg-soft)"
                  />
                  {(n.type === "file" || isSelected) && (
                    <text
                      x={r + 4}
                      y={3}
                      fontSize={isSelected ? 10 : n.type === "file" ? 9 : 8}
                      fontFamily="var(--font-mono)"
                      fontWeight={isSelected ? 600 : 400}
                      fill="hsl(var(--foreground))"
                      opacity={isSelected ? 1 : 0.7}
                    >
                      {n.type === "file" ? n.file : n.name}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </g>
      </svg>

      {/* Controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 rounded-full border border-border/60 bg-card/70 p-1 shadow-paper backdrop-blur">
        <button
          className="h-7 w-7 rounded text-sm hover:bg-secondary"
          onClick={() => {
            if (svgRef.current && zoomRef.current) {
              select(svgRef.current)
                .transition()
                .duration(200)
                .call(zoomRef.current.scaleBy as never, 1.4);
            }
          }}
          aria-label="Zoom in"
        >+</button>
        <button
          className="h-7 w-7 rounded text-sm hover:bg-secondary"
          onClick={() => {
            if (svgRef.current && zoomRef.current) {
              select(svgRef.current)
                .transition()
                .duration(200)
                .call(zoomRef.current.scaleBy as never, 0.7);
            }
          }}
          aria-label="Zoom out"
        >−</button>
        <button
          className="h-7 w-7 rounded font-mono text-[10px] hover:bg-secondary"
          onClick={resetZoom}
          aria-label="Reset"
        >⤧</button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-4 left-4 flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 font-mono text-[10px] text-muted-foreground shadow-paper backdrop-blur">
        <LegendDot color="hsl(var(--accent))" label="file" />
        <LegendDot color="hsl(var(--foreground))" label="class" />
        <LegendDot color="hsl(var(--muted-foreground))" label="function" />
        <span className="mx-1 h-3 w-px bg-border" />
        <LegendLine solid label="imports" />
        <LegendLine solid={false} label="calls" />
      </div>
    </div>
  );
};

const LegendDot = ({ color, label }: { color: string; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span className="h-2 w-2 rounded-full" style={{ background: color }} />
    {label}
  </span>
);

const LegendLine = ({ solid, label }: { solid: boolean; label: string }) => (
  <span className="flex items-center gap-1.5">
    <span
      className="inline-block h-px w-5"
      style={{
        background: solid ? "hsl(var(--accent))" : "transparent",
        borderTop: solid ? undefined : "1px dashed hsl(var(--muted-foreground))",
      }}
    />
    {label}
  </span>
);
