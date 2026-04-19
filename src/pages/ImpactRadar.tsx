import { useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { SubPageShell } from "@/components/SubPageShell";
import { ImpactInput } from "@/components/ImpactInput";
import { RadarVisual } from "@/components/RadarVisual";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Suggestion {
  id: string;
  why: string;
  fix: string;
}

type SuggestState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; map: Record<string, Suggestion> };

type RiskLevel = "high" | "medium" | "low";

interface AffectedSymbol {
  id: string;
  qualified_name: string;
  name: string;
  kind: string;
  file_path: string;
  line_number: number;
  fan_in: number;
  fan_out: number;
  churn: number;
  risk: RiskLevel;
  depth: number;
}

interface RunResult {
  runId: string | null;
  resolvedSymbol: { qualified_name: string; name: string; kind: string };
  affected: AffectedSymbol[];
  summary: { high: number; medium: number; low: number; total: number };
  durationMs: number;
}

type RadarState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "result"; data: RunResult };

type RepoStatus =
  | { state: "empty" }
  | { state: "invalid" }
  | { state: "checking" }
  | { state: "not-found" }
  | { state: "indexing" }
  | { state: "ready"; symbolCount: number; edgeCount: number; language?: string | null }
  | { state: "failed"; message: string };

const parseOwnerRepo = (url: string): { owner: string; repo: string } | null => {
  const m = url.trim().replace(/\.git$/i, "").replace(/\/+$/, "")
    .match(/^https?:\/\/github\.com\/([^/\s]+)\/([^/\s]+)$/);
  return m ? { owner: m[1], repo: m[2] } : null;
};

const fetchRepoLanguage = async (url: string): Promise<string | null> => {
  const parts = parseOwnerRepo(url);
  if (!parts) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${parts.owner}/${parts.repo}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j?.language as string) ?? null;
  } catch {
    return null;
  }
};

const RISK_CLASS: Record<RiskLevel, string> = {
  high: "text-risk-high",
  medium: "text-risk-med",
  low: "text-risk-low",
};

const isGitHubUrl = (url: string) => {
  const cleaned = url.trim().replace(/\.git$/i, "").replace(/\/+$/, "");
  return /^https?:\/\/github\.com\/[^/\s]+\/[^/\s]+$/.test(cleaned);
};

