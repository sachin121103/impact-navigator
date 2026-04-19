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
      {/* edges */}
      {data.edges.map((e, i) => {
        const a = positions.get(e.source);
        const b = positions.get(e.target);
        if (!a || !b) return null;
        const hl = highlightEdges.has(i);
        const dim = !!selectedId && !hl;
        return (
          <line
            key={i}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke={hl ? "hsl(var(--accent))" : "hsl(var(--border))"}
            strokeWidth={hl ? 1.5 : 0.6}
            opacity={dim ? 0.08 : hl ? 0.85 : 0.45}
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
  node, x, y, isTest, isCovering, isSelected, isUntested, dim, onClick,
}: {
  node: GraphNode;
  x: number;
  y: number;
  isTest: boolean;
  isCovering: boolean;
  isSelected: boolean;
  isUntested: boolean;
  dim: boolean;
  onClick: () => void;
}) => {
  const r = node.type === "file" ? 6 : 4;
  const opacity = dim ? 0.18 : 1;
  const fill = isSelected
    ? "hsl(var(--accent))"
    : isTest
    ? "hsl(var(--accent))"
    : "hsl(var(--foreground))";
  return (
    <g
      transform={`translate(${x},${y})`}
      style={{ cursor: "pointer", transition: "opacity 200ms" }}
      opacity={opacity}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {isUntested && (
        <circle r={r + 3} fill="none" stroke="hsl(var(--destructive))" strokeWidth={0.8} opacity={0.55} strokeDasharray="2 2" />
      )}
      {isCovering && !isSelected && (
        <circle r={r + 4} fill="none" stroke="hsl(var(--accent))" strokeWidth={1} opacity={0.5} />
      )}
      {node.type === "file" || isTest ? (
        <rect x={-r} y={-r} width={r * 2} height={r * 2} fill={fill} />
      ) : (
        <circle r={r} fill={fill} />
      )}
      {(() => {
        const label =
          node.type === "file"
            ? (node.file.split("/").pop() ?? node.name)
            : node.name.replace(/.*::/, "");
        const truncated = label.length > 22 ? label.slice(0, 22) + "…" : label;
        return (
          <text
            x={r + 4}
            y={3}
            fontFamily="ui-monospace, monospace"
            fontSize={9}
            fill="hsl(var(--foreground))"
            opacity={isSelected || isCovering ? 0.9 : dim ? 0 : 0.6}
            style={{ pointerEvents: "none" }}
          >
            {truncated}
          </text>
        );
      })()}
    </g>
  );
};
