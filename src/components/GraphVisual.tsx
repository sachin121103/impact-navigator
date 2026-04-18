// Animated repo graph: folder clusters connected by edges.
// Pure SVG, design tokens only.

const NODES = [
  // root
  { id: "root", x: 200, y: 200, r: 9, kind: "root", label: "repo/" },
  // folders
  { id: "src", x: 110, y: 130, r: 7, kind: "folder", label: "src/" },
  { id: "lib", x: 290, y: 120, r: 7, kind: "folder", label: "lib/" },
  { id: "tests", x: 305, y: 285, r: 7, kind: "folder", label: "tests/" },
  { id: "api", x: 95, y: 280, r: 6, kind: "folder", label: "api/" },
  // files
  { id: "f1", x: 50, y: 80, r: 3.5, kind: "file" },
  { id: "f2", x: 60, y: 165, r: 3.5, kind: "file" },
  { id: "f3", x: 145, y: 60, r: 3.5, kind: "file" },
  { id: "f4", x: 250, y: 55, r: 3.5, kind: "file" },
  { id: "f5", x: 345, y: 70, r: 3.5, kind: "file" },
  { id: "f6", x: 355, y: 175, r: 3.5, kind: "file" },
  { id: "f7", x: 355, y: 335, r: 3.5, kind: "file" },
  { id: "f8", x: 250, y: 335, r: 3.5, kind: "file" },
  { id: "f9", x: 50, y: 330, r: 3.5, kind: "file" },
  { id: "f10", x: 145, y: 340, r: 3.5, kind: "file" },
];

const EDGES: [string, string][] = [
  ["root", "src"], ["root", "lib"], ["root", "tests"], ["root", "api"],
  ["src", "f1"], ["src", "f2"], ["src", "f3"],
  ["lib", "f4"], ["lib", "f5"], ["lib", "f6"],
  ["tests", "f7"], ["tests", "f8"],
  ["api", "f9"], ["api", "f10"],
  // a few cross-edges (dependencies)
  ["f3", "f4"], ["f2", "f9"], ["f6", "f8"],
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

export const GraphVisual = () => {
  return (
    <div className="relative aspect-square w-full max-w-[520px] mx-auto">
      {/* soft radial glow */}
      <div className="absolute inset-0 bg-radar opacity-70" />

      <svg
        viewBox="0 0 400 400"
        className="relative h-full w-full"
        aria-hidden
      >
        <defs>
          <radialGradient id="graph-node" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity="0.95" />
            <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity="0.55" />
          </radialGradient>
          <filter id="graph-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* faint grid frame */}
        <rect
          x="20" y="20" width="360" height="360"
          fill="none"
          stroke="hsl(var(--foreground))"
          strokeOpacity="0.06"
          strokeDasharray="2 4"
        />

        {/* edges */}
        <g stroke="hsl(var(--foreground))" strokeOpacity="0.22" strokeWidth="0.8">
          {EDGES.map(([a, b], i) => {
            const A = byId[a]; const B = byId[b];
            return (
              <line
                key={i}
                x1={A.x} y1={A.y} x2={B.x} y2={B.y}
                strokeDasharray="180"
                strokeDashoffset="180"
                style={{
                  animation: `graph-draw 1.2s ${i * 0.06}s var(--ease-out-expo) forwards`,
                }}
              />
            );
          })}
        </g>

        {/* a single highlighted dependency edge — sweeping pulse */}
        <line
          x1={byId["src"].x} y1={byId["src"].y}
          x2={byId["lib"].x} y2={byId["lib"].y}
          stroke="hsl(var(--accent))"
          strokeWidth="1.4"
          strokeOpacity="0.9"
          strokeDasharray="6 6"
          style={{ animation: "graph-flow 2.4s linear infinite" }}
        />

        {/* nodes */}
        <g filter="url(#graph-glow)">
          {NODES.map((n, i) => (
            <g
              key={n.id}
              style={{
                transformOrigin: `${n.x}px ${n.y}px`,
                animation: `graph-pop 0.6s ${0.3 + i * 0.05}s var(--ease-out-expo) both`,
              }}
            >
              {n.kind === "root" && (
                <circle
                  cx={n.x} cy={n.y} r={n.r + 6}
                  fill="none"
                  stroke="hsl(var(--accent))"
                  strokeOpacity="0.4"
                  style={{
                    transformOrigin: `${n.x}px ${n.y}px`,
                    animation: "graph-ring 2.6s ease-out infinite",
                  }}
                />
              )}
              <circle
                cx={n.x} cy={n.y} r={n.r}
                fill={
                  n.kind === "file"
                    ? "hsl(var(--foreground))"
                    : "url(#graph-node)"
                }
                fillOpacity={n.kind === "file" ? 0.55 : 1}
                stroke="hsl(var(--background))"
                strokeWidth="1.2"
              />
            </g>
          ))}
        </g>

        {/* folder labels */}
        <g
          fontFamily="var(--font-mono)"
          fontSize="8"
          fill="hsl(var(--muted-foreground))"
        >
          {NODES.filter((n) => n.label).map((n) => (
            <text
              key={`l-${n.id}`}
              x={n.x + n.r + 5}
              y={n.y + 3}
              style={{ animation: "fade-up 0.6s 0.9s both" }}
            >
              {n.label}
            </text>
          ))}
        </g>
      </svg>

      <style>{`
        @keyframes graph-draw {
          to { stroke-dashoffset: 0; }
        }
        @keyframes graph-flow {
          to { stroke-dashoffset: -24; }
        }
        @keyframes graph-pop {
          0% { transform: scale(0); opacity: 0; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes graph-ring {
          0% { transform: scale(0.9); opacity: 0.6; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </div>
  );
};
