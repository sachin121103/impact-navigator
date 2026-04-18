import { useMemo, useState } from "react";
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
import { CodeGraphCanvas } from "@/components/CodeGraphCanvas";
import { SAMPLE_GRAPH, type GraphPayload } from "@/lib/sample-graph";

// Warm glass — paper design system
const GLASS: React.CSSProperties = {
  background: "rgba(252,249,244,0.82)",
  borderColor: "rgba(160,138,110,0.28)",
  backdropFilter: "blur(14px)",
};

const T = {
  ink: "hsl(25,18%,14%)",
  muted: "hsl(25,10%,42%)",
  accent: "hsl(184,68%,34%)",
  border: "rgba(160,138,110,0.22)",
  dim: "hsl(25,10%,58%)",
};

const CodeGraph = () => {
  const [data, setData] = useState<GraphPayload>(SAMPLE_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    owner: string; name: string; branch: string; file_count: number;
  } | null>(null);
  const [hasLoadedRepo, setHasLoadedRepo] = useState(false);

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
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/graph-meta?repo=${encodeURIComponent(repoInput)}`;
      const r = await fetch(url, {
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const json = (await r.json()) as GraphPayload & {
        _meta?: { owner: string; name: string; branch: string; file_count: number };
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

  return (
    <div className="relative h-screen w-full overflow-hidden texture-paper">
      {/* Full-bleed canvas */}
      <div className={isEmpty ? "absolute inset-0 opacity-30" : "absolute inset-0"}>
        <CodeGraphCanvas
          data={data}
          selectedId={selectedId}
          onSelect={setSelectedId}
          search={search}
        />
      </div>

      {/* Top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4">
        {/* Brand */}
        <div
          className="pointer-events-auto flex items-center gap-3 rounded-full border px-4 py-2 shadow-paper"
          style={GLASS}
        >
          <Link to="/" className="flex items-center gap-2.5">
            <div
              className="relative grid h-6 w-6 place-items-center rounded-full border"
              style={{ borderColor: "rgba(160,138,110,0.3)" }}
            >
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

        {/* Right controls */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Node search */}
          {!isEmpty && (
            <div
              className="flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-paper"
              style={GLASS}
            >
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

          {/* Repo input */}
          {!isEmpty && (
            <div
              className="flex items-center gap-2 rounded-full border px-3 py-1.5 shadow-paper"
              style={GLASS}
            >
              <input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="owner/repo"
                className="w-44 bg-transparent border-0 outline-none font-mono text-xs"
                style={{ color: T.ink, caretColor: T.accent }}
                onKeyDown={(e) => e.key === "Enter" && loadRepo()}
              />
              <button
                onClick={loadRepo}
                disabled={loading}
                className="flex items-center gap-1 rounded-full px-3 py-1 font-mono text-[11px] transition-colors disabled:opacity-50"
                style={{
                  background: "hsl(184,68%,34%,0.1)",
                  color: T.accent,
                  border: `1px solid hsl(184,68%,34%,0.3)`,
                }}
              >
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Map"}
              </button>
            </div>
          )}

          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs shadow-paper transition-colors"
            style={{ ...GLASS, color: T.muted }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
        </div>
      </header>

      {/* Stats pill */}
      {!isEmpty && (
        <div
          className="pointer-events-none absolute right-5 top-[68px] z-10 rounded-full border px-4 py-1.5 font-mono text-[10px] tracking-wider shadow-paper"
          style={{ ...GLASS, color: T.muted }}
        >
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

      {/* Empty state */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
          <div className="pointer-events-auto w-full max-w-xl text-center">
            <div
              className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full border shadow-paper"
              style={{ borderColor: "rgba(160,138,110,0.28)", background: "rgba(252,249,244,0.7)" }}
            >
              <Compass className="h-5 w-5" style={{ color: T.accent }} strokeWidth={2} />
            </div>
            <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight" style={{ color: T.ink }}>
              Map a repository
            </h1>
            <p className="mb-7 text-sm" style={{ color: T.muted }}>
              Visualise files, classes and call graphs as a living constellation.
            </p>
            <div
              className="mx-auto flex items-center gap-2 rounded-full border p-1.5 pl-4 shadow-paper"
              style={GLASS}
            >
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
                onClick={loadRepo}
                disabled={loading}
                className="h-9 rounded-full px-4 font-mono text-sm transition-colors disabled:opacity-50"
                style={{
                  background: "hsl(184,68%,34%,0.12)",
                  color: T.accent,
                  border: "1px solid hsl(184,68%,34%,0.32)",
                }}
              >
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Map repo"}
              </button>
            </div>
            <button
              onClick={() => setHasLoadedRepo(true)}
              className="mt-4 font-mono text-[11px] uppercase tracking-widest transition-colors"
              style={{ color: T.dim }}
              onMouseEnter={(e) => (e.currentTarget.style.color = T.ink)}
              onMouseLeave={(e) => (e.currentTarget.style.color = T.dim)}
            >
              or explore the sample →
            </button>
            {error && (
              <p className="mt-4 font-mono text-xs" style={{ color: "hsl(6,70%,48%)" }}>
                ⚠ {error}
              </p>
            )}
          </div>
        </div>
      )}

      {!isEmpty && error && (
        <div
          className="pointer-events-auto absolute left-1/2 top-[68px] z-10 -translate-x-1/2 rounded-full border px-4 py-1.5 font-mono text-xs shadow-paper"
          style={{ ...GLASS, color: "hsl(6,70%,48%)", borderColor: "hsl(6,70%,48%,0.3)" }}
        >
          ⚠ {error}
        </div>
      )}

      {/* Selection drawer */}
      {selected && (
        <aside
          className="pointer-events-auto absolute right-4 top-20 bottom-4 z-20 flex w-80 animate-slide-in-right flex-col rounded-2xl border shadow-lift"
          style={GLASS}
        >
          <div
            className="flex items-start justify-between px-5 py-4"
            style={{ borderBottom: `1px solid ${T.border}` }}
          >
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <NodeTypeIcon type={selected.type} />
                <span
                  className="rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
                  style={{ borderColor: T.border, color: T.muted }}
                >
                  {selected.type}
                </span>
              </div>
              <h3 className="break-words font-display text-lg font-semibold leading-tight"
                style={{ color: T.ink }}>
                {selected.name}
              </h3>
              <p className="mt-1 break-all font-mono text-[11px]" style={{ color: T.muted }}>
                {selected.file}
              </p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors hover:bg-secondary"
              style={{ color: T.muted }}
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {selected.type === "file" && (
              <div
                className="mb-5 grid grid-cols-2 gap-3 rounded-xl border p-3 text-xs"
                style={{ borderColor: T.border, background: "rgba(160,138,110,0.06)" }}
              >
                <MetaField label="LOC" value={selected.loc ?? "—"} />
                <MetaField label="Churn 90d" value={selected.churn_score ?? 0} />
                <div className="col-span-2 flex items-center gap-1.5 font-mono text-[10px]"
                  style={{ color: T.muted }}>
                  <GitCommit className="h-3 w-3" />
                  last commit · {selected.last_commit ?? "—"}
                </div>
              </div>
            )}

            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest"
              style={{ color: T.muted }}>
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
                    <span
                      className="rounded-full border px-1.5 py-0.5 font-mono text-[9px] uppercase"
                      style={{ borderColor: T.border, color: T.muted }}
                    >
                      {nb.type}
                    </span>
                  </button>
                </li>
              ))}
              {neighbors.length === 0 && (
                <li className="px-2 py-2 font-mono text-xs" style={{ color: T.muted }}>
                  No connections.
                </li>
              )}
            </ul>
          </div>
        </aside>
      )}
    </div>
  );
};

const MetaField = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <div className="font-mono text-[9px] uppercase tracking-wider mb-0.5"
      style={{ color: T.muted }}>{label}</div>
    <div className="font-display text-base font-semibold"
      style={{ color: T.ink }}>{value}</div>
  </div>
);

const NodeTypeIcon = ({ type }: { type: "file" | "function" | "class" }) => {
  if (type === "file") return <FileCode className="h-4 w-4" style={{ color: "hsl(184,68%,34%)" }} />;
  if (type === "class") return <Compass className="h-4 w-4" style={{ color: "hsl(32,82%,44%)" }} />;
  return <Code2 className="h-4 w-4" style={{ color: "hsl(220,38%,44%)" }} />;
};

export default CodeGraph;
