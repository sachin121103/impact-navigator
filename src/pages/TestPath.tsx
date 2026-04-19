import { useMemo, useState } from "react";
import {
  Beaker,
  Copy,
  Loader2,
  Search,
  ShieldAlert,
  Skull,
  GitPullRequest,
  Sparkles,
} from "lucide-react";
import { SubPageShell } from "@/components/SubPageShell";
import { TestPathCanvas } from "@/components/TestPathCanvas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { SAMPLE_GRAPH, type GraphPayload } from "@/lib/sample-graph";
import {
  aggregatePlan,
  buildForwardAdjacency,
  buildReverseAdjacency,
  buildTestPlan,
  coverageMetrics,
  exportPlanJson,
  exportPlanShell,
  findCoveringTests,
  findDeadCode,
  type DeadEntry,
  formatTime,
  indexNodes,
  isTestNode,
  nodesForFiles,
  proposeTests,
  type TestPlan,
  type TestProposal,
} from "@/lib/testpath";

const TestPath = () => {
  const [data, setData] = useState<GraphPayload>(SAMPLE_GRAPH);
  const [repoInput, setRepoInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState("plan");

  // Plan state
  const [modifiedId, setModifiedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  // PR mode
  const [prFiles, setPrFiles] = useState("");

  // Indexes (memo per data identity).
  const ctx = useMemo(
    () => ({
      nodesById: indexNodes(data.nodes),
      reverseAdj: buildReverseAdjacency(data.edges),
    }),
    [data],
  );

  const codeNodes = useMemo(
    () => data.nodes.filter((n) => !isTestNode(n)),
    [data],
  );

  const filteredNodes = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return codeNodes.slice(0, 50);
    return codeNodes
      .filter(
        (n) =>
          n.name.toLowerCase().includes(q) ||
          n.file.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [codeNodes, search]);

  const plan: TestPlan | null = useMemo(() => {
    if (!modifiedId) return null;
    return buildTestPlan(modifiedId, data, ctx);
  }, [modifiedId, data, ctx]);

  const coveringIds = useMemo(() => {
    if (!modifiedId) return new Set<string>();
    const tests = findCoveringTests(modifiedId, ctx.nodesById, ctx.reverseAdj);
    return new Set(tests.keys());
  }, [modifiedId, ctx]);

  const coverage = useMemo(() => coverageMetrics(data), [data]);
  const untestedSet = useMemo(
    () => new Set(coverage.untestedNodeIds),
    [coverage],
  );
  const dead = useMemo(() => findDeadCode(data), [data]);

  const prPlan = useMemo(() => {
    const files = prFiles
      .split(/[\n,]+/)
      .map((f) => f.trim())
      .filter(Boolean);
    if (!files.length) return null;
    const ids = nodesForFiles(files, data);
    if (!ids.length) return null;
    return aggregatePlan(ids, data);
  }, [prFiles, data]);

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
      const json = (await r.json()) as GraphPayload & { error?: string };
      if (!r.ok || json.error) throw new Error(json.error ?? `${r.status}`);
      setData({ nodes: json.nodes, edges: json.edges });
      setModifiedId(null);
      toast.success(`Loaded ${json.nodes.length} symbols`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  return (
    <SubPageShell
      eyebrow="02 · testpath"
      title="TestPath."
      tagline="Run only what matters."
      description="Pick a symbol you're about to change. TestPath walks the dependency graph backwards to find every test that exercises a path to it — then ranks them by distance, so you get a runnable plan instead of the full suite."
      visual={
        <div className="grid h-full w-full place-items-center">
          <div className="aspect-square w-[min(82vmin,720px)]">
            <TestPathCanvas
              data={data}
              selectedId={modifiedId}
              coveringTestIds={coveringIds}
              untestedIds={untestedSet}
              onSelect={(id) => setModifiedId(id)}
            />
          </div>
        </div>
      }
      legend={
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-foreground">●</span> code
          <span className="text-border">·</span>
          <span className="text-accent">■</span> test
          <span className="text-border">·</span>
          <span className="text-accent">○</span> covering
          <span className="text-border">·</span>
          <span className="text-destructive">◌</span> untested
        </span>
      }
      panel={
        <div className="rounded-lg border border-border/60 bg-card/80 p-4 shadow-paper backdrop-blur">
          {/* Repo loader */}
          <div className="mb-4 flex items-center gap-2">
            <Input
              value={repoInput}
              onChange={(e) => setRepoInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadRepo()}
              placeholder="github.com/owner/repo"
              className="h-8 font-mono text-xs"
            />
            <Button size="sm" variant="ink" onClick={loadRepo} disabled={loading}>
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Load"}
            </Button>
          </div>
          {error && (
            <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 font-mono text-[11px] text-destructive">
              {error}
            </p>
          )}

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="plan" className="text-[11px]">
                <Sparkles className="mr-1 h-3 w-3" /> Plan
              </TabsTrigger>
              <TabsTrigger value="coverage" className="text-[11px]">
                <ShieldAlert className="mr-1 h-3 w-3" /> Cover
              </TabsTrigger>
              <TabsTrigger value="dead" className="text-[11px]">
                <Skull className="mr-1 h-3 w-3" /> Dead
              </TabsTrigger>
              <TabsTrigger value="pr" className="text-[11px]">
                <GitPullRequest className="mr-1 h-3 w-3" /> PR
              </TabsTrigger>
            </TabsList>

            {/* ── PLAN ── Pick a symbol you're about to change → see only the tests that exercise it. */}
            <TabsContent value="plan" className="mt-4 space-y-3">
              {!modifiedId && (
                <p className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Smart test selection.</span> Pick the symbol you're about to change. We'll walk the graph backwards from it and list every test that reaches it — so you can run only those instead of the full suite.
                </p>
              )}
              <div className="relative">
                <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="search symbols (function, class, file)…"
                  className="h-8 pl-7 font-mono text-xs"
                />
              </div>
              {!modifiedId && (
                <ul className="max-h-[180px] space-y-1 overflow-auto rounded-md border border-border/60 p-1">
                  {filteredNodes.length === 0 && (
                    <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                      no matches
                    </li>
                  )}
                  {filteredNodes.map((n) => (
                    <li key={n.id}>
                      <button
                        onClick={() => setModifiedId(n.id)}
                        className="flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs hover:bg-secondary"
                      >
                        <span className="truncate">{n.name}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                          {n.type}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {plan && (
                <PlanResult
                  plan={plan}
                  modifiedLabel={ctx.nodesById.get(modifiedId!)?.name ?? modifiedId!}
                  onClear={() => setModifiedId(null)}
                  onCopyJson={() => copy(exportPlanJson(plan), "JSON plan")}
                  onCopyShell={() => copy(exportPlanShell(plan), "Shell command")}
                />
              )}
            </TabsContent>

            {/* ── COVERAGE ── How much of the code has any test reaching it? */}
            <TabsContent value="coverage" className="mt-4 space-y-3">
              <p className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Test coverage map.</span> The percentage of code symbols that have at least one test reaching them through the dependency graph. Click any untested symbol to see what it would take to test it.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="covered" value={`${coverage.coveragePercent}%`} tone="accent" />
                <Stat label="of nodes" value={coverage.codeNodeCount} />
                <Stat label="untested" value={coverage.untestedNodeIds.length} tone={coverage.untestedNodeIds.length ? "destructive" : undefined} />
              </div>
              <div className="space-y-1">
                <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Untested symbols · click to inspect
                </p>
                <ul className="max-h-[260px] space-y-1 overflow-auto rounded-md border border-border/60 p-1.5">
                  {coverage.untestedNodeIds.slice(0, 12).map((id) => {
                    const n = ctx.nodesById.get(id);
                    if (!n) return null;
                    return (
                      <li
                        key={id}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1 text-xs hover:bg-secondary cursor-pointer"
                        onClick={() => { setModifiedId(id); setTab("plan"); }}
                      >
                        <span className="truncate">{n.name}</span>
                        <span className="truncate font-mono text-[10px] text-muted-foreground">
                          {n.file}
                        </span>
                      </li>
                    );
                  })}
                  {coverage.untestedNodeIds.length === 0 && (
                    <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                      everything is covered ✨
                    </li>
                  )}
                </ul>
              </div>
            </TabsContent>

            {/* ── DEAD CODE ── Symbols nothing else uses. */}
            <TabsContent value="dead" className="mt-4 space-y-3">
              <p className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Dead code.</span> Symbols nothing else points to: functions or classes with no callers outside their file, files that nobody imports, and tests that don't exercise anything.
              </p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="dead" value={dead.length} tone={dead.length ? "destructive" : undefined} />
                <Stat label="files" value={dead.filter((d) => d.reason === "no importers").length} />
                <Stat label="symbols" value={dead.filter((d) => d.reason === "no callers").length} />
              </div>
              <ul className="max-h-[260px] space-y-1 overflow-auto rounded-md border border-border/60 p-1.5">
                {dead.map((d) => (
                  <li key={d.node.id} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded px-2 py-1.5 text-xs">
                    <div className="min-w-0">
                      <p className="truncate">{d.node.name}</p>
                      <p className="truncate font-mono text-[10px] text-muted-foreground">{d.node.file}</p>
                    </div>
                    <Badge variant="secondary" className="shrink-0 font-mono text-[9px]">
                      {d.reason}
                    </Badge>
                  </li>
                ))}
                {dead.length === 0 && (
                  <li className="px-2 py-3 text-center text-xs text-muted-foreground">
                    nothing dead — clean graph ✨
                  </li>
                )}
              </ul>
            </TabsContent>

            {/* ── PR MODE ── */}
            <TabsContent value="pr" className="mt-4 space-y-3">
              <p className="rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">PR mode.</span> Paste the list of files changed in a pull request (one per line). TestPath aggregates the union of all tests reaching any of them — perfect for CI hooks that should only run what the PR actually affects.
              </p>
              <Textarea
                value={prFiles}
                onChange={(e) => setPrFiles(e.target.value)}
                rows={5}
                placeholder={"src/parser.py\nsrc/meta.py"}
                className="font-mono text-xs"
              />
              {prPlan && (
                <PlanResult
                  plan={prPlan}
                  modifiedLabel={`${prPlan.tests.length ? prFiles.split(/\n/).filter(Boolean).length : 0} files`}
                  onClear={() => setPrFiles("")}
                  onCopyJson={() => copy(exportPlanJson(prPlan), "JSON plan")}
                  onCopyShell={() => copy(exportPlanShell(prPlan), "Shell command")}
                />
              )}
            </TabsContent>
          </Tabs>
        </div>
      }
    />
  );
};

// ─── Sub-components ────────────────────────────────────────────────────────────
const PlanResult = ({
  plan,
  modifiedLabel,
  onClear,
  onCopyJson,
  onCopyShell,
}: {
  plan: TestPlan;
  modifiedLabel: string;
  onClear: () => void;
  onCopyJson: () => void;
  onCopyShell: () => void;
}) => {
  const groups = useMemo(() => {
    const g: Record<"high" | "medium" | "low", typeof plan.tests> = {
      high: [], medium: [], low: [],
    };
    for (const t of plan.tests) g[t.priority].push(t);
    return g;
  }, [plan]);

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-background/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-widest text-accent">target</p>
          <p className="truncate font-display text-sm font-semibold">{modifiedLabel}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={onClear} className="h-7 px-2 text-[11px]">
          clear
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="tests" value={plan.summary.total_tests} tone="accent" />
        <Stat label="time" value={formatTime(plan.summary.total_time_s)} />
        <Stat label="saved" value={`${plan.summary.time_saved_percent}%`} tone="accent" />
      </div>

      <p className="font-mono text-[10px] text-muted-foreground">
        {plan.summary.total_tests} of {plan.summary.full_suite_tests} tests · ~{formatTime(plan.summary.total_time_s)} vs full suite {formatTime(plan.summary.full_suite_time_s)}
      </p>

      <div className="space-y-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-accent transition-all"
            style={{
              width: `${plan.summary.full_suite_time_s ? (plan.summary.total_time_s / plan.summary.full_suite_time_s) * 100 : 0}%`,
            }}
          />
        </div>
      </div>

      {plan.tests.length === 0 ? (
        <p className="rounded border border-dashed border-border/60 px-3 py-4 text-center text-xs text-muted-foreground">
          No tests reach this target.
        </p>
      ) : (
        <div className="max-h-[260px] space-y-2 overflow-auto">
          {(["high", "medium", "low"] as const).map((p) =>
            groups[p].length === 0 ? null : (
              <div key={p}>
                <div className="mb-1 flex items-center gap-2 px-1">
                  <Beaker className="h-3 w-3 text-accent" />
                  <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                    {p} priority · {groups[p].length}
                  </span>
                </div>
                <ul className="space-y-1">
                  {groups[p].map((t) => (
                    <li
                      key={t.id}
                      className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded border border-border/40 bg-background/50 px-2 py-1.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs">{t.function || "(file)"}</p>
                        <p className="truncate font-mono text-[10px] text-muted-foreground">
                          {t.file}
                        </p>
                      </div>
                      <Badge variant="secondary" className="font-mono text-[9px]">
                        d{t.distance}
                      </Badge>
                      <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                        {t.estimated_time}s
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onCopyJson} disabled={!plan.tests.length}>
          <Copy className="h-3 w-3" /> JSON
        </Button>
        <Button size="sm" variant="outline" className="flex-1 gap-1.5" onClick={onCopyShell} disabled={!plan.tests.length}>
          <Copy className="h-3 w-3" /> Shell
        </Button>
      </div>
    </div>
  );
};

const Stat = ({
  label, value, tone,
}: {
  label: string;
  value: string | number;
  tone?: "destructive" | "accent";
}) => (
  <div className="rounded-md border border-border/60 bg-background/50 px-2 py-2">
    <p className={`font-display text-base font-semibold tabular-nums ${tone === "destructive" ? "text-destructive" : tone === "accent" ? "text-accent" : ""}`}>
      {value}
    </p>
    <p className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
      {label}
    </p>
  </div>
);

export default TestPath;
