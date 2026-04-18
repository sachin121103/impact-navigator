import { useMemo, useState } from "react";
import { Radar, FlaskConical, Copy, AlertTriangle } from "lucide-react";
import { SubPageShell } from "@/components/SubPageShell";
import { SentinelGraphCanvas } from "@/components/SentinelGraphCanvas";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  sampleGraph,
  bfsDownstream,
  findDeadNodes,
  testsForBlast,
  estimateTestTime,
  fullSuiteTime,
} from "@/lib/sentinel-graph";

const riskFor = (depth: number) =>
  depth <= 1 ? { label: "HIGH", cls: "bg-destructive/15 text-destructive" } :
  depth === 2 ? { label: "MED", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" } :
  { label: "LOW", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" };

const SentinelGraph = () => {
  const graph = sampleGraph;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deadCodeMode, setDeadCodeMode] = useState(false);
  const [tab, setTab] = useState("overview");
  const [modifiedId, setModifiedId] = useState<string | null>(null);

  const selectedNode = useMemo(
    () => graph.nodes.find((n) => n.id === selectedId) ?? null,
    [graph, selectedId]
  );

  const downstream = useMemo(
    () => (selectedId ? bfsDownstream(graph, selectedId) : []),
    [graph, selectedId]
  );

  const dead = useMemo(() => findDeadNodes(graph), [graph]);

  const blastSet = useMemo(() => {
    if (!modifiedId) return new Set<string>();
    const ids = new Set<string>([modifiedId]);
    for (const h of bfsDownstream(graph, modifiedId)) ids.add(h.id);
    return ids;
  }, [graph, modifiedId]);

  const impactedTests = useMemo(
    () => testsForBlast(graph, blastSet),
    [graph, blastSet]
  );

  const fullMs = useMemo(() => fullSuiteTime(graph), [graph]);
  const selMs = estimateTestTime(impactedTests);
  const savedMs = Math.max(0, fullMs - selMs);
  const savedPct = fullMs ? Math.round((savedMs / fullMs) * 100) : 0;
  const totalTests = graph.nodes.filter((n) => n.kind === "test").length;

  const handleSelect = (id: string | null) => {
    setSelectedId(id);
    if (id) setTab((t) => (t === "overview" ? "impact" : t));
  };

  const copyPlan = () => {
    if (!impactedTests.length) return;
    const cmd = `vitest run ${impactedTests.map((t) => t.path).join(" ")}`;
    navigator.clipboard.writeText(cmd);
    toast.success("Test plan copied");
  };

  return (
    <SubPageShell
      eyebrow="02 · sentinel graph"
      title="Sentinel Graph."
      tagline="What will it touch?"
      description="A live dependency map with dead-code highlighting, ripple impact analysis, and a test orchestrator that runs only the tests your change actually breaks."
      visual={
        <div className="grid h-full w-full place-items-center">
          <div className="aspect-square w-[min(82vmin,720px)]">
            <SentinelGraphCanvas
              graph={graph}
              selectedId={selectedId}
              onSelect={handleSelect}
              deadCodeMode={deadCodeMode}
            />
          </div>
        </div>
      }
      legend={
        <span className="flex flex-wrap items-center gap-3">
          <span className="text-accent">●</span> ts/tsx
          <span className="text-border">·</span>
          <span style={{ color: "hsl(38 70% 55%)" }}>●</span> py
          <span className="text-border">·</span>
          <span style={{ color: "hsl(150 30% 55%)" }}>●</span> css
          <span className="text-border">·</span>
          <FlaskConical className="h-3 w-3 text-accent" /> test
          <span className="text-border">·</span>
          <span className="text-destructive">●</span> dead
        </span>
      }
      panel={
        <div className="rounded-lg border border-border/60 bg-card/80 p-4 shadow-paper backdrop-blur">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="impact">Impact</TabsTrigger>
              <TabsTrigger value="blast">Blast Radius</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="mt-4 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <Stat label="files" value={graph.nodes.filter((n) => n.kind === "file").length} />
                <Stat label="tests" value={totalTests} />
                <Stat label="dead" value={dead.length} tone="destructive" />
              </div>
              <div className="flex items-center justify-between rounded-md border border-border/60 bg-background/50 px-3 py-2">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                    Dead code mode
                  </p>
                  <p className="text-xs text-muted-foreground">Highlight unreachable files.</p>
                </div>
                <Switch checked={deadCodeMode} onCheckedChange={setDeadCodeMode} />
              </div>
              {dead.length > 0 && (
                <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <div className="mb-1 flex items-center gap-2 text-destructive">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="font-mono text-[11px] uppercase tracking-widest">unreachable</span>
                  </div>
                  <ul className="space-y-1 text-xs">
                    {dead.map((d) => (
                      <li key={d.id} className="font-mono text-muted-foreground">{d.path}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Click any node to begin.
              </p>
            </TabsContent>

            {/* Impact */}
            <TabsContent value="impact" className="mt-4 space-y-3">
              {!selectedNode ? (
                <Empty text="Select a node to see its ripple." />
              ) : (
                <>
                  <div>
                    <p className="font-mono text-[11px] uppercase tracking-widest text-accent">selected</p>
                    <p className="font-display text-lg font-semibold">{selectedNode.label}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{selectedNode.path}</p>
                  </div>
                  {downstream.length === 0 ? (
                    <Empty text="No downstream nodes — leaf of the graph." />
                  ) : (
                    <ul className="max-h-[280px] space-y-1.5 overflow-auto pr-1">
                      {downstream.map((h) => {
                        const node = graph.nodes.find((n) => n.id === h.id)!;
                        const risk = riskFor(h.depth);
                        return (
                          <li
                            key={h.id}
                            className="flex items-center justify-between gap-2 rounded-md border border-border/50 bg-background/40 px-2.5 py-1.5"
                          >
                            <div className="min-w-0">
                              <p className="truncate text-sm">{node.label}</p>
                              <p className="truncate font-mono text-[10px] text-muted-foreground">{node.path}</p>
                            </div>
                            <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] ${risk.cls}`}>
                              {risk.label}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <Button size="sm" variant="outline" className="w-full" onClick={() => { setModifiedId(selectedId); setTab("blast"); }}>
                    Mark as modified →
                  </Button>
                </>
              )}
            </TabsContent>

            {/* Blast Radius */}
            <TabsContent value="blast" className="mt-4 space-y-3">
              {!modifiedId ? (
                <Empty text="Select a node, then 'Mark as modified' to compute the blast radius." />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-[11px] uppercase tracking-widest text-accent">modified</p>
                      <p className="font-display text-base font-semibold">
                        {graph.nodes.find((n) => n.id === modifiedId)?.label}
                      </p>
                    </div>
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {blastSet.size} in radius
                    </Badge>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <Stat label="tests" value={`${impactedTests.length}/${totalTests}`} />
                    <Stat label="est ms" value={selMs} />
                    <Stat label="saved" value={`${savedPct}%`} tone="accent" />
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between font-mono text-[10px] text-muted-foreground">
                      <span>selected {selMs}ms</span>
                      <span>full {fullMs}ms</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${fullMs ? (selMs / fullMs) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {impactedTests.length === 0 ? (
                    <Empty text="No tests cover this blast radius." />
                  ) : (
                    <div className="rounded-md border border-border/60">
                      <div className="grid grid-cols-[1fr_auto] gap-2 border-b border-border/60 bg-secondary/40 px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        <span>test</span>
                        <span>est ms</span>
                      </div>
                      <ul className="max-h-[200px] divide-y divide-border/40 overflow-auto">
                        {impactedTests.map((t) => (
                          <li key={t.id} className="grid grid-cols-[1fr_auto] gap-2 px-2.5 py-1.5">
                            <div className="min-w-0">
                              <p className="truncate text-xs">{t.label}</p>
                              <p className="truncate font-mono text-[10px] text-muted-foreground">{t.path}</p>
                            </div>
                            <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
                              {t.avgMs}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={copyPlan} disabled={!impactedTests.length}>
                    <Copy className="h-3.5 w-3.5" /> Copy plan
                  </Button>
                </>
              )}
            </TabsContent>
          </Tabs>
        </div>
      }
    />
  );
};

const Stat = ({ label, value, tone }: { label: string; value: string | number; tone?: "destructive" | "accent" }) => (
  <div className="rounded-md border border-border/60 bg-background/50 px-2 py-2">
    <p className={`font-display text-xl font-semibold tabular-nums ${tone === "destructive" ? "text-destructive" : tone === "accent" ? "text-accent" : ""}`}>
      {value}
    </p>
    <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
  </div>
);

const Empty = ({ text }: { text: string }) => (
  <p className="rounded-md border border-dashed border-border/60 px-3 py-6 text-center text-xs text-muted-foreground">
    {text}
  </p>
);

export default SentinelGraph;
