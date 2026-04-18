import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Compass, FileCode, Folder, GitCommit, Loader2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeGraphCanvas } from "@/components/CodeGraphCanvas";
import { SAMPLE_GRAPH, type GraphPayload } from "@/lib/sample-graph";

const CodeGraph = () => {
  const [data, setData] = useState<GraphPayload>(SAMPLE_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ owner: string; name: string; branch: string; file_count: number } | null>(null);
  const [hasLoadedRepo, setHasLoadedRepo] = useState(false);

  const stats = useMemo(() => {
    const files = data.nodes.filter((n) => n.type === "file").length;
    const fns = data.nodes.filter((n) => n.type === "function").length;
    const cls = data.nodes.filter((n) => n.type === "class").length;
    const edges = data.edges.length;
    return { files, fns, cls, edges };
  }, [data]);

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
    <div className="fixed inset-0 overflow-hidden texture-paper">
      {/* Full-bleed canvas */}
      <div className={isEmpty ? "absolute inset-0 opacity-30" : "absolute inset-0"}>
        <CodeGraphCanvas
          data={data}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>

      {/* Floating top bar */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-5 py-4">
        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-4 py-2 shadow-paper backdrop-blur">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="relative grid h-6 w-6 place-items-center rounded-full border border-foreground/30">
              <Compass className="h-3 w-3 text-accent" strokeWidth={2.2} />
            </div>
            <span className="font-display text-sm font-semibold tracking-tight">
              Meridian<span className="text-accent">.</span>
            </span>
          </Link>
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            / code graph
          </span>
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {!isEmpty && (
            <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 shadow-paper backdrop-blur">
              <Search className="h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="owner/repo"
                className="h-7 w-[220px] border-0 bg-transparent p-0 font-mono text-xs shadow-none focus-visible:ring-0"
                onKeyDown={(e) => e.key === "Enter" && loadRepo()}
              />
              <Button size="sm" variant="ink" onClick={loadRepo} disabled={loading} className="h-7 rounded-full px-3 text-xs">
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : "Map"}
              </Button>
            </div>
          )}
          <Button variant="ghost" size="sm" asChild className="rounded-full bg-card/70 backdrop-blur">
            <Link to="/" className="gap-1.5">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </Link>
          </Button>
        </div>
      </header>

      {/* Stats pill */}
      {!isEmpty && (
        <div className="pointer-events-auto absolute right-5 top-[68px] z-10 rounded-full border border-border/60 bg-card/70 px-4 py-1.5 font-mono text-[10px] tracking-wider text-muted-foreground shadow-paper backdrop-blur">
          {meta && (
            <span className="text-foreground/80">
              {meta.owner}/{meta.name}
              <span className="mx-2 text-border">·</span>
            </span>
          )}
          <span>{stats.files} files</span>
          <span className="mx-2 text-border">·</span>
          <span>{stats.cls} classes</span>
          <span className="mx-2 text-border">·</span>
          <span>{stats.fns} fns</span>
          <span className="mx-2 text-border">·</span>
          <span>{stats.edges} edges</span>
        </div>
      )}

      {/* Empty state */}
      {isEmpty && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6">
          <div className="pointer-events-auto w-full max-w-xl text-center">
            <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-full border border-foreground/20 bg-card/70 shadow-paper backdrop-blur">
              <Compass className="h-5 w-5 text-accent" strokeWidth={2} />
            </div>
            <h1 className="mb-2 font-display text-3xl font-semibold tracking-tight">
              Map a repository
            </h1>
            <p className="mb-7 text-sm text-muted-foreground">
              Visualise files, classes and call graphs as a living constellation.
            </p>
            <div className="mx-auto flex items-center gap-2 rounded-full border border-border/60 bg-card/80 p-1.5 pl-4 shadow-paper backdrop-blur">
              <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
              <Input
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                placeholder="github.com/owner/repo  or  owner/repo"
                className="h-9 flex-1 border-0 bg-transparent p-0 font-mono text-sm shadow-none focus-visible:ring-0"
                onKeyDown={(e) => e.key === "Enter" && loadRepo()}
                autoFocus
              />
              <Button size="sm" variant="ink" onClick={loadRepo} disabled={loading} className="h-9 rounded-full px-4">
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Map repo"}
              </Button>
            </div>
            <button
              onClick={() => setHasLoadedRepo(true)}
              className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition hover:text-foreground"
            >
              or explore the sample →
            </button>
            {error && (
              <p className="mt-4 font-mono text-xs text-risk-high">⚠ {error}</p>
            )}
          </div>
        </div>
      )}

      {!isEmpty && error && (
        <div className="pointer-events-auto absolute left-1/2 top-[68px] z-10 -translate-x-1/2 rounded-full border border-risk-high/40 bg-card/80 px-4 py-1.5 font-mono text-xs text-risk-high shadow-paper backdrop-blur">
          ⚠ {error}
        </div>
      )}

      {/* Selection drawer */}
      {selected && (
        <aside className="pointer-events-auto absolute right-4 top-20 bottom-4 z-20 flex w-[360px] animate-slide-in-right flex-col rounded-lg border border-border/60 bg-card/90 shadow-paper backdrop-blur">
          <div className="flex items-start justify-between border-b border-border/60 px-5 py-4">
            <div className="min-w-0 flex-1">
              <div className="mb-2 flex items-center gap-2">
                <NodeTypeIcon type={selected.type} />
                <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {selected.type}
                </span>
              </div>
              <h3 className="break-words font-display text-lg font-semibold leading-tight">
                {selected.name}
              </h3>
              <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">
                {selected.file}
              </p>
            </div>
            <button
              onClick={() => setSelectedId(null)}
              className="ml-2 grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">
            {selected.type === "file" && (
              <div className="mb-5 grid grid-cols-2 gap-3 rounded-md border border-border/60 bg-background/40 p-3 text-xs">
                <MetaField label="LOC" value={selected.loc ?? "—"} />
                <MetaField label="Churn (90d)" value={selected.churn_score ?? 0} />
                <div className="col-span-2 flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <GitCommit className="h-3 w-3" />
                  last commit · {selected.last_commit ?? "—"}
                </div>
              </div>
            )}

            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              connections · {neighbors.length}
            </p>
            <ul className="space-y-1">
              {neighbors.map((nb, i) => (
                <li key={i}>
                  <button
                    onClick={() => setSelectedId(nb.node.id)}
                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
                  >
                    <span className="font-mono text-accent">{nb.dir}</span>
                    <span className="flex-1 truncate font-mono">{nb.node.name}</span>
                    <span className="font-mono text-[9px] uppercase text-muted-foreground">
                      {nb.type}
                    </span>
                  </button>
                </li>
              ))}
              {neighbors.length === 0 && (
                <li className="px-2 py-1 font-mono text-xs text-muted-foreground">
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
    <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
      {label}
    </div>
    <div className="font-display text-base font-semibold">{value}</div>
  </div>
);

const NodeTypeIcon = ({ type }: { type: "file" | "function" | "class" }) => {
  const cls = "h-4 w-4 text-accent";
  if (type === "file") return <FileCode className={cls} />;
  if (type === "class") return <Folder className={cls} />;
  return <Compass className={cls} />;
};

export default CodeGraph;
