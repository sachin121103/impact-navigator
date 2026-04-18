/**
 * Animated radar — concentric rings + sweeping arc + pulsing dependent dots.
 * Pure SVG, no deps. Used as the hero visual.
 */
const dots = [
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

const polar = (r: number, angle: number) => {
  const rad = (angle * Math.PI) / 180;
  return { x: 160 + r * Math.cos(rad), y: 160 + r * Math.sin(rad) };
};

export const RadarVisual = () => {
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
        <g className="origin-center" style={{ transformOrigin: "160px 160px", animation: "radar-sweep 6s linear infinite" }}>
          <defs>
            <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0" />
              <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.55" />
            </linearGradient>
          </defs>
          <path d="M 160 160 L 290 160 A 130 130 0 0 0 215 50 Z" fill="url(#sweep)" />
        </g>

        {/* dependent dots */}
        {dots.map((d, i) => {
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
        })}

        {/* center node — the change */}
        <circle cx="160" cy="160" r="10" fill="hsl(var(--primary))" />
        <circle cx="160" cy="160" r="5" fill="hsl(var(--background))" />
      </svg>
    </div>
  );
};
