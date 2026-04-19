/**
 * Animated radar — concentric rings + sweeping arc.
 * Idle: empty radar with a faint "awaiting change" label.
 * Result: each dot represents an affected symbol.
 *   - distance from center = call-graph depth (closer = more direct)
 *   - dot size = symbol fan_in (bigger = wider downstream propagation)
 *   - color = single neutral ink, opacity falls off with depth
 */

interface AffectedDot {
  id?: string;
  name?: string;
  file_path?: string;
  depth: number;
  fan_in?: number;
  // Legacy field — accepted but no longer used for color.
  risk?: "high" | "medium" | "low";
}

interface Props {
  results?: AffectedDot[];
}

const RING_RADII = [40, 68, 96, 124];

const polar = (r: number, angle: number) => {
  const rad = (angle * Math.PI) / 180;
  return { x: 160 + r * Math.cos(rad), y: 160 + r * Math.sin(rad) };
};

const depthOpacity = (depth: number) => {
  // d1 → 0.95, d2 → 0.75, d3 → 0.55, d4+ → 0.4
  const map = [0.95, 0.75, 0.55, 0.4];
  return map[Math.min(Math.max(depth, 1), 4) - 1];
};

const fanInRadius = (fanIn: number) => {
  // Clamp 0..20 → 3..7 px
  const f = Math.max(0, Math.min(fanIn, 20));
  return 3 + (f / 20) * 4;
};

function buildResultDots(affected: AffectedDot[]) {
  const byDepth: Record<number, AffectedDot[]> = {};
  for (const a of affected.slice(0, 64)) {
    const d = Math.min(Math.max(a.depth, 1), 4);
    (byDepth[d] = byDepth[d] ?? []).push(a);
  }
  const dots: {
    x: number; y: number; r: number; opacity: number;
    name: string; file: string; depth: number; fanIn: number;
  }[] = [];
  for (const [depthStr, group] of Object.entries(byDepth)) {
    const depth = Number(depthStr);
    const radius = RING_RADII[depth - 1] ?? RING_RADII[3];
    group.forEach((a, i) => {
      const angle = (360 / group.length) * i - 90;
      const { x, y } = polar(radius, angle);
      dots.push({
        x, y,
        r: fanInRadius(a.fan_in ?? 0),
        opacity: depthOpacity(depth),
        name: a.name ?? "symbol",
        file: a.file_path ?? "",
        depth,
        fanIn: a.fan_in ?? 0,
      });
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

        {resultDots &&
          resultDots.map((d, i) => (
            <circle
              key={i}
              cx={d.x}
              cy={d.y}
              r={d.r}
              fill="hsl(var(--foreground))"
              opacity={d.opacity}
            >
              <title>
                {d.name}
                {d.file ? ` · ${d.file.split("/").slice(-2).join("/")}` : ""}
                {` · depth ${d.depth} · fan-in ${d.fanIn}`}
              </title>
            </circle>
          ))}

        {/* center node — the changed symbol */}
        <circle cx="160" cy="160" r="10" fill="hsl(var(--primary))" />
        <circle cx="160" cy="160" r="5" fill="hsl(var(--background))" />

        {/* idle label */}
        {!hasResults && (
          <text
            x="160"
            y="186"
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: 1.5 }}
            opacity="0.55"
          >
            AWAITING CHANGE
          </text>
        )}
      </svg>
    </div>
  );
};