const ImpactRadar = () => {
  const [repoUrl, setRepoUrl] = useState<string>(
    () => localStorage.getItem("impact-radar-repo") ?? "",
  );
  const [repoStatus, setRepoStatus] = useState<RepoStatus>({ state: "empty" });
  const [isIndexing, setIsIndexing] = useState(false);
  const [radarState, setRadarState] = useState<RadarState>({ status: "idle" });
  const [suggestState, setSuggestState] = useState<SuggestState>({ status: "idle" });
  const [lastPrompt, setLastPrompt] = useState<string>("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    localStorage.setItem("impact-radar-repo", repoUrl);
    setRadarState({ status: "idle" });

    if (!repoUrl.trim()) { setRepoStatus({ state: "empty" }); return; }
    if (!isGitHubUrl(repoUrl)) { setRepoStatus({ state: "invalid" }); return; }

    setRepoStatus({ state: "checking" });
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const q = supabase
        .from("repos")
        .select("status, status_message, symbol_count, edge_count")
        .eq("url", repoUrl.trim());
      const { data } = user ? await q.eq("owner_id", user.id).maybeSingle() : await q.maybeSingle();

      if (!data) {
        setRepoStatus({ state: "not-found" });
      } else if ((data as any).status === "ready") {
        const language = await fetchRepoLanguage(repoUrl.trim());
        setRepoStatus({
          state: "ready",
          symbolCount: (data as any).symbol_count,
          edgeCount: (data as any).edge_count,
          language,
        });
      } else if ((data as any).status === "indexing") {
        setRepoStatus({ state: "indexing" });
      } else if ((data as any).status === "failed") {
        setRepoStatus({ state: "failed", message: (data as any).status_message ?? "Indexing failed" });
      } else {
        setRepoStatus({ state: "not-found" });
      }
    }, 600);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [repoUrl]);

  const handleIndexRepo = async () => {
    setIsIndexing(true);
    setRepoStatus({ state: "indexing" });
    try {
      const { data, error } = await supabase.functions.invoke("index-repo", {
        body: { repoUrl: repoUrl.trim() },
      });
      if (error) throw new Error(error.message);
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Indexing failed");
      const language = await fetchRepoLanguage(repoUrl.trim());
      setRepoStatus({
        state: "ready",
        symbolCount: (data as any).symbols ?? 0,
        edgeCount: (data as any).edges ?? 0,
        language,
      });
    } catch (err) {
      setRepoStatus({ state: "failed", message: (err as Error).message });
    } finally {
      setIsIndexing(false);
    }
  };

  const handleRunRadar = async (prompt: string) => {
    if (repoStatus.state !== "ready") {
      setRadarState({
        status: "error",
        message:
          repoStatus.state === "not-found" || repoStatus.state === "failed"
            ? "Index the repo first using the button below."
            : "Enter a valid GitHub repo URL first.",
      });
      return;
    }
    setRadarState({ status: "loading" });
    setSuggestState({ status: "idle" });
    setLastPrompt(prompt);
    try {
      const { data, error } = await supabase.functions.invoke("run-radar", {
        body: { prompt, repoUrl: repoUrl.trim() },
      });
      if (error) throw new Error(error.message);
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Unknown error from run-radar");
      setRadarState({ status: "result", data: data as RunResult });
    } catch (err) {
      setRadarState({ status: "error", message: (err as Error).message });
    }
  };

  const handleExplain = async () => {
    if (radarState.status !== "result") return;
    const { resolvedSymbol, affected } = radarState.data;
    if (affected.length === 0) return;
    setSuggestState({ status: "loading" });
    try {
      const { data, error } = await supabase.functions.invoke("impact-suggest", {
        body: {
          prompt: lastPrompt,
          target: resolvedSymbol,
          affected: affected.slice(0, 8).map((a) => ({
            id: a.id,
            name: a.name,
            qualified_name: a.qualified_name,
            kind: a.kind,
            file_path: a.file_path,
            risk: a.risk,
            depth: a.depth,
          })),
        },
      });
      if (error) throw new Error(error.message);
      if (!(data as any)?.ok) throw new Error((data as any)?.error ?? "Failed to get suggestions");
      const suggestions: Suggestion[] = (data as any).suggestions ?? [];
      const map: Record<string, Suggestion> = {};
      for (const s of suggestions) map[s.id] = s;
      setSuggestState({ status: "ready", map });
    } catch (err) {
      setSuggestState({ status: "error", message: (err as Error).message });
    }
  };

  const affected = radarState.status === "result" ? radarState.data.affected : [];
  const summary = radarState.status === "result" ? radarState.data.summary : null;

  const visual = (
    <div className="relative">
      <RadarVisual results={affected.length > 0 ? affected : undefined} />
      <div className="pointer-events-none absolute -bottom-4 left-1/2 -translate-x-1/2 rounded-md border border-border bg-card px-4 py-2.5 font-mono text-xs shadow-paper whitespace-nowrap">
        {summary ? (
          <>
            <span className="text-risk-high">●</span> {summary.high} will break ·{" "}
            <span className="text-risk-med">●</span> {summary.medium} review ·{" "}
            <span className="text-risk-low">●</span> {summary.low} safe
          </>
        ) : radarState.status === "loading" ? (
          <span className="text-muted-foreground animate-pulse">scanning…</span>
        ) : (
          <span className="text-muted-foreground">enter a repo to begin</span>
        )}
      </div>
    </div>
  );

  const panel = (
    <div>
      {/* Step 1 — Repo URL */}
      <div className="mb-4 rounded-lg border border-border bg-card p-4 shadow-paper">
        {repoStatus.state === "ready" && repoStatus.language && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            <span className="font-mono text-[10px] uppercase tracking-widest text-accent">
              language · {repoStatus.language}
            </span>
          </div>
        )}
        <div className="mb-2 flex items-center justify-between">
          <label htmlFor="repo-url" className="font-mono text-[11px] uppercase tracking-widest text-accent">
            Step 1 · GitHub repository
          </label>
          <RepoStatusBadge status={repoStatus} />
        </div>
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">›</span>
          <input
            id="repo-url"
            value={repoUrl}
            onChange={(e) => setRepoUrl(e.target.value)}
            placeholder="https://github.com/owner/repo"
            spellCheck={false}
            className="flex-1 bg-transparent py-1.5 font-mono text-sm text-foreground outline-none placeholder:text-muted-foreground/50"
          />
          {(repoStatus.state === "not-found" || repoStatus.state === "failed") && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 shrink-0 px-2.5 font-mono text-xs"
              onClick={handleIndexRepo}
              disabled={isIndexing}
            >
              {isIndexing ? (
                <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Indexing…</>
              ) : (
                "Index repo"
              )}
            </Button>
          )}
        </div>
        {repoStatus.state === "invalid" && (
          <p className="mt-2 font-mono text-[11px] text-risk-high">
            expected format: https://github.com/owner/repo
          </p>
        )}
      </div>

      {/* Step 2 — Prompt */}
      <p className="mb-2 px-1 font-mono text-[11px] uppercase tracking-widest text-accent">
        Step 2 · describe a change
      </p>
      <ImpactInput
        onRunRadar={handleRunRadar}
        isLoading={radarState.status === "loading"}
      />

      {radarState.status === "idle" && (
        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
          <Stat
            value={repoStatus.state === "ready" ? String(repoStatus.symbolCount) : "—"}
            label="symbols indexed"
          />
          <Stat
            value={repoStatus.state === "ready" ? String(repoStatus.edgeCount) : "—"}
            label="call edges"
          />
        </div>
      )}

      {radarState.status === "loading" && (
        <div className="mt-8 text-sm text-muted-foreground font-mono animate-pulse">
          Traversing call graph…
        </div>
      )}

      {radarState.status === "error" && (
        <div className="mt-8 rounded-md border border-risk-high/30 bg-risk-high/5 px-4 py-3 text-sm">
          <span className="font-mono text-risk-high">error: </span>
          <span className="text-foreground">{radarState.message}</span>
        </div>
      )}

      {radarState.status === "result" && (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-mono text-muted-foreground">resolved:</span>
            <code className="rounded bg-secondary px-2 py-0.5 font-mono text-foreground">
              {radarState.data.resolvedSymbol.qualified_name}
            </code>
            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-muted-foreground">
              {radarState.data.resolvedSymbol.kind}
            </span>
          </div>

          <div className="rounded-md border border-border bg-card shadow-paper overflow-hidden">
            <div className="px-4 py-2 border-b border-border text-xs font-mono text-muted-foreground">
              {radarState.data.summary.total} affected symbols
            </div>
            <div className="max-h-52 overflow-y-auto divide-y divide-border">
              {affected.slice(0, 15).map((sym) => (
                <div key={sym.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                  <span className={`shrink-0 ${RISK_CLASS[sym.risk]}`}>●</span>
                  <span
                    className={`shrink-0 rounded border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${RISK_CLASS[sym.risk]} border-current/30`}
                  >
                    {sym.risk === "medium" ? "MED" : sym.risk.toUpperCase()}
                  </span>
                  <span className="font-mono text-foreground truncate">{sym.name}</span>
                  <span className="text-muted-foreground truncate flex-1 min-w-0">
                    {sym.file_path.split("/").slice(-2).join("/")}
                  </span>
                  <span className="shrink-0 font-mono text-muted-foreground">d{sym.depth}</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI Suggestions — breaking-change explanations */}
          <div className="rounded-md border border-border bg-card shadow-paper overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span className="text-xs font-mono uppercase tracking-widest text-accent">
                  Suggestions
                </span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  · why & how to fix
                </span>
              </div>
              {suggestState.status !== "ready" && (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2.5 font-mono text-xs"
                  onClick={handleExplain}
                  disabled={suggestState.status === "loading" || affected.length === 0}
                >
                  {suggestState.status === "loading" ? (
                    <><Loader2 className="mr-1 h-3 w-3 animate-spin" />Analyzing…</>
                  ) : (
                    <>Explain top {Math.min(8, affected.length)}</>
                  )}
                </Button>
              )}
            </div>

            {suggestState.status === "idle" && (
              <div className="px-4 py-3 text-xs font-mono text-muted-foreground">
                Get AI explanations of why each file might break and how to fix it.
              </div>
            )}
            {suggestState.status === "loading" && (
              <div className="px-4 py-3 text-xs font-mono text-muted-foreground animate-pulse">
                Reasoning about breaking changes…
              </div>
            )}
            {suggestState.status === "error" && (
              <div className="px-4 py-3 text-xs">
                <span className="font-mono text-risk-high">error: </span>
                <span className="text-foreground">{suggestState.message}</span>
              </div>
            )}
            {suggestState.status === "ready" && (
              <div className="max-h-72 overflow-y-auto divide-y divide-border">
                {affected.slice(0, 8).map((sym) => {
                  const sug = suggestState.map[sym.id];
                  if (!sug) return null;
                  return (
                    <div key={sym.id} className="px-4 py-3 space-y-1.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className={`${RISK_CLASS[sym.risk]}`}>●</span>
                        <span className="font-mono text-foreground truncate">{sym.name}</span>
                        <span className="text-muted-foreground truncate text-[11px]">
                          {sym.file_path.split("/").slice(-2).join("/")}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-risk-high mr-1.5">why</span>
                        {sug.why}
                      </p>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-risk-low mr-1.5">fix</span>
                        {sug.fix}
                      </p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-8 gap-y-3 text-sm text-muted-foreground">
            <Stat value={String(radarState.data.summary.total)} label="affected" />
            <Stat value={`${radarState.data.durationMs}ms`} label="radar time" />
            <button
              onClick={() => {
                setRadarState({ status: "idle" });
                setSuggestState({ status: "idle" });
              }}
              className="font-mono text-xs underline underline-offset-2 hover:text-foreground transition-colors"
            >
              reset
            </button>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <SubPageShell
      eyebrow="03 · impact radar"
      title="Impact Radar."
      tagline="What will I break?"
      description="Describe a change in plain English. Impact Radar maps every downstream dependency, ranks them by risk, and tells you exactly which files will break."
      visual={visual}
      panel={panel}
    />
  );
};

const RepoStatusBadge = ({ status }: { status: RepoStatus }) => {
  if (status.state === "empty") return null;
  if (status.state === "invalid") {
    return <span className="font-mono text-xs text-risk-high">● invalid URL</span>;
  }
  if (status.state === "checking") {
    return (
      <span className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> checking…
      </span>
    );
  }
  if (status.state === "indexing") {
    return (
      <span className="flex items-center gap-1 font-mono text-xs text-risk-med">
        <Loader2 className="h-3 w-3 animate-spin" /> indexing…
      </span>
    );
  }
  if (status.state === "ready") {
    return (
      <span className="font-mono text-xs text-risk-low">
        ● ready · {status.symbolCount} symbols
      </span>
    );
  }
  if (status.state === "not-found") {
    return <span className="font-mono text-xs text-muted-foreground">● not indexed</span>;
  }
  if (status.state === "failed") {
    return <span className="font-mono text-xs text-risk-high">● index failed</span>;
  }
  return null;
};

const Stat = ({ value, label }: { value: string; label: string }) => (
  <div className="flex items-baseline gap-2">
    <span className="font-display text-2xl font-semibold tracking-tight text-foreground">
      {value}
    </span>
    <span className="font-mono text-xs uppercase tracking-wider">{label}</span>
  </div>
);

export default ImpactRadar;
