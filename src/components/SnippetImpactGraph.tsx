import { useMemo, useState } from "react";

type RiskLevel = "high" | "medium" | "low";

interface AffectedSymbol {
  id: string;
  name: string;
  file_path: string;
  risk: RiskLevel;
  depth: number;
  fan_in: number;
}

interface MatchedSymbol {
  id: string;
  name: string;
  file_path: string;
}

const RISK_STROKE: Record<RiskLevel, string> = {
  high: "hsl(var(--risk-high))",
  medium: "hsl(var(--risk-med))",
  low: "hsl(var(--risk-low))",
};

interface FileNode {
  file_path: string;
  symbols: AffectedSymbol[];
  worstRisk: RiskLevel;
  count: number;
}

const riskRank = (r: RiskLevel) => (r === "high" ? 3 : r === "medium" ? 2 : 1);

export const SnippetImpactGraph = ({
  matched,
  affected,
}: {
  matched: MatchedSymbol[];
  affected: AffectedSymbol[];
}) => {
  const [hovered, setHovered] = useState<string | null>(null);

  const fileNodes: FileNode[] = useMemo(() => {
    const byFile = new Map<string, FileNode>();
    for (const a of affected) {
      const cur = byFile.get(a.file_path);
      if (!cur) {
        byFile.set(a.file_path, {
          file_path: a.file_path,
          symbols: [a],
          worstRisk: a.risk,
          count: 1,
        });
      } else {
        cur.symbols.push(a);
        cur.count += 1;
        if (riskRank(a.risk) > riskRank(cur.worstRisk)) cur.worstRisk = a.risk;
      }
    }
    return [...byFile.values()]
      .sort((a, b) => riskRank(b.worstRisk) - riskRank(a.worstRisk) || b.count - a.count)
      .slice(0, 24);
  }, [affected]);

  const width = 520;
  const height = 320;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 40;

  const positions = useMemo(() => {
    return fileNodes.map((f, i) => {
      const angle = (i / Math.max(fileNodes.length, 1)) * Math.PI * 2 - Math.PI / 2;
      const r = radius * (0.55 + (1 - Math.min(f.count, 10) / 10) * 0.4);
      return {
        node: f,
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
      };
    });
  }, [fileNodes, cx, cy, radius]);

  if (fileNodes.length === 0) {
    return (
      <div className="rounded-md border border-border bg-background px-3 py-6 text-center text-xs font-mono text-muted-foreground">
        No downstream files to graph.
      </div>
    );
  }

  const fileName = (p: string) => p.split("/").slice(-2).join("/");

  return (
    <div className="rounded-md border border-border bg-background overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          dependency graph · hover nodes
        </span>
        <span className="text-[10px] font-mono text-muted-foreground">
          {fileNodes.length} files
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto"
          role="img"
          aria-label="Snippet dependency graph"
        >
          {/* edges */}
          {positions.map(({ node, x, y }) => {
            const isHover = hovered === node.file_path;
            return (
              <line
                key={`e-${node.file_path}`}
                x1={cx}
                y1={cy}
                x2={x}
                y2={y}
                stroke={RISK_STROKE[node.worstRisk]}
                strokeWidth={isHover ? 1.5 : 0.6}
                strokeOpacity={isHover ? 0.9 : 0.35}
              />
            );
          })}

          {/* center node — the snippet */}
          <g>
            <circle
              cx={cx}
              cy={cy}
              r={22}
              fill="hsl(var(--accent) / 0.15)"
              stroke="hsl(var(--accent))"
              strokeWidth={1.5}
            />
            <text
              x={cx}
              y={cy + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-accent font-mono"
              style={{ fontSize: 9, letterSpacing: "0.1em" }}
            >
              SNIPPET
            </text>
            <text
              x={cx}
              y={cy + 12}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground font-mono"
              style={{ fontSize: 8 }}
            >
              {matched.length} match{matched.length === 1 ? "" : "es"}
            </text>
          </g>

          {/* file nodes */}
          {positions.map(({ node, x, y }) => {
            const isHover = hovered === node.file_path;
            const r = 5 + Math.min(node.count, 8);
            return (
              <g
                key={`n-${node.file_path}`}
                onMouseEnter={() => setHovered(node.file_path)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <circle
                  cx={x}
                  cy={y}
                  r={r + 6}
                  fill="transparent"
                />
                <circle
                  cx={x}
                  cy={y}
                  r={r}
                  fill={`${RISK_STROKE[node.worstRisk]}`}
                  fillOpacity={isHover ? 0.9 : 0.55}
                  stroke={RISK_STROKE[node.worstRisk]}
                  strokeWidth={isHover ? 2 : 1}
                />
                {isHover && (
                  <g>
                    <rect
                      x={x + r + 6}
                      y={y - 18}
                      width={Math.max(80, fileName(node.file_path).length * 5.5 + 18)}
                      height={32}
                      rx={3}
                      fill="hsl(var(--card))"
                      stroke="hsl(var(--border))"
                      strokeWidth={1}
                    />
                    <text
                      x={x + r + 12}
                      y={y - 5}
                      className="fill-foreground font-mono"
                      style={{ fontSize: 10 }}
                    >
                      {fileName(node.file_path)}
                    </text>
                    <text
                      x={x + r + 12}
                      y={y + 7}
                      className="fill-muted-foreground font-mono"
                      style={{ fontSize: 9 }}
                    >
                      {node.count} symbol{node.count === 1 ? "" : "s"} · {node.worstRisk}
                    </text>
                  </g>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="flex items-center gap-3 border-t border-border px-3 py-1.5 font-mono text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-risk-high" /> high
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-risk-med" /> med
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-risk-low" /> low
        </span>
        <span className="ml-auto">node size = # affected symbols in file</span>
      </div>
    </div>
  );
};
