import { useEffect, useRef, useState } from "react";
import { ChevronDown, AlertTriangle, Loader2, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface RiskyFile {
  file_path: string;
  score: number;
  symbols: number;
  fanIn: number;
  fanOut: number;
  churn: number;
}

interface SymbolRow {
  file_path: string;
  fan_in: number;
  fan_out: number;
  churn: number;
}

const scoreBand = (score: number, max: number): { label: string; cls: string } => {
  const pct = max > 0 ? score / max : 0;
  if (pct >= 0.66) return { label: "HIGH", cls: "text-risk-high border-risk-high/40" };
  if (pct >= 0.33) return { label: "MED", cls: "text-risk-med border-risk-med/40" };
  return { label: "LOW", cls: "text-risk-low border-risk-low/40" };
};

const aggregateHotspots = (rows: SymbolRow[], limit: number) => {
  const byFile = new Map<string, RiskyFile>();

  for (const row of rows) {
    const current = byFile.get(row.file_path);
    if (!current) {
      byFile.set(row.file_path, {
        file_path: row.file_path,
        score: row.fan_in * 3 + row.fan_out * 2 + row.churn,
        symbols: 1,
        fanIn: row.fan_in,
        fanOut: row.fan_out,
        churn: row.churn,
      });
      continue;
    }

    current.symbols += 1;
    current.fanIn = Math.max(current.fanIn, row.fan_in);
    current.fanOut = Math.max(current.fanOut, row.fan_out);
    current.churn = Math.max(current.churn, row.churn);
    current.score = current.fanIn * 3 + current.fanOut * 2 + current.churn + current.symbols;
  }

  return [...byFile.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
};

export const RiskyFilesPanel = ({ repoUrl }: { repoUrl: string }) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; files: RiskyFile[]; maxScore: number }
  >({ status: "idle" });

  useEffect(() => {
    if (!open) return;
    if (state.status !== "idle") return;
    let cancelled = false;

    (async () => {
      setState({ status: "loading" });
      try {
        const { data: repo, error: repoError } = await supabase
          .from("repos")
          .select("id")
          .eq("url", repoUrl)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (repoError) throw new Error(repoError.message);
        if (!repo) throw new Error("Repo not found");

        const { data: rows, error } = await supabase
          .from("symbols")
          .select("file_path, fan_in, fan_out, churn")
          .eq("repo_id", repo.id)
          .order("fan_in", { ascending: false })
          .order("fan_out", { ascending: false })
          .order("churn", { ascending: false })
          .limit(300);

        if (error) throw new Error(error.message);

        const files = aggregateHotspots((rows ?? []) as SymbolRow[], 12);
        const maxScore = files[0]?.score ?? 0;

        if (!cancelled) {
          setState({
            status: "ready",
            files,
            maxScore,
          });
        }
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, repoUrl, state.status]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card shadow-paper">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <div className="flex min-w-0 items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-risk-med" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-accent">
            Risky files
          </span>
          <span className="truncate font-mono text-[10px] text-muted-foreground">
            · ranked by graph hotspots · predictive
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border">
          {state.status === "loading" && (
            <div className="flex items-center gap-2 px-4 py-4 text-xs font-mono text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading indexed hotspots…
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
              No hotspots found yet — index the repo first.
            </div>
          )}
          {state.status === "ready" && state.files.length > 0 && (
            <div className="max-h-72 divide-y divide-border overflow-y-auto">
              {state.files.map((f) => {
                const band = scoreBand(f.score, state.maxScore);
                const pct = state.maxScore > 0 ? (f.score / state.maxScore) * 100 : 0;
                return (
                  <div key={f.file_path} className="space-y-1.5 px-4 py-2.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${band.cls}`}>
                        {band.label}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={f.file_path}>
                        {f.file_path}
                      </span>
                      <span className="inline-flex shrink-0 items-center gap-1 font-mono text-[10px] text-muted-foreground">
                        <Activity className="h-3 w-3" />
                        {f.score}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-[10px] text-muted-foreground">
                      <span>fanin {f.fanIn}</span>
                      <span>fanout {f.fanOut}</span>
                      <span>symbols {f.symbols}</span>
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
