import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  Code2,
  Compass,
  FileCode,
  GitCommit,
  Loader2,
  Search,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { CodeGraphCanvas, type AnalysisMode } from "@/components/CodeGraphCanvas";
import { SAMPLE_GRAPH, type GraphPayload } from "@/lib/sample-graph";
import {
  applyAbstraction,
  moduleKey,
  moduleNodeId,
  type AbstractionLevel,
} from "@/lib/graph-layers";
import {
  computeAllMetrics,
  topN,
  type GraphMetrics,
} from "@/lib/graph-metrics";
import type { WorkerResponse } from "@/lib/metrics.worker";
import { supabase } from "@/integrations/supabase/client";

// ─── Shared styles ────────────────────────────────────────────────────────────
const GLASS: React.CSSProperties = {
  background: "rgba(252,249,244,0.88)",
  borderColor: "rgba(160,138,110,0.28)",
  backdropFilter: "blur(14px)",
};
const T = {
  ink: "hsl(25,18%,14%)",
  muted: "hsl(25,10%,42%)",
  accent: "hsl(184,68%,34%)",
  border: "rgba(160,138,110,0.22)",
  dim: "hsl(25,10%,58%)",
  green: "hsl(142,38%,38%)",
  amber: "hsl(32,88%,50%)",
  red: "hsl(6,70%,48%)",
};

// ─── Analysis mode config ─────────────────────────────────────────────────────
const MODES: { id: AnalysisMode; label: string }[] = [
  { id: "none",        label: "Structure" },
  { id: "pagerank",    label: "Influence" },
  { id: "betweenness", label: "Bottleneck Risk" },
];

// ─── Health stat thresholds ───────────────────────────────────────────────────
function diameterStatus(d: number): "good" | "warn" | "bad" {
  return d <= 7 ? "good" : d <= 10 ? "warn" : "bad";
}
function pathStatus(p: number): "good" | "warn" | "bad" {
  return p <= 4 ? "good" : p <= 6 ? "warn" : "bad";
}
function densityStatus(d: number): "good" | "warn" | "bad" {
  return d >= 0.08 && d <= 0.35 ? "good" : d >= 0.05 && d <= 0.50 ? "warn" : "bad";
}
function componentStatus(c: number): "good" | "warn" | "bad" {
  return c === 1 ? "good" : c <= 2 ? "warn" : "bad";
}
const STATUS_ICON = { good: "✓", warn: "△", bad: "⚠" } as const;
const STATUS_COLOR = { good: T.green, warn: T.amber, bad: T.red } as const;

function healthDots(score: number) {
  const filled = score >= 80 ? 5 : score >= 65 ? 4 : score >= 50 ? 3 : score >= 35 ? 2 : 1;
  const color = score >= 80 ? T.green : score >= 50 ? T.amber : T.red;
  return { filled, color };
}

