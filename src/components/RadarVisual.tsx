/**
 * Animated radar — concentric rings + sweeping arc + pulsing dependent dots.
 * When `results` are provided the dots are colored by risk level and placed by depth.
 */

type RiskLevel = "high" | "medium" | "low";

interface AffectedDot {
  risk: RiskLevel;
  depth: number;
}

interface Props {
  results?: AffectedDot[];
}

const STATIC_DOTS = [
  { r: 38, angle: 20, delay: 0 },
  { r: 64, angle: 110, delay: 0.3 },
  { r: 64, angle: 200, delay: 0.6 },
  { r: 92, angle: 60, delay: 0.9 },
  { r: 92, angle: 250, delay: 1.2 },
  { r: 92, angle: 320, delay: 1.5 },
  { r: 120, angle: 30, delay: 1.8 },
  { r: 120, angle: 150, delay: 2.1 },
  { r: 120, angle: 280, delay: 0.4 },
];

const RING_RADII = [40, 68, 96, 124];
const RISK_FILL: Record<RiskLevel, string> = {
  high: "hsl(var(--risk-high))",
  medium: "hsl(var(--risk-med))",
  low: "hsl(var(--risk-low))",
};

const polar = (r: number, angle: number) => {
  const rad = (angle * Math.PI) / 180;
  return { x: 160 + r * Math.cos(rad), y: 160 + r * Math.sin(rad) };
};

function buildResultDots(affected: AffectedDot[]) {
  // Group by depth (1–4+), then distribute evenly around the ring
  const byDepth: Record<number, AffectedDot[]> = {};
  for (const a of affected.slice(0, 32)) {
    const d = Math.min(a.depth, 4);
    (byDepth[d] = byDepth[d] ?? []).push(a);
  }
  const dots: { x: number; y: number; fill: string; r: number }[] = [];
  for (const [depthStr, group] of Object.entries(byDepth)) {
    const depth = Number(depthStr);
    const radius = RING_RADII[depth - 1] ?? RING_RADII[3];
    group.forEach((a, i) => {
      const angle = (360 / group.length) * i - 90;
      const { x, y } = polar(radius, angle);
      dots.push({ x, y, fill: RISK_FILL[a.risk], r: a.risk === "high" ? 5 : 4 });
    });
  }
  return dots;
}

export const RadarVisual = ({ results }: Props) => {
  const resultDots = results ? buildResultDots(results) : null;

  return (
    <div className="relative aspect-square w-full max-w-[420px] mx-auto">
      {/* soft glow */}
      <div className="absolute inset-0 bg-radar rounded-full" />

      <svg viewBox="0 0 320 320" className="relative w-full h-full">
        {/* concentric rings */}
        {[40, 70, 100, 130].map((r) => (
          <circle
            key={r}
            cx="160"
            cy="160"
            r={r}
            fill="none"
            stroke="hsl(var(--foreground))"
            strokeOpacity="0.10"
            strokeWidth="1"
          />
        ))}
        {/* crosshairs */}
        <line x1="160" y1="20" x2="160" y2="300" stroke="hsl(var(--foreground))" strokeOpacity="0.06" />
        <line x1="20" y1="160" x2="300" y2="160" stroke="hsl(var(--foreground))" strokeOpacity="0.06" />

        {/* sweeping arc */}
        <g style={{ transformOrigin: "160px 160px", animation: "radar-sweep 6s linear infinite" }}>
          <defs>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0" />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <path d="M 160 160 L 290 160 A 130 130 0 0 0 215 50 Z" fill="url(#sweep)" />
        </g>

        {resultDots ? (
          // Real result dots — colored by risk level, positioned by BFS depth
          resultDots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={d.r} fill={d.fill} opacity="0.85" />
          ))
        ) : (
          // Default animated dots
          STATIC_DOTS.map((d, i) => {
            const { x, y } = polar(d.r, d.angle);
            return (
              <g key={i} style={{ animationDelay: `${d.delay}s` }}>
                <circle
                  cx={x}
                  cy={y}
                  r="6"
                  fill="hsl(var(--accent))"
                  opacity="0.25"
                  style={{
                    transformOrigin: `${x}px ${y}px`,
                    animation: `radar-pulse 2.4s cubic-bezier(0.16, 1, 0.3, 1) ${d.delay}s infinite`,
                  }}
                />
                <circle cx={x} cy={y} r="3" fill="hsl(var(--accent))" />
              </g>
            );
          })
        )}

        {/* center node — the changed symbol */}
        <circle cx="160" cy="160" r="10" fill="hsl(var(--primary))" />
        <circle cx="160" cy="160" r="5" fill="hsl(var(--background))" />
      </svg>
    </div>
  );
};
