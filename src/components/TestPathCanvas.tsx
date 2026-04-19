import { useEffect, useMemo, useRef } from "react";
import type { GraphPayload, GraphNode } from "@/lib/sample-graph";
import { isTestNode } from "@/lib/testpath";

interface Props {
  data: GraphPayload;
  selectedId: string | null;
  coveringTestIds: Set<string>;
  untestedIds: Set<string>;
  /** Nodes reached by at least one test — tinted on the canvas in coverage mode. */
  coveredIds?: Set<string>;
  /** When "coverage", the canvas tints covered vs untested nodes globally. */
  mode?: "default" | "coverage";
  onSelect: (id: string | null) => void;
}

interface Pos { x: number; y: number; vx: number; vy: number }

const W = 720;
const H = 720;

// Light force layout — runs once per data change for ~120 ticks.
function layout(data: GraphPayload): Map<string, Pos> {
  const pos = new Map<string, Pos>();
  const n = data.nodes.length || 1;
  const radius = Math.min(W, H) * 0.42;
  data.nodes.forEach((node, i) => {
    const a = (i / n) * Math.PI * 2;
    pos.set(node.id, {
      x: W / 2 + Math.cos(a) * radius * (0.6 + ((i * 137) % 100) / 250),
      y: H / 2 + Math.sin(a) * radius * (0.6 + ((i * 73) % 100) / 250),
      vx: 0,
      vy: 0,
    });
  });

  const ideal = 60;
  const k = 0.04;
  const repulse = 1800;

  for (let t = 0; t < 140; t++) {
    // repulsion
    const arr = data.nodes;
    for (let i = 0; i < arr.length; i++) {
      const a = pos.get(arr[i].id)!;
      for (let j = i + 1; j < arr.length; j++) {
        const b = pos.get(arr[j].id)!;
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const d2 = dx * dx + dy * dy + 0.01;
        const f = repulse / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }
    // attraction along edges
    for (const e of data.edges) {
      const a = pos.get(e.source);
      const b = pos.get(e.target);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const f = (d - ideal) * k;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }
    // integrate + damping + bounds
    for (const p of pos.values()) {
      p.vx *= 0.82;
      p.vy *= 0.82;
      p.x += p.vx;
      p.y += p.vy;
      p.x = Math.max(40, Math.min(W - 40, p.x));
      p.y = Math.max(40, Math.min(H - 40, p.y));
    }
  }
  return pos;
}

export const TestPathCanvas = ({
  data,
  selectedId,
  coveringTestIds,
  untestedIds,
  coveredIds,
  mode = "default",
  onSelect,
}: Props) => {
  const positions = useMemo(() => layout(data), [data]);
  const svgRef = useRef<SVGSVGElement>(null);

  // Path edges + neighbor set (direct connections to the selected node).
  const { highlightEdges, neighborIds } = useMemo(() => {
    const edges = new Set<number>();
    const neighbors = new Set<string>();
    if (!selectedId) return { highlightEdges: edges, neighborIds: neighbors };
    const reverseAdj = new Map<string, number[]>();
    data.edges.forEach((e, idx) => {
      const list = reverseAdj.get(e.target);
      if (list) list.push(idx);
      else reverseAdj.set(e.target, [idx]);
    });
    const stack = [selectedId];
    const seen = new Set<string>([selectedId]);
    while (stack.length) {
      const cur = stack.pop()!;
      const incoming = reverseAdj.get(cur);
      if (!incoming) continue;
      for (const idx of incoming) {
        const e = data.edges[idx];
        edges.add(idx);
        if (!seen.has(e.source)) {
          seen.add(e.source);
          stack.push(e.source);
        }
      }
    }
    // Direct neighbors (1 hop in either direction) — these get prominent labels.
    for (const e of data.edges) {
      if (e.source === selectedId) neighbors.add(e.target);
      if (e.target === selectedId) neighbors.add(e.source);
    }
    return { highlightEdges: edges, neighborIds: neighbors };
  }, [data, selectedId]);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      onClick={(e) => {
        if (e.target === svgRef.current) onSelect(null);
      }}
    >
      <defs>
        {/* Soft glow used by the selected node + covering halos. */}
        <filter id="tp-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        {/* Gradient for the highlighted/path edges. */}
        <linearGradient id="tp-edge-grad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.2" />
          <stop offset="50%" stopColor="hsl(var(--accent))" stopOpacity="1" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.2" />
        </linearGradient>
        {/* Coverage radial wash behind covered nodes. */}
        <radialGradient id="tp-cov-wash" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.35" />
          <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
        </radialGradient>
        {/* Subtle dot grid backdrop. */}
        <pattern id="tp-grid" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="0.6" fill="hsl(var(--foreground))" opacity="0.06" />
        </pattern>
        {/* Soft vignette to ground the canvas. */}
        <radialGradient id="tp-vignette" cx="50%" cy="50%" r="60%">
          <stop offset="60%" stopColor="hsl(var(--background))" stopOpacity="0" />
          <stop offset="100%" stopColor="hsl(var(--background))" stopOpacity="0.6" />
        </radialGradient>
      </defs>

      {/* Backdrop */}
      <rect x="0" y="0" width={W} height={H} fill="url(#tp-grid)" />
      <rect x="0" y="0" width={W} height={H} fill="url(#tp-vignette)" />

      {/* edges */}
      {data.edges.map((e, i) => {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) return null;
        const hl = highlightEdges.has(i);
        const dim = !!selectedId && !hl;
        if (hl) {
          // Animated "data flow" along highlighted edges.
          return (
            <g key={i}>
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="url(#tp-edge-grad)"
                strokeWidth={1.6}
                opacity={0.85}
              />
              <line
                x1={a.x}
                y1={a.y}
                x2={b.x}
                y2={b.y}
                stroke="hsl(var(--accent))"
                strokeWidth={1.4}
                strokeLinecap="round"
                strokeDasharray="2 8"
                opacity={0.9}
              >
                <animate
                  attributeName="stroke-dashoffset"
                  from="0"
                  to="-20"
                  dur="1.2s"
                  repeatCount="indefinite"
                />
              </line>
            </g>
          );
        }
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="hsl(var(--border))"
            strokeWidth={0.6}
            opacity={dim ? 0.08 : 0.45}
          />
        );
      })}

      {/* nodes */}
      {data.nodes.map((n) => {
        const p = positions.get(n.id);
        if (!p) return null;
        const isTest = isTestNode(n);
        const isCovering = coveringTestIds.has(n.id);
        const isSelected = selectedId === n.id;
        const isNeighbor = neighborIds.has(n.id);
        const isUntested = untestedIds.has(n.id);
        const isCovered = !!coveredIds?.has(n.id);
        const dim = !!selectedId && !isSelected && !isCovering && !isNeighbor;
        return (
          <NodeMark
            key={n.id}
            node={n}
            x={p.x}
            y={p.y}
            isTest={isTest}
            isCovering={isCovering}
            isSelected={isSelected}
            isNeighbor={isNeighbor}
            isUntested={isUntested}
            isCovered={isCovered}
            mode={mode}
            dim={dim}
            onClick={() => onSelect(n.id)}
          />
        );
      })}
    </svg>
  );
};

