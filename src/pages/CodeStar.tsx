import { SubPageShell } from "@/components/SubPageShell";
import { StarVisual } from "@/components/StarVisual";
import { Sparkles } from "lucide-react";

const CodeStar = () => {
  return (
    <SubPageShell
      eyebrow="02 · code star"
      title="Code Star."
      tagline="What does it mean?"
      description="Point at any file or function and get an explanation grounded in the rest of your repo — not generic documentation, your code in your context."
    >
      <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
        <div className="relative">
          <StarVisual />
          <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-4 py-2.5 font-mono text-xs shadow-paper">
            <span className="text-accent">★</span> focal symbol ·{" "}
            <span className="text-foreground/70">●</span> 25 related ·{" "}
            <span className="text-accent">—</span> live context
          </div>
        </div>

        <div>
          <div className="rounded-lg border border-border bg-card p-6 shadow-paper">
            <div className="mb-3 flex items-center gap-2 font-mono text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5 text-accent" />
              <span>src/auth/session.ts</span>
              <span className="text-border">·</span>
              <span>refreshToken()</span>
            </div>
            <p className="font-display text-base leading-relaxed">
              Rotates the user's refresh token by calling{" "}
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm">issueToken()</code>{" "}
              from <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm">lib/jwt.ts</code>,
              then invalidates the previous token via the{" "}
              <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm">tokens</code> table.
            </p>
          </div>
          <p className="mt-6 font-mono text-xs text-muted-foreground">
            Live explanations coming next.
          </p>
        </div>
      </div>
    </SubPageShell>
  );
};

export default CodeStar;
