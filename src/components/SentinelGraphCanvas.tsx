import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FlaskConical } from "lucide-react";
import {
  SGGraph,
  SGNode,
  bfsDownstream,
  findDeadNodes,
} from "@/lib/sentinel-graph";

interface Props {
  graph: SGGraph;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  deadCodeMode: boolean;
}

const W = 720;
const H = 720;

// Deterministic seeded RNG so layout is stable.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

interface Pos {
  x: number;
  y: number;
}

function layout(graph: SGGraph): Map<string, Pos> {
  const r = rng(42);
  const positions = new Map<string, Pos>();
  // Group: tests on outer ring, files on middle ring, functions inner.
  const groups: Record<string, SGNode[]> = {
    test: [],
    file: [],
    function: [],
  };
  for (const n of graph.nodes) groups[n.kind].push(n);

  const cx = W / 2;
  const cy = H / 2;
  const rings: Array<[SGNode[], number]> = [
    [groups.function, 130],
    [groups.file, 240],
    [groups.test, 320],
  ];
  for (const [arr, radius] of rings) {
    arr.forEach((n, i) => {
      const angle = (i / arr.length) * Math.PI * 2 + r() * 0.4;
      const jitter = (r() - 0.5) * 30;
      positions.set(n.id, {
        x: cx + Math.cos(angle) * (radius + jitter),
        y: cy + Math.sin(angle) * (radius + jitter),
      });
    });
  }
  return positions;
}

const extColor: Record<string, string> = {
  ts: "hsl(var(--accent))",
  tsx: "hsl(var(--accent))",
  js: "hsl(var(--accent))",
  py: "hsl(38 70% 55%)",
  css: "hsl(150 30% 55%)",
  other: "hsl(var(--muted-foreground))",
};

function nodeFill(n: SGNode) {
  if (n.kind === "test") return "hsl(var(--foreground))";
  return extColor[n.ext ?? "other"] ?? extColor.other;
}

export const SentinelGraphCanvas = ({
  graph,
  selectedId,
  onSelect,
  deadCodeMode,
}: Props) => {
  const positions = useMemo(() => layout(graph), [graph]);
  const dead = useMemo(() => new Set(findDeadNodes(graph).map((n) => n.id)), [graph]);

  // Perf gating: at high node counts, drop expensive per-node animations.
  const heavy = graph.nodes.length > 200;

  const blast = useMemo(() => {
    if (!selectedId) return new Map<string, number>();
    const m = new Map<string, number>();
    m.set(selectedId, 0);
    for (const hit of bfsDownstream(graph, selectedId)) m.set(hit.id, hit.depth);
    return m;
  }, [graph, selectedId]);

  const selectedPos = selectedId ? positions.get(selectedId) : null;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      onClick={() => onSelect(null)}
    >
      <defs>
        <filter id="deadGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Edges */}
      <g>
        {graph.edges.map((e, i) => {
          const a = positions.get(e.from);
          const b = positions.get(e.to);
          if (!a || !b) return null;
          const inBlast =
            selectedId && blast.has(e.from) && blast.has(e.to);
          const dim = selectedId && !inBlast;
          const stroke =
            e.kind === "covers"
              ? "hsl(var(--accent))"
              : "hsl(var(--border))";
          const dash =
            e.kind === "calls" ? "4 3" : e.kind === "covers" ? "1 4" : undefined;
          return (
            <line
              key={i}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={stroke}
              strokeWidth={inBlast ? 1.6 : 0.8}
              strokeDasharray={dash}
              opacity={dim ? 0.12 : inBlast ? 0.9 : 0.45}
            />
          );
        })}
      </g>

      {/* Ripple rings */}
      <AnimatePresence>
        {selectedPos && (
          <>
            {[0, 1, 2].map((i) => (
              <motion.circle
                key={`ripple-${selectedId}-${i}`}
                cx={selectedPos.x}
                cy={selectedPos.y}
                r={14}
                fill="none"
                stroke="hsl(var(--accent))"
                strokeWidth={1.2}
                initial={{ scale: 0.4, opacity: 0.6 }}
                animate={{ scale: 4 + i, opacity: 0 }}
                transition={{
                  duration: 1.6,
                  delay: i * 0.35,
                  repeat: Infinity,
                  ease: "easeOut",
                }}
                style={{ transformOrigin: `${selectedPos.x}px ${selectedPos.y}px` }}
              />
            ))}
          </>
        )}
      </AnimatePresence>

      {/* Nodes */}
      <g>
        {graph.nodes.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          const isDead = dead.has(n.id);
          const inBlast = blast.has(n.id);
          const depth = blast.get(n.id) ?? 0;
          const isSelected = n.id === selectedId;
          const dim = selectedId && !inBlast;
          const r = n.kind === "file" ? 11 : n.kind === "test" ? 10 : 7;
          const fill = nodeFill(n);
          const showDead = (deadCodeMode || isDead) && isDead;

          return (
            <motion.g
              key={n.id}
              initial={false}
              animate={{
                opacity: dim ? 0.22 : 1,
                scale: isSelected ? 1.25 : inBlast ? 1.1 : 1,
              }}
              transition={{ delay: inBlast ? depth * 0.08 : 0, duration: 0.35 }}
              style={{ transformOrigin: `${p.x}px ${p.y}px`, cursor: "pointer" }}
              onClick={(ev) => {
                ev.stopPropagation();
                onSelect(n.id);
              }}
            >
              {showDead && (
                heavy ? (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 6}
                    fill="none"
                    stroke="hsl(0 75% 55%)"
                    strokeWidth={1.4}
                    opacity={0.7}
                  />
                ) : (
                  <motion.circle
                    cx={p.x}
                    cy={p.y}
                    r={r + 8}
                    fill="none"
                    stroke="hsl(0 75% 55%)"
                    strokeWidth={1.4}
                    filter="url(#deadGlow)"
                    animate={{ opacity: [0.3, 0.85, 0.3] }}
                    transition={{ duration: 2.2, repeat: Infinity }}
                  />
                )
              )}
              {isSelected && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r + 4}
                  fill="none"
                  stroke="hsl(var(--accent))"
                  strokeWidth={1.5}
                />
              )}
              {n.kind === "test" ? (
                <>
                  <circle cx={p.x} cy={p.y} r={r} fill={fill} stroke="hsl(var(--accent))" strokeWidth={1.2} />
                  <FlaskConical
                    x={p.x - 6}
                    y={p.y - 6}
                    width={12}
                    height={12}
                    color="hsl(var(--accent))"
                  />
                </>
              ) : (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={fill}
                  stroke={isDead ? "hsl(0 75% 55%)" : "hsl(var(--background))"}
                  strokeWidth={isDead ? 1.8 : 1}
                />
              )}
              <text
                x={p.x}
                y={p.y + r + 11}
                textAnchor="middle"
                fontSize={9}
                fontFamily="ui-monospace, monospace"
                fill="hsl(var(--foreground))"
                opacity={0.75}
                pointerEvents="none"
              >
                {n.label}
              </text>
            </motion.g>
          );
        })}
      </g>
    </svg>
  );
};
