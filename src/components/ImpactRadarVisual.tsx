/**
 * Impact Radar visual — concentric rings = depth, dots = upstream callers,
 * color = risk bucket, size = risk magnitude.
 */
import { useMemo } from "react";

export interface Affected {
  id: string;
  name: string;
  depth: number;
  risk: number;
  bucket: "high" | "med" | "low";
}

interface Props {
  targetName: string;
  affected: Affected[];
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  depthMax?: number;
}

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const bucketColor: Record<Affected["bucket"], string> = {
  high: "hsl(var(--risk-high))",
  med: "hsl(var(--risk-med))",
  low: "hsl(var(--risk-low))",
};

export const ImpactRadarVisual = ({
  targetName,
  affected,
  selectedId,
  onSelect,
  depthMax = 4,
}: Props) => {
  const cx = 160;
  const cy = 160;
  const ringRadii = useMemo(() => {
    const max = Math.max(1, Math.min(depthMax, 4));
    const step = 130 / max;
    return Array.from({ length: max }, (_, i) => Math.round((i + 1) * step));
  }, [depthMax]);

  const placed = useMemo(
    () =>
      affected.map((a) => {
        const ringIdx = Math.min(a.depth, ringRadii.length) - 1;
        const r = ringRadii[Math.max(0, ringIdx)] ?? 130;
        const angle = (hash(a.id) % 360) * (Math.PI / 180);
        return {
          ...a,
          x: cx + r * Math.cos(angle),
          y: cy + r * Math.sin(angle),
          dotR: 3 + a.risk * 6,
        };
      }),
    [affected, ringRadii],
  );

  const topRiskId = affected[0]?.id;

  return (
    <div className="relative aspect-square w-full max-w-[520px] mx-auto">
      <div className="absolute inset-0 bg-radar rounded-full" />
      <svg viewBox="0 0 320 320" className="relative w-full h-full">
        {ringRadii.map((r, i) => (
          <circle
            key={r}
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeOpacity={0.08 + i * 0.015}
            strokeWidth="1"
            strokeDasharray={i === ringRadii.length - 1 ? "0" : "2 4"}
          />
        ))}
        <line x1={cx} y1={20} x2={cx} y2={300} stroke="hsl(var(--foreground))" strokeOpacity="0.05" />
        <line x1={20} y1={cy} x2={300} y2={cy} stroke="hsl(var(--foreground))" strokeOpacity="0.05" />

        {/* one-shot sweep */}
        <g
          key={targetName}
          style={{
            transformOrigin: `${cx}px ${cy}px`,
            animation: "radar-sweep 2.4s var(--ease-out-expo) 1",
          }}
        >
          <defs>
            <linearGradient id="impact-sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0" />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.4" />
            </linearGradient>
          </defs>
          <path d={`M ${cx} ${cy} L ${cx + 130} ${cy} A 130 130 0 0 0 ${cx + 65} ${cy - 113} Z`} fill="url(#impact-sweep)" />
        </g>

        {/* depth labels */}
        {ringRadii.map((r, i) => (
          <text
            key={`lbl-${r}`}
            x={cx + r + 4}
            y={cy - 3}
            className="fill-muted-foreground"
            style={{ fontFamily: "var(--font-mono)", fontSize: 8 }}
            opacity="0.6"
          >
            d{i + 1}
          </text>
        ))}

        {/* dots */}
        {placed.map((p) => {
          const isSel = selectedId === p.id;
          const isTop = topRiskId === p.id;
          return (
            <g key={p.id} style={{ cursor: "pointer" }} onClick={() => onSelect?.(p.id)}>
              {(isSel || isTop) && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={p.dotR + 4}
                  fill={bucketColor[p.bucket]}
                  opacity="0.25"
                  style={{
                    transformOrigin: `${p.x}px ${p.y}px`,
                    animation: "radar-pulse 2.2s var(--ease-out-expo) infinite",
                  }}
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={p.dotR}
                fill={bucketColor[p.bucket]}
                stroke={isSel ? "hsl(var(--foreground))" : "none"}
                strokeWidth={isSel ? 1.5 : 0}
              />
              <title>{p.name} · risk {p.risk.toFixed(2)} · depth {p.depth}</title>
            </g>
          );
        })}

        {/* center */}
        <circle cx={cx} cy={cy} r="11" fill="hsl(var(--primary))" />
        <circle cx={cx} cy={cy} r="5" fill="hsl(var(--background))" />
        <text
          x={cx}
          y={cy + 28}
          textAnchor="middle"
          className="fill-foreground"
          style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600 }}
        >
          {targetName}
        </text>
      </svg>
    </div>
  );
};
