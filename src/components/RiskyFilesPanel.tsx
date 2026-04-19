import { useEffect, useState } from "react";
import { ChevronDown, AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface RiskySymbol {
  id: string;
  name: string;
  qualified_name: string;
  kind: string;
  file_path: string;
  fan_in: number;
  fan_out: number;
  churn: number;
  score: number;
}

interface RiskyFile {
  file_path: string;
  score: number;
  symbols: RiskySymbol[];
}

const riskBand = (score: number): { label: string; cls: string } => {
  if (score >= 18) return { label: "HIGH", cls: "text-risk-high border-risk-high/40" };
  if (score >= 8) return { label: "MED", cls: "text-risk-med border-risk-med/40" };
  return { label: "LOW", cls: "text-risk-low border-risk-low/40" };
};

export const RiskyFilesPanel = ({ repoUrl }: { repoUrl: string }) => {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | { status: "ready"; files: RiskyFile[] }
  >({ status: "idle" });

  useEffect(() => {
    if (!open || state.status !== "idle") return;
    let cancelled = false;
    (async () => {
      setState({ status: "loading" });
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Sign in required");
        const { data: repo } = await supabase
          .from("repos")
          .select("id")
          .eq("url", repoUrl)
          .eq("owner_id", user.id)
          .maybeSingle();
        if (!repo) throw new Error("Repo not found");

        const { data: symbols, error } = await supabase
          .from("symbols")
          .select("id, name, qualified_name, kind, file_path, fan_in, fan_out, churn")
          .eq("repo_id", (repo as any).id);
        if (error) throw error;

        const enriched: RiskySymbol[] = (symbols ?? []).map((s: any) => ({
          ...s,
          score: s.fan_in * 2 + s.fan_out + s.churn * 3,
        }));

        const byFile = new Map<string, RiskySymbol[]>();
        for (const s of enriched) {
          const arr = byFile.get(s.file_path) ?? [];
          arr.push(s);
          byFile.set(s.file_path, arr);
        }
        const files: RiskyFile[] = [...byFile.entries()]
          .map(([file_path, syms]) => ({
            file_path,
            score: syms.reduce((a, b) => a + b.score, 0),
            symbols: syms.sort((a, b) => b.score - a.score).slice(0, 5),
          }))
          .filter((f) => f.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 10);

        if (!cancelled) setState({ status: "ready", files });
      } catch (err) {
        if (!cancelled) setState({ status: "error", message: (err as Error).message });
      }
    })();
    return () => { cancelled = true; };
  }, [open, repoUrl, state.status]);

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border border-border bg-card shadow-paper">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-3.5 w-3.5 text-risk-med" />
          <span className="font-mono text-[11px] uppercase tracking-widest text-accent">
            Risky files
          </span>
          <span className="font-mono text-[10px] text-muted-foreground">
            · historically fragile · predictive
          </span>
        </div>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t border-border">
          {state.status === "loading" && (
            <div className="flex items-center gap-2 px-4 py-4 text-xs font-mono text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Scoring symbols by fan-in × churn…
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
              No fragile hotspots detected — all symbols have low coupling and churn.
            </div>
          )}
          {state.status === "ready" && state.files.length > 0 && (
            <div className="divide-y divide-border max-h-80 overflow-y-auto">
              {state.files.map((f) => {
                const band = riskBand(f.score);
                return (
                  <div key={f.file_path} className="px-4 py-3 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${band.cls}`}>
                        {band.label}
                      </span>
                      <span className="font-mono text-foreground truncate flex-1 min-w-0">
                        {f.file_path}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                        score {f.score}
                      </span>
                    </div>
                    <div className="pl-2 space-y-0.5">
                      {f.symbols.map((s) => (
                        <div key={s.id} className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
                          <span className="text-foreground truncate">{s.name}</span>
                          <span className="text-[10px] opacity-60">
                            in:{s.fan_in} out:{s.fan_out} churn:{s.churn}
                          </span>
                        </div>
                      ))}
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
