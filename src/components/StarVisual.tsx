// Animated constellation: a focal "star" symbol surrounded by orbiting context.
// Pure SVG, design tokens only.

const ORBITS = [
  { r: 70, count: 5, speed: 24, size: 2.2 },
  { r: 115, count: 8, speed: 38, size: 2.8 },
  { r: 165, count: 12, speed: 56, size: 2 },
];

// Background constellation specks (deterministic)
const SPECKS = Array.from({ length: 38 }, (_, i) => {
  const a = (i * 137.5) * (Math.PI / 180);
  const r = 30 + (i * 11) % 170;
  return { x: 200 + Math.cos(a) * r, y: 200 + Math.sin(a) * r, s: (i % 3) * 0.4 + 0.6 };
});

export const StarVisual = () => {
  return (
    <div className="relative aspect-square w-full max-w-[520px] mx-auto">
      <div className="absolute inset-0 bg-radar opacity-70" />

      <svg viewBox="0 0 400 400" className="relative h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="star-core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="1" />
            <stop offset="60%" stopColor="hsl(var(--accent))" stopOpacity="0.4" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0" />
          </radialGradient>
          <filter id="star-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* faint frame */}
        <rect
          x="20" y="20" width="360" height="360"
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeOpacity="0.06"
          strokeDasharray="2 4"
        />

        {/* background specks */}
        <g fill="hsl(var(--foreground))" fillOpacity="0.25">
          {SPECKS.map((s, i) => (
            <circle
              key={i}
              cx={s.x} cy={s.y} r={s.s}
              style={{
                animation: `star-twinkle ${2.4 + (i % 5) * 0.6}s ${i * 0.07}s ease-in-out infinite`,
              }}
            />
          ))}
        </g>

        {/* orbit rings */}
        <g
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeOpacity="0.12"
          strokeDasharray="1 5"
        >
          {ORBITS.map((o, i) => (
            <circle key={i} cx="200" cy="200" r={o.r} />
          ))}
        </g>

        {/* connecting threads from focal to orbit-1 nodes */}
        <g stroke="hsl(var(--accent))" strokeOpacity="0.35" strokeWidth="0.6">
          {Array.from({ length: ORBITS[0].count }).map((_, i) => {
            const a = (i / ORBITS[0].count) * Math.PI * 2;
            const x = 200 + Math.cos(a) * ORBITS[0].r;
            const y = 200 + Math.sin(a) * ORBITS[0].r;
            return (
              <line
                key={i}
                x1="200" y1="200" x2={x} y2={y}
                strokeDasharray="180"
                strokeDashoffset="180"
                style={{ animation: `graph-draw 1s ${0.6 + i * 0.07}s var(--ease-out-expo) forwards` }}
              />
            );
          })}
        </g>

        {/* orbiting nodes */}
        {ORBITS.map((o, oi) => (
          <g
            key={oi}
            style={{
              transformOrigin: "200px 200px",
              animation: `star-orbit ${o.speed}s linear infinite ${oi % 2 === 0 ? "" : "reverse"}`,
            }}
          >
            {Array.from({ length: o.count }).map((_, i) => {
              const a = (i / o.count) * Math.PI * 2;
              const x = 200 + Math.cos(a) * o.r;
              const y = 200 + Math.sin(a) * o.r;
              return (
                <circle
                  key={i}
                  cx={x} cy={y} r={o.size}
                  fill="hsl(var(--foreground))"
                  fillOpacity="0.7"
                />
              );
            })}
          </g>
        ))}

        {/* focal star — halo + 4-point burst */}
        <g style={{ transformOrigin: "200px 200px", animation: "fade-up 0.8s 0.2s both" }}>
          <circle cx="200" cy="200" r="55" fill="url(#star-core)" />
          <g
            filter="url(#star-glow)"
            style={{
              transformOrigin: "200px 200px",
              animation: "star-pulse 3s ease-in-out infinite",
            }}
          >
            {/* 4-point star using two thin diamonds */}
            <path
              d="M200 168 L206 200 L200 232 L194 200 Z"
              fill="hsl(var(--accent))"
            />
            <path
              d="M168 200 L200 194 L232 200 L200 206 Z"
              fill="hsl(var(--accent))"
            />
            <circle cx="200" cy="200" r="5" fill="hsl(var(--background))" />
            <circle cx="200" cy="200" r="2.4" fill="hsl(var(--accent))" />
          </g>
        </g>

        {/* label */}
        <g fontFamily="var(--font-mono)" fontSize="8" fill="hsl(var(--muted-foreground))">
          <text x="208" y="246" style={{ animation: "fade-up 0.6s 1s both" }}>
            session.refreshToken()
          </text>
        </g>
      </svg>

      <style>{`
        @keyframes star-orbit {
          to { transform: rotate(360deg); }
        }
        @keyframes star-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.08); opacity: 0.85; }
        }
        @keyframes star-twinkle {
          0%, 100% { opacity: 0.15; }
          50% { opacity: 0.7; }
        }
        @keyframes graph-draw {
          to { stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  );
};
