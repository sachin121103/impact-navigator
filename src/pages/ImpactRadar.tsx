import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { SubPageShell } from "@/components/SubPageShell";
import { ImpactInput } from "@/components/ImpactInput";
import { RadarVisual } from "@/components/RadarVisual";
import { ImpactRadarVisual, type Affected } from "@/components/ImpactRadarVisual";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface AnalyzeResult {
  repo: { id: string; owner: string; name: string };
  target: {
    id: string;
    name: string;
    qualified_name: string;
    file_path: string;
    line_number: number;
    kind: string;
  };
  affected: (Affected & {
    file_path: string;
    line_number: number;
    qualified_name: string;
    kind: string;
  })[];
  summary: { high: number; med: number; low: number; total: number; depthMax: number };
  duration_ms: number;
}

const REPO_KEY = "meridian:lastRepo";

const ImpactRadar = () => {
  const [repoUrl, setRepoUrl] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    const last = localStorage.getItem(REPO_KEY);
    if (last) setRepoUrl(last);
  }, []);

  const runAnalyze = async () => {
    if (!query.trim() || !repoUrl.trim()) {
      setError("Repository and function name are required.");
      return;
    }
    setLoading(true);
    setError(null);
    setSelectedId(null);
    localStorage.setItem(REPO_KEY, repoUrl);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("impact-analyze", {
        body: { repoUrl, query },
      });
      if (fnErr) throw new Error(fnErr.message);
      if ((data as any)?.error) throw new Error((data as any).error);
      setResult(data as AnalyzeResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analysis failed.");
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <SubPageShell
      eyebrow="03 · impact radar"
      title="Impact Radar."
      tagline="What will I break?"
      description="Type a function name from an indexed repo. Impact Radar walks the call graph upstream and ranks every dependent symbol by risk."
      visual={
        <div className="relative grid h-full w-full place-items-center">
          <div className="w-[min(82vmin,780px)]">
            {result ? (
              <ImpactRadarVisual
                targetName={result.target.name}
                affected={result.affected}
                selectedId={selectedId}
                onSelect={setSelectedId}
                depthMax={Math.max(1, result.summary.depthMax)}
              />
            ) : (
              <div className={loading ? "opacity-40 transition-opacity" : ""}>
                <RadarVisual />
              </div>
            )}
          </div>
          {loading && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 rounded-full border border-border/60 bg-card/80 px-4 py-1.5 font-mono text-xs text-muted-foreground shadow-paper backdrop-blur">
              <Loader2 className="mr-2 inline h-3 w-3 animate-spin" />
              Analyzing impact…
            </div>
          )}
        </div>
      }
      legend={
        result ? (
          <span className="flex items-center gap-3">
            <span className="text-risk-high">●</span> {result.summary.high} will break
            <span className="text-border">·</span>
            <span className="text-risk-med">●</span> {result.summary.med} review
            <span className="text-border">·</span>
            <span className="text-risk-low">●</span> {result.summary.low} safe
          </span>
        ) : (
          <span className="flex items-center gap-3">
            <span className="text-risk-high">●</span> high
            <span className="text-border">·</span>
            <span className="text-risk-med">●</span> medium
            <span className="text-border">·</span>
            <span className="text-risk-low">●</span> low
          </span>
        )
      }
      panel={
        <div>
          <div className="mb-3">
            <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              repo
            </label>
            <Input
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="github.com/owner/repo"
              className="h-9 border-border bg-card font-mono text-xs"
            />
          </div>

          <ImpactInput value={query} onChange={setQuery} onSubmit={runAnalyze} loading={loading} />

          {error && (
            <p className="mt-3 font-mono text-xs text-risk-high">
              ⚠ {error}{" "}
              {error.toLowerCase().includes("not indexed") && (
                <Link to="/code-graph" className="underline underline-offset-2">
                  Index it →
                </Link>
              )}
            </p>
          )}

          {!result && !loading && !error && (
            <p className="mt-3 px-1 font-mono text-[11px] text-muted-foreground">
              Tip: index a repo on{" "}
              <Link to="/code-graph" className="text-accent underline underline-offset-2">
                Code Graph
              </Link>{" "}
              first, then come back and try a function name.
            </p>
          )}

          {result && (
            <div className="mt-6">
              <div className="mb-3 flex items-baseline justify-between">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  impacted · {result.summary.total}
                </p>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {result.duration_ms}ms
                </span>
              </div>
              <div className="max-h-[42vh] overflow-y-auto rounded-md border border-border/60 bg-card/60 backdrop-blur">
                {result.affected.length === 0 && (
                  <p className="px-4 py-6 text-center font-mono text-xs text-muted-foreground">
                    Nothing depends on <span className="text-foreground">{result.target.name}</span>. Safe to change.
                  </p>
                )}
                <ul className="divide-y divide-border/60">
                  {result.affected.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => setSelectedId(a.id === selectedId ? null : a.id)}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-secondary/60 ${
                          selectedId === a.id ? "bg-secondary/80" : ""
                        }`}
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${
                            a.bucket === "high"
                              ? "bg-risk-high"
                              : a.bucket === "med"
                                ? "bg-risk-med"
                                : "bg-risk-low"
                          }`}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline gap-2">
                            <span className="truncate font-mono text-xs font-medium text-foreground">
                              {a.name}
                            </span>
                            <span className="font-mono text-[9px] uppercase text-muted-foreground">
                              {a.kind}
                            </span>
                          </div>
                          <div className="truncate font-mono text-[10px] text-muted-foreground">
                            {a.file_path}:{a.line_number}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
                            d{a.depth}
                          </span>
                          <div className="h-1 w-12 overflow-hidden rounded-full bg-secondary">
                            <div
                              className={`h-full ${
                                a.bucket === "high"
                                  ? "bg-risk-high"
                                  : a.bucket === "med"
                                    ? "bg-risk-med"
                                    : "bg-risk-low"
                              }`}
                              style={{ width: `${Math.min(100, a.risk * 100)}%` }}
                            />
                          </div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      }
    />
  );
};

export default ImpactRadar;