const NodeMark = ({
  node, x, y, isTest, isCovering, isSelected, isNeighbor, isUntested, isCovered, mode, dim, onClick,
}: {
  node: GraphNode;
  x: number;
  y: number;
  isTest: boolean;
  isCovering: boolean;
  isSelected: boolean;
  isNeighbor: boolean;
  isUntested: boolean;
  isCovered: boolean;
  mode: "default" | "coverage";
  dim: boolean;
  onClick: () => void;
}) => {
  const r = node.type === "file" ? 6 : 4;
  const opacity = dim ? 0.18 : 1;
  // In coverage mode, tint covered nodes with accent and untested with destructive.
  const coverageTint =
    mode === "coverage"
      ? isCovered
        ? "hsl(var(--accent))"
        : isUntested
        ? "hsl(var(--destructive))"
        : null
      : null;
  const fill = isSelected
    ? "hsl(var(--accent))"
    : coverageTint
    ? coverageTint
    : isTest
    ? "hsl(var(--accent))"
    : "hsl(var(--foreground))";

  const label =
    node.type === "file"
      ? (node.file.split("/").pop() ?? node.name)
      : node.name.replace(/.*::/, "");
  const truncated = label.length > 22 ? label.slice(0, 22) + "…" : label;

  // Emphasize labels for the selected node and its direct neighbors.
  const emphasized = isSelected || isNeighbor;
  const labelOpacity = emphasized
    ? 1
    : isCovering
    ? 0.9
    : dim
    ? 0
    : 0.6;
  const labelSize = emphasized ? 11 : 9;
  const labelWeight = emphasized ? 600 : 400;

  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ cursor: "pointer", transition: "opacity 200ms" }}
      opacity={opacity}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {isUntested && mode !== "coverage" && (
        <circle r={r + 3} fill="none" stroke="hsl(var(--destructive))" strokeWidth={0.8} opacity={0.55} strokeDasharray="2 2" />
      )}
      {mode === "coverage" && isCovered && !isSelected && (
        <circle r={r + 5} fill="hsl(var(--accent))" opacity={0.12} />
      )}
      {isCovering && !isSelected && (
        <circle r={r + 4} fill="none" stroke="hsl(var(--accent))" strokeWidth={1} opacity={0.5} />
      )}
      {isNeighbor && !isSelected && (
        <circle r={r + 3} fill="none" stroke="hsl(var(--accent))" strokeWidth={1.2} opacity={0.85} />
      )}
      {node.type === "file" ? (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={fill} />
      ) : (
        <circle r={r} fill={fill} />
      )}
      {/* Label background for emphasized labels so they're readable above edges. */}
      {emphasized && (
        <rect
          x={r + 2}
          y={-7}
          width={truncated.length * (labelSize * 0.6) + 6}
          height={labelSize + 4}
          fill="hsl(var(--background))"
          opacity={0.85}
          rx={2}
          style={{ pointerEvents: "none" }}
        />
      )}
      <text
        x={r + 5}
        y={3}
        fontFamily="ui-monospace, monospace"
        fontSize={labelSize}
        fontWeight={labelWeight}
        fill={isSelected ? "hsl(var(--accent))" : "hsl(var(--foreground))"}
        opacity={labelOpacity}
        style={{ pointerEvents: "none" }}
      >
        {truncated}
      </text>
    </g>
  );
};