// ─── Component ────────────────────────────────────────────────────────────────
const CodeGraph = () => {
  const [data, setData] = useState<GraphPayload>(SAMPLE_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [showTokenField, setShowTokenField] = useState(false);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    owner: string;
    name: string;
    branch: string;
    file_count: number;
    parsed_file_count?: number;
    candidate_file_count?: number;
    skipped_extensions?: Record<string, number>;
  } | null>(null);
  const [hasLoadedRepo, setHasLoadedRepo] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>("none");
  const [abstractionLevel, setAbstractionLevel] = useState<AbstractionLevel>("module");
  // focusStack[0] = module key (e.g. "src/api"), focusStack[1] = file id
  const [focusStack, setFocusStack] = useState<string[]>([]);
  // Remembers the user's last manually chosen level so search auto-jumping back works.
  const lastManualLevelRef = useRef<AbstractionLevel>("module");

  // Heavy metrics computed off the main thread via Web Worker.
  // Falls back to inline compute if Worker unavailable (e.g. SSR).
  const [metrics, setMetrics] = useState<GraphMetrics>(() =>
    computeAllMetrics(SAMPLE_GRAPH.nodes, SAMPLE_GRAPH.edges),
  );
  const [metricsLoading, setMetricsLoading] = useState(false);
  const workerRef = useRef<Worker | null>(null);
  const reqIdRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const reqId = ++reqIdRef.current;

    // Spin up worker lazily.
    if (!workerRef.current) {
      try {
        workerRef.current = new Worker(
          new URL("@/lib/metrics.worker.ts", import.meta.url),
          { type: "module" },
        );
      } catch {
        workerRef.current = null;
      }
    }
    const w = workerRef.current;
    if (!w) {
      // Fallback: synchronous compute.
      setMetrics(computeAllMetrics(data.nodes, data.edges));
      return;
    }

    setMetricsLoading(true);
    const onMessage = (ev: MessageEvent<WorkerResponse>) => {
      if (cancelled || ev.data.id !== reqId) return;
      const r = ev.data;
      setMetrics({
        pagerank: new Map(r.pagerank),
        pagerankPercentile: new Map(r.pagerankPercentile),
        betweenness: new Map(r.betweenness),
        clustering: new Map(r.clustering),
        stats: r.stats,
        cycles: {
          cyclicNodeIds: new Set(r.cycles.cyclicNodeIds),
          cycles: r.cycles.cycles,
        },
        orphans: { orphanIds: new Set(r.orphans.orphanIds) },
      });
      setMetricsLoading(false);
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id: reqId, nodes: data.nodes, edges: data.edges });

    return () => {
      cancelled = true;
      w.removeEventListener("message", onMessage);
    };
  }, [data]);

  useEffect(() => () => workerRef.current?.terminate(), []);

  const stats = useMemo(() => ({
    files: data.nodes.filter((n) => n.type === "file").length,
    fns: data.nodes.filter((n) => n.type === "function").length,
    cls: data.nodes.filter((n) => n.type === "class").length,
    edges: data.edges.length,
  }), [data]);

  const selected = useMemo(
    () => data.nodes.find((n) => n.id === selectedId) ?? null,
    [data, selectedId],
  );

  const neighbors = useMemo(() => {
    if (!selectedId) return [];
    const out: { dir: "→" | "←"; node: typeof data.nodes[number]; type: string }[] = [];
    for (const e of data.edges) {
      if (e.source === selectedId) {
        const n = data.nodes.find((x) => x.id === e.target);
        if (n) out.push({ dir: "→", node: n, type: e.type });
      } else if (e.target === selectedId) {
        const n = data.nodes.find((x) => x.id === e.source);
        if (n) out.push({ dir: "←", node: n, type: e.type });
      }
    }
    return out;
  }, [data, selectedId]);

  const loadRepo = async () => {
    if (!repoInput.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("Please sign in again.");

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/graph-meta?repo=${encodeURIComponent(repoInput)}`;
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const json = (await r.json()) as GraphPayload & {
        _meta?: {
          owner: string;
          name: string;
          branch: string;
          file_count: number;
          parsed_file_count?: number;
          candidate_file_count?: number;
          skipped_extensions?: Record<string, number>;
        };
        error?: string;
      };
      if (!r.ok || json.error) throw new Error(json.error ?? `${r.status}`);
      setData({ nodes: json.nodes, edges: json.edges });
      setMeta(json._meta ?? null);
      setSelectedId(null);
      setHasLoadedRepo(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const isEmpty = !hasLoadedRepo;

  // Precompute top lists for health panel
  const topBetweenness = useMemo(() => topN(metrics.betweenness, 3), [metrics]);
  const topPagerank    = useMemo(() => topN(metrics.pagerank, 3), [metrics]);

  const { filled: healthFilled, color: healthColor } = healthDots(metrics.stats.healthScore);

  return (
    <div className="relative h-screen w-full overflow-hidden texture-paper">
      {/* Canvas */}
      <div className={isEmpty ? "absolute inset-0 opacity-30" : "absolute inset-0"}>
        <CodeGraphCanvas
          data={data}
          selectedId={selectedId}
          onSelect={setSelectedId}
          search={search}
          metrics={metrics}
          analysisMode={analysisMode}
        />
      </div>

      {/* ── Top bar ── */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 shadow-paper" style={GLASS}>
          <Link to="/" className="flex items-center gap-2.5">
            <div className="relative grid h-6 w-6 place-items-center rounded-full border"
              style={{ borderColor: "rgba(160,138,110,0.3)" }}>
              <Compass className="h-3 w-3" style={{ color: T.accent }} strokeWidth={2.2} />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight" style={{ color: T.ink }}>
              Meridian<span style={{ color: T.accent }}>.</span>
            </span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: T.muted }}>
            / code graph
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {!isEmpty && (
            <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-paper" style={GLASS}>
              <Search className="h-3.5 w-3.5 shrink-0" style={{ color: T.muted }} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="search nodes…"
                className="w-36 bg-transparent border-0 outline-none font-mono text-xs"
                style={{ color: T.ink, caretColor: T.accent }}
              />
              {search && (
                <button onClick={() => setSearch("")} style={{ color: T.muted }}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          )}
          {!isEmpty && (
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-paper" style={GLASS}>
                <input
                  value={repoInput}
                  onChange={(e) => setRepoInput(e.target.value)}
                  placeholder="owner/repo"
                  className="w-44 bg-transparent border-0 outline-none font-mono text-xs"
                  style={{ color: T.ink, caretColor: T.accent }}
                  onKeyDown={(e) => e.key === "Enter" && loadRepo()}
                />
                <button
                  onClick={() => setShowTokenField((v) => !v)}
                  className="font-mono text-[10px] transition-colors"
                  style={{ color: showTokenField ? T.accent : T.muted }}
                  title="Add a GitHub token for private repos"
                >
                  🔒
                </button>
                <button
                  onClick={loadRepo} disabled={loading}
                  className="flex items-center gap-1 rounded-full px-3 py-1 font-mono text-[11px] transition-colors disabled:opacity-50"
                  style={{ background: "rgba(45,170,160,0.1)", color: T.accent, border: `1px solid rgba(45,170,160,0.3)` }}
                >
                  {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Map"}
                </button>
              </div>
              {showTokenField && (
                <div className="flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-paper" style={GLASS}>
                  <input
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_… (used once, never stored)"
                    className="w-64 bg-transparent border-0 outline-none font-mono text-xs"
                    style={{ color: T.ink, caretColor: T.accent }}
                    onKeyDown={(e) => e.key === "Enter" && loadRepo()}
                  />
                </div>
              )}
            </div>
          )}
          <Link to="/" className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs shadow-paper transition-colors"
            style={{ ...GLASS, color: T.muted }}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </div>
      </header>

      {/* ── Analysis mode toggle ── */}
      {!isEmpty && (
        <div className="pointer-events-auto absolute left-1/2 top-[68px] z-20 -translate-x-1/2 flex items-center gap-1 rounded-full border p-1 shadow-paper" style={GLASS}>
          {MODES.map((m) => {
            const active = analysisMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setAnalysisMode(m.id)}
                className="rounded-full px-3 py-1 font-mono text-[10px] transition-all"
                style={{
                  background: active ? "rgba(45,170,160,0.12)" : "transparent",
                  color: active ? T.accent : T.muted,
                  border: active ? `1px solid rgba(45,170,160,0.35)` : "1px solid transparent",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Stats pill ── */}
      {!isEmpty && (
        <div className="pointer-events-none absolute right-5 top-[68px] z-10 rounded-full border px-4 py-1.5 font-mono text-[10px] tracking-wider shadow-paper"
          style={{ ...GLASS, color: T.muted }}>
          {meta && (
            <span style={{ color: T.ink }}>
              {meta.owner}/{meta.name}
              <span className="mx-2" style={{ color: T.border }}>·</span>
            </span>
          )}
          <span>{stats.files} files</span>
          <span className="mx-2" style={{ color: T.border }}>·</span>
          <span>{stats.cls} classes</span>
          <span className="mx-2" style={{ color: T.border }}>·</span>
          <span>{stats.fns} fns</span>
          <span className="mx-2" style={{ color: T.border }}>·</span>
          <span>{stats.edges} edges</span>
        </div>
      )}

      {/* ── Architecture Health panel ── */}
      {!isEmpty && analysisMode !== "none" && (
        <aside
          className="pointer-events-auto absolute right-4 z-20 rounded-2xl border shadow-lift"
          style={{
            ...GLASS,
            top: selected ? undefined : "5rem",
            bottom: selected ? "1rem" : undefined,
            width: 272,
            // when drawer is open, sit below it; otherwise anchor from top
            ...(selected ? { top: "auto" } : {}),
          }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${T.border}` }}>
            <span className="font-display text-sm font-semibold" style={{ color: T.ink }}>
              Architecture Health
            </span>
            <div className="flex items-center gap-0.5">
              {Array.from({ length: 5 }).map((_, i) => (
                <span
                  key={i}
                  className="h-2 w-2 rounded-full"
                  style={{ background: i < healthFilled ? healthColor : "rgba(160,138,110,0.25)" }}
                />
              ))}
              <span className="ml-1.5 font-mono text-[11px] font-semibold" style={{ color: healthColor }}>
                {metrics.stats.healthScore}
              </span>
            </div>
          </div>

          {/* Stat rows */}
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
            {[
              { label: "Diameter", value: `${metrics.stats.diameter} hops`, status: diameterStatus(metrics.stats.diameter) },
              { label: "Avg path", value: `${metrics.stats.avgPathLength} hops`, status: pathStatus(metrics.stats.avgPathLength) },
              { label: "Density", value: `${(metrics.stats.density * 100).toFixed(1)}%`, status: densityStatus(metrics.stats.density) },
              { label: "Components", value: String(metrics.stats.components), status: componentStatus(metrics.stats.components) },
            ].map((row) => (
              <div key={row.label} className="flex items-center justify-between py-1 font-mono text-[11px]">
                <span style={{ color: T.muted }}>{row.label}</span>
                <div className="flex items-center gap-2">
                  <span style={{ color: T.ink }}>{row.value}</span>
                  <span className="w-4 text-center" style={{ color: STATUS_COLOR[row.status] }}>
                    {STATUS_ICON[row.status]}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Top bottlenecks */}
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${T.border}` }}>
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: T.dim }}>
              Top bottlenecks
            </p>
            {topBetweenness.map(([id, score]) => {
              const label = score > 0.5 ? "Critical" : score > 0.25 ? "Review" : "Fine";
              const labelColor = score > 0.5 ? T.red : score > 0.25 ? T.amber : T.green;
              return (
                <button
                  key={id}
                  onClick={() => setSelectedId(id)}
                  className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 transition-colors hover:bg-secondary"
                >
                  <span className="truncate font-mono text-[10px]" style={{ color: T.ink, maxWidth: 140 }}>
                    {id.split("/").pop()}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono text-[10px]" style={{ color: T.dim }}>
                      {score.toFixed(2)}
                    </span>
                    <span className="font-mono text-[9px]" style={{ color: labelColor }}>{label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Most influential */}
          <div className="px-4 py-3" style={{ borderBottom: metrics.cycles.cycles.length > 0 || metrics.orphans.orphanIds.size > 0 ? `1px solid ${T.border}` : undefined }}>
            <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest" style={{ color: T.dim }}>
              Most influential (PageRank)
            </p>
            {topPagerank.map(([id, score]) => (
              <button
                key={id}
                onClick={() => setSelectedId(id)}
                className="flex w-full items-center justify-between rounded-lg px-1.5 py-1 transition-colors hover:bg-secondary"
              >
                <span className="truncate font-mono text-[10px]" style={{ color: T.ink, maxWidth: 160 }}>
                  {id.split("/").pop()}
                </span>
                <span className="font-mono text-[10px] shrink-0" style={{ color: T.dim }}>
                  {score.toFixed(3)}
                </span>
              </button>
            ))}
          </div>

          {/* Circular dependencies */}
          {metrics.cycles.cycles.length > 0 && (
            <div className="px-4 py-3" style={{ borderBottom: metrics.orphans.orphanIds.size > 0 ? `1px solid ${T.border}` : undefined }}>
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: T.red }}>
                <span>⟳</span> Circular deps · {metrics.cycles.cycles.length}
              </p>
              {metrics.cycles.cycles.slice(0, 3).map((cycle, i) => (
                <div key={i} className="py-0.5 font-mono text-[10px] flex flex-wrap items-center gap-0.5">
                  {cycle.map((id, j) => (
                    <span key={id} className="flex items-center gap-0.5">
                      <button
                        onClick={() => setSelectedId(id)}
                        className="hover:underline"
                        style={{ color: T.red }}
                      >
                        {id.split("/").pop()}
                      </button>
                      {j < cycle.length - 1 && (
                        <span style={{ color: T.dim }}>→</span>
                      )}
                    </span>
                  ))}
                  <span style={{ color: T.red }}>↺</span>
                </div>
              ))}
            </div>
          )}

          {/* Orphan nodes */}
          {metrics.orphans.orphanIds.size > 0 && (
            <div className="px-4 py-3">
              <p className="mb-1.5 font-mono text-[9px] uppercase tracking-widest flex items-center gap-1.5" style={{ color: T.muted }}>
                <span>○</span> Unreachable · {metrics.orphans.orphanIds.size}
              </p>
              {[...metrics.orphans.orphanIds].slice(0, 4).map((id) => (
                <button
                  key={id}
                  onClick={() => setSelectedId(id)}
                  className="flex w-full items-center gap-2 rounded-lg px-1.5 py-1 transition-colors hover:bg-secondary"
                >
                  <span className="font-mono text-[10px]" style={{ color: T.dim }}>○</span>
                  <span className="truncate font-mono text-[10px]" style={{ color: T.muted }}>
                    {id.split("/").pop()}
                  </span>
                </button>
              ))}
              {metrics.orphans.orphanIds.size > 4 && (
                <p className="px-1.5 pt-1 font-mono text-[9px]" style={{ color: T.dim }}>
                  +{metrics.orphans.orphanIds.size - 4} more
                </p>
              )}
            </div>
          )}
        </aside>
      )}

      {/* ── Empty state ── */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
          <div className="pointer-events-auto w-full max-w-xl text-center">
            <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full border shadow-paper"
              style={{ borderColor: "rgba(160,138,110,0.28)", background: "rgba(252,249,244,0.7)" }}>
              <Compass className="h-5 w-5" style={{ color: T.accent }} strokeWidth={2} />
            </div>
            <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight" style={{ color: T.ink }}>
              Map a repository
            </h1>
            <p className="mb-7 text-sm" style={{ color: T.muted }}>
              Visualise files, classes and call graphs as a living constellation.
            </p>
            <div className="mx-auto flex items-center gap-2 rounded-full border p-1.5 pl-4 shadow-paper" style={GLASS}>
              <Search className="h-4 w-4 shrink-0" style={{ color: T.muted }} />
              <Input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="github.com/owner/repo  or  owner/repo"
                className="h-9 flex-1 border-0 bg-transparent p-0 font-mono text-sm shadow-none focus-visible:ring-0"
                style={{ color: T.ink, caretColor: T.accent }}
                onKeyDown={(e) => e.key === "Enter" && loadRepo()}
                autoFocus
              />
              <button
                onClick={loadRepo} disabled={loading}
                className="h-9 rounded-full px-4 font-mono text-sm transition-colors disabled:opacity-50"
                style={{ background: "rgba(45,170,160,0.12)", color: T.accent, border: "1px solid rgba(45,170,160,0.32)" }}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Map repo"}
              </button>
            </div>
            <p className="mt-2.5 font-mono text-[10px] tracking-wide" style={{ color: T.dim }}>
              Supports Python · JS / TS · C / C++ · Java · Go · Rust · C#
            </p>
            <button
              onClick={() => setHasLoadedRepo(true)}
              className="mt-4 font-mono text-[11px] uppercase tracking-widest transition-colors"
              style={{ color: T.dim }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.ink)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.dim)}
            >
              or explore the sample →
            </button>
            {error && <p className="mt-4 font-mono text-xs" style={{ color: T.red }}>⚠ {error}</p>}
          </div>
        </div>
      )}

      {!isEmpty && error && (
        <div className="pointer-events-auto absolute left-1/2 top-[68px] z-10 -translate-x-1/2 rounded-full border px-4 py-1.5 font-mono text-xs shadow-paper"
          style={{ ...GLASS, color: T.red, borderColor: "rgba(200,60,50,0.3)" }}>
          ⚠ {error}
        </div>
      )}

      {/* ── Low-coverage banner: most of the repo wasn't parseable ── */}
      {!isEmpty && !error && meta && (meta.parsed_file_count ?? meta.file_count) < 3 && (
        <div className="pointer-events-auto absolute left-1/2 top-[110px] z-10 -translate-x-1/2 max-w-xl rounded-2xl border px-4 py-2.5 shadow-paper"
          style={{ ...GLASS, borderColor: "rgba(217,153,32,0.4)" }}>
          <div className="flex items-start gap-2.5">
            <span className="font-mono text-sm leading-none mt-0.5" style={{ color: T.amber }}>△</span>
            <div className="min-w-0">
              <p className="font-mono text-[11px] leading-snug" style={{ color: T.ink }}>
                Only <span style={{ color: T.amber, fontWeight: 600 }}>{meta.parsed_file_count ?? meta.file_count}</span> source file{(meta.parsed_file_count ?? meta.file_count) === 1 ? "" : "s"} recognised in this repo.
              </p>
              <p className="mt-1 font-mono text-[10px]" style={{ color: T.muted }}>
                Meridian currently parses Python, JS / TS, C / C++, Java, Go, Rust, and C#.
                {meta.skipped_extensions && Object.keys(meta.skipped_extensions).length > 0 && (
                  <>
                    {" "}Skipped:{" "}
                    {Object.entries(meta.skipped_extensions)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 4)
                      .map(([ext, n]) => `${n}× ${ext}`)
                      .join(", ")}.
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Selection drawer ── */}
      {selected && (
        <aside
          className="pointer-events-auto absolute right-4 top-20 bottom-4 z-20 flex w-80 animate-slide-in-right flex-col rounded-2xl border shadow-lift overflow-hidden"
          style={GLASS}
        >
          {/* Header */}
          <div className="flex items-start justify-between px-5 py-4 shrink-0"
            style={{ borderBottom: `1px solid ${T.border}` }}>
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <NodeTypeIcon type={selected.type} />
                <span className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                  style={{ borderColor: T.border, color: T.muted }}>
                  {selected.type}
                </span>
              </div>
              <h3 className="break-words font-display text-lg font-semibold leading-tight" style={{ color: T.ink }}>
                {selected.name}
              </h3>
              <p className="mt-1 break-all font-mono text-[11px]" style={{ color: T.muted }}>{selected.file}</p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-secondary"
              style={{ color: T.muted }} aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {/* File stats */}
            {selected.type === "file" && (
              <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl border p-3 text-xs"
                style={{ borderColor: T.border, background: "rgba(160,138,110,0.06)" }}>
                <MetaField label="LOC" value={selected.loc ?? "—"} />
                <MetaField label="Churn 90d" value={selected.churn_score ?? 0} />
                <div className="col-span-2 flex items-center gap-1.5 font-mono text-[10px]" style={{ color: T.muted }}>
                  <GitCommit className="h-3 w-3" />
                  last commit · {selected.last_commit ?? "—"}
                </div>
              </div>
            )}

            {/* Structural anomalies for selected node */}
            {(metrics.cycles.cyclicNodeIds.has(selected.id) || metrics.orphans.orphanIds.has(selected.id)) && (
              <div className="mb-4 rounded-xl border p-3"
                style={{ borderColor: metrics.cycles.cyclicNodeIds.has(selected.id) ? `${T.red}50` : T.border,
                  background: metrics.cycles.cyclicNodeIds.has(selected.id) ? `${T.red}08` : "rgba(160,138,110,0.06)" }}>
                {metrics.cycles.cyclicNodeIds.has(selected.id) && (
                  <div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: T.red }}>
                    <span>⟳</span>
                    <span>Part of a circular dependency</span>
                  </div>
                )}
                {metrics.orphans.orphanIds.has(selected.id) && (
                  <div className="flex items-center gap-2 font-mono text-[10px]" style={{ color: T.muted }}>
                    <span>○</span>
                    <span>No incoming references — possible dead code</span>
                  </div>
                )}
              </div>
            )}

            {/* Graph metrics for selected node */}
            {analysisMode !== "none" && (
              <div className="mb-4 rounded-xl border p-3"
                style={{ borderColor: T.border, background: "rgba(160,138,110,0.06)" }}>
                <p className="mb-2 font-mono text-[9px] uppercase tracking-widest" style={{ color: T.dim }}>
                  Graph metrics
                </p>
                <NodeMetricRow
                  label="PageRank"
                  value={(metrics.pagerank.get(selected.id) ?? 0).toFixed(4)}
                  tag={`top ${Math.round((1 - (metrics.pagerankPercentile.get(selected.id) ?? 0)) * 100)}%`}
                  tagColor={T.accent}
                />
                <NodeMetricRow
                  label="Betweenness"
                  value={(metrics.betweenness.get(selected.id) ?? 0).toFixed(3)}
                  tag={
                    (metrics.betweenness.get(selected.id) ?? 0) > 0.5 ? "Critical"
                      : (metrics.betweenness.get(selected.id) ?? 0) > 0.25 ? "Review"
                        : "Fine"
                  }
                  tagColor={
                    (metrics.betweenness.get(selected.id) ?? 0) > 0.5 ? T.red
                      : (metrics.betweenness.get(selected.id) ?? 0) > 0.25 ? T.amber
                        : T.green
                  }
                />
                <NodeMetricRow
                  label="Clustering"
                  value={(metrics.clustering.get(selected.id) ?? 0).toFixed(3)}
                  tag={
                    (metrics.clustering.get(selected.id) ?? 0) >= 0.6 ? "High"
                      : (metrics.clustering.get(selected.id) ?? 0) >= 0.3 ? "Medium"
                        : "Low"
                  }
                  tagColor={T.muted}
                />
              </div>
            )}

            {/* Connections */}
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest" style={{ color: T.muted }}>
              connections · {neighbors.length}
            </p>
            <ul className="space-y-0.5">
              {neighbors.map((nb, i) => (
                <li key={i}>
                  <button
                    onClick={() => setSelectedId(nb.node.id)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs transition-colors hover:bg-secondary"
                    style={{ color: T.ink }}
                  >
                    <span className="font-mono text-sm" style={{ color: T.accent }}>{nb.dir}</span>
                    <span className="flex-1 truncate font-mono text-[11px]">{nb.node.name}</span>
                    <span className="rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase"
                      style={{ borderColor: T.border, color: T.muted }}>
                      {nb.type}
                    </span>
                  </button>
                </li>
              ))}
              {neighbors.length === 0 && (
                <li className="px-2 py-2 font-mono text-xs" style={{ color: T.muted }}>No connections.</li>
              )}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

const MetaField = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="font-mono text-[9px] uppercase tracking-wider mb-0.5" style={{ color: T.muted }}>{label}</div>
    <div className="font-display text-base font-semibold" style={{ color: T.ink }}>{value}</div>
  </div>
);

const NodeMetricRow = ({ label, value, tag, tagColor }: {
  label: string; value: string; tag: string; tagColor: string;
}) => (
  <div className="flex items-center justify-between py-1 font-mono text-[10px]">
    <span style={{ color: T.muted }}>{label}</span>
    <div className="flex items-center gap-2">
      <span style={{ color: T.ink }}>{value}</span>
      <span className="rounded-full border px-1.5 py-0.5 text-[9px]"
        style={{ borderColor: `${tagColor}40`, color: tagColor, background: `${tagColor}10` }}>
        {tag}
      </span>
    </div>
  </div>
);

const NodeTypeIcon = ({ type }: { type: "file" | "function" | "class" }) => {
  if (type === "file") return <FileCode className="h-4 w-4" style={{ color: "hsl(184,68%,34%)" }} />;
  if (type === "class") return <Compass className="h-4 w-4" style={{ color: "hsl(32,82%,44%)" }} />;
  return <Code2 className="h-4 w-4" style={{ color: "hsl(220,38%,44%)" }} />;
};

export default CodeGraph;
