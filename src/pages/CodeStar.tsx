import { SubPageShell } from "@/components/SubPageShell";
import { Sparkles } from "lucide-react";

const CodeStar = () => {
  return (
    <SubPageShell
      eyebrow="02 · code star"
      title="Code Star."
      tagline="What does it mean?"
      description="Point at any file or function and get an explanation grounded in the rest of your repo — not generic documentation, your code in your context."
    >
      <div className="rounded-lg border border-border bg-card p-8 shadow-paper">
        <div className="mb-4 flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-accent" />
          <span>src/auth/session.ts</span>
          <span className="text-border">·</span>
          <span>refreshToken()</span>
        </div>
        <p className="font-display text-lg leading-relaxed">
          This function rotates the user's refresh token by calling{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm">issueToken()</code>{" "}
          from <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm">lib/jwt.ts</code>,
          then invalidates the previous token via the{" "}
          <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-sm">tokens</code> table.
          It's called on every authenticated request that's older than 5 minutes.
        </p>
      </div>
      <p className="mt-6 font-mono text-xs text-muted-foreground">
        Live explanations coming next.
      </p>
    </SubPageShell>
  );
};

export default CodeStar;
