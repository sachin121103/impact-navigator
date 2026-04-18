import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Compass, FileCode, Folder, GitCommit, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CodeGraphCanvas } from "@/components/CodeGraphCanvas";
import { SAMPLE_GRAPH, type GraphPayload } from "@/lib/sample-graph";

const CodeGraph = () => {
  const [data, setData] = useState<GraphPayload>(SAMPLE_GRAPH);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repoInput, setRepoInput] = useState("");
  const [backend, setBackend] = useState(
    () => localStorage.getItem("meridian.backend") ?? "http://localhost:8000",
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stats = useMemo(() => {
    const files = data.nodes.filter((n) => n.type === "file").length;
    const fns = data.nodes.filter((n) => n.type === "function").length;
    const cls = data.nodes.filter((n) => n.type === "class").length;
    const imports = data.edges.filter((e) => e.type === "imports").length;
    const calls = data.edges.filter((e) => e.type === "calls").length;
    return { files, fns, cls, imports, calls };
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
      localStorage.setItem("meridian.backend", backend);
      const url = `${backend.replace(/\/$/, "")}/graph/meta?repo=${encodeURIComponent(repoInput)}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
      const json = (await res.json()) as GraphPayload;
      setData(json);
      setSelectedId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen texture-paper">
      {/* Nav */}
      <header className="relative z-10 mx-auto flex max-w-[1600px] items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="relative grid h-7 w-7 place-items-center rounded-full border border-foreground/30">
            <Compass className="h-3.5 w-3.5 text-accent" strokeWidth={2.2} />
          </div>
          <span className="font-display text-lg font-semibold tracking-tight">
            Meridian<span className="text-accent">.</span>
          </span>
          <span className="ml-3 font-mono text-xs text-muted-foreground">
            / code graph
          </span>
        </Link>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/" className="gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Link>
        </Button>
      </header>

      {/* Toolbar */}
      <div className="mx-auto max-w-[1600px] px-6 pb-4">
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card/60 p-3 shadow-paper backdrop-blur md:flex-row md:items-center">
          <div className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              placeholder="github.com/psf/requests  or  /local/path/to/repo"
              className="h-9 w-[360px] font-mono text-xs"
              onKeyDown={(e) => e.key === "Enter" && loadRepo()}
            />
            <Button size="sm" variant="ink" onClick={loadRepo} disabled={loading}>
              {loading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "Map repo"
              )}
            </Button>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground md:ml-auto">
            <span className="font-mono">backend:</span>
            <Input
              value={backend}
              onChange={(e) => setBackend(e.target.value)}
              className="h-8 w-[220px] font-mono text-xs"
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setData(SAMPLE_GRAPH);
                setSelectedId(null);
                setError(null);
              }}
            >
              Use sample
            </Button>
          </div>
        </div>
        {error && (
          <p className="mt-2 font-mono text-xs text-risk-high">⚠ {error}</p>
        )}
      </div>

      {/* Main: canvas + sidebar */}
      <div className="mx-auto grid max-w-[1600px] gap-4 px-6 pb-10 lg:grid-cols-[1fr_340px]">
        {/* Canvas */}
        <div className="relative h-[72vh] overflow-hidden rounded-lg border border-border bg-card shadow-paper">
          <CodeGraphCanvas
            data={data}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
        </div>

        {/* Sidebar */}
        <aside className="flex flex-col gap-4">
          {/* Stats */}
          <div className="rounded-lg border border-border bg-card p-5 shadow-paper">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-accent">
              · overview
            </p>
            <div className="grid grid-cols-2 gap-y-3 text-sm">
              <Stat n={stats.files} label="files" />
              <Stat n={stats.cls} label="classes" />
              <Stat n={stats.fns} label="functions" />
              <Stat n={stats.imports + stats.calls} label="edges" />
              <Stat n={stats.imports} label="imports" small />
              <Stat n={stats.calls} label="calls" small />
            </div>
          </div>

          {/* Detail */}
          <div className="flex-1 rounded-lg border border-border bg-card p-5 shadow-paper">
            <p className="mb-4 font-mono text-[10px] uppercase tracking-widest text-accent">
              · selection
            </p>
            {!selected ? (
              <div className="flex h-full min-h-[200px] flex-col items-center justify-center text-center">
                <div className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-secondary text-muted-foreground">
                  <FileCode className="h-4 w-4" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Click a node to inspect its file, type and connections.
                </p>
              </div>
            ) : (
              <div>
                <div className="mb-3 flex items-center gap-2">
                  <NodeTypeIcon type={selected.type} />
                  <span className="rounded bg-secondary px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {selected.type}
                  </span>
                </div>
                <h3 className="mb-1 break-words font-display text-xl font-semibold leading-tight">
                  {selected.name}
                </h3>
                <p className="mb-4 break-all font-mono text-xs text-muted-foreground">
                  {selected.file}
                </p>

                {selected.type === "file" && (
                  <div className="mb-5 grid grid-cols-2 gap-3 rounded-md border border-border/70 bg-background/60 p-3 text-xs">
                    <MetaField label="LOC" value={selected.loc ?? "—"} />
                    <MetaField
                      label="Churn (90d)"
                      value={selected.churn_score ?? 0}
                    />
                    <div className="col-span-2 flex items-center gap-1.5 font-mono text-muted-foreground">
                      <GitCommit className="h-3 w-3" />
                      last commit · {selected.last_commit ?? "—"}
                    </div>
                  </div>
                )}

                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  connections · {neighbors.length}
                </p>
                <ul className="max-h-[240px] space-y-1 overflow-y-auto pr-1">
                  {neighbors.map((nb, i) => (
                    <li key={i}>
                      <button
                        onClick={() => setSelectedId(nb.node.id)}
                        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs hover:bg-secondary"
                      >
                        <span className="font-mono text-accent">{nb.dir}</span>
                        <span className="flex-1 truncate font-mono">
                          {nb.node.name}
                        </span>
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
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};

const Stat = ({ n, label, small }: { n: number; label: string; small?: boolean }) => (
  <div className="flex items-baseline gap-2">
    <span
      className={
        small
          ? "font-display text-base font-semibold text-muted-foreground"
          : "font-display text-2xl font-semibold tracking-tight"
      }
    >
      {n.toLocaleString()}
    </span>
    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {label}
    </span>
  </div>
);

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
