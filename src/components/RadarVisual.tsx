/**
 * Animated radar — concentric rings + sweeping arc.
 * Decorative idle dots; result mode colors dots by per-symbol risk.
 */

interface AffectedDot {
  depth: number;
  risk?: "high" | "medium" | "low";
}

interface Props {
  results?: AffectedDot[];
}

const RING_RADII = [40, 68, 96, 124];

const STATIC_DOTS = [
  { r: 50, angle: -60 },
  { r: 50, angle: 110 },
  { r: 80, angle: 20 },
  { r: 80, angle: -130 },
  { r: 80, angle: 200 },
  { r: 110, angle: 60 },
  { r: 110, angle: -20 },
  { r: 110, angle: 160 },
  { r: 130, angle: -90 },
];

const RISK_FILL: Record<NonNullable<AffectedDot["risk"]>, string> = {
  high: "hsl(var(--risk-high))",
  medium: "hsl(var(--risk-med))",
  low: "hsl(var(--risk-low))",
};

const polar = (r: number, angle: number) => {
  const rad = (angle * Math.PI) / 180;
  return { x: 160 + r * Math.cos(rad), y: 160 + r * Math.sin(rad) };
};

function buildResultDots(affected: AffectedDot[]) {
  const byDepth: Record<number, AffectedDot[]> = {};
  for (const a of affected.slice(0, 64)) {
    const d = Math.min(Math.max(a.depth, 1), 4);
    (byDepth[d] = byDepth[d] ?? []).push(a);
  }
  const dots: { x: number; y: number; fill: string }[] = [];
  for (const [depthStr, group] of Object.entries(byDepth)) {
    const depth = Number(depthStr);
    const radius = RING_RADII[depth - 1] ?? RING_RADII[3];
    group.forEach((a, i) => {
      const angle = (360 / group.length) * i - 90;
      const { x, y } = polar(radius, angle);
      dots.push({ x, y, fill: RISK_FILL[a.risk ?? "low"] });
    });
  }
  return dots;
}

export const RadarVisual = ({ results }: Props) => {
  const hasResults = !!results && results.length > 0;
  const resultDots = hasResults ? buildResultDots(results!) : null;

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
        <g>
          <defs>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0" />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <animateTransform
            attributeName="transform"
            type="rotate"
            from="0 160 160"
            to="360 160 160"
            dur="4s"
            repeatCount="indefinite"
          />
          <path d="M 160 160 L 290 160 A 130 130 0 0 0 215 50 Z" fill="url(#sweep)" />
        </g>

        {/* idle decorative dots */}
        {!hasResults &&
          STATIC_DOTS.map((d, i) => {
            const { x, y } = polar(d.r, d.angle);
            return (
              <circle key={i} cx={x} cy={y} r={3} fill="hsl(var(--accent))" opacity="0.7" />
            );
          })}

        {/* result dots — risk-colored */}
        {resultDots &&
          resultDots.map((d, i) => (
            <circle key={i} cx={d.x} cy={d.y} r={4} fill={d.fill} />
          ))}

        {/* center node */}
        <circle cx="160" cy="160" r="10" fill="hsl(var(--primary))" />
        <circle cx="160" cy="160" r="5" fill="hsl(var(--background))" />
      </svg>
    </div>
  );
};
