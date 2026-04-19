import { useState } from "react";
import { Loader2, Code2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

type RiskLevel = "high" | "medium" | "low";

interface AffectedSymbol {
  id: string;
  qualified_name: string;
  name: string;
  kind: string;
  file_path: string;
  risk: RiskLevel;
  depth: number;
  fan_in: number;
}

interface MatchedSymbol {
  id: string;
  name: string;
  qualified_name: string;
  kind: string;
  file_path: string;
}

interface CodeImpactResult {
  matched: MatchedSymbol[];
  affected: AffectedSymbol[];
  summary: { high: number; medium: number; low: number; total: number };
  identifiers: string[];
  durationMs: number;
}

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: CodeImpactResult };

const RISK_CLASS: Record<RiskLevel, string> = {
  high: "text-risk-high",
  medium: "text-risk-med",
  low: "text-risk-low",
};

export const CodeImpactPanel = ({ repoUrl }: { repoUrl: string }) => {
  const [code, setCode] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });

  const handleAnalyze = async () => {
    if (!code.trim()) return;
    setState({ status: "loading" });
    try {
      const { data, error } = await supabase.functions.invoke("code-impact", {
        body: { code, repoUrl },
      });
      if (error) throw new Error(error.message);
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Failed to analyze");
      setState({ status: "ready", data: data as CodeImpactResult });
    } catch (err) {
      setState({ status: "error", message: (err as Error).message });
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card shadow-paper">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Code2 className="h-3.5 w-3.5 text-accent" />
        <span className="font-mono text-[11px] uppercase tracking-widest text-accent">
          Snippet impact
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          · paste code → see what depends on it
        </span>
      </div>

      <div className="p-4 space-y-3">
        <Textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder={`// Paste a function, file, or selection from this repo\nint update_game(GameState* s) {\n  ...\n}`}
          spellCheck={false}
          className="min-h-[140px] font-mono text-xs bg-background"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            {code.length}/50000 chars
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 px-2.5 font-mono text-xs"
            onClick={handleAnalyze}
            disabled={state.status === "loading" || !code.trim()}
          >
            {state.status === "loading" ? (
              <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Analyzing…</>
            ) : (
              "Analyze impact"
            )}
          </Button>
        </div>

        {state.status === "error" && (
          <div className="rounded-md border border-risk-high/30 bg-risk-high/5 px-3 py-2 text-xs">
            <span className="font-mono text-risk-high">error: </span>
            <span className="text-foreground">{state.message}</span>
          </div>
        )}

        {state.status === "ready" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono text-muted-foreground">
              <span><span className="text-foreground">{state.data.matched.length}</span> matched symbols</span>
              <span>·</span>
              <span><span className="text-foreground">{state.data.summary.total}</span> downstream</span>
              <span>·</span>
              <span><span className="text-risk-high">{state.data.summary.high}</span> high</span>
              <span><span className="text-risk-med">{state.data.summary.medium}</span> med</span>
              <span><span className="text-risk-low">{state.data.summary.low}</span> low</span>
              <span className="ml-auto">{state.data.durationMs}ms</span>
            </div>

            {state.data.matched.length === 0 ? (
              <div className="rounded-md border border-border bg-background px-3 py-2 text-xs font-mono text-muted-foreground">
                No identifiers in your snippet matched any indexed symbol. Try pasting code from this repo.
              </div>
            ) : (
              <>
                <div className="rounded-md border border-border bg-background overflow-hidden">
                  <div className="px-3 py-1.5 border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                    matched in repo
                  </div>
                  <div className="max-h-32 overflow-y-auto divide-y divide-border">
                    {state.data.matched.slice(0, 10).map((s) => (
                      <div key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                        <span className="font-mono text-foreground truncate">{s.name}</span>
                        <span className="text-muted-foreground truncate flex-1 min-w-0">
                          {s.file_path.split("/").slice(-2).join("/")}
                        </span>
                        <span className="shrink-0 rounded border border-border px-1 py-0.5 font-mono text-[9px] text-muted-foreground">
                          {s.kind}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {state.data.affected.length > 0 && (
                  <div className="rounded-md border border-border bg-background overflow-hidden">
                    <div className="px-3 py-1.5 border-b border-border text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                      will be affected
                    </div>
                    <div className="max-h-52 overflow-y-auto divide-y divide-border">
                      {state.data.affected.slice(0, 20).map((sym) => (
                        <div key={sym.id} className="flex items-center gap-2 px-3 py-1.5 text-[11px]">
                          <span className={`shrink-0 ${RISK_CLASS[sym.risk]}`}>●</span>
                          <span className="font-mono text-foreground truncate">{sym.name}</span>
                          <span className="text-muted-foreground truncate flex-1 min-w-0">
                            {sym.file_path.split("/").slice(-2).join("/")}
                          </span>
                          <span className="shrink-0 font-mono text-muted-foreground">d{sym.depth}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
