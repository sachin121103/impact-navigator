import { useEffect, useState } from "react";
import { ChevronDown, AlertTriangle, Loader2, GitCommit } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface RiskyFile {
  file_path: string;
  churn: number;
  symbols: number;
}

const churnBand = (churn: number, max: number): { label: string; cls: string } => {
  const pct = max > 0 ? churn / max : 0;
  if (pct >= 0.66) return { label: "HIGH", cls: "text-risk-high border-risk-high/40" };
  if (pct >= 0.33) return { label: "MED", cls: "text-risk-med border-risk-med/40" };
  return { label: "LOW", cls: "text-risk-low border-risk-low/40" };
};

export const RiskyFilesPanel = ({ repoUrl }: { repoUrl: string }) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; files: RiskyFile[]; maxChurn: number }
  >({ status: "idle" });

  useEffect(() => {
    if (!open || state.status !== "idle") return;
    let cancelled = false;
    (async () => {
      setState({ status: "loading" });
      try {
        const { data, error } = await supabase.functions.invoke("risky-files", {
          body: { repoUrl, limit: 12 },
        });
        if (error) throw new Error(error.message);
        if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Failed to load");
        if (!cancelled) {
          setState({
            status: "ready",
            files: (data as any).files,
            maxChurn: (data as any).maxChurn,
          });
        }
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [open, repoUrl, state.status]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card shadow-paper">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <div className="flex items-center gap-2 min-w-0">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-risk-med" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-accent">
            Risky files
          </span>
          <span className="font-mono text-[10px] text-muted-foreground truncate">
            · ranked by git churn · predictive
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border">
          {state.status === "loading" && (
            <div className="flex items-center gap-2 px-4 py-4 text-xs font-mono text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Aggregating commit history…
            </div>
          )}
          {state.status === "error" && (
            <div className="px-4 py-3 text-xs">
              <span className="font-mono text-risk-high">error: </span>
              <span className="text-foreground">{state.message}</span>
            </div>
          )}
          {state.status === "ready" && state.files.length === 0 && (
            <div className="px-4 py-4 text-xs font-mono text-muted-foreground">
              No churn data available yet — try re-indexing the repo.
            </div>
          )}
          {state.status === "ready" && state.files.length > 0 && (
            <div className="divide-y divide-border max-h-72 overflow-y-auto">
              {state.files.map((f) => {
                const band = churnBand(f.churn, state.maxChurn);
                const pct = state.maxChurn > 0 ? (f.churn / state.maxChurn) * 100 : 0;
                return (
                  <div key={f.file_path} className="px-4 py-2.5 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${band.cls}`}>
                        {band.label}
                      </span>
                      <span className="font-mono text-foreground truncate flex-1 min-w-0" title={f.file_path}>
                        {f.file_path}
                      </span>
                      <span className="shrink-0 inline-flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <GitCommit className="h-3 w-3" />
                        {f.churn}
                      </span>
                    </div>
                    <div className="h-1 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full ${band.cls.split(" ")[0].replace("text-", "bg-")}`}
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
