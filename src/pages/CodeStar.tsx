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
      visual={
        <div className="grid h-full w-full place-items-center">
          <div className="w-[min(78vmin,720px)]">
            <StarVisual />
          </div>
        </div>
      }
      legend={
        <span className="flex items-center gap-3">
          <span className="text-accent">★</span> focal symbol
          <span className="text-border">·</span>
          <span className="text-foreground/70">●</span> 25 related
          <span className="text-border">·</span>
          <span className="text-accent">—</span> live context
        </span>
      }
      panel={
        <div className="rounded-lg border border-border/60 bg-card/80 p-5 shadow-paper backdrop-blur">
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            <span>src/auth/session.ts</span>
            <span className="text-border">·</span>
            <span>refreshToken()</span>
          </div>
          <p className="font-display text-[15px] leading-relaxed">
            Rotates the user's refresh token by calling{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[13px]">issueToken()</code>{" "}
            from <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[13px]">lib/jwt.ts</code>,
            then invalidates the previous token via the{" "}
            <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[13px]">tokens</code> table.
          </p>
          <p className="mt-4 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Live explanations coming next.
          </p>
        </div>
      }
    />
  );
};

export default CodeStar;
